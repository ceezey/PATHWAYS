'use client'

import { type SadddDashboard, formatMetricCell } from '@pathways/shared'
import ReactECharts from 'echarts-for-react'

import type { Activity, AlertRecord, BudgetRecord, ProjectDetail } from '@/types/pathways'

import { type AggregateChartBucket, aggregateChartOption } from './aggregate-chart-options'
import { buildLegendAriaDescription, createAdaptiveLegendLayout } from './analytics-legend-options'

type ChartProps = {
  projects: ProjectDetail[]
  budgets: BudgetRecord[]
  activities: Activity[]
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
      color: ['#0072CE'],
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
const colors = ['#0072CE', '#0B2E4F', '#8A4B08', '#B42318', '#526779']

export const ProjectPerformanceTrendChart = (_props: Pick<ChartProps, 'projects'>) => (
  <div className="flex h-[300px] items-center justify-center rounded-sm border border-border bg-surface-subtle p-4 text-sm text-muted-foreground">
    Historical project trends are unavailable until the API provides a time series.
  </div>
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
        color: ['#0072CE', '#8A4B08'],
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

export const SadddChart = (
  props: { dashboard: SadddDashboard } | { label: string; buckets: AggregateChartBucket[] },
) => {
  const buckets = 'dashboard' in props ? props.dashboard.sex : props.buckets
  const label = 'dashboard' in props ? 'Sex' : props.label
  return (
    <div>
      {buckets.some((bucket) => bucket.metric.value !== null) ? (
        <ReactECharts className="h-[280px] w-full" option={aggregateChartOption(buckets, label)} />
      ) : (
        <p className="rounded-sm border border-border bg-surface-subtle p-4 text-sm text-muted-foreground">
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
        color: colors,
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
        color: ['#B42318', '#8A4B08', '#005EA8'],
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
