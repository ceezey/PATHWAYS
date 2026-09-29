/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Sidebar } from './sidebar'

const access = vi.hoisted(() => ({
  role: 'System Administrator',
  profile: {
    roles: ['SYSTEM_ADMINISTRATOR'],
    permissions: ['projects.read', 'settings.read'],
    assignedProjectIds: [] as string[],
  },
}))

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ ...access, assignedProjectIds: access.profile.assignedProjectIds }),
}))
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({ email: 'actor@example.test' }),
}))

describe('Sidebar inner collapse toggle', () => {
  beforeEach(() => {
    access.role = 'System Administrator'
    access.profile.roles = ['SYSTEM_ADMINISTRATOR']
    access.profile.permissions = ['projects.read', 'settings.read']
  })

  afterEach(() => cleanup())

  it('renders the logo and a Collapse sidebar button on the same row when expanded', () => {
    render(<Sidebar compact={false} onToggle={vi.fn()} />)

    expect(screen.getByText('PATHWAYS')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(button).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).toBeNull()
  })

  it('hides the logo and shows a centered Expand sidebar button when compact', () => {
    render(<Sidebar compact onToggle={vi.fn()} />)

    expect(screen.queryByText('PATHWAYS')).toBeNull()
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).toBeNull()
  })

  it('calls onToggle when the collapse/expand button is clicked', () => {
    const onToggle = vi.fn()
    render(<Sidebar compact={false} onToggle={onToggle} />)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('omits the toggle button entirely when no onToggle handler is provided (mobile sheet)', () => {
    render(<Sidebar compact={false} />)

    expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).toBeNull()
  })
})
