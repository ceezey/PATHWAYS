import * as XLSX from 'xlsx'

export interface WorkbookParseResult {
  headers: string[]
  rows: Record<string, unknown>[]
  sheetNames: string[]
}

export const parseWorkbook = (input: ArrayBuffer): WorkbookParseResult => {
  const workbook = XLSX.read(input, {
    type: 'array',
  })

  const firstSheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  })

  return {
    headers: rows.length > 0 ? Object.keys(rows[0]) : [],
    rows,
    sheetNames: workbook.SheetNames,
  }
}
