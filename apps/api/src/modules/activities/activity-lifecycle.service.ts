import {
  beginRuleSourceOperation,
  finishRuleSourceOperation,
  sourceMutationBody,
} from '../rules/rules-source-operation'

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'

import { readApiEnv } from '@pathways/config'
import type {
  ActivityMutationResponse,
  CreateActivityRequest,
  SourceMutationAcknowledgement,
  TransitionActivityRequest,
  UpdateActivityRequest,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectDateFields, requireScopedProjectRow } from '../../common/authz/scoped-project'
import { PrismaService } from '../../prisma/prisma.service'
import { activityTransitionAllowed, validateActivityDates } from './activities.helpers'
import {
  readScopedActivity,
  requireActivity,
  requireProjectActivity,
} from './activity-access.service'
import { saveActivityBudget } from './activity-budget.service'
import {
  replaceActivityLinks,
  resolveAssignments,
  resolveIndicators,
  resolveJourneyStage,
} from './activity-links.service'
import { mapWithMetrics } from './activity-metrics.service'

// Create and update write assignments, links, budget and rule sources in one transaction; 5s is too short on the pooled remote DB.
const ACTIVITY_SAVE_TRANSACTION_TIMEOUT_MS = 20_000

// Creates, edits, starts and cancels activities through the rule source operations.
@Injectable()
export class ActivityLifecycleService {
  private readonly env = readApiEnv(process.env)

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  create(
    identity: ApplicationIdentity,
    projectId: string,
    input: CreateActivityRequest,
  ): Promise<ActivityMutationResponse | SourceMutationAcknowledgement> {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.create',
      async (tx, actor) => {
        const source = await beginRuleSourceOperation(
          tx,
          'ACTIVITY_CREATE',
          projectId,
          null,
          { kind: 'CLIENT_MUTATION', id: input.clientMutationId },
          sourceMutationBody(input),
        )
        if (source.kind === 'REPLAY') return source.acknowledgement
        const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
        const timelineOverrideJustification = validateActivityDates(
          input.plannedStartDate,
          input.plannedEndDate,
          project,
          input.timelineOverrideJustification,
        )
        const assignments = await resolveAssignments(tx, actor, project.id, input.assignedUserIds)
        const indicatorIds = await resolveIndicators(tx, actor, project.id, input.indicatorIds)
        const journeyStageId = await resolveJourneyStage(
          tx,
          actor,
          project.id,
          input.journeyStageId,
        )
        const activityId = source.reservedRecordId
        if (!activityId)
          throw new ServiceUnavailableException('Activity creation could not be confirmed.')
        await tx.projectActivity.create({
          data: {
            id: activityId,
            organizationId: actor.organizationId,
            projectId: project.id,
            code: input.code ?? `ACT-${activityId.slice(0, 8).toUpperCase()}`,
            title: input.title.trim(),
            description: input.description?.trim() || null,
            activityType: input.activityType?.trim() || null,
            timelineOverrideJustification,
            targetBeneficiaries: input.targetBeneficiaries ?? null,
            plannedStartDate: new Date(`${input.plannedStartDate}T00:00:00.000Z`),
            plannedEndDate: new Date(`${input.plannedEndDate}T00:00:00.000Z`),
            createdById: actor.userId,
            createdAt: new Date(source.generatedValues.timestamp),
            updatedAt: new Date(source.generatedValues.timestamp),
          },
        })
        if (assignments.length) {
          await tx.projectActivityAssignment.createMany({
            data: assignments.map((assignment) => ({
              organizationId: actor.organizationId,
              projectId: project.id,
              activityId,
              projectAssignmentId: assignment.id,
              assignedById: actor.userId,
            })),
          })
        }
        await replaceActivityLinks(
          tx,
          actor,
          project.id,
          activityId,
          indicatorIds ?? [],
          journeyStageId === undefined ? null : journeyStageId,
        )
        await saveActivityBudget(
          tx,
          actor,
          project.id,
          activityId,
          input.budgetAllocation,
          'create',
        )
        await writeAuditLog(tx, actor, {
          projectId: project.id,
          action: 'ACTIVITY_CREATED',
          entityType: 'ProjectActivity',
          entityId: activityId,
          changes: { code: input.code ?? 'SERVER_GENERATED', assigneeCount: assignments.length },
        })
        const sourceAcknowledgement = await finishRuleSourceOperation(
          tx,
          source.operationHandle,
          input.clientMutationId,
        )
        const result = await mapWithMetrics(
          tx,
          actor,
          await readScopedActivity(tx, actor, project.id, activityId),
          this.env.BUSINESS_TIME_ZONE,
        )
        return { ...result, sourceAcknowledgement }
      },
      { transactionTimeoutMs: ACTIVITY_SAVE_TRANSACTION_TIMEOUT_MS },
    )
  }

  update(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    input: UpdateActivityRequest,
  ): Promise<ActivityMutationResponse | SourceMutationAcknowledgement> {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.update',
      async (tx, actor) => {
        const source = await beginRuleSourceOperation(
          tx,
          'ACTIVITY_UPDATE',
          projectId,
          activityId,
          { kind: 'CLIENT_MUTATION', id: input.clientMutationId },
          sourceMutationBody(input),
        )
        if (source.kind === 'REPLAY') return source.acknowledgement
        const { project, activity: current } = await requireProjectActivity(
          tx,
          actor,
          projectId,
          activityId,
        )
        if (['COMPLETED', 'CANCELLED'].includes(current.status)) {
          throw new ConflictException('Terminal activity history cannot be edited.')
        }
        const timelineOverrideJustification = validateActivityDates(
          input.plannedStartDate,
          input.plannedEndDate,
          project,
          input.timelineOverrideJustification ?? current.timelineOverrideJustification ?? undefined,
        )
        const expected = new Date(input.expectedUpdatedAt)
        if (
          Number.isNaN(expected.valueOf()) ||
          expected.valueOf() !== current.updatedAt.valueOf()
        ) {
          throw new ConflictException('Activity changed; reload before saving.')
        }
        const assignments = await resolveAssignments(tx, actor, project.id, input.assignedUserIds)
        const indicatorIds = await resolveIndicators(tx, actor, project.id, input.indicatorIds)
        const journeyStageId = await resolveJourneyStage(
          tx,
          actor,
          project.id,
          input.journeyStageId,
        )
        const changed = await tx.projectActivity.updateMany({
          where: { id: current.id, organizationId: actor.organizationId, updatedAt: expected },
          data: {
            code: input.code ?? current.code,
            title: input.title.trim(),
            description: input.description?.trim() || null,
            activityType: input.activityType?.trim() || null,
            timelineOverrideJustification,
            ...(input.targetBeneficiaries === undefined
              ? {}
              : { targetBeneficiaries: input.targetBeneficiaries }),
            plannedStartDate: new Date(`${input.plannedStartDate}T00:00:00.000Z`),
            plannedEndDate: new Date(`${input.plannedEndDate}T00:00:00.000Z`),
            updatedAt: new Date(source.generatedValues.timestamp),
          },
        })
        if (changed.count !== 1)
          throw new ConflictException('Activity changed; reload before saving.')
        await tx.projectActivityAssignment.updateMany({
          where: {
            organizationId: actor.organizationId,
            projectId: project.id,
            activityId: current.id,
            status: 'ACTIVE',
          },
          data: {
            status: 'REMOVED',
            endedAt: new Date(source.generatedValues.timestamp),
            endReason: 'Activity assignment replaced.',
          },
        })
        if (assignments.length) {
          await tx.projectActivityAssignment.createMany({
            data: assignments.map((assignment) => ({
              organizationId: actor.organizationId,
              projectId: project.id,
              activityId: current.id,
              projectAssignmentId: assignment.id,
              assignedById: actor.userId,
            })),
          })
        }
        await replaceActivityLinks(tx, actor, project.id, current.id, indicatorIds, journeyStageId)
        await saveActivityBudget(
          tx,
          actor,
          project.id,
          current.id,
          input.budgetAllocation,
          'update',
        )
        await writeAuditLog(tx, actor, {
          projectId: project.id,
          action: 'ACTIVITY_UPDATED',
          entityType: 'ProjectActivity',
          entityId: current.id,
          changes: { assigneeCount: assignments.length },
        })
        const sourceAcknowledgement = await finishRuleSourceOperation(
          tx,
          source.operationHandle,
          input.clientMutationId,
        )
        const result = await mapWithMetrics(
          tx,
          actor,
          await readScopedActivity(tx, actor, project.id, current.id),
          this.env.BUSINESS_TIME_ZONE,
        )
        return { ...result, sourceAcknowledgement }
      },
      { transactionTimeoutMs: ACTIVITY_SAVE_TRANSACTION_TIMEOUT_MS },
    )
  }

  transition(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    input: TransitionActivityRequest,
  ): Promise<ActivityMutationResponse | SourceMutationAcknowledgement> {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      input.status === 'IN_PROGRESS' ? 'activities.complete' : 'activities.update',
      async (tx, actor) => {
        const operation = input.status === 'IN_PROGRESS' ? 'ACTIVITY_START' : 'ACTIVITY_CANCEL'
        const source = await beginRuleSourceOperation(
          tx,
          operation,
          projectId,
          activityId,
          { kind: 'CLIENT_MUTATION', id: input.clientMutationId },
          sourceMutationBody(input),
        )
        if (source.kind === 'REPLAY') return source.acknowledgement
        const current = await requireActivity(tx, actor, projectId, activityId)
        const expected = new Date(input.expectedUpdatedAt)
        if (expected.valueOf() !== current.updatedAt.valueOf())
          throw new ConflictException('Activity changed; reload before saving.')
        if (!activityTransitionAllowed(current.status, input.status)) {
          throw new ConflictException('The requested activity transition is not permitted.')
        }
        if (input.status === 'CANCELLED' && !input.reason?.trim()) {
          throw new BadRequestException('A cancellation reason is required.')
        }
        const now = new Date(source.generatedValues.timestamp)
        const changed = await tx.projectActivity.updateMany({
          where: { id: current.id, organizationId: actor.organizationId, updatedAt: expected },
          data:
            input.status === 'IN_PROGRESS'
              ? {
                  status: 'IN_PROGRESS',
                  actualStartDate: new Date(`${source.generatedValues.businessDate}T00:00:00.000Z`),
                  updatedAt: now,
                }
              : {
                  status: 'CANCELLED',
                  cancelledAt: now,
                  cancellationReason: input.reason?.trim(),
                  updatedAt: now,
                },
        })
        if (changed.count !== 1)
          throw new ConflictException('Activity changed; reload before saving.')
        await writeAuditLog(tx, actor, {
          projectId: current.projectId,
          action: `ACTIVITY_${input.status}`,
          entityType: 'ProjectActivity',
          entityId: current.id,
          changes: input.status === 'CANCELLED' ? { reason: input.reason?.trim() } : {},
        })
        const sourceAcknowledgement = await finishRuleSourceOperation(
          tx,
          source.operationHandle,
          input.clientMutationId,
        )
        const result = await mapWithMetrics(
          tx,
          actor,
          await readScopedActivity(tx, actor, current.projectId, current.id),
          this.env.BUSINESS_TIME_ZONE,
        )
        return { ...result, sourceAcknowledgement }
      },
    )
  }
}
