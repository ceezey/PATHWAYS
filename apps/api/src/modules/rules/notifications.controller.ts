import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { RulesHumanService } from './rules-human.service'

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
