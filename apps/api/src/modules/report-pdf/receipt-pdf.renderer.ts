import { Inject, Injectable } from '@nestjs/common'
import { PrintPdfError, PrintPdfRenderer } from './print-pdf.renderer'

/** Allowlisted disbursement record fields; nothing else about the expense reaches the page. */
type ReceiptSnapshot = {
  receiptNo: string
  issuedAt: string
  organization: string
  project: { code: string | null; title: string }
  activity: { code: string | null; title: string } | null
  budgetLine: string
  allocated: string | null
  expense: {
    description: string
    amount: string
    currency: string
    date: string
    status: string
  }
  people: {
    submitted: { name: string | null; at: string | null }
    verified: { name: string | null; at: string | null }
    approved: { name: string | null; at: string | null }
    signedOff: { name: string | null; at: string | null }
  }
  attachment: { fileName: string; sha256: string; byteSize: string } | null
}

const expenseIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RECEIPT_MAX_BYTES = 4 * 1024 * 1024

export class ReceiptPdfError extends Error {
  constructor(
    readonly stage: string,
    readonly causeName = 'Error',
  ) {
    super(`Receipt PDF failed at ${stage}.`)
    this.name = 'ReceiptPdfError'
  }
}

@Injectable()
export class ReceiptPdfRenderer {
  constructor(@Inject(PrintPdfRenderer) private readonly print: PrintPdfRenderer) {}

  async render(expenseId: string, snapshot: ReceiptSnapshot): Promise<Buffer> {
    if (!expenseIdPattern.test(expenseId)) throw new ReceiptPdfError('input')
    try {
      return await this.print.render({
        path: `/print/receipts/${expenseId.toLowerCase()}`,
        globalName: '__PATHWAYS_RECEIPT__',
        payload: snapshot,
        maxBytes: RECEIPT_MAX_BYTES,
      })
    } catch (error) {
      if (error instanceof PrintPdfError) throw new ReceiptPdfError(error.stage, error.causeName)
      throw new ReceiptPdfError('print', error instanceof Error ? error.name : undefined)
    }
  }
}
