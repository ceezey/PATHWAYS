import { describe, expect, it } from 'vitest'

import { validatePrototypeCredentials } from '@/lib/auth/prototype-accounts'

import { loginSchema } from './login-validation'

describe('login validation', () => {
  it('requires an identifier and sufficiently long password', () => {
    const result = loginSchema.safeParse({ identifier: '', password: 'short' })

    expect(result.success).toBe(false)
  })

  it('accepts valid prototype credentials', () => {
    const account = validatePrototypeCredentials('program.manager', 'PathwaysDemo!2026')

    expect(account?.role).toBe('Program Manager')
  })

  it('rejects invalid prototype credentials', () => {
    expect(validatePrototypeCredentials('program.manager', 'not-the-password')).toBeNull()
  })
})
