import { Module } from '@nestjs/common'
import { DashboardsModule } from '../dashboards/dashboards.module'
import { AnalyticsInsightsController } from './analytics-insights.controller'
import { AnalyticsInsightsService } from './analytics-insights.service'
import { AnalyticsController } from './analytics.controller'
import { AnalyticsService } from './analytics.service'

@Module({
  imports: [DashboardsModule],
  controllers: [AnalyticsController, AnalyticsInsightsController],
  providers: [AnalyticsService, AnalyticsInsightsService],
})
export class AnalyticsModule {}
