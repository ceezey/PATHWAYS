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
import { Prisma } from '@prisma/client'

import { readApiEnv } from '@pathways/config'
import { PrismaService } from '../../prisma/prisma.service'
import { readApplicationProfile } from '../auth/application-profile.service'
import { aggregateOnlyRoles, hasAtomicPermission } from '../auth/authorization-policy'
import { projectScope } from '../auth/authorized-data.service'
import { withAuthorizedOperation } from '../auth/authorized-operation'
import { type ApplicationIdentity, UUID_PATTERN } from '../auth/developer-access'
import {
  PrivateInspectionReadError,
  type UploadVerification,
  createPrivateUploadVerifier,
} from '../storage/private-inspection-reader'
import { StorageService } from '../storage/storage.service'
import {
  type ActivityEvidenceContentType,
  type ActivityEvidenceFileDto,
  type CreateActivityDto,
  MAX_ACTIVITY_EVIDENCE_FILES,
  PROOF_STORAGE_DEADLINE_MS,
  type RecordActivityProgressDto,
  type RecordOverdueExplanationDto,
  type ReserveActivityProofDto,
  type ReviewActivityUpdateDto,
  type SaveMilestoneDto,
  type TransitionActivityDto,
  type UpdateActivityDto,
  type UpdateMilestoneDto,
  activityEvidenceContentTypes,
} from './activities.dto'

// Create and update write assignments, links, budget and rule sources in one transaction; 5s is too short on the pooled remote DB.
const ACTIVITY_SAVE_TRANSACTION_TIMEOUT_MS = 20_000

type Tx = Prisma.TransactionClient
const activityBudgetCategory = 'ACTIVITY_PROFILE_TOTAL'

const activitySelection = {
  id: true,
  projectId: true,
  code: true,
  title: true,
  description: true,
  activityType: true,
  timelineOverrideJustification: true,
  targetBeneficiaries: true,
  plannedStartDate: true,
  plannedEndDate: true,
  actualStartDate: true,
  actualEndDate: true,
  status: true,
  progressPercent: true,
  reviewedById: true,
  reviewedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  updatedAt: true,
  projectActivityAssignment_activity: {
    where: { status: 'ACTIVE' as const, endedAt: null },
    select: {
      projectAssignment: {
        select: { userId: true, user: { select: { fullName: true, email: true } } },
      },
    },
    orderBy: { id: 'asc' as const },
    take: 50,
  },
  activityUpdate_activity: {
    select: {
      id: true,
      progressPercent: true,
      note: true,
      status: true,
      clientUpdateId: true,
      submittedById: true,
      beneficiariesReachedThisSession: true,
      submittedAt: true,
      reviewedAt: true,
      reviewReason: true,
      updatedAt: true,
      submittedBy: { select: { fullName: true } },
      reviewedBy: { select: { fullName: true } },
      evidenceMedia_update: {
        where: { storageReady: true },
        select: {
          id: true,
          fileName: true,
          status: true,
          rejectionReason: true,
          submittedAt: true,
        },
        orderBy: { id: 'asc' as const },
        take: 10,
      },
      // Proof submissions always carry at least one evidence row; a zero count marks a
      // progress-only note recorded under activities.progress.update.
      _count: { select: { evidenceMedia_update: true } },
    },
    orderBy: { submittedAt: 'asc' as const },
    take: 100,
  },
  activityJourneyStageMapping_activity: {
    select: { stageId: true },
    orderBy: { sequenceOrder: 'asc' as const },
    take: 100,
  },
  activityIndicatorLink_activity: {
    select: { indicatorId: true },
    orderBy: { indicatorId: 'asc' as const },
    take: 100,
  },
  activityOverdueExplanation_activity: {
    select: {
      id: true,
      category: true,
      explanation: true,
      recordedAt: true,
      recordedBy: { select: { fullName: true } },
    },
    orderBy: { recordedAt: 'desc' as const },
    take: 100,
  },
} satisfies Prisma.ProjectActivitySelect

type ActivityRow = Prisma.ProjectActivityGetPayload<{ select: typeof activitySelection }>

/**
 * List projection: only what the activity list, board, search and pickers render.
 * Update history, proof metadata, assignee emails and read metrics come only from `get`.
 */
const activityListSelection = {
  id: true,
  projectId: true,
  code: true,
  title: true,
  description: true,
  targetBeneficiaries: true,
  plannedStartDate: true,
  plannedEndDate: true,
  status: true,
  progressPercent: true,
  updatedAt: true,
  projectActivityAssignment_activity: {
    where: activitySelection.projectActivityAssignment_activity.where,
    select: {
      projectAssignment: { select: { userId: true, user: { select: { fullName: true } } } },
    },
    orderBy: activitySelection.projectActivityAssignment_activity.orderBy,
    take: activitySelection.projectActivityAssignment_activity.take,
  },
  activityJourneyStageMapping_activity: activitySelection.activityJourneyStageMapping_activity,
  activityIndicatorLink_activity: activitySelection.activityIndicatorLink_activity,
  // Lean projection for overdueExplanationNeeded only: no category/explanation/actor text,
  // those are detail-only (see activitySelection.activityOverdueExplanation_activity).
  activityOverdueExplanation_activity: {
    select: { recordedAt: true },
    orderBy: { recordedAt: 'desc' as const },
    take: 100,
  },
} satisfies Prisma.ProjectActivitySelect

type ActivityListRow = Prisma.ProjectActivityGetPayload<{ select: typeof activityListSelection }>

/**
 * Capability input read in the same scoped activity query: the caller's own active
 * assignment on the activity, matching the recordProgress and submitUpdate checks.
 */
function personalAssignmentCount(actor: ApplicationIdentity) {
  return {
    _count: {
      select: {
        projectActivityAssignment_activity: {
          where: {
            organizationId: actor.organizationId,
            status: 'ACTIVE' as const,
            endedAt: null,
            projectAssignment: { userId: actor.userId, status: 'ACTIVE' as const, endedAt: null },
          },
        },
      },
    },
  } satisfies Prisma.ProjectActivitySelect
}

/**
 * Advisory per-activity flags for the calling user. Every mutation re-checks its own
 * authority, so a forged or stale flag changes nothing. Scope is already applied: only
 * activities of projects inside `projectScope(actor)` reach this function.
 */
export function activityCapabilities(
  actor: ApplicationIdentity,
  status: keyof typeof storedStatus,
  personalAssignments: number | undefined,
) {
  const can = (
    permission:
      | 'activities.update'
      | 'activities.progress.update'
      | 'activities.proof.submit'
      | 'monitoring.review',
  ) => hasAtomicPermission(actor.roles[0], actor.permissions, permission)
  const assigned = (personalAssignments ?? 0) > 0
  return {
    canEdit: can('activities.update') && !['COMPLETED', 'CANCELLED'].includes(status),
    canRecordProgress: can('activities.progress.update') && assigned,
    canSubmitProof: can('activities.proof.submit') && assigned,
    // Project-scoped, not the personal activity assignment `assigned` reflects: any row
    // reaching this function was already resolved through projectScope(actor) (see
    // requireProject), which is the same project-assignment-or-org-wide rule
    // pathways.p05_has_project_permission('monitoring.review', ...) applies at the RLS layer.
    canExplainOverdue: can('monitoring.review'),
  }
}

/** Exactly the users `resolveAssignments` accepts; the assignee bound is 50. */
const assignableOfficerLimit = 50

const storedStatus = {
  NOT_STARTED: 'Planned',
  IN_PROGRESS: 'In Progress',
  FOR_REVIEW: 'For Review',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
} as const

const reviewStatus = {
  PENDING: 'Submitted',
  VERIFIED: 'Accepted',
  APPROVED: 'Accepted',
  REJECTED: 'Flagged',
} as const

function calendarDate(date: Date | null) {
  return date?.toISOString().slice(0, 10) ?? ''
}

export function activityPresentationStatus(
  status: keyof typeof storedStatus,
  plannedEndDate: Date | null,
  businessDate: string,
) {
  const overdue =
    Boolean(plannedEndDate) &&
    calendarDate(plannedEndDate) < businessDate &&
    !['COMPLETED', 'CANCELLED'].includes(status)
  return { overdue, status: overdue ? ('Overdue' as const) : storedStatus[status] }
}

export function activityTransitionAllowed(
  current: keyof typeof storedStatus,
  requested: 'IN_PROGRESS' | 'CANCELLED',
) {
  return requested === 'IN_PROGRESS'
    ? current === 'NOT_STARTED'
    : ['NOT_STARTED', 'IN_PROGRESS'].includes(current)
}

type ActivityReadMetrics = {
  budgets: ReadonlyMap<string, string>
  reached: ReadonlyMap<string, number>
  /** Present only for viewers holding expenses.read; absent means not readable. */
  logged: ReadonlyMap<string, { total: string; entries: number }>
}

const emptyActivityReadMetrics: ActivityReadMetrics = {
  budgets: new Map(),
  reached: new Map(),
  logged: new Map(),
}

function updateKind(update: {
  _count?: { evidenceMedia_update: number }
  evidenceMedia_update: unknown[]
}): 'proof' | 'progress' {
  return (update._count?.evidenceMedia_update ?? update.evidenceMedia_update.length) > 0
    ? 'proof'
    : 'progress'
}

function mapActivity(
  row: ActivityRow,
  businessDate: string,
  metrics: ActivityReadMetrics = emptyActivityReadMetrics,
  viewerId?: string,
) {
  const presentation = activityPresentationStatus(row.status, row.plannedEndDate, businessDate)
  const updates = row.activityUpdate_activity
  return {
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    title: row.title,
    description: row.description ?? '',
    activityType: row.activityType,
    timelineOverrideJustification: row.timelineOverrideJustification,
    storedStatus: row.status,
    status: presentation.status,
    overdue: presentation.overdue,
    startDate: calendarDate(row.plannedStartDate),
    dueDate: calendarDate(row.plannedEndDate),
    actualStartDate: calendarDate(row.actualStartDate) || null,
    actualEndDate: calendarDate(row.actualEndDate) || null,
    assignedUserIds: row.projectActivityAssignment_activity.map(
      (assignment) => assignment.projectAssignment.userId,
    ),
    assignedTo: row.projectActivityAssignment_activity.map(
      (assignment) => assignment.projectAssignment.user.fullName,
    ),
    assignedEmails: row.projectActivityAssignment_activity.map(
      (assignment) => assignment.projectAssignment.user.email,
    ),
    journeyStageIds: row.activityJourneyStageMapping_activity.map((mapping) => mapping.stageId),
    journeyStageId: row.activityJourneyStageMapping_activity[0]?.stageId ?? '',
    indicatorIds: row.activityIndicatorLink_activity.map((link) => link.indicatorId),
    targetBeneficiaries: row.targetBeneficiaries ?? 0,
    beneficiariesReached: metrics.reached.get(row.id) ?? 0,
    budgetAllocation: metrics.budgets.get(row.id) ?? null,
    progress: row.progressPercent,

    reviewedById: row.reviewedById,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    cancellationReason: row.cancellationReason,
    submittedProof: updates.flatMap((update) =>
      update.evidenceMedia_update.map((proof) => ({
        id: proof.id,
        updateId: update.id,
        fileName: proof.fileName,
        status: reviewStatus[proof.status],
        // Why this file alone was not enough, so the submitter can fix that file.
        rejectionReason: proof.rejectionReason,
        submittedAt: proof.submittedAt.toISOString(),
        submittedBy: update.submittedBy.fullName,
        updateUpdatedAt: update.updatedAt.toISOString(),
        note: update.note,
      })),
    ),
    updateNotes: updates.map((update) => {
      // A PENDING proof whose files are not all verified in storage yet (the read above lists
      // only verified files). Only its submitter receives the id needed to resume it.
      // It is also incomplete when every file is verified but the update never committed (the
      // activity is not FOR_REVIEW): the submitter must be able to resume it to send the finalize.
      const evidenceCount =
        update._count?.evidenceMedia_update ?? update.evidenceMedia_update.length
      const proofIncomplete =
        update.status === 'PENDING' &&
        (evidenceCount > update.evidenceMedia_update.length ||
          (evidenceCount > 0 && row.status !== 'FOR_REVIEW'))
      return {
        id: update.id,
        proofIncomplete,
        resumeClientUpdateId:
          proofIncomplete && viewerId && update.submittedById === viewerId
            ? update.clientUpdateId
            : null,
        kind: updateKind(update),
        note: update.note,
        progress: update.progressPercent,
        beneficiariesReachedThisSession: update.beneficiariesReachedThisSession ?? null,
        status: reviewStatus[update.status],
        submittedBy: update.submittedBy.fullName,
        submittedAt: update.submittedAt.toISOString(),
        reviewedBy: update.reviewedBy?.fullName ?? null,
        reviewedAt: update.reviewedAt?.toISOString() ?? null,
        reviewReason: update.reviewReason,
        updatedAt: update.updatedAt.toISOString(),
      }
    }),
    updatedAt: row.updatedAt.toISOString(),
    // Approved expenses only; null when the viewer cannot read expenses, never a fabricated 0.
    budgetLogged: metrics.logged.get(row.id)?.total ?? null,
    budgetLoggedEntries: metrics.logged.get(row.id)?.entries ?? null,
    overdueExplanations: row.activityOverdueExplanation_activity.map((explanation) => ({
      id: explanation.id,
      category: explanation.category,
      explanation: explanation.explanation,
      actorName: explanation.recordedBy.fullName,
      recordedAt: explanation.recordedAt.toISOString(),
    })),
    overdueExplanationNeeded:
      presentation.overdue &&
      !hasExplanationSinceDue(row.activityOverdueExplanation_activity, row.plannedEndDate),
  }
}

/** True when an overdue explanation was recorded on or after the planned end date. */
function hasExplanationSinceDue(explanations: { recordedAt: Date }[], plannedEndDate: Date | null) {
  return explanations.some(
    (explanation) => calendarDate(explanation.recordedAt) >= calendarDate(plannedEndDate),
  )
}

/** A plain object, so server-computed per-item fields can be added without a detail read. */
export function mapActivityListItem(row: ActivityListRow, businessDate: string) {
  const presentation = activityPresentationStatus(row.status, row.plannedEndDate, businessDate)
  return {
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    title: row.title,
    description: row.description ?? '',
    storedStatus: row.status,
    status: presentation.status,
    overdue: presentation.overdue,
    startDate: calendarDate(row.plannedStartDate),
    dueDate: calendarDate(row.plannedEndDate),
    assignedUserIds: row.projectActivityAssignment_activity.map(
      (assignment) => assignment.projectAssignment.userId,
    ),
    assignedTo: row.projectActivityAssignment_activity.map(
      (assignment) => assignment.projectAssignment.user.fullName,
    ),
    journeyStageIds: row.activityJourneyStageMapping_activity.map((mapping) => mapping.stageId),
    journeyStageId: row.activityJourneyStageMapping_activity[0]?.stageId ?? '',
    indicatorIds: row.activityIndicatorLink_activity.map((link) => link.indicatorId),
    targetBeneficiaries: row.targetBeneficiaries ?? 0,
    progress: row.progressPercent,
    updatedAt: row.updatedAt.toISOString(),
    overdueExplanationNeeded:
      presentation.overdue &&
      !hasExplanationSinceDue(row.activityOverdueExplanation_activity, row.plannedEndDate),
  }
}

export const evidenceExtension: Record<ActivityEvidenceContentType, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
}

/** Activity-update evidence is typed from its verified content type (0041). */
export function activityEvidenceType(contentType: ActivityEvidenceContentType) {
  return contentType.startsWith('image/')
    ? ('PHOTO' as const)
    : contentType.startsWith('video/')
      ? ('VIDEO' as const)
      : ('DOCUMENT' as const)
}

export function activityEvidenceLimits(maxFileBytes: number) {
  return {
    maxFiles: MAX_ACTIVITY_EVIDENCE_FILES,
    maxFileBytes,
    maxTotalBytes: maxFileBytes * 5,
    contentTypes: [...activityEvidenceContentTypes],
  }
}

const proofRejection = (code: string, message: string) =>
  new BadRequestException({ statusCode: 400, error: 'Bad Request', code, message })

/** Bounded, normalized proof declarations. Checked before any database or storage work. */
export function proofDeclarations(files: ActivityEvidenceFileDto[], maxFileBytes: number) {
  const limits = activityEvidenceLimits(maxFileBytes)
  if (!Array.isArray(files) || files.length < 1 || files.length > limits.maxFiles)
    throw proofRejection('PROOF_FILE_COUNT', 'Attach between one and ten evidence files.')
  const declared = files.map((file) => {
    const fileName = typeof file.fileName === 'string' ? file.fileName.trim() : ''
    if (
      !fileName ||
      fileName.length > 128 ||
      /[\/]/.test(fileName) ||
      !activityEvidenceContentTypes.includes(file.contentType) ||
      !/^[0-9a-f]{64}$/.test(file.sha256) ||
      !Number.isSafeInteger(file.byteSize) ||
      file.byteSize < 1
    )
      throw proofRejection('PROOF_FILE_INVALID', 'An evidence file has an invalid name or type.')
    if (file.byteSize > limits.maxFileBytes)
      throw proofRejection('PROOF_FILE_TOO_LARGE', 'An evidence file exceeds the per-file limit.')
    return {
      fileName,
      contentType: file.contentType,
      byteSize: file.byteSize,
      sha256: file.sha256,
    }
  })
  if (new Set(declared.map((file) => file.sha256)).size !== declared.length)
    throw proofRejection('PROOF_FILE_DUPLICATE', 'The same evidence file was attached twice.')
  if (declared.reduce((total, file) => total + file.byteSize, 0) > limits.maxTotalBytes)
    throw proofRejection('PROOF_TOTAL_TOO_LARGE', 'The evidence files exceed the total limit.')
  return declared
}

const declarationKey = (file: {
  fileName: string
  sha256: string
  contentType: string | null
  byteSize: number | bigint | null
}) => JSON.stringify([file.fileName, file.sha256, file.contentType, String(file.byteSize)])

const verificationFailure: Record<Exclude<UploadVerification, 'VERIFIED'>, string> = {
  OBJECT_MISSING: 'The evidence file was not uploaded. Upload it, then finalize again.',
  SIZE_MISMATCH: 'The uploaded evidence file size does not match its declaration.',
  TYPE_MISMATCH: 'The uploaded evidence file content does not match its declared type.',
  DIGEST_MISMATCH: 'The uploaded evidence file content does not match its declared digest.',
}

@Injectable()
export class ActivitiesService {
  private readonly env = readApiEnv(process.env)

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  private businessDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.env.BUSINESS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return `${values.year}-${values.month}-${values.day}`
  }

  private async requireProject(tx: Tx, actor: ApplicationIdentity, projectId: string) {
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
      select: { id: true, startDate: true, endDate: true },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
    return project
  }

  /**
   * Reads one activity of a project already verified by `requireProject` in this same
   * transaction. Post-write read-backs use it so project scope is not resolved twice.
   */
  private async readScopedActivity(
    tx: Tx,
    actor: ApplicationIdentity,
    verifiedProjectId: string,
    activityId: string,
  ) {
    if (!UUID_PATTERN.test(activityId)) throw new NotFoundException('Activity unavailable.')
    const activity = await tx.projectActivity.findFirst({
      relationLoadStrategy: 'join',
      where: {
        id: activityId.toLowerCase(),
        organizationId: actor.organizationId,
        projectId: verifiedProjectId,
        archivedAt: null,
      },
      select: { ...activitySelection, ...personalAssignmentCount(actor) },
    })
    if (!activity) throw new NotFoundException('Activity unavailable.')
    return activity
  }

  private async requireProjectActivity(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    activityId: string,
  ) {
    const project = await this.requireProject(tx, actor, projectId)
    const activity = await this.readScopedActivity(tx, actor, project.id, activityId)
    return { project, activity }
  }

  private async requireActivity(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    activityId: string,
  ) {
    return (await this.requireProjectActivity(tx, actor, projectId, activityId)).activity
  }

  private validateDates(
    start: string,
    end: string,
    project: { startDate: Date | null; endDate: Date | null },
    timelineOverrideJustification?: string,
  ) {
    if (end < start)
      throw new BadRequestException('Activity end date must not precede its start date.')
    const projectStart = calendarDate(project.startDate)
    const projectEnd = calendarDate(project.endDate)
    const outsideProject =
      (projectStart && start < projectStart) || (projectEnd && end > projectEnd)
    const justification = timelineOverrideJustification?.trim() || null
    if (outsideProject && !justification) {
      throw new BadRequestException(
        'A timeline override justification is required outside the project dates.',
      )
    }
    return justification
  }

  private async resolveAssignments(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    userIds: string[],
  ) {
    const ids = userIds.map((id) => id.toLowerCase())
    const assignments = await tx.userProjectAssignment.findMany({
      where: {
        organizationId: actor.organizationId,
        projectId,
        userId: { in: ids },
        status: 'ACTIVE',
        endedAt: null,
        user: {
          accountStatus: 'ACTIVE',
          archivedAt: null,
          role: { code: 'PROJECT_OFFICER', isActive: true },
        },
      },
      select: { id: true, userId: true },
      take: 50,
    })
    if (
      assignments.length !== ids.length ||
      new Set(assignments.map((row) => row.userId)).size !== ids.length
    ) {
      throw new BadRequestException(
        'Every activity assignee must be an active Project Officer assigned to this project.',
      )
    }
    return assignments
  }

  private async resolveIndicators(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    indicatorIds: string[] | undefined,
  ) {
    if (indicatorIds === undefined) return undefined
    const ids = indicatorIds.map((id) => id.toLowerCase())
    if (ids.length === 0) return []
    if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'indicators.update')) {
      throw new ForbiddenException('Indicator-link authority is missing.')
    }
    const rows = await tx.projectIndicator.findMany({
      where: {
        id: { in: ids },
        organizationId: actor.organizationId,
        projectId,
        archivedAt: null,
      },
      select: { id: true },
      take: 101,
    })
    if (rows.length !== ids.length || new Set(rows.map((row) => row.id)).size !== ids.length) {
      throw new BadRequestException('Every connected indicator must belong to this project.')
    }
    return ids
  }

  private async resolveJourneyStage(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    journeyStageId: string | null | undefined,
  ) {
    if (journeyStageId === undefined || journeyStageId === null) return journeyStageId
    if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'journeys.read')) {
      throw new ForbiddenException('Journey-stage link authority is missing.')
    }
    const id = journeyStageId.toLowerCase()
    const stage = await tx.journeyStage.findFirst({
      where: { id, organizationId: actor.organizationId, projectId, archivedAt: null },
      select: { id: true },
    })
    if (!stage)
      throw new BadRequestException('The selected journey stage must belong to this project.')
    return stage.id
  }

  private async replaceActivityLinks(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    activityId: string,
    indicatorIds: string[] | undefined,
    journeyStageId: string | null | undefined,
  ) {
    if (indicatorIds !== undefined) {
      await tx.activityIndicatorLink.deleteMany({
        where: { organizationId: actor.organizationId, projectId, activityId },
      })
      if (indicatorIds.length) {
        await tx.activityIndicatorLink.createMany({
          data: indicatorIds.map((indicatorId) => ({
            organizationId: actor.organizationId,
            projectId,
            activityId,
            indicatorId,
            createdById: actor.userId,
          })),
        })
      }
    }
    if (journeyStageId !== undefined) {
      await tx.activityJourneyStageMapping.deleteMany({
        where: { organizationId: actor.organizationId, projectId, activityId },
      })
      if (journeyStageId) {
        await tx.activityJourneyStageMapping.create({
          data: {
            organizationId: actor.organizationId,
            projectId,
            activityId,
            stageId: journeyStageId,
            sequenceOrder: 1,
            createdById: actor.userId,
          },
        })
      }
    }
  }

  private activityBudgetValue(value: string) {
    try {
      return new Prisma.Decimal(value)
    } catch {
      throw new BadRequestException('Activity budget must be a valid non-negative PHP amount.')
    }
  }

  private async saveActivityBudget(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    activityId: string,
    value: string | undefined,
    operation: 'create' | 'update',
  ) {
    if (value === undefined) return
    const canCreate = hasAtomicPermission(actor.roles[0], actor.permissions, 'budgets.create')
    const canUpdate = hasAtomicPermission(actor.roles[0], actor.permissions, 'budgets.update')
    if (!canCreate || (operation === 'update' && !canUpdate)) {
      throw new ForbiddenException('Activity budget authority is missing.')
    }
    const plannedBudget = this.activityBudgetValue(value)
    const current = await tx.projectBudgetRecord.findFirst({
      where: {
        organizationId: actor.organizationId,
        projectId,
        activityId,
        category: activityBudgetCategory,
        archivedAt: null,
      },
      select: { id: true, plannedBudget: true },
    })
    if (current?.plannedBudget.equals(plannedBudget)) return
    if (current) {
      await tx.projectBudgetRecord.update({
        where: { id: current.id },
        data: { archivedAt: new Date() },
      })
    }
    await tx.projectBudgetRecord.create({
      data: {
        organizationId: actor.organizationId,
        projectId,
        activityId,
        category: activityBudgetCategory,
        currency: 'PHP',
        plannedBudget,
        remarks: 'Activity profile planned budget.',
        recordedById: actor.userId,
      },
    })
  }

  private async readMetrics(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    activityIds: string[],
  ): Promise<ActivityReadMetrics> {
    const budgets = new Map<string, string>()
    const reached = new Map<string, number>()
    const logged = new Map<string, { total: string; entries: number }>()
    if (activityIds.length === 0) return { budgets, reached, logged }
    if (hasAtomicPermission(actor.roles[0], actor.permissions, 'budgets.read')) {
      // Every live budget line for the activity, not just its envelope row, so the detail
      // allocation matches the list utilization and the finance ledger. A replaced
      // (archived) line keeps its spend but no longer contributes a plan.
      const rows = await tx.projectBudgetRecord.findMany({
        where: {
          organizationId: actor.organizationId,
          projectId,
          activityId: { in: activityIds },
          archivedAt: null,
        },
        select: { activityId: true, plannedBudget: true },
        take: 1000,
      })
      const planned = new Map<string, Prisma.Decimal>()
      for (const row of rows) {
        if (!row.activityId) continue
        planned.set(
          row.activityId,
          (planned.get(row.activityId) ?? new Prisma.Decimal(0)).add(row.plannedBudget),
        )
      }
      for (const [activityId, total] of planned) budgets.set(activityId, total.toFixed(2))
    }
    for (const [id, count] of await this.readReached(tx, actor, projectId, activityIds)) {
      reached.set(id, count)
    }
    // Same grant as GET /expenses; the expense SELECT policy also requires it per project.
    // Logged means APPROVED, as in the finance ledger and the overview budget metric.
    // Expenses on an archived (replaced) activity budget record still count. Only the
    // single-activity read calls this, so the loop is one aggregate query.
    if (hasAtomicPermission(actor.roles[0], actor.permissions, 'expenses.read')) {
      for (const activityId of activityIds) {
        const row = await tx.budgetExpenseEntry.aggregate({
          where: {
            organizationId: actor.organizationId,
            projectId,
            status: 'APPROVED',
            budgetRecord: { organizationId: actor.organizationId, projectId, activityId },
          },
          _sum: { amount: true },
          _count: { _all: true },
        })
        logged.set(activityId, {
          total: (row._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
          entries: row._count._all,
        })
      }
    }
    return { budgets, reached, logged }
  }

  /** APPROVED beneficiaries reached per activity; empty without beneficiaries.aggregates.read. */
  private async readReached(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    activityIds: string[],
  ) {
    const reached = new Map<string, number>()
    if (!hasAtomicPermission(actor.roles[0], actor.permissions, 'beneficiaries.aggregates.read')) {
      return reached
    }
    // Authorized callers see 0, not null, for activities with no approved sessions yet.
    for (const id of activityIds) reached.set(id, 0)
    // Sums APPROVED session counts; p08_activity_beneficiaries_reached runs as the owner, which
    // forced RLS on activity_updates hides, so it always returned 0.
    const rows = await tx.activityUpdate.groupBy({
      by: ['activityId'],
      where: {
        organizationId: actor.organizationId,
        projectId,
        activityId: { in: activityIds },
        status: 'APPROVED',
        activity: { status: { not: 'CANCELLED' }, archivedAt: null },
      },
      _sum: { beneficiariesReachedThisSession: true },
    })
    for (const row of rows)
      reached.set(row.activityId, row._sum.beneficiariesReachedThisSession ?? 0)
    return reached
  }

  /**
   * Batched list metrics: reached needs beneficiaries.aggregates.read; budget utilization
   * needs budgets.read AND expenses.read (approved spend over planned), else null.
   */
  private async readListMetrics(
    tx: Tx,
    actor: ApplicationIdentity,
    projectId: string,
    activityIds: string[],
  ) {
    const budgetUtilization = new Map<string, number | null>()
    if (activityIds.length === 0) return { reached: new Map<string, number>(), budgetUtilization }
    const reached = await this.readReached(tx, actor, projectId, activityIds)
    const can = (permission: 'budgets.read' | 'expenses.read') =>
      hasAtomicPermission(actor.roles[0], actor.permissions, permission)
    if (can('budgets.read') && can('expenses.read')) {
      const records = await tx.projectBudgetRecord.findMany({
        where: { organizationId: actor.organizationId, projectId, activityId: { in: activityIds } },
        select: { id: true, activityId: true, plannedBudget: true, archivedAt: true },
        take: 1000,
      })
      const spend = await tx.budgetExpenseEntry.groupBy({
        by: ['budgetRecordId'],
        where: {
          organizationId: actor.organizationId,
          projectId,
          status: 'APPROVED',
          budgetRecordId: { in: records.map((record) => record.id) },
        },
        _sum: { amount: true },
      })
      const spendByRecord = new Map(
        spend.map((row) => [row.budgetRecordId, Number(row._sum.amount ?? 0)]),
      )
      const totals = new Map<string, { planned: number; used: number }>()
      for (const record of records) {
        if (!record.activityId) continue
        const total = totals.get(record.activityId) ?? { planned: 0, used: 0 }
        // Spend on an archived (replaced) record still counts, its plan does not.
        if (!record.archivedAt) total.planned += Number(record.plannedBudget)
        total.used += spendByRecord.get(record.id) ?? 0
        totals.set(record.activityId, total)
      }
      for (const [id, { planned, used }] of totals) {
        budgetUtilization.set(id, planned > 0 ? Math.round((used / planned) * 100) : null)
      }
    }
    return { reached, budgetUtilization }
  }

  private async mapWithMetrics(
    tx: Tx,
    actor: ApplicationIdentity,
    row: ActivityRow & { _count?: { projectActivityAssignment_activity: number } },
  ) {
    const metrics = await this.readMetrics(tx, actor, row.projectId, [row.id])
    return {
      ...mapActivity(row, this.businessDate(), metrics, actor.userId),
      capabilities: activityCapabilities(
        actor,
        row.status,
        row._count?.projectActivityAssignment_activity,
      ),
    }
  }

  context(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.context.read',
      async (tx, actor) => {
        if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
        const project = await tx.project.findFirst({
          where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
          select: {
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
          },
        })
        if (!project) throw new NotFoundException('Project unavailable.')
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
      const project = await this.requireProject(tx, actor, projectId)
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
      const today = this.businessDate()
      const metrics = await this.readListMetrics(
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
      if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
      const where = { AND: [projectScope(actor), { id: projectId.toLowerCase() }] }
      const activityWhere = { organizationId: actor.organizationId, archivedAt: null }
      if (aggregateOnlyRoles.includes(actor.roles[0])) {
        const project = await tx.project.findFirst({
          where,
          select: {
            projectActivity_project: {
              where: activityWhere,
              select: { id: true, title: true },
              orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
              take: 100,
            },
          },
        })
        if (!project) throw new NotFoundException('Project unavailable.')
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
      const project = await tx.project.findFirst({
        where,
        select: {
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
                      ...activitySelection.activityUpdate_activity.select.evidenceMedia_update
                        .select,
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
        },
      })
      if (!project) throw new NotFoundException('Project unavailable.')
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
      return this.mapWithMetrics(tx, actor, activity)
    })
  }

  create(identity: ApplicationIdentity, projectId: string, input: CreateActivityDto) {
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
        const project = await this.requireProject(tx, actor, projectId)
        const timelineOverrideJustification = this.validateDates(
          input.plannedStartDate,
          input.plannedEndDate,
          project,
          input.timelineOverrideJustification,
        )
        const assignments = await this.resolveAssignments(
          tx,
          actor,
          project.id,
          input.assignedUserIds,
        )
        const indicatorIds = await this.resolveIndicators(tx, actor, project.id, input.indicatorIds)
        const journeyStageId = await this.resolveJourneyStage(
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
        await this.replaceActivityLinks(
          tx,
          actor,
          project.id,
          activityId,
          indicatorIds ?? [],
          journeyStageId === undefined ? null : journeyStageId,
        )
        await this.saveActivityBudget(
          tx,
          actor,
          project.id,
          activityId,
          input.budgetAllocation,
          'create',
        )
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: project.id,
            action: 'ACTIVITY_CREATED',
            entityType: 'ProjectActivity',
            entityId: activityId,
            changes: { code: input.code ?? 'SERVER_GENERATED', assigneeCount: assignments.length },
          },
        })
        const sourceAcknowledgement = await finishRuleSourceOperation(
          tx,
          source.operationHandle,
          input.clientMutationId,
        )
        const result = await this.mapWithMetrics(
          tx,
          actor,
          await this.readScopedActivity(tx, actor, project.id, activityId),
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
    input: UpdateActivityDto,
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
        const { project, activity: current } = await this.requireProjectActivity(
          tx,
          actor,
          projectId,
          activityId,
        )
        if (['COMPLETED', 'CANCELLED'].includes(current.status)) {
          throw new ConflictException('Terminal activity history cannot be edited.')
        }
        const timelineOverrideJustification = this.validateDates(
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
        const assignments = await this.resolveAssignments(
          tx,
          actor,
          project.id,
          input.assignedUserIds,
        )
        const indicatorIds = await this.resolveIndicators(tx, actor, project.id, input.indicatorIds)
        const journeyStageId = await this.resolveJourneyStage(
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
        await this.replaceActivityLinks(
          tx,
          actor,
          project.id,
          current.id,
          indicatorIds,
          journeyStageId,
        )
        await this.saveActivityBudget(
          tx,
          actor,
          project.id,
          current.id,
          input.budgetAllocation,
          'update',
        )
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: project.id,
            action: 'ACTIVITY_UPDATED',
            entityType: 'ProjectActivity',
            entityId: current.id,
            changes: { assigneeCount: assignments.length },
          },
        })
        const sourceAcknowledgement = await finishRuleSourceOperation(
          tx,
          source.operationHandle,
          input.clientMutationId,
        )
        const result = await this.mapWithMetrics(
          tx,
          actor,
          await this.readScopedActivity(tx, actor, project.id, current.id),
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
    input: TransitionActivityDto,
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
        const current = await this.requireActivity(tx, actor, projectId, activityId)
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
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: current.projectId,
            action: `ACTIVITY_${input.status}`,
            entityType: 'ProjectActivity',
            entityId: current.id,
            changes: input.status === 'CANCELLED' ? { reason: input.reason?.trim() } : {},
          },
        })
        const sourceAcknowledgement = await finishRuleSourceOperation(
          tx,
          source.operationHandle,
          input.clientMutationId,
        )
        const result = await this.mapWithMetrics(
          tx,
          actor,
          await this.readScopedActivity(tx, actor, current.projectId, current.id),
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
    input: RecordActivityProgressDto,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'activities.progress.update',
      async (tx, actor) => {
        const activity = await this.requireActivity(tx, actor, projectId, activityId)
        const assigned = await tx.projectActivityAssignment.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            status: 'ACTIVE',
            endedAt: null,
            projectAssignment: { userId: actor.userId, status: 'ACTIVE', endedAt: null },
          },
          select: { id: true },
        })
        if (!assigned) throw new ForbiddenException('An active activity assignment is required.')
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
          return this.mapWithMetrics(tx, actor, activity)
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
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: activity.projectId,
            action: 'ACTIVITY_PROGRESS_RECORDED',
            entityType: 'ActivityUpdate',
            entityId: updateId,
            changes: { activityId: activity.id, progressPercent: input.progressPercent },
          },
        })
        return this.mapWithMetrics(
          tx,
          actor,
          await this.readScopedActivity(tx, actor, activity.projectId, activity.id),
        )
      },
    )
  }

  private async requireActiveAssignment(
    tx: Tx,
    actor: ApplicationIdentity,
    activity: { id: string; projectId: string },
  ) {
    const assigned = await tx.projectActivityAssignment.findFirst({
      where: {
        organizationId: actor.organizationId,
        projectId: activity.projectId,
        activityId: activity.id,
        status: 'ACTIVE',
        endedAt: null,
        projectAssignment: { userId: actor.userId, status: 'ACTIVE', endedAt: null },
      },
      select: { id: true },
    })
    if (!assigned) throw new ForbiddenException('An active activity assignment is required.')
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
    input: RecordOverdueExplanationDto,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'monitoring.review',
      async (tx, actor) => {
        // M&E officers are assigned to the PROJECT, not to individual activities, so this
        // uses the project-scope rule requireActivity already applies (projectScope(actor)
        // inside requireProject), not the personal-activity requireActiveAssignment used by
        // recordProgress/reserveProof. This mirrors pathways.p05_has_project_permission
        // ('monitoring.review', project_id) in migration 0043's RLS INSERT policy:
        // SYSTEM_ADMINISTRATOR is org-wide, PROGRAM_MANAGER also via a managed program, and
        // every other role (including GRANT_MANAGER) needs an active project assignment.
        const activity = await this.requireActivity(tx, actor, projectId, activityId)
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
          return this.mapWithMetrics(tx, actor, activity)
        }
        const presentation = activityPresentationStatus(
          activity.status,
          activity.plannedEndDate,
          this.businessDate(),
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
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: activity.projectId,
            action: 'ACTIVITY_OVERDUE_EXPLANATION_RECORDED',
            entityType: 'ActivityOverdueExplanation',
            entityId: explanationId,
            changes: { activityId: activity.id, category: input.category },
          },
        })
        return this.mapWithMetrics(
          tx,
          actor,
          await this.readScopedActivity(tx, actor, activity.projectId, activity.id),
        )
      },
    )
  }

  /** Effective upload limits for the web client; the same values bound every reservation. */
  proofUploadLimits(projectId: string) {
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    return activityEvidenceLimits(this.env.EVIDENCE_MAX_FILE_BYTES)
  }

  private finalizeBody(
    updateId: string,
    progressPercent: number,
    note: string,
    files: Array<{
      fileName: string
      sha256: string
      contentType: string | null
      byteSize: number | bigint | null
    }>,
  ) {
    return sourceMutationBody({
      updateId,
      progressPercent,
      note,
      files: files.map((file) => ({
        fileName: file.fileName,
        sha256: file.sha256,
        contentType: file.contentType,
        byteSize: Number(file.byteSize),
      })),
    })
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
    input: ReserveActivityProofDto,
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
        const activity = await this.requireActivity(tx, actor, projectId, activityId)
        await this.requireActiveAssignment(tx, actor, activity)
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
            this.finalizeBody(existing.id, existing.progressPercent, note, declared),
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
      const activity = await this.requireActivity(tx, actor, projectId, activityId)
      await this.requireActiveAssignment(tx, actor, activity)
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
        const verify = createPrivateUploadVerifier({
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
        const body = this.finalizeBody(update.id, update.progressPercent, update.note ?? '', files)
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
        const current = await this.requireActivity(tx, actor, activity.projectId, activity.id)
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
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: activity.projectId,
            action: 'ACTIVITY_UPDATE_SUBMITTED',
            entityType: 'ActivityUpdate',
            entityId: update.id,
            changes: { progressPercent: update.progressPercent, proofCount: files.length },
          },
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
        const result = await this.mapWithMetrics(
          tx,
          actor,
          await this.readScopedActivity(tx, actor, activity.projectId, activity.id),
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
    input: ReviewActivityUpdateDto,
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
      const activity = await this.requireActivity(tx, reviewer, projectId, activityId)
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
      await tx.auditLog.create({
        data: {
          organizationId: reviewer.organizationId,
          actorUserId: reviewer.userId,
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
        },
      })
      const sourceAcknowledgement = await finishRuleSourceOperation(
        tx,
        source.operationHandle,
        input.clientMutationId,
      )
      const result = await this.mapWithMetrics(
        tx,
        reviewer,
        await this.requireActivity(tx, reviewer, activity.projectId, activity.id),
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
        const project = await this.requireProject(tx, actor, projectId)
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
      const project = await this.requireProject(tx, actor, projectId)
      return tx.projectMilestone.findMany({
        where: { organizationId: actor.organizationId, projectId: project.id, archivedAt: null },
        orderBy: [{ targetDate: 'asc' }, { id: 'asc' }],
        take: 100,
      })
    })
  }

  createMilestone(identity: ApplicationIdentity, projectId: string, input: SaveMilestoneDto) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'milestones.manage',
      async (tx, actor) => {
        const project = await this.requireProject(tx, actor, projectId)
        if (input.targetDate) {
          this.validateDates(input.targetDate, input.targetDate, project)
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
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: project.id,
            action: 'MILESTONE_CREATED',
            entityType: 'ProjectMilestone',
            entityId: row.id,
          },
        })
        return row
      },
    )
  }

  updateMilestone(
    identity: ApplicationIdentity,
    projectId: string,
    milestoneId: string,
    input: UpdateMilestoneDto,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'milestones.manage',
      async (tx, actor) => {
        const project = await this.requireProject(tx, actor, projectId)
        if (!UUID_PATTERN.test(milestoneId)) throw new NotFoundException('Milestone unavailable.')
        if (input.targetDate) {
          this.validateDates(input.targetDate, input.targetDate, project)
        }
        if (input.status === 'COMPLETED' && !input.completionDate) {
          throw new BadRequestException('A completed milestone requires its completion date.')
        }
        if (input.completionDate) {
          this.validateDates(input.completionDate, input.completionDate, project)
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
        await tx.auditLog.create({
          data: {
            organizationId: actor.organizationId,
            actorUserId: actor.userId,
            projectId: project.id,
            action: 'MILESTONE_UPDATED',
            entityType: 'ProjectMilestone',
            entityId: row.id,
            changes: { status: row.status },
          },
        })
        return row
      },
    )
  }
}
