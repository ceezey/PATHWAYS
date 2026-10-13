import { Module } from '@nestjs/common'
import { DashboardsModule } from '../dashboards/dashboards.module'
import { ReportPdfModule } from '../print-pdf/print-pdf.module'
import { ProjectsModule } from '../projects/projects.module'
import { RulesHumanModule } from '../rules/rules-human.module'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  imports: [DashboardsModule, ProjectsModule, ReportPdfModule, RulesHumanModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
