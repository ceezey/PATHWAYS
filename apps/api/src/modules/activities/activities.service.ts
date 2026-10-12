import { createHash, randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import {
  beginRuleSourceOperation,
  finishRuleSourceOperation,
  proofClientAcknowledgement,
  readRuleSourceAcknowledgement,
  sourceMutationBody,
} from '../rules/rules-source-operation'

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'

import { readApiEnv } from '@pathways/config'
import {
  type CreateActivityRequest,
  MAX_ACTIVITY_EVIDENCE_FILES,
  type RecordActivityProgressRequest,
  type RecordOverdueExplanationRequest,
  type ReserveActivityProofRequest,
  type ReviewActivityUpdateRequest,
  type SaveMilestoneRequest,
  type TransitionActivityRequest,
  type UpdateActivityRequest,
  type UpdateMilestoneRequest,
  aggregateOnlyRoles,
  businessCalendarDate,
  hasAtomicPermission,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { readApplicationProfile } from '../../common/authz/application-profile'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectScope } from '../../common/authz/project-scope'
import { projectDateFields, requireScopedProjectRow } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { PrismaService } from '../../prisma/prisma.service'
import type { UploadVerification } from '../storage/private-inspection-reader'
import {
  PRIVATE_STORAGE_FACTORIES,
  type PrivateStorageFactories,
} from '../storage/private-storage-factories'
import { StorageService } from '../storage/storage.service'
import {
  activityCapabilities,
  activityPresentationStatus,
  activityTransitionAllowed,
  assignableOfficerLimit,
  reviewStatus,
  validateActivityDates,
} from './activities.helpers'
import {
  activityListSelection,
  activitySelection,
  mapActivityListItem,
  personalAssignmentCount,
} from './activities.mapper'
import {
  readScopedActivity,
  requireActiveAssignment,
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
import { mapWithMetrics, readListMetrics } from './activity-metrics.service'
import {
  PROOF_STORAGE_DEADLINE_MS,
  activityEvidenceLimits,
  activityEvidenceType,
  declarationKey,
  evidenceExtension,
  proofDeclarations,
  proofFinalizeBody,
  verificationFailure,
} from './activity-proof.helpers'

// Create and update write assignments, links, budget and rule sources in one transaction; 5s is too short on the pooled remote DB.
const ACTIVITY_SAVE_TRANSACTION_TIMEOUT_MS = 20_000

@Injectable()
export class ActivitiesService {
  private readonly env = readApiEnv(process.env)

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(PRIVATE_STORAGE_FACTORIES) private readonly storageFactories: PrivateStorageFactories,
  ) {}

  context(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.context.read',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, {
          projectActivity_project: {
            where: { organizationId: actor.organizationId, archivedAt: null },
            select: {
              id: true,
              title: true,
              status: true,
              activityJourneyStageMapping_activity: {
                select: { stageId: true },
                orderBy: { sequenceOrder: 'asc' },
                take: 100,
              },
            },
            orderBy: [{ title: 'asc' }, { id: 'asc' }],
            take: 100,
          },
        })
        return project.projectActivity_project.map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          journeyStageId: row.activityJourneyStageMapping_activity[0]?.stageId ?? '',
        }))
      },
    )
  }

  /**
   * Supporting read for the activity editor (cr-pathways-project-rbac-ui-and-partners 3.3):
   * exactly the users `resolveAssignments` accepts, for a caller holding activities.create
   * or activities.update inside project scope. Only userId and displayName leave the
   * query, at most 50 rows; an inaccessible project is the uniform 404.
   */
  assignableOfficers(identity: ApplicationIdentity, projectId: string) {
    const permission = hasAtomicPermission(
      identity.roles[0],
      identity.permissions,
      'activities.create',
    )
      ? 'activities.create'
      : 'activities.update'
    return withAuthorizedOperation(this.prisma, identity, permission, async (tx, actor) => {
      if (
        !hasAtomicPermission(actor.roles[0], actor.permissions, 'activities.create') &&
        !hasAtomicPermission(actor.roles[0], actor.permissions, 'activities.update')
      )
        throw new ForbiddenException('Required application permission is missing.')
      const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
      const rows = await tx.userProjectAssignment.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId: project.id,
          status: 'ACTIVE',
          endedAt: null,
          user: {
            accountStatus: 'ACTIVE',
            archivedAt: null,
            role: { code: 'PROJECT_OFFICER', isActive: true },
          },
        },
        select: { user: { select: { id: true, fullName: true } } },
        orderBy: [{ user: { fullName: 'asc' } }, { userId: 'asc' }],
        take: assignableOfficerLimit,
      })
      return rows.map((row) => ({ userId: row.user.id, displayName: row.user.fullName }))
    })
  }

  /** Lean list projection; update history, proof, assignee emails and metrics are `get`-only. */
  list(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'activities.read', async (tx, actor) => {
      if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
      const project = await tx.project.findFirst({
        relationLoadStrategy: 'join',
        where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
        select: {
          projectActivity_project: {
            where: { organizationId: actor.organizationId, archivedAt: null },
            select: { ...activityListSelection, ...personalAssignmentCount(actor) },
            orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
            take: 100,
          },
        },
      })
      if (!project) throw new NotFoundException('Project unavailable.')
      const today = businessCalendarDate(new Date(), this.env.BUSINESS_TIME_ZONE)
      const metrics = await readListMetrics(
        tx,
        actor,
        projectId.toLowerCase(),
        project.projectActivity_project.map((row) => row.id),
      )
      return project.projectActivity_project.map((row) => ({
        ...mapActivityListItem(row, today),
        indicatorCount: row.activityIndicatorLink_activity.length,
        beneficiariesTarget: row.targetBeneficiaries,
        beneficiariesReached: metrics.reached.get(row.id) ?? null,
        budgetUtilization: metrics.budgetUtilization.get(row.id) ?? null,
        capabilities: activityCapabilities(
          actor,
          row.status,
          row._count?.projectActivityAssignment_activity,
        ),
      }))
    })
  }

  /** Evidence list under `evidence.read`. Aggregate-only roles receive per-activity
   * counts selected without file names, submitters, notes, or storage references. */
  listEvidence(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'evidence.read', async (tx, actor) => {
      const activityWhere = { organizationId: actor.organizationId, archivedAt: null }
      if (aggregateOnlyRoles.includes(actor.roles[0])) {
        const project = await requireScopedProjectRow(tx, actor, projectId, {
          projectActivity_project: {
            where: activityWhere,
            select: { id: true, title: true },
            orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
            take: 100,
          },
        })
        const activityIds = project.projectActivity_project.map((row) => row.id)
        // Counts come from the database, so they are exact rather than capped by row limits.
        const groups = activityIds.length
          ? await tx.evidenceMedia.groupBy({
              by: ['activityId', 'status'],
              where: {
                organizationId: actor.organizationId,
                projectId: projectId.toLowerCase(),
                activityId: { in: activityIds },
                activityUpdateId: { not: null },
                storageReady: true,
              },
              _count: { _all: true },
            })
          : []
        return {
          scope: 'aggregate' as const,
          activities: project.projectActivity_project.map((row) => {
            const counts = { total: 0, submitted: 0, approved: 0, returned: 0 }
            for (const group of groups) {
              if (group.activityId !== row.id) continue
              const count = group._count._all
              counts.total += count
              const status = reviewStatus[group.status]
              if (status === 'Accepted') counts.approved += count
              else if (status === 'Flagged') counts.returned += count
              else counts.submitted += count
            }
            return { activityId: row.id, activityTitle: row.title, ...counts }
          }),
        }
      }
      const project = await requireScopedProjectRow(tx, actor, projectId, {
        projectActivity_project: {
          where: activityWhere,
          select: {
            id: true,
            projectId: true,
            title: true,
            // Detail keeps the same bounded page as the activity list (100 activities,
            // 100 updates, 10 proofs per update); counts for totals use the aggregate path.
            activityUpdate_activity: {
              ...activitySelection.activityUpdate_activity,
              select: {
                ...activitySelection.activityUpdate_activity.select,
                evidenceMedia_update: {
                  ...activitySelection.activityUpdate_activity.select.evidenceMedia_update,
                  select: {
                    ...activitySelection.activityUpdate_activity.select.evidenceMedia_update.select,
                    contentType: true,
                    byteSize: true,
                    isIdentifying: true,
                  },
                },
              },
            },
          },
          orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
          take: 100,
        },
      })
      return {
        scope: 'detail' as const,
        records: project.projectActivity_project.flatMap((row) =>
          row.activityUpdate_activity.flatMap((update) =>
            update.evidenceMedia_update.map((proof) => {
              const status = reviewStatus[proof.status]
              return {
                id: proof.id,
                projectId: row.projectId,
                activityId: row.id,
                updateId: update.id,
                updateUpdatedAt: update.updatedAt.toISOString(),
                fileName: proof.fileName,
                reportTitle: row.title,
                status:
                  status === 'Accepted'
                    ? ('Approved' as const)
                    : status === 'Flagged'
                      ? ('Returned' as const)
                      : ('Submitted' as const),
                submitter: update.submittedBy.fullName,
                submittedDate: proof.submittedAt.toISOString(),
                contentType: proof.contentType,
                byteSize: Number(proof.byteSize),
                isIdentifying: proof.isIdentifying,
                reviewedDate: update.reviewedAt?.toISOString() ?? null,
                reviewer: update.reviewedBy?.fullName ?? null,
                previewSummary: update.note ?? 'Activity evidence submission',
              }
            }),
          ),
        ),
      }
    })
  }

  get(identity: ApplicationIdentity, projectId: string, activityId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'activities.read', async (tx, actor) => {
      if (!UUID_PATTERN.test(projectId) || !UUID_PATTERN.test(activityId)) {
        throw new NotFoundException('Activity unavailable.')
      }
      const project = await tx.project.findFirst({
        relationLoadStrategy: 'join',
        where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
        select: {
          projectActivity_project: {
            where: {
              id: activityId.toLowerCase(),
              organizationId: actor.organizationId,
              archivedAt: null,
            },
            select: { ...activitySelection, ...personalAssignmentCount(actor) },
            take: 1,
          },
        },
      })
      const activity = project?.projectActivity_project[0]
      if (!activity) throw new NotFoundException('Activity unavailable.')
      return mapWithMetrics(tx, actor, activity, this.env.BUSINESS_TIME_ZONE)
    })
  }

  create(identity: ApplicationIdentity, projectId: string, input: CreateActivityRequest) {
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
  ) {
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
  ) {
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
  ) {
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
  ) {
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

  /** Effective upload limits for the web client; the same values bound every reservation. */
  proofUploadLimits(projectId: string) {
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    return activityEvidenceLimits(this.env.EVIDENCE_MAX_FILE_BYTES)
  }

  /**
   * Reserves an activity update with 1-10 private evidence rows and returns one signed upload
   * URL per unverified row, each scoped to its server-derived object key. Authority is the
   * existing proof authority: activities.proof.submit, an active personal activity assignment
   * and no other pending update. A retry with the same clientUpdateId and identical
   * declarations returns the same reservation with fresh URLs; changed declarations conflict.
   */
  async reserveProof(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    input: ReserveActivityProofRequest,
  ) {
    const declared = proofDeclarations(input.files, this.env.EVIDENCE_MAX_FILE_BYTES)
    const note = input.note.trim()
    if (!note) throw new BadRequestException('A progress note is required.')
    const clientUpdateId = input.clientUpdateId.toLowerCase()
    const reservation = await withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.proof.submit',
      async (tx, actor) => {
        const activity = await requireActivity(tx, actor, projectId, activityId)
        await requireActiveAssignment(tx, actor, activity)
        const existing = await tx.activityUpdate.findFirst({
          where: {
            organizationId: actor.organizationId,
            submittedById: actor.userId,
            clientUpdateId,
          },
          select: {
            id: true,
            projectId: true,
            activityId: true,
            progressPercent: true,
            note: true,
            status: true,
            beneficiariesReachedThisSession: true,
            evidenceMedia_update: {
              select: {
                id: true,
                fileName: true,
                sha256: true,
                contentType: true,
                byteSize: true,
                bucket: true,
                objectKey: true,
                storageReady: true,
              },
              orderBy: { id: 'asc' },
              take: MAX_ACTIVITY_EVIDENCE_FILES + 1,
            },
          },
        })
        if (existing) {
          const stored = existing.evidenceMedia_update.map(declarationKey).sort()
          const requested = declared.map(declarationKey).sort()
          if (
            existing.projectId !== activity.projectId ||
            existing.activityId !== activity.id ||
            existing.progressPercent !== input.progressPercent ||
            existing.note !== note ||
            (existing.beneficiariesReachedThisSession ?? null) !==
              (input.beneficiariesReachedThisSession ?? null) ||
            JSON.stringify(stored) !== JSON.stringify(requested)
          )
            throw new ConflictException('The activity update id was reused with different input.')
          const acknowledgement = await readRuleSourceAcknowledgement(
            tx,
            'ACTIVITY_PROOF_FINALIZE',
            activity.projectId,
            activity.id,
            { kind: 'PROOF_FINALIZE', id: existing.id, phase: 'FINALIZE' },
            proofFinalizeBody(existing.id, existing.progressPercent, note, declared),
          )
          if (acknowledgement)
            return {
              acknowledgement: proofClientAcknowledgement(
                acknowledgement,
                existing.id,
                clientUpdateId,
              ),
            }
          if (existing.status !== 'PENDING')
            throw new ConflictException('This activity update is no longer awaiting evidence.')
          return { updateId: existing.id, evidence: existing.evidenceMedia_update }
        }
        if (activity.status !== 'IN_PROGRESS')
          throw new ConflictException('Evidence can be submitted only for an in-progress activity.')
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
            beneficiariesReachedThisSession: input.beneficiariesReachedThisSession ?? null,
            submittedById: actor.userId,
          },
        })
        const evidence = declared.map((file) => {
          const id = randomUUID()
          return {
            id,
            fileName: file.fileName,
            sha256: file.sha256,
            contentType: file.contentType,
            byteSize: BigInt(file.byteSize),
            bucket: this.env.EVIDENCE_BUCKET,
            objectKey: `organizations/${actor.organizationId}/projects/${activity.projectId}/evidence/${id}/proof${evidenceExtension[file.contentType]}`,
            storageReady: false,
          }
        })
        // One batched insert. The type follows the declared content type; finalize rejects a
        // file whose leading bytes do not match it, so a stored row never keeps a false type.
        await tx.evidenceMedia.createMany({
          data: evidence.map((row) => ({
            ...row,
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            activityUpdateId: updateId,
            type: activityEvidenceType(row.contentType),
            description: note,
            submittedById: actor.userId,
          })),
        })
        return { updateId, evidence }
      },
    )
    if ('acknowledgement' in reservation)
      return {
        clientUpdateId,
        status: 'COMMITTED' as const,
        acknowledgement: reservation.acknowledgement,
      }
    const unverified = reservation.evidence.filter((row) => !row.storageReady)
    const urls = new Map<string, string>()
    if (unverified.length) {
      try {
        if (unverified.some((row) => row.bucket !== this.env.EVIDENCE_BUCKET))
          throw new Error('Unexpected evidence bucket')
        const signed = await this.storage.createPrivateUploadUrls(
          this.env.EVIDENCE_BUCKET,
          unverified.map((row) => row.objectKey),
        )
        unverified.forEach((row, index) => {
          if (signed[index]?.path !== row.objectKey) throw new Error('Unexpected upload URL')
          // An already stored object gets no URL; finalize verifies its exact bytes.
          const uploadUrl = signed[index].uploadUrl
          if (uploadUrl) urls.set(row.id, uploadUrl)
        })
      } catch {
        throw new ServiceUnavailableException(
          'Evidence upload could not be prepared. Retry the same update.',
        )
      }
    }
    return {
      clientUpdateId,
      updateId: reservation.updateId,
      status: unverified.length ? ('UPLOADING' as const) : ('READY_TO_COMMIT' as const),
      files: reservation.evidence.map((row) => ({
        evidenceId: row.id,
        fileName: row.fileName,
        contentType: row.contentType,
        byteSize: Number(row.byteSize),
        sha256: row.sha256,
        storageReady: row.storageReady,
        uploadUrl: urls.get(row.id) ?? null,
      })),
    }
  }

  /**
   * Verifies one directly uploaded evidence object outside any transaction (stored size,
   * leading bytes against the declared type, counted streamed SHA-256), marks it ready, and
   * when every file of the update is ready commits the update for review through the existing
   * ACTIVITY_PROOF_FINALIZE operation. A mismatch returns 422, deletes the unverified object
   * (best effort) and leaves the row unready, so the same update can retry.
   */
  async finalizeProofFile(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    updateId: string,
    evidenceId: string,
  ) {
    if (![projectId, activityId, updateId, evidenceId].every((id) => UUID_PATTERN.test(id)))
      throw new NotFoundException('Activity evidence unavailable.')
    const scope = { updateId: updateId.toLowerCase(), evidenceId: evidenceId.toLowerCase() }
    const readTarget = async (tx: Tx, actor: ApplicationIdentity) => {
      const activity = await requireActivity(tx, actor, projectId, activityId)
      await requireActiveAssignment(tx, actor, activity)
      const row = await tx.evidenceMedia.findFirst({
        where: {
          id: scope.evidenceId,
          organizationId: actor.organizationId,
          projectId: activity.projectId,
          activityId: activity.id,
          activityUpdateId: scope.updateId,
          submittedById: actor.userId,
          activityUpdate: { submittedById: actor.userId },
        },
        select: {
          id: true,
          bucket: true,
          objectKey: true,
          byteSize: true,
          sha256: true,
          contentType: true,
          storageReady: true,
          activityUpdate: { select: { status: true } },
        },
      })
      if (!row) throw new NotFoundException('Activity evidence unavailable.')
      return { activity, row }
    }
    const initial = await withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.proof.submit',
      async (tx, actor) => ({
        ...(await readTarget(tx, actor)),
        organizationId: actor.organizationId,
      }),
    )
    let verified = false
    if (initial.row.activityUpdate?.status === 'PENDING' && !initial.row.storageReady) {
      const row = initial.row
      const byteSize = Number(row.byteSize)
      if (!Number.isSafeInteger(byteSize) || byteSize > this.env.EVIDENCE_MAX_FILE_BYTES)
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'Unprocessable Entity',
          code: 'PROOF_FILE_TOO_LARGE',
          message: 'The evidence file exceeds the current per-file limit.',
        })
      let outcome: UploadVerification
      try {
        const verify = this.storageFactories.createPrivateUploadVerifier({
          serviceOrigin: this.env.SUPABASE_URL ?? '',
          serviceRoleKey: this.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
          evidenceBucket: this.env.EVIDENCE_BUCKET,
          maxBytes: this.env.EVIDENCE_MAX_FILE_BYTES,
          storageDeadlineMs: PROOF_STORAGE_DEADLINE_MS,
        })
        outcome = await verify({
          organizationId: initial.organizationId,
          projectId: initial.activity.projectId,
          evidenceId: row.id,
          bucket: row.bucket,
          objectKey: row.objectKey,
          expectedBytes: byteSize,
          expectedSha256: row.sha256,
          contentType: row.contentType ?? '',
          signal: new AbortController().signal,
          deadlineMonotonicMs: performance.now() + PROOF_STORAGE_DEADLINE_MS,
        })
      } catch {
        throw new ServiceUnavailableException(
          'Evidence verification is temporarily unavailable. Retry finalizing this file.',
        )
      }
      if (outcome !== 'VERIFIED') {
        if (outcome !== 'OBJECT_MISSING')
          await this.storage.deleteFile(row.bucket, row.objectKey).catch(() => undefined)
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'Unprocessable Entity',
          code: `PROOF_${outcome}`,
          message: verificationFailure[outcome],
        })
      }
      verified = true
    }
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.proof.submit',
      async (tx, actor) => {
        const { activity, row } = await readTarget(tx, actor)
        // Serialize finalizes of one update so exactly one of them observes the last ready file.
        // The submitter has no UPDATE row policy on activity_updates, so the row lock below locks
        // nothing for them; the advisory transaction lock keyed to the update is policy-free.
        await tx.$queryRaw`SELECT 1::integer AS locked FROM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${`proof-finalize:${scope.updateId}`},0))`
        await tx.$queryRaw`SELECT id FROM pathways.activity_updates WHERE organization_id=${actor.organizationId}::uuid
          AND project_id=${activity.projectId}::uuid AND activity_id=${activity.id}::uuid
          AND id=${scope.updateId}::uuid FOR UPDATE`
        const update = await tx.activityUpdate.findFirst({
          where: {
            id: scope.updateId,
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            submittedById: actor.userId,
          },
          select: {
            id: true,
            clientUpdateId: true,
            status: true,
            progressPercent: true,
            note: true,
            evidenceMedia_update: {
              select: {
                id: true,
                fileName: true,
                sha256: true,
                contentType: true,
                byteSize: true,
                storageReady: true,
              },
              orderBy: { id: 'asc' },
              take: MAX_ACTIVITY_EVIDENCE_FILES + 1,
            },
          },
        })
        if (!update) throw new NotFoundException('Activity evidence unavailable.')
        const files = update.evidenceMedia_update
        const body = proofFinalizeBody(update.id, update.progressPercent, update.note ?? '', files)
        const committed = (value: unknown) => ({
          status: 'COMMITTED' as const,
          acknowledgement: proofClientAcknowledgement(value, update.id, update.clientUpdateId),
        })
        if (update.status !== 'PENDING') {
          const acknowledgement = await readRuleSourceAcknowledgement(
            tx,
            'ACTIVITY_PROOF_FINALIZE',
            activity.projectId,
            activity.id,
            { kind: 'PROOF_FINALIZE', id: update.id, phase: 'FINALIZE' },
            body,
          )
          if (!acknowledgement)
            throw new ConflictException('This activity update is no longer awaiting evidence.')
          return committed(acknowledgement)
        }
        if (!row.storageReady) {
          if (!verified)
            throw new ConflictException('Activity evidence changed. Retry finalizing this file.')
          const marked = await tx.evidenceMedia.updateMany({
            where: {
              id: row.id,
              organizationId: actor.organizationId,
              activityUpdateId: update.id,
              submittedById: actor.userId,
              storageReady: false,
            },
            data: { storageReady: true },
          })
          if (marked.count !== 1)
            throw new ConflictException('Activity evidence changed. Retry finalizing this file.')
        }
        const remaining = files.filter((file) => !file.storageReady && file.id !== row.id).length
        if (remaining > 0) return { status: 'UPLOADING' as const, updateId: update.id, remaining }
        const source = await beginRuleSourceOperation(
          tx,
          'ACTIVITY_PROOF_FINALIZE',
          activity.projectId,
          activity.id,
          { kind: 'PROOF_FINALIZE', id: update.id, phase: 'FINALIZE' },
          body,
        )
        if (source.kind === 'REPLAY') return committed(source.acknowledgement)
        const current = await requireActivity(tx, actor, activity.projectId, activity.id)
        if (current.status !== 'IN_PROGRESS' && current.status !== 'FOR_REVIEW')
          throw new ConflictException('The activity can no longer enter review.')
        await tx.projectActivity.update({
          where: { id: current.id },
          data: {
            status: 'FOR_REVIEW',
            progressPercent: update.progressPercent,
            updatedAt: new Date(source.generatedValues.timestamp),
          },
        })
        await writeAuditLog(tx, actor, {
          projectId: activity.projectId,
          action: 'ACTIVITY_UPDATE_SUBMITTED',
          entityType: 'ActivityUpdate',
          entityId: update.id,
          changes: { progressPercent: update.progressPercent, proofCount: files.length },
        })
        const internalAcknowledgement = await finishRuleSourceOperation(
          tx,
          source.operationHandle,
          update.id,
        )
        const sourceAcknowledgement = proofClientAcknowledgement(
          internalAcknowledgement,
          update.id,
          update.clientUpdateId,
        )
        const result = await mapWithMetrics(
          tx,
          actor,
          await readScopedActivity(tx, actor, activity.projectId, activity.id),
          this.env.BUSINESS_TIME_ZONE,
        )
        return { status: 'COMMITTED' as const, activity: { ...result, sourceAcknowledgement } }
      },
    )
  }

  reviewUpdate(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    updateId: string,
    input: ReviewActivityUpdateRequest,
  ) {
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

  async downloadProof(
    identity: ApplicationIdentity,
    projectId: string,
    activityId: string,
    evidenceId: string,
  ) {
    const metadata = await withAuthorizedOperation(
      this.prisma,
      identity,
      'evidence.read',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
        if (!UUID_PATTERN.test(activityId) || !UUID_PATTERN.test(evidenceId))
          throw new NotFoundException('Proof unavailable.')
        const proof = await tx.evidenceMedia.findFirst({
          where: {
            id: evidenceId.toLowerCase(),
            organizationId: actor.organizationId,
            projectId: project.id,
            activityId: activityId.toLowerCase(),
            storageReady: true,
            activityUpdateId: { not: null },
          },
          select: {
            bucket: true,
            objectKey: true,
            fileName: true,
            contentType: true,
            sha256: true,
          },
        })
        if (!proof) throw new NotFoundException('Proof unavailable.')
        return proof
      },
    )
    const body = await this.storage.downloadPrivateFile(metadata.bucket, metadata.objectKey)
    // Bytes that no longer match the recorded digest are never released.
    if (createHash('sha256').update(body).digest('hex') !== metadata.sha256)
      throw new NotFoundException('Proof unavailable.')
    return { fileName: metadata.fileName, contentType: metadata.contentType, body }
  }

  listMilestones(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'activities.read', async (tx, actor) => {
      const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
      return tx.projectMilestone.findMany({
        where: { organizationId: actor.organizationId, projectId: project.id, archivedAt: null },
        orderBy: [{ targetDate: 'asc' }, { id: 'asc' }],
        take: 100,
      })
    })
  }

  createMilestone(identity: ApplicationIdentity, projectId: string, input: SaveMilestoneRequest) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'milestones.manage',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
        if (input.targetDate) {
          validateActivityDates(input.targetDate, input.targetDate, project)
        }
        const row = await tx.projectMilestone.create({
          data: {
            organizationId: actor.organizationId,
            projectId: project.id,
            title: input.title.trim(),
            description: input.description?.trim() || null,
            targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00.000Z`) : null,
          },
        })
        await writeAuditLog(tx, actor, {
          projectId: project.id,
          action: 'MILESTONE_CREATED',
          entityType: 'ProjectMilestone',
          entityId: row.id,
        })
        return row
      },
    )
  }

  updateMilestone(
    identity: ApplicationIdentity,
    projectId: string,
    milestoneId: string,
    input: UpdateMilestoneRequest,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'milestones.manage',
      async (tx, actor) => {
        const project = await requireScopedProjectRow(tx, actor, projectId, projectDateFields)
        if (!UUID_PATTERN.test(milestoneId)) throw new NotFoundException('Milestone unavailable.')
        if (input.targetDate) {
          validateActivityDates(input.targetDate, input.targetDate, project)
        }
        if (input.status === 'COMPLETED' && !input.completionDate) {
          throw new BadRequestException('A completed milestone requires its completion date.')
        }
        if (input.completionDate) {
          validateActivityDates(input.completionDate, input.completionDate, project)
        }
        const expected = new Date(input.expectedUpdatedAt)
        const changed = await tx.projectMilestone.updateMany({
          where: {
            id: milestoneId.toLowerCase(),
            organizationId: actor.organizationId,
            projectId: project.id,
            archivedAt: null,
            updatedAt: expected,
          },
          data: {
            title: input.title.trim(),
            description: input.description?.trim() || null,
            targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00.000Z`) : null,
            status: input.status,
            completionDate:
              input.status === 'COMPLETED' && input.completionDate
                ? new Date(`${input.completionDate}T00:00:00.000Z`)
                : null,
          },
        })
        if (changed.count !== 1)
          throw new ConflictException('Milestone changed; reload before saving.')
        const row = await tx.projectMilestone.findUniqueOrThrow({
          where: { id: milestoneId.toLowerCase() },
        })
        await writeAuditLog(tx, actor, {
          projectId: project.id,
          action: 'MILESTONE_UPDATED',
          entityType: 'ProjectMilestone',
          entityId: row.id,
          changes: { status: row.status },
        })
        return row
      },
    )
  }
}
