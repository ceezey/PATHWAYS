import { describe, expect, it } from 'vitest'

import { loginSchema } from './login-validation'

describe('login validation', () => {
  it('requires a valid email and a non-empty password', () => {
    expect(loginSchema.safeParse({ identifier: '', password: '' }).success).toBe(false)
    expect(
      loginSchema.safeParse({ identifier: 'program.manager', password: 'existing-password' })
        .success,
    ).toBe(false)
  })

  it('normalizes only email boundary whitespace and preserves the password exactly', () => {
    expect(
      loginSchema.parse({
        identifier: ' Staff.Name+Tag@Example.org ',
        password: ' Existing password ',
      }),
    ).toEqual({
      identifier: 'Staff.Name+Tag@Example.org',
      password: ' Existing password ',
    })
  })

  it('rejects oversized and unexpected input', () => {
    expect(
      loginSchema.safeParse({
        identifier: `${'a'.repeat(250)}@example.org`,
        password: 'existing-password',
      }).success,
    ).toBe(false)
    expect(
      loginSchema.safeParse({
        identifier: 'staff@example.org',
        password: 'existing-password',
        role: 'administrator',
      }).success,
    ).toBe(false)
  })
})
