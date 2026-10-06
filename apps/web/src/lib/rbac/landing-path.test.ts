import { describe, expect, it } from 'vitest'

import { landingPath } from './route-access'

describe('post-sign-in landing path', () => {
  it('opens User Management for a System Administrator who can authorize users', () => {
    expect(
      landingPath({
        roles: ['SYSTEM_ADMINISTRATOR'],
        permissions: ['users.authorize'],
        assignedProjectIds: [],
      }),
    ).toBe('/settings/users')
  })

  it('keeps the workspace for other roles, a missing grant or an unloaded profile', () => {
    expect(
      landingPath({
        roles: ['PROGRAM_MANAGER'],
        permissions: ['users.authorize'],
        assignedProjectIds: [],
      }),
    ).toBe('/workspace')
    expect(
      landingPath({ roles: ['SYSTEM_ADMINISTRATOR'], permissions: [], assignedProjectIds: [] }),
    ).toBe('/workspace')
    expect(landingPath(null)).toBe('/workspace')
  })
})
