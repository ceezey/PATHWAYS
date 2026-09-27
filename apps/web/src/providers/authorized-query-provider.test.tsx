import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthorizedQueryProvider, useAuthorizedRead } from './authorized-query-provider'
const state = vi.hoisted(() => ({
  profile: {
    id: 'subject-a',
    organizationId: 'org-a',
    userId: 'user-a',
    roles: ['PROJECT_OFFICER'],
    permissions: ['projects.read', 'projects.detail.read'],
    assignedProjectIds: ['project-a'],
  },
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    access: 'ready',
    role: 'Project Officer',
    assignedProjectIds: state.profile.assignedProjectIds,
    profile: state.profile,
  }),
}))
vi.mock('@/lib/services/pathways-client', () => ({ PathwaysClientError: class extends Error {} }))
const deferred = () => {
  let resolve: (value: string) => void = () => {}
  const promise = new Promise<string>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const Reader = ({ read }: { read: (signal: AbortSignal) => Promise<string> }) => {
  const value = useAuthorizedRead('preview', 'project-a', 'projects.detail.read', read)
  return <output>{value.data ?? 'No current data'}</output>
}
const tree = (client: QueryClient, read: (signal: AbortSignal) => Promise<string>) => (
  <QueryClientProvider client={client}>
    <AuthorizedQueryProvider>
      <Reader read={read} />
    </AuthorizedQueryProvider>
  </QueryClientProvider>
)
beforeEach(() => {
  state.profile = {
    id: 'subject-a',
    organizationId: 'org-a',
    userId: 'user-a',
    roles: ['PROJECT_OFFICER'],
    permissions: ['projects.read', 'projects.detail.read'],
    assignedProjectIds: ['project-a'],
  }
})
afterEach(cleanup)
describe('current-owner private query lifecycle', () => {
  it('never displays a deferred response after losing the required grant', async () => {
    const pending = deferred()
    const read = vi.fn(() => pending.promise)
    const client = new QueryClient()
    const view = render(tree(client, read))
    await waitFor(() => expect(read).toHaveBeenCalledOnce())
    const oldKey = client.getQueryCache().getAll()[0]?.queryKey
    state.profile = { ...state.profile, permissions: ['projects.read'] }
    view.rerender(tree(client, read))
    await act(async () => pending.resolve('Stale sensitive data'))
    expect(screen.queryByText('Stale sensitive data')).toBeNull()
    expect(client.getQueryData(oldKey ?? [])).toBeUndefined()
    expect(read).toHaveBeenCalledOnce()
  })
  it('does not reuse an old response after logout and return to the same principal', async () => {
    const old = deferred()
    const read = vi
      .fn()
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValue('Fresh data')
    const client = new QueryClient()
    render(tree(client, read))
    await waitFor(() => expect(read).toHaveBeenCalledOnce())
    const oldKey = client.getQueryCache().getAll()[0]?.queryKey
    act(() => clearSensitiveDraftStorage())
    expect(await screen.findByText('Fresh data')).toBeTruthy()
    await act(async () => old.resolve('Old ABA response'))
    expect(screen.queryByText('Old ABA response')).toBeNull()
    expect(client.getQueryData(oldKey ?? [])).toBeUndefined()
  })
  it('aborts and removes the current private query when the provider unmounts', async () => {
    const pending = deferred()
    const read = vi.fn((_signal: AbortSignal) => pending.promise)
    const client = new QueryClient()
    const view = render(tree(client, read))
    await waitFor(() => expect(read).toHaveBeenCalledOnce())
    const signal = read.mock.calls[0]?.[0]
    view.unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => pending.resolve('Unmounted response'))
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })
})
