import type { Activity, ActivityStatus, UpdateActivityInput } from '@/types/pathways'

export const activityStatuses: ActivityStatus[] = [
  'Planned',
  'In Progress',
  'For Review',
  'Overdue',
  'Completed',
]

export const activityFilters = ['All', 'Mine', 'Overdue', 'Needs Attention'] as const

export type ActivityFilter = (typeof activityFilters)[number]

export const activityStatusTone = (status: ActivityStatus) => {
  if (status === 'Completed') {
    return 'success'
  }

  if (status === 'Overdue') {
    return 'danger'
  }

  if (status === 'For Review') {
    return 'warning'
  }

  if (status === 'In Progress') {
    return 'info'
  }

  return 'neutral'
}

export const activityProgressTone = (status: ActivityStatus, progress: number) => {
  if (status === 'Overdue') {
    return 'danger'
  }

  if (status === 'Completed' || progress >= 80) {
    return 'success'
  }

  if (status === 'For Review') {
    return 'warning'
  }

  return 'info'
}

export const activityNextStep = (status: ActivityStatus) => {
  if (status === 'Planned') {
    return 'Confirm readiness and start delivery'
  }

  if (status === 'In Progress') {
    return 'Record the next progress update'
  }

  if (status === 'For Review') {
    return 'Review the submitted update and proof'
  }

  if (status === 'Overdue') {
    return 'Record a recovery update'
  }

  return 'Confirm the completed activity record'
}

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    currency: 'PHP',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value)

const activityDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export const formatDate = (value: string | null | undefined) => {
  const normalizedValue = value?.trim()

  if (!normalizedValue) return 'Date unavailable'

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizedValue)
  const date = dateOnlyMatch
    ? new Date(
        Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3])),
      )
    : new Date(normalizedValue)

  const isInvalidDateOnly =
    dateOnlyMatch &&
    (date.getUTCFullYear() !== Number(dateOnlyMatch[1]) ||
      date.getUTCMonth() !== Number(dateOnlyMatch[2]) - 1 ||
      date.getUTCDate() !== Number(dateOnlyMatch[3]))

  if (Number.isNaN(date.getTime()) || isInvalidDateOnly) return 'Date unavailable'

  return activityDateFormatter.format(date)
}

export const activityDueLabel = (status: ActivityStatus, dueDate: string) => {
  const formattedDate = formatDate(dueDate)

  if (formattedDate === 'Date unavailable') {
    return status === 'Overdue' ? 'Overdue · date unavailable' : 'Due date unavailable'
  }

  return status === 'Overdue' ? `Overdue since ${formattedDate}` : `Due ${formattedDate}`
}

export const buildActivityStatusUpdate = (
  activity: Activity,
  status: ActivityStatus,
): UpdateActivityInput => ({
  assignedTo: [...activity.assignedTo],
  beneficiariesReached: activity.beneficiariesReached,
  budgetAllocation: activity.budgetAllocation,
  budgetLogged: activity.budgetLogged,
  description: activity.description,
  dueDate: activity.dueDate,
  id: activity.id,
  indicatorIds: [...activity.indicatorIds],
  journeyStageId: activity.journeyStageId,
  progress: activity.progress,
  projectId: activity.projectId,
  startDate: activity.startDate,
  status,
  targetBeneficiaries: activity.targetBeneficiaries,
  title: activity.title,
})
