import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { RulesHumanService } from './rules-human.service'
@Controller('rules')
export class RulesController {
  constructor(@Inject(RulesHumanService) private readonly service: RulesHumanService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.read')
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.listRules(requestIdentity(request), query)
  }
  @Post()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.create')
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.createRule(requestIdentity(request), body)
  }
  @Post('dry-run')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.read')
  dryRun(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.dryRun(requestIdentity(request), body)
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.read')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getRule(requestIdentity(request), id)
  }
  @Post(':id/drafts')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.update')
  draft(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.draftRule(requestIdentity(request), id, body)
  }
  @Post(':id/activate')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.activate')
  activate(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.activateRule(requestIdentity(request), id, body)
  }
  @Post(':id/archive')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.update')
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.archiveRule(requestIdentity(request), id, body)
  }
}
@Controller('alerts')
export class AlertsController {
  constructor(@Inject(RulesHumanService) private readonly service: RulesHumanService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.read')
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.listAlerts(requestIdentity(request), query)
  }
  // Declared before ':id' so the fixed segment is not captured as an identifier.
  @Get('escalated')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.read')
  escalated(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.listEscalatedAlerts(requestIdentity(request), query)
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.read')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getAlert(requestIdentity(request), id)
  }
  @Get(':id/history')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.read')
  history(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Query() query: unknown) {
    return this.service.alertHistory(requestIdentity(request), id, query)
  }
  @Post(':id/review')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.review')
  review(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.reviewAlert(requestIdentity(request), id, body)
  }
  @Post(':id/disposition')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.outcome.record')
  disposition(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.dispositionAlert(requestIdentity(request), id, body)
  }
  @Post(':id/outcome-preview')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.outcome.record')
  preview(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.previewAlert(requestIdentity(request), id, body)
  }
  @Post(':id/outcomes')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.outcome.record')
  confirm(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.confirmAlert(requestIdentity(request), id, body)
  }
}
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
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(RulesHumanService) private readonly service: RulesHumanService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.read')
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.listNotifications(requestIdentity(request), query)
  }
  @Post(':id/read')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.read')
  read(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.readNotification(requestIdentity(request), id, body)
  }
}
