import { describe, expect, it } from 'vitest'

import { changeStepUpPinRequest, signInRequest, verifyStepUpPinRequest } from './auth-requests'

const grin = String.fromCodePoint(0x1f600)

describe('auth request contracts', () => {
  it('accepts a sign-in shape; the address format rule is added by the API', () => {
    const body = { email: 'user@example.org', password: 'x' }
    expect(signInRequest.parse(body)).toEqual(body)
  })

  it.each([
    { email: 'user@example.org', password: '' },
    { email: 'user@example.org', password: 'p'.repeat(1025) },
    { email: 'user@example.org', password: 'x', remember: true },
  ])('rejects the sign-in body %j', (body) => {
    expect(signInRequest.safeParse(body).success).toBe(false)
  })

  it('keeps an absent current PIN absent and a null one null', () => {
    expect(changeStepUpPinRequest.parse({ newPin: '529317' })).toEqual({ newPin: '529317' })
    expect(changeStepUpPinRequest.parse({ newPin: '529317', currentPin: null })).toEqual({
      newPin: '529317',
      currentPin: null,
    })
  })

  it.each([{ pin: '4'.repeat(33) }, { pin: 482915 }])('rejects the PIN body %j', (body) => {
    expect(verifyStepUpPinRequest.safeParse(body).success).toBe(false)
  })

  it.each([
    ['an empty address', { email: '' }, true],
    ['254 characters', { email: 'e'.repeat(254) }, true],
    ['255 characters', { email: 'e'.repeat(255) }, false],
    ['a number', { email: 5 }, false],
    ['a 1024 character password', { password: 'p'.repeat(1024) }, true],
    ['a number as the password', { password: 5 }, false],
  ])('checks the sign-in field: %s', (_label, change, accepted) => {
    const body = { email: 'user@example.org', password: 'x', ...change }
    expect(signInRequest.safeParse(body).success).toBe(accepted)
  })

  it.each([
    ['an empty PIN', '', true],
    ['32 characters', '4'.repeat(32), true],
    ['33 characters', '4'.repeat(33), false],
  ])('checks the PIN length on all three bodies: %s', (_label, pin, accepted) => {
    expect(verifyStepUpPinRequest.safeParse({ pin }).success).toBe(accepted)
    expect(changeStepUpPinRequest.safeParse({ newPin: pin }).success).toBe(accepted)
    expect(changeStepUpPinRequest.safeParse({ newPin: '529317', currentPin: pin }).success).toBe(
      accepted,
    )
  })

  it.each([
    [verifyStepUpPinRequest, { pin: '482915', sessionId: 'x' }],
    [verifyStepUpPinRequest, { pin: null }],
    [changeStepUpPinRequest, { newPin: '529317', method: 'TOTP' }],
    [changeStepUpPinRequest, { newPin: '529317', currentPin: 482915 }],
    [changeStepUpPinRequest, { currentPin: '482915' }],
  ])('rejects the PIN body %#', (schema, body) => {
    expect(schema.safeParse(body).success).toBe(false)
  })

  it.each([
    ['254 astral characters', { email: grin.repeat(254) }, true],
    ['255 astral characters', { email: grin.repeat(255) }, false],
    ['a 1024 astral character password', { password: grin.repeat(1024) }, true],
    ['a 1025 astral character password', { password: grin.repeat(1025) }, false],
  ])('counts astral characters once in the sign-in field: %s', (_label, change, accepted) => {
    const body = { email: 'user@example.org', password: 'x', ...change }
    expect(signInRequest.safeParse(body).success).toBe(accepted)
  })

  it.each([
    ['32 astral characters', grin.repeat(32), true],
    ['33 astral characters', grin.repeat(33), false],
  ])(
    'counts astral characters once in the PIN on all three bodies: %s',
    (_label, pin, accepted) => {
      expect(verifyStepUpPinRequest.safeParse({ pin }).success).toBe(accepted)
      expect(changeStepUpPinRequest.safeParse({ newPin: pin }).success).toBe(accepted)
      expect(changeStepUpPinRequest.safeParse({ newPin: '529317', currentPin: pin }).success).toBe(
        accepted,
      )
    },
  )
})
