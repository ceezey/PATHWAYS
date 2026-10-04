/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppShell } from './app-shell'

const access = vi.hoisted(() => ({
  role: 'System Administrator',
  profile: {
    roles: ['SYSTEM_ADMINISTRATOR'],
    permissions: ['projects.read', 'settings.read', 'profile.manage'],
    assignedProjectIds: [] as string[],
  },
}))

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ ...access, assignedProjectIds: access.profile.assignedProjectIds }),
}))
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({ email: 'actor@example.test', signOut: vi.fn() }),
}))
vi.mock('@/components/layout/sidebar', () => ({
  Sidebar: ({ compact, onToggle }: { compact?: boolean; onToggle?: () => void }) => (
    <nav>
      Sidebar
      <span data-testid="sidebar-compact">{String(Boolean(compact))}</span>
      {onToggle ? (
        <button onClick={onToggle} type="button">
          {compact ? 'Expand sidebar' : 'Collapse sidebar'}
        </button>
      ) : null}
    </nav>
  ),
}))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

describe('account menu profile access', () => {
  beforeEach(() => {
    access.role = 'System Administrator'
    access.profile.roles = ['SYSTEM_ADMINISTRATOR']
    access.profile.permissions = ['projects.read', 'settings.read', 'profile.manage']
  })

  afterEach(() => cleanup())

  it('shows My Profile only when the current profile route contract allows it', () => {
    const { rerender } = render(<AppShell>Workspace</AppShell>)
    expect(screen.getByRole('link', { name: 'My Profile' })).toBeTruthy()

    access.role = 'Project Officer'
    access.profile.roles = ['PROJECT_OFFICER']
    access.profile.permissions = ['projects.read']
    rerender(<AppShell>Workspace</AppShell>)

    expect(screen.queryByRole('link', { name: 'My Profile' })).toBeNull()
  })
})

describe('desktop collapse toggle moved into the sidebar', () => {
  afterEach(() => cleanup())

  it('does not render a collapse/expand toggle in the header', () => {
    render(<AppShell>Workspace</AppShell>)

    const header = screen.getByRole('banner')
    expect(
      header.querySelector('[aria-label="Collapse sidebar"], [aria-label="Expand sidebar"]'),
    ).toBeNull()
  })

  it('passes compact state and a toggle handler through to the sidebar', () => {
    render(<AppShell>Workspace</AppShell>)

    expect(screen.getByTestId('sidebar-compact').textContent).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

    expect(screen.getByTestId('sidebar-compact').textContent).toBe('true')
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy()
  })

  it('remembers the collapsed choice in a cookie and restores it on mount', () => {
    render(<AppShell>Workspace</AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(document.cookie).toContain('pathways-sidebar=compact')
    cleanup()

    render(<AppShell initialCompact>Workspace</AppShell>)
    expect(screen.getByTestId('sidebar-compact').textContent).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(document.cookie).toContain('pathways-sidebar=expanded')
  })
})
