import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common'

import {
  type CreateActivityRequest,
  type TransitionActivityRequest,
  type UpdateActivityRequest,
  createActivityRequest,
  transitionActivityRequest,
  updateActivityRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ActivitiesService } from './activities.service'

@Controller('projects/:projectId/activities')
export class ActivitiesController {
  constructor(@Inject(ActivitiesService) private readonly activities: ActivitiesService) {}

  @Get()
  @RequirePermission('activities.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.activities.list(requestIdentity(request), projectId)
  }

  // Declared before ':activityId' so the fixed segment is not captured as an identifier.
  @Get('proof-upload-limits')
  @RequirePermission('activities.proof.submit')
  proofUploadLimits(@Param('projectId') projectId: string) {
    return this.activities.proofUploadLimits(projectId)
  }

  @Get('context')
  @RequirePermission('activities.context.read')
  context(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.activities.context(requestIdentity(request), projectId)
  }

  // The guard admits activity readers; the service then requires activities.create or
  // activities.update in project scope before any user row is read.
  @Get('assignable-officers')
  @RequirePermission('activities.read')
  assignableOfficers(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Query() query: Record<string, unknown>,
  ) {
    if (Object.keys(query).length) throw new BadRequestException('Invalid officer query.')
    return this.activities.assignableOfficers(requestIdentity(request), projectId)
  }

  @Post()
  @RequirePermission('activities.create')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(createActivityRequest)) body: CreateActivityRequest,
  ) {
    return this.activities.create(requestIdentity(request), projectId, body)
  }

  @Get(':activityId')
  @RequirePermission('activities.read')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
  ) {
    return this.activities.get(requestIdentity(request), projectId, activityId)
  }

  @Patch(':activityId')
  @RequirePermission('activities.update')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Body(new ZodPipe(updateActivityRequest)) body: UpdateActivityRequest,
  ) {
    return this.activities.update(requestIdentity(request), projectId, activityId, body)
  }

  @Post(':activityId/transition')
  @RequirePermission('activities.read')
  transition(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Body(new ZodPipe(transitionActivityRequest)) body: TransitionActivityRequest,
  ) {
    return this.activities.transition(requestIdentity(request), projectId, activityId, body)
  }
}
