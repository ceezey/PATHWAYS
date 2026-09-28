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
} from '@nestjs/common'

import { RequirePermission } from '../../common/decorators/permission.decorator'
import { inspectionRequestBudget } from '../../common/network/inspection-request-budget'
import type { AuthenticatedRequest } from '../auth/developer-access'
// biome-ignore lint/style/useImportType: Nest validation needs the DTO constructors at runtime.
import {
  CreateActivityDto,
  RecordActivityProgressDto,
  ReserveActivityProofDto,
  ReviewActivityUpdateDto,
  SaveMilestoneDto,
  TransitionActivityDto,
  UpdateActivityDto,
  UpdateMilestoneDto,
} from './activities.dto'
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

  // Declared before ':activityId' so the fixed segment is not captured as an identifier.
  @Get('proof-upload-limits')
  @RequirePermission('activities.proof.submit')
  proofUploadLimits(@Param('projectId') projectId: string) {
    return this.activities.proofUploadLimits(projectId)
  }

  @Get('context')
  @RequirePermission('activities.context.read')
  context(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.activities.context(profile(request), projectId)
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
    return this.activities.assignableOfficers(profile(request), projectId)
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

  @Post(':activityId/progress')
  @RequirePermission('activities.progress.update')
  recordProgress(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Body() body: RecordActivityProgressDto,
  ) {
    return this.activities.recordProgress(profile(request), projectId, activityId, body)
  }

  // The multipart proof route (POST :activityId/updates) is retired: evidence is reserved
  // here, uploaded directly to private storage and verified per file below.
  @Post(':activityId/updates/reservations')
  @RequirePermission('activities.proof.submit')
  reserveProof(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Body() body: ReserveActivityProofDto,
  ) {
    return this.activities.reserveProof(profile(request), projectId, activityId, body)
  }

  @Post(':activityId/updates/:updateId/files/:evidenceId/finalize')
  @RequirePermission('activities.proof.submit')
  finalizeProofFile(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Param('updateId') updateId: string,
    @Param('evidenceId') evidenceId: string,
  ) {
    return this.activities.finalizeProofFile(
      profile(request),
      projectId,
      activityId,
      updateId,
      evidenceId,
    )
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
    const released = await this.inspection.inspect(
      profile(request),
      projectId,
      activityId,
      updateId,
      evidenceId,
      inspectionRevisions(query),
    )
    try {
      inspectionRequestBudget(request)?.check()
    } catch (error) {
      released.body.destroy()
      throw error
    }
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    // Streamed after final authorization and audit. A failed integrity check destroys the
    // connection, so the client never receives a complete unverified attachment.
    return new StreamableFile(released.body, {
      type: 'application/octet-stream',
      disposition: 'attachment; filename="activity-proof.bin"',
      length: released.byteSize,
    }).setErrorHandler((_error, destination) => {
      // The Express response is a destroyable socket-backed stream.
      ;(destination as unknown as { destroy(): void }).destroy()
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

@Controller('projects/:projectId/evidence')
export class EvidenceController {
  constructor(@Inject(ActivitiesService) private readonly activities: ActivitiesService) {}

  @Get()
  @RequirePermission('evidence.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.activities.listEvidence(profile(request), projectId)
  }
}
