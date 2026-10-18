/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UserManagementWorkspace } from './user-management-workspace'

import { baseUser, projectManagerProfile } from '@/test/fixtures/user-management-fixtures'

vi.mock('@/components/ui/select', async () =>
  (await import('@/test/fixtures/user-management-fixtures')).selectMock(),
)

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
vi.mock('@/lib/api/core/request', () => ({
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
    sessionStorage.clear()
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
    expect(screen.getByRole('option', { name: 'Monitoring and Evaluation Officer' })).toBeTruthy()
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
    authorizeExistingUser.mockRejectedValue(
      Object.assign(new Error('Target role is outside your authority.'), { status: 403 }),
    )
    await openCreateDialog()

    fillMinimalCreateForm()
    fireEvent.click(screen.getByRole('button', { name: /authorize account/i }))

    expect(await screen.findByText('Target role is outside your authority.')).toBeTruthy()
  })

  it('shows a 404 server error from authorizeExistingUser', async () => {
    authorizeExistingUser.mockRejectedValue(
      Object.assign(new Error('One or more projects are unavailable.'), { status: 404 }),
    )
    await openCreateDialog()

    fillMinimalCreateForm()
    fireEvent.click(screen.getByRole('button', { name: /authorize account/i }))

    expect(await screen.findByText('One or more projects are unavailable.')).toBeTruthy()
  })

  it('shows a 400 server error from authorizeExistingUser', async () => {
    authorizeExistingUser.mockRejectedValue(
      Object.assign(new Error('Target role is unavailable.'), { status: 400 }),
    )
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

    expect(await screen.findByText(/Enter the existing Auth user ID \(UUID\)/i)).toBeTruthy()
    expect(authorizeExistingUser).not.toHaveBeenCalled()
  })
})

describe('user management: Program Manager assignment', () => {
  beforeEach(() => {
    currentRole = {
      role: 'System Administrator',
      profile: projectManagerProfile,
      assignedProjectIds: [],
    }
    getUsers.mockResolvedValue([baseUser])
    getProjects.mockResolvedValue([
      { id: 'project-1', title: 'Project One', area: 'Area A', targetGoal: null },
    ])
    authorizeExistingUser.mockReset()
    sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('allows saving a Program Manager without project assignments', async () => {
    authorizeExistingUser.mockResolvedValue({ ...baseUser, id: 'user-2' })
    await openCreateDialog()

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Grace Hopper' } })
    fireEvent.change(screen.getByLabelText(/auth user id/i), {
      target: { value: VALID_AUTH_USER_ID },
    })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'Program Manager' } })
    expect(screen.getByText(/Optional for Program Managers/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /authorize account/i }))

    await waitFor(() =>
      expect(authorizeExistingUser).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'Program Manager', projectIds: [] }),
      ),
    )
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
