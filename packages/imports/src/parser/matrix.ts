import { importHeaderLabel } from '../header-label'
import { IMPORT_ENGINEERING_LIMITS } from '../limits'
import { isCodeHeaderRow } from './code-header'

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
const formulaText = /^[=+@]|^-(?:[=+@A-Za-z])/

export function reject(code: string, message: string): never {
  throw new ImportParseError(code, message)
}

function sourceColumnKey(columnIndex: number) {
  return `column_${String(columnIndex).padStart(4, '0')}`
}

export function normalizeMatrix(matrix: unknown[][]): {
  rows: ParsedImportRow[]
  sourceColumns: ImportSourceColumn[]
} {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    reject('FILE_EMPTY', 'The file does not contain a header row.')
  }
  const blank = (value: unknown) =>
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  const codeRow = Array.isArray(matrix[0]) ? matrix[0] : []
  // A code row above a label row: the label names the column, the code is kept as its source code.
  const coded =
    Array.isArray(matrix[0]) && Array.isArray(matrix[1]) && isCodeHeaderRow(matrix[0], matrix[1])
  const headerRows = coded ? 2 : 1
  const firstDataRow = headerRows + 1
  const labelRow = coded && Array.isArray(matrix[1]) ? matrix[1] : []
  const firstRow = coded
    ? codeRow.map((code, index) => (blank(labelRow[index]) ? code : labelRow[index]))
    : codeRow
  // Trailing columns with a blank header and no values are sheet formatting, not data.
  let width = matrix.reduce<number>(
    (widest, row) => Math.max(widest, Array.isArray(row) ? row.length : 0),
    0,
  )
  while (
    width > 0 &&
    blank(firstRow[width - 1]) &&
    matrix.every((row) => !Array.isArray(row) || blank(row[width - 1]))
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
  const sourceRows = matrix
    .slice(headerRows)
    .map((row) => (Array.isArray(row) ? row.slice(0, width) : row))
  if (sourceRows.length > IMPORT_ENGINEERING_LIMITS.maxRows) {
    reject('ROW_LIMIT', 'The file has too many rows.')
  }
  if (sourceRows.length * headers.length > IMPORT_ENGINEERING_LIMITS.maxCells) {
    reject('CELL_LIMIT', 'The file has too many cells.')
  }
  const rows: ParsedImportRow[] = sourceRows.map((source, rowIndex) => {
    if (!Array.isArray(source) || source.length > headers.length) {
      reject(
        'ROW_WIDTH_INVALID',
        `Source row ${rowIndex + firstDataRow} has an unexpected column count.`,
      )
    }
    const values = Object.create(null) as Record<string, CellValue>
    sourceColumns.forEach((column, columnOffset) => {
      const value = source[columnOffset] ?? null
      if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) {
        reject(
          'CELL_TYPE_INVALID',
          `Source row ${rowIndex + firstDataRow} contains an unsupported cell.`,
        )
      }
      if (typeof value === 'string') {
        if (value.length > IMPORT_ENGINEERING_LIMITS.maxCellCharacters) {
          reject(
            'CELL_LENGTH_LIMIT',
            `Source row ${rowIndex + firstDataRow} contains an oversized cell.`,
          )
        }
        if (formulaText.test(value.trimStart())) {
          reject(
            'CELL_FORMULA_UNSAFE',
            `Source row ${rowIndex + firstDataRow} contains formula-like text.`,
          )
        }
      }
      values[column.key] = value as CellValue
    })
    return { sourceRowNumber: rowIndex + firstDataRow, values }
  })
  return { rows, sourceColumns }
}
