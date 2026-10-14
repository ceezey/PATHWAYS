import { Controller, Get, Header, Inject, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { AnalyticsInsightsService } from './analytics-insights.service'

@Controller('analytics/insights')
export class AnalyticsInsightsController {
  constructor(
    @Inject(AnalyticsInsightsService) private readonly service: AnalyticsInsightsService,
  ) {}

  @Get('participation')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.descriptive.read')
  participation(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.participation(requestIdentity(request), query)
  }

  @Get('indicator-trends')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.descriptive.read')
  indicatorTrends(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.indicatorTrends(requestIdentity(request), query)
  }

  @Get('budget')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.descriptive.read')
  budget(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.budget(requestIdentity(request), query)
  }
}
