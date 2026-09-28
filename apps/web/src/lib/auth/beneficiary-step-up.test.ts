import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requestFoundation: vi.fn(),
  getSession: vi.fn(),
  listFactors: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
}))

vi.mock('@/lib/services/pathways-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/pathways-client')>(
    '@/lib/services/pathways-client',
  )
  return { ...actual, requestFoundation: mocks.requestFoundation }
})
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({
    auth: {
      getSession: mocks.getSession,
      mfa: { listFactors: mocks.listFactors, challenge: mocks.challenge, verify: mocks.verify },
    },
  }),
}))

import { PathwaysClientError } from '@/lib/services/pathways-client'
import {
  BeneficiaryStepUpError,
  changeStepUpPin,
  getBeneficiaryStepUpStatus,
  setStepUpPin,
  unlockStepUpPin,
  verifyBeneficiaryStepUp,
  verifyStepUpPin,
} from './beneficiary-step-up'

const subject = '74000000-0000-4000-8000-000000000001'
const factorId = '74000000-0000-4000-8000-000000000002'
const totpStatus = {
  fresh: true,
  expiresAt: '2026-09-28T00:15:00.000Z',
  windowSeconds: 900,
  method: 'TOTP',
  pinState: 'SET',
}
const statusCalls = () =>
  mocks.requestFoundation.mock.calls.filter(([path]) => path === '/auth/step-up/status')
const postCalls = () =>
  mocks.requestFoundation.mock.calls.filter(([path]) => path !== '/auth/step-up/status')

beforeEach(() => {
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: subject } } }, error: null })
  mocks.listFactors.mockResolvedValue({
    data: { all: [{ id: factorId, factor_type: 'totp', status: 'verified' }] },
    error: null,
  })
  mocks.challenge.mockResolvedValue({ data: { id: 'challenge' }, error: null })
  mocks.verify.mockResolvedValue({ data: {}, error: null })
  mocks.requestFoundation.mockResolvedValue(totpStatus)
})
afterEach(() => vi.clearAllMocks())

describe('Beneficiary step-up client', () => {
  it('reads freshness only from the API and rejects malformed status', async () => {
    await expect(getBeneficiaryStepUpStatus()).resolves.toEqual({
      fresh: true,
      expiresAt: '2026-09-28T00:15:00.000Z',
      method: 'TOTP',
      pinState: 'SET',
    })
    expect(mocks.requestFoundation).toHaveBeenCalledWith('/auth/step-up/status', {
      signal: undefined,
    })
    mocks.requestFoundation.mockResolvedValue({ fresh: 'yes', expiresAt: null })
    await expect(getBeneficiaryStepUpStatus()).rejects.toThrow('Invalid step-up status.')
    mocks.requestFoundation.mockResolvedValue({ ...totpStatus, pinState: 'ATTEMPTS_3' })
    await expect(getBeneficiaryStepUpStatus()).rejects.toThrow('Invalid step-up status.')
  })

  it('re-verifies the enrolled TOTP factor and requires server-confirmed freshness', async () => {
    await expect(verifyBeneficiaryStepUp('123456')).resolves.toMatchObject({
      method: 'TOTP',
      pinState: 'SET',
    })
    expect(mocks.verify).toHaveBeenCalledWith({
      factorId,
      challengeId: 'challenge',
      code: '123456',
    })
    expect(mocks.requestFoundation).toHaveBeenCalledWith('/auth/step-up/status', {
      signal: undefined,
    })
  })

  it('never treats a client-side verify success as access when the server is not fresh', async () => {
    mocks.requestFoundation.mockResolvedValue({ fresh: false, expiresAt: null })
    await expect(verifyBeneficiaryStepUp('123456')).rejects.toMatchObject({ failure: 'rejected' })
    // A live PIN grant is not proof that this authenticator code was accepted.
    mocks.requestFoundation.mockResolvedValue({ ...totpStatus, method: 'PIN' })
    await expect(verifyBeneficiaryStepUp('123456')).rejects.toMatchObject({ failure: 'rejected' })
  })

  it.each(['12345', '1234567', 'abcdef', '2468'])(
    'rejects %s without any network call',
    async (code) => {
      await expect(verifyBeneficiaryStepUp(code)).rejects.toBeInstanceOf(BeneficiaryStepUpError)
      expect(mocks.challenge).not.toHaveBeenCalled()
      expect(mocks.requestFoundation).not.toHaveBeenCalled()
    },
  )

  it('rejects a wrong code and fails closed without a verified factor', async () => {
    mocks.verify.mockResolvedValueOnce({ data: null, error: { message: 'invalid' } })
    await expect(verifyBeneficiaryStepUp('000000')).rejects.toMatchObject({ failure: 'rejected' })
    mocks.listFactors.mockResolvedValueOnce({
      data: { all: [{ id: factorId, factor_type: 'totp', status: 'unverified' }] },
      error: null,
    })
    await expect(verifyBeneficiaryStepUp('123456')).rejects.toMatchObject({
      failure: 'unavailable',
    })
    expect(mocks.requestFoundation).not.toHaveBeenCalled()
  })

  it('stops if the signed-in subject changes during verification', async () => {
    mocks.getSession
      .mockResolvedValueOnce({ data: { session: { user: { id: subject } } }, error: null })
      .mockResolvedValue({ data: { session: { user: { id: 'someone-else' } } }, error: null })
    await expect(verifyBeneficiaryStepUp('123456')).rejects.toMatchObject({
      failure: 'unavailable',
    })
    expect(mocks.verify).not.toHaveBeenCalled()
  })

  it('reports a challenge transport failure as unavailable, not as a wrong code', async () => {
    mocks.challenge.mockResolvedValueOnce({ data: null, error: { message: 'network' } })
    await expect(verifyBeneficiaryStepUp('123456')).rejects.toMatchObject({
      failure: 'unavailable',
    })
  })
})

describe('Beneficiary step-up PIN client (cr-pathways-beneficiary-step-up-pin)', () => {
  const pinStatus = { ...totpStatus, method: 'PIN' }
  const failure = (status: number) =>
    new PathwaysClientError(
      'The requested operation could not be completed.',
      'forbidden',
      [],
      status,
    )

  it('verifies the PIN in the JSON body only, then requires server-confirmed freshness', async () => {
    mocks.requestFoundation.mockImplementation(async (path: string) =>
      path === '/auth/step-up/status' ? pinStatus : { verified: true },
    )
    await expect(verifyStepUpPin('482915')).resolves.toMatchObject({ method: 'PIN' })
    expect(postCalls()).toEqual([
      ['/auth/step-up/pin', { method: 'POST', body: JSON.stringify({ pin: '482915' }) }],
    ])
    expect(JSON.stringify(mocks.requestFoundation.mock.calls.map(([path]) => path))).not.toContain(
      '482915',
    )
    mocks.requestFoundation.mockImplementation(async (path: string) =>
      path === '/auth/step-up/status' ? { fresh: false, expiresAt: null, pinState: 'SET' } : {},
    )
    await expect(verifyStepUpPin('482915')).rejects.toMatchObject({ failure: 'rejected' })
  })

  it.each(['12345', '1234567890123', '48291a', ''])(
    'rejects PIN %s without a request',
    async (pin) => {
      await expect(verifyStepUpPin(pin)).rejects.toMatchObject({ failure: 'rejected' })
      expect(mocks.requestFoundation).not.toHaveBeenCalled()
    },
  )

  it('maps incorrect, locked and throttled PIN responses', async () => {
    mocks.requestFoundation.mockImplementation(async (path: string) => {
      if (path === '/auth/step-up/status') return { ...totpStatus, fresh: false, method: null }
      throw failure(403)
    })
    await expect(verifyStepUpPin('736150')).rejects.toMatchObject({
      failure: 'rejected',
      message: 'Incorrect PIN',
    })
    mocks.requestFoundation.mockImplementation(async (path: string) => {
      if (path === '/auth/step-up/status')
        return { fresh: false, expiresAt: null, method: null, pinState: 'LOCKED' }
      throw failure(409)
    })
    await expect(verifyStepUpPin('736150')).rejects.toMatchObject({
      failure: 'locked',
      message: 'PIN locked. Use your authenticator to unlock it.',
    })
    mocks.requestFoundation.mockRejectedValue(failure(429))
    await expect(verifyStepUpPin('736150')).rejects.toMatchObject({ failure: 'throttled' })
  })

  it('sets an acceptable PIN only, and reports a stale authenticator', async () => {
    for (const weak of ['111111', '123456', '987654']) {
      await expect(setStepUpPin(weak)).rejects.toMatchObject({ failure: 'rejected' })
    }
    expect(mocks.requestFoundation).not.toHaveBeenCalled()
    mocks.requestFoundation.mockResolvedValue({ pinState: 'SET' })
    await setStepUpPin('482915')
    expect(postCalls()).toEqual([
      ['/auth/step-up/pin/setup', { method: 'POST', body: JSON.stringify({ pin: '482915' }) }],
    ])
    mocks.requestFoundation.mockImplementation(async (path: string) => {
      if (path === '/auth/step-up/status') return { ...totpStatus, pinState: 'NONE' }
      throw failure(403)
    })
    await expect(setStepUpPin('482915')).rejects.toMatchObject({
      message: 'Verify with your authenticator first.',
    })
  })

  it('changes with the current PIN, or re-verifies the authenticator and sends no PIN proof', async () => {
    mocks.requestFoundation.mockResolvedValue({ pinState: 'SET' })
    await changeStepUpPin('529317', { currentPin: '482915' })
    expect(postCalls().at(-1)).toEqual([
      '/auth/step-up/pin/change',
      { method: 'POST', body: JSON.stringify({ newPin: '529317', currentPin: '482915' }) },
    ])
    expect(mocks.verify).not.toHaveBeenCalled()
    await changeStepUpPin('640281', { authenticatorCode: '123456' })
    expect(mocks.verify).toHaveBeenCalledWith({
      factorId,
      challengeId: 'challenge',
      code: '123456',
    })
    expect(postCalls().at(-1)).toEqual([
      '/auth/step-up/pin/change',
      { method: 'POST', body: JSON.stringify({ newPin: '640281' }) },
    ])
    await expect(changeStepUpPin('000000', { currentPin: '482915' })).rejects.toMatchObject({
      failure: 'rejected',
    })
  })

  it('unlocks with an empty POST', async () => {
    mocks.requestFoundation.mockResolvedValue({ pinState: 'SET' })
    await unlockStepUpPin()
    expect(postCalls()).toEqual([['/auth/step-up/pin/unlock', { method: 'POST' }]])
    expect(statusCalls()).toHaveLength(0)
  })
})
