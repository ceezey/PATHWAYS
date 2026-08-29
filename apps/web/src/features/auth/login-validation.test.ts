import { describe, expect, it } from 'vitest'

import { loginSchema } from './login-validation'

describe('login validation', () => {
  it('requires an identifier and sufficiently long password', () => {
    const result = loginSchema.safeParse({ identifier: '', password: 'short' })

    expect(result.success).toBe(false)
  })

  it('rejects non-email identifiers', () => {
    expect(
      loginSchema.safeParse({ identifier: 'program.manager', password: 'long-enough' }).success,
    ).toBe(false)
  })

  it('accepts a staff email with a sufficiently long password', () => {
    expect(
      loginSchema.safeParse({ identifier: 'staff@example.org', password: 'long-enough-password' })
        .success,
    ).toBe(true)
  })
})
