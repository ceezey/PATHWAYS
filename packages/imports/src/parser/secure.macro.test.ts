import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { type ImportParseError, parseSecureImport } from './secure'

// Builds a macro-enabled workbook in memory so no binary fixture is committed.
function macroWorkbook() {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['score'], [1]]), 'Data')
  workbook.vbaraw = new Uint8Array(Buffer.from('not-a-real-macro'))
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsm', bookVBA: true }))
}

describe('PRD-F6 gates: macro rejection', () => {
  it('G-F6-6: a workbook with a vbaProject part is rejected with the stable active-content message', async () => {
    const bytes = macroWorkbook()
    expect(bytes.toString('latin1')).toContain('xl/vbaProject.bin')

    await expect(parseSecureImport(bytes, 'XLSX')).rejects.toMatchObject({
      code: 'WORKBOOK_ACTIVE_CONTENT',
      message: 'Macros, external links, and embedded objects are forbidden.',
    } satisfies Partial<ImportParseError>)
  })
})
