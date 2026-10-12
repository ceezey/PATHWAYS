import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common'

import {
  type SaveMilestoneRequest,
  type UpdateMilestoneRequest,
  saveMilestoneRequest,
  updateMilestoneRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ActivityMilestonesService } from './activity-milestones.service'

@Controller('projects/:projectId/milestones')
export class MilestonesController {
  constructor(
    @Inject(ActivityMilestonesService) private readonly milestones: ActivityMilestonesService,
  ) {}

  @Get()
  @RequirePermission('activities.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.milestones.listMilestones(requestIdentity(request), projectId)
  }

  @Post()
  @RequirePermission('milestones.manage')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(saveMilestoneRequest)) body: SaveMilestoneRequest,
  ) {
    return this.milestones.createMilestone(requestIdentity(request), projectId, body)
  }

  @Patch(':milestoneId')
  @RequirePermission('milestones.manage')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
    @Body(new ZodPipe(updateMilestoneRequest)) body: UpdateMilestoneRequest,
  ) {
    return this.milestones.updateMilestone(requestIdentity(request), projectId, milestoneId, body)
  }
}
