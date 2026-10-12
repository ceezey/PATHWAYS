import { Body, Controller, Inject, Param, Post, Req } from '@nestjs/common'

import {
  type RecordActivityProgressRequest,
  type RecordOverdueExplanationRequest,
  type ReserveActivityProofRequest,
  type ReviewActivityUpdateRequest,
  recordActivityProgressRequest,
  recordOverdueExplanationRequest,
  reserveActivityProofRequest,
  reviewActivityUpdateRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ActivitiesService } from './activities.service'

// Progress notes, overdue explanations and the proof reserve, finalize and review steps of one activity.
@Controller('projects/:projectId/activities')
export class ActivityUpdatesController {
  constructor(@Inject(ActivitiesService) private readonly activities: ActivitiesService) {}

  @Post(':activityId/progress')
  @RequirePermission('activities.progress.update')
  recordProgress(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Body(new ZodPipe(recordActivityProgressRequest)) body: RecordActivityProgressRequest,
  ) {
    return this.activities.recordProgress(requestIdentity(request), projectId, activityId, body)
  }

  @Post(':activityId/overdue-explanations')
  @RequirePermission('monitoring.review')
  recordOverdueExplanation(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Body(new ZodPipe(recordOverdueExplanationRequest)) body: RecordOverdueExplanationRequest,
  ) {
    return this.activities.recordOverdueExplanation(
      requestIdentity(request),
      projectId,
      activityId,
      body,
    )
  }

  // The multipart proof route (POST :activityId/updates) is retired: evidence is reserved
  // here, uploaded directly to private storage and verified per file below.
  @Post(':activityId/updates/reservations')
  @RequirePermission('activities.proof.submit')
  reserveProof(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('activityId') activityId: string,
    @Body(new ZodPipe(reserveActivityProofRequest)) body: ReserveActivityProofRequest,
  ) {
    return this.activities.reserveProof(requestIdentity(request), projectId, activityId, body)
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
      requestIdentity(request),
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
    @Body(new ZodPipe(reviewActivityUpdateRequest)) body: ReviewActivityUpdateRequest,
  ) {
    return this.activities.reviewUpdate(
      requestIdentity(request),
      projectId,
      activityId,
      updateId,
      body,
    )
  }
}
