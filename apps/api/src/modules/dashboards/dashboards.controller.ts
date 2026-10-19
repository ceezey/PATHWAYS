import { Controller, Get, Header, Inject, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { DashboardsService } from './dashboards.service'
@Controller('dashboards')
export class DashboardsController {
  constructor(@Inject(DashboardsService) private readonly service: DashboardsService) {}
  @Get('home')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('projects.read')
  home(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.home(requestIdentity(request), query)
  }
  @Get('monitoring')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('monitoring.read')
  monitoring(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.monitoring(requestIdentity(request), query)
  }
  @Get('saddd')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.saddd.read')
  saddd(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.saddd(requestIdentity(request), query)
  }
}
