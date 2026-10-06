import { Module } from '@nestjs/common'
import { ReportPdfModule } from '../report-pdf/report-pdf.module'
import { FinanceController } from './finance.controller'
import { FinanceService } from './finance.service'
@Module({
  imports: [ReportPdfModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
