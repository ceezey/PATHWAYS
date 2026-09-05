'use client'

import ReactECharts from 'echarts-for-react'

import type {
  Activity,
  AlertRecord,
  BeneficiarySadddAggregate,
  BudgetRecord,
  ProjectDetail,
} from '@/types/pathways'

import { buildLegendAriaDescription, createAdaptiveLegendLayout } from './analytics-legend-options'

type ChartProps = {
  projects: ProjectDetail[]
  budgets: BudgetRecord[]
  activities: Activity[]
  aggregates: BeneficiarySadddAggregate[]
  alerts: AlertRecord[]
}

const grid = { left: 16, right: 16, top: 28, bottom: 18, containLabel: true }
const colors = ['#0072CE', '#0B2E4F', '#8A4B08', '#B42318', '#526779']

export const ProjectPerformanceTrendChart = ({ projects }: Pick<ChartProps, 'projects'>) => {
  const visibleProjects = projects.slice(0, 4)
  const legendLabels = visibleProjects.map((project) => project.title)
  const legendLayout = createAdaptiveLegendLayout(legendLabels)

  return (
    <ReactECharts
      className="h-[300px] w-full"
      option={{
        animation: false,
        aria: {
          enabled: true,
          description: buildLegendAriaDescription(
            'Monthly project performance trends for the selected project view.',
            legendLabels,
          ),
        },
        color: colors,
        tooltip: { trigger: 'axis' },
        ...legendLayout,
        xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] },
        yAxis: { type: 'value', min: 0, max: 100 },
        series: visibleProjects.map((project, index) => ({
          name: project.title,
          type: 'line',
          smooth: true,
          areaStyle: { opacity: 0.08 },
          data: [0.72, 0.82, 0.88, 0.94, 1.02, 1].map((factor, monthIndex) =>
            Math.min(100, Math.round(project.kpiAchievement * factor + monthIndex + index)),
          ),
        })),
      }}
    />
  )
}

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

export const SadddChart = ({ aggregates }: Pick<ChartProps, 'aggregates'>) => {
  const sexGroups = ['Female', 'Male', 'Prefer not to say']
  const ageGroups = ['10-14', '15-17', '18-24', '25+']
  const legendLayout = createAdaptiveLegendLayout(sexGroups)

  return (
    <ReactECharts
      className="h-[280px] w-full"
      option={{
        animation: false,
        aria: {
          enabled: true,
          description: buildLegendAriaDescription(
            'SADDD Analysis counts grouped by age and sex.',
            sexGroups,
          ),
        },
        color: colors,
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        ...legendLayout,
        xAxis: { type: 'category', data: ageGroups },
        yAxis: { type: 'value' },
        series: sexGroups.map((sex) => ({
          name: sex,
          type: 'bar',
          stack: 'saddd',
          data: ageGroups.map((ageGroup) =>
            aggregates.reduce(
              (count, aggregate) =>
                aggregate.sex === sex && aggregate.ageGroup === ageGroup
                  ? count + aggregate.count
                  : count,
              0,
            ),
          ),
        })),
      }}
    />
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
