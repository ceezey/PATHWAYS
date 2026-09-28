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
 * Overview tile copy. A visible value (including a real zero) is shown as is; a source
 * without data yet reads "None yet"; suppression and failures are never shown as zero.
 */
export const overviewMetricLabel = (cell: MetricCell, kind: 'percent' | 'count') => {
  if (cell.value !== null)
    return kind === 'percent' ? `${cell.value}%` : formatNumber(Number(cell.value))
  if (cell.state === 'SUPPRESSED') return 'Suppressed (fewer than 5)'
  if (cell.state === 'NOT_APPLICABLE') return 'Not applicable'
  switch (cell.reason) {
    // Known empty sources: readable, but nothing recorded yet.
    case 'NO_INDICATORS':
    case 'NO_MEASUREMENT':
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
    // Unknown reasons are not assumed to be empty.
    default:
      return 'Unavailable'
  }
}
