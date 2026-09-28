/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ChangeEvent, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UserManagementWorkspace } from './user-management-workspace'

vi.mock('@/components/ui/select', async () => {
  const { Children, createElement, isValidElement } = await import('react')
  const SelectContent = () => null
  const SelectItem = () => null
  const SelectTrigger = () => null
  return {
    Select: ({
      children,
      disabled,
      onValueChange,
      value,
    }: {
      children: ReactNode
      disabled?: boolean
      onValueChange?: (value: string) => void
      value?: string
    }) => {
      let triggerProps: Record<string, unknown> = {}
      const options: ReactNode[] = []
      Children.forEach(children, (child) => {
        if (!isValidElement(child)) return
        if (child.type === SelectTrigger) triggerProps = child.props as Record<string, unknown>
        if (child.type !== SelectContent) return
        Children.forEach((child.props as { children?: ReactNode }).children, (item) => {
          if (!isValidElement(item) || item.type !== SelectItem) return
          const props = item.props as { children?: ReactNode; value: string }
          options.push(
            createElement('option', { key: props.value, value: props.value }, props.children),
          )
        })
      })
      return createElement(
        'select',
        {
          ...triggerProps,
          disabled,
          value,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => onValueChange?.(event.target.value),
        },
        options,
      )
    },
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue: () => null,
  }
})

const baseUser = {
  id: 'user-1',
  authUserId: 'auth-user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  role: 'Project Officer' as const,
  accountStatus: 'Active' as const,
  signInMethod: 'Supabase account' as const,
  projectIds: [],
  projectAccess: [],
  createdAt: new Date().toISOString(),
  lastActiveAt: new Date().toISOString(),
}

const projectManagerProfile = {
  permissions: ['users.authorize'],
}

let currentRole: {
  role: string | null
  profile: typeof projectManagerProfile | null
  assignedProjectIds: readonly string[]
}

vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => currentRole,
}))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({ labels: { moduleUserManagement: 'User Management' } }),
}))

const getUsers = vi.fn()
const getProjects = vi.fn()
const authorizeExistingUser = vi.fn()
const updateAuthorizedUser = vi.fn()

vi.mock('@/lib/services/pathways-client', () => ({
  pathwaysClient: {
    getUsers: (...args: unknown[]) => getUsers(...args),
    getProjects: (...args: unknown[]) => getProjects(...args),
    authorizeExistingUser: (...args: unknown[]) => authorizeExistingUser(...args),
    updateAuthorizedUser: (...args: unknown[]) => updateAuthorizedUser(...args),
  },
  PathwaysClientError: class PathwaysClientError extends Error {
    code: string
    fieldErrors: unknown[]
    constructor(message: string, code: string, fieldErrors: unknown[] = []) {
      super(message)
      this.code = code
      this.fieldErrors = fieldErrors
    }
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const VALID_AUTH_USER_ID = '11111111-1111-1111-1111-111111111111'

async function openCreateDialog() {
  render(<UserManagementWorkspace />)
  await waitFor(() => expect(screen.getByRole('button', { name: /create user/i })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: /create user/i }))
}

function fillMinimalCreateForm() {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Grace Hopper' } })
  fireEvent.change(screen.getByLabelText(/auth user id/i), {
    target: { value: VALID_AUTH_USER_ID },
  })
  fireEvent.click(screen.getByLabelText(/assign project one/i))
}

describe('user management: create user via existing Auth authorization', () => {
  beforeEach(() => {
    currentRole = {
      role: 'Project Manager',
      profile: projectManagerProfile,
      assignedProjectIds: ['project-1'],
    }
    getUsers.mockResolvedValue([baseUser])
    getProjects.mockResolvedValue([
      { id: 'project-1', title: 'Project One', area: 'Area A', targetGoal: null },
    ])
    authorizeExistingUser.mockReset()
    updateAuthorizedUser.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('states that the person must already have signed up and removes the Edit Labels link', async () => {
    await openCreateDialog()

    expect(screen.getByText(/already/i)).toBeTruthy()
    expect(screen.getByText(/does not create a new sign-in/i)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /edit labels/i })).toBeNull()
  })

  it('limits role options to roles the actor can authorize', async () => {
    await openCreateDialog()

    // Project Manager may authorize Project Officer and M&E Officer, not System Administrator.
    expect(screen.queryByRole('option', { name: 'System Administrator' })).toBeNull()
    expect(screen.getByRole('option', { name: 'Project Officer' })).toBeTruthy()
    expect(
      screen.getByRole('option', { name: 'Monitoring and Evaluation Officer' }),
    ).toBeTruthy()
  })

  it('submits authorizeExistingUser with the DTO fields and refreshes the list on success', async () => {
    authorizeExistingUser.mockResolvedValue({ ...baseUser, id: 'user-2' })
    await openCreateDialog()

    fillMinimalCreateForm()

    fireEvent.click(screen.getByRole('button', { name: /authorize account/i }))

    await waitFor(() =>
      expect(authorizeExistingUser).toHaveBeenCalledWith(
        expect.objectContaining({
          authUserId: VALID_AUTH_USER_ID,
          fullName: 'Grace Hopper',
        }),
      ),
    )

    // Refresh call: getUsers is invoked once on initial mount, once after success.
    await waitFor(() => expect(getUsers).toHaveBeenCalledTimes(2))
  })

  it('shows a 403 server error from authorizeExistingUser', async () => {
    authorizeExistingUser.mockRejectedValue(new Error('Target role is outside your authority.'))
    await openCreateDialog()

    fillMinimalCreateForm()
    fireEvent.click(screen.getByRole('button', { name: /authorize account/i }))

    expect(await screen.findByText('Target role is outside your authority.')).toBeTruthy()
  })

  it('shows a 404 server error from authorizeExistingUser', async () => {
    authorizeExistingUser.mockRejectedValue(new Error('One or more projects are unavailable.'))
    await openCreateDialog()

    fillMinimalCreateForm()
    fireEvent.click(screen.getByRole('button', { name: /authorize account/i }))

    expect(await screen.findByText('One or more projects are unavailable.')).toBeTruthy()
  })

  it('shows a 400 server error from authorizeExistingUser', async () => {
    authorizeExistingUser.mockRejectedValue(new Error('Target role is unavailable.'))
    await openCreateDialog()

    fillMinimalCreateForm()
    fireEvent.click(screen.getByRole('button', { name: /authorize account/i }))

    expect(await screen.findByText('Target role is unavailable.')).toBeTruthy()
  })

  it('rejects an invalid Auth user ID before calling the client', async () => {
    await openCreateDialog()

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Grace Hopper' } })
    fireEvent.change(screen.getByLabelText(/auth user id/i), { target: { value: 'not-a-uuid' } })
    fireEvent.click(screen.getByLabelText(/assign project one/i))
    fireEvent.click(screen.getByRole('button', { name: /authorize account/i }))

    expect(
      await screen.findByText(/Enter the existing Auth user ID \(UUID\)/i),
    ).toBeTruthy()
    expect(authorizeExistingUser).not.toHaveBeenCalled()
  })
})

describe('user management: no create access', () => {
  beforeEach(() => {
    currentRole = {
      role: 'Grant Manager',
      profile: { permissions: [] },
      assignedProjectIds: [],
    }
    getUsers.mockResolvedValue([])
    getProjects.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('does not show the Edit Labels link regardless of access', async () => {
    render(<UserManagementWorkspace />)
    await waitFor(() => expect(getUsers).toHaveBeenCalled())

    expect(screen.queryByRole('link', { name: /edit labels/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /create user/i })).toBeNull()
  })
})
