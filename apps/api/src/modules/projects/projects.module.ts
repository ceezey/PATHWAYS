import { Module } from '@nestjs/common'

import { DashboardsModule } from '../dashboards/dashboards.module'
import { IndicatorsModule } from '../indicators/indicators.module'
import { ProjectOverviewMetricsController } from './project-overview-metrics.controller'
import { ProjectOverviewMetricsService } from './project-overview-metrics.service'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'

@Module({
  imports: [DashboardsModule, IndicatorsModule],
  controllers: [ProjectsController, ProjectOverviewMetricsController],
  providers: [ProjectsService, ProjectOverviewMetricsService],
})
export class ProjectsModule {}
