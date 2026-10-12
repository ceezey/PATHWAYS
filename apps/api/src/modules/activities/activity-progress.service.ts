import { randomUUID } from 'node:crypto'

import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'

import { readApiEnv } from '@pathways/config'
import {
  type ActivityResponse,
  type RecordActivityProgressRequest,
  type RecordOverdueExplanationRequest,
  businessCalendarDate,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { PrismaService } from '../../prisma/prisma.service'
import { activityPresentationStatus } from './activities.helpers'
import {
  readScopedActivity,
  requireActiveAssignment,
  requireActivity,
} from './activity-access.service'
import { mapWithMetrics } from './activity-metrics.service'

// Records progress notes and overdue explanations against one activity.
@Injectable()
export class ActivityProgressService {
  private readonly env = readApiEnv(process.env)

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Records a progress-only update (no proof files) for review. Scope is resolved
   * through projectScope before any activity read; the caller must hold an active
   * assignment on the activity. Replays with the same clientUpdateId are idempotent.
   */
  recordProgress(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    input: RecordActivityProgressRequest,
  ): Promise<ActivityResponse> {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.progress.update',
      async (tx, actor) => {
        const activity = await requireActivity(tx, actor, projectId, activityId)
        await requireActiveAssignment(tx, actor, activity)
        const clientUpdateId = input.clientUpdateId.toLowerCase()
        const note = input.note.trim()
        if (!note) throw new BadRequestException('A progress note is required.')
        const existing = await tx.activityUpdate.findFirst({
          where: {
            organizationId: actor.organizationId,
            submittedById: actor.userId,
            clientUpdateId,
          },
          select: { projectId: true, activityId: true, progressPercent: true, note: true },
        })
        if (existing) {
          if (
            existing.projectId !== activity.projectId ||
            existing.activityId !== activity.id ||
            existing.progressPercent !== input.progressPercent ||
            existing.note !== note
          )
            throw new ConflictException('The activity update id was reused with different input.')
          return mapWithMetrics(tx, actor, activity, this.env.BUSINESS_TIME_ZONE)
        }
        if (activity.status !== 'IN_PROGRESS')
          throw new ConflictException('Progress can be recorded only for an in-progress activity.')
        if (input.progressPercent === 100)
          throw new BadRequestException('Completion requires a proof submission.')
        const pending = await tx.activityUpdate.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            status: 'PENDING',
          },
          select: { id: true },
        })
        if (pending)
          throw new ConflictException('Another activity update is already awaiting review.')
        const updateId = randomUUID()
        await tx.activityUpdate.create({
          data: {
            id: updateId,
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            clientUpdateId,
            progressPercent: input.progressPercent,
            note,
            submittedById: actor.userId,
          },
        })
        await writeAuditLog(tx, actor, {
          projectId: activity.projectId,
          action: 'ACTIVITY_PROGRESS_RECORDED',
          entityType: 'ActivityUpdate',
          entityId: updateId,
          changes: { activityId: activity.id, progressPercent: input.progressPercent },
        })
        return mapWithMetrics(
          tx,
          actor,
          await readScopedActivity(tx, actor, activity.projectId, activity.id),
          this.env.BUSINESS_TIME_ZONE,
        )
      },
    )
  }

  /**
   * Records a reason category plus a written explanation for an overdue activity
   * (cr-pathways-activity-overdue-explanation). It is a prompt, not a block: the activity's
   * transitions and other authority are unaffected. Overdue is determined by the same
   * `activityPresentationStatus` predicate used by the activity list and detail, so this check
   * never diverges from what the caller can already see. Append-only: a retry with the same
   * clientMutationId and identical category/explanation returns the same row; a changed retry
   * conflicts.
   */
  recordOverdueExplanation(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    input: RecordOverdueExplanationRequest,
  ): Promise<ActivityResponse> {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'monitoring.review',
      async (tx, actor) => {
        // M&E officers are assigned to the PROJECT, not to individual activities, so this
        // uses the project-scope rule requireActivity already applies (projectScope(actor)
        // inside requireScopedProjectRow), not the personal-activity requireActiveAssignment used by
        // recordProgress/reserveProof. This mirrors pathways.p05_has_project_permission
        // ('monitoring.review', project_id) in migration 0043's RLS INSERT policy:
        // SYSTEM_ADMINISTRATOR is org-wide, PROGRAM_MANAGER also via a managed program, and
        // every other role (including GRANT_MANAGER) needs an active project assignment.
        const activity = await requireActivity(tx, actor, projectId, activityId)
        const clientMutationId = input.clientMutationId.toLowerCase()
        const explanation = input.explanation.trim()
        if (explanation.length < 10 || explanation.length > 2000)
          throw new BadRequestException('The explanation must be 10 to 2000 characters.')
        const existing = await tx.activityOverdueExplanation.findFirst({
          where: { organizationId: actor.organizationId, clientMutationId },
          select: { projectId: true, activityId: true, category: true, explanation: true },
        })
        if (existing) {
          if (
            existing.projectId !== activity.projectId ||
            existing.activityId !== activity.id ||
            existing.category !== input.category ||
            existing.explanation !== explanation
          )
            throw new ConflictException(
              'The overdue explanation id was reused with different input.',
            )
          return mapWithMetrics(tx, actor, activity, this.env.BUSINESS_TIME_ZONE)
        }
        const presentation = activityPresentationStatus(
          activity.status,
          activity.plannedEndDate,
          businessCalendarDate(new Date(), this.env.BUSINESS_TIME_ZONE),
        )
        if (!presentation.overdue)
          throw new ConflictException('An overdue explanation can be recorded only while overdue.')
        const explanationId = randomUUID()
        await tx.activityOverdueExplanation.create({
          data: {
            id: explanationId,
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            category: input.category,
            explanation,
            recordedById: actor.userId,
            clientMutationId,
          },
        })
        await writeAuditLog(tx, actor, {
          projectId: activity.projectId,
          action: 'ACTIVITY_OVERDUE_EXPLANATION_RECORDED',
          entityType: 'ActivityOverdueExplanation',
          entityId: explanationId,
          changes: { activityId: activity.id, category: input.category },
        })
        return mapWithMetrics(
          tx,
          actor,
          await readScopedActivity(tx, actor, activity.projectId, activity.id),
          this.env.BUSINESS_TIME_ZONE,
        )
      },
    )
  }
}
