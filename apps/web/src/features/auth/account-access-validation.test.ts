import { describe, expect, it } from 'vitest'

import { recoveryRequestSchema, resetPasswordSchema } from './account-access-validation'

describe('account access validation', () => {
  it('accepts valid email syntax without exposing account existence', () => {
    expect(recoveryRequestSchema.safeParse({ email: 'staff@example.org' }).success).toBe(true)
    expect(recoveryRequestSchema.safeParse({ email: 'not-an-email' }).success).toBe(false)
  })

  it('requires a strong matching reset password', () => {
    expect(
      resetPasswordSchema.safeParse({
        password: 'StrongPathways!2026',
        confirmPassword: 'StrongPathways!2026',
      }).success,
    ).toBe(true)
    expect(
      resetPasswordSchema.safeParse({ password: 'weak', confirmPassword: 'different' }).success,
    ).toBe(false)
  })
})
