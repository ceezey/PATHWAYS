import { Module } from '@nestjs/common'
import { DashboardsModule } from '../dashboards/dashboards.module'
import { ReportPdfModule } from '../report-pdf/report-pdf.module'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  imports: [DashboardsModule, ReportPdfModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
