import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
  getAlert: vi.fn(),
  alertHistory: vi.fn(),
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
    role: state.role === 'PROJECT_MANAGER' ? 'Project Manager' : 'Project Officer',
    assignedProjectIds: ['10000000-0000-4000-8000-000000000001'],
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
vi.mock('@/lib/api/projects', () => ({ projectsClient: { getProjects: state.project } }))
vi.mock('@/lib/services/rules-human-client', () => ({
  rulesHumanClient: {
    listAlerts: state.alerts,
    listRecommendations: state.recommendations,
    listRules: state.rules,
    listNotifications: state.notifications,
    getAlert: state.getAlert,
    alertHistory: state.alertHistory,
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
  it('loads the PO queue without unauthorized rule, recommendation or notification dependencies', async () => {
    renderWorkspace()
    await screen.findByText('No records')
    expect(state.alerts).toHaveBeenCalledWith({}, expect.any(AbortSignal))
    expect(state.recommendations).not.toHaveBeenCalled()
    expect(state.rules).not.toHaveBeenCalled()
    // The notifications panel has no control yet, so it never loads.
    expect(state.notifications).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Notifications' })).toBeNull()
  })
  it('does not issue alert requests with a revoked grant even when the role remains PO', async () => {
    state.permissions = ['projects.read']
    renderWorkspace()
    await screen.findByText('Access unavailable')
    expect(state.alerts).not.toHaveBeenCalled()
    expect(state.rules).not.toHaveBeenCalled()
  })
})
describe('alert outcome controls', () => {
  const alert = {
    id: '30000000-0000-4000-8000-000000000001',
    projectId: '10000000-0000-4000-8000-000000000001',
    ruleId: '40000000-0000-4000-8000-000000000001',
    ruleVersion: 1,
    title: 'Synthetic alert',
    explanation: 'Recorded source.',
    severity: 'LOW',
    lifecycle: 'NEW',
    revision: '9',
    evaluatedAt: '2026-09-27T01:00:00Z',
    freshness: 'CURRENT',
    conditions: {
      kind: 'CONDITION',
      id: 'days',
      metric: 'PROJECT_REMAINING_DAYS',
      operator: 'LT',
      threshold: '0',
    },
    evidence: [],
    asOf: '2026-09-27T01:00:00Z',
    reportingDate: '2026-09-27',
    calendar: { zone: 'Asia/Manila', version: '1' },
    predefinedRecommendations: [],
    linkedRecommendationIds: [],
  }
  it.each([
    ['NEW', true],
    ['RESOLVED', false],
    ['DISMISSED', false],
    ['AUTO_RESOLVED', false],
  ])('shows outcome recording for a %s alert: %s', async (lifecycle, shown) => {
    state.permissions = ['projects.read', 'alerts.read', 'alerts.outcome.record']
    state.getAlert.mockResolvedValue({ ...alert, lifecycle })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthorizedQueryProvider>
          <HumanReviewWorkspace kind="alert" initialId={alert.id} />
        </AuthorizedQueryProvider>
      </QueryClientProvider>,
    )
    await screen.findByRole('heading', { name: alert.title })
    expect(Boolean(screen.queryByRole('button', { name: 'Record outcome' }))).toBe(shown)
  })
  it('renders the evaluation line, the conditions and the evidence table of a loaded alert', async () => {
    state.getAlert.mockResolvedValue({
      ...alert,
      ruleVersion: 3,
      freshness: 'SOURCE_CHANGED',
      evaluatedAt: '2026-09-27T16:30:00Z',
      evidence: [
        {
          conditionId: 'days',
          metric: 'PROJECT_REMAINING_DAYS',
          operator: 'LT',
          threshold: '0',
          thresholdMaximum: null,
          cell: { state: 'AVAILABLE', value: '-2', reason: null },
          unit: 'DAYS',
          result: 'TRUE',
        },
        {
          conditionId: 'share',
          metric: 'ACTIVITY_COMPLETION_PERCENT',
          operator: 'BETWEEN',
          threshold: '10',
          thresholdMaximum: '20.5',
          cell: { state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' },
          unit: 'PERCENT',
          result: 'UNAVAILABLE',
        },
      ],
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthorizedQueryProvider>
          <HumanReviewWorkspace kind="alert" initialId={alert.id} />
        </AuthorizedQueryProvider>
      </QueryClientProvider>,
    )
    await screen.findByRole('heading', { name: alert.title })
    expect(
      screen.getByText(
        'Rule version 3; source changed. Evaluated 9/28/2026, 12:30:00 AM Asia/Manila. Reporting date 2026-09-27; calendar version 1.',
      ),
    ).toBeTruthy()
    const rows = within(screen.getByRole('table', { name: 'Recorded evaluation evidence' }))
      .getAllByRole('row')
      .slice(1)
      .map((row) => Array.from(row.children).map((cell) => cell.textContent))
    expect(rows).toEqual([
      ['project remaining days', '-2 DAYS', 'Below (<) 0 DAYS', 'true'],
      [
        'activity completion percent',
        'missing (no measurement)',
        'Between 10% to 20.5%',
        'unavailable',
      ],
    ])
  })
  it('lists the alert history with its evidence when asked', async () => {
    state.getAlert.mockResolvedValue(alert)
    state.alertHistory.mockResolvedValue({
      items: [
        {
          id: '60000000-0000-4000-8000-000000000001',
          occurredAt: '2026-09-27T16:30:00Z',
          actorKind: 'SYSTEM',
          kind: 'AUTO_RESOLVED',
          lifecycle: 'AUTO_RESOLVED',
          outcome: null,
          ruleVersion: 2,
          explanation: 'Condition no longer holds.',
          result: 'FALSE',
          evidence: [],
        },
      ],
      nextCursor: null,
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthorizedQueryProvider>
          <HumanReviewWorkspace kind="alert" initialId={alert.id} />
        </AuthorizedQueryProvider>
      </QueryClientProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Show history' }))
    await screen.findByText('Auto-resolved (system)')
    expect(screen.getByText('Condition no longer holds.')).toBeTruthy()
    expect(screen.getByText('9/28/2026, 12:30:00 AM Asia/Manila')).toBeTruthy()
    expect(screen.getByText('Rule version 2; result false')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hide history' })).toBeTruthy()
  })
  it('labels a linked recommendation by its title', async () => {
    const recommendationId = '50000000-0000-4000-8000-000000000009'
    state.role = 'PROJECT_MANAGER'
    state.permissions = ['projects.read', 'alerts.read', 'recommendations.read']
    state.getAlert.mockResolvedValue({ ...alert, linkedRecommendationIds: [recommendationId] })
    state.recommendations.mockResolvedValue({
      items: [{ id: recommendationId, title: 'Reschedule delayed activities' }],
      nextCursor: null,
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthorizedQueryProvider>
          <HumanReviewWorkspace kind="alert" initialId={alert.id} />
        </AuthorizedQueryProvider>
      </QueryClientProvider>,
    )
    const link = await screen.findByRole('link', {
      name: 'Linked recommendation: Reschedule delayed activities',
    })
    expect(link.getAttribute('href')).toBe(`/recommendations/${recommendationId}`)
    expect(state.recommendations).toHaveBeenCalledWith(
      { alertId: alert.id, limit: '10' },
      expect.anything(),
    )
  })
})
