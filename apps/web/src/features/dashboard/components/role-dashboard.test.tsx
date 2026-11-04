/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const access = vi.hoisted(() => ({
  role: null as string | null,
  profile: { fullName: 'Synthetic Admin' },
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('../role-overview/role-overview', () => ({
  RoleOverviewDashboard: ({ role, fullName }: { role: string; fullName: string }) => (
    <p>{`${role} overview for ${fullName}`}</p>
  ),
}))

import { RoleDashboard } from './role-dashboard'

describe('RoleDashboard', () => {
  afterEach(cleanup)

  it('waits for the viewer role before reading a dashboard', () => {
    access.role = null
    render(<RoleDashboard />)
    expect(screen.getByText('Loading your dashboard')).toBeTruthy()
  })

  it('shows the System Administrator its role overview', () => {
    access.role = 'System Administrator'
    render(<RoleDashboard />)
    expect(screen.getByText('System Administrator overview for Synthetic Admin')).toBeTruthy()
  })
})
