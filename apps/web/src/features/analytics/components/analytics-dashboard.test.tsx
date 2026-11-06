/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  api,
  coverageMap,
  currentAccess,
  indicator,
  insights,
  kpiCard,
  loadDashboard,
  loadMapsDashboard,
  monitoring,
  project,
  resetAnalyticsMocks,
} from '@/test/fixtures/analytics-dashboard-fixtures'

import { AnalyticsDashboard } from './analytics-dashboard'

describe('Analytics dashboard request dependencies', () => {
  beforeEach(() => {
    resetAnalyticsMocks()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('derives exact periods and keeps period changes monitoring-only', async () => {
    const MapsDashboard = await loadMapsDashboard()
    render(<MapsDashboard />)

    await waitFor(() =>
      expect(api.getMonitoringDashboard).toHaveBeenCalledWith({
        projectId: 'project-a',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      }),
    )
    expect(screen.queryByText('Q1 2026')).toBeNull()
    expect(screen.queryByText('Q2 2026')).toBeNull()
    expect(screen.queryByText('July 2026')).toBeNull()
    expect(api.getActivities).toHaveBeenCalledTimes(1)
    expect(api.getSadddDashboard).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Visualization type'), {
      target: { value: 'map' },
    })
    const map = await screen.findByTestId('coverage-map')
    const mapInstance = map.getAttribute('data-instance')
    const firstFeatureCollection = coverageMap.featureCollections.at(-1)

    fireEvent.change(screen.getByLabelText('Reporting period'), {
      target: { value: '2026-08-01::2026-08-31' },
    })
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(2))
    expect(api.getMonitoringDashboard).toHaveBeenLastCalledWith({
      projectId: 'project-a',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
    })
    expect(api.getActivities).toHaveBeenCalledTimes(1)
    expect(api.getSadddDashboard).not.toHaveBeenCalled()
    expect(screen.getByTestId('coverage-map').getAttribute('data-instance')).toBe(mapInstance)
    expect(coverageMap.featureCollections.at(-1)).toBe(firstFeatureCollection)

    fireEvent.change(screen.getByLabelText('Project filter'), {
      target: { value: 'project-b' },
    })
    await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-b'))
    expect(api.getSadddDashboard).not.toHaveBeenCalled()
    expect(screen.getByText('SADDD opens when this project starts on Oct 15, 2026')).toBeTruthy()
    await waitFor(() =>
      expect(api.getMonitoringDashboard).toHaveBeenCalledWith({
        projectId: 'project-b',
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
      }),
    )
    expect(screen.getByLabelText('Reporting period')).toHaveProperty(
      'value',
      '2026-11-01::2026-11-30',
    )
    expect(
      api.getMonitoringDashboard.mock.calls.some(
        ([query]) => query.projectId === 'project-b' && query.periodStart === '2026-08-01',
      ),
    ).toBe(false)
    expect(screen.getByTestId('coverage-map').getAttribute('data-instance')).toBe(mapInstance)
    // The map covers every scoped project, so a project change keeps the same points.
    expect(coverageMap.featureCollections.at(-1)).toBe(firstFeatureCollection)
  })

  it('shows budget utilization from the insights read', async () => {
    // Program Manager holds budgets.read, expenses.read and analytics.descriptive.read.
    currentAccess.role = 'Program Manager'
    currentAccess.profile.roles = ['PROGRAM_MANAGER']
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'budgets.read',
      'expenses.read',
      'analytics.descriptive.read',
    ]
    insights.budget = {
      data: {
        projectId: 'project-a',
        currencies: [
          { currency: 'PHP', planned: 1500, approved: 450, pending: 900, utilizationPercent: 30 },
        ],
      },
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    }

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(screen.getAllByText('30%').length).toBeGreaterThan(0))
    expect(screen.getByText(/1,500\.00/)).toBeTruthy()
    expect(screen.getByText(/450\.00/)).toBeTruthy()
  })

  it('hides budget utilization when the budgets or expenses read permission is absent', async () => {
    render(<AnalyticsDashboard />)

    await screen.findAllByText('KPI achievement')
    expect(screen.queryByText('Budget utilization')).toBeNull()
  })

  it('surfaces a budget utilization server error instead of a false result', async () => {
    currentAccess.role = 'Program Manager'
    currentAccess.profile.roles = ['PROGRAM_MANAGER']
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'budgets.read',
      'expenses.read',
      'analytics.descriptive.read',
    ]
    insights.budget = {
      data: undefined,
      error: Object.assign(new Error('down'), { status: 503 }),
      isError: true,
      isPending: false,
      refetch: vi.fn(),
    }

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(screen.getByText('Budget utilization unavailable')).toBeTruthy())
  })

  it('does not offer the Map visualization while maps are hidden', async () => {
    const Dashboard = await loadDashboard({ maps: false })
    render(<Dashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    expect(screen.queryByRole('option', { name: 'Map' })).toBeNull()
  })

  it('renders the Project-scoped empty map without requiring a reporting period', async () => {
    api.getProjectsForRole.mockResolvedValue([
      project('project-empty', 'No Coordinates Project', null, null),
    ])
    api.getProjectIndicators.mockResolvedValue([])

    const MapsDashboard = await loadMapsDashboard()
    render(<MapsDashboard />)

    await waitFor(() => expect(api.getProjectIndicators).toHaveBeenCalledWith('project-empty'))
    fireEvent.change(screen.getByLabelText('Visualization type'), {
      target: { value: 'map' },
    })

    expect(await screen.findByRole('heading', { name: 'Project Coverage Map' })).toBeTruthy()
    expect(
      screen.getByText(
        'Projects placed by implementation area. Hover or tap a point for its KPI, progress and SADDD overview.',
      ),
    ).toBeTruthy()
    expect(screen.getByTestId('coverage-map')).toBeTruthy()
    expect(coverageMap.featureCollections.at(-1)).toEqual({
      type: 'FeatureCollection',
      features: [],
    })
    expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
  })

  it('shows no SADDD card and makes no SADDD request without the SADDD grant', async () => {
    currentAccess.profile.permissions = currentAccess.profile.permissions.filter(
      (permission) => permission !== 'analytics.saddd.read',
    )
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    expect(screen.queryByText('SADDD Analysis')).toBeNull()
    expect(api.getSadddDashboard).not.toHaveBeenCalled()
  })

  it.each([
    ['missing startDate', null, '2026-09-30'],
    ['missing endDate', '2026-09-01', null],
  ])('does not request SADDD with %s', async (_label, startDate, endDate) => {
    api.getProjectsForRole.mockResolvedValue([
      project('project-missing-date', 'Missing date project', startDate, endDate),
    ])
    api.getProjectIndicators.mockResolvedValue([
      indicator('project-missing-date', 'M-SEP', '2026-09-01', '2026-09-30'),
    ])

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
    expect(api.getSadddDashboard).not.toHaveBeenCalled()
    expect(screen.getByText('SADDD needs project dates')).toBeTruthy()
    expect(screen.queryByText('SADDD analysis unavailable')).toBeNull()
  })

  it('requests SADDD for an ongoing project and captions it as counts to date', async () => {
    api.getProjectsForRole.mockResolvedValue([
      project('project-live', 'Ongoing project', '2026-09-01', '2026-12-31'),
    ])
    api.getProjectIndicators.mockResolvedValue([
      indicator('project-live', 'L-SEP', '2026-09-01', '2026-09-30'),
    ])

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getSadddDashboard).toHaveBeenCalled())
    expect(await screen.findByText('Counts to date.')).toBeTruthy()
    expect(screen.queryByText(/SADDD opens/)).toBeNull()
  })

  it('withholds monitoring when no valid active Indicator period exists', async () => {
    api.getProjectsForRole.mockResolvedValue([
      project('project-empty', 'No period project', null, null),
    ])
    api.getProjectIndicators.mockResolvedValue([
      { ...indicator('project-empty', 'ARCHIVED', '2026-09-01', '2026-09-30'), status: 'ARCHIVED' },
      { ...indicator('project-empty', 'INVALID', 'invalid', '2026-09-30') },
    ])

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getProjectIndicators).toHaveBeenCalledWith('project-empty'))
    await waitFor(() =>
      expect((screen.getByLabelText('Reporting period') as HTMLSelectElement).disabled).toBe(true),
    )
    expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
    expect(
      screen.getByText('No active Indicator reporting period is available for this project.'),
    ).toBeTruthy()
  })

  it('settles a dated-Project SADDD 503 without retrying on period changes', async () => {
    api.getProjectsForRole.mockResolvedValue([
      project('project-dated', 'Dated project', '2025-08-01', '2025-09-30'),
    ])
    api.getProjectIndicators.mockResolvedValue([
      indicator('project-dated', 'D-SEP', '2025-09-01', '2025-09-30'),
      indicator('project-dated', 'D-AUG', '2025-08-01', '2025-08-31'),
    ])
    api.getSadddDashboard.mockRejectedValue(new Error('Monitoring verification is unavailable.'))

    render(<AnalyticsDashboard />)

    await waitFor(() =>
      expect(screen.getAllByText('Monitoring verification is unavailable.')).toHaveLength(1),
    )
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
    expect(api.getSadddDashboard).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('Reporting period'), {
      target: { value: '2025-08-01::2025-08-31' },
    })
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(2))
    expect(api.getSadddDashboard).toHaveBeenCalledTimes(1)
    expect(api.getActivities).toHaveBeenCalledTimes(1)
  })

  it('hides indicator cards, never shows "None yet", for indicator data a Project Officer cannot read', async () => {
    currentAccess.role = 'Project Officer'
    currentAccess.profile.roles = ['PROJECT_OFFICER']
    currentAccess.profile.permissions = [
      'projects.read',
      'activities.read',
      'analytics.read',
      'analytics.saddd.read',
      'beneficiaries.aggregates.read',
    ]

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getActivities).toHaveBeenCalled())
    await screen.findByLabelText('Analysis view')
    expect(screen.queryByText('KPI achievement')).toBeNull()
    expect(screen.queryByText('Beneficiary reach')).toBeNull()
    expect(screen.queryByText('Unavailable')).toBeNull()
    expect(api.getProjectIndicators).not.toHaveBeenCalled()
    expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
    expect(screen.queryByText('None yet')).toBeNull()
  })

  it('loads KPI rows and reporting periods for a Program Manager without indicator definitions, on every mount', async () => {
    currentAccess.role = 'Program Manager'
    currentAccess.profile.roles = ['PROGRAM_MANAGER']
    currentAccess.profile.permissions = [
      'projects.read',
      'monitoring.read',
      'analytics.read',
      'reports.indicator.read',
    ]
    const released = indicator('project-a', 'A-SEP', '2026-09-01', '2026-09-30')
    api.getProjectIndicatorValues.mockResolvedValue([released])
    api.getMonitoringDashboard.mockResolvedValue({ ...monitoring, indicators: [released] })

    // A second mount stands in for Alerts -> browser Back -> Analytics.
    for (const _visit of [1, 2]) {
      render(<AnalyticsDashboard />)
      await waitFor(() =>
        expect(api.getMonitoringDashboard).toHaveBeenLastCalledWith({
          projectId: 'project-a',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
        }),
      )
      await waitFor(() =>
        expect(screen.getByLabelText('Reporting period')).toHaveProperty(
          'value',
          '2026-09-01::2026-09-30',
        ),
      )
      expect((await screen.findAllByText(/A-SEP/)).length).toBeGreaterThan(0)
      expect(screen.queryByText(/Analytics data unavailable/)).toBeNull()
      cleanup()
    }
    expect(api.getProjectIndicatorValues).toHaveBeenCalledWith('project-a')
    expect(api.getProjectIndicators).not.toHaveBeenCalled()
  })

  it('shows "None yet" for an empty KPI set only after a successful monitoring read', async () => {
    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    await screen.findAllByText('KPI achievement')
    await waitFor(() => expect(kpiCard()).toContain('None yet'))
  })

  it('renders the participation breakdown with suppressed cells for a role that may read it', async () => {
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'analytics.descriptive.read',
      'journeys.read',
      'beneficiaries.records.read',
      'assessments.detail.read',
    ]
    insights.participation = {
      data: {
        projectId: 'project-a',
        total: null,
        totalSuppressed: true,
        byActivity: [{ activityId: 'a', activityName: 'Training', count: null, suppressed: true }],
        byMonth: [],
        byAttendanceStatus: [],
      },
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    }

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('Analysis view'), {
      target: { value: 'participation' },
    })

    expect((await screen.findByText(/Total participation/)).textContent).toContain('Suppressed')
  })

  it('does not offer the participation view to an aggregate-only role', async () => {
    currentAccess.role = 'Program Manager'
    currentAccess.profile.roles = ['PROGRAM_MANAGER']
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'analytics.descriptive.read',
      'reports.indicator.read',
    ]

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    expect(screen.queryByText('Participation patterns', { selector: 'option' })).toBeNull()
    expect(screen.queryByText('Participation patterns are restricted for your role.')).toBeNull()
    expect(document.getElementById('pin-blocked-reason')).toBeNull()
  })

  it('does not issue permission-incompatible Activity or Indicator reads for Grant Manager', async () => {
    currentAccess.role = 'Grant Manager'
    currentAccess.profile.roles = ['GRANT_MANAGER']
    currentAccess.profile.permissions = [
      'projects.read',
      'budgets.read',
      'beneficiaries.aggregates.read',
      'analytics.read',
    ]

    render(<AnalyticsDashboard />)

    await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledWith('Grant Manager'))
    expect(api.getActivities).not.toHaveBeenCalled()
    expect(api.getProjectIndicators).not.toHaveBeenCalled()
    expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
  })

  it('does not list the survey/timeline views without the descriptive read permission', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

    // Default profile holds monitoring.read but not analytics.descriptive.read: not offered.
    expect(screen.queryByText('Survey improvement', { selector: 'option' })).toBeNull()
    expect(
      screen.queryByText('Project / activity timeline adherence', { selector: 'option' }),
    ).toBeNull()
  })

  it('retries the SADDD read from its error panel', async () => {
    api.getProjectsForRole.mockResolvedValue([
      project('project-dated', 'Dated project', '2025-08-01', '2025-09-30'),
    ])
    api.getProjectIndicators.mockResolvedValue([
      indicator('project-dated', 'D-SEP', '2025-09-01', '2025-09-30'),
    ])
    api.getSadddDashboard.mockRejectedValueOnce(
      new Error('Monitoring verification is unavailable.'),
    )

    render(<AnalyticsDashboard />)

    fireEvent.click(await screen.findByRole('button', { name: /retry/i }))

    await waitFor(() => expect(api.getSadddDashboard).toHaveBeenCalledTimes(2))
    await screen.findByTestId('saddd-chart')
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('retries the descriptive statistics read from its error panel', async () => {
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'analytics.descriptive.read',
    ]
    api.getDescriptiveAnalytics.mockRejectedValueOnce(
      new Error('Descriptive statistics are unavailable.'),
    )

    render(<AnalyticsDashboard />)

    fireEvent.click(await screen.findByRole('button', { name: /retry/i }))

    await waitFor(() => expect(api.getDescriptiveAnalytics).toHaveBeenCalledTimes(2))
  })
})
