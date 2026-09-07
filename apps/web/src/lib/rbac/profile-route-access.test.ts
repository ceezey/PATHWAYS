import { describe, expect, it } from 'vitest'

import { prototypeRoles } from '@/types/prototype-role'
import { getRouteAccess } from './route-access'

describe('own-profile route access', () => {
  it('allows every internal prototype role to reach its own profile', () => {
    for (const role of prototypeRoles) {
      expect(getRouteAccess(role, '/settings/profile')).toEqual({
        allowed: true,
        moduleName: 'My Profile',
        requiresBeneficiaryStepUp: undefined,
      })
    }
  })
})
