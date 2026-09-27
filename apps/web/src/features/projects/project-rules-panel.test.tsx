import { AuthorizedQueryProvider } from '@/providers/authorized-query-provider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectRulesPanel } from './project-rules-panel'
const projectId = '10000000-0000-4000-8000-000000000001'
const state = vi.hoisted(() => ({
  permissions: ['projects.read', 'alerts.read', 'recommendations.read'],
  assigned: ['10000000-0000-4000-8000-000000000001'],
  subject: 'synthetic-a',
  organization: 'synthetic-org-a',
  alerts: vi.fn(),
  recommendations: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      id: state.subject,
      userId: state.subject,
      organizationId: state.organization,
      roles: ['PROJECT_OFFICER'],
      permissions: state.permissions,
      assignedProjectIds: state.assigned,
    },
    role: 'Project Officer',
    assignedProjectIds: state.assigned,
    access: 'ready',
  }),
}))
vi.mock('@/lib/services/rules-human-client', () => ({
  rulesHumanClient: { listAlerts: state.alerts, listRecommendations: state.recommendations },
}))
vi.mock('@/lib/services/pathways-client', () => ({ PathwaysClientError: class extends Error {} }))
const alert = {
  id: '20000000-0000-4000-8000-000000000001',
  projectId,
  title: 'Activity delivery needs attention',
  severity: 'HIGH',
  lifecycle: 'NEW',
}
const recommendation = {
  id: '30000000-0000-4000-8000-000000000001',
  projectId,
  alertId: alert.id,
  title: 'Review the activity schedule',
  text: 'Coordinate upcoming delivery with the facilitator.',
  status: 'NEW',
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = () => (
    <QueryClientProvider client={client}>
      <AuthorizedQueryProvider>
        <ProjectRulesPanel projectId={projectId} />
      </AuthorizedQueryProvider>
    </QueryClientProvider>
  )
  return { ...render(view()), refresh: view }
}
beforeEach(() => {
  vi.resetAllMocks()
  state.subject = 'synthetic-a'
  state.organization = 'synthetic-org-a'
  state.assigned = [projectId]
  state.permissions = ['projects.read', 'alerts.read', 'recommendations.read']
  state.alerts.mockResolvedValue({ items: [alert], nextCursor: null })
  state.recommendations.mockResolvedValue({ items: [recommendation], nextCursor: null })
})
afterEach(cleanup)
describe('current-access project rules panel', () => {
  it('reads only this project and paginates with the same scope; canonical review links contain real IDs', async () => {
    state.alerts
      .mockResolvedValueOnce({ items: [alert], nextCursor: 'next' })
      .mockResolvedValue({ items: [], nextCursor: null })
    mount()
    expect(await screen.findByText(alert.title)).toBeTruthy()
    expect(
      (await screen.findByRole('link', { name: 'Review recommendation' })).getAttribute('href'),
    ).toBe(`/recommendations/${recommendation.id}`)
    expect(state.alerts).toHaveBeenCalledWith({ projectId, limit: '25' }, expect.any(AbortSignal))
    expect(state.recommendations).toHaveBeenCalledWith(
      { projectId, limit: '25' },
      expect.any(AbortSignal),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next alerts page' }))
    await waitFor(() =>
      expect(state.alerts).toHaveBeenCalledWith(
        { projectId, limit: '25', cursor: 'next' },
        expect.any(AbortSignal),
      ),
    )
    expect(await screen.findByText('No project alerts are available.')).toBeTruthy()
    expect(state.recommendations).toHaveBeenCalledTimes(1)
  })
  it('clears previously loaded data immediately when the current grants are revoked', async () => {
    const view = mount()
    await screen.findByText(alert.title)
    await screen.findByText(recommendation.title)
    state.permissions = ['projects.read']
    view.rerender(view.refresh())
    expect(screen.queryByText(alert.title)).toBeNull()
    expect(screen.queryByText(recommendation.title)).toBeNull()
    expect(
      await screen.findByText('Project alerts are unavailable for your current access.'),
    ).toBeTruthy()
    expect(state.alerts).toHaveBeenCalledTimes(1)
    expect(state.recommendations).toHaveBeenCalledTimes(1)
  })
  it('clears project records after assignment loss without issuing another read', async () => {
    const view = mount()
    await screen.findByText(alert.title)
    state.assigned = []
    view.rerender(view.refresh())
    expect(screen.queryByText(alert.title)).toBeNull()
    expect(screen.queryByText(recommendation.title)).toBeNull()
    expect(state.alerts).toHaveBeenCalledTimes(1)
  })
  it('aborts pending old-identity reads and never renders their eventual response', async () => {
    let finish!: (value: unknown) => void
    state.alerts.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const view = mount()
    await waitFor(() => expect(state.alerts).toHaveBeenCalledOnce())
    const signal = state.alerts.mock.calls[0][1] as AbortSignal
    state.subject = 'synthetic-b'
    state.organization = 'synthetic-org-b'
    state.permissions = ['projects.read']
    view.rerender(view.refresh())
    await waitFor(() => expect(signal.aborted).toBe(true))
    await act(async () => finish({ items: [alert], nextCursor: null }))
    expect(screen.queryByText(alert.title)).toBeNull()
  })
  it('rejects foreign-project responses and reports unavailable data rather than an empty business list', async () => {
    state.alerts.mockResolvedValue({
      items: [{ ...alert, projectId: '10000000-0000-4000-8000-000000000099' }],
      nextCursor: null,
    })
    mount()
    expect(await screen.findByText('Project alerts could not be loaded. Try again.')).toBeTruthy()
    expect(screen.queryByText(alert.title)).toBeNull()
    expect(screen.queryByText('No project alerts are available.')).toBeNull()
    expect(await screen.findByText(recommendation.title)).toBeTruthy()
  })
  it('rejects a foreign-project recommendation without hiding valid project alerts', async () => {
    state.recommendations.mockResolvedValue({
      items: [{ ...recommendation, projectId: '10000000-0000-4000-8000-000000000099' }],
      nextCursor: null,
    })
    mount()
    expect(
      await screen.findByText('Project recommendations could not be loaded. Try again.'),
    ).toBeTruthy()
    expect(screen.queryByText(recommendation.title)).toBeNull()
    expect(await screen.findByText(alert.title)).toBeTruthy()
  })
  it('keeps failed requests distinct from empty data and retries only the permitted section', async () => {
    state.alerts
      .mockRejectedValueOnce(Error('HTTP unavailable'))
      .mockResolvedValue({ items: [alert], nextCursor: null })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry project alerts' }))
    expect(await screen.findByText(alert.title)).toBeTruthy()
    expect(state.alerts).toHaveBeenCalledTimes(2)
    expect(state.recommendations).toHaveBeenCalledTimes(1)
  })
  it('does not request the recommendation dependency when its current permission is absent', async () => {
    state.permissions = ['projects.read', 'alerts.read']
    mount()
    expect(await screen.findByText(alert.title)).toBeTruthy()
    expect(state.recommendations).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Review recommendation' })).toBeNull()
  })
})
