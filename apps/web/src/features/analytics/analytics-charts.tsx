'use client'

import ReactECharts from 'echarts-for-react'

import type {
  Activity,
  AlertRecord,
  BeneficiaryRecord,
  BudgetRecord,
  ProjectDetail,
} from '@/types/pathways'

type ChartProps = {
  projects: ProjectDetail[]
  budgets: BudgetRecord[]
  activities: Activity[]
  beneficiaries: BeneficiaryRecord[]
  alerts: AlertRecord[]
}

const grid = { left: 16, right: 16, top: 28, bottom: 18, containLabel: true }
const colors = ['#0f766e', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed']

export const ProjectPerformanceTrendChart = ({ projects }: Pick<ChartProps, 'projects'>) => (
  <ReactECharts
    className="h-[300px] w-full"
    option={{
      color: colors,
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid,
      xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] },
      yAxis: { type: 'value', min: 0, max: 100 },
      series: projects.slice(0, 4).map((project, index) => ({
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

export const BudgetUtilizationChart = ({
  projects,
  budgets,
}: Pick<ChartProps, 'projects' | 'budgets'>) => (
  <ReactECharts
    className="h-[280px] w-full"
    option={{
      color: ['#2563eb', '#f59e0b'],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0 },
      grid,
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

export const BeneficiaryReachChart = ({ projects }: Pick<ChartProps, 'projects'>) => (
  <ReactECharts
    className="h-[280px] w-full"
    option={{
      color: ['#0f766e', '#e2e8f0'],
      tooltip: { trigger: 'item' },
      series: projects.map((project, index) => {
        const remaining = Math.max(project.targetBeneficiaries - project.beneficiariesReached, 0)

        return {
          name: project.title,
          type: 'pie',
          radius: ['48%', '68%'],
          center: [`${18 + index * 20}%`, '52%'],
          label: { formatter: project.title.split(' ')[0], fontSize: 10 },
          data: [
            { value: project.beneficiariesReached, name: 'Reached' },
            { value: remaining, name: 'Remaining' },
          ],
        }
      }),
    }}
  />
)

export const SadddChart = ({ beneficiaries }: Pick<ChartProps, 'beneficiaries'>) => {
  const sexGroups = ['Female', 'Male', 'Prefer not to say']
  const ageGroups = ['10-14', '15-17', '18-24', '25+']

  return (
    <ReactECharts
      className="h-[280px] w-full"
      option={{
        color: colors,
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { top: 0 },
        grid,
        xAxis: { type: 'category', data: ageGroups },
        yAxis: { type: 'value' },
        series: sexGroups.map((sex) => ({
          name: sex,
          type: 'bar',
          stack: 'saddd',
          data: ageGroups.map(
            (ageGroup) =>
              beneficiaries.filter(
                (beneficiary) => beneficiary.sex === sex && beneficiary.ageGroup === ageGroup,
              ).length,
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
        color: ['#dc2626', '#f59e0b', '#2563eb'],
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
