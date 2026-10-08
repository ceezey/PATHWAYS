import { Module } from '@nestjs/common'
import { IndicatorsModule } from '../indicators/indicators.module'
import { RulesHumanModule } from '../rules/rules-human.module'
import { ActionCountsController } from './action-counts.controller'
import { ActionCountsService } from './action-counts.service'
import { AnalyticsController } from './analytics.controller'
import { AnalyticsService } from './analytics.service'
import { DashboardsController } from './dashboards.controller'
import { DashboardsService } from './dashboards.service'
import { RoleOverviewController } from './role-overview.controller'
import { RoleOverviewService } from './role-overview.service'
@Module({
  imports: [IndicatorsModule, RulesHumanModule],
  controllers: [
    DashboardsController,
    AnalyticsController,
    ActionCountsController,
    RoleOverviewController,
  ],
  providers: [
    DashboardsService,
    AnalyticsService,
    ActionCountsService,
    RoleOverviewService,
  ],
  exports: [DashboardsService],
})
export class DashboardsModule {}
