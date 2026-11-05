import { neutralizeCell } from '@pathways/shared'
import * as XLSX from 'xlsx'

/** Browser-safe workbook bytes used by isolated legacy export fixtures. */
export const toWorkbookBytes = (rows: string[][], format: 'xlsx' | 'xls'): Uint8Array => {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet(rows.map((row) => row.map(neutralizeCell))),
    'PATHWAYS',
  )
  return new Uint8Array(
    XLSX.write(book, { type: 'array', bookType: format === 'xls' ? 'biff8' : 'xlsx' }),
  )
}

/** Quotes string headers and values; numbers, dates and other typed cells are left typed. */
const safeSheet = (rows: Record<string, unknown>[]) =>
  XLSX.utils.json_to_sheet(
    rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          neutralizeCell(key),
          typeof value === 'string' ? neutralizeCell(value) : value,
        ]),
      ),
    ),
  )

export const toCsv = (rows: Record<string, unknown>[]): string =>
  XLSX.utils.sheet_to_csv(safeSheet(rows))

export const toXlsxBuffer = (rows: Record<string, unknown>[]): Buffer => {
  const workbook = XLSX.utils.book_new()
  const worksheet = safeSheet(rows)
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Export')

  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  })
}

export const formatPmerlRows = (rows: Record<string, unknown>[]) =>
  rows.map((row) => ({
    reporting_period: row.reporting_period ?? '',
    indicator_code: row.indicator_code ?? '',
    indicator_value: row.indicator_value ?? '',
    disaggregation: row.disaggregation ?? '',
  }))
