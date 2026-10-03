import { Controller, ForbiddenException, Get, Header, Inject, Req } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
import { ActionCountsService } from './action-counts.service'

@Controller('dashboards')
export class ActionCountsController {
  constructor(@Inject(ActionCountsService) private readonly service: ActionCountsService) {}

  @Get('action-counts')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('projects.read')
  read(@Req() request: AuthenticatedRequest) {
    if (!request.user) throw new ForbiddenException('Application profile is required.')
    return this.service.read(request.user)
  }
}
