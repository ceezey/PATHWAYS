import type { ImportSummary } from '@pathways/shared'

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
