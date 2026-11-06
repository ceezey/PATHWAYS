import { importHeaderLabel } from '../header-label'
import { IMPORT_ENGINEERING_LIMITS } from '../limits'
import { isCodeHeaderRow } from './code-header'
import { type MatrixMerge, findHeaderRow } from './header-row'

type CellValue = string | number | boolean | null

export interface ParsedImportRow {
  sourceRowNumber: number
  values: Record<string, CellValue>
}

export interface ImportSourceColumn {
  key: string
  header: string
  columnIndex: number
  // The field code printed in a coded header row, when the file has one.
  sourceCode?: string
}

export class ImportParseError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ImportParseError'
  }
}

const unsafeHeader = new Set(['__proto__', 'prototype', 'constructor'])

export function reject(code: string, message: string): never {
  throw new ImportParseError(code, message)
}

export function sourceColumnKey(columnIndex: number) {
  return `column_${String(columnIndex).padStart(4, '0')}`
}

export interface FilledMerge {
  columnIndex: number
  firstRowNumber: number
  lastRowNumber: number
}

export function normalizeMatrix(
  matrix: unknown[][],
  options: { firstRowNumber?: number; merges?: readonly MatrixMerge[] } = {},
): {
  rows: ParsedImportRow[]
  sourceColumns: ImportSourceColumn[]
  headerRowNumber: number
  filledMerges: FilledMerge[]
} {
  const { firstRowNumber = 1, merges = [] } = options
  const blank = (value: unknown) =>
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  const blankRow = (row: unknown) => Array.isArray(row) && row.every(blank)
  if (!Array.isArray(matrix) || matrix.every(blankRow)) {
    reject('FILE_EMPTY', 'The file does not contain a header row.')
  }
  // Every merge costs work, so more merges than the cell limit refuse the file before any is read.
  if (merges.length > IMPORT_ENGINEERING_LIMITS.maxCells) {
    reject('CELL_LIMIT', 'The file has too many cells.')
  }
  const headerIndex = findHeaderRow(matrix, merges)
  const header = matrix[headerIndex]
  const below = matrix[headerIndex + 1]
  const codeRow = Array.isArray(header) ? header : []
  // A code row above a label row: the label names the column, the code is kept as its source code.
  const coded = Array.isArray(header) && Array.isArray(below) && isCodeHeaderRow(header, below)
  const dataStart = headerIndex + (coded ? 2 : 1)
  const labelRow = coded && Array.isArray(below) ? below : []
  const firstRow = coded
    ? codeRow.map((code, index) => (blank(labelRow[index]) ? code : labelRow[index]))
    : codeRow
  // Blank rows are not imported, and filling a merge never makes a blank row hold a value.
  const blankRows = matrix.map(blankRow)
  const dataRows: number[] = []
  for (let index = dataStart; index < matrix.length; index += 1) {
    if (!blankRows[index]) dataRows.push(index)
  }
  if (dataRows.length > IMPORT_ENGINEERING_LIMITS.maxRows) {
    reject('ROW_LIMIT', 'The file has too many rows.')
  }
  // A merged data cell is copied down its first column; merges at or above the header are never copied.
  const grid = matrix.slice()
  const filledMerges: FilledMerge[] = []
  const covered = new Set<number>()
  let spans = 0
  for (const merge of merges) {
    const top = grid[merge.firstRow]
    const value = Array.isArray(top) ? top[merge.firstColumn] : null
    const lastRow = Math.min(merge.lastRow, grid.length - 1)
    if (merge.firstRow < dataStart || merge.firstColumn < 0 || lastRow <= merge.firstRow) continue
    if (blank(value)) continue
    // The rows every merge spans are counted before they are read, so repeated merges cannot multiply the work.
    spans += lastRow - merge.firstRow + 1
    if (spans > IMPORT_ENGINEERING_LIMITS.maxCells) {
      reject('CELL_LIMIT', 'The file has too many cells.')
    }
    // A merge overlapping one already filled is dropped, as a spreadsheet never saves overlapping merges.
    const cell = (index: number) => index * 65_536 + merge.firstColumn
    let overlaps = false
    for (let index = merge.firstRow; index <= lastRow && !overlaps; index += 1) {
      overlaps = covered.has(cell(index))
    }
    if (overlaps) continue
    // Rows holding the value, the top-left first; a row blank in the file is never filled, so it stays unimported.
    const holding = [merge.firstRow]
    covered.add(cell(merge.firstRow))
    for (let index = merge.firstRow + 1; index <= lastRow; index += 1) {
      const cells = grid[index]
      covered.add(cell(index))
      if (!Array.isArray(cells) || blankRows[index]) continue
      if (cells === matrix[index]) grid[index] = cells.slice()
      grid[index][merge.firstColumn] = value
      holding.push(index)
    }
    // Each unbroken run of filled rows is listed on its own, so a note never names a blank row.
    let start = 0
    for (let at = 1; at <= holding.length; at += 1) {
      if (at < holding.length && holding[at] === holding[at - 1] + 1) continue
      if (at - start > 1 || holding[start] !== merge.firstRow) {
        filledMerges.push({
          columnIndex: merge.firstColumn + 1,
          firstRowNumber: firstRowNumber + holding[start],
          lastRowNumber: firstRowNumber + holding[at - 1],
        })
      }
      start = at
    }
  }
  const table = grid.slice(headerIndex)
  // Trailing columns with a blank header and no values are sheet formatting, not data.
  let width = table.reduce<number>(
    (widest, row) => Math.max(widest, Array.isArray(row) ? row.length : 0),
    0,
  )
  while (
    width > 0 &&
    blank(firstRow[width - 1]) &&
    table.every((row) => !Array.isArray(row) || blank(row[width - 1]))
  ) {
    width -= 1
  }
  if (width === 0) reject('HEADERS_MISSING', 'The file does not contain headers.')
  const headerCells = Array.from({ length: width }, (_, index) => firstRow[index] ?? null)
  if (headerCells.length > IMPORT_ENGINEERING_LIMITS.maxSourceColumns) {
    reject('COLUMN_LIMIT', 'The file has too many columns.')
  }
  const headers = headerCells.map((value, index) => {
    if (!blank(value) && !['string', 'number', 'boolean'].includes(typeof value)) {
      reject('HEADER_INVALID', `Header ${index + 1} is invalid.`)
    }
    // A blank header over real values is named by its position, as a spreadsheet shows it.
    const header = importHeaderLabel(blank(value) ? '' : String(value)) || `Column ${index + 1}`
    const normalized = header.toLowerCase()
    if (unsafeHeader.has(normalized)) {
      reject('HEADER_UNSAFE', `Header ${index + 1} uses a prohibited key.`)
    }
    return header
  })
  const sourceColumns: ImportSourceColumn[] = headers.map((header, index) => ({
    key: sourceColumnKey(index + 1),
    header,
    columnIndex: index + 1,
    ...(coded && !blank(codeRow[index]) ? { sourceCode: String(codeRow[index]).trim() } : {}),
  }))
  if (dataRows.length * headers.length > IMPORT_ENGINEERING_LIMITS.maxCells) {
    reject('CELL_LIMIT', 'The file has too many cells.')
  }
  // Every row keeps its number in the file.
  const rows: ParsedImportRow[] = dataRows.map((index) => {
    const row = grid[index]
    const sourceRowNumber = firstRowNumber + index
    const source = Array.isArray(row) ? row.slice(0, width) : row
    if (!Array.isArray(source) || source.length > headers.length) {
      reject('ROW_WIDTH_INVALID', `Source row ${sourceRowNumber} has an unexpected column count.`)
    }
    const values = Object.create(null) as Record<string, CellValue>
    sourceColumns.forEach((column, columnOffset) => {
      const value = source[columnOffset] ?? null
      if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) {
        reject('CELL_TYPE_INVALID', `Source row ${sourceRowNumber} contains an unsupported cell.`)
      }
      if (typeof value === 'string') {
        if (value.length > IMPORT_ENGINEERING_LIMITS.maxCellCharacters) {
          reject('CELL_LENGTH_LIMIT', `Source row ${sourceRowNumber} contains an oversized cell.`)
        }
      }
      values[column.key] = value as CellValue
    })
    return { sourceRowNumber, values }
  })
  return { rows, sourceColumns, headerRowNumber: firstRowNumber + headerIndex, filledMerges }
}
