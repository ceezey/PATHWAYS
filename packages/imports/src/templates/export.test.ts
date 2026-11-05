import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { toCsv, toWorkbookBytes, toXlsxBuffer } from './export'

const risky = ['+639170000001', '=1+1', '@x', '-x']

const firstSheet = (bytes: ArrayBuffer | Uint8Array) => {
  const book = XLSX.read(bytes, { type: 'array' })
  return book.Sheets[book.SheetNames[0]]
}

describe('export writers neutralize formula-like text', () => {
  it.each(['xlsx', 'xls'] as const)('toWorkbookBytes quotes string cells in %s', (format) => {
    const sheet = firstSheet(toWorkbookBytes([['Name'], ...risky.map((value) => [value])], format))
    expect(XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }).flat()).toEqual([
      'Name',
      ...risky.map((value) => `'${value}`),
    ])
  })

  it('toCsv quotes string values and header names and leaves numbers alone', () => {
    const csv = toCsv([{ '=head': '+639170000001', note: '=1+1', score: -5 }])
    expect(csv).toBe("'=head,note,score\n'+639170000001,'=1+1,-5")
  })

  it('toXlsxBuffer quotes string values and keeps a number cell a number', () => {
    const sheet = firstSheet(toXlsxBuffer(risky.map((value, score) => ({ value, score }))))
    expect(sheet.A2.v).toBe("'+639170000001")
    expect(sheet.A3.v).toBe("'=1+1")
    expect(sheet.A4.v).toBe("'@x")
    expect(sheet.A5.v).toBe("'-x")
    expect(sheet.B5).toMatchObject({ t: 'n', v: 3 })
  })
})
