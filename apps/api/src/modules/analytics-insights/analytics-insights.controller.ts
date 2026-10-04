import { Controller, ForbiddenException, Get, Header, Inject, Query, Req } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
import { AnalyticsInsightsService } from './analytics-insights.service'

function identity(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}

@Controller('analytics/insights')
export class AnalyticsInsightsController {
  constructor(
    @Inject(AnalyticsInsightsService) private readonly service: AnalyticsInsightsService,
  ) {}

  @Get('participation')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.descriptive.read')
  participation(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.participation(identity(request), query)
  }

  @Get('indicator-trends')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.descriptive.read')
  indicatorTrends(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.indicatorTrends(identity(request), query)
  }

  @Get('budget')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('analytics.descriptive.read')
  budget(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.budget(identity(request), query)
  }
}
