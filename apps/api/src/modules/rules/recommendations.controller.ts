import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { RulesHumanService } from './rules-human.service'

@Controller('recommendations')
export class RecommendationsController {
  constructor(@Inject(RulesHumanService) private readonly service: RulesHumanService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('recommendations.read')
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.listRecommendations(requestIdentity(request), query)
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('recommendations.read')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getRecommendation(requestIdentity(request), id)
  }
  @Post(':id/review')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('recommendations.review')
  review(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.reviewRecommendation(requestIdentity(request), id, body)
  }
  @Post(':id/outcome-preview')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('recommendations.outcome.record')
  preview(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.previewRecommendation(requestIdentity(request), id, body)
  }
  @Post(':id/outcomes')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('recommendations.outcome.record')
  confirm(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.confirmRecommendation(requestIdentity(request), id, body)
  }
}
