import { describe, expect, it } from 'vitest'

import { pathwaysRoles } from '@/types/pathways-role'
import { getRouteAccess } from './route-access'

describe('own-profile route access', () => {
  it('does not invent a profile route grant absent from the accepted policy', () => {
    for (const role of pathwaysRoles) {
      expect(getRouteAccess(role, '/settings/profile').allowed).toBe(false)
    }
  })
})
