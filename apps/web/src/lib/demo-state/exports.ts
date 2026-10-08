import { toWorkbookBytes } from '@pathways/imports'

type ExportFormat = 'csv' | 'xlsx' | 'xls' | 'pdf'
const safeCell = (value: string) => (/^[=+@-]/.test(value) ? `'${value}` : value)
const ascii = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/[\\()]/g, '\\$&')

/** Small standards-compliant paginated PDF writer using the built-in Helvetica font. */
function toPdfBytes(title: string, rows: string[][]): Uint8Array {
  const lines = [
    title,
    'PATHWAYS',
    '',
    ...rows.flatMap((row) => {
      const text = row.join(' | ')
      return text.match(/.{1,95}/g) ?? ['']
    }),
  ]
  const pages: string[][] = []
  for (let i = 0; i < lines.length; i += 46) pages.push(lines.slice(i, i + 46))
  const objects: string[] = [
    '',
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  const kids: string[] = []
  pages.forEach((page, index) => {
    const pageId = objects.length
    const contentId = pageId + 1
    kids.push(`${pageId} 0 R`)
    const stream = `BT /F1 10 Tf 45 795 Td 15 TL\n${page.map((line) => `(${ascii(line)}) Tj T*`).join('\n')}\nET\nBT /F1 9 Tf 45 25 Td (Page ${index + 1} of ${pages.length}) Tj ET`
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    )
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })
  objects[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = pdf.length
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}
export function artifactBytes(title: string, rows: string[][], format: ExportFormat) {
  const cells = rows.map((row) => row.map((value) => safeCell(String(value ?? ''))))
  if (format === 'pdf') return toPdfBytes(title, cells)
  if (format === 'csv')
    return new TextEncoder().encode(
      `\ufeff${cells.map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(',')).join('\r\n')}`,
    )
  return toWorkbookBytes(cells, format)
}
