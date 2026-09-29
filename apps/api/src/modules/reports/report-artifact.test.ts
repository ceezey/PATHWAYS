import { describe, expect, it } from 'vitest'
import { createReportArtifact, safeSpreadsheetCell } from './report-artifact'

describe('bounded truthful report artifacts', () => {
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
    expect(safeSpreadsheetCell(' \t+4')).toBe("' \t+4")
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
