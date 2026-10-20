/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  access,
  action,
  api,
  dashboard,
  flags,
  metric,
  panels,
  rbac,
  resetRoleDashboardMocks,
  router,
} from '@/test/fixtures/role-dashboard-fixtures'

import { RoleDashboard } from './role-dashboard'

const projects = [
  { id: 'project-a', title: 'Project A' },
  { id: 'project-b', title: 'Project B' },
]
const scope = () => screen.getByLabelText('Project scope') as HTMLSelectElement
const lastPeriod = { periodStart: '2025-09-27', periodEnd: '2026-09-27' }
const mounted = async (data: Record<string, unknown> = dashboard(), list = projects) => {
  flags.monitoring = true
  rbac.allowed = ['monitor_evaluate.view', 'analytics.view']
  api.getDashboard.mockResolvedValue(data)
  api.getProjectsForRole.mockResolvedValue(list)
  render(<RoleDashboard />)
  await screen.findByText('Project monitoring')
}

describe('Role dashboard project monitoring', () => {
  beforeEach(() => {
    resetRoleDashboardMocks()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('visibility', () => {
    const held = {
      monitoring: true,
      allowed: ['monitor_evaluate.view', 'analytics.view'],
      permissions: ['monitoring.read', 'analytics.read'],
    }
    it.each([
      ['the monitoring flag is off', { ...held, monitoring: false }],
      ['monitor_evaluate.view is missing', { ...held, allowed: ['analytics.view'] }],
      ['analytics.view is missing', { ...held, allowed: ['monitor_evaluate.view'] }],
      ['monitoring.read is missing', { ...held, permissions: ['analytics.read'] }],
      ['analytics.read is missing', { ...held, permissions: ['monitoring.read'] }],
    ])('is not mounted and requests nothing when %s', async (_label, setup) => {
      flags.monitoring = setup.monitoring
      rbac.allowed = setup.allowed
      access.profile = {
        fullName: 'Synthetic Admin',
        roles: ['SYSTEM_ADMINISTRATOR'],
        permissions: setup.permissions,
        assignedProjectIds: [],
      }
      api.getDashboard.mockResolvedValue(dashboard())
      render(<RoleDashboard />)
      await screen.findByRole('heading', { name: 'Welcome! System Administrator' })

      expect(screen.queryByText('Project monitoring')).toBeNull()
      expect(api.getProjectsForRole).not.toHaveBeenCalled()
      expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
    })

    it('is shown with the task counts row when every grant is held', async () => {
      await mounted()

      expect(screen.getByTestId('action-kpi-row')).toBeTruthy()
      expect(api.getProjectsForRole).toHaveBeenCalledWith('System Administrator')
    })
  })

  describe('project scope', () => {
    it('lists All projects and the authorized projects, and starts on all', async () => {
      await mounted()

      await waitFor(() => expect(scope().value).toBe('all'))
      expect([...scope().options].map((option) => option.textContent)).toEqual([
        'No selection',
        'All projects',
        'Project A',
        'Project B',
      ])
    })

    it('starts on the project named in the address when the account is assigned to it', async () => {
      window.history.replaceState(null, '', '/dashboard?project=project-b')
      await mounted()

      await waitFor(() => expect(scope().value).toBe('project-b'))
      await waitFor(() =>
        expect(api.getMonitoringDashboard).toHaveBeenCalledWith({
          projectId: 'project-b',
          ...lastPeriod,
        }),
      )
    })

    it('starts on all when the address names a project the account is not assigned to', async () => {
      window.history.replaceState(null, '', '/dashboard?project=project-z')
      await mounted()

      await waitFor(() => expect(scope().value).toBe('all'))
    })

    it('reads the monitoring totals of every project without a project id', async () => {
      await mounted()

      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledTimes(1))
      expect(api.getMonitoringDashboard).toHaveBeenCalledWith(lastPeriod)
    })

    it('ends the trailing year on the business date in Manila, not the UTC date', async () => {
      vi.setSystemTime(new Date('2026-09-26T17:30:00.000Z'))
      await mounted()

      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalledWith(lastPeriod))
    })

    it('reads the chosen project and clears the previous cards while it loads', async () => {
      api.getMonitoringDashboard.mockResolvedValueOnce({
        metrics: [metric({ id: 'a', label: 'All projects metric' })],
      })
      await mounted()
      await screen.findByText('All projects metric')

      api.getMonitoringDashboard.mockReturnValue(new Promise(() => {}))
      fireEvent.change(scope(), { target: { value: 'project-a' } })

      await waitFor(() =>
        expect(api.getMonitoringDashboard).toHaveBeenLastCalledWith({
          projectId: 'project-a',
          ...lastPeriod,
        }),
      )
      expect(screen.queryByText('All projects metric')).toBeNull()
      expect(screen.getByText('Loading project monitoring data...')).toBeTruthy()
    })

    it('shows the empty state and requests no monitoring when no project is authorized', async () => {
      await mounted(dashboard(), [])

      expect(await screen.findByText('No authorized projects')).toBeTruthy()
      expect(
        screen.getByText(
          'No projects are assigned to this account. Contact an administrator to review project access.',
        ),
      ).toBeTruthy()
      expect(scope().value).toBe('')
      expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
    })

    it('shows the reason when the project list fails', async () => {
      flags.monitoring = true
      rbac.allowed = ['monitor_evaluate.view', 'analytics.view']
      api.getProjectsForRole.mockRejectedValue(new Error('Directory is down.'))
      render(<RoleDashboard />)

      expect(await screen.findByText('Monitoring data unavailable')).toBeTruthy()
      expect(screen.getByText('Directory is down.')).toBeTruthy()
    })

    it('names the failure when the project list rejects without a message', async () => {
      flags.monitoring = true
      rbac.allowed = ['monitor_evaluate.view', 'analytics.view']
      api.getProjectsForRole.mockRejectedValue('down')
      render(<RoleDashboard />)

      expect(await screen.findByText('Project scope could not be loaded.')).toBeTruthy()
    })
  })

  describe('cards', () => {
    it('shows the monitoring metrics of the scope', async () => {
      api.getMonitoringDashboard.mockResolvedValue({
        metrics: [
          metric({ id: 'a', label: 'Reach', value: 12, severity: 'success' }),
          metric({ id: 'b', label: 'Records', value: 'Withheld', severity: 'warning' }),
        ],
      })
      await mounted()

      expect(await screen.findByText('Reach')).toBeTruthy()
      expect(screen.getByText('12')).toBeTruthy()
      expect(screen.getByText('Withheld')).toBeTruthy()
      expect(screen.queryByText('Loading project monitoring data...')).toBeNull()
    })

    it('says the data is loading while the projects exist and no card has arrived', async () => {
      api.getMonitoringDashboard.mockReturnValue(new Promise(() => {}))
      await mounted()

      expect(await screen.findByText('Loading project monitoring data...')).toBeTruthy()
    })

    it('shows the reason when the monitoring read fails and names a failure without one', async () => {
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring is down.'))
      await mounted()
      expect(await screen.findByText('Monitoring is down.')).toBeTruthy()
      expect(screen.getByText('Monitoring data unavailable')).toBeTruthy()

      api.getMonitoringDashboard.mockRejectedValueOnce('down')
      fireEvent.change(scope(), { target: { value: 'project-a' } })
      expect(await screen.findByText('Monitoring data could not be loaded.')).toBeTruthy()
    })

    it('clears the error when another scope loads', async () => {
      api.getMonitoringDashboard.mockRejectedValueOnce(new Error('Monitoring is down.'))
      await mounted()
      await screen.findByText('Monitoring is down.')

      api.getMonitoringDashboard.mockResolvedValue({ metrics: [metric({ label: 'Recovered' })] })
      fireEvent.change(scope(), { target: { value: 'project-b' } })

      expect(await screen.findByText('Recovered')).toBeTruthy()
      expect(screen.queryByText('Monitoring is down.')).toBeNull()
    })
  })

  describe('pinned charts and the primary action', () => {
    it('shows the pinned charts of the projects only while the pins flag is on', async () => {
      await mounted()
      expect(screen.queryByTestId('pinned-charts')).toBeNull()
      cleanup()

      flags.pins = true
      await mounted()
      await waitFor(() =>
        expect(screen.getByTestId('pinned-charts').textContent).toBe('project-a,project-b'),
      )
      expect(panels.pinned).toHaveLength(2)
    })

    it('puts the primary action in the monitoring card when there is no executive summary', async () => {
      await mounted(
        dashboard({ primaryAction: action({ label: 'Open monitoring', href: '/analytics' }) }),
      )

      fireEvent.click(screen.getByRole('button', { name: 'Open monitoring' }))
      expect(router.push).toHaveBeenCalledWith('/analytics')
      expect(
        screen.getByRole('button', { name: 'Open monitoring' }).classList.contains('bg-primary'),
      ).toBe(true)
    })

    it('leaves the primary action to the executive summary when there is one', async () => {
      await mounted(
        dashboard({
          executive: { title: 'Executive model' },
          primaryAction: action({ label: 'Open monitoring', href: '/analytics' }),
        }),
      )

      expect(screen.queryByRole('button', { name: 'Open monitoring' })).toBeNull()
      expect(screen.getByTestId('executive').textContent).toBe('Executive model|Open monitoring')
    })

    it('shows no action without a primary action', async () => {
      await mounted()

      expect(screen.queryByRole('button')).toBeNull()
    })
  })
})
