import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
import { RulesHumanService } from './rules-human.service'
function actor(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}
@Controller('rules')
export class RulesController {
  constructor(@Inject(RulesHumanService) private readonly service: RulesHumanService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.read')
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.listRules(actor(request), query)
  }
  @Post()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.create')
  create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.createRule(actor(request), body)
  }
  @Post('dry-run')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.read')
  dryRun(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.dryRun(actor(request), body)
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.read')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getRule(actor(request), id)
  }
  @Post(':id/drafts')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.update')
  draft(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.draftRule(actor(request), id, body)
  }
  @Post(':id/activate')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.activate')
  activate(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.activateRule(actor(request), id, body)
  }
  @Post(':id/archive')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('rules.update')
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.archiveRule(actor(request), id, body)
  }
}
@Controller('alerts')
export class AlertsController {
  constructor(@Inject(RulesHumanService) private readonly service: RulesHumanService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.read')
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.listAlerts(actor(request), query)
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.read')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getAlert(actor(request), id)
  }
  @Get(':id/history')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.read')
  history(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Query() query: unknown) {
    return this.service.alertHistory(actor(request), id, query)
  }
  @Post(':id/review')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.review')
  review(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.reviewAlert(actor(request), id, body)
  }
  @Post(':id/disposition')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.outcome.record')
  disposition(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.dispositionAlert(actor(request), id, body)
  }
  @Post(':id/outcome-preview')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.outcome.record')
  preview(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.previewAlert(actor(request), id, body)
  }
  @Post(':id/outcomes')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.outcome.record')
  confirm(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.confirmAlert(actor(request), id, body)
  }
}
@Controller('recommendations')
export class RecommendationsController {
  constructor(@Inject(RulesHumanService) private readonly service: RulesHumanService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('recommendations.read')
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.listRecommendations(actor(request), query)
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('recommendations.read')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getRecommendation(actor(request), id)
  }
  @Post(':id/review')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('recommendations.review')
  review(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.reviewRecommendation(actor(request), id, body)
  }
  @Post(':id/outcome-preview')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('recommendations.outcome.record')
  preview(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.previewRecommendation(actor(request), id, body)
  }
  @Post(':id/outcomes')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('recommendations.outcome.record')
  confirm(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.confirmRecommendation(actor(request), id, body)
  }
}
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(RulesHumanService) private readonly service: RulesHumanService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.read')
  list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.service.listNotifications(actor(request), query)
  }
  @Post(':id/read')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('alerts.read')
  read(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.service.readNotification(actor(request), id, body)
  }
}
