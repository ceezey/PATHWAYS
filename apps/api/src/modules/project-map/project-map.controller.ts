import { Controller, ForbiddenException, Get, Header, Inject, Req } from '@nestjs/common'

import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
import { ProjectMapService } from './project-map.service'

@Controller('analytics/project-map')
export class ProjectMapController {
  constructor(@Inject(ProjectMapService) private readonly service: ProjectMapService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('projects.read')
  read(@Req() request: AuthenticatedRequest) {
    if (!request.user) throw new ForbiddenException('Application profile is required.')
    return this.service.read(request.user)
  }
}
