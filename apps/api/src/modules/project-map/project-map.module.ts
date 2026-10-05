import { Module } from '@nestjs/common'

import { DashboardsModule } from '../dashboards/dashboards.module'
import { IndicatorsModule } from '../indicators/indicators.module'
import { ProjectOverviewMetricsService } from '../projects/project-overview-metrics.service'
import { ProjectMapController } from './project-map.controller'
import { ProjectMapService } from './project-map.service'

@Module({
  imports: [DashboardsModule, IndicatorsModule],
  controllers: [ProjectMapController],
  providers: [ProjectMapService, ProjectOverviewMetricsService],
})
export class ProjectMapModule {}
