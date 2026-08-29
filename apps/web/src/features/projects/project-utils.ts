import type { HealthStatus, ProjectStatus } from '@/types/pathways'

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

export const projectHealthSignal = ({
  health,
  kpiAchievement,
  budgetUtilization,
  timelineProgress,
}: {
  health: HealthStatus
  kpiAchievement: number
  budgetUtilization: number
  timelineProgress: number
}) => {
  if (health === 'Critical') {
    return 'Critical signal: budget, timeline, or project delivery indicators require immediate human review.'
  }

  if (health === 'At Risk') {
    return 'At-risk signal: project progress is below target or scheduled work needs management attention.'
  }

  if (budgetUtilization > 80 && kpiAchievement < 60) {
    return 'Watch signal: spending is advancing faster than KPI achievement.'
  }

  if (timelineProgress > kpiAchievement + 20) {
    return 'Watch signal: timeline progress is moving ahead of measured KPI achievement.'
  }

  return 'On-track signal: KPI, budget, and timeline indicators are within configured thresholds.'
}

export const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value)
