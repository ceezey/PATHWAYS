import Papa from 'papaparse'
import * as XLSX from 'xlsx'

import { excelSerialToIsoDate } from '../parser/excel-date'
import { ImportParseError, type ImportSourceColumn, normalizeMatrix } from '../parser/matrix'
import { workbookGrid } from '../parser/workbook-grid'

type CellValue = string | number | boolean | null

export interface ReadImportFile {
  sourceColumns: ImportSourceColumn[]
  // Each row keyed column_0001..., exactly the server's rawData.
  rows: Array<Record<string, CellValue>>
  // The server's sourceRowNumber of each row.
  rowNumbers: number[]
  formulaGap?: string
  // The date cell's text as the file shows it, else null.
  shown: (rowIndex: number, key: string) => string | null
}

/** Reads an import file in the browser exactly as the server stages it. */
export function readImportFile(
  input: ArrayBuffer,
  fileType: 'XLSX' | 'XLS' | 'CSV',
  sheetName: string | null,
): ReadImportFile {
  let matrix: unknown[][]
  let formulaGap: string | undefined
  let dateText: Record<string, string> = {}
  if (fileType === 'CSV') {
    // Options match the parser worker in parser/secure.ts.
    const parsed = Papa.parse<unknown[]>(new TextDecoder('utf-8').decode(input), {
      header: false,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
    })
    if (parsed.errors.some((error) => error.code !== 'UndetectableDelimiter')) {
      throw new ImportParseError('CSV_PARSE_FAILED', 'The CSV could not be read.')
    }
    matrix = parsed.data
  } else {
    ;({ matrix, formulaGap, dateText } = workbookGrid(
      XLSX,
      input,
      'array',
      sheetName,
      excelSerialToIsoDate,
      true,
    ))
  }
  const { rows, sourceColumns } = normalizeMatrix(matrix)
  // The header rows above the first data row, as normalizeMatrix counted them.
  const headerRows = (rows[0]?.sourceRowNumber ?? 1) - 1
  return {
    sourceColumns,
    rows: rows.map((row) => row.values),
    rowNumbers: rows.map((row) => row.sourceRowNumber),
    formulaGap,
    shown: (rowIndex, key) =>
      dateText[`${headerRows + rowIndex}:${Number(key.slice(7)) - 1}`] ?? null,
  }
}
