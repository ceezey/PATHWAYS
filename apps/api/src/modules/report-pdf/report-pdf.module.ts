import { Module } from '@nestjs/common'
import { PrintPdfRenderer } from './print-pdf.renderer'
import { ReceiptPdfRenderer } from './receipt-pdf.renderer'
import { ReportPdfRenderer } from './report-pdf.renderer'

@Module({
  providers: [PrintPdfRenderer, ReportPdfRenderer, ReceiptPdfRenderer],
  exports: [ReportPdfRenderer, ReceiptPdfRenderer],
})
export class ReportPdfModule {}
