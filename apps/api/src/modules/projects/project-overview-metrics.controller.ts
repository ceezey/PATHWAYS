import { Controller, ForbiddenException, Get, Inject, Param, Req } from '@nestjs/common'

import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
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
    if (!request.user) throw new ForbiddenException('Application profile is required.')
    return this.metrics.read(request.user, projectId)
  }
}
