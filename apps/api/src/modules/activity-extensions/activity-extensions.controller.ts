import { Body, Controller, Get, Header, Inject, Param, Post, Req } from '@nestjs/common'

import {
  type CreateActivityExtensionRequest,
  type DecideActivityExtensionRequest,
  type VerifyActivityExtensionRequest,
  createActivityExtensionRequest,
  decideActivityExtensionRequest,
  verifyActivityExtensionRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ActivityExtensionsService } from './activity-extensions.service'

@Controller('projects/:projectId/activities/:activityId/extension-requests')
export class ActivityExtensionsController {
  constructor(
    @Inject(ActivityExtensionsService) private readonly service: ActivityExtensionsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('activities.read')
  list(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
  ) {
    return this.service.list(requestIdentity(request), projectId, activityId)
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('activities.proof.submit')
  request(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Body(new ZodPipe(createActivityExtensionRequest)) body: CreateActivityExtensionRequest,
  ) {
    return this.service.request(requestIdentity(request), projectId, activityId, body)
  }

  @Post(':requestId/verify')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('evidence.review')
  verify(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('requestId') requestId: string,
    @Body(new ZodPipe(verifyActivityExtensionRequest)) body: VerifyActivityExtensionRequest,
  ) {
    return this.service.verify(requestIdentity(request), projectId, activityId, requestId, body)
  }

  @Post(':requestId/decide')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('activities.update')
  decide(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('requestId') requestId: string,
    @Body(new ZodPipe(decideActivityExtensionRequest)) body: DecideActivityExtensionRequest,
  ) {
    return this.service.decide(requestIdentity(request), projectId, activityId, requestId, body)
  }
}
