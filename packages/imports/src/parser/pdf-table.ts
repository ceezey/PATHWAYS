/**
 * Deterministic table reconstruction for text-layer PDF imports.
 *
 * The sandbox worker extracts positioned, horizontal text items only. This module
 * turns them into the same header-plus-rows matrix that spreadsheets produce:
 * rows come from shared baselines, and columns come from the header line's x
 * positions. It never interprets PDF content, so it holds no parser state.
 */

/** [pageNumber, x, y, width, fontSize, text] */
export type PdfTextItem = [number, number, number, number, number, string]

export class PdfTableError extends Error {
  constructor(readonly code: 'PDF_NO_TEXT_LAYER' | 'PDF_TABLE_UNRECOGNIZED') {
    super(code)
    this.name = 'PdfTableError'
  }
}

interface Cell {
  x: number
  end: number
  text: string
}

interface Line {
  page: number
  y: number
  cells: Cell[]
}

// Control characters cannot be stored in JSON text columns and carry no table meaning.
// Tab, line feed and carriage return become ordinary whitespace later.
function withoutControlCharacters(text: string) {
  let result = ''
  for (const character of text) {
    const code = character.charCodeAt(0)
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) continue
    result += character
  }
  return result
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
}

function baselineTolerance(fontSize: number) {
  return Math.max(1, fontSize * 0.35)
}

function joinGap(fontSize: number) {
  // A word space is about 0.25-0.3 of the font size; column gaps are wider.
  return Math.max(1, fontSize * 0.6)
}

function groupLines(items: PdfTextItem[]): Line[] {
  const usable = items
    .filter(
      (item) =>
        Array.isArray(item) &&
        Number.isInteger(item[0]) &&
        finiteNumber(item[1]) &&
        finiteNumber(item[2]) &&
        finiteNumber(item[3]) &&
        finiteNumber(item[4]) &&
        typeof item[5] === 'string',
    )
    .map(([page, x, y, width, fontSize, text]) => ({
      page,
      x,
      y,
      width: Math.max(0, width),
      fontSize: fontSize > 0 ? fontSize : 10,
      text: withoutControlCharacters(text),
    }))
    .filter((item) => item.text.trim().length > 0)
  if (usable.length === 0) throw new PdfTableError('PDF_NO_TEXT_LAYER')

  // Pages top to bottom (PDF y grows upward), then left to right. Ties fall back to
  // the text so equal inputs always produce equal output.
  usable.sort(
    (left, right) =>
      left.page - right.page ||
      right.y - left.y ||
      left.x - right.x ||
      (left.text < right.text ? -1 : left.text > right.text ? 1 : 0),
  )

  const lines: Array<Line & { items: typeof usable }> = []
  for (const item of usable) {
    const current = lines.at(-1)
    if (
      current &&
      current.page === item.page &&
      Math.abs(current.y - item.y) <= baselineTolerance(item.fontSize)
    ) {
      current.items.push(item)
    } else {
      lines.push({ page: item.page, y: item.y, cells: [], items: [item] })
    }
  }

  return lines.map((line) => {
    const ordered = [...line.items].sort(
      (left, right) =>
        left.x - right.x || (left.text < right.text ? -1 : left.text > right.text ? 1 : 0),
    )
    const cells: Cell[] = []
    for (const item of ordered) {
      const previous = cells.at(-1)
      const end = item.x + item.width
      if (previous && item.x - previous.end <= joinGap(item.fontSize)) {
        const spaced =
          item.x - previous.end > item.fontSize * 0.1 &&
          !previous.text.endsWith(' ') &&
          !item.text.startsWith(' ')
        previous.text = `${previous.text}${spaced ? ' ' : ''}${item.text}`
        previous.end = Math.max(previous.end, end)
      } else {
        cells.push({ x: item.x, end, text: item.text })
      }
    }
    return {
      page: line.page,
      y: line.y,
      cells: cells
        .map((cell) => ({ ...cell, text: cell.text.replace(/\s+/g, ' ').trim() }))
        .filter((cell) => cell.text.length > 0),
    }
  })
}

/**
 * Returns a matrix whose first row is the header. Every later row has exactly the
 * header's width, with `null` for empty cells.
 */
export function reconstructPdfTable(items: PdfTextItem[]): (string | null)[][] {
  const lines = groupLines(items)
  const headerIndex = lines.findIndex((line) => line.cells.length >= 2)
  if (headerIndex < 0) throw new PdfTableError('PDF_TABLE_UNRECOGNIZED')
  const header = lines[headerIndex].cells
  const headerTexts = header.map((cell) => cell.text)
  const headerKey = JSON.stringify(headerTexts)
  const starts = header.map((cell) => cell.x)
  const tolerance = Math.max(
    2,
    Math.min(
      ...header.map((cell, index) => {
        const next = header[index + 1]
        return next ? (next.x - cell.end) / 2 : Number.POSITIVE_INFINITY
      }),
    ),
  )

  const rows: (string | null)[][] = []
  for (const line of lines.slice(headerIndex + 1)) {
    const texts = line.cells.map((cell) => cell.text)
    // A header repeated on a later page is layout, not data.
    if (JSON.stringify(texts) === headerKey) continue
    const row: (string | null)[] = headerTexts.map(() => null)
    for (const cell of line.cells) {
      if (cell.x < starts[0] - tolerance) throw new PdfTableError('PDF_TABLE_UNRECOGNIZED')
      let column = 0
      for (let index = starts.length - 1; index >= 0; index -= 1) {
        if (cell.x >= starts[index] - tolerance) {
          column = index
          break
        }
      }
      const existing = row[column]
      row[column] = existing === null ? cell.text : `${existing} ${cell.text}`
    }
    if (row.some((value) => value !== null)) rows.push(row)
  }
  return [headerTexts, ...rows]
}
