import { Module } from '@nestjs/common'
import { DashboardsModule } from '../dashboards/dashboards.module'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  imports: [DashboardsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
