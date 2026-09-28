/**
 * Deterministic table reconstruction for text-layer PDF imports.
 *
 * The sandbox worker extracts positioned, horizontal text items only. This function
 * turns them into the same header-plus-rows matrix that spreadsheets produce: rows
 * come from shared baselines, and columns come from the header line's x positions.
 * It never interprets PDF content, so it holds no parser state.
 *
 * It runs INSIDE the sandbox parser worker, under the parse timeout and worker memory
 * limits: `secure.ts` embeds `reconstructPdfTable.toString()` into the worker source.
 * The function must therefore stay self-contained. It may not reference imports,
 * module-level values or other top-level functions, only its arguments and globals.
 * Every allocation is bounded by the limits before it happens.
 */

/** [pageNumber, x, y, width, fontSize, text] */
export type PdfTextItem = [number, number, number, number, number, string]

export interface PdfTableLimits {
  maxPdfTextItems: number
  maxSourceColumns: number
  maxRows: number
  maxCells: number
}

export type PdfTableErrorCode =
  | 'PDF_NO_TEXT_LAYER'
  | 'PDF_TABLE_UNRECOGNIZED'
  | 'PDF_TEXT_LIMIT'
  | 'COLUMN_LIMIT'
  | 'ROW_LIMIT'
  | 'CELL_LIMIT'

/** Errors carry a stable `code`; the message is the code itself, never PDF text. */
export function pdfTableErrorCode(error: unknown): PdfTableErrorCode | null {
  const code =
    error && typeof error === 'object' && 'code' in error ? (error as { code: unknown }).code : null
  return typeof code === 'string' &&
    [
      'PDF_NO_TEXT_LAYER',
      'PDF_TABLE_UNRECOGNIZED',
      'PDF_TEXT_LIMIT',
      'COLUMN_LIMIT',
      'ROW_LIMIT',
      'CELL_LIMIT',
    ].includes(code)
    ? (code as PdfTableErrorCode)
    : null
}

/**
 * Returns a matrix whose first row is the header. Every later row has exactly the
 * header's width, with `null` for empty cells.
 */
export function reconstructPdfTable(
  items: PdfTextItem[],
  limits: PdfTableLimits,
): (string | null)[][] {
  const fail = (code: string): never => {
    const error = new Error(code) as Error & { code: string }
    error.code = code
    throw error
  }
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  const byText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0)
  // Control characters cannot be stored in JSON text columns and carry no table meaning.
  // Tab, line feed and carriage return become ordinary whitespace later.
  const clean = (text: string) => {
    let result = ''
    for (const character of text) {
      const code = character.charCodeAt(0)
      if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) continue
      result += character
    }
    return result
  }

  if (!Array.isArray(items)) fail('PDF_TABLE_UNRECOGNIZED')
  if (items.length > limits.maxPdfTextItems) fail('PDF_TEXT_LIMIT')

  const usable: Array<{
    page: number
    x: number
    y: number
    width: number
    fontSize: number
    text: string
  }> = []
  for (const item of items) {
    if (
      !Array.isArray(item) ||
      !Number.isInteger(item[0]) ||
      !finite(item[1]) ||
      !finite(item[2]) ||
      !finite(item[3]) ||
      !finite(item[4]) ||
      typeof item[5] !== 'string'
    )
      continue
    const text = clean(item[5])
    if (text.trim().length === 0) continue
    usable.push({
      page: item[0],
      x: item[1],
      y: item[2],
      width: Math.max(0, item[3]),
      fontSize: item[4] > 0 ? item[4] : 10,
      text,
    })
  }
  if (usable.length === 0) fail('PDF_NO_TEXT_LAYER')

  // Pages top to bottom (PDF y grows upward), then left to right. Ties fall back to
  // the text so equal inputs always produce equal output.
  usable.sort(
    (left, right) =>
      left.page - right.page ||
      right.y - left.y ||
      left.x - right.x ||
      byText(left.text, right.text),
  )

  // Group items sharing a baseline, then merge items closer than a column gap into
  // one cell. Lines are built one at a time so no per-line state outlives its use.
  let cursor = 0
  const nextLine = () => {
    if (cursor >= usable.length) return null
    const first = usable[cursor]
    const members = [first]
    cursor += 1
    while (
      cursor < usable.length &&
      usable[cursor].page === first.page &&
      Math.abs(first.y - usable[cursor].y) <= Math.max(1, usable[cursor].fontSize * 0.35)
    ) {
      members.push(usable[cursor])
      cursor += 1
    }
    members.sort((left, right) => left.x - right.x || byText(left.text, right.text))
    const cells: Array<{ x: number; end: number; text: string }> = []
    for (const member of members) {
      const previous = cells.length ? cells[cells.length - 1] : null
      const end = member.x + member.width
      // A word space is about 0.25-0.3 of the font size; column gaps are wider.
      if (previous && member.x - previous.end <= Math.max(1, member.fontSize * 0.6)) {
        const spaced =
          member.x - previous.end > member.fontSize * 0.1 &&
          !previous.text.endsWith(' ') &&
          !member.text.startsWith(' ')
        previous.text = `${previous.text}${spaced ? ' ' : ''}${member.text}`
        previous.end = Math.max(previous.end, end)
      } else {
        cells.push({ x: member.x, end, text: member.text })
      }
    }
    const result: Array<{ x: number; end: number; text: string }> = []
    for (const cell of cells) {
      const text = cell.text.replace(/\s+/g, ' ').trim()
      if (text.length > 0) result.push({ x: cell.x, end: cell.end, text })
    }
    return result
  }

  // The header is the first line with at least two separated cells; lines above it
  // (titles, notes) are ignored.
  let header: Array<{ x: number; end: number; text: string }> | null = null
  for (let line = nextLine(); line; line = nextLine()) {
    if (line.length >= 2) {
      header = line
      break
    }
  }
  if (!header) return fail('PDF_TABLE_UNRECOGNIZED')
  const width = header.length
  // Reject before any header-width allocation.
  if (width > limits.maxSourceColumns) fail('COLUMN_LIMIT')

  const headerTexts: string[] = []
  const starts: number[] = []
  let tolerance = Number.POSITIVE_INFINITY
  for (let index = 0; index < width; index += 1) {
    headerTexts.push(header[index].text)
    starts.push(header[index].x)
    if (index + 1 < width) {
      tolerance = Math.min(tolerance, (header[index + 1].x - header[index].end) / 2)
    }
  }
  tolerance = Math.max(2, tolerance)

  const rows: (string | null)[][] = []
  for (let line = nextLine(); line; line = nextLine()) {
    // A header repeated on a later page is layout, not data.
    if (line.length === width && line.every((cell, index) => cell.text === headerTexts[index]))
      continue
    if (line[0].x < starts[0] - tolerance) fail('PDF_TABLE_UNRECOGNIZED')
    if (rows.length + 1 > limits.maxRows) fail('ROW_LIMIT')
    if ((rows.length + 1) * width > limits.maxCells) fail('CELL_LIMIT')
    const row: (string | null)[] = new Array(width).fill(null)
    for (const cell of line) {
      // Last header start at or left of the cell (with tolerance): binary search.
      let low = 0
      let high = width - 1
      while (low < high) {
        const middle = (low + high + 1) >> 1
        if (cell.x >= starts[middle] - tolerance) low = middle
        else high = middle - 1
      }
      const existing = row[low]
      row[low] = existing === null ? cell.text : `${existing} ${cell.text}`
    }
    rows.push(row)
  }
  return [headerTexts, ...rows]
}
