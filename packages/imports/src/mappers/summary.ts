export interface ImportSummary {
  fileName: string
  fileType: 'csv' | 'xlsx' | 'xls'
  totalRows: number
  totalColumns: number
  headers: string[]
  warnings: string[]
}

export const createFileSummary = (
  fileName: string,
  fileType: ImportSummary['fileType'],
  headers: string[],
  rows: Record<string, unknown>[],
  warnings: string[] = [],
): ImportSummary => ({
  fileName,
  fileType,
  headers,
  totalRows: rows.length,
  totalColumns: headers.length,
  warnings,
})
