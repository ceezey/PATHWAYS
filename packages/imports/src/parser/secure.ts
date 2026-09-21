import { Worker } from 'node:worker_threads'

import { IMPORT_ENGINEERING_LIMITS, type SupportedImportFileType } from '../limits'

type CellValue = string | number | boolean | null

interface WorkerResult {
  matrix?: unknown[][]
  sheetNames?: string[]
  formulas?: boolean
  links?: boolean
  macros?: boolean
  error?: string
}

export interface ParsedImportRow {
  sourceRowNumber: number
  values: Record<string, CellValue>
}

export interface ImportSourceColumn {
  key: string
  header: string
  columnIndex: number
}

export interface SecureImportParseResult {
  sourceColumns: ImportSourceColumn[]
  rows: ParsedImportRow[]
  sheetNames: string[]
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

const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
try {
  const input = Buffer.from(workerData.input);
  if (workerData.fileType === 'CSV') {
    const Papa = require(workerData.papaPath);
    const parsed = Papa.parse(input.toString('utf8'), {
      header: false,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      transform: value => value,
    });
    const fatalErrors = parsed.errors.filter(error => error.code !== 'UndetectableDelimiter');
    if (fatalErrors.length) {
      parentPort.postMessage({ error: 'CSV_PARSE_FAILED' });
    } else {
      parentPort.postMessage({ matrix: parsed.data, sheetNames: [] });
    }
  } else {
    const XLSX = require(workerData.xlsxPath);
    const workbook = XLSX.read(input, {
      type: 'buffer',
      cellDates: false,
      cellFormula: true,
      cellHTML: false,
      cellStyles: false,
      cellNF: false,
      bookVBA: true,
      WTF: false,
    });
    let formulas = false;
    let links = false;
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      for (const key of Object.keys(sheet || {})) {
        if (key.startsWith('!')) continue;
        const cell = sheet[key];
        if (cell && typeof cell.f === 'string') formulas = true;
        if (cell && cell.l) links = true;
      }
    }
    const first = workbook.SheetNames[0];
    const matrix = first
      ? XLSX.utils.sheet_to_json(workbook.Sheets[first], {
          header: 1,
          defval: null,
          blankrows: false,
          raw: true,
        })
      : [];
    parentPort.postMessage({
      matrix,
      sheetNames: workbook.SheetNames,
      formulas,
      links,
      macros: Boolean(workbook.vbaraw),
    });
  }
} catch {
  parentPort.postMessage({ error: 'PARSER_REJECTED_INPUT' });
}
`

const unsafeHeader = new Set(['__proto__', 'prototype', 'constructor'])
const formulaText = /^[=+@]|^-(?:[=+@A-Za-z])/

function reject(code: string, message: string): never {
  throw new ImportParseError(code, message)
}

function inspectXlsxContainer(input: Buffer) {
  if (input.length < 4 || input.readUInt32LE(0) !== 0x04034b50) {
    reject('FILE_SIGNATURE_INVALID', 'The XLSX file signature is invalid.')
  }
  const eocdSignature = 0x06054b50
  let eocd = -1
  for (let offset = Math.max(0, input.length - 65_557); offset <= input.length - 22; offset += 1) {
    if (input.readUInt32LE(offset) === eocdSignature) eocd = offset
  }
  if (eocd < 0) reject('WORKBOOK_CONTAINER_INVALID', 'The XLSX container is incomplete.')
  const entries = input.readUInt16LE(eocd + 10)
  const centralSize = input.readUInt32LE(eocd + 12)
  const centralOffset = input.readUInt32LE(eocd + 16)
  if (
    entries < 1 ||
    entries > IMPORT_ENGINEERING_LIMITS.maxWorkbookEntries ||
    centralOffset + centralSize > input.length
  ) {
    reject('WORKBOOK_CONTAINER_LIMIT', 'The XLSX container exceeds safe structural limits.')
  }
  let offset = centralOffset
  let totalCompressed = 0
  let totalUncompressed = 0
  const names: string[] = []
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > input.length || input.readUInt32LE(offset) !== 0x02014b50) {
      reject('WORKBOOK_CONTAINER_INVALID', 'The XLSX directory is malformed.')
    }
    const flags = input.readUInt16LE(offset + 8)
    if ((flags & 1) !== 0) reject('WORKBOOK_ENCRYPTED', 'Encrypted workbooks are not supported.')
    const compressed = input.readUInt32LE(offset + 20)
    const uncompressed = input.readUInt32LE(offset + 24)
    const nameLength = input.readUInt16LE(offset + 28)
    const extraLength = input.readUInt16LE(offset + 30)
    const commentLength = input.readUInt16LE(offset + 32)
    const end = offset + 46 + nameLength + extraLength + commentLength
    if (end > input.length) reject('WORKBOOK_CONTAINER_INVALID', 'The XLSX directory is malformed.')
    const name = input.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    if (name.includes('..') || name.startsWith('/') || name.includes('\\')) {
      reject('WORKBOOK_PATH_UNSAFE', 'The workbook contains an unsafe internal path.')
    }
    names.push(name.toLowerCase())
    totalCompressed += compressed
    totalUncompressed += uncompressed
    offset = end
  }
  if (
    totalUncompressed > IMPORT_ENGINEERING_LIMITS.maxUncompressedBytes ||
    (totalCompressed > 0 &&
      totalUncompressed / totalCompressed > IMPORT_ENGINEERING_LIMITS.maxCompressionRatio)
  ) {
    reject('WORKBOOK_DECOMPRESSION_LIMIT', 'The workbook exceeds decompression limits.')
  }
  if (!names.includes('[content_types].xml') || !names.includes('xl/workbook.xml')) {
    reject('WORKBOOK_STRUCTURE_INVALID', 'The XLSX package does not contain a workbook.')
  }
  if (
    names.some(
      (name) =>
        name.includes('vbaproject') ||
        name.startsWith('xl/externallinks/') ||
        name.startsWith('xl/embeddings/') ||
        name.startsWith('xl/oleobjects/'),
    )
  ) {
    reject('WORKBOOK_ACTIVE_CONTENT', 'Macros, external links, and embedded objects are forbidden.')
  }
}

function inspectXlsSignature(input: Buffer) {
  const compound = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  if (input.length < compound.length || !input.subarray(0, compound.length).equals(compound)) {
    reject('FILE_SIGNATURE_INVALID', 'The XLS file signature is invalid.')
  }
}

function inspectCsv(input: Buffer) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(input)
  } catch {
    reject('CSV_ENCODING_INVALID', 'CSV files must use valid UTF-8 encoding.')
  }
  if (input.includes(0)) reject('CSV_BINARY_CONTENT', 'The CSV contains binary content.')
}

function runParserWorker(input: Buffer, fileType: SupportedImportFileType) {
  return new Promise<WorkerResult>((resolve, rejectPromise) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        input,
        fileType,
        papaPath: require.resolve('papaparse'),
        xlsxPath: require.resolve('xlsx'),
      },
    })
    const timeout = setTimeout(() => {
      void worker.terminate()
      rejectPromise(
        new ImportParseError('PARSE_TIMEOUT', 'The file exceeded the parsing time limit.'),
      )
    }, IMPORT_ENGINEERING_LIMITS.parseTimeoutMilliseconds)
    worker.once('message', (message: WorkerResult) => {
      clearTimeout(timeout)
      void worker.terminate()
      resolve(message)
    })
    worker.once('error', () => {
      clearTimeout(timeout)
      rejectPromise(new ImportParseError('PARSER_FAILED', 'The parser could not read the file.'))
    })
  })
}

function sourceColumnKey(columnIndex: number) {
  return `column_${String(columnIndex).padStart(4, '0')}`
}

function normalizeMatrix(
  matrix: unknown[][],
): Pick<SecureImportParseResult, 'rows' | 'sourceColumns'> {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    reject('FILE_EMPTY', 'The file does not contain a header row.')
  }
  const headerCells = matrix[0]
  if (!Array.isArray(headerCells) || headerCells.length === 0) {
    reject('HEADERS_MISSING', 'The file does not contain headers.')
  }
  if (headerCells.length > IMPORT_ENGINEERING_LIMITS.maxSourceColumns) {
    reject('COLUMN_LIMIT', 'The file has too many columns.')
  }
  const headers = headerCells.map((value, index) => {
    if (typeof value !== 'string' && typeof value !== 'number') {
      reject('HEADER_INVALID', `Header ${index + 1} is invalid.`)
    }
    const header = String(value)
      .replace(/^\uFEFF/, '')
      .trim()
    const normalized = header.toLowerCase()
    if (!header || header.length > IMPORT_ENGINEERING_LIMITS.maxHeaderCharacters) {
      reject('HEADER_INVALID', `Header ${index + 1} is empty or too long.`)
    }
    if (unsafeHeader.has(normalized)) {
      reject('HEADER_UNSAFE', `Header ${index + 1} uses a prohibited key.`)
    }
    return header
  })
  const sourceColumns = headers.map((header, index) => ({
    key: sourceColumnKey(index + 1),
    header,
    columnIndex: index + 1,
  }))
  const sourceRows = matrix.slice(1)
  if (sourceRows.length > IMPORT_ENGINEERING_LIMITS.maxRows) {
    reject('ROW_LIMIT', 'The file has too many rows.')
  }
  if (sourceRows.length * headers.length > IMPORT_ENGINEERING_LIMITS.maxCells) {
    reject('CELL_LIMIT', 'The file has too many cells.')
  }
  const rows: ParsedImportRow[] = sourceRows.map((source, rowIndex) => {
    if (!Array.isArray(source) || source.length > headers.length) {
      reject('ROW_WIDTH_INVALID', `Source row ${rowIndex + 2} has an unexpected column count.`)
    }
    const values = Object.create(null) as Record<string, CellValue>
    sourceColumns.forEach((column, columnOffset) => {
      const value = source[columnOffset] ?? null
      if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) {
        reject('CELL_TYPE_INVALID', `Source row ${rowIndex + 2} contains an unsupported cell.`)
      }
      if (typeof value === 'string') {
        if (value.length > IMPORT_ENGINEERING_LIMITS.maxCellCharacters) {
          reject('CELL_LENGTH_LIMIT', `Source row ${rowIndex + 2} contains an oversized cell.`)
        }
        if (formulaText.test(value.trimStart())) {
          reject('CELL_FORMULA_UNSAFE', `Source row ${rowIndex + 2} contains formula-like text.`)
        }
      }
      values[column.key] = value as CellValue
    })
    return { sourceRowNumber: rowIndex + 2, values }
  })
  return { rows, sourceColumns }
}

export async function parseSecureImport(
  input: Buffer,
  fileType: SupportedImportFileType,
): Promise<SecureImportParseResult> {
  if (!Buffer.isBuffer(input) || input.length === 0) reject('FILE_EMPTY', 'The file is empty.')
  if (input.length > IMPORT_ENGINEERING_LIMITS.maxBytes) {
    reject('FILE_SIZE_LIMIT', 'The file exceeds the upload byte limit.')
  }
  if (fileType === 'CSV') inspectCsv(input)
  if (fileType === 'XLSX') inspectXlsxContainer(input)
  if (fileType === 'XLS') inspectXlsSignature(input)
  const parsed = await runParserWorker(input, fileType)
  if (parsed.error) reject(parsed.error, 'The file could not be parsed safely.')
  if (parsed.formulas) {
    reject(
      'WORKBOOK_FORMULA_REQUIRES_VALUES_ONLY',
      'Workbook formulas are not accepted. Export a values-only copy before uploading.',
    )
  }
  if (parsed.macros || parsed.links) {
    reject('WORKBOOK_ACTIVE_CONTENT', 'Workbook macros and links are forbidden.')
  }
  if ((parsed.sheetNames?.length ?? 0) > IMPORT_ENGINEERING_LIMITS.maxWorkbookSheets) {
    reject('WORKBOOK_SHEET_LIMIT', 'The workbook has too many worksheets.')
  }
  if (fileType !== 'CSV' && parsed.sheetNames?.length !== 1) {
    reject(
      'WORKBOOK_SHEET_AMBIGUOUS',
      'Workbooks must contain exactly one worksheet so no source rows are silently omitted.',
    )
  }
  const normalized = normalizeMatrix(parsed.matrix ?? [])
  return {
    sourceColumns: normalized.sourceColumns,
    rows: normalized.rows,
    sheetNames: parsed.sheetNames ?? [],
  }
}
