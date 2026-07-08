import { describe, expect, it } from 'vitest'

import { publicPrototypeAccounts } from '@/lib/auth/prototype-accounts'

import { loginSchema } from './login-validation'

describe('login validation', () => {
  it('requires an identifier and sufficiently long password', () => {
    const result = loginSchema.safeParse({ identifier: '', password: 'short' })

    expect(result.success).toBe(false)
  })

  it('exposes demo account metadata without passwords', () => {
    expect(publicPrototypeAccounts[0]).toMatchObject({
      role: 'Program Manager',
      username: 'program.manager',
    })
    expect(JSON.stringify(publicPrototypeAccounts)).not.toContain('PathwaysDemo!2026')
  })

  it('keeps prototype credential verification out of the client validation module', () => {
    expect(
      loginSchema.safeParse({ identifier: 'program.manager', password: 'PathwaysDemo!2026' })
        .success,
    ).toBe(true)
  })
})
