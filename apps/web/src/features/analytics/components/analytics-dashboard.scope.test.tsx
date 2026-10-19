/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  api,
  currentAccess,
  indicator,
  loadDashboard,
  monitoring,
  project,
  resetAnalyticsMocks,
} from '@/test/fixtures/analytics-dashboard-fixtures'

import { AnalyticsDashboard } from './analytics-dashboard'

const completion = () =>
  screen.getAllByText('Activity completion')[0].parentElement?.parentElement?.textContent
const retry = () => screen.getByRole('button', { name: /retry/i })
const released = (id: string, value: string) => ({
  ...indicator('project-a', id, '2026-09-01', '2026-09-30'),
  progress: { state: 'AVAILABLE', value, reason: null },
})
const tableRows = () =>
  [...document.querySelectorAll('tbody tr')].map((row) => row.textContent ?? '')

describe('Analytics dashboard scope: projects, project data and monitoring', () => {
  beforeEach(() => {
    resetAnalyticsMocks()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('first view', () => {
    it('opens on the KPI view as a bar chart for every indicator', async () => {
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

      expect(screen.getByLabelText('Analysis view')).toHaveProperty('value', 'kpi')
      expect(screen.getByLabelText('Visualization type')).toHaveProperty('value', 'bar')
      expect(screen.getByLabelText('Indicator filter')).toHaveProperty('value', 'all')
    })

    it('paints the loading page on the first render, before any effect runs', () => {
      const html = renderToString(<AnalyticsDashboard />)

      expect(html).toContain('Loading analytics')
    })

    it('reads no activities without activities.read', async () => {
      currentAccess.profile.permissions = currentAccess.profile.permissions.filter(
        (permission) => permission !== 'activities.read',
      )
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

      expect(api.getActivities).not.toHaveBeenCalled()
    })
  })

  describe('project list', () => {
    it('shows the server reason when the list fails and reloads it on Retry', async () => {
      api.getProjectsForRole.mockRejectedValueOnce(new Error('Project directory is down.'))
      render(<AnalyticsDashboard />)

      expect(await screen.findByText('Project directory is down.')).toBeTruthy()
      expect(screen.getByText('Analytics data unavailable')).toBeTruthy()
      expect(api.getActivities).not.toHaveBeenCalled()

      fireEvent.click(retry())
      await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-a'))
      expect(screen.queryByText('Project directory is down.')).toBeNull()
    })

    it('names the failure when the list rejects without a message', async () => {
      api.getProjectsForRole.mockRejectedValueOnce('down')
      render(<AnalyticsDashboard />)

      expect(await screen.findByText('Projects could not be loaded.')).toBeTruthy()
    })

    it('shows the empty state and requests nothing when the role has no project', async () => {
      api.getProjectsForRole.mockResolvedValue([])
      render(<AnalyticsDashboard />)

      expect(
        await screen.findByText('No authorized project is available for this account.'),
      ).toBeTruthy()
      expect(screen.getByLabelText('Project filter')).toHaveProperty('value', '')
      expect(api.getActivities).not.toHaveBeenCalled()
      expect(api.getProjectIndicators).not.toHaveBeenCalled()
      expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
    })

    it('stops loading and requests nothing without a role', async () => {
      currentAccess.role = null as never
      render(<AnalyticsDashboard />)

      expect(
        await screen.findByText('No authorized project is available for this account.'),
      ).toBeTruthy()
      expect(screen.queryByText('Loading analytics')).toBeNull()
      expect(api.getProjectsForRole).not.toHaveBeenCalled()
    })

    it('selects the first project and keeps a selected project when the role reloads the list', async () => {
      const view = render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-a'))
      expect(screen.getByLabelText('Project filter')).toHaveProperty('value', 'project-a')

      fireEvent.change(screen.getByLabelText('Project filter'), { target: { value: 'project-b' } })
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-b'))

      currentAccess.role = 'Program Manager'
      view.rerender(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledWith('Program Manager'))
      await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledTimes(2))
      expect(screen.getByLabelText('Project filter')).toHaveProperty('value', 'project-b')
    })

    it('falls back to the first project when the reloaded list no longer holds the selection', async () => {
      const view = render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-a'))
      fireEvent.change(screen.getByLabelText('Project filter'), { target: { value: 'project-b' } })
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-b'))

      api.getProjectsForRole.mockResolvedValue([project('project-c', 'Project C', null, null)])
      api.getProjectIndicators.mockResolvedValue([])
      currentAccess.role = 'Program Manager'
      view.rerender(<AnalyticsDashboard />)

      await waitFor(() => expect(api.getActivities).toHaveBeenCalledWith('project-c'))
      expect(screen.getByLabelText('Project filter')).toHaveProperty('value', 'project-c')
    })
  })

  describe('project data', () => {
    it('shows the server reason and reloads only the project data on Retry', async () => {
      api.getActivities.mockRejectedValueOnce(new Error('Activities are unavailable.'))
      render(<AnalyticsDashboard />)

      expect(await screen.findByText('Activities are unavailable.')).toBeTruthy()
      expect(api.getMonitoringDashboard).not.toHaveBeenCalled()

      fireEvent.click(retry())
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
      expect(api.getProjectsForRole).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('Activities are unavailable.')).toBeNull()
    })

    it('names the failure when the project data rejects without a message', async () => {
      api.getProjectIndicators.mockRejectedValueOnce('down')
      render(<AnalyticsDashboard />)

      expect(await screen.findByText('Analytics data could not be loaded.')).toBeTruthy()
    })
  })

  describe('monitoring', () => {
    it('shows the server reason and reloads only the monitoring read on Retry', async () => {
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring is unavailable.'))
      render(<AnalyticsDashboard />)

      expect(await screen.findByText('Monitoring is unavailable.')).toBeTruthy()

      fireEvent.click(retry())
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(2))
      expect(api.getProjectsForRole).toHaveBeenCalledTimes(1)
      expect(api.getActivities).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('Monitoring is unavailable.')).toBeNull()
    })

    it('names the failure when the monitoring read rejects without a message', async () => {
      api.getMonitoringDashboard.mockRejectedValueOnce('down')
      render(<AnalyticsDashboard />)

      expect(await screen.findByText('Analytics data could not be loaded.')).toBeTruthy()
    })
  })

  describe('map view', () => {
    it('keeps the map when monitoring fails and retries only the monitoring read', async () => {
      const MapsDashboard = await loadDashboard({ maps: true })
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring is unavailable.'))
      render(<MapsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))

      fireEvent.change(screen.getByLabelText('Visualization type'), { target: { value: 'map' } })
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Monitoring is unavailable.')
      expect(screen.getByTestId('coverage-map')).toBeTruthy()
      expect(screen.queryByText('Analytics data unavailable')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Retry analytics' }))
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(2))
      expect(api.getActivities).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    })

    it('keeps the map when the project data fails and retries the project data', async () => {
      const MapsDashboard = await loadDashboard({ maps: true })
      api.getActivities.mockRejectedValueOnce(new Error('Activities are unavailable.'))
      render(<MapsDashboard />)
      await screen.findByText('Activities are unavailable.')

      fireEvent.change(screen.getByLabelText('Visualization type'), { target: { value: 'map' } })
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Activities are unavailable.')

      fireEvent.click(screen.getByRole('button', { name: 'Retry analytics' }))
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
    })

    it('clears the project data of the same project while a role change reloads it behind the map', async () => {
      const MapsDashboard = await loadDashboard({ maps: true })
      api.getActivities.mockResolvedValue([
        {
          id: 'A-1',
          projectId: 'project-a',
          code: 'A-1',
          title: 'Activity A-1',
          status: 'Completed',
        },
      ])
      const view = render(<MapsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
      fireEvent.change(screen.getByLabelText('Visualization type'), { target: { value: 'map' } })
      await waitFor(() => expect(completion()).toContain('1/1'))
      expect(screen.getByLabelText('Reporting period')).toHaveProperty('disabled', false)

      api.getActivities.mockReturnValue(new Promise(() => {}))
      api.getProjectIndicators.mockReturnValue(new Promise(() => {}))
      api.getProjectsForRole.mockResolvedValue([project('project-a', 'Project A', null, null)])
      currentAccess.role = 'Program Manager'
      view.rerender(<MapsDashboard />)

      await waitFor(() =>
        expect(screen.getByLabelText('Reporting period')).toHaveProperty('disabled', true),
      )
      expect(completion()).not.toContain('1/1')
    })

    it('shows the status line while only the project data is still loading behind the map', async () => {
      const MapsDashboard = await loadDashboard({ maps: true })
      api.getActivities.mockReturnValue(new Promise(() => {}))
      render(<MapsDashboard />)
      await waitFor(() => expect(api.getActivities).toHaveBeenCalledTimes(1))

      fireEvent.change(screen.getByLabelText('Visualization type'), { target: { value: 'map' } })

      expect(await screen.findByText('Updating project analytics.')).toBeTruthy()
    })

    it('shows a status line, not the loading page, while analytics reload behind the map', async () => {
      const MapsDashboard = await loadDashboard({ maps: true })
      api.getMonitoringDashboard.mockReturnValue(new Promise(() => {}))
      render(<MapsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
      expect(screen.getByText('Loading analytics')).toBeTruthy()

      fireEvent.change(screen.getByLabelText('Visualization type'), { target: { value: 'map' } })
      expect(await screen.findByText('Updating project analytics.')).toBeTruthy()
      expect(screen.queryByText('Loading analytics')).toBeNull()
    })
  })

  describe('indicator filter', () => {
    it('limits the KPI table to the chosen indicator and restores every indicator', async () => {
      api.getMonitoringDashboard.mockResolvedValue({
        ...monitoring,
        indicators: [released('I-1', '40'), released('I-2', '80')],
      })
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())

      fireEvent.change(screen.getByLabelText('Visualization type'), { target: { value: 'table' } })
      expect(screen.getByLabelText('Visualization type')).toHaveProperty('value', 'table')
      await waitFor(() => expect(tableRows()).toHaveLength(2))
      expect(tableRows()).toEqual(['Indicator I-140 %', 'Indicator I-280 %'])
      expect(screen.getByText('I-2 · Indicator I-2', { selector: 'option' })).toBeTruthy()

      fireEvent.change(screen.getByLabelText('Indicator filter'), { target: { value: 'I-2' } })
      expect(tableRows()).toEqual(['Indicator I-280 %'])

      fireEvent.change(screen.getByLabelText('Indicator filter'), { target: { value: 'all' } })
      expect(tableRows()).toHaveLength(2)
    })

    it('enables the indicator filter only in the KPI view', async () => {
      currentAccess.profile.permissions = [
        ...currentAccess.profile.permissions,
        'analytics.descriptive.read',
      ]
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      expect(screen.getByLabelText('Indicator filter')).toHaveProperty('disabled', false)

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })
      await waitFor(() =>
        expect(screen.getByLabelText('Indicator filter')).toHaveProperty('disabled', true),
      )
    })
  })
})
