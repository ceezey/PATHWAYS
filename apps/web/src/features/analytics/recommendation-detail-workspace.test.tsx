import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
/* @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HumanReviewWorkspace } from './human-review-workspace'
const state = vi.hoisted(() => ({
  permissions: ['projects.read', 'recommendations.read', 'alerts.read'],
  subject: 'synthetic-a',
  detail: vi.fn(),
  queue: vi.fn(),
  projects: vi.fn(),
  alerts: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      id: state.subject,
      userId: state.subject,
      organizationId: 'synthetic-org',
      roles: ['PROJECT_OFFICER'],
      permissions: state.permissions,
      assignedProjectIds: ['10000000-0000-4000-8000-000000000001'],
    },
    role: 'Project Officer',
    assignedProjectIds: ['10000000-0000-4000-8000-000000000001'],
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
  pathwaysClient: { getProjects: state.projects },
  PathwaysClientError: class extends Error {},
}))
vi.mock('@/lib/services/rules-human-client', () => ({
  rulesHumanClient: {
    listRecommendations: state.queue,
    getRecommendation: state.detail,
    listAlerts: state.alerts,
  },
}))
const record = {
  id: '20000000-0000-4000-8000-000000000001',
  projectId: '10000000-0000-4000-8000-000000000001',
  alertId: '30000000-0000-4000-8000-000000000001',
  ruleId: '40000000-0000-4000-8000-000000000001',
  title: 'Review facilitator scheduling',
  text: 'Coordinate the upcoming activity schedule.',
  basis: 'Recorded activity overdue condition.',
  status: 'NEW',
  revision: '2',
  proposedAt: '2026-09-27T00:00:00Z',
  reviewedAt: null,
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = () => (
    <QueryClientProvider client={client}>
      <AuthorizedQueryProvider>
        <HumanReviewWorkspace kind="recommendation" initialId={record.id} />
      </AuthorizedQueryProvider>
    </QueryClientProvider>
  )
  return { ...render(view()), refresh: view }
}
beforeEach(() => {
  vi.resetAllMocks()
  state.subject = 'synthetic-a'
  state.permissions = ['projects.read', 'recommendations.read', 'alerts.read']
  state.projects.mockResolvedValue([])
  state.queue.mockResolvedValue({ items: [], nextCursor: null })
  state.detail.mockResolvedValue(record)
})
afterEach(cleanup)
describe('direct current recommendation selection', () => {
  it.each(['empty queue', 'another first-page record'])(
    'shows the independently authorized selected record with %s',
    async (condition) => {
      if (condition !== 'empty queue')
        state.queue.mockResolvedValue({
          items: [
            {
              ...record,
              id: '20000000-0000-4000-8000-000000000099',
              title: 'Another queue record',
            },
          ],
          nextCursor: 'more',
        })
      mount()
      expect(await screen.findByRole('heading', { name: record.title })).toBeTruthy()
      expect(state.detail).toHaveBeenCalledWith(record.id, expect.any(AbortSignal))
      expect(state.alerts).not.toHaveBeenCalled()
      expect(screen.getByRole('link', { name: 'View linked alert' }).getAttribute('href')).toBe(
        `/alerts?alert=${record.alertId}`,
      )
      expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull()
    },
  )
  it.each([
    ['NEW', true],
    ['AUTO_RESOLVED', false],
  ])('shows outcome recording for %s: %s', async (status, shown) => {
    state.permissions = [...state.permissions, 'recommendations.outcome.record']
    state.detail.mockResolvedValue({ ...record, status })
    mount()
    await screen.findByRole('heading', { name: record.title })
    expect(Boolean(screen.queryByRole('button', { name: 'Record outcome' }))).toBe(shown)
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull()
    if (status === 'AUTO_RESOLVED')
      expect(screen.getAllByText('Auto-resolved').length).toBeGreaterThan(0)
  })
  it('keeps fresh scope or exposure denial authoritative and renders no record contents', async () => {
    state.detail.mockRejectedValue(Error('HTTP 403'))
    mount()
    expect(await screen.findByText('Record unavailable')).toBeTruthy()
    expect(screen.queryByText(record.text)).toBeNull()
    expect(screen.queryByRole('heading', { name: record.title })).toBeNull()
  })
  it('clears loaded details and actions after the current recommendation grant is revoked', async () => {
    const view = mount()
    await screen.findByRole('heading', { name: record.title })
    state.permissions = ['projects.read']
    view.rerender(view.refresh())
    expect(screen.queryByText(record.text)).toBeNull()
    expect(await screen.findByText('Access unavailable')).toBeTruthy()
    expect(state.detail).toHaveBeenCalledOnce()
  })
  it('cancels pending selected-record access on identity change and ignores its eventual success', async () => {
    let finish!: (value: unknown) => void
    state.detail.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const view = mount()
    await waitFor(() => expect(state.detail).toHaveBeenCalledOnce())
    const signal = state.detail.mock.calls[0][1] as AbortSignal
    state.subject = 'synthetic-b'
    state.permissions = ['projects.read']
    view.rerender(view.refresh())
    await waitFor(() => expect(signal.aborted).toBe(true))
    await act(async () => finish(record))
    expect(screen.queryByText(record.text)).toBeNull()
  })
})
