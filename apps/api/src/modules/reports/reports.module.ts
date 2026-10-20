import { Module } from '@nestjs/common'
import { DashboardsModule } from '../dashboards/dashboards.module'
import { PrintPdfModule } from '../print-pdf/print-pdf.module'
import { ProjectsModule } from '../projects/projects.module'
import { RulesHumanModule } from '../rules/rules-human.module'
import { ReportPdfRenderer } from './report-pdf.renderer'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  imports: [DashboardsModule, ProjectsModule, PrintPdfModule, RulesHumanModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportPdfRenderer],
})
export class ReportsModule {}
