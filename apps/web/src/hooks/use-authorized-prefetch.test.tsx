/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { type ReactNode, createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AuthorizedQueryContext, privateKey } from '@/providers/authorized-query-provider'

import { useAuthorizedPrefetch } from './use-authorized-read'

const setup = (overrides: Record<string, unknown> = {}) => {
  const client = new QueryClient()
  const context = {
    identity: 'identity-1',
    profile: {
      permissions: ['projects.detail.read'],
      roles: ['PROJECT_MANAGER'],
      assignedProjectIds: [],
    },
    inProject: () => true,
    isCurrent: () => true,
    currentEpoch: () => 0,
    deniedRead: () => null,
    ...overrides,
  }
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(AuthorizedQueryContext.Provider, { value: context as never }, children),
    )
  return { client, ...renderHook(() => useAuthorizedPrefetch(), { wrapper }) }
}
const spec = (resource: string, read = vi.fn().mockResolvedValue('value')) => ({
  resource,
  permission: 'projects.detail.read' as const,
  read,
})

describe('useAuthorizedPrefetch', () => {
  it('warms a summary-eligible read under the hook key with an epoch envelope', async () => {
    const { client, result } = setup()
    const s = spec('project')
    result.current('p1', s)
    await vi.waitFor(() =>
      expect(client.getQueryData([privateKey[0], 'identity-1', 'project', 'p1'])).toEqual({
        epoch: 0,
        value: 'value',
      }),
    )
    expect(s.read).toHaveBeenCalledOnce()
  })

  it('never prefetches live-only or unlisted resources', () => {
    const { result } = setup()
    for (const resource of ['beneficiaries', 'step-up-session', 'activity-detail:a1']) {
      const s = spec(resource)
      result.current('p1', s)
      expect(s.read).not.toHaveBeenCalled()
    }
  })

  it('skips principals without the permission or project scope and denied keys', () => {
    for (const overrides of [
      { profile: { permissions: [], roles: ['PROJECT_MANAGER'], assignedProjectIds: [] } },
      { inProject: () => false },
      { deniedRead: () => new Error('denied') },
      { identity: null },
    ]) {
      const { result } = setup(overrides)
      const s = spec('project')
      result.current('p1', s)
      expect(s.read).not.toHaveBeenCalled()
    }
  })

  it('leaves no cache entry when the prefetch fails', async () => {
    const { client, result } = setup()
    const s = spec('project', vi.fn().mockRejectedValue(new Error('boom')))
    result.current('p1', s)
    await vi.waitFor(() =>
      expect(client.getQueryState([privateKey[0], 'identity-1', 'project', 'p1'])).toBeUndefined(),
    )
  })
})
