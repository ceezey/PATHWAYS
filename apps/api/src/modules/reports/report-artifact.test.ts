import { parseWorkbook } from '@pathways/imports'
import { describe, expect, it } from 'vitest'
import { createReportArtifact, reportMime } from './report-artifact'

describe('bounded truthful report artifacts', () => {
  it('sends the bare CSV mime accepted by the private bucket allow-list', () => {
    expect(reportMime.CSV).toBe('text/csv')
  })
  it.each(['漢字', '🙂', '\ud800', '\u0000'])(
    'rejects unsupported or unsafe PDF text %s without silently losing glyphs',
    async (value) => {
      await expect(createReportArtifact('Title', [[value]], 'PDF')).rejects.toThrow('unsupported')
    },
  )
  it('rejects unknown formats rather than silently emitting PDF', async () => {
    await expect(createReportArtifact('Title', [['row']], 'TXT' as 'PDF')).rejects.toThrow(
      'Unsupported report format',
    )
  })
  it('aborts genuine long PDF output at the fifty-page bound', async () => {
    await expect(
      createReportArtifact(
        'Long report',
        Array.from({ length: 1000 }, () => ['Long text '.repeat(150)]),
        'PDF',
      ),
    ).rejects.toThrow('page count')
  })
  it('escapes formula text and quotes without losing Unicode', async () => {
    const bytes = await createReportArtifact(
      'Peña — report',
      [
        ['Name', 'Value'],
        ['Peña — village', '=SUM(1,2)'],
        ['quote "', 'line\nnext'],
      ],
      'CSV',
    )
    const text = bytes.toString('utf8')
    expect(text).toContain('Peña — village')
    expect(text).toContain('"\'=SUM(1,2)"')
    expect(text).toContain('"quote """')
  })
  it.each(['XLSX', 'XLS'] as const)(
    'produces real %s bytes with formula text neutralized',
    async (format) => {
      const bytes = await createReportArtifact(
        'Peña — report',
        [
          ['Name', 'Value'],
          ['Peña — village', '@formula'],
        ],
        format,
      )
      expect(bytes.subarray(0, format === 'XLSX' ? 2 : 8).toString('hex')).toBe(
        format === 'XLSX' ? '504b' : 'd0cf11e0a1b11ae1',
      )
    },
  )
  it('abuse: CSV, XLSX and XLS quote stored formula-like text exactly once', async () => {
    const risky = ['+639170000001', '=1+1', '@x', '-x']
    const rows = [['Value'], ...risky.map((value) => [value])]
    const csv = (await createReportArtifact('Title', rows, 'CSV')).toString('utf8')
    for (const value of risky) expect(csv).toContain(`"'${value}"`)
    for (const format of ['XLSX', 'XLS'] as const) {
      const bytes = await createReportArtifact('Title', rows, format)
      const workbook = parseWorkbook(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      )
      expect(workbook.rows.map((row) => row.Value)).toEqual(risky.map((value) => `'${value}`))
    }
  })
  it('produces an embedded Unicode tagged PDF with title and language', async () => {
    const bytes = await createReportArtifact(
      'Peña — report',
      [
        ['Name', 'Value'],
        ['Peña — village', '5'],
      ],
      'PDF',
    )
    const text = bytes.toString('latin1')
    expect(text.startsWith('%PDF-1.7')).toBe(true)
    expect(text).toContain('/StructTreeRoot')
    expect(text).toContain('/Lang (en-PH)')
    expect(text).toContain('/FontFile2')
    expect(text).toContain('/Title')
  })
  it('rejects excessive dimensions and cell length before serialization', async () => {
    await expect(
      createReportArtifact(
        'title',
        Array.from({ length: 1001 }, () => ['x']),
        'CSV',
      ),
    ).rejects.toThrow('dimensions')
    await expect(createReportArtifact('title', [['x'.repeat(2001)]], 'PDF')).rejects.toThrow(
      'dimensions',
    )
    await expect(createReportArtifact('title', [Array(31).fill('x')], 'XLSX')).rejects.toThrow(
      'dimensions',
    )
  })
})
