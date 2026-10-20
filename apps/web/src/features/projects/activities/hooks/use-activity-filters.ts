import { useMemo, useState } from 'react'

import type { ActivityStatus, ActivitySummary, Indicator } from '@/types/pathways'

import { activityStatuses } from '../activities.utils'

const indicatorSummary = (activity: ActivitySummary, indicators: Indicator[]) =>
  activity.indicatorIds
    .map(
      (indicatorId) =>
        indicators.find((indicator) => indicator.id === indicatorId)?.code ?? indicatorId,
    )
    .join(', ')

export const useActivityFilters = (activities: ActivitySummary[], indicators: Indicator[]) => {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ActivityStatus | null>(null)
  const [viewMode, setViewMode] = useState<'board' | 'list'>('list')

  const filteredActivities = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return activities.filter((activity) => {
      const matchesQuery = normalizedQuery
        ? [
            activity.title,
            activity.description,
            activity.assignedTo.join(' '),
            indicatorSummary(activity, indicators),
          ]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)
        : true

      const matchesStatus = statusFilter ? activity.status === statusFilter : true
      return matchesQuery && matchesStatus
    })
  }, [activities, indicators, query, statusFilter])

  const activityStatusCounts = useMemo(() => {
    const counts: Record<ActivityStatus, number> = {
      Planned: 0,
      'In Progress': 0,
      'For Review': 0,
      Overdue: 0,
      Completed: 0,
      Cancelled: 0,
    }

    for (const activity of activities) {
      counts[activity.status] += 1
    }

    return counts
  }, [activities])

  const filteredActivityStatusCounts = useMemo(() => {
    const counts: Record<ActivityStatus, number> = {
      Planned: 0,
      'In Progress': 0,
      'For Review': 0,
      Overdue: 0,
      Completed: 0,
      Cancelled: 0,
    }

    for (const activity of filteredActivities) {
      counts[activity.status] += 1
    }

    return counts
  }, [filteredActivities])

  const visibleActivityStatuses = useMemo(
    () => activityStatuses.filter((status) => filteredActivityStatusCounts[status] > 0),
    [filteredActivityStatusCounts],
  )

  return {
    activityStatusCounts,
    filteredActivities,
    query,
    setQuery,
    setStatusFilter,
    setViewMode,
    statusFilter,
    viewMode,
    visibleActivityStatuses,
  }
}
