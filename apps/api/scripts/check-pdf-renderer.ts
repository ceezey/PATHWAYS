/**
 * Renders one report page and one receipt page through the real Chromium pipeline.
 * Needs WEB_ORIGIN and, off Linux, PDF_CHROME_PATH; no database and no running API.
 * Run with: pnpm --filter @pathways/api exec tsx scripts/check-pdf-renderer.ts
 */
import { config } from 'dotenv'
import { PrintPdfRenderer } from '../src/modules/report-pdf/print-pdf.renderer'
import { ReceiptPdfRenderer } from '../src/modules/report-pdf/receipt-pdf.renderer'
import { ReportPdfRenderer } from '../src/modules/report-pdf/report-pdf.renderer'

config()

const id = '11111111-1111-4111-8111-111111111111'
const print = new PrintPdfRenderer()

async function main() {
  const checks: Array<[string, () => Promise<Buffer>]> = [
    [
      'report',
      () =>
        new ReportPdfRenderer(print).render(id, {
          title: 'Renderer check',
          kind: 'INDICATOR_SUMMARY',
          columns: ['Code', 'Indicator', 'Current'],
          rows: [['ALS-ENROLLED', 'Out-of-school learners enrolled', '287']],
          generatedAt: new Date().toISOString(),
          unavailableReasons: [],
        }),
    ],
    [
      'receipt',
      () =>
        new ReceiptPdfRenderer(print).render(id, {
          receiptNo: 'DR-CHECK',
          issuedAt: new Date().toISOString(),
          organization: 'Renderer check',
          project: { code: 'CHK', title: 'Renderer check' },
          activity: null,
          budgetLine: 'Activity budget',
          allocated: '0.00',
          expense: {
            description: 'Renderer check',
            amount: '1.00',
            currency: 'PHP',
            date: '2026-10-06',
            status: 'APPROVED',
          },
          people: {
            submitted: { name: 'Check', at: null },
            verified: { name: null, at: null },
            approved: { name: null, at: null },
            signedOff: { name: null, at: null },
          },
          attachment: null,
        }),
    ],
  ]

  let failed = false
  for (const [name, run] of checks) {
    try {
      const bytes = await run()
      const ok = bytes.subarray(0, 5).toString() === '%PDF-'
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${bytes.length} bytes`)
      failed ||= !ok
    } catch (error) {
      const stage = (error as { stage?: string }).stage ?? 'unknown'
      console.log(`FAIL ${name}: failed at ${stage} (${(error as Error).message})`)
      failed = true
    }
  }
  await print.onModuleDestroy()
  process.exit(failed ? 1 : 0)
}

void main()
