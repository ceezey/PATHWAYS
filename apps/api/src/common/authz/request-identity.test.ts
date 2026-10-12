import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import type { ApplicationIdentity, AuthenticatedRequest } from './application-identity'
import { requestIdentity } from './request-identity'

describe('requestIdentity', () => {
  it('returns the identity the auth guard attached', () => {
    const user = { userId: 'u' } as ApplicationIdentity
    expect(requestIdentity({ headers: {}, user })).toBe(user)
  })

  it('answers 403 with the shared message when no identity is attached', () => {
    const request: AuthenticatedRequest = { headers: {} }
    expect(() => requestIdentity(request)).toThrow(ForbiddenException)
    expect(() => requestIdentity(request)).toThrow('Application profile is required.')
  })
})
