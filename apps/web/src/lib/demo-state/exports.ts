import { toWorkbookBytes } from '@pathways/imports'
import { demoPolicy, transactDemo } from './store'

export type ExportFormat = 'csv' | 'xlsx' | 'xls' | 'pdf'
export const exportMime: Record<ExportFormat, string> = {
  csv: 'text/csv;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pdf: 'application/pdf',
}
const safeCell = (value: string) => (/^[=+@-]/.test(value) ? `'${value}` : value)
const ascii = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/[\\()]/g, '\\$&')

/** Small standards-compliant paginated PDF writer using the built-in Helvetica font. */
export function toPdfBytes(title: string, rows: string[][]): Uint8Array {
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
export function downloadBytes(bytes: Uint8Array, filename: string, mime: string) {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  const url = URL.createObjectURL(new Blob([buffer], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function exportDemoArtifact(
  title: string,
  rows: string[][],
  format: ExportFormat,
  projectId?: string,
  form = false,
) {
  const bytes = transactDemo(
    form ? 'forms.export' : 'exports.download',
    projectId,
    title,
    (state) => {
      if (state.scenario === 'export-failure')
        throw new Error('Export generation failed. Clear the review scenario and retry.')
      const result = artifactBytes(title, rows, format)
      if (state.scenario === 'export-too-large' || result.byteLength > demoPolicy.exportMaxBytes)
        throw new Error('Export exceeds the 5 MiB limit. Narrow the selected scope.')
      return result
    },
  )
  downloadBytes(
    bytes,
    `${title.replace(/[^a-z0-9-]/gi, '-').slice(0, 80)}.${format}`,
    exportMime[format],
  )
}
