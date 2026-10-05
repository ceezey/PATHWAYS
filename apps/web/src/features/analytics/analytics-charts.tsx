'use client'

import { chartPalette, chartSignal } from '@/lib/chart-palette'
import { formatCappedPercent } from '@/lib/percent'
import { type SadddDashboard, type SurveyGroup, formatMetricCell } from '@pathways/shared'
import ReactECharts from 'echarts-for-react'

import type { ActivitySummary, AlertRecord, BudgetRecord, ProjectDetail } from '@/types/pathways'

import { type AggregateChartBucket, aggregateChartOption } from './aggregate-chart-options'
import { buildLegendAriaDescription, createAdaptiveLegendLayout } from './analytics-legend-options'

type ChartProps = {
  projects: ProjectDetail[]
  budgets: BudgetRecord[]
  activities: ActivitySummary[]
  alerts: AlertRecord[]
}

export interface DescriptiveAnalysisRow {
  id: string
  label: string
  value: number
}

export const DescriptiveAnalysisChart = ({
  rows,
  type,
  title,
  unit,
}: {
  rows: DescriptiveAnalysisRow[]
  type: 'bar' | 'line'
  title: string
  unit: string
}) => (
  <ReactECharts
    className="h-[320px] w-full"
    option={{
      animation: false,
      aria: {
        enabled: true,
        description: `${title}. ${rows.map((row) => `${row.label}: ${row.value} ${unit}`).join('; ')}.`,
      },
      color: [chartPalette[0]],
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: number) => `${value.toLocaleString()} ${unit}`,
      },
      grid,
      xAxis: { type: 'category', data: rows.map((row) => row.label) },
      yAxis: { type: 'value', min: 0, name: unit },
      series: [
        {
          name: title,
          type,
          data: rows.map((row) => row.value),
          smooth: type === 'line',
          areaStyle: type === 'line' ? { opacity: 0.08 } : undefined,
        },
      ],
    }}
  />
)

const grid = { left: 16, right: 16, top: 28, bottom: 18, containLabel: true }

export const IndicatorProgressChart = ({ rows }: { rows: DescriptiveAnalysisRow[] }) => (
  <ReactECharts
    className="h-[320px] w-full"
    option={{
      animation: false,
      aria: {
        enabled: true,
        description: `Indicator progress toward target. ${rows.map((row) => `${row.label}: ${formatCappedPercent(row.value)}`).join('; ')}.`,
      },
      color: [chartPalette[0]],
      tooltip: {
        trigger: 'axis',
        formatter: (items: Array<{ dataIndex: number; name: string }>) =>
          items
            .map((item) => `${item.name}: ${formatCappedPercent(rows[item.dataIndex]?.value ?? 0)}`)
            .join('<br/>'),
      },
      grid: { ...grid, left: 8, right: 48 },
      xAxis: {
        type: 'value',
        min: 0,
        max: 100,
        name: '% of target',
      },
      yAxis: { type: 'category', inverse: true, data: rows.map((row) => row.label) },
      series: [
        {
          name: 'Progress',
          type: 'bar',
          // Bars stop at 100%; an overrun keeps its real value in the label and turns red.
          data: rows.map((row) => ({
            value: Math.min(100, row.value),
            ...(row.value > 100 ? { itemStyle: { color: chartSignal.danger } } : {}),
          })),
          label: {
            show: true,
            position: 'right',
            formatter: ({ dataIndex }: { dataIndex: number }) =>
              (rows[dataIndex]?.value ?? 0) > 100 ? '100%+' : `${rows[dataIndex]?.value ?? 0}%`,
          },
        },
      ],
    }}
  />
)

export const BudgetUtilizationChart = ({
  projects,
  budgets,
}: Pick<ChartProps, 'projects' | 'budgets'>) => {
  const legendLabels = ['Planned allocation', 'Actual spending']
  const legendLayout = createAdaptiveLegendLayout(legendLabels)

  return (
    <ReactECharts
      className="h-[280px] w-full"
      option={{
        animation: false,
        aria: {
          enabled: true,
          description: buildLegendAriaDescription(
            'Planned allocation and actual spending by project.',
            legendLabels,
          ),
        },
        color: chartPalette.slice(0, 2),
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        ...legendLayout,
        xAxis: { type: 'value' },
        yAxis: {
          type: 'category',
          data: projects.map((project) => project.title.replace(' - ', '\n')),
        },
        series: [
          {
            name: 'Planned allocation',
            type: 'bar',
            data: projects.map(
              (project) =>
                budgets.find((budget) => budget.projectId === project.id)?.plannedAmount ?? 0,
            ),
          },
          {
            name: 'Actual spending',
            type: 'bar',
            data: projects.map(
              (project) =>
                budgets.find((budget) => budget.projectId === project.id)?.actualSpending ?? 0,
            ),
          },
        ],
      }}
    />
  )
}

/**
 * Shared bucket-chart-or-fallback pattern: a chart when at least one bucket has a
 * releasable value, otherwise a plain-language fallback, plus a screen-reader-only
 * accessible table of every bucket (including suppressed/missing ones, which never
 * plot as a fabricated 0). Used by SadddChart and SurveyImprovementChart so the two
 * views cannot drift.
 */
const AggregateBucketChart = ({
  buckets,
  label,
  height,
}: {
  buckets: AggregateChartBucket[]
  label: string
  height: string
}) => (
  <div>
    {buckets.some((bucket) => bucket.metric.value !== null) ? (
      <ReactECharts className={`${height} w-full`} option={aggregateChartOption(buckets, label)} />
    ) : (
      <p className="rounded-xl border border-border bg-surface-subtle p-4 text-sm text-muted-foreground">
        No releasable values for this view.
      </p>
    )}
    <table className="sr-only">
      <caption>{label} values</caption>
      <tbody>
        {buckets.map((bucket) => (
          <tr key={bucket.key}>
            <th>{bucket.label}</th>
            <td>{formatMetricCell(bucket.metric)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

export const SadddChart = (
  props: { dashboard: SadddDashboard } | { label: string; buckets: AggregateChartBucket[] },
) => {
  const buckets = 'dashboard' in props ? props.dashboard.sex : props.buckets
  const label = 'dashboard' in props ? 'Sex' : props.label
  return <AggregateBucketChart buckets={buckets} label={label} height="h-[280px]" />
}
/**
 * F9 survey improvement (analytics.descriptive.survey.v1): improved/same/declined
 * counts for one cohort group, reusing the same aggregate chart option and
 * accessible-table pattern as SadddChart so suppressed/missing cells never plot as 0.
 */
export const SurveyImprovementChart = ({ group, title }: { group: SurveyGroup; title: string }) => {
  const buckets: AggregateChartBucket[] = [
    { key: 'improved', label: 'Improved', metric: group.improved },
    { key: 'same', label: 'Same', metric: group.same },
    { key: 'declined', label: 'Declined', metric: group.declined },
  ]
  return <AggregateBucketChart buckets={buckets} label={title} height="h-[260px]" />
}

export const ActivityCompletionChart = ({ activities }: Pick<ChartProps, 'activities'>) => {
  const statuses = ['Planned', 'In Progress', 'For Review', 'Overdue', 'Completed']

  return (
    <ReactECharts
      className="h-[260px] w-full"
      option={{
        animation: false,
        aria: {
          enabled: true,
          description: 'Project activity totals grouped by completion status.',
        },
        color: chartPalette,
        tooltip: { trigger: 'item' },
        series: [
          {
            type: 'pie',
            radius: '70%',
            data: statuses.map((status) => ({
              name: status,
              value: activities.filter((activity) => activity.status === status).length,
            })),
          },
        ],
      }}
    />
  )
}

export const AlertCountsChart = ({ alerts }: Pick<ChartProps, 'alerts'>) => {
  const severities: AlertRecord['severity'][] = ['Critical', 'Warning', 'Information']

  return (
    <ReactECharts
      className="h-[260px] w-full"
      option={{
        animation: false,
        aria: {
          enabled: true,
          description: 'Rule-Based Alert totals grouped by severity.',
        },
        color: [chartSignal.danger, chartSignal.warning, chartSignal.info],
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid,
        xAxis: { type: 'category', data: severities },
        yAxis: { type: 'value', minInterval: 1 },
        series: [
          {
            type: 'bar',
            data: severities.map(
              (severity) => alerts.filter((alert) => alert.severity === severity).length,
            ),
          },
        ],
      }}
    />
  )
}
