import { describe, expect, it } from 'vitest'

import { changePasswordSchema, profileSchema } from './profile-validation'

describe('own-profile validation', () => {
  it('accepts a complete profile and rejects malformed contact data', () => {
    expect(
      profileSchema.safeParse({
        displayName: 'Frontend Review',
        contactNumber: '+63 900 000 0000',
        email: 'frontend.review@example.org',
      }).success,
    ).toBe(true)
    expect(
      profileSchema.safeParse({
        displayName: 'F',
        contactNumber: 'call-me',
        email: 'invalid',
      }).success,
    ).toBe(false)
  })

  it('requires current, strong, different, matching password values', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'CurrentPathways!2025',
        newPassword: 'NewPathwaysPass!2026',
        confirmPassword: 'NewPathwaysPass!2026',
      }).success,
    ).toBe(true)
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'SamePathwaysPass!2026',
        newPassword: 'SamePathwaysPass!2026',
        confirmPassword: 'SamePathwaysPass!2026',
      }).success,
    ).toBe(false)
  })
})
