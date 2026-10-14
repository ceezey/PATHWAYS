'use client'

import { AlertTriangle, ClipboardCheck, PhilippinePeso, Target, UsersRound } from 'lucide-react'

import { CappedPercent } from '@/components/pathways'
import { MetricCard } from '@/components/pathways/metric-card'
import { formatCappedPercent } from '@/lib/format/percent'
import type { ActivitySummary } from '@/types/pathways'
import { type MonitoringDashboard, formatMetricCell } from '@pathways/shared'

import type { OpenAlertCount } from '../analytics.reads'
import type { useBudgetSummary } from '../hooks/use-analytics-insights'

export const AnalyticsSummaryCards = ({
  activities,
  alertsFailed,
  alertsLoading,
  averageKpi,
  budgetRead,
  canReadActivities,
  canReadAlerts,
  canReadBudgetUtilization,
  canReadIndicators,
  monitoring,
  monitoringReadable,
  openAlertText,
  openAlerts,
}: {
  activities: readonly ActivitySummary[]
  alertsFailed: boolean
  alertsLoading: boolean
  averageKpi: number | null
  budgetRead: ReturnType<typeof useBudgetSummary>
  canReadActivities: boolean
  canReadAlerts: boolean
  canReadBudgetUtilization: boolean
  canReadIndicators: boolean
  monitoring: MonitoringDashboard | null
  monitoringReadable: boolean
  openAlertText: string
  openAlerts: OpenAlertCount | null
}) => {
  const openAlertCount = openAlerts ? openAlerts.count : null
  const budgetCurrencies = budgetRead.data?.currencies ?? []
  const budgetUtilizationPercent =
    budgetCurrencies.length === 1 ? budgetCurrencies[0].utilizationPercent : null
  const completedActivities = activities.filter(
    (activity) => activity.status === 'Completed',
  ).length

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:auto-cols-fr xl:grid-flow-col">
      {canReadIndicators ? (
        <MetricCard
          description="Average of released indicator progress values in this project and period."
          icon={Target}
          label="KPI achievement"
          tone={averageKpi === null ? 'info' : averageKpi >= 70 ? 'success' : 'warning'}
          value={
            averageKpi !== null
              ? formatCappedPercent(averageKpi)
              : monitoringReadable
                ? 'None yet'
                : 'Unavailable'
          }
        />
      ) : null}
      {canReadBudgetUtilization ? (
        <MetricCard
          description={
            !canReadBudgetUtilization
              ? 'Budget and expense permissions are required for this metric.'
              : budgetRead.isError
                ? 'Budget utilization could not be loaded.'
                : budgetCurrencies.length > 1
                  ? 'Several currencies are recorded; see the Budget utilization panel.'
                  : 'Approved expenses against planned budget allocations; pending is not counted.'
          }
          icon={PhilippinePeso}
          label="Budget utilization"
          tone={
            budgetUtilizationPercent === null
              ? 'info'
              : budgetUtilizationPercent > 100
                ? 'warning'
                : 'success'
          }
          value={
            !canReadBudgetUtilization ? (
              'Unavailable'
            ) : budgetRead.isError ? (
              'Unavailable'
            ) : !budgetRead.data ? (
              'Loading...'
            ) : budgetCurrencies.length > 1 ? (
              'Multiple currencies'
            ) : budgetUtilizationPercent !== null ? (
              <CappedPercent value={budgetUtilizationPercent} overLabel="over budget" />
            ) : (
              'No budget'
            )
          }
        />
      ) : null}
      {canReadIndicators ? (
        <MetricCard
          description="Enrolled individuals overlapping the period; privacy suppression applies."
          icon={UsersRound}
          label="Beneficiary reach"
          tone="info"
          value={
            monitoring?.enrolledIndividuals
              ? formatMetricCell(monitoring.enrolledIndividuals)
              : 'Unavailable'
          }
        />
      ) : null}
      {canReadActivities ? (
        <MetricCard
          description="Completed activities in the selected project."
          icon={ClipboardCheck}
          label="Activity completion"
          tone="success"
          value={canReadActivities ? `${completedActivities}/${activities.length}` : 'Unavailable'}
        />
      ) : null}
      {canReadAlerts ? (
        <MetricCard
          description={
            !canReadAlerts
              ? 'Rule-Based Alerts are unavailable for this role.'
              : alertsFailed
                ? 'Open alerts could not be loaded. Use Retry in the Rule-Based Alerts panel.'
                : 'Open alerts (new, reviewed or actioned) in the selected project.'
          }
          icon={AlertTriangle}
          label="Rule-Based Alerts"
          tone={openAlertCount ? 'warning' : 'info'}
          value={
            !canReadAlerts
              ? 'Unavailable'
              : alertsLoading
                ? 'Loading...'
                : alertsFailed
                  ? 'Unavailable'
                  : openAlerts
                    ? openAlertText
                    : 'Unavailable'
          }
        />
      ) : null}
    </section>
  )
}
