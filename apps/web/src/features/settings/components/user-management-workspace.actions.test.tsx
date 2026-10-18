/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { baseUser, projectManagerProfile } from '@/test/fixtures/user-management-fixtures'
import { UserManagementWorkspace } from './user-management-workspace'

vi.mock('@/components/ui/select', async () =>
  (await import('@/test/fixtures/user-management-fixtures')).selectMock(),
)
// Radix menus are replaced by always-open lists, since jsdom lacks the pointer APIs they need.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onSelect,
  }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button onClick={() => onSelect?.()} role="menuitem" type="button">
      {children}
    </button>
  ),
}))

let currentRole: {
  role: string | null
  profile: { permissions: string[] } | null
  assignedProjectIds: readonly string[]
}
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => currentRole }))
vi.mock('@/hooks/use-display-labels', () => ({
  useDisplayLabels: () => ({ labels: { moduleUserManagement: 'User Management' } }),
}))

const getUsers = vi.fn()
const getProjects = vi.fn()
const authorizeExistingUser = vi.fn()
const updateAuthorizedUser = vi.fn()
vi.mock('@/lib/api/users', () => ({
  usersClient: {
    getUsers: (...args: unknown[]) => getUsers(...args),
    authorizeExistingUser: (...args: unknown[]) => authorizeExistingUser(...args),
    updateAuthorizedUser: (...args: unknown[]) => updateAuthorizedUser(...args),
  },
}))
vi.mock('@/lib/api/projects', () => ({
  projectsClient: { getProjects: (...args: unknown[]) => getProjects(...args) },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const ada = { ...baseUser, projectIds: ['project-1'], projectAccess: ['Project One'] }
const grace = {
  ...ada,
  id: 'user-2',
  authUserId: 'auth-user-2',
  name: 'Grace Hopper',
  email: 'grace@example.test',
  role: 'Monitoring and Evaluation Officer' as const,
  accountStatus: 'Invited' as const,
  lastActiveAt: undefined,
}
const alan = {
  ...ada,
  id: 'user-3',
  authUserId: 'auth-user-3',
  name: 'Alan Turing',
  email: 'alan@example.test',
  accountStatus: 'Deactivated' as const,
}
const root = {
  ...baseUser,
  id: 'user-4',
  authUserId: 'auth-user-4',
  name: 'Root Admin',
  email: 'root@example.test',
  role: 'System Administrator' as const,
}
const project = { id: 'project-1', title: 'Project One', area: 'Area A', targetGoal: null }

const actAs = (role: string, permissions: string[], assignedProjectIds: string[] = []) => {
  currentRole = { role, profile: { permissions }, assignedProjectIds }
}
const loaded = async () => {
  render(<UserManagementWorkspace />)
  await waitFor(() => expect(screen.getByRole('list', { name: 'User accounts' })).toBeTruthy())
}
const row = (name: string) => {
  const found = screen.getByText(name).closest('li')
  if (!found) throw new Error(`No row for ${name}`)
  return found
}
const openEdit = async (name: string) => {
  fireEvent.click(within(row(name)).getByRole('menuitem', { name: /edit user/i }))
  await screen.findByRole('button', { name: 'Save changes' })
}

beforeEach(() => {
  actAs('System Administrator', projectManagerProfile.permissions)
  getUsers.mockResolvedValue([ada, grace, alan])
  getProjects.mockResolvedValue([project])
  updateAuthorizedUser.mockReset()
  authorizeExistingUser.mockReset()
  sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('user management: account list', () => {
  it('counts the accounts by status and lists every account', async () => {
    await loaded()
    const summary = screen.getByLabelText('User account summary')
    const count = (label: string) =>
      within(summary).getByText(label).nextElementSibling?.textContent
    expect([count('Total users'), count('Active'), count('Invited'), count('Deactivated')]).toEqual(
      ['3', '1', '1', '1'],
    )
    const list = screen.getByRole('list', { name: 'User accounts' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  })

  it('filters by search text and account status and clears the filters from the empty state', async () => {
    await loaded()
    fireEvent.change(screen.getByPlaceholderText('Search users, roles, or projects'), {
      target: { value: 'grace' },
    })
    expect(screen.getByText('Grace Hopper')).toBeTruthy()
    expect(screen.queryByText('Ada Lovelace')).toBeNull()
    fireEvent.change(screen.getByLabelText('Filter users by account status'), {
      target: { value: 'Deactivated' },
    })
    expect(screen.getByText('No users match')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('Ada Lovelace')).toBeTruthy()
    expect(screen.getByText('Alan Turing')).toBeTruthy()
    expect(screen.getByText('Grace Hopper')).toBeTruthy()
  })

  it('counts the users of each role in the role profiles', async () => {
    await loaded()
    const aside = screen.getByLabelText('Role profiles and administration links')
    const officer = within(aside).getByText('Project Officer').closest('div')?.parentElement
    expect(officer?.textContent).toContain('2 users')
    const admin = within(aside).getByText('System Administrator').closest('div')?.parentElement
    expect(admin?.textContent).toContain('0 users')
  })

  it('opens the account details from View and shows an account that was never active', async () => {
    await loaded()
    fireEvent.click(within(row('Grace Hopper')).getByRole('button', { name: 'View' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Account details')).toBeTruthy()
    expect(within(dialog).getByText('grace@example.test')).toBeTruthy()
    expect(within(dialog).getByText('Monitoring and Evaluation Officer')).toBeTruthy()
    expect(within(dialog).getByText('Not yet active')).toBeTruthy()
    fireEvent.click(within(dialog).getByText('Close', { selector: 'button' }))
    await waitFor(() => expect(screen.queryByText('Account details')).toBeNull())
  })

  it('shows an error state with Retry when the records cannot be loaded', async () => {
    getUsers.mockRejectedValueOnce(new Error('offline'))
    render(<UserManagementWorkspace />)
    expect(await screen.findByText('User records unavailable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByText('Ada Lovelace')).toBeTruthy()
    expect(getUsers).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['an actor without the authorize permission', () => actAs('System Administrator', [])],
    [
      'an account outside the authority of the actor',
      () => actAs('Project Manager', ['users.authorize'], ['project-1']),
    ],
  ])('marks %s as view only', async (_label, setup) => {
    setup()
    getUsers.mockResolvedValue([root])
    await loaded()
    const view = within(row('Root Admin')).getByRole('button', {
      name: /unavailable for Root Admin/i,
    })
    expect(view.hasAttribute('disabled')).toBe(true)
    expect(view.getAttribute('title')).toBe(
      'Your current role cannot authorize this account or its project scope.',
    )
  })
})

describe('user management: account actions', () => {
  it('saves an edited name through updateAuthorizedUser and updates the row', async () => {
    updateAuthorizedUser.mockResolvedValue({ ...ada, name: 'Ada King' })
    await loaded()
    await openEdit('Ada Lovelace')
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: ' Ada King ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(updateAuthorizedUser).toHaveBeenCalledWith('user-1', {
        fullName: 'Ada King',
        role: 'Project Officer',
        accountStatus: 'Active',
        projectIds: ['project-1'],
      }),
    )
    expect(await screen.findByText('Ada King')).toBeTruthy()
    expect(screen.queryByText('Ada Lovelace')).toBeNull()
    expect(toast.success).toHaveBeenCalledWith('Account updated. Permissions apply immediately.')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull())
  })

  it.each([
    [
      'a missing name',
      () => fireEvent.change(screen.getByLabelText('Full name'), { target: { value: ' ' } }),
      'Full name is required.',
    ],
    [
      'no project for a project role',
      () => fireEvent.click(screen.getByLabelText('Assign Project One')),
      'Select at least one permitted project assignment.',
    ],
    [
      'an invalid email',
      () => fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } }),
      'Enter a valid email address.',
    ],
    [
      'a duplicate email',
      () =>
        fireEvent.change(screen.getByLabelText('Email'), {
          target: { value: 'Grace@Example.test' },
        }),
      'That email already belongs to another user.',
    ],
    [
      'an email change',
      () =>
        fireEvent.change(screen.getByLabelText('Email'), {
          target: { value: 'new.ada@example.test' },
        }),
      'Changing the Auth email is not supported by this user endpoint.',
    ],
  ])('blocks saving %s', async (_label, change, message) => {
    await loaded()
    await openEdit('Ada Lovelace')
    change()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect((await screen.findByRole('alert')).textContent).toBe(message)
    expect(updateAuthorizedUser).not.toHaveBeenCalled()
  })

  it('clears the selected projects when the role changes', async () => {
    await loaded()
    await openEdit('Ada Lovelace')
    const box = screen.getByLabelText('Assign Project One') as HTMLInputElement
    expect(box.checked).toBe(true)
    fireEvent.change(screen.getByLabelText('Role'), {
      target: { value: 'Monitoring and Evaluation Officer' },
    })
    expect((screen.getByLabelText('Assign Project One') as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText(/Multiple projects may be selected/)).toBeTruthy()
  })

  it('deactivates an account only after confirmation', async () => {
    updateAuthorizedUser.mockResolvedValue({ ...ada, accountStatus: 'Deactivated' })
    await loaded()
    fireEvent.click(
      within(row('Ada Lovelace')).getByRole('menuitem', { name: /deactivate account/i }),
    )
    expect(await screen.findByText('Deactivate account?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('Deactivate account?')).toBeNull())
    expect(updateAuthorizedUser).not.toHaveBeenCalled()
    fireEvent.click(
      within(row('Ada Lovelace')).getByRole('menuitem', { name: /deactivate account/i }),
    )
    await screen.findByText('Deactivate account?')
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate account' }))
    await waitFor(() =>
      expect(updateAuthorizedUser).toHaveBeenCalledWith('user-1', {
        role: 'Project Officer',
        accountStatus: 'Deactivated',
        projectIds: ['project-1'],
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('Account deactivated. Sign-in access revoked.')
    await waitFor(() => expect(screen.queryByText('Deactivate account?')).toBeNull())
    expect(within(row('Ada Lovelace')).getByText('Deactivated')).toBeTruthy()
  })

  it('authorizes a deactivated account again', async () => {
    updateAuthorizedUser.mockResolvedValue({ ...alan, accountStatus: 'Active' })
    await loaded()
    fireEvent.click(
      within(row('Alan Turing')).getByRole('menuitem', { name: /authorize account/i }),
    )
    await waitFor(() =>
      expect(updateAuthorizedUser).toHaveBeenCalledWith('user-3', {
        role: 'Project Officer',
        accountStatus: 'Active',
        projectIds: ['project-1'],
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('Account authorized. Sign-in access is active.')
    await waitFor(() => expect(within(row('Alan Turing')).getByText('Active')).toBeTruthy())
  })

  it.each([
    ['deactivation', new Error('Service unavailable.'), 'Service unavailable.'],
    ['deactivation', 'refused', 'Deactivation failed.'],
    ['authorization', new Error('Service unavailable.'), 'Service unavailable.'],
    ['authorization', 'refused', 'Authorization failed.'],
  ])('reports a failed %s with %j', async (kind, failure, message) => {
    updateAuthorizedUser.mockRejectedValue(failure)
    await loaded()
    if (kind === 'deactivation') {
      fireEvent.click(
        within(row('Ada Lovelace')).getByRole('menuitem', { name: /deactivate account/i }),
      )
      await screen.findByText('Deactivate account?')
      fireEvent.click(screen.getByRole('button', { name: 'Deactivate account' }))
    } else {
      fireEvent.click(
        within(row('Alan Turing')).getByRole('menuitem', { name: /authorize account/i }),
      )
    }
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message))
  })

  it('closes the create dialog and confirms with a toast after authorizing', async () => {
    authorizeExistingUser.mockResolvedValue({ ...ada, id: 'user-9' })
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: /create user/i }))
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Grace Hopper' } })
    fireEvent.change(screen.getByLabelText(/auth user id/i), {
      target: { value: '11111111-1111-1111-1111-111111111111' },
    })
    fireEvent.click(screen.getByLabelText('Assign Project One'))
    fireEvent.click(screen.getByRole('button', { name: /authorize account/i }))
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Account authorized. Sign-in access is active.'),
    )
    await waitFor(() => expect(screen.queryByLabelText(/auth user id/i)).toBeNull())
  })
})
