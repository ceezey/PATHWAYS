import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HumanReviewWorkspace } from './human-review-workspace'
const state = vi.hoisted(() => ({
  permissions: ['projects.read', 'alerts.read'],
  role: 'PROJECT_OFFICER',
  project: vi.fn(),
  alerts: vi.fn(),
  recommendations: vi.fn(),
  rules: vi.fn(),
  notifications: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      id: 'synthetic-subject',
      userId: 'synthetic-user',
      organizationId: 'synthetic-org',
      roles: [state.role],
      permissions: state.permissions,
      assignedProjectIds: ['10000000-0000-4000-8000-000000000001'],
    },
    access: 'ready',
  }),
}))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({
    labels: { moduleAlerts: 'Alerts', moduleRecommendations: 'Recommendations' },
  }),
}))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))
vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: { getProjects: state.project },
}))
vi.mock('@/lib/services/rules-human-client', () => ({
  rulesHumanClient: {
    listAlerts: state.alerts,
    listRecommendations: state.recommendations,
    listRules: state.rules,
    listNotifications: state.notifications,
  },
}))
const renderWorkspace = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthorizedQueryProvider>
        <HumanReviewWorkspace kind="alert" />
      </AuthorizedQueryProvider>
    </QueryClientProvider>,
  )
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  state.role = 'PROJECT_OFFICER'
  state.permissions = ['projects.read', 'alerts.read']
  state.project.mockResolvedValue([])
  state.alerts.mockResolvedValue({ items: [], nextCursor: null })
  state.notifications.mockResolvedValue({ items: [], nextCursor: null })
})
describe('permission-scoped alerts loading', () => {
  it('opens notification alerts through the supported canonical selection route', async () => {
    const alertId = '30000000-0000-4000-8000-000000000001'
    state.notifications.mockResolvedValue({
      items: [
        {
          id: '40000000-0000-4000-8000-000000000001',
          projectId: '10000000-0000-4000-8000-000000000001',
          alertId,
          message: 'A recorded activity alert is available for review.',
          createdAt: '2026-09-27T00:00:00Z',
          readAt: '2026-09-27T00:00:00Z',
          deliveryState: 'DELIVERED',
        },
      ],
      nextCursor: null,
    })
    renderWorkspace()
    await screen.findByText('No records')
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect((await screen.findByRole('link', { name: 'View alert' })).getAttribute('href')).toBe(
      `/alerts?alert=${alertId}`,
    )
  })
  it('loads the PO queue without unauthorized rule or recommendation dependencies and loads notifications only on demand', async () => {
    renderWorkspace()
    await screen.findByText('No records')
    expect(state.alerts).toHaveBeenCalledWith({}, expect.any(AbortSignal))
    expect(state.recommendations).not.toHaveBeenCalled()
    expect(state.rules).not.toHaveBeenCalled()
    expect(state.notifications).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    await waitFor(() =>
      expect(state.notifications).toHaveBeenCalledWith({}, expect.any(AbortSignal)),
    )
  })
  it('does not issue alert requests with a revoked grant even when the role remains PO', async () => {
    state.permissions = ['projects.read']
    renderWorkspace()
    await screen.findByText('Access unavailable')
    expect(state.alerts).not.toHaveBeenCalled()
    expect(state.rules).not.toHaveBeenCalled()
  })
})
