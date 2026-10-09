import { describe, expect, it, vi } from 'vitest'

import {
  classifyPasswordCompletionResult,
  isApprovedPasswordRecoveryOrigin,
  localPasswordRecoveryOrigin,
  passwordRecoveryAcknowledgement,
  passwordRecoveryCallbackUrl,
  passwordRecoveryRequestSchema,
  passwordUpdateRequestSchema,
  passwordUpdateSchema,
  requestPasswordRecoveryEmail,
} from './password-recovery'

describe('password recovery request', () => {
  it('uses only the exact approved loopback callback', async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null })

    const result = await requestPasswordRecoveryEmail(
      { resetPasswordForEmail } as never,
      '  developer@example.org  ',
      localPasswordRecoveryOrigin,
    )

    expect(resetPasswordForEmail).toHaveBeenCalledOnce()
    expect(resetPasswordForEmail).toHaveBeenCalledWith('developer@example.org', {
      redirectTo: 'http://127.0.0.1:3000/auth/recovery/callback',
    })
    expect(passwordRecoveryCallbackUrl).toBe('http://127.0.0.1:3000/auth/recovery/callback')
    expect(result).toBe(passwordRecoveryAcknowledgement)
  })

  it('returns the identical acknowledgement for provider and network failures', async () => {
    for (const resetPasswordForEmail of [
      vi.fn().mockResolvedValue({ data: null, error: { message: 'test-only-provider-detail' } }),
      vi.fn().mockRejectedValue(new Error('test-only-network-detail')),
    ]) {
      await expect(
        requestPasswordRecoveryEmail(
          { resetPasswordForEmail } as never,
          'nobody@example.org',
          localPasswordRecoveryOrigin,
        ),
      ).resolves.toBe(passwordRecoveryAcknowledgement)
    }
  })

  it('does not start PKCE or send email from another origin', async () => {
    const resetPasswordForEmail = vi.fn()

    await expect(
      requestPasswordRecoveryEmail(
        { resetPasswordForEmail } as never,
        'developer@example.org',
        'http://localhost:3000',
      ),
    ).resolves.toBe(passwordRecoveryAcknowledgement)
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('accepts only the exact 127.0.0.1 origin', () => {
    expect(isApprovedPasswordRecoveryOrigin(localPasswordRecoveryOrigin)).toBe(true)
    for (const origin of [
      'http://localhost:3000',
      'http://127.0.0.1:3001',
      'https://127.0.0.1:3000',
      'http://127.0.0.1:3000.evil.example',
    ]) {
      expect(isApprovedPasswordRecoveryOrigin(origin)).toBe(false)
    }
  })
})

describe('password recovery validation', () => {
  it('normalizes valid email input without accepting invalid identifiers', () => {
    expect(passwordRecoveryRequestSchema.parse({ email: ' staff@example.org ' })).toEqual({
      email: 'staff@example.org',
    })
    expect(passwordRecoveryRequestSchema.safeParse({ email: 'staff-account' }).success).toBe(false)
  })

  it('requires a strong matching password without trimming it', () => {
    const password = 'Unique-password-42!'
    expect(passwordUpdateSchema.parse({ password, confirmPassword: password }).password).toBe(
      password,
    )
    expect(
      passwordUpdateSchema.safeParse({ password: ` ${password}`, confirmPassword: password })
        .success,
    ).toBe(false)
  })

  it.each([
    'Short1!',
    'all-lowercase-42!',
    'ALL-UPPERCASE-42!',
    'NoNumbersHere!',
    'NoSymbolsHere42',
  ])('rejects a weak password without calling Auth: %s', (password) => {
    expect(passwordUpdateRequestSchema.safeParse({ password }).success).toBe(false)
  })

  it('rejects unexpected request fields', () => {
    expect(
      passwordUpdateRequestSchema.safeParse({
        password: 'Unique-password-42!',
        userId: 'another-user',
      }).success,
    ).toBe(false)
  })

  it('treats only recognized completion responses as certain', () => {
    expect(classifyPasswordCompletionResult(true, { ok: true, sessionClosed: true })).toEqual({
      kind: 'success',
      sessionClosed: true,
    })
    expect(classifyPasswordCompletionResult(false, { ok: false, outcome: 'not_changed' })).toEqual({
      kind: 'unchanged',
    })
    for (const result of [
      null,
      {},
      { ok: true },
      { ok: false, outcome: 'not_changed' },
      { ok: false, outcome: 'unknown' },
      { ok: false, outcome: 'unrecognized' },
      'not-json',
    ]) {
      expect(classifyPasswordCompletionResult(true, result)).toEqual({ kind: 'unknown' })
    }
  })
})
