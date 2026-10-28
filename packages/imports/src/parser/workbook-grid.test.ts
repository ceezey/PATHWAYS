import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { excelSerialToIsoDate } from './excel-date'
import { normalizeMatrix } from './matrix'
import { parseSecureImport } from './secure'
import { workbookGrid } from './workbook-grid'

function workbookBuffer(rows: unknown[][], mutate?: (sheet: XLSX.WorkSheet) => void) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  mutate?.(sheet)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Data')
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}

const grid = (buffer: Buffer, sheetName: string | null = null, wantDateText = true) =>
  workbookGrid(XLSX, buffer, 'buffer', sheetName, excelSerialToIsoDate, wantDateText)

describe('workbookGrid', () => {
  it('matches the secure parser', async () => {
    const buffer = workbookBuffer(
      [
        ['orgUnit', 'Date of Birth', 'Age'],
        ['VidTtlaSlAD', 39677, 18],
      ],
      (sheet) => {
        sheet.A1.z = 'yyyy-mm-dd'
        sheet.B2.z = 'yy/mm/dd'
      },
    )
    const result = grid(buffer)
    const parsed = await parseSecureImport(buffer, 'XLSX')

    const normalized = normalizeMatrix(result.matrix)
    expect(normalized.rows).toEqual(parsed.rows)
    expect(normalized.sourceColumns).toEqual(parsed.sourceColumns)
    expect(result.sheetNames).toEqual(['Data'])
    expect(result.dateText).toEqual({ '1:1': '08/08/17' })
  })

  it('reports the cell of a formula that saved no value', () => {
    const base = workbookBuffer([
      ['total', 'other'],
      [0, 2],
    ])
    const files = XLSX.CFB.read(base, { type: 'buffer' })
    const entry = files.FileIndex[files.FullPaths.indexOf('Root Entry/xl/worksheets/sheet1.xml')]
    entry.content = Buffer.from(
      String(entry.content).replace(
        /<sheetData>[\s\S]*<\/sheetData>/,
        '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>total</t></is></c><c r="B1" t="inlineStr"><is><t>other</t></is></c></row><row r="2"><c r="A2"><f>1+1</f></c><c r="B2"><v>2</v></c></row></sheetData>',
      ),
    )
    entry.size = entry.content.length
    const stub = Buffer.from(XLSX.CFB.write(files, { type: 'buffer', fileType: 'zip' }))

    expect(grid(stub).formulaGap).toBe('A2')
  })

  it('keys the shown date text by matrix position when blank rows and columns precede it', () => {
    const buffer = workbookBuffer(
      [
        [null, null, null],
        [null, 'Name', 'Date of Birth'],
        [null, null, null],
        [null, 'Ana', 39677],
      ],
      (sheet) => {
        sheet.C4.z = 'yy/mm/dd'
        // The range starts at column B, so matrix column 0 is sheet column B.
        sheet['!ref'] = 'B1:C4'
      },
    )
    const result = grid(buffer)

    expect(result.matrix).toEqual([
      ['Name', 'Date of Birth'],
      ['Ana', '2008-08-17'],
    ])
    expect(result.dateText).toEqual({ '1:1': '08/08/17' })
  })

  it('skips the shown date text when it is not wanted', () => {
    const buffer = workbookBuffer([['Date of Birth'], [39677]], (sheet) => {
      sheet.A2.z = 'yy/mm/dd'
    })
    const result = grid(buffer, null, false)

    expect(result.matrix).toEqual([['Date of Birth'], ['2008-08-17']])
    expect(result.dateText).toEqual({})
  })

  it('throws when the chosen sheet is not in the workbook', () => {
    expect(() => grid(workbookBuffer([['a']]), 'Missing')).toThrow(
      expect.objectContaining({ code: 'WORKBOOK_SHEET_MISSING' }),
    )
  })
})
