import { Module } from '@nestjs/common'

import { DashboardsModule } from '../dashboards/dashboards.module'
import { ProjectsModule } from '../projects/projects.module'
import { ProjectMapController } from './project-map.controller'
import { ProjectMapService } from './project-map.service'

@Module({
  imports: [DashboardsModule, ProjectsModule],
  controllers: [ProjectMapController],
  providers: [ProjectMapService],
})
export class ProjectMapModule {}
