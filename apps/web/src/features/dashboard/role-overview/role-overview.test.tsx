/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => ({
  value: { eligible: true, data: null as unknown, isError: false, refetch: vi.fn() },
}))
vi.mock('./use-role-overview', () => ({ useRoleOverview: () => read.value }))
vi.mock('./use-project-extras', () => ({
  useProjectExtras: () => ({ metrics: {}, evaluations: [] }),
}))
vi.mock('@/providers/authorized-query-provider', () => ({
  useAuthorizedRead: () => ({ data: null }),
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile: null }) }))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: {} }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { RoleOverviewDashboard } from './role-overview'

const props = { fullName: 'Ron', role: 'Project Officer' } as const

describe('RoleOverviewDashboard', () => {
  afterEach(cleanup)
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
})
