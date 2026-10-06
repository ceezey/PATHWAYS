import { Controller, ForbiddenException, Get, Header, Inject, Param, Req } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
import { IndicatorsService } from './indicators.service'

/** KPI values for monitoring.read plus reports.indicator.read holders; definitions stay behind indicators.read. */
@Controller('projects/:projectId/indicator-values')
export class IndicatorValuesController {
  constructor(@Inject(IndicatorsService) private readonly service: IndicatorsService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('monitoring.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    if (!request.user) throw new ForbiddenException('Application profile is required.')
    return this.service.listReleased(request.user, projectId)
  }
}
