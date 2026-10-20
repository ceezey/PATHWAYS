import { Controller, Get, Inject, Param, Req } from '@nestjs/common'

import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ProjectOverviewMetricsService } from './project-overview-metrics.service'

@Controller('projects/:projectId/overview-metrics')
export class ProjectOverviewMetricsController {
  constructor(
    @Inject(ProjectOverviewMetricsService)
    private readonly metrics: ProjectOverviewMetricsService,
  ) {}

  @Get()
  @RequirePermission('projects.read')
  read(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.metrics.read(requestIdentity(request), projectId)
  }
}
