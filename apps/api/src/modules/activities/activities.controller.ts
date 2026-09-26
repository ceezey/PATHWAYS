import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'

import { RequirePermission } from '../../common/decorators/permission.decorator'
import type { AuthenticatedRequest } from '../auth/developer-access'
// biome-ignore lint/style/useImportType: Nest validation needs the DTO constructors at runtime.
import {
  CreateActivityDto,
  ReviewActivityUpdateDto,
  SaveMilestoneDto,
  SubmitActivityUpdateDto,
  TransitionActivityDto,
  UpdateActivityDto,
  UpdateMilestoneDto,
} from './activities.dto'
import type { UploadedProofFile } from './activities.dto'
import { ActivitiesService } from './activities.service'

function profile(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}

@Controller('projects/:projectId/activities')
export class ActivitiesController {
  constructor(@Inject(ActivitiesService) private readonly activities: ActivitiesService) {}

  @Get()
  @RequirePermission('activities.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.activities.list(profile(request), projectId)
  }

  @Post()
  @RequirePermission('activities.create')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: CreateActivityDto,
  ) {
    return this.activities.create(profile(request), projectId, body)
  }

  @Get(':activityId')
  @RequirePermission('activities.read')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
  ) {
    return this.activities.get(profile(request), projectId, activityId)
  }

  @Patch(':activityId')
  @RequirePermission('activities.update')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Body() body: UpdateActivityDto,
  ) {
    return this.activities.update(profile(request), projectId, activityId, body)
  }

  @Post(':activityId/transition')
  @RequirePermission('activities.update')
  transition(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Body() body: TransitionActivityDto,
  ) {
    return this.activities.transition(profile(request), projectId, activityId, body)
  }

  @Post(':activityId/updates')
  @RequirePermission('activities.proof.submit')
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      limits: { fileSize: 10 * 1024 * 1024, files: 5, fields: 3, fieldSize: 5000, parts: 8 },
    }),
  )
  submitUpdate(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Body() body: SubmitActivityUpdateDto,
    @UploadedFiles() files?: UploadedProofFile[],
  ) {
    return this.activities.submitUpdate(profile(request), projectId, activityId, body, files)
  }

  @Post(':activityId/updates/:updateId/review')
  @RequirePermission('evidence.review')
  reviewUpdate(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('updateId') updateId: string,
    @Body() body: ReviewActivityUpdateDto,
  ) {
    return this.activities.reviewUpdate(profile(request), projectId, activityId, updateId, body)
  }

  @Get(':activityId/proof/:evidenceId')
  @RequirePermission('activities.read')
  async proof(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('evidenceId') evidenceId: string,
  ) {
    const proof = await this.activities.downloadProof(
      profile(request),
      projectId,
      activityId,
      evidenceId,
    )
    return new StreamableFile(proof.body, {
      type: proof.contentType,
      disposition: `attachment; filename="${proof.fileName.replace(/["\\\r\n]/g, '_')}"`,
    })
  }
}

@Controller('projects/:projectId/milestones')
export class MilestonesController {
  constructor(@Inject(ActivitiesService) private readonly activities: ActivitiesService) {}

  @Get()
  @RequirePermission('activities.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.activities.listMilestones(profile(request), projectId)
  }

  @Post()
  @RequirePermission('activities.update')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: SaveMilestoneDto,
  ) {
    return this.activities.createMilestone(profile(request), projectId, body)
  }

  @Patch(':milestoneId')
  @RequirePermission('activities.update')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() body: UpdateMilestoneDto,
  ) {
    return this.activities.updateMilestone(profile(request), projectId, milestoneId, body)
  }
}
