import { describe, expect, it } from 'vitest'

import { pathwaysRoles } from '@/types/pathways-role'
import { getRouteAccess } from './route-access'

describe('own-profile route access', () => {
  it('uses the accepted settings.read policy without broadening self-profile access', () => {
    expect(getRouteAccess('System Administrator', '/settings/profile').allowed).toBe(true)
    for (const role of pathwaysRoles.filter((role) => role !== 'System Administrator')) {
      expect(getRouteAccess(role, '/settings/profile').allowed).toBe(false)
    }
  })
})
