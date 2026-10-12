import type { ActivityListItemRecordResponse, ActivityRecordResponse } from '@pathways/shared'
import type { Prisma } from '@prisma/client'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import {
  activityPresentationStatus,
  calendarDate,
  hasExplanationSinceDue,
  reviewStatus,
  updateKind,
} from './activities.helpers'

export const activitySelection = {
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

export type ActivityRow = Prisma.ProjectActivityGetPayload<{ select: typeof activitySelection }>

/**
 * List projection: only what the activity list, board, search and pickers render.
 * Update history, proof metadata, assignee emails and read metrics come only from `get`.
 */
export const activityListSelection = {
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

export type ActivityListRow = Prisma.ProjectActivityGetPayload<{
  select: typeof activityListSelection
}>

/**
 * Capability input read in the same scoped activity query: the caller's own active
 * assignment on the activity, matching the recordProgress and submitUpdate checks.
 */
export function personalAssignmentCount(actor: ApplicationIdentity) {
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

export type ActivityReadMetrics = {
  budgets: ReadonlyMap<string, string>
  reached: ReadonlyMap<string, number>
  /** Present only for viewers holding expenses.read; absent means not readable. */
  logged: ReadonlyMap<string, { total: string; entries: number }>
}

export const emptyActivityReadMetrics: ActivityReadMetrics = {
  budgets: new Map(),
  reached: new Map(),
  logged: new Map(),
}

export function mapActivity(
  row: ActivityRow,
  businessDate: string,
  metrics: ActivityReadMetrics = emptyActivityReadMetrics,
  viewerId?: string,
): ActivityRecordResponse {
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

/** A plain object, so server-computed per-item fields can be added without a detail read. */
export function mapActivityListItem(
  row: ActivityListRow,
  businessDate: string,
): ActivityListItemRecordResponse {
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
