import { randomUUID } from 'node:crypto'
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
  type ReserveActivityProofRequest,
  type TransitionActivityRequest,
  type UpdateActivityRequest,
  businessCalendarDate,
  hasAtomicPermission,
} from '@pathways/shared'
import { writeAuditLog } from '../../common/audit/write-audit-log'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
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
  activityTransitionAllowed,
  assignableOfficerLimit,
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
}
