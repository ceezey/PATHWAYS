import { Controller, ForbiddenException, Get, Header, Inject, Query, Req } from '@nestjs/common'
import { RequirePermission } from '@app/common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '@app/modules/auth/developer-access'
import { DashboardsService } from './dashboards.service'
function identity(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}
@Controller('dashboards')
export class DashboardsController {
  constructor(@Inject(DashboardsService) private readonly service: DashboardsService) {}
  @Get('home')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.read')
  home(@Req() request: AuthenticatedRequest, @Query() query: unknown) { return this.service.monitoring(identity(request), query) }
  @Get('monitoring')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.read')
  monitoring(@Req() request: AuthenticatedRequest, @Query() query: unknown) { return this.service.monitoring(identity(request), query) }
  @Get('saddd')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.read')
  saddd(@Req() request: AuthenticatedRequest, @Query() query: unknown) { return this.service.saddd(identity(request), query) }
}
