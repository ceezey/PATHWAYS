import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { IMPORT_ENGINEERING_LIMITS } from '../limits'
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
      headers: ['Name', 'Confirmed', 'Count', 'Blank'],
      rows: [
        {
          sourceRowNumber: 2,
          values: { Name: 'Alice', Confirmed: 'false', Count: '0', Blank: '' },
        },
      ],
      sheetNames: [],
    })
  })

  it('parses both supported spreadsheet containers without evaluating cells', async () => {
    const xlsx = await parseSecureImport(workbookBuffer([['score'], [0]]), 'XLSX')
    const xls = await parseSecureImport(workbookBuffer([['score'], [false]], 'biff8'), 'XLS')

    expect(xlsx.rows[0]).toMatchObject({ sourceRowNumber: 2, values: { score: 0 } })
    expect(xls.rows[0]).toMatchObject({ sourceRowNumber: 2, values: { score: false } })
  })

  it('rejects duplicate and prototype-oriented headers instead of guessing', async () => {
    await expectCode(parseSecureImport(Buffer.from('Name,name\na,b'), 'CSV'), 'DUPLICATE_HEADER')
    await expectCode(parseSecureImport(Buffer.from('__proto__,name\na,b'), 'CSV'), 'HEADER_UNSAFE')
  })

  it('rejects formula-like CSV values and workbook formulas or links', async () => {
    await expectCode(
      parseSecureImport(Buffer.from('name,total\nAlice,=1+1'), 'CSV'),
      'CELL_FORMULA_UNSAFE',
    )
    await expectCode(
      parseSecureImport(
        workbookBuffer([['total'], [2]], 'xlsx', (sheet) => {
          sheet.A2 = { t: 'n', v: 2, f: '1+1' }
        }),
        'XLSX',
      ),
      'WORKBOOK_ACTIVE_CONTENT',
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
