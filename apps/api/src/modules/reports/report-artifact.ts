import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toWorkbookBytes } from '@pathways/imports'
import PDFDocument from 'pdfkit'
import { z } from 'zod'

// Bundled deployments keep traced assets at their source path, so the working directory is tried too.
const reportAsset = (name: string) =>
  [
    join(__dirname, 'assets', name),
    join(process.cwd(), 'src', 'modules', 'reports', 'assets', name),
    join(process.cwd(), 'apps', 'api', 'src', 'modules', 'reports', 'assets', name),
  ].find((path) => existsSync(path)) ?? join(__dirname, 'assets', name)

export type ReportFormat = 'CSV' | 'XLSX' | 'XLS' | 'PDF'
export const REPORT_MAX_BYTES = 10 * 1024 * 1024
/** Input the requester can correct; integrity and renderer failures stay plain errors. */
export class ReportArtifactInputError extends Error {}
export const reportMime = {
  CSV: 'text/csv',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  XLS: 'application/vnd.ms-excel',
  PDF: 'application/pdf',
} as const
// Text is never interpreted as a spreadsheet formula or a PDF hyperlink.
export function safeSpreadsheetCell(value: string) {
  return /^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value
}
export function validatedReportRows(rows: string[][]) {
  if (
    !Array.isArray(rows) ||
    rows.length < 1 ||
    rows.length > 1000 ||
    rows.some(
      (row) =>
        !Array.isArray(row) ||
        row.length < 1 ||
        row.length > 30 ||
        row.some((cell) => typeof cell !== 'string' || cell.length > 2000),
    )
  )
    throw new ReportArtifactInputError('Report exceeds supported dimensions.')
  return rows
}
export async function createReportArtifact(
  title: string,
  rows: string[][],
  format: ReportFormat,
): Promise<Buffer> {
  if (!['CSV', 'XLSX', 'XLS', 'PDF'].includes(format))
    throw new ReportArtifactInputError('Unsupported report format.')
  validatedReportRows(rows)
  if (!title.trim() || title.length > 200)
    throw new ReportArtifactInputError('Invalid report title.')
  let bytes: Buffer
  if (format === 'CSV') {
    bytes = Buffer.from(
      `\ufeff${rows.map((row) => row.map((cell) => `"${safeSpreadsheetCell(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n')}\r\n`,
      'utf8',
    )
  } else if (format === 'XLSX' || format === 'XLS') {
    bytes = Buffer.from(
      toWorkbookBytes(
        rows.map((row) => row.map(safeSpreadsheetCell)),
        format.toLowerCase() as 'xlsx' | 'xls',
      ),
    )
  } else {
    const font = readFileSync(reportAsset('NotoSans-Regular.ttf'))
    if (
      createHash('sha256').update(font).digest('hex') !==
      'b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5'
    )
      throw new Error('Report font integrity unavailable.')
    const coverageBytes = readFileSync(reportAsset('NotoSans-Regular.coverage.json'))
    if (
      createHash('sha256').update(coverageBytes).digest('hex') !==
      '9c6ab5f368727f0fec5219301ec5f42888065cd266871ed089eba0b9e002974c'
    )
      throw new Error('Report font coverage integrity unavailable.')
    const coverage = z
      .object({
        fontSha256: z.literal('b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5'),
        ranges: z
          .array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]))
          .max(100),
      })
      .strict()
      .parse(JSON.parse(coverageBytes.toString('utf8')))
    for (const text of [title, ...rows.flat()])
      for (const char of text) {
        const point = char.codePointAt(0)
        if (
          point === undefined ||
          (point >= 0xd800 && point <= 0xdfff) ||
          (point < 32 && ![9, 10, 13].includes(point)) ||
          point === 127 ||
          (![9, 10, 13].includes(point) &&
            !coverage.ranges.some(([start, end]) => point >= start && point <= end))
        )
          throw new ReportArtifactInputError(
            'PDF contains a character unsupported by the bundled font. Choose a spreadsheet format or revise the text.',
          )
      }
    bytes = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 44,
        tagged: true,
        pdfVersion: '1.7',
        displayTitle: true,
        lang: 'en-PH',
        info: { Title: title, Author: 'PATHWAYS', Subject: 'Authorized project report' },
      })
      const chunks: Buffer[] = []
      let total = 0
      let pages = 1
      let failed = false
      const fail = (error: Error) => {
        if (!failed) {
          failed = true
          reject(error)
          doc.destroy()
        }
      }
      doc.on('data', (chunk: Buffer) => {
        total += chunk.length
        if (total > REPORT_MAX_BYTES)
          fail(new ReportArtifactInputError('Report exceeds supported size.'))
        else chunks.push(chunk)
      })
      doc.on('error', () => fail(new Error('Report generation unavailable.')))
      doc.on('end', () => {
        if (!failed) resolve(Buffer.concat(chunks))
      })
      doc.on('pageAdded', () => {
        if (++pages > 50) fail(new ReportArtifactInputError('Report exceeds supported page count.'))
      })
      doc.font(font).fontSize(17).fillColor('#0B2E4F')
      doc.addStructure(
        doc.struct('H1', {}, () => {
          doc.text(`${title} `)
        }),
      )
      doc.moveDown().fontSize(9).fillColor('#172B3A')
      rows.forEach((row, index) => {
        if (failed) return
        // A labelled paragraph provides a linear, unambiguous reading order across wrapped rows.
        const label = index === 0 ? 'Columns' : `Row ${index}`
        doc.addStructure(
          doc.struct('P', {}, () => {
            doc.text(`${label}: ${row.join(' | ')} `, { lineGap: 3 })
            doc.moveDown(0.55)
          }),
        )
      })
      if (!failed) doc.end()
    })
  }
  if (!bytes.length || bytes.length > REPORT_MAX_BYTES)
    throw new ReportArtifactInputError('Report exceeds supported size.')
  return bytes
}
