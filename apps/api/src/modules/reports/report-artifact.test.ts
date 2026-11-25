import { parseWorkbook, readImportFile } from '@pathways/imports'
import PDFDocument from 'pdfkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReportArtifact, reportMime } from './report-artifact'

const label = 'Confidential. Exported by Ana Reyes on 2026-11-26 00:30 (Asia/Manila).'
const arrayBuffer = (bytes: Buffer) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

describe('bounded truthful report artifacts', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends the bare CSV mime accepted by the private bucket allow-list', () => {
    expect(reportMime.CSV).toBe('text/csv')
  })
  it.each(['漢字', '🙂', '\ud800', '\u0000'])(
    'rejects unsupported or unsafe PDF text %s without silently losing glyphs',
    async (value) => {
      await expect(createReportArtifact('Title', [[value]], 'PDF', label)).rejects.toThrow(
        'unsupported',
      )
    },
  )
  it('rejects unknown formats rather than silently emitting PDF', async () => {
    await expect(createReportArtifact('Title', [['row']], 'TXT' as 'PDF', label)).rejects.toThrow(
      'Unsupported report format',
    )
  })
  it('aborts genuine long PDF output at the fifty-page bound', async () => {
    await expect(
      createReportArtifact(
        'Long report',
        Array.from({ length: 1000 }, () => ['Long text '.repeat(150)]),
        'PDF',
        label,
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
      label,
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
        label,
      )
      expect(bytes.subarray(0, format === 'XLSX' ? 2 : 8).toString('hex')).toBe(
        format === 'XLSX' ? '504b' : 'd0cf11e0a1b11ae1',
      )
    },
  )
  it('abuse: CSV, XLSX and XLS quote stored formula-like text exactly once', async () => {
    const risky = ['+639170000001', '=1+1', '@x', '-x']
    const rows = [['Value'], ...risky.map((value) => [value])]
    const csv = (await createReportArtifact('Title', rows, 'CSV', label)).toString('utf8')
    for (const value of risky) expect(csv).toContain(`"'${value}"`)
    for (const format of ['XLSX', 'XLS'] as const) {
      const bytes = await createReportArtifact('Title', rows, format, label)
      const workbook = parseWorkbook(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      )
      expect(workbook.rows.slice(1).map((row) => row[label])).toEqual(
        risky.map((value) => `'${value}`),
      )
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
      label,
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
        label,
      ),
    ).rejects.toThrow('dimensions')
    await expect(createReportArtifact('title', [['x'.repeat(2001)]], 'PDF', label)).rejects.toThrow(
      'dimensions',
    )
    await expect(
      createReportArtifact('title', [Array(31).fill('x')], 'XLSX', label),
    ).rejects.toThrow('dimensions')
  })
  describe('confidentiality label', () => {
    const table = [
      ['Code', 'Name', 'Value'],
      ['SYN', 'Synthetic', '4'],
    ]
    const hostile = 'Confidential. Exported by =cmd, "Ana" <b> on 2026-11-26 00:30 (Asia/Manila).'

    it('is the first CSV line after the byte-order mark, then the header row', async () => {
      const text = (await createReportArtifact('Title', table, 'CSV', label)).toString('utf8')
      expect(text.startsWith(`\ufeff"${label}"\r\n"Code","Name","Value"\r\n`)).toBe(true)
    })
    it('stays one quoted cell when the name carries a comma, quotes, brackets or a formula', async () => {
      const text = (await createReportArtifact('Title', table, 'CSV', hostile)).toString('utf8')
      const first = text.slice(1).split('\r\n')[0]
      expect(first).toBe(`"${hostile.replaceAll('"', '""')}"`)
    })
    it.each(['XLSX', 'XLS'] as const)(
      'is cell A1 of the %s with the header row below',
      async (format) => {
        const bytes = await createReportArtifact('Title', table, format, label)
        const sheet = parseWorkbook(arrayBuffer(bytes))
        expect(sheet.headers[0]).toBe(label)
        expect(Object.values(sheet.rows[0] ?? {})).toEqual(table[0])
      },
    )
    it('lets the import reader find the header row below the label', async () => {
      const csv = await createReportArtifact('Title', table, 'CSV', label)
      const xlsx = await createReportArtifact('Title', table, 'XLSX', label)
      for (const [bytes, type] of [
        [csv, 'CSV'],
        [xlsx, 'XLSX'],
      ] as const) {
        const read = readImportFile(arrayBuffer(bytes), type, null)
        expect(read.headerRowNumber).toBe(2)
        expect(read.titleRows).toBe(true)
        expect(read.sourceColumns.map((column) => column.header)).toEqual(table[0])
      }
    })

    // PDF text is glyph ids in a subset font, so the test records the label draws and the pages they land on.
    const spyOnLabelDraws = (text: string) => {
      const original = PDFDocument.prototype.text
      const draws: Array<{ page: unknown; pagesThen: number }> = []
      vi.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (
        this: PDFKit.PDFDocument,
        ...args: Parameters<typeof original>
      ) {
        if (args[0] === text)
          draws.push({ page: this.page, pagesThen: this.bufferedPageRange().count })
        return original.apply(this, args)
      })
      return draws
    }
    const pdfPageCount = (bytes: Buffer) =>
      bytes.toString('latin1').match(/\/Type \/Page\b(?!s)/g)?.length
    const manyRows = [
      ['Code', 'Note'],
      ...Array.from({ length: 120 }, (_, index) => [`R${index}`, 'Long text '.repeat(20)]),
    ]

    it('is drawn once on every page of a multi-page PDF without adding a page', async () => {
      const draws = spyOnLabelDraws(label)
      const bytes = await createReportArtifact('Title', manyRows, 'PDF', label)
      const pages = pdfPageCount(bytes) ?? 0
      expect(pages).toBeGreaterThan(1)
      expect(draws).toHaveLength(pages)
      expect(new Set(draws.map((draw) => draw.page)).size).toBe(pages)
      // Every draw saw the full page count, so the footer itself never added a page.
      expect(draws.every((draw) => draw.pagesThen === pages)).toBe(true)
    })
    it('is drawn on the only page of a one-page PDF without adding a second', async () => {
      const draws = spyOnLabelDraws(label)
      const bytes = await createReportArtifact('Title', table, 'PDF', label)
      expect(pdfPageCount(bytes)).toBe(1)
      expect(draws).toHaveLength(1)
    })
    it('keeps a very long label to one footer line, so it still adds no page', async () => {
      const long = `Confidential. Exported by ${'Maria Clara de los Santos '.repeat(12)}on 2026-11-26 00:30 (Asia/Manila).`
      const draws = spyOnLabelDraws(long)
      const bytes = await createReportArtifact('Title', table, 'PDF', long)
      expect(pdfPageCount(bytes)).toBe(1)
      expect(draws).toHaveLength(1)
    })
    it('rejects a PDF label the bundled font cannot draw', async () => {
      await expect(
        createReportArtifact('Title', table, 'PDF', 'Confidential. Exported by 漢字.'),
      ).rejects.toThrow('unsupported')
    })
  })
})
