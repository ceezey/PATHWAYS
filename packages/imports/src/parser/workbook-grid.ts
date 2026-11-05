import type { MatrixMerge } from './header-row'

export interface WorkbookGrid {
  matrix: unknown[][]
  sheetNames: string[]
  formulaGap?: string
  links: boolean
  macros: boolean
  // The 1-based sheet row of matrix[0].
  firstRowNumber: number
  merges: MatrixMerge[]
  // The shown text of each date cell converted to ISO, keyed "<matrixRow>:<matrixColumn>".
  dateText: Record<string, string>
}

/**
 * Reads one worksheet into a matrix, the same way in the parser worker and the browser.
 *
 * It runs INSIDE the sandbox parser worker: `secure.ts` embeds `workbookGrid.toString()`
 * into the worker source, so it must stay self-contained (no imports, no module-level
 * values, no helpers, no TypeScript-only runtime constructs).
 */
export function workbookGrid(
  XLSX: typeof import('xlsx'),
  input: unknown,
  readType: 'buffer' | 'array',
  sheetName: string | null,
  toIsoDate: (serial: number, date1904: boolean) => string | null,
  // The server worker discards the shown date text, so only the browser check asks for it.
  wantDateText: boolean,
  maxCells: number,
): WorkbookGrid {
  const workbook = XLSX.read(input, {
    type: readType,
    cellDates: false,
    cellFormula: true,
    cellHTML: false,
    cellStyles: false,
    cellNF: true,
    // Stubs keep a formula whose file saved no value, so the gap check below can see it.
    sheetStubs: true,
    bookVBA: true,
    WTF: false,
  })
  let links = false
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    for (const key of Object.keys(sheet || {})) {
      if (key.startsWith('!')) continue
      const cell = sheet[key]
      if (cell?.l) links = true
    }
  }
  const first =
    sheetName === null
      ? workbook.SheetNames[0]
      : workbook.SheetNames.find((name) => name === sheetName)
  if (sheetName !== null && first === undefined) throw { code: 'WORKBOOK_SHEET_MISSING' }
  // A formula is never evaluated: its saved value is imported, and a formula without one refuses the file.
  // shortcut: a t="b" formula saved with no value reads as false; no major spreadsheet writer emits it, add a sheet XML pre-scan if one does.
  let formulaGap: string | undefined
  for (const key of Object.keys((first && workbook.Sheets[first]) || {})) {
    if (key.startsWith('!')) continue
    const cell = workbook.Sheets[first as string][key]
    if (
      cell &&
      typeof cell.f === 'string' &&
      (cell.t === 'z' || cell.t === 'e' || cell.v === undefined)
    ) {
      formulaGap = key
      break
    }
  }
  // Date-formatted numeric cells become ISO strings; out-of-range serials stay numeric.
  // The date format is dropped from every cell, text included, so sheet_to_json does not build Date objects.
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904)
  const firstSheet = first ? workbook.Sheets[first] : null
  // sheet_to_json starts at the range's first row and column and keeps blank rows, so a matrix position is a range offset.
  const range = firstSheet?.['!ref'] ? XLSX.utils.decode_range(firstSheet['!ref']) : null
  const startRow = range ? range.s.r : 0
  const startColumn = range ? range.s.c : 0
  const dateText: Record<string, string> = {}
  let lastRow = -1
  let lastColumn = -1
  for (const key of Object.keys(firstSheet || {})) {
    if (key.startsWith('!')) continue
    const cell = (firstSheet as import('xlsx').WorkSheet)[key]
    if (cell && (cell.t === 's' || cell.t === 'n' || cell.t === 'b')) {
      const at = XLSX.utils.decode_cell(key)
      lastRow = Math.max(lastRow, at.r)
      lastColumn = Math.max(lastColumn, at.c)
    }
    if (!cell?.z || !XLSX.SSF.is_date(cell.z)) continue
    // biome-ignore lint/performance/noDelete: the format must be absent, not undefined, as before.
    delete cell.z
    if (cell.t !== 'n') continue
    const iso = toIsoDate(cell.v, date1904)
    if (iso !== null) {
      cell.t = 's'
      cell.v = iso
      if (wantDateText && typeof cell.w === 'string') {
        const at = XLSX.utils.decode_cell(key)
        dateText[`${at.r - startRow}:${at.c - startColumn}`] = cell.w
      }
    }
  }
  // The range ends at the last cell holding a value, so formatted empty rows and columns build no matrix.
  const valued =
    range && lastRow >= startRow && lastColumn >= startColumn
      ? {
          s: range.s,
          e: { r: Math.min(range.e.r, lastRow), c: Math.min(range.e.c, lastColumn) },
        }
      : null
  // A matrix taller than the cell limit holds more cells than any import may, so it is refused unbuilt.
  if (valued && valued.e.r - startRow + 1 > maxCells) throw { code: 'ROW_LIMIT' }
  const matrix: unknown[][] =
    firstSheet && valued
      ? XLSX.utils.sheet_to_json(firstSheet, {
          header: 1,
          defval: null,
          blankrows: true,
          raw: true,
          range: valued,
        })
      : []
  const merges = (firstSheet?.['!merges'] || []).map((merge) => ({
    firstRow: merge.s.r - startRow,
    lastRow: merge.e.r - startRow,
    firstColumn: merge.s.c - startColumn,
    lastColumn: merge.e.c - startColumn,
  }))
  return {
    matrix,
    sheetNames: workbook.SheetNames,
    formulaGap,
    links,
    macros: Boolean(workbook.vbaraw),
    firstRowNumber: startRow + 1,
    merges,
    dateText,
  }
}
