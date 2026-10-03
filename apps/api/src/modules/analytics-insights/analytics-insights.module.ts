import { Module } from '@nestjs/common'
import { AnalyticsInsightsController } from './analytics-insights.controller'
import { AnalyticsInsightsService } from './analytics-insights.service'

@Module({
  controllers: [AnalyticsInsightsController],
  providers: [AnalyticsInsightsService],
})
export class AnalyticsInsightsModule {}
