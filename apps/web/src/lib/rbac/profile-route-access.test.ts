import { describe, expect, it } from 'vitest'

import { pathwaysRoles } from '@/types/pathways-role'
import { getRouteAccess } from './route-access'

describe('own-profile route access', () => {
  it('permits each role to manage its own profile', () => {
    expect(getRouteAccess('System Administrator', '/settings/profile').allowed).toBe(true)
    for (const role of pathwaysRoles) {
      expect(getRouteAccess(role, '/settings/profile').allowed).toBe(true)
    }
  })
})
