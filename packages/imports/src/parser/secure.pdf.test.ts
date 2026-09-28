import { describe, expect, it } from 'vitest'

import { IMPORT_ENGINEERING_LIMITS } from '../limits'
import { type PdfTextItem, reconstructPdfTable } from './pdf-table'
import { parseSecureImport } from './secure'

interface PlacedText {
  x: number
  y: number
  text: string
}

interface PdfFixtureOptions {
  encrypt?: boolean
  activeContent?: boolean
  pagesWithoutText?: boolean
}

function escapePdfText(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

/** Builds a small synthetic, uncompressed PDF so no binary fixture is committed. */
function buildPdf(pages: PlacedText[][], options: PdfFixtureOptions = {}) {
  const objects: string[] = []
  const add = (body: string) => {
    objects.push(body)
    return objects.length
  }
  const catalogId = add('')
  const pagesId = add('')
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const pageIds: number[] = []
  for (const texts of pages) {
    const content = options.pagesWithoutText
      ? '0.5 g 20 20 400 600 re f'
      : texts
          .map(
            (item) =>
              `BT /F1 10 Tf 1 0 0 1 ${item.x} ${item.y} Tm (${escapePdfText(item.text)}) Tj ET`,
          )
          .join('\n')
    const contentId = add(
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    )
    const annotations = options.activeContent
      ? ' /Annots [<< /Type /Annot /Subtype /Link /Rect [0 0 50 50] /A << /S /URI /URI (https://example.invalid/) >> >>]'
      : ''
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R${annotations} >>`,
      ),
    )
  }
  let activeCatalog = ''
  if (options.activeContent) {
    const attachment = 'synthetic attachment'
    const fileId = add(
      `<< /Type /EmbeddedFile /Length ${attachment.length} >>\nstream\n${attachment}\nendstream`,
    )
    const specId = add(`<< /Type /Filespec /F (a.txt) /EF << /F ${fileId} 0 R >> >>`)
    const scriptId = add('<< /S /JavaScript /JS (globalThis.pathwaysPdfScriptRan = true) >>')
    activeCatalog = ` /OpenAction ${scriptId} 0 R /Names << /EmbeddedFiles << /Names [(a.txt) ${specId} 0 R] >> /JavaScript << /Names [(run) ${scriptId} 0 R] >> >> /AcroForm << /Fields [] >>`
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R${activeCatalog} >>`
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  let encryptRef = ''
  if (options.encrypt) {
    const hex = (byte: string) => byte.repeat(32)
    const encryptId = add(
      `<< /Filter /Standard /V 1 /R 2 /O <${hex('ab')}> /U <${hex('cd')}> /P -44 >>`,
    )
    encryptRef = ` /Encrypt ${encryptId} 0 R /ID [<${'01'.repeat(16)}> <${'01'.repeat(16)}>]`
  }

  let output = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output, 'latin1'))
    output += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(output, 'latin1')
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) output += `${String(offset).padStart(10, '0')} 00000 n \n`
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R${encryptRef} >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(output, 'latin1')
}

function tablePage(rows: string[][], top = 720, columns = [50, 200, 350]) {
  return rows.flatMap((row, rowIndex) =>
    row.map((text, columnIndex) => ({ x: columns[columnIndex], y: top - rowIndex * 18, text })),
  )
}

describe('text-layer PDF import', () => {
  it('reconstructs rows from baselines and columns from the header positions', async () => {
    const pdf = buildPdf([
      [
        { x: 50, y: 760, text: 'Attendance register' },
        ...tablePage([
          ['beneficiary_code', 'attendance_status', 'score'],
          ['BEN-001', 'present', '12'],
          ['BEN-002', '', '9'],
        ]),
      ],
      tablePage([
        ['beneficiary_code', 'attendance_status', 'score'],
        ['BEN-003', 'absent', '-4'],
      ]),
    ])

    const parsed = await parseSecureImport(pdf, 'PDF')

    expect(parsed.sourceColumns).toEqual([
      { key: 'column_0001', header: 'beneficiary_code', columnIndex: 1 },
      { key: 'column_0002', header: 'attendance_status', columnIndex: 2 },
      { key: 'column_0003', header: 'score', columnIndex: 3 },
    ])
    expect(parsed.rows).toEqual([
      {
        sourceRowNumber: 2,
        values: { column_0001: 'BEN-001', column_0002: 'present', column_0003: '12' },
      },
      {
        sourceRowNumber: 3,
        values: { column_0001: 'BEN-002', column_0002: null, column_0003: '9' },
      },
      {
        sourceRowNumber: 4,
        values: { column_0001: 'BEN-003', column_0002: 'absent', column_0003: '-4' },
      },
    ])
    expect(parsed.sheetNames).toEqual([])
  }, 20_000)

  it('produces identical output for identical input', async () => {
    const pdf = buildPdf([
      tablePage([
        ['a', 'b'],
        ['1', '2'],
      ]),
    ])
    const first = await parseSecureImport(pdf, 'PDF')
    const second = await parseSecureImport(pdf, 'PDF')
    expect(second).toEqual(first)
  }, 20_000)

  it('rejects a PDF without a text layer with the scanned-PDF message', async () => {
    await expect(
      parseSecureImport(buildPdf([[]], { pagesWithoutText: true }), 'PDF'),
    ).rejects.toMatchObject({
      code: 'PDF_NO_TEXT_LAYER',
      message:
        'This PDF has no text layer. Scanned PDFs are not supported; export the data as CSV or XLSX.',
    })
  }, 20_000)

  it('rejects a PDF whose text has no header line with consistent columns', async () => {
    const pdf = buildPdf([[{ x: 50, y: 700, text: 'Only a paragraph of prose.' }]])
    await expect(parseSecureImport(pdf, 'PDF')).rejects.toMatchObject({
      code: 'PDF_TABLE_UNRECOGNIZED',
    })
  }, 20_000)

  it('rejects password-protected PDFs', async () => {
    const pdf = buildPdf(
      [
        tablePage([
          ['a', 'b'],
          ['1', '2'],
        ]),
      ],
      { encrypt: true },
    )
    await expect(parseSecureImport(pdf, 'PDF')).rejects.toMatchObject({ code: 'PDF_ENCRYPTED' })
  }, 20_000)

  it('reads only the text layer of a PDF carrying scripts, attachments, forms and links', async () => {
    const pdf = buildPdf(
      [
        tablePage([
          ['name', 'value'],
          ['x', '1'],
        ]),
      ],
      { activeContent: true },
    )
    const parsed = await parseSecureImport(pdf, 'PDF')
    expect(parsed.rows).toEqual([
      { sourceRowNumber: 2, values: { column_0001: 'x', column_0002: '1' } },
    ])
    expect((globalThis as Record<string, unknown>).pathwaysPdfScriptRan).toBeUndefined()
  }, 20_000)

  it('rejects PDFs over the page bound', async () => {
    const page = tablePage([
      ['a', 'b'],
      ['1', '2'],
    ])
    const pdf = buildPdf(
      Array.from({ length: IMPORT_ENGINEERING_LIMITS.maxPdfPages + 1 }, () => page),
    )
    await expect(parseSecureImport(pdf, 'PDF')).rejects.toMatchObject({ code: 'PDF_PAGE_LIMIT' })
  }, 20_000)

  it('rejects oversized PDFs before parsing', async () => {
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      Buffer.alloc(IMPORT_ENGINEERING_LIMITS.maxBytes, 0x20),
    ])
    await expect(parseSecureImport(pdf, 'PDF')).rejects.toMatchObject({ code: 'FILE_SIZE_LIMIT' })
  })

  it('rejects files that do not start with the PDF signature', async () => {
    await expect(parseSecureImport(Buffer.from('name,value\n'), 'PDF')).rejects.toMatchObject({
      code: 'FILE_SIGNATURE_INVALID',
    })
  })

  it('applies the formula guard to PDF cells', async () => {
    const pdf = buildPdf([
      tablePage([
        ['name', 'value'],
        ['x', '=HYPERLINK(1)'],
      ]),
    ])
    await expect(parseSecureImport(pdf, 'PDF')).rejects.toMatchObject({
      code: 'CELL_FORMULA_UNSAFE',
    })
  }, 20_000)
})

describe('reconstructPdfTable', () => {
  const item = (page: number, x: number, y: number, text: string, width = 30): PdfTextItem => [
    page,
    x,
    y,
    width,
    10,
    text,
  ]

  it('joins split words inside one cell and keeps separate columns apart', () => {
    expect(
      reconstructPdfTable([
        item(1, 50, 700, 'first', 22),
        item(1, 75, 700, 'name', 20),
        item(1, 200, 700, 'age'),
        item(1, 50, 682, 'Ana', 15),
        item(1, 68, 682, 'Cruz', 20),
        item(1, 200, 682, '31'),
      ]),
    ).toEqual([
      ['first name', 'age'],
      ['Ana Cruz', '31'],
    ])
  })

  it('tolerates small baseline jitter and strips control characters', () => {
    expect(
      reconstructPdfTable([
        item(1, 50, 700, 'a'),
        item(1, 200, 700.8, 'b'),
        item(1, 50, 682, '1\u0000'),
        item(1, 200, 681.5, '2'),
      ]),
    ).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('rejects data left of the first header column', () => {
    expect(() =>
      reconstructPdfTable([item(1, 100, 700, 'a'), item(1, 250, 700, 'b'), item(1, 10, 682, 'x')]),
    ).toThrow('PDF_TABLE_UNRECOGNIZED')
  })

  it('reports no text layer for whitespace-only items', () => {
    expect(() => reconstructPdfTable([item(1, 50, 700, '   ')])).toThrow('PDF_NO_TEXT_LAYER')
  })
})
