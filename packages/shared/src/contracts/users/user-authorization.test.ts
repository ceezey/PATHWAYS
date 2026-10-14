import { describe, expect, it } from 'vitest'

import { roleNames } from '../../rbac/role-catalog'
import { authorizeExistingUserRequest, updateAuthorizedUserRequest } from './user-authorization'

const authUserId = '71000000-0000-4000-8000-000000000001'
const officer = { authUserId, fullName: 'A', role: 'PROJECT_OFFICER' }
const change = { role: 'PROJECT_OFFICER', accountStatus: 'ACTIVE', projectIds: [] }

describe('user authorization contracts', () => {
  it('defaults the project list to empty and trims the name', () => {
    expect(
      authorizeExistingUserRequest.parse({ ...officer, fullName: '  Synthetic User  ' }),
    ).toEqual({ ...officer, fullName: 'Synthetic User', projectIds: [] })
  })

  it.each([
    { ...officer, role: 'Project Officer' },
    { ...officer, projectIds: null },
    { ...officer, projectIds: Array(101).fill(authUserId) },
    { ...officer, fullName: '   ' },
    { ...officer, organizationId: authUserId },
  ])('rejects the authorization body %j', (body) => {
    expect(authorizeExistingUserRequest.safeParse(body).success).toBe(false)
  })

  it('keeps a null name on update, which the service treats as no change', () => {
    const body = {
      fullName: null,
      role: 'PROGRAM_MANAGER',
      accountStatus: 'ACTIVE',
      projectIds: [],
    }
    expect(updateAuthorizedUserRequest.parse(body)).toEqual(body)
  })

  it('requires the project list on update and allows only ACTIVE or DEACTIVATED', () => {
    const body = { role: 'PROGRAM_MANAGER', accountStatus: 'ACTIVE' }
    expect(updateAuthorizedUserRequest.safeParse(body).success).toBe(false)
    expect(
      updateAuthorizedUserRequest.safeParse({ ...body, accountStatus: 'SUSPENDED', projectIds: [] })
        .success,
    ).toBe(false)
    for (const extra of [{ organizationId: authUserId }, { authUserId }]) {
      expect(
        updateAuthorizedUserRequest.safeParse({ ...body, projectIds: [], ...extra }).success,
      ).toBe(false)
    }
  })

  it.each([
    ['1 character', 'A', true],
    ['120 characters', 'x'.repeat(120), true],
    ['121 characters', 'x'.repeat(121), false],
    ['blank after the trim', '   ', false],
  ])('checks the name length on both bodies: %s', (_label, fullName, accepted) => {
    expect(authorizeExistingUserRequest.safeParse({ ...officer, fullName }).success).toBe(accepted)
    expect(updateAuthorizedUserRequest.safeParse({ ...change, fullName }).success).toBe(accepted)
  })

  it('accepts every role code and refuses a display name on both bodies', () => {
    for (const role of Object.keys(roleNames)) {
      expect(authorizeExistingUserRequest.safeParse({ ...officer, role }).success).toBe(true)
      expect(updateAuthorizedUserRequest.safeParse({ ...change, role }).success).toBe(true)
    }
    for (const role of ['Project Officer', 'toString']) {
      expect(authorizeExistingUserRequest.safeParse({ ...officer, role }).success).toBe(false)
      expect(updateAuthorizedUserRequest.safeParse({ ...change, role }).success).toBe(false)
    }
  })

  it('accepts either account status on update and an absent name', () => {
    for (const accountStatus of ['ACTIVE', 'DEACTIVATED']) {
      expect(updateAuthorizedUserRequest.safeParse({ ...change, accountStatus }).success).toBe(true)
    }
  })

  it.each([
    ['a text', 'not-a-uuid'],
    ['a version 0 id', '71000000-0000-0000-8000-000000000001'],
  ])('refuses %s as the identity and as a project id', (_label, id) => {
    expect(authorizeExistingUserRequest.safeParse({ ...officer, authUserId: id }).success).toBe(
      false,
    )
    for (const body of [
      authorizeExistingUserRequest.safeParse({ ...officer, projectIds: [id] }),
      updateAuthorizedUserRequest.safeParse({ ...change, projectIds: [id] }),
    ]) {
      expect(body.success).toBe(false)
    }
  })

  it.each([
    [100, true],
    [101, false],
  ])('accepts a list of %i projects: %s', (count, accepted) => {
    const projectIds = Array(count).fill(authUserId)
    expect(authorizeExistingUserRequest.safeParse({ ...officer, projectIds }).success).toBe(
      accepted,
    )
    expect(updateAuthorizedUserRequest.safeParse({ ...change, projectIds }).success).toBe(accepted)
  })

  it('words the limit of 100 projects as the class-validator rule did', () => {
    const projectIds = Array(101).fill(authUserId)
    for (const result of [
      authorizeExistingUserRequest.safeParse({ ...officer, projectIds }),
      updateAuthorizedUserRequest.safeParse({ ...change, projectIds }),
    ]) {
      expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual([
        'must contain no more than 100 elements',
      ])
    }
  })
})
