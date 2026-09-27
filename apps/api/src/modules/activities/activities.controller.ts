import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'

import { RequirePermission } from '../../common/decorators/permission.decorator'
import { inspectionRequestBudget } from '../../common/network/inspection-request-budget'
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
import {
  PrivateProofInspectionService,
  inspectionRevisions,
} from './private-proof-inspection.service'

function profile(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}

@Controller('projects/:projectId/activities')
export class ActivitiesController {
  constructor(
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
    @Inject(PrivateProofInspectionService)
    private readonly inspection: PrivateProofInspectionService,
  ) {}

  @Get()
  @RequirePermission('activities.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.activities.list(profile(request), projectId)
  }

  @Get('context')
  @RequirePermission('activities.context.read')
  context(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.activities.context(profile(request), projectId)
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
  @RequirePermission('activities.read')
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

  @Get(':activityId/updates/:updateId/inspection-context')
  @RequirePermission('evidence.review')
  inspectionContext(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('updateId') updateId: string,
    @Query() query: Record<string, unknown>,
  ) {
    if (Object.keys(query).length)
      throw new BadRequestException('Invalid inspection context query.')
    return this.inspection.context(profile(request), projectId, activityId, updateId)
  }

  @Get(':activityId/updates/:updateId/proof/:evidenceId/inspection')
  @RequirePermission('evidence.review')
  async inspectProof(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('updateId') updateId: string,
    @Param('evidenceId') evidenceId: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    if (request.headers.range !== undefined)
      throw new BadRequestException('Partial inspection is unavailable.')
    const body = await this.inspection.inspect(
      profile(request),
      projectId,
      activityId,
      updateId,
      evidenceId,
      inspectionRevisions(query),
    )
    inspectionRequestBudget(request)?.check()
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    return new StreamableFile(body, {
      type: 'application/octet-stream',
      disposition: 'attachment; filename="activity-proof.bin"',
    })
  }

  @Get(':activityId/proof/:evidenceId')
  @RequirePermission('evidence.read')
  async proof(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('evidenceId') evidenceId: string,
  ) {
    return this.activities.downloadProof(profile(request), projectId, activityId, evidenceId)
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
  @RequirePermission('milestones.manage')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: SaveMilestoneDto,
  ) {
    return this.activities.createMilestone(profile(request), projectId, body)
  }

  @Patch(':milestoneId')
  @RequirePermission('milestones.manage')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() body: UpdateMilestoneDto,
  ) {
    return this.activities.updateMilestone(profile(request), projectId, milestoneId, body)
  }
}
