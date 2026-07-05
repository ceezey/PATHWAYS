import type { ActivityStatus } from '@/types/pathways'

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

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    currency: 'PHP',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value)

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00.000Z`))
