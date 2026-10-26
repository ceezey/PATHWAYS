import { Worker } from 'node:worker_threads'

import { importHeaderLabel } from '../header-label'
import { IMPORT_ENGINEERING_LIMITS, type SupportedImportFileType } from '../limits'
import { isCodeHeaderRow } from './code-header'
import { excelSerialToIsoDate } from './excel-date'
import { type PdfTableLimits, reconstructPdfTable } from './pdf-table'

type CellValue = string | number | boolean | null

interface WorkerResult {
  matrix?: unknown[][]
  sheetNames?: string[]
  formulaGap?: string
  links?: boolean
  macros?: boolean
  error?: string
}

interface ParsedImportRow {
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

interface SecureImportParseResult {
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

// The PDF table reconstruction and the Excel date conversion are embedded as source so
// their CPU and memory fall under the worker's parse timeout and resource limits, in both
// source and compiled builds.
const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const reconstructPdfTable = ${reconstructPdfTable.toString()};
const excelSerialToIsoDate = ${excelSerialToIsoDate.toString()};
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
  } else if (workerData.fileType === 'PDF') {
    // unpdf is loaded here only. getDocument never runs embedded scripts, XFA,
    // forms, annotations, links or attachments; only the text layer is read.
    (async () => {
      const { getDocumentProxy } = require(workerData.unpdfPath);
      let document;
      try {
        document = await getDocumentProxy(new Uint8Array(input), {
          isEvalSupported: false,
          useSystemFonts: false,
          disableFontFace: true,
          enableXfa: false,
          verbosity: 0,
        });
      } catch (error) {
        parentPort.postMessage({
          error: error && error.name === 'PasswordException' ? 'PDF_ENCRYPTED' : 'PDF_PARSE_FAILED',
        });
        return;
      }
      try {
        if ((await document.getPermissions()) !== null) {
          parentPort.postMessage({ error: 'PDF_ENCRYPTED' });
          return;
        }
        if (document.numPages > workerData.maxPdfPages) {
          parentPort.postMessage({ error: 'PDF_PAGE_LIMIT' });
          return;
        }
        const items = [];
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber);
          const content = await page.getTextContent({ includeMarkedContent: false });
          for (const item of content.items) {
            if (typeof item.str !== 'string' || !Array.isArray(item.transform)) continue;
            const [a, b, c, d, x, y] = item.transform;
            // Horizontal text only; rotated or skewed text is not table content.
            if (Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6 || a <= 0 || d <= 0) continue;
            if (items.length >= workerData.maxPdfTextItems) {
              parentPort.postMessage({ error: 'PDF_TEXT_LIMIT' });
              return;
            }
            items.push([pageNumber, x, y, Number(item.width) || 0, Math.abs(d), item.str]);
          }
          page.cleanup();
        }
        let matrix;
        try {
          matrix = reconstructPdfTable(items, workerData.pdfTableLimits);
        } catch (error) {
          const code = error && typeof error.code === 'string' ? error.code : 'PDF_PARSE_FAILED';
          parentPort.postMessage({ error: code });
          return;
        }
        parentPort.postMessage({ matrix, sheetNames: [] });
      } finally {
        await document.destroy();
      }
    })().catch(() => parentPort.postMessage({ error: 'PDF_PARSE_FAILED' }));
  } else {
    const XLSX = require(workerData.xlsxPath);
    const workbook = XLSX.read(input, {
      type: 'buffer',
      cellDates: false,
      cellFormula: true,
      cellHTML: false,
      cellStyles: false,
      cellNF: true,
      // Stubs keep a formula whose file saved no value, so the gap check below can see it.
      sheetStubs: true,
      bookVBA: true,
      WTF: false,
    });
    let links = false;
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      for (const key of Object.keys(sheet || {})) {
        if (key.startsWith('!')) continue;
        const cell = sheet[key];
        if (cell && cell.l) links = true;
      }
    }
    const first = workerData.sheetName === null
      ? workbook.SheetNames[0]
      : workbook.SheetNames.find((name) => name === workerData.sheetName);
    if (workerData.sheetName !== null && first === undefined) throw { code: 'WORKBOOK_SHEET_MISSING' };
    // A formula is never evaluated: its saved value is imported, and a formula without one refuses the file.
    // shortcut: a t="b" formula saved with no value reads as false; no major spreadsheet writer emits it, add a sheet XML pre-scan if one does.
    let formulaGap;
    for (const key of Object.keys((first && workbook.Sheets[first]) || {})) {
      if (key.startsWith('!')) continue;
      const cell = workbook.Sheets[first][key];
      if (cell && typeof cell.f === 'string' && (cell.t === 'z' || cell.t === 'e' || cell.v === undefined)) {
        formulaGap = key;
        break;
      }
    }
    // Date-formatted numeric cells become ISO strings; out-of-range serials stay numeric.
    // The date format is dropped either way so sheet_to_json does not build Date objects.
    const date1904 = Boolean(workbook.Workbook && workbook.Workbook.WBProps && workbook.Workbook.WBProps.date1904);
    const firstSheet = first ? workbook.Sheets[first] : null;
    for (const key of Object.keys(firstSheet || {})) {
      if (key.startsWith('!')) continue;
      const cell = firstSheet[key];
      if (!cell || cell.t !== 'n' || !cell.z || !XLSX.SSF.is_date(cell.z)) continue;
      const iso = excelSerialToIsoDate(cell.v, date1904);
      delete cell.z;
      if (iso !== null) {
        cell.t = 's';
        cell.v = iso;
      }
    }
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
      formulaGap,
      links,
      macros: Boolean(workbook.vbaraw),
    });
  }
} catch (error) {
  const missing = error && error.code === 'WORKBOOK_SHEET_MISSING';
  parentPort.postMessage({ error: missing ? 'WORKBOOK_SHEET_MISSING' : 'PARSER_REJECTED_INPUT' });
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

function inspectPdfSignature(input: Buffer) {
  if (input.length < 5 || input.subarray(0, 5).toString('latin1') !== '%PDF-') {
    reject('FILE_SIGNATURE_INVALID', 'The PDF file signature is invalid.')
  }
}

/**
 * Memory backstop for the sandbox parser. Sized from measurement: the largest
 * accepted workbook (5 MiB, 25 MiB uncompressed) and PDF (50 pages at the text-item
 * bound) stay well below it. Exceeding it terminates the worker, never the API.
 */
const PARSER_WORKER_RESOURCE_LIMITS = Object.freeze({
  maxOldGenerationSizeMb: 512,
  maxYoungGenerationSizeMb: 64,
  codeRangeSizeMb: 64,
  stackSizeMb: 4,
})

type ParserLimits = PdfTableLimits & { maxPdfPages: number }

function runParserWorker(
  input: Buffer,
  fileType: SupportedImportFileType,
  limits: ParserLimits,
  sheetName: string | null,
) {
  return new Promise<WorkerResult>((resolve, rejectPromise) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      resourceLimits: PARSER_WORKER_RESOURCE_LIMITS,
      workerData: {
        input,
        fileType,
        sheetName,
        papaPath: require.resolve('papaparse'),
        xlsxPath: require.resolve('xlsx'),
        unpdfPath: fileType === 'PDF' ? require.resolve('unpdf') : null,
        maxPdfPages: limits.maxPdfPages,
        maxPdfTextItems: limits.maxPdfTextItems,
        pdfTableLimits: {
          maxPdfTextItems: limits.maxPdfTextItems,
          maxSourceColumns: limits.maxSourceColumns,
          maxRows: limits.maxRows,
          maxCells: limits.maxCells,
        },
      },
    })
    let settled = false
    const settle = (action: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      void worker.terminate()
      action()
    }
    const timeout = setTimeout(() => {
      settle(() =>
        rejectPromise(
          new ImportParseError('PARSE_TIMEOUT', 'The file exceeded the parsing time limit.'),
        ),
      )
    }, IMPORT_ENGINEERING_LIMITS.parseTimeoutMilliseconds)
    worker.once('message', (message: WorkerResult) => settle(() => resolve(message)))
    worker.once('error', (error: NodeJS.ErrnoException) =>
      settle(() =>
        rejectPromise(
          error?.code === 'ERR_WORKER_OUT_OF_MEMORY'
            ? new ImportParseError('PARSE_MEMORY_LIMIT', 'The file needs too much memory to parse.')
            : new ImportParseError('PARSER_FAILED', 'The parser could not read the file.'),
        ),
      ),
    )
    worker.once('exit', () =>
      settle(() =>
        rejectPromise(new ImportParseError('PARSER_FAILED', 'The parser could not read the file.')),
      ),
    )
  })
}

const genericParserMessage = 'The file could not be parsed safely.'

const parserErrorMessages: Record<string, string> = {
  WORKBOOK_SHEET_MISSING: 'The chosen worksheet is not in this workbook. Choose the sheet again.',
  PDF_NO_TEXT_LAYER:
    'This PDF has no text layer. Scanned PDFs are not supported; export the data as CSV or XLSX.',
  PDF_ENCRYPTED: 'Password-protected PDFs are not supported. Upload an unprotected copy.',
  PDF_TABLE_UNRECOGNIZED:
    'No table was recognized in this PDF. It needs one header line and consistent columns.',
  PDF_PAGE_LIMIT: `The PDF has more than ${IMPORT_ENGINEERING_LIMITS.maxPdfPages} pages.`,
  PDF_TEXT_LIMIT: 'The PDF contains too much text to import safely.',
  PDF_PARSE_FAILED: 'The PDF could not be read safely.',
  COLUMN_LIMIT: 'The file has too many columns.',
  ROW_LIMIT: 'The file has too many rows.',
  CELL_LIMIT: 'The file has too many cells.',
}

// Worker results carry only codes; anything else collapses to a generic rejection.
const workerErrorCodes = new Set([
  'CSV_PARSE_FAILED',
  'PARSER_REJECTED_INPUT',
  ...Object.keys(parserErrorMessages),
])

function sourceColumnKey(columnIndex: number) {
  return `column_${String(columnIndex).padStart(4, '0')}`
}

function normalizeMatrix(
  matrix: unknown[][],
): Pick<SecureImportParseResult, 'rows' | 'sourceColumns'> {
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

/**
 * `tighter` exists for tests: each value can only lower the engineering limit, never
 * raise it. Production callers pass nothing.
 */
export async function parseSecureImport(
  input: Buffer,
  fileType: SupportedImportFileType,
  tighter: Partial<ParserLimits> = {},
  sheetName: string | null = null,
): Promise<SecureImportParseResult> {
  const bounded = (key: keyof ParserLimits) =>
    Math.min(IMPORT_ENGINEERING_LIMITS[key], tighter[key] ?? Number.POSITIVE_INFINITY)
  const limits: ParserLimits = {
    maxPdfTextItems: bounded('maxPdfTextItems'),
    maxSourceColumns: bounded('maxSourceColumns'),
    maxRows: bounded('maxRows'),
    maxCells: bounded('maxCells'),
    maxPdfPages: bounded('maxPdfPages'),
  }
  if (!Buffer.isBuffer(input) || input.length === 0) reject('FILE_EMPTY', 'The file is empty.')
  if (input.length > IMPORT_ENGINEERING_LIMITS.maxBytes) {
    reject('FILE_SIZE_LIMIT', 'The file exceeds the upload byte limit.')
  }
  if (fileType === 'CSV') inspectCsv(input)
  if (fileType === 'XLSX') inspectXlsxContainer(input)
  if (fileType === 'XLS') inspectXlsSignature(input)
  if (fileType === 'PDF') inspectPdfSignature(input)
  const workbook = fileType === 'XLSX' || fileType === 'XLS'
  const parsed = await runParserWorker(input, fileType, limits, workbook ? sheetName : null)
  if (parsed.error) {
    const code = workerErrorCodes.has(parsed.error) ? parsed.error : 'PARSER_REJECTED_INPUT'
    reject(code, parserErrorMessages[code] ?? genericParserMessage)
  }
  if (parsed.formulaGap) {
    reject(
      'WORKBOOK_FORMULA_NO_VALUE',
      `${/^[A-Z]{1,3}[0-9]{1,7}$/.test(parsed.formulaGap) ? `Cell ${parsed.formulaGap}` : 'A cell'} has a formula with no saved value. Open and save the file in Excel or Google Sheets, then upload again.`,
    )
  }
  if (parsed.macros || parsed.links) {
    reject('WORKBOOK_ACTIVE_CONTENT', 'Workbook macros and links are forbidden.')
  }
  if ((parsed.sheetNames?.length ?? 0) > IMPORT_ENGINEERING_LIMITS.maxWorkbookSheets) {
    reject('WORKBOOK_SHEET_LIMIT', 'The workbook has too many worksheets.')
  }
  // A workbook with several sheets is read only from the sheet the uploader chose, so no rows are skipped unseen.
  if (workbook && sheetName === null && parsed.sheetNames?.length !== 1) {
    reject(
      'WORKBOOK_SHEET_AMBIGUOUS',
      `This workbook has ${parsed.sheetNames?.length ?? 0} worksheets. Choose the sheet to import, then upload again.`,
    )
  }
  const normalized = normalizeMatrix(parsed.matrix ?? [])
  return {
    sourceColumns: normalized.sourceColumns,
    rows: normalized.rows,
    sheetNames: parsed.sheetNames ?? [],
  }
}
