import 'reflect-metadata'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InactiveVerifiedSessionError } from '../../../prisma/prisma.service'
import { DEVELOPER_AUTH_UUID } from '../developer-bootstrap-identity'

import {
  auditCreate,
  beneficiaryHandler,
  detailPath,
  get,
  organizationId,
  prisma,
  profile,
  profiles,
  projectFindFirst,
  queryRaw,
  send,
  sessionId,
  sqlOf,
  tokens,
  unassignedProjectId,
  unpermittedPath,
  useBoundaryApp,
  userId,
  verifiedSession,
} from './supabase-auth.guard.harness'

useBoundaryApp()

describe('Beneficiary step-up PIN fallback (cr-pathways-beneficiary-step-up-pin)', () => {
  const headers = {
    authorization: 'Bearer local-test-token',
    'x-pathways-user-id': userId,
    'x-pathways-organization-id': organizationId,
  }
  const now = () => Math.floor(Date.now() / 1000)
  const stepUpSession = (mfaVerifiedAt?: number) =>
    verifiedSession('aal2', DEVELOPER_AUTH_UUID, mfaVerifiedAt)
  const pinCalls = (name: string) =>
    queryRaw.mock.calls.filter((call) => sqlOf(call).includes(name))
  const liveGrant = () => [{ pinState: 'SET', grantExpiresAt: new Date(Date.now() + 600_000) }]

  beforeEach(() => vi.stubEnv('PATHWAYS_DEVELOPER_ACCESS_ENABLED', 'true'))

  it('accepts a live PIN grant for the same user, organization and verified session', async () => {
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
    queryRaw.mockResolvedValue(liveGrant())
    const admitted = await get(detailPath, headers)
    expect(admitted.status).toBe(200)
    expect(beneficiaryHandler).toHaveBeenCalledOnce()
    const [context] = prisma.withVerifiedContext.mock.calls[0] ?? []
    expect(context).toEqual({
      authSubject: DEVELOPER_AUTH_UUID,
      organizationId,
      userId,
      sessionId,
    })
    expect(pinCalls('step_up_pin_status')).toHaveLength(1)
    expect(pinCalls('step_up_pin_status')[0]?.slice(1)).toEqual([sessionId])
    const audit = auditCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(audit.data).toMatchObject({
      action: 'BENEFICIARY_STEP_UP_ACCEPTED',
      changes: { method: 'PIN', windowSeconds: 900 },
    })
  })

  it('keeps a fresh TOTP path unchanged: no grant lookup and method TOTP', async () => {
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 60))
    expect((await get(detailPath, headers)).status).toBe(200)
    expect(queryRaw).not.toHaveBeenCalled()
    expect(prisma.withVerifiedContext.mock.calls[0]?.[0]).not.toHaveProperty('sessionId')
    const audit = auditCreate.mock.calls[0]?.[0] as { data: { changes: Record<string, unknown> } }
    expect(audit.data.changes.method).toBe('TOTP')
  })

  it.each([
    [
      'no grant for this session, user or organization',
      [{ pinState: 'SET', grantExpiresAt: null }],
      403,
    ],
    ['an expired or locked grant', [{ pinState: 'LOCKED', grantExpiresAt: null }], 403],
    ['a malformed status', [{ pinState: 'SET', grantExpiresAt: 'tomorrow' }], 503],
  ] as const)('denies %s', async (_label, rows, status) => {
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
    queryRaw.mockResolvedValue([...rows])
    const denied = await get(detailPath, headers)
    expect(denied.status).toBe(status)
    if (status === 403) expect(denied.body.code).toBe('STEP_UP_REQUIRED')
    expect(beneficiaryHandler).not.toHaveBeenCalled()
  })

  it('rejects a grant once the verified session has ended', async () => {
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
    prisma.withVerifiedContext.mockImplementationOnce(async () => {
      throw new InactiveVerifiedSessionError()
    })
    expect((await get(detailPath, headers)).status).toBe(401)
    expect(beneficiaryHandler).not.toHaveBeenCalled()
  })

  it('ignores client-supplied grant, session and step-up values', async () => {
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
    queryRaw.mockResolvedValue([{ pinState: 'SET', grantExpiresAt: null }])
    const forgedSession = '99000000-0000-4000-8000-000000000099'
    const denied = await get(`${detailPath}?sessionId=${forgedSession}&grant=PIN`, {
      ...headers,
      'x-pathways-session-id': forgedSession,
      'x-pathways-step-up': 'PIN',
    })
    expect(denied.status).toBe(403)
    expect(denied.body.code).toBe('STEP_UP_REQUIRED')
    expect(pinCalls('step_up_pin_status')[0]?.slice(1)).toEqual([sessionId])
    expect(JSON.stringify(prisma.withVerifiedContext.mock.calls)).not.toContain(forgedSession)
  })

  it('checks project scope before any grant lookup', async () => {
    tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
    projectFindFirst.mockResolvedValue(null)
    queryRaw.mockResolvedValue(liveGrant())
    const denied = await get(
      `/boundary-test/projects/${unassignedProjectId}/beneficiary-detail`,
      headers,
    )
    expect(denied.status).toBe(404)
    expect(denied.body.code).toBeUndefined()
    expect(queryRaw).not.toHaveBeenCalled()
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it.each(['PROGRAM_MANAGER', 'GRANT_MANAGER'] as const)(
    'keeps aggregate-only %s denied detail regardless of a PIN grant',
    async (role) => {
      profiles.resolveWithSession.mockImplementation(async () => ({
        ...profile,
        roles: [role],
        permissions: ['projects.read', 'beneficiaries.aggregates.read'],
      }))
      tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
      queryRaw.mockResolvedValue(liveGrant())
      const detail = await get(unpermittedPath, headers)
      expect(detail.status).toBe(403)
      expect(detail.body.message).toBe('Required application permission is missing.')
      expect(queryRaw).not.toHaveBeenCalled()
      expect(beneficiaryHandler).not.toHaveBeenCalled()
    },
  )

  describe('PIN endpoints', () => {
    const post = (path: string, body?: unknown, extra: Record<string, string> = {}) =>
      send('POST', path, { ...headers, ...extra }, body)

    it.each([
      ['ACCEPTED', 200, undefined],
      ['INCORRECT', 403, 'STEP_UP_PIN_INCORRECT'],
      ['LOCKED', 409, 'STEP_UP_PIN_LOCKED'],
      ['NOT_SET', 409, 'STEP_UP_PIN_NOT_SET'],
    ] as const)('maps verify outcome %s to %i', async (outcome, status, code) => {
      tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
      const expiresAt = new Date(Date.now() + 900_000)
      queryRaw.mockResolvedValue([
        { outcome, expiresAt: outcome === 'ACCEPTED' ? expiresAt : null },
      ])
      const result = await post('/auth/step-up/pin', { pin: '482915' })
      expect(result.status).toBe(status)
      if (code) expect(result.body).toMatchObject({ code })
      else
        expect(result.body).toEqual({
          verified: true,
          method: 'PIN',
          expiresAt: expiresAt.toISOString(),
        })
      if (outcome === 'INCORRECT') expect(result.body.message).toBe('Incorrect PIN')
      if (outcome === 'LOCKED')
        expect(result.body.message).toBe('PIN locked. Use your authenticator to unlock it.')
      expect(result.raw).not.toContain('482915')
      expect(pinCalls('step_up_pin_verify')[0]?.slice(1)).toEqual(['482915', sessionId])
      expect(prisma.withVerifiedContext.mock.calls[0]?.[0]).toMatchObject({ sessionId })
    })

    it('accepts the PIN only in the JSON body and rejects extra or malformed fields', async () => {
      tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
      const cases: Array<[string, unknown, Record<string, string>]> = [
        ['/auth/step-up/pin?pin=482915', undefined, {}],
        ['/auth/step-up/pin', undefined, { 'x-pathways-pin': '482915' }],
        ['/auth/step-up/pin', { pin: 482915 }, {}],
        ['/auth/step-up/pin', { pin: '48291' }, {}],
        ['/auth/step-up/pin', { pin: '４８２９１５' }, {}],
      ]
      for (const [path, body, extra] of cases) {
        const result = await post(path, body, extra)
        expect(result.status, JSON.stringify(body ?? path)).toBe(400)
        expect(result.raw).not.toContain('482915')
      }
      expect(queryRaw).not.toHaveBeenCalled()
      // A body session value is refused before the service, so only the verified session claim is used.
      const forged = '99000000-0000-4000-8000-000000000099'
      expect((await post('/auth/step-up/pin', { pin: '736150', sessionId: forged })).status).toBe(
        400,
      )
      expect(queryRaw).not.toHaveBeenCalled()
      queryRaw.mockResolvedValue([{ outcome: 'INCORRECT', expiresAt: null }])
      await post('/auth/step-up/pin', { pin: '736150' })
      expect(pinCalls('step_up_pin_verify')[0]?.slice(1)).toEqual(['736150', sessionId])
    })

    it('requires a fresh TOTP from signed claims to set a PIN, and only once', async () => {
      tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
      const stale = await post('/auth/step-up/pin/setup', { pin: '482915' })
      expect(stale).toMatchObject({ status: 403, body: { code: 'STEP_UP_TOTP_REQUIRED' } })
      expect(queryRaw).not.toHaveBeenCalled()

      const verifiedAt = now() - 120
      tokens.verifyCurrent.mockResolvedValue(stepUpSession(verifiedAt))
      for (const weak of ['111111', '123456', '987654', '1234567890123']) {
        const rejected = await post('/auth/step-up/pin/setup', { pin: weak })
        expect(rejected).toMatchObject({ status: 400, body: { code: 'STEP_UP_PIN_INVALID' } })
        expect(rejected.raw).not.toContain(weak)
      }
      expect(queryRaw).not.toHaveBeenCalled()

      queryRaw.mockResolvedValue([{ outcome: 'SET' }])
      expect(await post('/auth/step-up/pin/setup', { pin: '482915' })).toMatchObject({
        status: 200,
        body: { pinState: 'SET' },
      })
      expect(pinCalls('step_up_pin_set')[0]?.slice(1)).toEqual([
        '482915',
        new Date(verifiedAt * 1000),
      ])
      queryRaw.mockResolvedValue([{ outcome: 'EXISTS' }])
      expect(await post('/auth/step-up/pin/setup', { pin: '736150' })).toMatchObject({
        status: 409,
        body: { code: 'STEP_UP_PIN_EXISTS' },
      })
    })

    it('changes with the current PIN or a fresh TOTP only', async () => {
      tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
      expect(await post('/auth/step-up/pin/change', { newPin: '529317' })).toMatchObject({
        status: 403,
        body: { code: 'STEP_UP_TOTP_REQUIRED' },
      })
      expect(queryRaw).not.toHaveBeenCalled()
      queryRaw.mockResolvedValue([{ outcome: 'INCORRECT' }])
      expect(
        await post('/auth/step-up/pin/change', { newPin: '529317', currentPin: '736150' }),
      ).toMatchObject({ status: 403, body: { code: 'STEP_UP_PIN_INCORRECT' } })
      // A supplied current PIN is the proof; no TOTP time is asserted to the database.
      expect(pinCalls('step_up_pin_change')[0]?.slice(1)).toEqual(['529317', '736150', null])

      const verifiedAt = now() - 30
      tokens.verifyCurrent.mockResolvedValue(stepUpSession(verifiedAt))
      queryRaw.mockResolvedValue([{ outcome: 'CHANGED' }])
      expect(await post('/auth/step-up/pin/change', { newPin: '529317' })).toMatchObject({
        status: 200,
        body: { pinState: 'SET' },
      })
      expect(pinCalls('step_up_pin_change')[1]?.slice(1)).toEqual([
        '529317',
        null,
        new Date(verifiedAt * 1000),
      ])
      queryRaw.mockResolvedValue([{ outcome: 'TOTP_REQUIRED' }])
      expect(await post('/auth/step-up/pin/change', { newPin: '529317' })).toMatchObject({
        status: 403,
        body: { code: 'STEP_UP_TOTP_REQUIRED' },
      })
    })

    it('unlocks only with a fresh TOTP', async () => {
      tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
      expect(await post('/auth/step-up/pin/unlock')).toMatchObject({
        status: 403,
        body: { code: 'STEP_UP_TOTP_REQUIRED' },
      })
      expect(queryRaw).not.toHaveBeenCalled()
      tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 10))
      queryRaw.mockResolvedValue([{ outcome: 'UNLOCKED' }])
      expect(await post('/auth/step-up/pin/unlock')).toMatchObject({
        status: 200,
        body: { pinState: 'SET' },
      })
    })

    it('throttles repeated PIN requests per user and sanitizes database failures', async () => {
      tokens.verifyCurrent.mockResolvedValue(stepUpSession(now() - 901))
      queryRaw.mockRejectedValue(new Error('synthetic failure with 482915 and $2a$10$hash'))
      const failed = await post('/auth/step-up/pin', { pin: '482915' })
      expect(failed.status).toBe(503)
      expect(failed.raw).not.toMatch(/482915|\$2a\$|synthetic/)
      queryRaw.mockResolvedValue([{ outcome: 'INCORRECT', expiresAt: null }])
      for (let attempt = 2; attempt <= 10; attempt++) {
        expect((await post('/auth/step-up/pin', { pin: '736150' })).status).toBe(403)
      }
      const throttled = await post('/auth/step-up/pin', { pin: '736150' })
      expect(throttled).toMatchObject({ status: 429, body: { code: 'STEP_UP_PIN_THROTTLED' } })
      expect(pinCalls('step_up_pin_verify')).toHaveLength(10)
    })

    it('requires verified MFA, a bearer token and a resolved profile for every PIN endpoint', async () => {
      tokens.verifyCurrent.mockResolvedValue(verifiedSession('aal1'))
      for (const path of [
        '/auth/step-up/pin',
        '/auth/step-up/pin/setup',
        '/auth/step-up/pin/change',
        '/auth/step-up/pin/unlock',
      ]) {
        expect((await post(path, { pin: '482915' })).status).toBe(403)
      }
      expect((await send('POST', '/auth/step-up/pin', {}, { pin: '482915' })).status).toBe(401)
      expect(queryRaw).not.toHaveBeenCalled()
    })
  })
})
