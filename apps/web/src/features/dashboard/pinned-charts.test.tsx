/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { addPin, readPins } from '@/lib/dashboard-pins'

import { PinnedCharts } from './pinned-charts'

const access = vi.hoisted(() => ({
  profile: { userId: 'u1', permissions: [] as string[] },
}))
const insight = vi.hoisted(() => ({ result: {} as Record<string, unknown> }))

vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('@/lib/rbac/route-access', () => ({
  principalHasAtomicPermission: (profile: { permissions: string[] }, permission: string) =>
    profile.permissions.includes(permission),
}))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))
vi.mock('@/providers/authorized-query-provider', () => ({
  useAuthorizedRead: () => insight.result,
}))
vi.mock('@/features/analytics/use-analytics-insights', () => ({
  canReadInsight: (profile: { permissions: string[] }, kind: string) =>
    profile.permissions.includes(kind),
  useParticipationBreakdown: () => insight.result,
}))
vi.mock('@/features/analytics/analytics-charts', () => ({
  IndicatorProgressChart: ({ rows }: { rows: Array<{ label: string }> }) => (
    <div>{`progress:${rows.map((row) => row.label).join(',')}`}</div>
  ),
}))
vi.mock('echarts-for-react', () => ({ default: () => <div>chart</div> }))

const projectId = '11111111-1111-4111-8111-111111111111'
const period = { periodStart: '2026-01-01', periodEnd: '2026-03-31' }
const projects = [{ id: projectId, title: 'Alpha' }]
const ready = (data: unknown) => ({
  data,
  isError: false,
  isPending: false,
  refetch: vi.fn(),
})

beforeEach(() => {
  access.profile.permissions = []
  insight.result = { data: undefined, isError: false, isPending: true, refetch: vi.fn() }
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('pinned charts', () => {
  it('shows an empty state with no pins', () => {
    render(<PinnedCharts projects={projects} />)
    expect(screen.getByText('No pinned charts')).toBeTruthy()
  })

  it('shows a restricted card when the role lacks the permission', () => {
    addPin('u1', { view: 'participation', projectId })
    render(<PinnedCharts projects={projects} />)
    expect(screen.getByText('Participation patterns is restricted for your role.')).toBeTruthy()
  })

  it('shows a restricted card for a KPI pin without monitoring.read', () => {
    addPin('u1', { view: 'kpi', projectId, ...period })
    render(<PinnedCharts projects={projects} />)
    expect(
      screen.getByText('KPI / indicator performance is restricted for your role.'),
    ).toBeTruthy()
  })

  it('shows a restricted card when the live read returns 403', () => {
    access.profile.permissions = ['participation']
    insight.result = {
      data: undefined,
      error: Object.assign(new Error('no'), { status: 403 }),
      isError: true,
      isPending: false,
      refetch: vi.fn(),
    }
    addPin('u1', { view: 'participation', projectId })
    render(<PinnedCharts projects={projects} />)
    expect(screen.getByText('Restricted')).toBeTruthy()
  })

  it('shows the restricted state instead of loading when the read is ineligible', () => {
    access.profile.permissions = ['participation']
    insight.result = { data: undefined, eligible: false, isError: false, isPending: true }
    addPin('u1', { view: 'participation', projectId })
    render(<PinnedCharts projects={[]} />)
    expect(screen.getByText('Participation patterns is restricted for your role.')).toBeTruthy()
    expect(screen.queryByText(/Loading/)).toBeNull()
    expect(screen.getByText('Project unavailable')).toBeTruthy()
  })

  it('renders a KPI pin from the released indicator progress and unpins it by name', () => {
    access.profile.permissions = ['monitoring.read']
    insight.result = ready({
      indicators: [
        { id: 'i1', projectId, status: 'ACTIVE', name: 'Reach', progress: { value: '40' } },
        { id: 'i2', projectId, status: 'ARCHIVED', name: 'Old', progress: { value: '90' } },
      ],
    })
    addPin('u1', { view: 'kpi', projectId, ...period })
    render(<PinnedCharts projects={projects} />)
    expect(screen.getByText('progress:Reach')).toBeTruthy()
    expect(screen.getByText(/Alpha/)).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Unpin KPI / indicator performance for Alpha' }),
    )
    expect(readPins('u1')).toEqual([])
    expect(screen.getByText('No pinned charts')).toBeTruthy()
  })
})
