import {
  beginRuleSourceOperation,
  finishRuleSourceOperation,
  sourceMutationBody,
} from '../rules/rules-source-operation'

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'

import { readApiEnv } from '@pathways/config'
import {
  type ActivityMutationResponse,
  type ReviewActivityUpdateRequest,
  type SourceMutationAcknowledgement,
  hasAtomicPermission,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { readApplicationProfile } from '../../common/authz/application-profile'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { PrismaService } from '../../prisma/prisma.service'
import { requireActivity } from './activity-access.service'
import { mapWithMetrics } from './activity-metrics.service'

// Records the monitoring and evaluation decision on one submitted activity update.
@Injectable()
export class ActivityReviewService {
  private readonly env = readApiEnv(process.env)

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  reviewUpdate(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    updateId: string,
    input: ReviewActivityUpdateRequest,
  ): Promise<ActivityMutationResponse | SourceMutationAcknowledgement> {
    return withAuthorizedOperation(this.prisma, identity, 'evidence.review', async (tx, actor) => {
      if (
        actor.roles.length !== 1 ||
        actor.roles[0] !== 'MONITORING_AND_EVALUATION_OFFICER' ||
        !hasAtomicPermission(actor.roles[0], actor.permissions, 'evidence.review')
      )
        throw new ForbiddenException('Activity review is unavailable.')
      if (![projectId, activityId, updateId].every((id) => UUID_PATTERN.test(id)))
        throw new NotFoundException('Activity update unavailable.')
      if (
        !['APPROVE', 'RETURN'].includes(input.decision) ||
        !input.reason.trim() ||
        input.reason.trim().length > 1000 ||
        !Number.isFinite(Date.parse(input.expectedUpdatedAt))
      )
        throw new BadRequestException('Invalid activity review.')
      const source = await beginRuleSourceOperation(
        tx,
        'ACTIVITY_REVIEW',
        projectId,
        activityId,
        { kind: 'CLIENT_MUTATION', id: input.clientMutationId },
        sourceMutationBody(input, { updateId: updateId.toLowerCase() }),
      )
      if (source.kind === 'REPLAY') return source.acknowledgement
      await tx.$queryRaw`SELECT id FROM pathways.project_activities WHERE organization_id=${actor.organizationId}::uuid
        AND project_id=${projectId.toLowerCase()}::uuid AND id=${activityId.toLowerCase()}::uuid FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM pathways.activity_updates WHERE organization_id=${actor.organizationId}::uuid
        AND project_id=${projectId.toLowerCase()}::uuid AND activity_id=${activityId.toLowerCase()}::uuid
        AND id=${updateId.toLowerCase()}::uuid FOR UPDATE`
      const reviewer = await readApplicationProfile(
        tx,
        actor.id,
        actor.organizationId,
        actor.userId,
      )
      if (
        reviewer.roles.length !== 1 ||
        reviewer.roles[0] !== 'MONITORING_AND_EVALUATION_OFFICER' ||
        !hasAtomicPermission(reviewer.roles[0], reviewer.permissions, 'evidence.review')
      )
        throw new ForbiddenException('Activity review is unavailable.')
      const activity = await requireActivity(tx, reviewer, projectId, activityId)
      const update = await tx.activityUpdate.findFirst({
        where: {
          id: updateId.toLowerCase(),
          organizationId: reviewer.organizationId,
          projectId: activity.projectId,
          activityId: activity.id,
        },
        select: {
          id: true,
          status: true,
          submittedById: true,
          updatedAt: true,
          progressPercent: true,
          evidenceMedia_update: { select: { id: true, storageReady: true, status: true } },
        },
      })
      if (!update) throw new NotFoundException('Activity update unavailable.')
      if (update.submittedById === reviewer.userId)
        throw new ForbiddenException('A submitter cannot review their own update.')
      // A progress-only note (no evidence) is reviewed while the activity stays in progress and
      // can never complete it; proof updates keep the FOR_REVIEW lifecycle.
      const progressOnly = update.evidenceMedia_update.length === 0
      if (
        update.status !== 'PENDING' ||
        activity.status !== (progressOnly ? 'IN_PROGRESS' : 'FOR_REVIEW') ||
        (progressOnly && update.progressPercent >= 100)
      )
        throw new ConflictException('This update is no longer awaiting review.')
      const expected = new Date(input.expectedUpdatedAt)
      if (expected.valueOf() !== update.updatedAt.valueOf())
        throw new ConflictException('Activity update changed; reload before reviewing.')
      if (update.evidenceMedia_update.some((proof) => !proof.storageReady))
        throw new ConflictException('Proof upload is incomplete.')
      const now = new Date(source.generatedValues.timestamp)
      await tx.activityUpdate.update({
        where: {
          id: update.id,
          organizationId: reviewer.organizationId,
          projectId: activity.projectId,
          activityId: activity.id,
          status: 'PENDING',
          updatedAt: expected,
        },
        data: {
          status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          reviewedById: reviewer.userId,
          reviewedAt: now,
          updatedAt: now,
          reviewReason: input.reason.trim(),
        },
      })
      if (update.evidenceMedia_update.length) {
        await tx.evidenceMedia.updateMany({
          where: {
            organizationId: reviewer.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            activityUpdateId: update.id,
            status: 'PENDING',
          },
          data:
            input.decision === 'APPROVE'
              ? { status: 'VERIFIED', verifiedById: reviewer.userId, verifiedAt: now }
              : {
                  status: 'REJECTED',
                  rejectedById: reviewer.userId,
                  rejectedAt: now,
                  rejectionReason: input.reason.trim(),
                },
        })
      }
      await tx.projectActivity.update({
        where: {
          id: activity.id,
          organizationId: reviewer.organizationId,
          projectId: activity.projectId,
        },
        data: progressOnly
          ? input.decision === 'APPROVE'
            ? { progressPercent: update.progressPercent, updatedAt: now }
            : { updatedAt: now }
          : input.decision === 'APPROVE'
            ? {
                status: update.progressPercent === 100 ? 'COMPLETED' : 'IN_PROGRESS',
                progressPercent: update.progressPercent,
                actualEndDate:
                  update.progressPercent === 100
                    ? new Date(`${source.generatedValues.businessDate}T00:00:00.000Z`)
                    : null,
                reviewedById: update.progressPercent === 100 ? reviewer.userId : null,
                reviewedAt: update.progressPercent === 100 ? now : null,
                updatedAt: now,
              }
            : { status: 'IN_PROGRESS', progressPercent: update.progressPercent, updatedAt: now },
      })
      await writeAuditLog(tx, reviewer, {
        projectId: activity.projectId,
        action:
          input.decision === 'APPROVE' ? 'ACTIVITY_UPDATE_APPROVED' : 'ACTIVITY_UPDATE_RETURNED',
        entityType: 'ActivityUpdate',
        entityId: update.id,
        changes: {
          reason: input.reason.trim(),
          kind: progressOnly ? 'PROGRESS' : 'PROOF',
          progressPercent: update.progressPercent,
        },
      })
      const sourceAcknowledgement = await finishRuleSourceOperation(
        tx,
        source.operationHandle,
        input.clientMutationId,
      )
      const result = await mapWithMetrics(
        tx,
        reviewer,
        await requireActivity(tx, reviewer, activity.projectId, activity.id),
        this.env.BUSINESS_TIME_ZONE,
      )
      return { ...result, sourceAcknowledgement }
    })
  }
}
