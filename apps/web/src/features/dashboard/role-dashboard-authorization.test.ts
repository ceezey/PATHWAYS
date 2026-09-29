import { cleanup, render, screen, waitFor } from '@testing-library/react'
/* @vitest-environment jsdom */
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RoleDashboard,
  canLoadDashboardMonitoring,
  canOpenDashboardMonitoring,
} from './role-dashboard'
const reviewer = {
  roles: ['MONITORING_AND_EVALUATION_OFFICER'],
  permissions: ['monitoring.read', 'analytics.read'],
  assignedProjectIds: [],
}
describe('dashboard monitoring authorization', () => {
  it('does not mount monitoring or show its action for Project Officer even with injected grants', () => {
    const profile = { ...reviewer, roles: ['PROJECT_OFFICER'] }
    expect(canLoadDashboardMonitoring('Project Officer', profile)).toBe(false)
    expect(canOpenDashboardMonitoring('Project Officer', profile)).toBe(false)
  })
  it('preserves monitoring access for an authorized current reviewer', () => {
    expect(canLoadDashboardMonitoring('Monitoring and Evaluation Officer', reviewer)).toBe(true)
    expect(canOpenDashboardMonitoring('Monitoring and Evaluation Officer', reviewer)).toBe(true)
  })
  it.each(['monitoring.read', 'analytics.read'])(
    'does not mount dependent reads or advertise the analytics action after current %s revocation',
    (permission) => {
      const profile = {
        ...reviewer,
        permissions: reviewer.permissions.filter((value) => value !== permission),
      }
      expect(canLoadDashboardMonitoring('Monitoring and Evaluation Officer', profile)).toBe(false)
      expect(canOpenDashboardMonitoring('Monitoring and Evaluation Officer', profile)).toBe(false)
    },
  )
  it('does not mount supporting monitoring without a current principal', () => {
    expect(canLoadDashboardMonitoring('Monitoring and Evaluation Officer', null)).toBe(false)
    expect(canOpenDashboardMonitoring('Monitoring and Evaluation Officer', null)).toBe(false)
  })
})

const state = vi.hoisted(() => ({ permissions: ['monitoring.read', 'analytics.read'] }))
const api = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getProjectsForRole: vi.fn(),
  getMonitoringDashboard: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    role: 'Monitoring and Evaluation Officer',
    profile: {
      roles: ['MONITORING_AND_EVALUATION_OFFICER'],
      permissions: state.permissions,
      assignedProjectIds: [],
    },
  }),
}))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: api }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
describe('overview supporting requests use current grants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.permissions = ['monitoring.read', 'analytics.read']
    api.getDashboard.mockResolvedValue({
      metrics: [],
      sections: [],
      primaryAction: {
        id: 'monitoring',
        label: 'Open monitoring',
        kind: 'navigate',
        href: '/analytics',
      },
    })
    api.getProjectsForRole.mockResolvedValue([])
  })
  afterEach(cleanup)
  it('mounts supporting project monitoring only for current eligible access', async () => {
    render(createElement(RoleDashboard))
    await screen.findByRole('heading', { name: 'Welcome! Monitoring and Evaluation Officer' })
    await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Open monitoring' })).toBeTruthy()
  })
  it.each(['monitoring.read', 'analytics.read'])(
    'loads the home overview but skips supporting requests and shortcut without %s',
    async (permission) => {
      state.permissions = state.permissions.filter((value) => value !== permission)
      render(createElement(RoleDashboard))
      await screen.findByRole('heading', { name: 'Welcome! Monitoring and Evaluation Officer' })
      expect(api.getDashboard).toHaveBeenCalledOnce()
      expect(api.getProjectsForRole).not.toHaveBeenCalled()
      expect(api.getMonitoringDashboard).not.toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: 'Open monitoring' })).toBeNull()
    },
  )
})
