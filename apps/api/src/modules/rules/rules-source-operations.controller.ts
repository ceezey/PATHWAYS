import {
  Body,
  Controller,
  ForbiddenException,
  Header,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common'
import type { AuthenticatedRequest } from '../auth/developer-access'
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
    if (!request.user) throw new ForbiddenException('Application profile is required.')
    return this.service.abandon(request.user, projectId, value)
  }
}
