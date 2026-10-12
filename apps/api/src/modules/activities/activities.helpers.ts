import { BadRequestException } from '@nestjs/common'
import { hasAtomicPermission } from '@pathways/shared'

import type { ApplicationIdentity } from '../../common/authz/application-identity'

/** Exactly the users `resolveAssignments` accepts; the assignee bound is 50. */
export const assignableOfficerLimit = 50

export const storedStatus = {
  NOT_STARTED: 'Planned',
  IN_PROGRESS: 'In Progress',
  FOR_REVIEW: 'For Review',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
} as const

export const reviewStatus = {
  PENDING: 'Submitted',
  VERIFIED: 'Accepted',
  APPROVED: 'Accepted',
  REJECTED: 'Flagged',
} as const

export function calendarDate(date: Date | null) {
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
    // requireScopedProjectRow), which is the same project-assignment-or-org-wide rule
    // pathways.p05_has_project_permission('monitoring.review', ...) applies at the RLS layer.
    canExplainOverdue: can('monitoring.review'),
  }
}

export function updateKind(update: {
  _count?: { evidenceMedia_update: number }
  evidenceMedia_update: unknown[]
}): 'proof' | 'progress' {
  return (update._count?.evidenceMedia_update ?? update.evidenceMedia_update.length) > 0
    ? 'proof'
    : 'progress'
}

/** True when an overdue explanation was recorded on or after the planned end date. */
export function hasExplanationSinceDue(
  explanations: { recordedAt: Date }[],
  plannedEndDate: Date | null,
) {
  return explanations.some(
    (explanation) => calendarDate(explanation.recordedAt) >= calendarDate(plannedEndDate),
  )
}

export function validateActivityDates(
  start: string,
  end: string,
  project: { startDate: Date | null; endDate: Date | null },
  timelineOverrideJustification?: string | null,
) {
  if (end < start)
    throw new BadRequestException('Activity end date must not precede its start date.')
  const projectStart = calendarDate(project.startDate)
  const projectEnd = calendarDate(project.endDate)
  const outsideProject = (projectStart && start < projectStart) || (projectEnd && end > projectEnd)
  const justification = timelineOverrideJustification?.trim() || null
  if (outsideProject && !justification) {
    throw new BadRequestException(
      'A timeline override justification is required outside the project dates.',
    )
  }
  return justification
}
