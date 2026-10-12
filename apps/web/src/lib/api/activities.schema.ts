import { overdueExplanationCategories } from '@pathways/shared'

import { PathwaysClientError } from '@/lib/api/core/request'
import type {
  Activity,
  ActivityCapabilities,
  ActivityOverdueExplanation,
  ActivitySummary,
  AssignableProjectOfficer,
  EvidenceList,
  EvidenceRecord,
} from '@/types/pathways'

const evidenceStatuses = new Set(['Submitted', 'Validated', 'Flagged', 'Approved', 'Returned'])

function evidenceText(value: unknown) {
  if (typeof value !== 'string') throw new Error('invalid_evidence_response')
  return value
}

function evidenceCount(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
    throw new Error('invalid_evidence_response')
  return value
}

/** Copies only the fields each scope permits, so unexpected detail is never rendered. */
export function parseEvidenceList(value: unknown): EvidenceList {
  const body = value as { scope?: unknown; records?: unknown; activities?: unknown } | null
  if (body?.scope === 'aggregate' && Array.isArray(body.activities)) {
    return {
      scope: 'aggregate',
      activities: body.activities.map((row: Record<string, unknown>) => ({
        activityId: evidenceText(row.activityId),
        activityTitle: evidenceText(row.activityTitle),
        total: evidenceCount(row.total),
        submitted: evidenceCount(row.submitted),
        approved: evidenceCount(row.approved),
        returned: evidenceCount(row.returned),
      })),
    }
  }
  if (body?.scope === 'detail' && Array.isArray(body.records)) {
    return {
      scope: 'detail',
      records: body.records.map((row: Record<string, unknown>) => {
        const status = evidenceText(row.status)
        if (!evidenceStatuses.has(status)) throw new Error('invalid_evidence_response')
        return {
          id: evidenceText(row.id),
          projectId: evidenceText(row.projectId),
          activityId: evidenceText(row.activityId),
          updateId: evidenceText(row.updateId),
          updateUpdatedAt: evidenceText(row.updateUpdatedAt),
          fileName: evidenceText(row.fileName),
          reportTitle: evidenceText(row.reportTitle),
          status: status as EvidenceRecord['status'],
          submitter: evidenceText(row.submitter),
          submittedDate: evidenceText(row.submittedDate),
          previewSummary: evidenceText(row.previewSummary),
          contentType: evidenceText(row.contentType),
          byteSize: evidenceCount(row.byteSize),
          isIdentifying: row.isIdentifying === true,
          reviewedDate: typeof row.reviewedDate === 'string' ? row.reviewedDate : null,
          reviewer: typeof row.reviewer === 'string' ? row.reviewer : null,
        }
      }),
    }
  }
  throw new Error('invalid_evidence_response')
}

const activityResponseKeys = [
  'id',
  'projectId',
  'code',
  'title',
  'description',
  'activityType',
  'timelineOverrideJustification',
  'storedStatus',
  'status',
  'overdue',
  'startDate',
  'dueDate',
  'actualStartDate',
  'actualEndDate',
  'assignedUserIds',
  'assignedTo',
  'assignedEmails',
  'indicatorIds',
  'journeyStageIds',
  'journeyStageId',
  'targetBeneficiaries',
  'beneficiariesReached',
  'budgetAllocation',
  'budgetLogged',
  'progress',
  'reviewedById',
  'reviewedAt',
  'cancellationReason',
  'submittedProof',
  'updateNotes',
  'updatedAt',
  'capabilities',
] as const satisfies readonly (keyof Activity)[]

// Activity capability flags (feature/project-rbac-ui-and-partners). Advisory only: a response
// without them shows no Edit, Record progress, Submit proof or Explain delay control.
const noActivityCapabilities: ActivityCapabilities = {
  canEdit: false,
  canRecordProgress: false,
  canSubmitProof: false,
  canExplainOverdue: false,
}

function parseActivityCapabilities(value: unknown): ActivityCapabilities {
  if (value === undefined) return noActivityCapabilities
  const row = value as Partial<Record<keyof ActivityCapabilities, unknown>> | null
  if (
    !row ||
    typeof row !== 'object' ||
    Object.keys(row).length !== 4 ||
    typeof row.canEdit !== 'boolean' ||
    typeof row.canRecordProgress !== 'boolean' ||
    typeof row.canSubmitProof !== 'boolean' ||
    typeof row.canExplainOverdue !== 'boolean'
  )
    throw new PathwaysClientError('Invalid activity response.', 'network')
  return {
    canEdit: row.canEdit,
    canRecordProgress: row.canRecordProgress,
    canSubmitProof: row.canSubmitProof,
    canExplainOverdue: row.canExplainOverdue,
  }
}

const knownOverdueCategories = new Set<string>(overdueExplanationCategories)

function parseOverdueExplanation(value: unknown): ActivityOverdueExplanation {
  const row = value as Partial<Record<keyof ActivityOverdueExplanation, unknown>> | null
  if (
    !row ||
    typeof row !== 'object' ||
    Object.keys(row).length !== 5 ||
    typeof row.id !== 'string' ||
    typeof row.category !== 'string' ||
    !knownOverdueCategories.has(row.category) ||
    typeof row.explanation !== 'string' ||
    row.explanation.length < 10 ||
    row.explanation.length > 2000 ||
    typeof row.actorName !== 'string' ||
    typeof row.recordedAt !== 'string'
  )
    throw new PathwaysClientError('Invalid activity response.', 'network')
  return {
    id: row.id,
    category: row.category as ActivityOverdueExplanation['category'],
    explanation: row.explanation,
    actorName: row.actorName,
    recordedAt: row.recordedAt,
  }
}

function parseOverdueExplanations(value: unknown): ActivityOverdueExplanation[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new PathwaysClientError('Invalid activity response.', 'network')
  return value.map(parseOverdueExplanation)
}

export function parseAssignableProjectOfficers(value: unknown): AssignableProjectOfficer[] {
  if (!Array.isArray(value) || value.length > 50)
    throw new PathwaysClientError('Invalid officer response.', 'network')
  return value.map((item) => {
    const row = item as Partial<Record<keyof AssignableProjectOfficer, unknown>> | null
    if (
      !row ||
      typeof row !== 'object' ||
      Object.keys(row).length !== 2 ||
      typeof row.userId !== 'string' ||
      typeof row.displayName !== 'string'
    )
      throw new PathwaysClientError('Invalid officer response.', 'network')
    return { userId: row.userId, displayName: row.displayName }
  })
}

export function parseActivity(value: unknown): Activity {
  const row = value as Partial<Activity> & {
    budgetAllocation?: unknown
    budgetLogged?: unknown
  }
  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.id !== 'string' ||
    typeof row.projectId !== 'string' ||
    typeof row.title !== 'string' ||
    typeof row.updatedAt !== 'string' ||
    !Array.isArray(row.assignedUserIds) ||
    !Array.isArray(row.assignedTo) ||
    !Array.isArray(row.assignedEmails) ||
    !Array.isArray(row.indicatorIds) ||
    !Array.isArray(row.journeyStageIds) ||
    !Array.isArray(row.submittedProof) ||
    !Array.isArray(row.updateNotes) ||
    typeof row.overdueExplanationNeeded !== 'boolean'
  ) {
    throw new PathwaysClientError('Invalid activity response.', 'network')
  }
  const budgetAllocation =
    row.budgetAllocation === null || row.budgetAllocation === undefined
      ? null
      : Number(row.budgetAllocation)
  // A response without the entry count predates the real logged total (it sent a fixed 0),
  // so its value is treated as withheld rather than shown.
  const legacyLogged = row.budgetLoggedEntries === undefined
  const budgetLogged =
    legacyLogged || row.budgetLogged === null || row.budgetLogged === undefined
      ? null
      : Number(row.budgetLogged)
  const budgetLoggedEntries = legacyLogged ? null : (row.budgetLoggedEntries ?? null)
  if (
    (budgetAllocation !== null && !Number.isFinite(budgetAllocation)) ||
    (budgetLogged !== null && !Number.isFinite(budgetLogged)) ||
    // A logged total and its entry count are both present or both withheld.
    (budgetLoggedEntries === null) !== (budgetLogged === null) ||
    (budgetLoggedEntries !== null &&
      (!Number.isInteger(budgetLoggedEntries) || budgetLoggedEntries < 0)) ||
    typeof row.beneficiariesReached !== 'number'
  ) {
    throw new PathwaysClientError('Invalid activity response.', 'network')
  }
  return {
    ...(Object.fromEntries(
      activityResponseKeys.map((key) => [key, row[key]]),
    ) as unknown as Activity),
    budgetAllocation,
    budgetLogged,
    budgetLoggedEntries,
    capabilities: parseActivityCapabilities(row.capabilities),
    overdueExplanations: parseOverdueExplanations(row.overdueExplanations),
    overdueExplanationNeeded: row.overdueExplanationNeeded,
  }
}

// Lean activity list projection (feature/project-data-loading). Detail-only fields are
// never defaulted here: a list item simply does not carry them.
const activitySummaryKeys = [
  'id',
  'projectId',
  'code',
  'title',
  'description',
  'storedStatus',
  'status',
  'overdue',
  'startDate',
  'dueDate',
  'assignedUserIds',
  'assignedTo',
  'indicatorIds',
  'journeyStageIds',
  'journeyStageId',
  'targetBeneficiaries',
  'progress',
  'updatedAt',
  'capabilities',
  'overdueExplanationNeeded',
  'indicatorCount',
  'beneficiariesReached',
  'beneficiariesTarget',
  'budgetUtilization',
] as const satisfies readonly (keyof ActivitySummary)[]

const presentedActivityStatuses = new Set<string>([
  'Planned',
  'In Progress',
  'For Review',
  'Overdue',
  'Completed',
  'Cancelled',
] satisfies Activity['status'][])
const storedActivityStatuses = new Set<string>([
  'NOT_STARTED',
  'IN_PROGRESS',
  'FOR_REVIEW',
  'COMPLETED',
  'CANCELLED',
] satisfies Activity['storedStatus'][])

function parseActivitySummary(value: unknown): ActivitySummary {
  const row = value as Partial<ActivitySummary>
  if (
    !row ||
    typeof row !== 'object' ||
    typeof row.id !== 'string' ||
    typeof row.projectId !== 'string' ||
    typeof row.title !== 'string' ||
    typeof row.updatedAt !== 'string' ||
    typeof row.progress !== 'number' ||
    (row.code !== null && row.code !== undefined && typeof row.code !== 'string') ||
    typeof row.description !== 'string' ||
    !presentedActivityStatuses.has(row.status as string) ||
    !storedActivityStatuses.has(row.storedStatus as string) ||
    (row.overdue !== undefined && typeof row.overdue !== 'boolean') ||
    typeof row.startDate !== 'string' ||
    typeof row.dueDate !== 'string' ||
    typeof row.journeyStageId !== 'string' ||
    typeof row.targetBeneficiaries !== 'number' ||
    !Array.isArray(row.assignedUserIds) ||
    !Array.isArray(row.assignedTo) ||
    !Array.isArray(row.indicatorIds) ||
    !Array.isArray(row.journeyStageIds) ||
    typeof row.overdueExplanationNeeded !== 'boolean' ||
    (row.indicatorCount !== undefined && typeof row.indicatorCount !== 'number') ||
    [row.beneficiariesReached, row.beneficiariesTarget, row.budgetUtilization].some(
      (metric) => metric != null && typeof metric !== 'number',
    )
  ) {
    throw new PathwaysClientError('Invalid activity response.', 'network')
  }
  return {
    ...(Object.fromEntries(
      activitySummaryKeys.map((key) => [key, row[key]]),
    ) as unknown as ActivitySummary),
    capabilities: parseActivityCapabilities(row.capabilities),
  }
}

export function parseActivitySummaries(value: unknown): ActivitySummary[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new PathwaysClientError('Invalid activity response.', 'network')
  }
  return value.map(parseActivitySummary)
}
