// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import {
  addDashboardChart,
  getDashboardChartRows,
  moveDashboardChart,
  removeDashboardChart,
  resizeDashboardChart,
} from './dashboard-charts'
import { DEMO_KEY, createDemoBaseline, getDemoState, resetDemo, switchDemoAccount } from './store'

beforeEach(() => {
  localStorage.clear()
  resetDemo()
  switchDemoAccount('monitoring-evaluation-officer')
})

describe('project-specific monitoring dashboard charts', () => {
  it('starts empty and keeps saved charts isolated by project', () => {
    expect(getDemoState().dashboardCharts).toEqual([])

    const futureMakers = addDashboardChart({
      projectId: 'futuremakers-ncr',
      analysis: 'participation',
      visualization: 'bar',
      period: 'Q2 2026',
    })
    addDashboardChart({
      projectId: 'grassroots-centers-navotas',
      analysis: 'timeline',
      visualization: 'line',
      period: 'July 2026',
    })

    const state = getDemoState()
    expect(
      state.dashboardCharts.filter((chart) => chart.projectId === 'futuremakers-ncr'),
    ).toHaveLength(1)
    expect(
      state.dashboardCharts.filter((chart) => chart.projectId === 'grassroots-centers-navotas'),
    ).toHaveLength(1)
    expect(getDashboardChartRows(state, futureMakers)[0]?.label).toBe('FutureMakers NCR')
  })

  it('resizes, reorders, removes, and rejects duplicate saved charts', () => {
    const first = addDashboardChart({
      projectId: 'futuremakers-ncr',
      analysis: 'participation',
      visualization: 'bar',
      period: 'Q2 2026',
    })
    const second = addDashboardChart({
      projectId: 'futuremakers-ncr',
      analysis: 'timeline',
      visualization: 'line',
      period: 'Q2 2026',
    })

    expect(() =>
      addDashboardChart({
        projectId: 'futuremakers-ncr',
        analysis: 'participation',
        visualization: 'bar',
        period: 'Q2 2026',
      }),
    ).toThrow('already saved')

    resizeDashboardChart(first.id, 'full')
    moveDashboardChart(second.id, first.id)
    let charts = getDemoState()
      .dashboardCharts.filter((chart) => chart.projectId === 'futuremakers-ncr')
      .sort((left, right) => left.order - right.order)
    expect(charts.map((chart) => chart.id)).toEqual([second.id, first.id])
    expect(charts.find((chart) => chart.id === first.id)?.width).toBe('full')

    removeDashboardChart(second.id)
    charts = getDemoState().dashboardCharts.filter(
      (chart) => chart.projectId === 'futuremakers-ncr',
    )
    expect(charts.map((chart) => chart.id)).toEqual([first.id])
  })

  it('enforces project scope and migrates existing browser state to an empty chart list', () => {
    switchDemoAccount('project-manager')
    expect(() =>
      addDashboardChart({
        projectId: 'grassroots-centers-navotas',
        analysis: 'kpi',
        visualization: 'bar',
        period: 'Q2 2026',
      }),
    ).toThrow('scope')

    const legacy = createDemoBaseline() as Partial<ReturnType<typeof createDemoBaseline>>
    legacy.dashboardCharts = undefined
    localStorage.setItem(DEMO_KEY, JSON.stringify(legacy))
    expect(getDemoState().dashboardCharts).toEqual([])
  })
})
