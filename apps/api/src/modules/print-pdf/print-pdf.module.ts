import { Module } from '@nestjs/common'
import { ReceiptPdfRenderer } from '../finance/receipt-pdf.renderer'
import { ReportPdfRenderer } from '../reports/report-pdf.renderer'
import { PrintPdfRenderer } from './print-pdf.renderer'

@Module({
  providers: [PrintPdfRenderer, ReportPdfRenderer, ReceiptPdfRenderer],
  exports: [ReportPdfRenderer, ReceiptPdfRenderer],
})
export class ReportPdfModule {}
