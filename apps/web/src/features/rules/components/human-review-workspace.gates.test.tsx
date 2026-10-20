import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HumanReviewWorkspace } from './human-review-workspace'

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  projects: vi.fn(),
  listAlerts: vi.fn(),
  listRecommendations: vi.fn(),
  getAlert: vi.fn(),
  getRecommendation: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      id: 'synthetic-subject',
      userId: 'synthetic-user',
      organizationId: 'synthetic-org',
      roles: ['SYSTEM_ADMINISTRATOR'],
      permissions: state.permissions,
      assignedProjectIds: ['10000000-0000-4000-8000-000000000001'],
    },
    access: 'ready',
    role: 'System Administrator',
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
vi.mock('@/lib/api/projects', () => ({ projectsClient: { getProjects: state.projects } }))
vi.mock('@/lib/api/core/request', () => ({ PathwaysClientError: class extends Error {} }))
vi.mock('@/lib/api/rules', () => ({
  rulesHumanClient: {
    listAlerts: state.listAlerts,
    listRecommendations: state.listRecommendations,
    getAlert: state.getAlert,
    getRecommendation: state.getRecommendation,
  },
}))

const projectId = '10000000-0000-4000-8000-000000000001'
const alert = {
  id: '30000000-0000-4000-8000-000000000001',
  projectId,
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
const recommendation = {
  id: '20000000-0000-4000-8000-000000000001',
  projectId,
  alertId: alert.id,
  ruleId: alert.ruleId,
  title: 'Synthetic recommendation',
  text: 'Coordinate the schedule.',
  basis: 'Recorded condition.',
  status: 'NEW',
  revision: '2',
  proposedAt: '2026-09-27T00:00:00Z',
  reviewedAt: null,
}
const renderWorkspace = (kind: 'alert' | 'recommendation') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthorizedQueryProvider>
        <HumanReviewWorkspace
          kind={kind}
          initialId={kind === 'alert' ? alert.id : recommendation.id}
        />
      </AuthorizedQueryProvider>
    </QueryClientProvider>,
  )
const grant = (...extra: string[]) => {
  state.permissions = ['projects.read', ...extra]
}
const button = (name: string) => screen.queryByRole('button', { name })
const alertLoaded = () => screen.findByRole('heading', { name: alert.title })
const recommendationLoaded = () => screen.findByRole('heading', { name: recommendation.title })

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  state.permissions = []
  state.projects.mockResolvedValue([])
  state.listAlerts.mockResolvedValue({ items: [], nextCursor: null })
  state.listRecommendations.mockResolvedValue({ items: [], nextCursor: null })
  state.getAlert.mockResolvedValue(alert)
  state.getRecommendation.mockResolvedValue(recommendation)
})

describe('Mark reviewed gate', () => {
  it('needs alerts.review for an alert and ignores recommendations.review', async () => {
    grant('alerts.read', 'alerts.review')
    renderWorkspace('alert')
    await alertLoaded()
    expect(button('Mark reviewed')).toBeTruthy()
    cleanup()
    grant('alerts.read', 'recommendations.review')
    renderWorkspace('alert')
    await alertLoaded()
    expect(button('Mark reviewed')).toBeNull()
  })
  it('needs recommendations.review for a recommendation and ignores alerts.review', async () => {
    grant('recommendations.read', 'recommendations.review')
    renderWorkspace('recommendation')
    await recommendationLoaded()
    expect(button('Mark reviewed')).toBeTruthy()
    cleanup()
    grant('recommendations.read', 'alerts.review')
    renderWorkspace('recommendation')
    await recommendationLoaded()
    expect(button('Mark reviewed')).toBeNull()
  })
  it.each([
    ['a reviewed alert', { lifecycle: 'RESOLVED' }],
    ['a superseded alert', { freshness: 'SUPERSEDED' }],
    ['an alert whose source changed', { freshness: 'SOURCE_CHANGED' }],
  ])('is hidden for %s', async (_label, patch) => {
    grant('alerts.read', 'alerts.review')
    state.getAlert.mockResolvedValue({ ...alert, ...patch })
    renderWorkspace('alert')
    await alertLoaded()
    expect(button('Mark reviewed')).toBeNull()
  })
  it('is hidden for a recommendation that is no longer new', async () => {
    grant('recommendations.read', 'recommendations.review')
    state.getRecommendation.mockResolvedValue({ ...recommendation, status: 'REVIEWED' })
    renderWorkspace('recommendation')
    await recommendationLoaded()
    expect(button('Mark reviewed')).toBeNull()
  })
})

describe('alert outcome gates', () => {
  it('shows Resolve and Dismiss for a current open alert when outcomes may be recorded', async () => {
    grant('alerts.read', 'alerts.outcome.record')
    renderWorkspace('alert')
    await alertLoaded()
    expect(button('Resolve alert')).toBeTruthy()
    expect(button('Dismiss alert')).toBeTruthy()
    expect(button('Record outcome')).toBeTruthy()
  })
  it('hides Resolve, Dismiss and Record outcome without alerts.outcome.record', async () => {
    grant('alerts.read', 'alerts.review', 'recommendations.outcome.record')
    renderWorkspace('alert')
    await alertLoaded()
    expect(button('Resolve alert')).toBeNull()
    expect(button('Dismiss alert')).toBeNull()
    expect(button('Record outcome')).toBeNull()
  })
  it.each([
    ['SOURCE_CHANGED', 'NEW'],
    ['SUPERSEDED', 'NEW'],
    ['CURRENT', 'RESOLVED'],
    ['CURRENT', 'DISMISSED'],
    ['CURRENT', 'AUTO_RESOLVED'],
  ])('hides every outcome control for a %s alert in state %s', async (freshness, lifecycle) => {
    grant('alerts.read', 'alerts.outcome.record')
    state.getAlert.mockResolvedValue({ ...alert, freshness, lifecycle })
    renderWorkspace('alert')
    await alertLoaded()
    expect(button('Resolve alert')).toBeNull()
    expect(button('Dismiss alert')).toBeNull()
    expect(button('Record outcome')).toBeNull()
  })
  it('hides Record outcome for a recommendation without recommendations.outcome.record', async () => {
    grant('recommendations.read', 'alerts.outcome.record')
    renderWorkspace('recommendation')
    await recommendationLoaded()
    expect(button('Record outcome')).toBeNull()
    expect(button('Resolve alert')).toBeNull()
  })
})

describe('linked alert on a recommendation', () => {
  it('summarizes the linked alert only when alerts.read is held', async () => {
    grant('recommendations.read', 'alerts.read')
    renderWorkspace('recommendation')
    await recommendationLoaded()
    const link = await screen.findByRole('link', { name: alert.title })
    expect(link.getAttribute('href')).toBe(`/alerts?alert=${alert.id}`)
    expect(state.getAlert).toHaveBeenCalledWith(alert.id, expect.any(AbortSignal))
    cleanup()
    state.getAlert.mockClear()
    grant('recommendations.read')
    renderWorkspace('recommendation')
    await recommendationLoaded()
    expect(screen.queryByText('Linked alert')).toBeNull()
    expect(screen.queryByRole('link', { name: /alert/i })).toBeNull()
    expect(state.getAlert).not.toHaveBeenCalled()
  })
  it('reads the linked alert for the outcome form only once an outcome is opened by a recorder', async () => {
    grant(
      'recommendations.read',
      'alerts.read',
      'recommendations.outcome.record',
      'alerts.outcome.record',
    )
    renderWorkspace('recommendation')
    await screen.findByRole('link', { name: alert.title })
    expect(state.getAlert).toHaveBeenCalledTimes(1)
    fireEvent.click(button('Record outcome') as HTMLElement)
    await screen.findByRole('button', { name: 'Close' })
    await vi.waitFor(() => expect(state.getAlert).toHaveBeenCalledTimes(2))
  })
  it('does not read the linked alert for the outcome form without alerts.outcome.record', async () => {
    grant('recommendations.read', 'alerts.read', 'recommendations.outcome.record')
    renderWorkspace('recommendation')
    await screen.findByRole('link', { name: alert.title })
    fireEvent.click(button('Record outcome') as HTMLElement)
    await screen.findByRole('button', { name: 'Close' })
    expect(state.getAlert).toHaveBeenCalledTimes(1)
  })
})

describe('Manage rules link', () => {
  it.each(['alert', 'recommendation'] as const)(
    'appears on the %s queue only with rules.read',
    async (kind) => {
      grant(`${kind === 'alert' ? 'alerts' : 'recommendations'}.read`, 'rules.read')
      renderWorkspace(kind)
      const link = await screen.findByRole('link', { name: 'Manage rules' })
      expect(link.getAttribute('href')).toBe('/alerts/repository')
      cleanup()
      grant(`${kind === 'alert' ? 'alerts' : 'recommendations'}.read`)
      renderWorkspace(kind)
      await screen.findByRole('button', { name: 'Refresh queue' })
      expect(screen.queryByRole('link', { name: 'Manage rules' })).toBeNull()
    },
  )
})
