import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { IMPORT_ENGINEERING_LIMITS } from '../limits'
import { isCodeHeaderRow } from './code-header'
import { type ImportParseError, parseSecureImport } from './secure'

function workbookBuffer(
  rows: unknown[][],
  bookType: 'xlsx' | 'biff8' = 'xlsx',
  mutate?: (sheet: XLSX.WorkSheet) => void,
) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  mutate?.(sheet)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Data')
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType }))
}

// A one-sheet workbook whose second row is the given raw cell XML, as Excel or another tool may save it.
function sheetXmlWorkbook(cellXml: string) {
  const base = workbookBuffer([
    ['total', 'other'],
    [0, 2],
  ])
  const files = XLSX.CFB.read(base, { type: 'buffer' })
  const entry = files.FileIndex[files.FullPaths.indexOf('Root Entry/xl/worksheets/sheet1.xml')]
  const xml = String(entry.content).replace(
    /<sheetData>[\s\S]*<\/sheetData>/,
    `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>total</t></is></c><c r="B1" t="inlineStr"><is><t>other</t></is></c></row><row r="2">${cellXml}<c r="B2"><v>2</v></c></row></sheetData>`,
  )
  entry.content = Buffer.from(xml)
  entry.size = entry.content.length
  return Buffer.from(XLSX.CFB.write(files, { type: 'buffer', fileType: 'zip' }))
}

async function expectCode(work: Promise<unknown>, code: string) {
  await expect(work).rejects.toMatchObject({ code } satisfies Partial<ImportParseError>)
}

describe('secure import parser', () => {
  it('preserves original CSV headers, values, and source row numbers', async () => {
    const parsed = await parseSecureImport(
      Buffer.from('Name,Confirmed,Count,Blank\r\nAlice,false,0,\r\n', 'utf8'),
      'CSV',
    )

    expect(parsed).toEqual({
      sourceColumns: [
        { key: 'column_0001', header: 'Name', columnIndex: 1 },
        { key: 'column_0002', header: 'Confirmed', columnIndex: 2 },
        { key: 'column_0003', header: 'Count', columnIndex: 3 },
        { key: 'column_0004', header: 'Blank', columnIndex: 4 },
      ],
      rows: [
        {
          sourceRowNumber: 2,
          values: {
            column_0001: 'Alice',
            column_0002: 'false',
            column_0003: '0',
            column_0004: '',
          },
        },
      ],
      sheetNames: [],
    })
  })

  it('parses both supported spreadsheet containers without evaluating cells', async () => {
    const xlsx = await parseSecureImport(workbookBuffer([['score'], [0]]), 'XLSX')
    const xls = await parseSecureImport(workbookBuffer([['score'], [false]], 'biff8'), 'XLS')

    expect(xlsx.rows[0]).toMatchObject({
      sourceRowNumber: 2,
      values: { column_0001: 0 },
    })
    expect(xls.rows[0]).toMatchObject({
      sourceRowNumber: 2,
      values: { column_0001: false },
    })
  })

  it('emits date-formatted numeric cells as ISO dates and leaves other numbers alone', async () => {
    const parsed = await parseSecureImport(
      workbookBuffer(
        [
          ['Date of Birth', 'Age', 'Plain', 'Far'],
          [39677, 18, 39677, 900000],
        ],
        'xlsx',
        (sheet) => {
          sheet.A2.z = 'yy/mm/dd'
          sheet.C2.z = 'General'
          sheet.D2.z = 'yy/mm/dd'
        },
      ),
      'XLSX',
    )

    expect(parsed.rows[0]?.values).toEqual({
      column_0001: '2008-08-17',
      column_0002: 18,
      column_0003: 39677,
      column_0004: 900000,
    })
  })

  it('keeps date-formatted text cells as text, header included', async () => {
    const parsed = await parseSecureImport(
      workbookBuffer(
        [
          ['orgUnit', 'Date of Birth'],
          ['VidTtlaSlAD', 39677],
        ],
        'xlsx',
        (sheet) => {
          sheet.A1.z = 'yyyy-mm-dd'
          sheet.A2.z = 'yyyy-mm-dd'
          sheet.B2.z = 'yy/mm/dd'
        },
      ),
      'XLSX',
    )

    expect(parsed.sourceColumns[0]?.header).toBe('orgUnit')
    expect(parsed.rows[0]?.values).toEqual({
      column_0001: 'VidTtlaSlAD',
      column_0002: '2008-08-17',
    })
  })

  it('reads date-formatted cells of a 1904-system workbook from the 1904 epoch', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([['Date of Birth'], [38215]])
    sheet.A2.z = 'yy/mm/dd'
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Data')
    workbook.Workbook = { WBProps: { date1904: true } }
    const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))

    const parsed = await parseSecureImport(buffer, 'XLSX')

    expect(parsed.rows[0]?.values).toEqual({ column_0001: '2008-08-17' })
  })

  it('keeps repeated headers distinct by immutable ordinal identity', async () => {
    const parsed = await parseSecureImport(Buffer.from('Name,name,Name\na,b,c'), 'CSV')

    expect(parsed.sourceColumns).toEqual([
      { key: 'column_0001', header: 'Name', columnIndex: 1 },
      { key: 'column_0002', header: 'name', columnIndex: 2 },
      { key: 'column_0003', header: 'Name', columnIndex: 3 },
    ])
    expect(parsed.rows[0]?.values).toEqual({
      column_0001: 'a',
      column_0002: 'b',
      column_0003: 'c',
    })
  })

  it('rejects prototype-oriented headers instead of using them as object keys', async () => {
    await expectCode(parseSecureImport(Buffer.from('__proto__,name\na,b'), 'CSV'), 'HEADER_UNSAFE')
  })

  it('imports the saved value of a workbook formula without evaluating it', async () => {
    const parsed = await parseSecureImport(
      workbookBuffer([['total'], [0]], 'xlsx', (sheet) => {
        // The saved value deliberately differs from what the formula would compute.
        sheet.A2 = { t: 'n', v: 7, f: '1+1' }
      }),
      'XLSX',
    )
    expect(parsed.rows[0]?.values.column_0001).toBe(7)
  })

  it.each([
    ['no saved value', '<c r="A2"><f>1+1</f></c>'],
    ['an empty saved number', '<c r="A2"><f>1+1</f><v></v></c>'],
    ['an error result', '<c r="A2" t="e"><f>1/0</f><v>#DIV/0!</v></c>'],
  ])('refuses a formula with %s, naming the cell', async (_name, cell) => {
    const work = parseSecureImport(sheetXmlWorkbook(cell), 'XLSX')
    await expect(work).rejects.toMatchObject({
      code: 'WORKBOOK_FORMULA_NO_VALUE',
      message: expect.stringContaining('Cell A2'),
    })
  })

  it('keeps a formula whose saved result is empty text as a blank', async () => {
    const parsed = await parseSecureImport(
      sheetXmlWorkbook('<c r="A2" t="str"><f>IF(1,"","x")</f><v></v></c>'),
      'XLSX',
    )
    expect(parsed.rows[0]?.values.column_0001).toBe('')
  })

  it('drops trailing blank columns and names a blank header by its position', async () => {
    const parsed = await parseSecureImport(
      workbookBuffer(
        [
          ['Name', null, 'Track'],
          ['Ana', 'x', 'A'],
        ],
        'xlsx',
        (sheet) => {
          // Formatting past the data widens the sheet range with empty cells.
          sheet['!ref'] = 'A1:F4'
        },
      ),
      'XLSX',
    )
    expect(parsed.sourceColumns.map((column) => column.header)).toEqual([
      'Name',
      'Column 2',
      'Track',
    ])
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]?.values).toEqual({
      column_0001: 'Ana',
      column_0002: 'x',
      column_0003: 'A',
    })
  })

  it('reads a code row above a label row', async () => {
    const parsed = await parseSecureImport(
      workbookBuffer([
        ['orgUnit', 'enrollmentDate', 'VFXAUuYgXtm', 'L2doMQ7OtUB'],
        [null, null, 'Consent to the collection', 'Participant ID'],
        ['OU1', 46170, true, 'AB08172008'],
      ]),
      'XLSX',
    )
    expect(parsed.sourceColumns.map((column) => column.header)).toEqual([
      'orgUnit',
      'enrollmentDate',
      'Consent to the collection',
      'Participant ID',
    ])
    expect(parsed.sourceColumns.map((column) => column.sourceCode)).toEqual([
      'orgUnit',
      'enrollmentDate',
      'VFXAUuYgXtm',
      'L2doMQ7OtUB',
    ])
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]?.sourceRowNumber).toBe(3)
    expect(parsed.rows[0]?.values.column_0003).toBe(true)
  })

  it('keeps plain code-like headers as one header row', async () => {
    const parsed = await parseSecureImport(
      workbookBuffer([
        ['first_name', 'last_name'],
        ['Juan Dela', 'Cruz'],
      ]),
      'XLSX',
    )
    expect(parsed.sourceColumns.map((column) => column.header)).toEqual(['first_name', 'last_name'])
    expect(parsed.sourceColumns.every((column) => !('sourceCode' in column))).toBe(true)
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]?.sourceRowNumber).toBe(2)
  })

  it('applies the code row rule to CSV and tells apart look-alike rows', async () => {
    const csv = await parseSecureImport(
      Buffer.from('orgUnit,VFXAUuYgXtm\n,Consent given\nOU1,yes\n'),
      'CSV',
    )
    expect(csv.sourceColumns.map((column) => column.header)).toEqual(['orgUnit', 'Consent given'])
    expect(csv.rows[0]?.sourceRowNumber).toBe(3)
    const ids = ['VFXAUuYgXtm', 'L2doMQ7OtUB']
    const labels = ['Consent given', 'Participant ID']
    expect(isCodeHeaderRow(ids, labels)).toBe(true)
    expect(isCodeHeaderRow(['orgUnit', 'enrollmentDate'], labels)).toBe(false)
    expect(isCodeHeaderRow(['orgUnit', 'VFXAUuYgXtm', 'L2doMQ7OtUB'], labels)).toBe(true)
    expect(isCodeHeaderRow(['orgUnit', 'enrollmentDate', 'VFXAUuYgXtm'], labels)).toBe(false)
    expect(isCodeHeaderRow(['VFXAUuYgXtm', 'Not a code'], labels)).toBe(false)
    expect(isCodeHeaderRow(['VFXAUuYgXtm', 5], labels)).toBe(false)
    expect(isCodeHeaderRow(['vfxauuygxtm', 'l2domq7otub'], labels)).toBe(false)
    expect(isCodeHeaderRow(ids, ['Consent', 'ParticipantID'])).toBe(false)
    expect(isCodeHeaderRow([null, ''], labels)).toBe(false)
  })

  it('keeps CSV values past the last header under a positional header', async () => {
    const parsed = await parseSecureImport(Buffer.from('Name\nAna,extra\n'), 'CSV')
    expect(parsed.sourceColumns.map((column) => column.header)).toEqual(['Name', 'Column 2'])
    expect(parsed.rows[0]?.values.column_0002).toBe('extra')
  })

  it('rejects formula-like CSV values, formula-like saved values and workbook links', async () => {
    await expectCode(
      parseSecureImport(Buffer.from('name,total\nAlice,=1+1'), 'CSV'),
      'CELL_FORMULA_UNSAFE',
    )
    await expectCode(
      parseSecureImport(
        workbookBuffer([['total'], ['x']], 'xlsx', (sheet) => {
          sheet.A2 = { t: 's', v: '=HYPERLINK("x")', f: 'A3' }
        }),
        'XLSX',
      ),
      'CELL_FORMULA_UNSAFE',
    )
    await expectCode(
      parseSecureImport(
        workbookBuffer([['url'], ['safe']], 'xlsx', (sheet) => {
          sheet.A2 = { t: 's', v: 'safe', l: { Target: 'https://example.invalid' } }
        }),
        'XLSX',
      ),
      'WORKBOOK_ACTIVE_CONTENT',
    )
  })

  it('accepts the 500-column source ceiling and rejects the next column', async () => {
    const allowedHeaders = Array.from(
      { length: IMPORT_ENGINEERING_LIMITS.maxSourceColumns },
      (_, index) => `field_${index + 1}`,
    )
    const allowed = await parseSecureImport(
      Buffer.from(`${allowedHeaders.join(',')}\n${allowedHeaders.map(() => 'x').join(',')}`),
      'CSV',
    )
    expect(allowed.sourceColumns).toHaveLength(500)
    expect(allowed.rows[0]?.values.column_0500).toBe('x')

    const excessHeaders = [...allowedHeaders, 'field_501']
    await expectCode(
      parseSecureImport(Buffer.from(`${excessHeaders.join(',')}\n`), 'CSV'),
      'COLUMN_LIMIT',
    )
  })

  it('parses a values-only wide workbook without collapsing repeated labels', async () => {
    const headers = Array.from({ length: 274 }, (_, index) => `Question ${(index % 40) + 1}`)
    const values = Array.from({ length: 274 }, (_, index) => index)

    const parsed = await parseSecureImport(workbookBuffer([headers, values]), 'XLSX')

    expect(parsed.sourceColumns).toHaveLength(274)
    expect(parsed.sourceColumns[0]).toEqual({
      key: 'column_0001',
      header: 'Question 1',
      columnIndex: 1,
    })
    expect(parsed.sourceColumns[40]).toEqual({
      key: 'column_0041',
      header: 'Question 1',
      columnIndex: 41,
    })
    expect(parsed.rows[0]?.values.column_0274).toBe(273)
  })

  it('rejects multi-sheet workbooks rather than silently ignoring rows', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['score'], [1]]), 'One')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['score'], [2]]), 'Two')

    await expectCode(
      parseSecureImport(
        Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })),
        'XLSX',
      ),
      'WORKBOOK_SHEET_AMBIGUOUS',
    )
  })

  it('reads only the chosen sheet of a multi-sheet workbook and refuses a missing one', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['score'], [1]]), 'One')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['score'], [2]]), 'Two')
    const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))

    const parsed = await parseSecureImport(buffer, 'XLSX', {}, 'Two')
    expect(parsed.rows.map((row) => row.values.column_0001)).toEqual([2])
    await expectCode(parseSecureImport(buffer, 'XLSX', {}, 'Three'), 'WORKBOOK_SHEET_MISSING')
  })

  it('rejects malformed or over-expanded containers, binary CSV, and finite byte/row limits', async () => {
    await expectCode(
      parseSecureImport(Buffer.from('PK malformed'), 'XLSX'),
      'FILE_SIGNATURE_INVALID',
    )
    await expectCode(
      parseSecureImport(Buffer.from([0xd0, 0xcf, 0x11]), 'XLS'),
      'FILE_SIGNATURE_INVALID',
    )
    const compressedBomb = workbookBuffer([['score'], [1]])
    const eocd = compressedBomb.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    expect(eocd).toBeGreaterThanOrEqual(0)
    const centralDirectory = compressedBomb.readUInt32LE(eocd + 16)
    compressedBomb.writeUInt32LE(
      IMPORT_ENGINEERING_LIMITS.maxUncompressedBytes + 1,
      centralDirectory + 24,
    )
    await expectCode(parseSecureImport(compressedBomb, 'XLSX'), 'WORKBOOK_DECOMPRESSION_LIMIT')
    await expectCode(parseSecureImport(Buffer.from([0x61, 0, 0x62]), 'CSV'), 'CSV_BINARY_CONTENT')
    await expectCode(
      parseSecureImport(Buffer.alloc(IMPORT_ENGINEERING_LIMITS.maxBytes + 1, 0x61), 'CSV'),
      'FILE_SIZE_LIMIT',
    )
    const tooManyRows = `value\n${'x\n'.repeat(IMPORT_ENGINEERING_LIMITS.maxRows + 1)}`
    await expectCode(parseSecureImport(Buffer.from(tooManyRows), 'CSV'), 'ROW_LIMIT')
  })
})
