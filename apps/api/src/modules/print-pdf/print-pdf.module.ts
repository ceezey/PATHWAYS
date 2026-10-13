import { Module } from '@nestjs/common'
import { PrintPdfRenderer } from './print-pdf.renderer'

@Module({
  providers: [PrintPdfRenderer],
  exports: [PrintPdfRenderer],
})
export class PrintPdfModule {}
