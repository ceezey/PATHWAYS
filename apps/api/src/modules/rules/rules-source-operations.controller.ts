import { Body, Controller, Header, Inject, Param, Post, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RulesSourceOperationsService } from './rules-source-operations.service'

@Controller('projects/:projectId/source-operations')
export class RulesSourceOperationsController {
  constructor(
    @Inject(RulesSourceOperationsService) private readonly service: RulesSourceOperationsService,
  ) {}
  @Post('abandon')
  @Header('Cache-Control', 'private, no-store')
  abandon(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() value: unknown,
  ) {
    return this.service.abandon(requestIdentity(request), projectId, value)
  }
}
