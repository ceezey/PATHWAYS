'use client'

import { AlertTriangle, BarChart3, ClipboardCheck, Target } from 'lucide-react'

import { AsyncState } from '@/components/pathways'
import { MetricCard } from '@/components/pathways/metric-card'
import type { TimelineAnalytics } from '@pathways/shared'

import { analyticsCellValue } from '../analytics.utils'
import { UnavailableChart } from './chart-panel'

/** F9 timeline adherence view (analytics.descriptive.timeline.v1). Cards only; no chart. */
export const TimelineAnalyticsPanel = ({
  data,
  loading,
  error,
  onRetry,
}: {
  data: TimelineAnalytics | null
  loading: boolean
  error: string
  onRetry: () => void
}) => {
  if (loading)
    return (
      <AsyncState
        status="loading"
        title="Loading timeline analytics"
        description="Loading scoped activity and milestone data."
        icon={BarChart3}
      />
    )
  if (error)
    return (
      <AsyncState
        status="error"
        title="Timeline analytics could not be loaded"
        description={error}
        icon={AlertTriangle}
        onRetry={onRetry}
      />
    )
  if (!data)
    return (
      <UnavailableChart description="Timeline adherence is not available for this selection." />
    )
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="timeline-analytics">
      <MetricCard
        description="Share of the project period elapsed as of the reporting date; 100% once completed."
        icon={ClipboardCheck}
        label="Elapsed"
        tone="info"
        value={analyticsCellValue(data.elapsedPercent, 'percent')}
      />
      <MetricCard
        description="Calendar days remaining before the project's recorded end date; 0 once completed."
        icon={ClipboardCheck}
        label="Remaining days"
        tone="info"
        value={analyticsCellValue(data.remainingDays)}
      />
      <MetricCard
        description="Calendar days past the project's recorded end date; once completed, how late its last activity finished."
        icon={AlertTriangle}
        label="Overdue days"
        tone={
          data.overdueDays.value !== null && Number(data.overdueDays.value) > 0 ? 'warning' : 'info'
        }
        value={analyticsCellValue(data.overdueDays)}
      />
      <MetricCard
        description="Share of in-scope activities marked Completed."
        icon={ClipboardCheck}
        label="Activity completion"
        tone="success"
        value={analyticsCellValue(data.activityCompletionPercent, 'percent')}
      />
      <MetricCard
        description="In-scope activities past their planned end date and not yet Completed."
        icon={AlertTriangle}
        label="Overdue activities"
        tone={
          data.activityOverdueCount.value !== null && Number(data.activityOverdueCount.value) > 0
            ? 'warning'
            : 'info'
        }
        value={analyticsCellValue(data.activityOverdueCount)}
      />
      <MetricCard
        description="Completed milestones finished on or before their target date."
        icon={Target}
        label="Milestone on-time"
        tone="success"
        value={analyticsCellValue(data.milestoneOnTimePercent, 'percent')}
      />
    </div>
  )
}
