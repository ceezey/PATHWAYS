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
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    defval: '',
    header: 1,
  })
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  })

  return {
    headers:
      rows.length > 0 ? Object.keys(rows[0]) : (grid[0] ?? []).map((value) => String(value).trim()),
    rows,
    sheetNames: workbook.SheetNames,
  }
}
