import * as XLSX from 'xlsx'

import { isCodeHeaderRow } from './code-header'
import { excelSerialToIsoDate } from './excel-date'

export interface WorkbookParseResult {
  headers: string[]
  rows: Record<string, unknown>[]
  sheetNames: string[]
}

// Empty headers are named by position as the server parser names them, and repeated headers
// gain _1, _2 suffixes, so row keys never collide.
const rowKeys = (headerCells: unknown[]) => {
  const seen = new Map<string, number>()
  const used = new Set<string>()
  return headerCells.map((value, index) => {
    const base = String(value ?? '').trim() || `Column ${index + 1}`
    let key = base
    let counter = seen.get(base) ?? 0
    if (used.has(key)) {
      do {
        counter += 1
        key = `${base}_${counter}`
      } while (used.has(key))
    }
    seen.set(base, counter)
    used.add(key)
    return key
  })
}

export const parseWorkbook = (input: ArrayBuffer): WorkbookParseResult => {
  const workbook = XLSX.read(input, {
    type: 'array',
    cellNF: true,
  })

  const firstSheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[firstSheetName]
  // Date-formatted numeric cells become ISO strings, matching the server parser; the date
  // format is dropped from every cell, text included, so sheet_to_json does not build Date objects.
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904)
  for (const [key, cell] of Object.entries(sheet ?? {})) {
    if (key.startsWith('!') || !cell.z || !XLSX.SSF.is_date(cell.z)) continue
    cell.z = undefined
    if (cell.t !== 'n') continue
    const iso = excelSerialToIsoDate(cell.v as number, date1904)
    if (iso !== null) Object.assign(cell, { t: 's', v: iso })
  }
  // Read the sheet once as a grid, then derive headers and keyed rows from it.
  const grid = sheet
    ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { defval: '', header: 1, blankrows: false })
    : []
  // Trailing columns with a blank header and no values are dropped, as the server parser drops them.
  const blank = (value: unknown) => String(value ?? '').trim() === ''
  let width = grid.reduce((widest, cells) => Math.max(widest, cells.length), 0)
  while (width > 0 && grid.every((cells) => blank(cells[width - 1]))) width -= 1
  // A code row above a label row: the label names the column (the code where the label is blank) and data starts on row 3.
  const coded = grid.length > 1 && isCodeHeaderRow(grid[0], grid[1])
  const dataRows = grid.slice(coded ? 2 : 1)
  const firstRow = coded
    ? grid[0].map((code, index) => (blank(grid[1][index]) ? code : grid[1][index]))
    : (grid[0] ?? [])
  const headers = rowKeys(Array.from({ length: width }, (_, index) => firstRow[index]))
  const rows = dataRows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])),
  )

  return {
    headers,
    rows,
    sheetNames: workbook.SheetNames,
  }
}

/** The worksheet names of a workbook, read without parsing any cells. */
export const workbookSheetNames = (input: ArrayBuffer): string[] =>
  XLSX.read(input, { type: 'array', bookSheets: true }).SheetNames
