/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  api,
  currentAccess,
  download,
  indicator,
  loadDashboard,
  previewExport,
  resetAnalyticsMocks,
  surveyDefaults,
  toastError,
} from '@/test/fixtures/analytics-dashboard-fixtures'

import { SURVEY_PERIOD_MESSAGE } from '../analytics.copy'
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

  it('loads descriptive statistics and exports suppressed aggregates with the analytics permissions (flag on)', async () => {
    vi.resetModules()
    vi.doMock('@/constants/feature-flags', () => ({
      ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED: true,
      UNFINISHED_CONTROLS_UI_ENABLED: true,
      DASHBOARD_PINS_UI_ENABLED: false,
      MAPS_UI_ENABLED: false,
    }))
    const { AnalyticsDashboard: ExportEnabledDashboard } = await import('./analytics-dashboard')
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'analytics.descriptive.read',
      'analytics.export',
    ]
    const suppressed = { state: 'SUPPRESSED', value: null, reason: 'SMALL_CELL' }
    api.getDescriptiveAnalytics.mockResolvedValue({
      contractVersion: 'analytics.descriptive.v1',
      projectId: 'project-a',
      generatedAt: '2026-09-27T04:00:00.000Z',
      monitoringPeriod: {
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        businessTimeZone: 'Asia/Manila',
      },
      sadddPeriod: { periodStart: null, periodEnd: null },
      sadddReleaseState: 'RELEASED',
      privacy: {
        threshold: 0,
        complementarySuppression: false,
        source: 'P06_SADDD_RELEASE',
        beneficiaryRows: false,
      },
      counts: [{ key: 'sadddTotal', label: 'SADDD individuals', metric: suppressed }],
      distributions: [
        { section: 'SADDD_SEX', key: 'FEMALE', label: 'Female', metric: suppressed, share: null },
      ],
      indicatorSummaries: [],
    })
    download.mockResolvedValue(undefined)
    previewExport.mockResolvedValue({
      title: 'Descriptive analytics',
      columns: ['section', 'key', 'state'],
      rows: [['COUNT', 'sadddTotal', 'SUPPRESSED']],
      totalRows: 7,
    })
    render(<ExportEnabledDashboard />)

    await waitFor(() =>
      expect(api.getDescriptiveAnalytics).toHaveBeenCalledWith({
        projectId: 'project-a',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      }),
    )
    const table = await screen.findByTestId('descriptive-statistics')
    expect(table.textContent).toContain('Withheld')
    expect(table.textContent).toContain('Suppressed')

    expect(screen.getByRole('button', { name: 'Export aggregates' })).toBeTruthy()
    fireEvent.click(screen.getByText('CSV'))
    const dialog = await screen.findByTestId('analytics-export-preview')
    expect(previewExport).toHaveBeenCalledWith({
      projectId: 'project-a',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    })
    expect(dialog.textContent).toContain('Showing 1 of 7 rows')
    expect(dialog.textContent).toContain('SUPPRESSED')
    expect(screen.getByText(/Descriptive analytics for Project A/)).toBeTruthy()
    expect(download).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByTestId('analytics-export-preview')).toBeNull())
    expect(download).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('CSV'))
    await screen.findByTestId('analytics-export-preview')
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() =>
      expect(download).toHaveBeenCalledWith(
        '/analytics/descriptive/export?projectId=project-a&periodStart=2026-09-01&periodEnd=2026-09-30',
        'descriptive-analytics-project-a.csv',
      ),
    )
    for (const format of ['XLS', 'PDF']) expect(screen.getByText(format)).toBeTruthy()
    await waitFor(() => expect(screen.queryByTestId('analytics-export-preview')).toBeNull())
    fireEvent.click(screen.getByText('XLSX'))
    await screen.findByTestId('analytics-export-preview')
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() =>
      expect(download).toHaveBeenCalledWith(
        '/analytics/descriptive/export?projectId=project-a&periodStart=2026-09-01&periodEnd=2026-09-30&format=XLSX',
        'descriptive-analytics-project-a.xlsx',
      ),
    )

    vi.doUnmock('@/constants/feature-flags')
  })

  it('loads every analytics panel on mount without a Retry click', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(api.getActivities).toHaveBeenCalledTimes(1))
    expect(api.getProjectIndicators).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    fireEvent.change(screen.getByLabelText('Reporting period'), {
      target: { value: '2026-08-01::2026-08-31' },
    })
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  it('offers Retry only after a real failure and reloads on click', async () => {
    api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring unavailable.'))
    render(<AnalyticsDashboard />)
    const retry = await screen.findByRole('button', { name: /retry/i })
    fireEvent.click(retry)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(2))
  })

  it('shows the specific server reason when the export preview fails', async () => {
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'analytics.descriptive.read',
      'analytics.export',
    ]
    previewExport.mockRejectedValue(new Error('Monitoring verification is unavailable.'))
    vi.resetModules()
    vi.doMock('@/constants/feature-flags', () => ({
      ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED: true,
      UNFINISHED_CONTROLS_UI_ENABLED: true,
      DASHBOARD_PINS_UI_ENABLED: false,
      MAPS_UI_ENABLED: false,
    }))
    const { AnalyticsDashboard: ExportEnabledDashboard } = await import('./analytics-dashboard')
    render(<ExportEnabledDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    fireEvent.click(screen.getByText('CSV'))
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Monitoring verification is unavailable.'),
    )
    expect(screen.queryByTestId('analytics-export-preview')).toBeNull()
    expect(download).not.toHaveBeenCalled()
    vi.doUnmock('@/constants/feature-flags')
  })

  it('shows the export button with the analytics.export permission', async () => {
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'analytics.descriptive.read',
      'analytics.export',
    ]
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Export aggregates' })).toBeTruthy()
  })

  it('hides descriptive statistics and export for roles without the analytics permissions', async () => {
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
    expect(api.getDescriptiveAnalytics).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Export aggregates' })).toBeNull()
    expect(screen.queryByTestId('descriptive-statistics')).toBeNull()
  })

  it('does not offer export when only the descriptive read permission is held', async () => {
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'analytics.descriptive.read',
    ]
    api.getDescriptiveAnalytics.mockRejectedValue(new Error('Descriptive statistics unavailable.'))
    render(<AnalyticsDashboard />)
    await waitFor(() => expect(api.getDescriptiveAnalytics).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Export aggregates' })).toBeNull()
    expect(download).not.toHaveBeenCalled()
  })

  it('hides Add to Dashboard while the dashboard pins flag is off', async () => {
    const Dashboard = await loadDashboard({ pins: false })
    render(<Dashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

    expect(screen.queryByRole('button', { name: 'Add to Dashboard' })).toBeNull()
  })

  it('pins the current view, project and period with Add to Dashboard (flag on)', async () => {
    vi.resetModules()
    vi.doMock('@/constants/feature-flags', () => ({
      ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED: true,
      UNFINISHED_CONTROLS_UI_ENABLED: true,
      DASHBOARD_PINS_UI_ENABLED: true,
      MAPS_UI_ENABLED: false,
    }))
    const { AnalyticsDashboard: PinsEnabledDashboard } = await import('./analytics-dashboard')
    vi.doUnmock('@/constants/feature-flags')
    render(<PinsEnabledDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Add to Dashboard' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add to Dashboard' }))

    const stored = JSON.parse(
      window.localStorage.getItem('pathways.dashboardPins.v1.user-1') ?? '[]',
    )
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      view: 'kpi',
      projectId: 'project-a',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    })
  })

  it('offers Add to Dashboard and Participation patterns regardless of the unfinished-controls flag', async () => {
    currentAccess.profile.permissions = [
      ...currentAccess.profile.permissions,
      'analytics.descriptive.read',
      'journeys.read',
      'beneficiaries.records.read',
      'assessments.detail.read',
    ]
    vi.resetModules()
    vi.doMock('@/constants/feature-flags', () => ({
      ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED: false,
      UNFINISHED_CONTROLS_UI_ENABLED: false,
      DASHBOARD_PINS_UI_ENABLED: true,
      MAPS_UI_ENABLED: false,
    }))
    const { AnalyticsDashboard: HiddenDashboard } = await import('./analytics-dashboard')
    vi.doUnmock('@/constants/feature-flags')
    render(<HiddenDashboard />)
    await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

    expect(screen.getByRole('button', { name: 'Add to Dashboard' })).toBeTruthy()
    expect(screen.getByText('Participation patterns', { selector: 'option' })).toBeTruthy()
  })

  describe('export request per analysis view', () => {
    const loadExportDashboard = async () => {
      vi.resetModules()
      vi.doMock('@/constants/feature-flags', () => ({
        ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED: true,
        UNFINISHED_CONTROLS_UI_ENABLED: true,
        DASHBOARD_PINS_UI_ENABLED: false,
        MAPS_UI_ENABLED: false,
      }))
      const { AnalyticsDashboard: ExportEnabledDashboard } = await import('./analytics-dashboard')
      vi.doUnmock('@/constants/feature-flags')
      return ExportEnabledDashboard
    }
    const showView = async (view: string) => {
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: view } })
    }

    beforeEach(() => {
      previewExport.mockResolvedValue({ title: 'Rows', columns: [], rows: [], totalRows: 0 })
      api.getSurveyAnalytics.mockReturnValue(new Promise(() => {}))
      api.getTimelineAnalytics.mockReturnValue(new Promise(() => {}))
    })

    describe('with a survey period apart from the shared period', () => {
      beforeEach(() => {
        surveyDefaults()
        currentAccess.profile.permissions.push('analytics.export')
        api.getProjectIndicators.mockResolvedValue([
          indicator('project-a', 'A-SEP', '2026-09-01', '2026-09-30'),
          indicator('project-a', 'A-WIDE', '2026-08-15', '2026-09-15'),
          indicator('project-a', 'A-JUL', '2026-07-01', '2026-07-31'),
        ])
      })

      it('exports the shared period without a view on the KPI view', async () => {
        const Dashboard = await loadExportDashboard()
        render(<Dashboard />)
        await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
        const [periodStart, periodEnd] = (
          screen.getByLabelText('Reporting period') as HTMLSelectElement
        ).value.split('::')
        expect(periodStart).not.toBe('2026-07-01')
        fireEvent.click(screen.getByText('CSV'))
        await waitFor(() =>
          expect(previewExport).toHaveBeenCalledWith({
            projectId: 'project-a',
            periodStart,
            periodEnd,
          }),
        )
      })

      it('exports the survey period with the survey view on the survey view', async () => {
        const Dashboard = await loadExportDashboard()
        render(<Dashboard />)
        await showView('survey')
        await waitFor(() => expect(api.getSurveyAnalytics).toHaveBeenCalled())
        fireEvent.click(screen.getByText('CSV'))
        await waitFor(() =>
          expect(previewExport).toHaveBeenCalledWith({
            projectId: 'project-a',
            periodStart: '2026-07-01',
            periodEnd: '2026-07-31',
            view: 'survey',
          }),
        )
      })

      it('exports the timeline view with the shared period', async () => {
        const Dashboard = await loadExportDashboard()
        render(<Dashboard />)
        await showView('timeline')
        await waitFor(() => expect(api.getTimelineAnalytics).toHaveBeenCalled())
        const [periodStart, periodEnd] = (
          screen.getByLabelText('Reporting period') as HTMLSelectElement
        ).value.split('::')
        fireEvent.click(screen.getByText('CSV'))
        await waitFor(() =>
          expect(previewExport).toHaveBeenCalledWith({
            projectId: 'project-a',
            periodStart,
            periodEnd,
            view: 'timeline',
          }),
        )
      })
    })

    describe('with every reporting period overlapping another', () => {
      beforeEach(() => {
        surveyDefaults()
        currentAccess.profile.permissions.push('analytics.export')
        api.getProjectIndicators.mockResolvedValue([
          indicator('project-a', 'A-SEP', '2026-09-01', '2026-09-30'),
          indicator('project-a', 'A-WIDE', '2026-08-15', '2026-09-15'),
        ])
      })

      it('keeps the KPI view exportable and on its own period', async () => {
        const Dashboard = await loadExportDashboard()
        render(<Dashboard />)
        await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

        const button = screen.getByRole('button', { name: 'Export aggregates' })
        expect((button as HTMLButtonElement).disabled).toBe(false)
        expect(screen.queryByText(/No active Indicator reporting period/)).toBeNull()
      })

      it('blocks the survey export and says the period cannot be used', async () => {
        const Dashboard = await loadExportDashboard()
        render(<Dashboard />)
        await showView('survey')

        expect(await screen.findByText(SURVEY_PERIOD_MESSAGE)).toBeTruthy()
        const button = screen.getByRole('button', { name: 'Export aggregates' })
        expect((button as HTMLButtonElement).disabled).toBe(true)
      })
    })

    it('requests no survey export while the survey is unavailable for an open period', async () => {
      currentAccess.profile.permissions = [
        'projects.read',
        'monitoring.read',
        'analytics.read',
        'analytics.descriptive.read',
        'analytics.export',
        'reports.indicator.read',
      ]
      const Dashboard = await loadExportDashboard()
      render(<Dashboard />)
      await showView('survey')
      await screen.findByText(
        'Survey results for your role are released after the reporting period closes. Choose a closed period.',
      )
      fireEvent.click(screen.getByText('CSV'))
      expect(previewExport).not.toHaveBeenCalled()
    })
  })
})
