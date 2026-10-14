/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  alertHook,
  api,
  currentAccess,
  indicator,
  insights,
  monitoring,
  project,
  resetAnalyticsMocks,
} from '@/test/fixtures/analytics-dashboard-fixtures'

import { AnalyticsDashboard } from './analytics-dashboard'

const activity = (id: string, status: string) => ({
  id,
  projectId: 'project-a',
  code: id,
  title: `Activity ${id}`,
  status,
})

const released = (id: string, value: string) => ({
  ...indicator('project-a', id, '2026-09-01', '2026-09-30'),
  progress: { state: 'AVAILABLE', value, reason: null },
})

describe('Analytics dashboard summary cards and descriptive statistics empty state', () => {
  beforeEach(() => {
    resetAnalyticsMocks()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  // The card comes first in the page; a panel with the same title follows it.
  const card = (label: string) => screen.getAllByText(label)[0].parentElement?.parentElement
  const withPermissions = (...extra: string[]) => {
    currentAccess.profile.permissions = [...currentAccess.profile.permissions, ...extra]
  }

  it('counts the completed activities in the Activity completion card', async () => {
    api.getActivities.mockResolvedValue([
      activity('A-1', 'Completed'),
      activity('A-2', 'Not Started'),
      activity('A-3', 'Completed'),
    ])
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(card('Activity completion')?.textContent).toContain('2/3'))
  })

  it('hides the Activity completion card and panel without activities.read', async () => {
    currentAccess.profile.permissions = currentAccess.profile.permissions.filter(
      (permission) => permission !== 'activities.read',
    )
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    expect(screen.queryByText('Activity completion')).toBeNull()
  })

  it('shows the average of the released indicator progress in the KPI card', async () => {
    api.getMonitoringDashboard.mockResolvedValue({
      ...monitoring,
      indicators: [released('A-SEP', '40'), released('A-AUG', '61')],
    })
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(card('KPI achievement')?.textContent).toContain('51%'))
  })

  it('shows Unavailable in the Budget utilization card when the budget read fails', async () => {
    currentAccess.role = 'Program Manager'
    currentAccess.profile.roles = ['PROGRAM_MANAGER']
    withPermissions('analytics.descriptive.read', 'budgets.read', 'expenses.read')
    insights.budget = { data: undefined, isError: true, isPending: false, refetch: vi.fn() }
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(card('Budget utilization')?.textContent).toContain('Unavailable'))
  })

  it('names the failed read in the tooltip of the alerts card', async () => {
    withPermissions('alerts.read')
    alertHook.result = { data: undefined, isError: true, refetch: vi.fn() }
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    expect(card('Rule-Based Alerts')?.textContent).toBe('Rule-Based AlertsUnavailable')
    const info = screen.getAllByRole('button', {
      name: 'More information about Rule-Based Alerts',
    })[0]
    fireEvent.focus(info)
    expect(screen.getByRole('tooltip').textContent).toBe(
      'Open alerts could not be loaded. Use Retry in the Rule-Based Alerts panel.',
    )
  })

  it.each([
    [{ count: 7, capped: false }, '7'],
    [{ count: 1000, capped: true }, '1000+'],
  ])('shows the open alert count %j as the value of the alerts card', async (data, value) => {
    withPermissions('alerts.read')
    alertHook.result = { data, isError: false }
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    expect(card('Rule-Based Alerts')?.textContent).toBe(`Rule-Based Alerts${value}`)
  })

  it('shows the SADDD chart without the counts to date caption for an ended project', async () => {
    api.getProjectsForRole.mockResolvedValue([
      project('project-ended', 'Ended project', '2026-01-01', '2026-06-30'),
    ])
    api.getProjectIndicators.mockResolvedValue([
      indicator('project-ended', 'E-JUN', '2026-06-01', '2026-06-30'),
    ])
    render(<AnalyticsDashboard />)
    expect(await screen.findByTestId('saddd-chart')).toBeTruthy()
    expect(screen.queryByText('Counts to date; groups of fewer than 5 are hidden.')).toBeNull()
  })

  describe('descriptive statistics panel without a result', () => {
    const panel = () => {
      const section = screen
        .getByRole('heading', { name: 'Descriptive statistics' })
        .closest('section')
      if (!section) throw new Error('descriptive statistics panel missing')
      return within(section)
    }

    it('says there is no active reporting period when the role reads periods and none exists', async () => {
      withPermissions('analytics.descriptive.read')
      api.getProjectsForRole.mockResolvedValue([project('project-empty', 'Empty', null, null)])
      api.getProjectIndicators.mockResolvedValue([])
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getProjectIndicators).toHaveBeenCalledWith('project-empty'))
      await waitFor(() =>
        expect(
          panel().getByText('No active Indicator reporting period is available for this project.'),
        ).toBeTruthy(),
      )
      expect(panel().getByText('None yet')).toBeTruthy()
    })

    it('says the periods are not available for a role that cannot read indicators', async () => {
      currentAccess.profile.permissions = [
        'projects.read',
        'activities.read',
        'monitoring.read',
        'analytics.read',
        'analytics.descriptive.read',
      ]
      render(<AnalyticsDashboard />)
      await waitFor(() =>
        expect(
          panel().getByText('Indicator reporting periods are not available for this role.'),
        ).toBeTruthy(),
      )
      expect(panel().getByText('Data unavailable')).toBeTruthy()
    })
  })
})
