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

import {
  BeneficiaryStepUpError,
  getBeneficiaryStepUpStatus,
  verifyBeneficiaryStepUp,
} from './beneficiary-step-up'

const subject = '74000000-0000-4000-8000-000000000001'
const factorId = '74000000-0000-4000-8000-000000000002'

beforeEach(() => {
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: subject } } }, error: null })
  mocks.listFactors.mockResolvedValue({
    data: { all: [{ id: factorId, factor_type: 'totp', status: 'verified' }] },
    error: null,
  })
  mocks.challenge.mockResolvedValue({ data: { id: 'challenge' }, error: null })
  mocks.verify.mockResolvedValue({ data: {}, error: null })
  mocks.requestFoundation.mockResolvedValue({ fresh: true, expiresAt: '2026-09-28T00:15:00.000Z' })
})
afterEach(() => vi.clearAllMocks())

describe('Beneficiary step-up client', () => {
  it('reads freshness only from the API and rejects malformed status', async () => {
    await expect(getBeneficiaryStepUpStatus()).resolves.toEqual({
      fresh: true,
      expiresAt: '2026-09-28T00:15:00.000Z',
    })
    expect(mocks.requestFoundation).toHaveBeenCalledWith('/auth/step-up/status', {
      signal: undefined,
    })
    mocks.requestFoundation.mockResolvedValue({ fresh: 'yes', expiresAt: null })
    await expect(getBeneficiaryStepUpStatus()).rejects.toThrow('Invalid step-up status.')
  })

  it('re-verifies the enrolled TOTP factor and requires server-confirmed freshness', async () => {
    await expect(verifyBeneficiaryStepUp('123456')).resolves.toBeUndefined()
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
