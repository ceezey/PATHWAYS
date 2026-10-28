import Papa from 'papaparse'
import * as XLSX from 'xlsx'

import { IMPORT_ENGINEERING_LIMITS } from '../limits'
import { excelSerialToIsoDate } from '../parser/excel-date'
import { ImportParseError, type ImportSourceColumn, normalizeMatrix } from '../parser/matrix'
import { workbookGrid } from '../parser/workbook-grid'
import { inspectXlsxContainer } from '../parser/xlsx-container'

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
    // The server refuses a CSV that is not UTF-8 or holds a zero byte, so the check leaves it to the server.
    if (new Uint8Array(input).includes(0)) {
      throw new ImportParseError('CSV_BINARY_CONTENT', 'The CSV contains binary content.')
    }
    // Options match the parser worker in parser/secure.ts.
    const parsed = Papa.parse<unknown[]>(new TextDecoder('utf-8', { fatal: true }).decode(input), {
      header: false,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
    })
    if (parsed.errors.some((error) => error.code !== 'UndetectableDelimiter')) {
      throw new ImportParseError('CSV_PARSE_FAILED', 'The CSV could not be read.')
    }
    matrix = parsed.data
  } else {
    // The server's container limits run before the workbook is unzipped, so a refused container is never read.
    if (fileType === 'XLSX') inspectXlsxContainer(new Uint8Array(input))
    const grid = workbookGrid(XLSX, input, 'array', sheetName, excelSerialToIsoDate, true)
    // The server refuses a workbook with macros or links, so the check leaves it to the server.
    if (grid.links || grid.macros) {
      throw new ImportParseError(
        'WORKBOOK_ACTIVE_CONTENT',
        'Workbook macros and links are forbidden.',
      )
    }
    // The server's sheet rules, in its order and with its codes.
    if (grid.sheetNames.length > IMPORT_ENGINEERING_LIMITS.maxWorkbookSheets) {
      throw new ImportParseError('WORKBOOK_SHEET_LIMIT', 'The workbook has too many worksheets.')
    }
    if (sheetName === null && grid.sheetNames.length !== 1) {
      throw new ImportParseError(
        'WORKBOOK_SHEET_AMBIGUOUS',
        `This workbook has ${grid.sheetNames.length} worksheets. Choose the sheet to import, then upload again.`,
      )
    }
    ;({ matrix, formulaGap, dateText } = grid)
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
