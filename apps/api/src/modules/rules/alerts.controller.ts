import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { RulesHumanService } from './rules-human.service'

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
