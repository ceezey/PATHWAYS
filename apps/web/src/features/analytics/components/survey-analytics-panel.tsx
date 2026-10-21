'use client'

import { AlertTriangle, BarChart3, ClipboardCheck, Target } from 'lucide-react'

import { AsyncState } from '@/components/pathways'
import { MetricCard } from '@/components/pathways/metric-card'
import { metricUnavailableLabel } from '@/features/projects'
import type { ActivitySummary } from '@/types/pathways'
import type { SurveyAnalytics } from '@pathways/shared'

import {
  SURVEY_FROZEN_CAPTION,
  SURVEY_PERIOD_MESSAGE,
  type SurveyErrorKind,
} from '../analytics.copy'
import { analyticsCellValue, surveyGroupRows } from '../analytics.utils'
import { SurveyImprovementChart } from './analytics-charts'
import { UnavailableChart } from './chart-panel'

/**
 * F9 survey improvement view (analytics.descriptive.survey.v1). Cards + chart cover the
 * cohort ("all activities") group; the table lists every group, including per-activity
 * breakdowns, with the same MISSING/SUPPRESSED wording as the rest of Analytics.
 */
export const SurveyAnalyticsPanel = ({
  data,
  loading,
  error,
  errorKind,
  frozen,
  noUsablePeriod,
  onRetry,
  periodsReadable,
  showChart,
  activities,
}: {
  data: SurveyAnalytics | null
  loading: boolean
  error: string
  errorKind: SurveyErrorKind
  frozen: boolean
  noUsablePeriod: boolean
  onRetry: () => void
  periodsReadable: boolean
  showChart: boolean
  activities: readonly ActivitySummary[]
}) => {
  if (loading)
    return (
      <AsyncState
        status="loading"
        title="Loading survey analytics"
        description="Loading scoped paired assessment data."
        icon={BarChart3}
      />
    )
  if (error && errorKind !== 'retry') return <UnavailableChart description={error} />
  if (error)
    return (
      <AsyncState
        status="error"
        title="Survey analytics could not be loaded"
        description={error}
        icon={AlertTriangle}
        onRetry={onRetry}
      />
    )
  if (!data && noUsablePeriod) return <UnavailableChart description={SURVEY_PERIOD_MESSAGE} />
  if (!data)
    return (
      <UnavailableChart
        description={
          periodsReadable
            ? 'No active Indicator reporting period is available for this project.'
            : 'Indicator reporting periods are not available for this role.'
        }
        title={periodsReadable ? 'None yet' : undefined}
      />
    )
  const { overall } = data
  const isSuppressed = overall.pairs.state === 'SUPPRESSED'
  const isMissing = overall.pairs.value === '0'
  return (
    <div className="space-y-4" data-testid="survey-analytics">
      {frozen ? <p className="text-sm text-muted-foreground">{SURVEY_FROZEN_CAPTION}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          description="Enrollments with both a PRE_TEST and a POST_TEST in this period."
          icon={ClipboardCheck}
          label="Paired assessments"
          tone="info"
          value={analyticsCellValue(overall.pairs)}
        />
        <MetricCard
          description="Cohort mean normalized pre-test score (0-100)."
          icon={BarChart3}
          label="Mean pre-test"
          tone="info"
          value={analyticsCellValue(overall.meanPre, 'percent')}
        />
        <MetricCard
          description="Cohort mean normalized post-test score (0-100)."
          icon={BarChart3}
          label="Mean post-test"
          tone="info"
          value={analyticsCellValue(overall.meanPost, 'percent')}
        />
        <MetricCard
          description="Cohort-level change in mean normalized score. Never an individual verdict."
          icon={Target}
          label="Mean cohort change"
          tone={
            overall.meanChange.value === null
              ? 'info'
              : Number(overall.meanChange.value) < 0
                ? 'warning'
                : 'success'
          }
          value={analyticsCellValue(overall.meanChange, 'pp')}
        />
      </div>
      {isSuppressed ? (
        <p className="text-sm text-muted-foreground">Suppressed</p>
      ) : isMissing ? (
        <UnavailableChart description={metricUnavailableLabel(overall.meanPre)} title="None yet" />
      ) : showChart ? (
        <SurveyImprovementChart group={overall} title="Cohort change (all activities)" />
      ) : null}
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Survey improvement by group</caption>
        <thead>
          <tr className="border-b">
            <th className="p-2">Group</th>
            <th className="p-2">Pairs</th>
            <th className="p-2">Mean pre</th>
            <th className="p-2">Mean post</th>
            <th className="p-2">Mean change</th>
            <th className="p-2">Improved</th>
            <th className="p-2">Same</th>
            <th className="p-2">Declined</th>
          </tr>
        </thead>
        <tbody>
          {surveyGroupRows(data, activities).map((row) => (
            <tr className="border-b" key={row.key}>
              <td className="p-2">{row.label}</td>
              <td className="p-2 tabular-nums">{analyticsCellValue(row.pairs)}</td>
              <td className="p-2 tabular-nums">{analyticsCellValue(row.meanPre, 'percent')}</td>
              <td className="p-2 tabular-nums">{analyticsCellValue(row.meanPost, 'percent')}</td>
              <td className="p-2 tabular-nums">{analyticsCellValue(row.meanChange, 'pp')}</td>
              <td className="p-2 tabular-nums">{analyticsCellValue(row.improved)}</td>
              <td className="p-2 tabular-nums">{analyticsCellValue(row.same)}</td>
              <td className="p-2 tabular-nums">{analyticsCellValue(row.declined)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
