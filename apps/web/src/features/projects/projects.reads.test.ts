import { beforeEach, describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: read }))
vi.mock('@/lib/api/journeys', () => ({ journeysClient: { getJourneyStages: vi.fn() } }))
vi.mock('@/lib/api/projects', () => ({
  projectsClient: { getProject: vi.fn(), getProjectOverviewMetrics: vi.fn() },
}))

import {
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
})
