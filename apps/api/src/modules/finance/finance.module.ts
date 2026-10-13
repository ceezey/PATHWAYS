import { Module } from '@nestjs/common'
import { PrintPdfModule } from '../print-pdf/print-pdf.module'
import { FinanceController } from './finance.controller'
import { FinanceService } from './finance.service'
import { ReceiptPdfRenderer } from './receipt-pdf.renderer'
@Module({
  imports: [PrintPdfModule],
  controllers: [FinanceController],
  providers: [FinanceService, ReceiptPdfRenderer],
})
export class FinanceModule {}
