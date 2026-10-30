import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { IMPORT_ENGINEERING_LIMITS } from '../limits'
import { parseSecureImport } from '../parser/secure'
import { readImportFile } from './read-import-file'

const toArrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

function workbook(sheets: Record<string, unknown[][]>, mutate?: (sheet: XLSX.WorkSheet) => void) {
  const book = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = XLSX.utils.aoa_to_sheet(rows)
    mutate?.(sheet)
    XLSX.utils.book_append_sheet(book, sheet, name)
  }
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
}

// The code the browser reader refuses with, and the server's for the same bytes.
async function refusals(bytes: Buffer, sheetName: string | null = null) {
  let browser: unknown
  try {
    readImportFile(toArrayBuffer(bytes), 'XLSX', sheetName)
  } catch (error) {
    browser = (error as { code?: unknown }).code
  }
  const server = await parseSecureImport(bytes, 'XLSX', {}, sheetName).then(
    () => undefined,
    (error: { code?: unknown }) => error.code,
  )
  return { browser, server }
}

describe('readImportFile', () => {
  it('reads rows keyed like the server', async () => {
    const bytes = workbook({
      Data: [
        ['Name', 'Age'],
        ['Ana', 31],
        ['Ben', 40],
      ],
    })
    const read = readImportFile(toArrayBuffer(bytes), 'XLSX', null)
    const server = await parseSecureImport(bytes, 'XLSX')
    expect(read.rows).toEqual(server.rows.map((row) => row.values))
    expect(read.rowNumbers).toEqual(server.rows.map((row) => row.sourceRowNumber))
    expect(read.sourceColumns).toEqual(server.sourceColumns)
  })

  it('reads a CSV with mixed line endings like the server', async () => {
    const bytes = Buffer.from('Name,Age\r\nAna,31\nBen,40\nCai,25')
    const read = readImportFile(toArrayBuffer(bytes), 'CSV', null)
    const server = await parseSecureImport(bytes, 'CSV')
    expect(read.rows).toHaveLength(3)
    expect(read.rows).toEqual(server.rows.map((row) => row.values))
    expect(read.rowNumbers).toEqual(server.rows.map((row) => row.sourceRowNumber))
  })

  it('reads the chosen sheet of a two-sheet workbook', () => {
    const bytes = workbook({ First: [['A'], ['one']], Second: [['B'], ['two']] })
    const read = readImportFile(toArrayBuffer(bytes), 'XLSX', 'Second')
    expect(read.rows).toEqual([{ column_0001: 'two' }])
  })

  it('shows a date as the file shows it', () => {
    const bytes = workbook({ Data: [['Born'], [39677]] }, (sheet) => {
      sheet.A2.z = 'yy/mm/dd'
    })
    const read = readImportFile(toArrayBuffer(bytes), 'XLSX', null)
    expect(read.rows[0].column_0001).toBe('2008-08-17')
    expect(read.shown(0, 'column_0001')).toBe('08/08/17')
    expect(read.shown(0, 'column_0002')).toBeNull()
  })

  it('maps shown dates past a coded header row', () => {
    const bytes = workbook(
      {
        Data: [
          ['VFXAUuYgXtm', 'L2doMQ7OtUB'],
          ['Date of birth', 'Name'],
          [39677, 'Ana'],
        ],
      },
      (sheet) => {
        sheet.A3.z = 'yy/mm/dd'
      },
    )
    const read = readImportFile(toArrayBuffer(bytes), 'XLSX', null)
    expect(read.rowNumbers).toEqual([3])
    expect(read.shown(0, 'column_0001')).toBe('08/08/17')
  })

  it('reads a CSV like the server', async () => {
    const csv = 'Name,Age\nAna,31\n\nBen,40\n'
    const read = readImportFile(toArrayBuffer(Buffer.from(csv)), 'CSV', null)
    const server = await parseSecureImport(Buffer.from(csv), 'CSV')
    expect(read.rows).toEqual(server.rows.map((row) => row.values))
    expect(read.rowNumbers).toEqual(server.rows.map((row) => row.sourceRowNumber))
    expect(read.shown(0, 'column_0001')).toBeNull()
  })

  it('refuses a CSV the server refuses', () => {
    const latin1 = Buffer.from([0x4e, 0x0a, 0xe9, 0x0a])
    expect(() => readImportFile(toArrayBuffer(latin1), 'CSV', null)).toThrow()
    const binary = Buffer.from([0x4e, 0x0a, 0x41, 0x00, 0x0a])
    expect(() => readImportFile(toArrayBuffer(binary), 'CSV', null)).toThrow()
  })

  it('refuses a workbook with links, which the server refuses', () => {
    const bytes = workbook({ Data: [['Name'], ['Ana']] }, (sheet) => {
      sheet.A2.l = { Target: 'https://example.com' }
    })
    expect(() => readImportFile(toArrayBuffer(bytes), 'XLSX', null)).toThrow()
  })

  it('refuses a container the server refuses before unzipping it', async () => {
    // A small file whose directory says one entry unpacks to 5 MB: under the size limit, far past the ratio.
    const bomb = workbook({ Data: [['Name'], ['Ana']] })
    const at = bomb.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    bomb.writeUInt32LE(5_000_000, bomb.readUInt32LE(at + 16) + 24)
    expect(bomb.length * IMPORT_ENGINEERING_LIMITS.maxCompressionRatio).toBeLessThan(5_000_000)
    expect(await refusals(bomb)).toEqual({
      browser: 'WORKBOOK_DECOMPRESSION_LIMIT',
      server: 'WORKBOOK_DECOMPRESSION_LIMIT',
    })
    const crowded = workbook({ Data: [['Name'], ['Ana']] })
    const eocd = crowded.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    crowded.writeUInt16LE(IMPORT_ENGINEERING_LIMITS.maxWorkbookEntries + 1, eocd + 10)
    expect(await refusals(crowded)).toEqual({
      browser: 'WORKBOOK_CONTAINER_LIMIT',
      server: 'WORKBOOK_CONTAINER_LIMIT',
    })
  })

  it('refuses a several-sheet workbook with no sheet chosen, and too many sheets', async () => {
    const two = workbook({ First: [['A'], ['one']], Second: [['B'], ['two']] })
    expect(await refusals(two)).toEqual({
      browser: 'WORKBOOK_SHEET_AMBIGUOUS',
      server: 'WORKBOOK_SHEET_AMBIGUOUS',
    })
    const sheets = Object.fromEntries(
      Array.from({ length: IMPORT_ENGINEERING_LIMITS.maxWorkbookSheets + 1 }, (_, index) => [
        `S${index}`,
        [['A'], [index]],
      ]),
    )
    expect(await refusals(workbook(sheets), 'S0')).toEqual({
      browser: 'WORKBOOK_SHEET_LIMIT',
      server: 'WORKBOOK_SHEET_LIMIT',
    })
  })
})
