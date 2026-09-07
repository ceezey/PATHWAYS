import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { getQrImageSource, getVerifiedTotpFactors, isTotpCode, verifyTotpCode } from './mfa-flow'

const createMfaMock = () => {
  const calls = {
    challenge: vi.fn().mockResolvedValue({ data: { id: 'test-challenge' }, error: null }),
    verify: vi.fn().mockResolvedValue({ data: {}, error: null }),
  }
  return { calls, mfa: calls as unknown as SupabaseClient['auth']['mfa'] }
}

describe('TOTP verification', () => {
  it('reuses verified TOTP factors; ignores unverified and other factor types', () => {
    const factors = [
      { id: 'existing', factor_type: 'totp', status: 'verified' },
      { id: 'pending', factor_type: 'totp', status: 'unverified' },
      { id: 'phone', factor_type: 'phone', status: 'verified' },
    ]
    expect(getVerifiedTotpFactors(factors).map((factor) => factor.id)).toEqual(['existing'])
  })

  it.each(['', '12345', '1234567', '12a456', '123 45', ' 123456'])(
    'rejects malformed code before any MFA request (%s)',
    async (code) => {
      const { calls, mfa } = createMfaMock()
      expect(isTotpCode(code)).toBe(false)
      await expect(verifyTotpCode(mfa, 'existing', code, vi.fn())).rejects.toThrow()
      expect(calls.challenge).not.toHaveBeenCalled()
      expect(calls.verify).not.toHaveBeenCalled()
    },
  )

  it('checks session continuity before challenge and again before verify', async () => {
    const { calls, mfa } = createMfaMock()
    const assertSession = vi.fn().mockResolvedValue(undefined)
    await verifyTotpCode(mfa, 'existing', '123456', assertSession)
    expect(assertSession).toHaveBeenCalledTimes(2)
    expect(calls.challenge).toHaveBeenCalledWith({ factorId: 'existing' })
    expect(calls.verify).toHaveBeenCalledWith({
      factorId: 'existing',
      challengeId: 'test-challenge',
      code: '123456',
    })
  })

  it('does not submit a code after sign-out/account change while challenge is in flight', async () => {
    const { calls, mfa } = createMfaMock()
    const assertSession = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Session changed'))
    await expect(verifyTotpCode(mfa, 'existing', '123456', assertSession)).rejects.toThrow(
      'Session changed',
    )
    expect(calls.verify).not.toHaveBeenCalled()
  })

  it('sanitizes challenge and verification errors without logging raw data', async () => {
    const { calls, mfa } = createMfaMock()
    calls.challenge.mockResolvedValueOnce({ error: { message: 'raw-secret-from-provider' } })
    await expect(verifyTotpCode(mfa, 'existing', '123456', vi.fn())).rejects.toThrow(
      'Could not start verification',
    )
    expect(calls.verify).not.toHaveBeenCalled()
    calls.verify.mockResolvedValueOnce({ error: { message: 'raw-secret-from-provider' } })
    await expect(verifyTotpCode(mfa, 'existing', '123456', vi.fn())).rejects.toThrow(
      'The code was not accepted',
    )
  })

  it('renders only an inline SVG image, never HTML or a remote QR service', () => {
    expect(getQrImageSource('<svg><title>test fixture</title></svg>')).toMatch(
      /^data:image\/svg\+xml;utf-8,/,
    )
    expect(getQrImageSource('data:image/svg+xml;utf-8,%3Csvg%3E')).toBe(
      'data:image/svg+xml;utf-8,%3Csvg%3E',
    )
    for (const unsafe of [
      'https://example.com/qr',
      '<img onerror="alert(1)">',
      'otpauth://totp/test',
    ]) {
      expect(() => getQrImageSource(unsafe)).toThrow()
    }
  })
})
