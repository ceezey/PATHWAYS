import {
  type MetricCell,
  type StoredProjectStatus,
  TIMELINE_ANALYTICS_CONTRACT_VERSION,
  type TimelineAnalytics,
  activityAggregateCells,
  isCalendarDate,
  milestoneCountsSchema,
  milestoneOnTimeFromCounts,
  missingMetric,
  numericMetric,
  timelineObservation,
} from '@pathways/shared'
import { z } from 'zod'

function withReason(cell: MetricCell, from: string, to: string): MetricCell {
  return cell.reason === from ? { ...cell, reason: to } : cell
}

/** Whole calendar days from start to end, both YYYY-MM-DD. */
const daysBetween = (start: string, end: string) =>
  (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000

/**
 * Activity and milestone counts returned by the trusted
 * pathways.p10_f9_timeline_aggregate function. Counts only: no row or identifier.
 * `maxOverdueDays` is the SQL mirror of the largest per-activity overdue days and
 * is validated but not part of the timeline view contract.
 */
export const timelineAggregateSchema = z
  .object({
    activities: z
      .object({
        eligible: z.number().int().min(0),
        completed: z.number().int().min(0),
        overdue: z.number().int().min(0),
        missingDates: z.number().int().min(0),
        maxOverdueDays: z.number().int().min(0).nullable(),
      })
      .strict(),
    milestones: milestoneCountsSchema,
  })
  .strict()
type TimelineAggregate = z.infer<typeof timelineAggregateSchema>

/**
 * Builds the timeline adherence view (analytics.descriptive.timeline.v1). Project
 * level elapsed/remaining/overdue days come from the project row through the rule
 * engine's pure timelineObservation; activity metrics come from database-side counts
 * through activityAggregateCells (the aggregate form of activityObservation), so the
 * two never drift. Reasons are remapped to the descriptive-analytics vocabulary
 * (NO_PROJECT_DATES/NO_ACTIVITIES) so callers see one consistent set of MISSING
 * reasons for this view. A COMPLETED project reports its final position (100% elapsed,
 * 0 remaining, overdue = days its last completed activity ended after the planned end,
 * from the separate `lastCompletedOn` input); ON_HOLD dates keep running like ONGOING.
 */
export function buildTimelineAnalytics(input: {
  projectId: string
  organizationId: string
  generatedAt: string
  reportingDate: string
  project: {
    status: StoredProjectStatus
    archived: boolean
    startDate: string | null
    endDate: string | null
  }
  aggregate: TimelineAggregate
  /** Latest actual end date of a completed activity (YYYY-MM-DD), read apart from the aggregate. */
  lastCompletedOn: string | null
}): TimelineAnalytics {
  const aggregate = timelineAggregateSchema.parse(input.aggregate)
  const scope = { organizationId: input.organizationId, projectId: input.projectId }
  const timelineInput = {
    scope,
    conditionId: 'analytics-timeline-view',
    asOf: input.generatedAt,
    reportingDate: input.reportingDate,
    projectStatus: input.project.status === 'ON_HOLD' ? 'ONGOING' : input.project.status,
    projectArchived: input.project.archived,
    revision: '1',
    startDate: input.project.startDate,
    endDate: input.project.endDate,
  }
  const cellFor = (
    metric: 'PROJECT_TIMELINE_ELAPSED_PERCENT' | 'PROJECT_REMAINING_DAYS' | 'PROJECT_OVERDUE_DAYS',
  ) =>
    withReason(
      timelineObservation({ ...timelineInput, metric }).cell,
      'MISSING_DATES',
      'NO_PROJECT_DATES',
    )
  const { endDate } = input.project
  const lastCompletedOn =
    input.lastCompletedOn !== null && isCalendarDate(input.lastCompletedOn)
      ? input.lastCompletedOn
      : null
  const final = input.project.status === 'COMPLETED' && !input.project.archived
  const elapsedPercent = final ? numericMetric('100') : cellFor('PROJECT_TIMELINE_ELAPSED_PERCENT')
  const remainingDays = final ? numericMetric('0') : cellFor('PROJECT_REMAINING_DAYS')
  let overdueDays = cellFor('PROJECT_OVERDUE_DAYS')
  if (final) {
    if (endDate === null || !isCalendarDate(endDate))
      overdueDays = missingMetric('NO_PROJECT_DATES')
    else if (lastCompletedOn === null) overdueDays = missingMetric('NO_COMPLETION_DATE')
    else overdueDays = numericMetric(String(Math.max(0, daysBetween(endDate, lastCompletedOn))))
  }
  const { maxOverdueDays: _maxOverdueDays, ...activityCounts } = aggregate.activities
  const activityCells = activityAggregateCells(activityCounts)
  return {
    contractVersion: TIMELINE_ANALYTICS_CONTRACT_VERSION,
    projectId: input.projectId,
    generatedAt: input.generatedAt,
    reportingDate: input.reportingDate,
    elapsedPercent,
    remainingDays,
    overdueDays,
    activityCompletionPercent: withReason(
      activityCells.ACTIVITY_COMPLETION_PERCENT,
      'EMPTY_POPULATION',
      'NO_ACTIVITIES',
    ),
    activityOverdueCount: withReason(
      activityCells.ACTIVITY_OVERDUE_COUNT,
      'EMPTY_POPULATION',
      'NO_ACTIVITIES',
    ),
    milestoneOnTimePercent: milestoneOnTimeFromCounts(aggregate.milestones),
  }
}
