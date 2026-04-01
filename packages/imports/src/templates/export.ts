import * as XLSX from 'xlsx'

export const toCsv = (rows: Record<string, unknown>[]): string =>
  XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows))

export const toXlsxBuffer = (rows: Record<string, unknown>[]): Buffer => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet(rows)
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
