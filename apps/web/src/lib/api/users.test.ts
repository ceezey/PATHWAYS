import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({ requestFoundation: vi.fn() }))
vi.mock('@/lib/api/core/request', () => ({
  requestFoundation: request.requestFoundation,
  PathwaysClientError: class PathwaysClientError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message)
    }
  },
}))

import { usersClient } from './users'

const row = {
  id: '74000000-0000-4000-8000-000000000001',
  authUserId: '74000000-0000-4000-8000-000000000002',
  name: 'Synthetic User',
  email: 'synthetic@example.invalid',
  role: 'Project Officer',
  roleCode: 'PROJECT_OFFICER',
  accountStatus: 'DEACTIVATED',
  projectIds: [],
  projectAccess: [],
  createdAt: '2026-10-01T00:00:00.000Z',
}

beforeEach(() => request.requestFoundation.mockReset())

describe('users client', () => {
  it('reads users with the caller signal and maps account status labels', async () => {
    request.requestFoundation.mockResolvedValue([row])
    const signal = new AbortController().signal
    await expect(usersClient.getUsers(signal)).resolves.toEqual([
      { ...row, accountStatus: 'Deactivated', signInMethod: 'Supabase account' },
    ])
    expect(request.requestFoundation).toHaveBeenCalledWith('/users', { signal })
  })

  it.each([
    ['ACTIVE', 'Active'],
    ['INVITED', 'Invited'],
    ['SUSPENDED', 'Suspended'],
    ['DEACTIVATED', 'Deactivated'],
    ['ARCHIVED', 'Archived'],
  ])('labels the %s account status as %s', async (code, label) => {
    request.requestFoundation.mockResolvedValue([{ ...row, accountStatus: code }])
    await expect(usersClient.getUsers()).resolves.toMatchObject([{ accountStatus: label }])
  })

  it('accepts a list of exactly 200 users', async () => {
    request.requestFoundation.mockResolvedValue(Array(200).fill(row))
    await expect(usersClient.getUsers()).resolves.toHaveLength(200)
  })

  it.each([[Array(201).fill(row)], [{ users: [] }]])(
    'refuses an oversized or non-list user response',
    async (value) => {
      request.requestFoundation.mockResolvedValue(value)
      await expect(usersClient.getUsers()).rejects.toMatchObject({
        message: 'Invalid user response.',
        code: 'network',
      })
    },
  )

  it('authorizes an existing identity with the role code', async () => {
    request.requestFoundation.mockResolvedValue({ ...row, accountStatus: 'ACTIVE' })
    const input = {
      authUserId: row.authUserId,
      fullName: 'Synthetic User',
      role: 'Project Officer' as const,
      projectIds: ['74000000-0000-4000-8000-000000000003'],
    }
    await expect(usersClient.authorizeExistingUser(input)).resolves.toMatchObject({
      accountStatus: 'Active',
    })
    expect(request.requestFoundation).toHaveBeenCalledWith('/users/authorize-existing', {
      method: 'POST',
      body: JSON.stringify({ ...input, role: 'PROJECT_OFFICER' }),
    })
  })

  it('updates a user by encoded id with the status code', async () => {
    request.requestFoundation.mockResolvedValue(row)
    await usersClient.updateAuthorizedUser('a/b', {
      role: 'Program Manager',
      accountStatus: 'Deactivated',
      projectIds: [],
    })
    expect(request.requestFoundation).toHaveBeenCalledWith('/users/a%2Fb', {
      method: 'PATCH',
      body: JSON.stringify({
        role: 'PROGRAM_MANAGER',
        accountStatus: 'DEACTIVATED',
        projectIds: [],
      }),
    })
  })

  it('sends the full name and the active status code on update', async () => {
    request.requestFoundation.mockResolvedValue(row)
    await usersClient.updateAuthorizedUser(row.id, {
      fullName: 'Synthetic Renamed',
      role: 'Project Officer',
      accountStatus: 'Active',
      projectIds: ['74000000-0000-4000-8000-000000000003'],
    })
    expect(request.requestFoundation).toHaveBeenCalledWith(`/users/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fullName: 'Synthetic Renamed',
        role: 'PROJECT_OFFICER',
        accountStatus: 'ACTIVE',
        projectIds: ['74000000-0000-4000-8000-000000000003'],
      }),
    })
  })
})
