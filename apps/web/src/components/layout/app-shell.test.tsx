/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppShell } from './app-shell'

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
  useSession: () => ({ email: 'actor@example.test', signOut: vi.fn() }),
}))
vi.mock('@/components/layout/sidebar', () => ({ Sidebar: () => <nav>Sidebar</nav> }))
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
    access.profile.permissions = ['projects.read', 'settings.read']
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
