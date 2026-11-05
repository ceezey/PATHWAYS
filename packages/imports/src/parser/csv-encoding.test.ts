import { describe, expect, it } from 'vitest'

import { decodeCsv } from './csv-encoding'

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0))

describe('decodeCsv', () => {
  it('reads a Windows-1252 CSV', () => {
    const bytes = Uint8Array.from([...ascii('Name,Town\nJose,Pe'), 0xf1, ...ascii('aranda\n')])
    expect(decodeCsv(bytes)).toEqual({
      text: 'Name,Town\nJose,Peñaranda\n',
      encoding: 'WINDOWS-1252',
    })
  })

  it('reads plain ASCII as UTF-8', () => {
    expect(decodeCsv(Uint8Array.from(ascii('a,b\n')))).toEqual({ text: 'a,b\n', encoding: 'UTF-8' })
  })

  it('reads UTF-8 without a BOM', () => {
    const bytes = new TextEncoder().encode('Name\nPeñaranda\n')
    expect(decodeCsv(bytes)).toEqual({ text: 'Name\nPeñaranda\n', encoding: 'UTF-8' })
  })

  it('reads UTF-8 with a BOM and drops the mark', () => {
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Name,Town\n')])
    expect(decodeCsv(bytes)).toEqual({ text: 'Name,Town\n', encoding: 'UTF-8' })
  })

  it('reads UTF-16LE with a BOM and drops the mark', () => {
    const units = [...'Name,Peñaranda\n'].map((char) => char.charCodeAt(0))
    const bytes = Uint8Array.from([
      0xff,
      0xfe,
      ...units.flatMap((unit) => [unit & 0xff, unit >> 8]),
    ])
    expect(decodeCsv(bytes)).toEqual({ text: 'Name,Peñaranda\n', encoding: 'UTF-16LE' })
  })

  it('reads UTF-16BE with a BOM and drops the mark', () => {
    const units = [...'Name,Peñaranda\n'].map((char) => char.charCodeAt(0))
    const bytes = Uint8Array.from([
      0xfe,
      0xff,
      ...units.flatMap((unit) => [unit >> 8, unit & 0xff]),
    ])
    expect(decodeCsv(bytes)).toEqual({ text: 'Name,Peñaranda\n', encoding: 'UTF-16BE' })
  })

  it('refuses bytes that are invalid for the encoding a BOM names', () => {
    for (const bytes of [
      [0xef, 0xbb, 0xbf, ...ascii('Name,Pe'), 0xff, ...ascii('a\n')],
      [0xff, 0xfe, ...ascii('N'), 0x00, 0x41],
    ]) {
      expect(() => decodeCsv(Uint8Array.from(bytes))).toThrowError(
        expect.objectContaining({ code: 'CSV_ENCODING_INVALID' }),
      )
    }
  })

  it('refuses a zero character in a UTF-16 CSV, checked on the decoded text', () => {
    const units = [...'a\u0000b\n'].map((char) => char.charCodeAt(0))
    const bytes = Uint8Array.from([
      0xff,
      0xfe,
      ...units.flatMap((unit) => [unit & 0xff, unit >> 8]),
    ])
    expect(() => decodeCsv(bytes)).toThrowError(
      expect.objectContaining({ code: 'CSV_BINARY_CONTENT' }),
    )
  })

  it('refuses a zero character after decoding', () => {
    expect(() => decodeCsv(new TextEncoder().encode('a\u0000b'))).toThrowError(
      expect.objectContaining({ code: 'CSV_BINARY_CONTENT' }),
    )
  })

  it('refuses a zero byte in a Windows-1252 file', () => {
    expect(() => decodeCsv(Uint8Array.from([0x61, 0xe9, 0x00]))).toThrowError(
      expect.objectContaining({ code: 'CSV_BINARY_CONTENT' }),
    )
  })
})
