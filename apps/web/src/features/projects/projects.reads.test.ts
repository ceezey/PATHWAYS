/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { type ReactNode, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthorizedQueryContext, privateKey } from '@/providers/authorized-query-provider'

const read = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: read }))
vi.mock('@/lib/api/journeys', () => ({ journeysClient: { getJourneyStages: vi.fn() } }))
vi.mock('@/lib/api/projects', () => ({
  projectsClient: { getProject: vi.fn(), getProjectOverviewMetrics: vi.fn() },
}))

import {
  useInvalidateProjectRead,
  useProjectJourneyStagesRead,
  useProjectOverviewMetricsRead,
  useProjectRead,
} from './projects.reads'

describe('project authorized reads', () => {
  beforeEach(() => read.mockReset())

  it('reads the project, journey stages and overview metrics with summary freshness', () => {
    useProjectRead('project-1')
    useProjectJourneyStagesRead('project-1')
    useProjectOverviewMetricsRead('project-1')
    expect(read.mock.calls.map((call) => [call[0], call[5]])).toEqual([
      ['project', { freshness: 'summary' }],
      ['project-journey-stages', { freshness: 'summary' }],
      ['project-overview-metrics', { freshness: 'summary' }],
    ])
  })

  it('invalidates only the shared project key of that project and identity', async () => {
    const client = new QueryClient()
    const key = (resource: string, id: string) => [privateKey[0], 'identity-1', resource, id]
    for (const k of [key('project', 'p1'), key('project', 'p2'), key('project-activities', 'p1')])
      client.setQueryData(k, 1)
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(
        QueryClientProvider,
        { client },
        createElement(
          AuthorizedQueryContext.Provider,
          { value: { identity: 'identity-1' } as never },
          children,
        ),
      )
    const { result } = renderHook(() => useInvalidateProjectRead(), { wrapper })
    await result.current('p1')
    const stale = (k: unknown[]) => client.getQueryState(k)?.isInvalidated
    expect(stale(key('project', 'p1'))).toBe(true)
    expect(stale(key('project', 'p2'))).toBe(false)
    expect(stale(key('project-activities', 'p1'))).toBe(false)
  })
})
