import { Controller, Get, Header, Inject, Param, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { IndicatorsService } from './indicators.service'

/** KPI values for monitoring.read plus reports.indicator.read holders; definitions stay behind indicators.read. */
@Controller('projects/:projectId/indicator-values')
export class IndicatorValuesController {
  constructor(@Inject(IndicatorsService) private readonly service: IndicatorsService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('monitoring.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.service.listReleased(requestIdentity(request), projectId)
  }
}
