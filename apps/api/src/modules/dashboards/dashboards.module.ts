import { Module } from '@nestjs/common'
import { IndicatorsModule } from '../indicators/indicators.module'
import { AnalyticsController } from './analytics.controller'
import { AnalyticsService } from './analytics.service'
import { DashboardsController } from './dashboards.controller'
import { DashboardsService } from './dashboards.service'
@Module({
  imports: [IndicatorsModule],
  controllers: [DashboardsController, AnalyticsController],
  providers: [DashboardsService, AnalyticsService],
  exports: [DashboardsService],
})
export class DashboardsModule {}
