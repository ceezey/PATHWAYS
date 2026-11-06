/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => ({
  value: { eligible: true, data: null as unknown, isError: false, refetch: vi.fn() },
}))
vi.mock('./use-role-overview', () => ({ useRoleOverview: () => read.value }))
vi.mock('./use-project-extras', () => ({ useProjectExtras: () => [] }))
vi.mock('./project-metrics-reads', () => ({
  useProjectMetrics: () => ({ metrics: {}, reads: null }),
}))
const reads = vi.hoisted(() => ({ calls: [] as unknown[][], counts: vi.fn() }))
vi.mock('@/hooks/use-authorized-read', () => ({
  useAuthorizedRead: (...args: unknown[]) => {
    reads.calls.push(args)
    return { data: null }
  },
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile: null }) }))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))
vi.mock('@/lib/api/dashboards', () => ({
  dashboardsClient: { getDashboardActionCounts: reads.counts },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../components/pinned-charts', () => ({
  PinnedCharts: () => <div data-testid="pinned-charts" />,
}))
vi.mock('./officer-overview', () => ({ OfficerOverview: () => <div data-testid="overview" /> }))
vi.mock('./me-overview', () => ({ MeOverview: () => <div data-testid="overview" /> }))
vi.mock('./manager-overview', () => ({ ManagerOverview: () => <div data-testid="overview" /> }))
vi.mock('./portfolio-overview', () => ({
  PortfolioOverview: () => <div data-testid="overview" />,
}))

import { RoleOverviewDashboard } from './role-overview'

const props = { fullName: 'Ron', role: 'Project Officer' } as const

describe('RoleOverviewDashboard', () => {
  afterEach(() => {
    cleanup()
    reads.calls.length = 0
    reads.counts.mockReset()
  })
  it('shows the Figma loading card while the payload loads', () => {
    render(<RoleOverviewDashboard {...props} />)
    expect(screen.getByText('Loading your dashboard')).toBeTruthy()
  })
  it('shows a retryable error state', () => {
    read.value = { ...read.value, isError: true }
    render(<RoleOverviewDashboard {...props} />)
    expect(screen.getByText('Dashboard unavailable')).toBeTruthy()
  })
  it('shows an empty state when the viewer is not eligible', () => {
    read.value = { ...read.value, isError: false, eligible: false }
    render(<RoleOverviewDashboard {...props} />)
    expect(screen.getByText('Dashboard unavailable for your access')).toBeTruthy()
  })
  it.each([
    ['Project Manager', true],
    ['Project Officer', false],
    ['Monitoring and Evaluation Officer', false],
    ['Program Manager', false],
    ['Grant Manager', false],
  ] as const)('reads the shared action counts for %s only as %s', (role, enabled) => {
    render(<RoleOverviewDashboard fullName="Ron" role={role} />)

    const call = reads.calls.find((args) => args[0] === 'dashboard-action-counts')
    expect(call?.slice(0, 3)).toEqual(['dashboard-action-counts', null, 'projects.read'])
    expect(call?.[4]).toBe(enabled)
  })
  it('reads the action counts through the dashboards client without arguments', async () => {
    reads.counts.mockResolvedValue({ forReview: 1 })
    render(<RoleOverviewDashboard {...props} />)

    const call = reads.calls.find((args) => args[0] === 'dashboard-action-counts')
    await expect((call?.[3] as () => Promise<unknown>)()).resolves.toEqual({ forReview: 1 })
    expect(reads.counts).toHaveBeenCalledWith()
  })
  it.each([
    'Project Officer',
    'Monitoring and Evaluation Officer',
    'Project Manager',
    'Program Manager',
    'Grant Manager',
  ] as const)('shows the pinned charts below the %s overview', (role) => {
    read.value = { eligible: true, data: { projects: [] }, isError: false, refetch: vi.fn() }
    render(<RoleOverviewDashboard fullName="Ron" role={role} />)

    const pinned = screen.getByTestId('pinned-charts')
    expect(
      screen.getByTestId('overview').compareDocumentPosition(pinned) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
