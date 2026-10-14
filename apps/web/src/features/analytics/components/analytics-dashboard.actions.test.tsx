/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  api,
  currentAccess,
  loadDashboard,
  previewExport,
  rbac,
  resetAnalyticsMocks,
  toastError,
  toastSuccess,
} from '@/test/fixtures/analytics-dashboard-fixtures'

const participationGrants = [
  'analytics.descriptive.read',
  'journeys.read',
  'beneficiaries.records.read',
  'assessments.detail.read',
]
const pinsKey = 'pathways.dashboardPins.v1.user-1'
const pins = () => JSON.parse(window.localStorage.getItem(pinsKey) ?? '[]')
const addButton = () =>
  screen.getByRole('button', { name: 'Add to Dashboard' }) as HTMLButtonElement
const exportButton = () =>
  screen.getByRole('button', { name: /Export aggregates|Preparing preview/ }) as HTMLButtonElement
const grant = (...permissions: string[]) => {
  currentAccess.profile.permissions = [...currentAccess.profile.permissions, ...permissions]
}
const pinnable = async () => {
  const Dashboard = await loadDashboard({ pins: true })
  render(<Dashboard />)
  await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
  await waitFor(() => expect(addButton().disabled).toBe(false))
}

describe('Analytics dashboard actions: rules link, Add to Dashboard and export', () => {
  beforeEach(() => {
    resetAnalyticsMocks()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('alert rules link', () => {
    it.each([
      [[], null],
      [['rules.configure'], null],
      [['rules.view'], 'View alert rules'],
      [['rules.view', 'rules.configure'], 'Manage alert rules'],
    ])('with %j shows %s', async (allowed, label) => {
      rbac.allowed = allowed
      const Dashboard = await loadDashboard({})
      render(<Dashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

      for (const name of ['View alert rules', 'Manage alert rules'])
        expect(screen.queryByRole('link', { name }) !== null).toBe(name === label)
      if (label)
        expect(screen.getByRole('link', { name: label }).getAttribute('href')).toBe(
          '/alerts/repository',
        )
    })

    it('shows no link without a role', async () => {
      rbac.allowed = ['rules.view', 'rules.configure']
      currentAccess.role = null as never
      const Dashboard = await loadDashboard({})
      render(<Dashboard />)

      await screen.findByText('No authorized project is available for this account.')
      expect(screen.queryByRole('link', { name: /alert rules/ })).toBeNull()
    })
  })

  describe('Add to Dashboard', () => {
    it('stores a KPI pin with its period, then reports the duplicate', async () => {
      await pinnable()

      fireEvent.click(addButton())
      expect(toastSuccess).toHaveBeenCalledWith('Added to your dashboard.')
      expect(pins()).toHaveLength(1)
      fireEvent.click(addButton())
      expect(toastError).toHaveBeenCalledWith('Already on your dashboard.')
      expect(toastSuccess).toHaveBeenCalledTimes(1)
      expect(pins()).toHaveLength(1)
    })

    it('reports a full dashboard', async () => {
      window.localStorage.setItem(
        pinsKey,
        JSON.stringify(
          Array.from({ length: 8 }, (_, index) => ({
            id: `pin-${index}`,
            view: 'kpi',
            projectId: `other-${index}`,
            createdAt: '2026-09-01T00:00:00.000Z',
          })),
        ),
      )
      await pinnable()

      fireEvent.click(addButton())
      expect(toastError).toHaveBeenCalledWith('Your dashboard is full. Unpin a chart first.')
      expect(toastSuccess).not.toHaveBeenCalled()
      expect(pins()).toHaveLength(8)
    })

    it('reports unavailable browser storage', async () => {
      await pinnable()
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked')
      })

      fireEvent.click(addButton())
      expect(toastError).toHaveBeenCalledWith(
        'Browser storage is unavailable, so the chart could not be pinned.',
      )
      expect(toastSuccess).not.toHaveBeenCalled()
    })

    it('stores a participation pin with its period', async () => {
      grant(...participationGrants)
      await pinnable()
      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'participation' },
      })

      expect(addButton().disabled).toBe(false)
      fireEvent.click(addButton())
      expect(pins()[0]).toMatchObject({
        view: 'participation',
        projectId: 'project-a',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
      })
    })

    it('stores a timeline pin without a period', async () => {
      grant(...participationGrants)
      await pinnable()
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })

      fireEvent.click(addButton())
      const [pin] = pins()
      expect(pin).toMatchObject({ view: 'timeline', projectId: 'project-a' })
      expect(pin).not.toHaveProperty('periodStart')
      expect(pin).not.toHaveProperty('periodEnd')
    })

    it('blocks the survey view with its reason and stores nothing', async () => {
      grant(...participationGrants)
      await pinnable()
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })

      expect(addButton().disabled).toBe(true)
      expect(addButton().title).toBe('Survey improvement cannot be pinned.')
      expect(addButton().getAttribute('aria-describedby')).toBe('pin-blocked-reason')
      expect(document.getElementById('pin-blocked-reason')?.textContent).toBe(
        'Survey improvement cannot be pinned.',
      )
      fireEvent.click(addButton())
      expect(pins()).toHaveLength(0)
    })

    it('blocks the KPI view with its reason while the project has no reporting period', async () => {
      api.getProjectIndicators.mockResolvedValue([])
      const Dashboard = await loadDashboard({ pins: true })
      render(<Dashboard />)
      await waitFor(() => expect(api.getProjectIndicators).toHaveBeenCalled())

      await waitFor(() =>
        expect(addButton().title).toBe('Choose a reporting period to pin this view.'),
      )
      expect(addButton().disabled).toBe(true)
      expect(document.getElementById('pin-blocked-reason')?.textContent).toBe(
        'Choose a reporting period to pin this view.',
      )
    })

    it('has no reason text and no title while the view can be pinned', async () => {
      await pinnable()

      expect(addButton().title).toBe('')
      expect(addButton().getAttribute('aria-describedby')).toBeNull()
      expect(document.getElementById('pin-blocked-reason')).toBeNull()
    })

    it('hides the button for a role that cannot read indicator progress', async () => {
      currentAccess.profile.permissions = ['projects.read', 'activities.read', 'analytics.read']
      const Dashboard = await loadDashboard({ pins: true })
      render(<Dashboard />)
      await waitFor(() => expect(api.getActivities).toHaveBeenCalled())

      expect(screen.queryByRole('button', { name: 'Add to Dashboard' })).toBeNull()
    })

    it('disables the button without a user id', async () => {
      currentAccess.profile.userId = '' as never
      const Dashboard = await loadDashboard({ pins: true })
      render(<Dashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

      expect(addButton().disabled).toBe(true)
      expect(addButton().title).toBe('')
      fireEvent.click(addButton())
      expect(toastSuccess).not.toHaveBeenCalled()
      expect(toastError).not.toHaveBeenCalled()
    })
  })

  describe('Export aggregates', () => {
    const exporter = async () => {
      grant('analytics.descriptive.read', 'analytics.export')
      const Dashboard = await loadDashboard({})
      render(<Dashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      await waitFor(() => expect(exportButton().disabled).toBe(false))
    }
    const preview = {
      title: 'Descriptive analytics',
      columns: ['section'],
      rows: [['COUNT']],
      totalRows: 1,
    }

    it('is hidden when the export flag is off', async () => {
      grant('analytics.descriptive.read', 'analytics.export')
      const Dashboard = await loadDashboard({ export: false })
      render(<Dashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

      expect(screen.queryByRole('button', { name: 'Export aggregates' })).toBeNull()
    })

    it('is disabled while the project has no reporting period', async () => {
      api.getProjectIndicators.mockResolvedValue([])
      grant('analytics.descriptive.read', 'analytics.export')
      const Dashboard = await loadDashboard({})
      render(<Dashboard />)
      await waitFor(() => expect(api.getProjectIndicators).toHaveBeenCalled())

      expect(exportButton().disabled).toBe(true)
    })

    it('stays enabled in the timeline view without a reporting period', async () => {
      api.getProjectIndicators.mockResolvedValue([])
      grant('analytics.descriptive.read', 'analytics.export')
      const Dashboard = await loadDashboard({})
      render(<Dashboard />)
      await waitFor(() => expect(api.getProjectIndicators).toHaveBeenCalled())
      await waitFor(() =>
        expect(screen.getByLabelText('Reporting period')).toHaveProperty('disabled', true),
      )

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })
      await waitFor(() => expect(exportButton().disabled).toBe(false))
    })

    it('is disabled in the survey view for a role that only reads the frozen release of open periods', async () => {
      grant('analytics.descriptive.read', 'analytics.export')
      const Dashboard = await loadDashboard({})
      render(<Dashboard />)
      await waitFor(() => expect(exportButton().disabled).toBe(false))

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      expect(exportButton().disabled).toBe(true)
    })

    it('is enabled in the survey view for a detail role', async () => {
      grant('analytics.descriptive.read', 'analytics.export', 'assessments.detail.read')
      const Dashboard = await loadDashboard({})
      render(<Dashboard />)
      await waitFor(() => expect(exportButton().disabled).toBe(false))

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      expect(exportButton().disabled).toBe(false)
    })

    it('shows Preparing preview, disabled, while the preview loads', async () => {
      previewExport.mockReturnValue(new Promise(() => {}))
      await exporter()

      fireEvent.click(screen.getByText('CSV'))
      await waitFor(() => expect(exportButton().textContent).toBe('Preparing preview'))
      expect(exportButton().disabled).toBe(true)
    })

    it('names the project and the period in the preview, and the reporting date for the timeline', async () => {
      previewExport.mockResolvedValue(preview)
      await exporter()

      fireEvent.click(screen.getByText('PDF'))
      expect(
        (await screen.findByText(/^Descriptive analytics for Project A, .+\. The PDF file/))
          .textContent,
      ).not.toContain('current reporting date')
      expect(screen.getByText(/Project A, Sep 1/).textContent).toContain('Sep')
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByTestId('analytics-export-preview')).toBeNull())

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })
      await waitFor(() => expect(exportButton().disabled).toBe(false))
      fireEvent.click(screen.getByText('CSV'))
      expect(
        await screen.findByText(
          'Descriptive analytics for Project A, current reporting date. The CSV file contains these aggregate rows only.',
        ),
      ).toBeTruthy()
    })
  })
})
