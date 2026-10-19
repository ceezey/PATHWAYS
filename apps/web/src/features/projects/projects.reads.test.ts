/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => vi.fn())
const prefetch = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/use-authorized-read', () => ({
  useAuthorizedRead: read,
  useAuthorizedPrefetch: prefetch,
}))
vi.mock('@/lib/api/journeys', () => ({ journeysClient: { getJourneyStages: vi.fn() } }))
vi.mock('./activities/activities.reads', () => ({
  projectActivitiesSpec: () => ({ resource: 'project-activities' }),
}))
vi.mock('./indicators/indicators.reads', () => ({
  projectIndicatorsSpec: () => ({ resource: 'project-indicators' }),
}))
vi.mock('@/lib/api/projects', () => ({
  projectsClient: { getProject: vi.fn(), getProjectOverviewMetrics: vi.fn() },
}))

import {
  useProjectJourneyStagesRead,
  useProjectOverviewMetricsRead,
  useProjectPrefetch,
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

  it('prefetches only the summary reads a tab mounts with, never the live journey editor key', () => {
    const warm = vi.fn()
    prefetch.mockReturnValue(warm)
    const { project, tab } = useProjectPrefetch()
    const keys = (route: Parameters<typeof tab>[1]) => {
      warm.mockClear()
      tab('p1', route)
      return warm.mock.calls.map((call) => call[1].resource)
    }
    expect(keys('activities')).toEqual([
      'project-activities',
      'project-indicators',
      'project-journey-stages',
    ])
    expect(keys('project')).toEqual(['project-overview-metrics'])
    expect(keys('journey')).toEqual(['project-activities'])
    for (const route of ['indicators', 'evidence', 'monitoring', 'budget'] as const)
      expect(keys(route)).toEqual([])
    warm.mockClear()
    project('p1')
    expect(warm.mock.calls.map((call) => call[1].resource)).toEqual(['project'])
  })
})
