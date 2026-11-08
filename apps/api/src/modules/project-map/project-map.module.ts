import { Module } from '@nestjs/common'

import { DashboardsModule } from '../dashboards/dashboards.module'
import { ProjectsModule } from '../projects/projects.module'
import { ProjectMapPinsController } from './project-map-pins.controller'
import { ProjectMapPinsService } from './project-map-pins.service'
import { ProjectMapController } from './project-map.controller'
import { ProjectMapService } from './project-map.service'

@Module({
  imports: [DashboardsModule, ProjectsModule],
  controllers: [ProjectMapController, ProjectMapPinsController],
  providers: [ProjectMapService, ProjectMapPinsService],
})
export class ProjectMapModule {}
