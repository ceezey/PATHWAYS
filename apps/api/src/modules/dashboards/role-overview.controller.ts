import { Controller, ForbiddenException, Get, Header, Inject, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { RoleOverviewService } from './role-overview.service'

@Controller('dashboards')
export class RoleOverviewController {
  constructor(@Inject(RoleOverviewService) private readonly service: RoleOverviewService) {}

  @Get('role-overview')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('projects.read')
  read(@Req() request: AuthenticatedRequest) {
    if (!request.user) throw new ForbiddenException('Application profile is required.')
    return this.service.read(request.user)
  }
}
