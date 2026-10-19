import { Body, Controller, Get, Header, Inject, Param, Post, Req } from '@nestjs/common'

import {
  type CreateActivityEscalation,
  type DecideActivityEscalation,
  createActivityEscalation,
  decideActivityEscalation,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ActivityEscalationsService } from './activity-escalations.service'

@Controller('projects/:projectId/activities/:activityId/escalations')
export class ActivityEscalationsController {
  constructor(
    @Inject(ActivityEscalationsService) private readonly service: ActivityEscalationsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('activities.escalations.read')
  list(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
  ) {
    return this.service.list(requestIdentity(request), projectId, activityId)
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('activities.escalations.raise')
  raise(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Body(new ZodPipe(createActivityEscalation)) body: CreateActivityEscalation,
  ) {
    return this.service.raise(requestIdentity(request), projectId, activityId, body)
  }

  @Post(':escalationId/forward')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('activities.update')
  forward(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('escalationId') escalationId: string,
    @Body(new ZodPipe(decideActivityEscalation)) body: DecideActivityEscalation,
  ) {
    return this.service.forward(requestIdentity(request), projectId, activityId, escalationId, body)
  }

  @Post(':escalationId/resolve')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('activities.update')
  resolve(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('escalationId') escalationId: string,
    @Body(new ZodPipe(decideActivityEscalation)) body: DecideActivityEscalation,
  ) {
    return this.service.resolve(requestIdentity(request), projectId, activityId, escalationId, body)
  }

  @Post(':escalationId/program-resolve')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('activities.escalations.read')
  programResolve(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('escalationId') escalationId: string,
    @Body(new ZodPipe(decideActivityEscalation)) body: DecideActivityEscalation,
  ) {
    return this.service.programResolve(
      requestIdentity(request),
      projectId,
      activityId,
      escalationId,
      body,
    )
  }
}
