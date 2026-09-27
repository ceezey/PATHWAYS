import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
import { EvaluationsService } from './evaluations.service'

@Controller('projects/:projectId/evaluation')
export class EvaluationsController {
  constructor(@Inject(EvaluationsService) private readonly service: EvaluationsService) {}
  @Post('criteria/initialize')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('settings.configure')
  initialize(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() input: unknown,
  ) {
    if (!request.user) throw new ForbiddenException('Application profile required.')
    return this.service.initializeCriteria(request.user, projectId, input)
  }
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('monitoring.read')
  get(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    if (!request.user) throw new ForbiddenException('Application profile required.')
    return this.service.get(request.user, projectId)
  }
  @Patch('weights')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('evaluations.weights.configure')
  configure(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() input: unknown,
  ) {
    if (!request.user) throw new ForbiddenException('Application profile required.')
    return this.service.configureWeights(request.user, projectId, input)
  }
}
