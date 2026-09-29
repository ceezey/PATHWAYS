import type { HealthStatus, ProjectStatus } from '@/types/pathways'
import type { MetricCell } from '@pathways/shared'

export const projectStatusFilters = ['All', 'Active', 'Needs Attention', 'Planned'] as const

export type ProjectStatusFilter = (typeof projectStatusFilters)[number]

export const projectStatusTone = (status: ProjectStatus) => {
  if (status === 'Active') {
    return 'success'
  }

  if (status === 'Needs Attention') {
    return 'warning'
  }

  if (status === 'Completed') {
    return 'info'
  }

  return 'neutral'
}

export const projectHealthTone = (health: HealthStatus) => {
  if (health === 'On Track') {
    return 'success'
  }

  if (health === 'At Risk') {
    return 'warning'
  }

  return 'danger'
}

export const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value)

/**
 * Maps an unavailable metric cell's state/reason to shared display copy. A visible
 * value (including a real zero) is handled by the caller; this only covers the
 * suppressed/missing/not-applicable copy so Analytics and Overview cannot diverge.
 */
export const metricUnavailableLabel = (cell: MetricCell) => {
  if (cell.state === 'SUPPRESSED') return 'Suppressed (fewer than 5)'
  if (cell.state === 'NOT_APPLICABLE') return 'Not applicable'
  switch (cell.reason) {
    // Known empty sources: readable, but nothing recorded yet.
    case 'NO_INDICATORS':
    case 'NO_MEASUREMENT':
    case 'NO_APPROVED_EXPENSES':
      return 'None yet'
    case 'PROJECT_DATES_REQUIRED':
    case 'PROJECT_DATES_INVALID':
      return 'Dates not recorded'
    case 'NO_PLANNED_BUDGET':
      return 'Budget not recorded'
    case 'RELEASED_AFTER_PROJECT_CLOSE':
      return 'After project close'
    case 'RESTATEMENT_REVIEW_REQUIRED':
      return 'Under review'
    // F9 survey/timeline analytics reasons (analytics.descriptive.survey.v1 /
    // analytics.descriptive.timeline.v1): readable guidance, never a fabricated zero.
    case 'NO_PAIRED_ASSESSMENTS':
      return 'No paired pre/post assessments yet'
    case 'NO_COMPLETED_MILESTONES':
      return 'No completed milestones yet'
    case 'NO_ACTIVITIES':
      return 'No activities recorded yet'
    case 'NO_PROJECT_DATES':
      return 'Project start and end dates are not recorded'
    // The source population exceeded its safe query limit: fail closed rather than
    // silently truncate and understate the result.
    case 'POPULATION_LIMIT_EXCEEDED':
      return 'Too many records to summarize safely'
    // Unknown reasons are not assumed to be empty.
    default:
      return 'Unavailable'
  }
}

/**
 * Overview tile copy. A visible value (including a real zero) is shown as is; a source
 * without data yet reads "None yet"; suppression and failures are never shown as zero.
 */
export const overviewMetricLabel = (cell: MetricCell, kind: 'percent' | 'pp' | 'count') => {
  if (cell.value !== null) {
    if (kind === 'percent') return `${cell.value}%`
    // 'pp': a difference between two percentages, in percentage points, never '%'.
    if (kind === 'pp') return `${cell.value}pp`
    return formatNumber(Number(cell.value))
  }
  return metricUnavailableLabel(cell)
}
