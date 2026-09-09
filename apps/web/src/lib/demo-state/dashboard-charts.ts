import {
  type DashboardChartAnalysis,
  type DashboardChartConfig,
  type DashboardChartVisualization,
  type DashboardChartWidth,
  type DemoState,
  getDemoState,
  nextId,
  transactDemo,
} from './store'

export interface DashboardChartRow {
  id: string
  label: string
  value: number
}

export const dashboardChartMeta: Record<DashboardChartAnalysis, { title: string; unit: string }> = {
  kpi: { title: 'KPI / indicator performance', unit: '%' },
  participation: { title: 'Participation patterns', unit: 'people' },
  survey: { title: 'Survey improvement', unit: 'points' },
  timeline: { title: 'Project / activity timeline adherence', unit: '%' },
}

type NewDashboardChart = {
  projectId: string
  analysis: DashboardChartAnalysis
  visualization: DashboardChartVisualization
  indicatorId?: string
  period: string
}

export function addDashboardChart(input: NewDashboardChart) {
  return transactDemo('dashboard.configure', input.projectId, undefined, (state) => {
    const project = state.projects.find((record) => record.id === input.projectId)
    if (!project || project.archived) throw new Error('Choose an available project.')
    if (
      input.indicatorId &&
      !state.indicators.some(
        (indicator) =>
          indicator.id === input.indicatorId && indicator.projectId === input.projectId,
      )
    )
      throw new Error('Choose an indicator linked to this project.')
    if (
      state.dashboardCharts.some(
        (chart) =>
          chart.projectId === input.projectId &&
          chart.analysis === input.analysis &&
          chart.visualization === input.visualization &&
          chart.indicatorId === input.indicatorId &&
          chart.period === input.period,
      )
    )
      throw new Error('This chart is already saved on the selected project dashboard.')

    const chart: DashboardChartConfig = {
      ...input,
      id: nextId(state, 'dashboard-chart'),
      width: 'half',
      order:
        Math.max(
          -1,
          ...state.dashboardCharts
            .filter((record) => record.projectId === input.projectId)
            .map((record) => record.order),
        ) + 1,
    }
    state.dashboardCharts.push(chart)
    return chart
  })
}

export function removeDashboardChart(id: string) {
  const chart = getDemoState().dashboardCharts.find((record) => record.id === id)
  return transactDemo('dashboard.configure', chart?.projectId, id, (state) => {
    const existing = state.dashboardCharts.find((record) => record.id === id)
    if (!existing) throw new Error('Dashboard chart not found.')
    state.dashboardCharts = state.dashboardCharts.filter((record) => record.id !== id)
  })
}

export function resizeDashboardChart(id: string, width: DashboardChartWidth) {
  const chart = getDemoState().dashboardCharts.find((record) => record.id === id)
  return transactDemo('dashboard.configure', chart?.projectId, id, (state) => {
    const existing = state.dashboardCharts.find((record) => record.id === id)
    if (!existing) throw new Error('Dashboard chart not found.')
    existing.width = width
  })
}

export function moveDashboardChart(id: string, targetId: string) {
  const chart = getDemoState().dashboardCharts.find((record) => record.id === id)
  return transactDemo('dashboard.configure', chart?.projectId, id, (state) => {
    const moving = state.dashboardCharts.find((record) => record.id === id)
    const target = state.dashboardCharts.find((record) => record.id === targetId)
    if (!moving || !target || moving.projectId !== target.projectId)
      throw new Error('Charts can only be reordered within the same project dashboard.')

    const ordered = state.dashboardCharts
      .filter((record) => record.projectId === moving.projectId)
      .sort((left, right) => left.order - right.order)
    const from = ordered.findIndex((record) => record.id === id)
    const to = ordered.findIndex((record) => record.id === targetId)
    const [moved] = ordered.splice(from, 1)
    ordered.splice(to, 0, moved)
    ordered.forEach((record, index) => {
      record.order = index
    })
  })
}

export function getDashboardChartRows(
  state: DemoState,
  chart: DashboardChartConfig,
): DashboardChartRow[] {
  const project = state.projects.find((record) => record.id === chart.projectId)
  if (!project) return []
  const projectActivities = state.activities.filter(
    (activity) => activity.projectId === chart.projectId,
  )

  if (chart.analysis === 'participation')
    return [{ id: project.id, label: project.title, value: project.beneficiariesReached }]

  if (chart.analysis === 'timeline') {
    if (!projectActivities.length) return []
    return [
      {
        id: project.id,
        label: project.title,
        value: Math.round(
          projectActivities.reduce((sum, activity) => sum + activity.progress, 0) /
            projectActivities.length,
        ),
      },
    ]
  }

  if (chart.analysis === 'survey') {
    const deltas = state.beneficiaries.flatMap((beneficiary) => {
      if (!beneficiary.projectIds.includes(project.id)) return []
      const assessments = beneficiary.assessments
        .filter((assessment) => assessment.projectId === project.id)
        .sort((left, right) => left.assessedAt.localeCompare(right.assessedAt))
      return assessments.length > 1 ? [(assessments.at(-1)?.score ?? 0) - assessments[0].score] : []
    })
    if (!deltas.length) return []
    return [
      {
        id: project.id,
        label: project.title,
        value: Math.round(deltas.reduce((sum, value) => sum + value, 0) / deltas.length),
      },
    ]
  }

  const indicator = chart.indicatorId
    ? state.indicators.find(
        (record) => record.id === chart.indicatorId && record.projectId === project.id,
      )
    : undefined
  const value = indicator
    ? indicator.target > 0
      ? Math.round((indicator.actual / indicator.target) * 100)
      : 0
    : project.kpiAchievement
  return [{ id: project.id, label: project.title, value }]
}
