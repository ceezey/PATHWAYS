import { Controller, Get, Header, Inject, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ActionCountsService } from './action-counts.service'

@Controller('dashboards')
export class ActionCountsController {
  constructor(@Inject(ActionCountsService) private readonly service: ActionCountsService) {}

  @Get('action-counts')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('projects.read')
  read(@Req() request: AuthenticatedRequest) {
    return this.service.read(requestIdentity(request))
  }
}
