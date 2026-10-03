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
  useBudgetSummary: () => insight.result,
  useIndicatorTrends: () => insight.result,
  useParticipationBreakdown: () => insight.result,
}))
vi.mock('@/features/analytics/analytics-charts', () => ({ SadddChart: () => <div>sadd</div> }))
vi.mock('echarts-for-react', () => ({ default: () => <div>chart</div> }))

const projectId = '11111111-1111-4111-8111-111111111111'

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
    render(<PinnedCharts />)
    expect(screen.getByText('No pinned charts')).toBeTruthy()
  })

  it('shows a restricted card when the role lacks the permission', () => {
    addPin('u1', { view: 'participation', projectId, projectName: 'Alpha' })
    render(<PinnedCharts />)
    expect(screen.getByText('Participation patterns is restricted for your role.')).toBeTruthy()
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
    addPin('u1', { view: 'participation', projectId, projectName: 'Alpha' })
    render(<PinnedCharts />)
    expect(screen.getByText('Restricted')).toBeTruthy()
  })

  it('renders a pinned budget live and unpins it', () => {
    access.profile.permissions = ['budget']
    insight.result = {
      data: { projectId, currencies: [] },
      isError: false,
      isPending: false,
      refetch: vi.fn(),
    }
    addPin('u1', { view: 'budget', projectId, projectName: 'Alpha' })
    render(<PinnedCharts />)
    expect(screen.getByText('No budget')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Unpin' }))
    expect(readPins('u1')).toEqual([])
    expect(screen.getByText('No pinned charts')).toBeTruthy()
  })
})
