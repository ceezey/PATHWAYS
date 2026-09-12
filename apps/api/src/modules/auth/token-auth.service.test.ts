import { generateKeyPairSync, sign, webcrypto } from 'node:crypto'
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEVELOPER_AUTH_UUID, DEVELOPER_SUPABASE_URL } from './developer-access'
import type { SessionLivenessService } from './session-liveness.service'
import { TokenAuthService } from './token-auth.service'

const sessions = { assertLive: vi.fn() } as unknown as SessionLivenessService

// Ephemeral test keys only. Exercise the installed Supabase verifier without
// making a real Auth request or reading any credential/environment file.
const signingKeys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const attackerKeys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const keyId = 'local-mfa-verifier-test-key'
const publicJwk = {
  ...signingKeys.publicKey.export({ format: 'jwk' }),
  kid: keyId,
  alg: 'ES256',
  use: 'sig',
}
const sessionId = '10000000-0000-4000-8000-000000000001'

const validClaims = (): Record<string, unknown> => ({
  iss: `${DEVELOPER_SUPABASE_URL}/auth/v1`,
  aud: 'authenticated',
  role: 'authenticated',
  sub: DEVELOPER_AUTH_UUID,
  session_id: sessionId,
  is_anonymous: false,
  iat: Math.floor(Date.now() / 1000) - 30,
  exp: Math.floor(Date.now() / 1000) + 600,
  aal: 'aal2',
  amr: [
    { method: 'password', timestamp: Math.floor(Date.now() / 1000) - 30 },
    { method: 'totp', timestamp: Math.floor(Date.now() / 1000) - 10 },
  ],
})

const signedToken = (claims = validClaims(), attackerSigned = false, headerKeyId = keyId) => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const body = `${encode({ alg: 'ES256', typ: 'JWT', kid: headerKeyId })}.${encode(claims)}`
  const signature = sign('sha256', Buffer.from(body), {
    key: attackerSigned ? attackerKeys.privateKey : signingKeys.privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url')
  return `${body}.${signature}`
}

let user: Record<string, unknown>
let userStatus: number
let fetchMock: ReturnType<typeof vi.fn>
const identityReads = () =>
  fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/auth/v1/user'))

beforeEach(() => {
  vi.mocked(sessions.assertLive).mockReset().mockResolvedValue(undefined)
  vi.stubEnv('SUPABASE_URL', DEVELOPER_SUPABASE_URL)
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_local_test_only')
  vi.stubGlobal('crypto', webcrypto)
  user = {
    id: DEVELOPER_AUTH_UUID,
    is_anonymous: false,
    factors: [{ factor_type: 'totp', status: 'verified', id: sessionId }],
    app_metadata: {},
    user_metadata: {},
  }
  userStatus = 200
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    // Any unexpected network route fails closed inside the mock; global fetch
    // is replaced before the client is created, never forwarded to the network.
    expect(init?.redirect).toBe('error')
    expect(init?.signal).toBeDefined()
    const url = String(input)
    if (url === `${DEVELOPER_SUPABASE_URL}/auth/v1/.well-known/jwks.json`) {
      return Response.json({ keys: [publicJwk] })
    }
    if (url === `${DEVELOPER_SUPABASE_URL}/auth/v1/user`) {
      expect(init?.method).toBe('GET')
      return Response.json(user, { status: userStatus })
    }
    throw new Error('Unexpected outbound request in isolated Auth test')
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('TokenAuthService cryptographic verification and current identity', () => {
  it('rejects replay of an unexpired JWT once its session is removed, even if getUser succeeds', async () => {
    const token = signedToken()
    await new TokenAuthService(sessions).verify(token)
    vi.mocked(sessions.assertLive).mockRejectedValueOnce(new UnauthorizedException())
    await expect(new TokenAuthService(sessions).verify(token)).rejects.toThrow(
      UnauthorizedException,
    )
    expect(identityReads()).toHaveLength(2)
    expect(sessions.assertLive).toHaveBeenCalledTimes(2)
  })

  it('preserves a sanitized liveness outage as 503 instead of guessing that the session is live', async () => {
    vi.mocked(sessions.assertLive).mockRejectedValueOnce(
      new ServiceUnavailableException('Session verification is temporarily unavailable.'),
    )
    await expect(new TokenAuthService(sessions).verify(signedToken())).rejects.toThrow(
      ServiceUnavailableException,
    )
  })

  it('uses the verified session claim, ignoring a replacement supplied in user metadata', async () => {
    await new TokenAuthService(sessions).verify(
      signedToken({
        ...validClaims(),
        user_metadata: { session_id: '20000000-0000-4000-8000-000000000002' },
      }),
    )
    expect(sessions.assertLive).toHaveBeenCalledWith(DEVELOPER_AUTH_UUID, sessionId)
  })

  it('accepts a genuinely signed aal2 token with a current verified TOTP factor', async () => {
    await expect(new TokenAuthService(sessions).verify(signedToken())).resolves.toEqual({
      id: DEVELOPER_AUTH_UUID,
      aal: 'aal2',
    })
    expect(identityReads()).toHaveLength(1)
    expect(sessions.assertLive).toHaveBeenCalledWith(DEVELOPER_AUTH_UUID, sessionId)
  })

  it('rejects an attacker signature even when all decoded claims look valid', async () => {
    await expect(
      new TokenAuthService(sessions).verify(signedToken(validClaims(), true)),
    ).rejects.toThrow(UnauthorizedException)
    expect(identityReads()).toHaveLength(0)
    expect(sessions.assertLive).not.toHaveBeenCalled()
  })

  it.each(['not-a-jwt', 'a.b.c', '', 'Bearer extra-prefix'])(
    'rejects malformed token %#',
    async (token) => {
      await expect(new TokenAuthService(sessions).verify(token)).rejects.toThrow(
        UnauthorizedException,
      )
      expect(identityReads()).toHaveLength(0)
      expect(sessions.assertLive).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['sub', 'not-a-uuid'],
    ['sub', null],
    ['iss', 'https://another-project.example/auth/v1'],
    ['aud', 'service_role'],
    ['aud', ['authenticated']],
    ['role', 'service_role'],
    ['session_id', 'not-a-session'],
    ['session_id', null],
    ['is_anonymous', true],
    ['is_anonymous', null],
    ['exp', 1],
    ['exp', '99999999999'],
    ['exp', null],
    ['iat', '1'],
    ['iat', 99999999999],
    ['nbf', 99999999999],
    ['nbf', '1'],
    ['aal', 'aal3'],
    ['aal', null],
  ])('rejects signed invalid %s claim %# before a current-user read', async (claim, value) => {
    await expect(
      new TokenAuthService(sessions).verify(signedToken({ ...validClaims(), [claim]: value })),
    ).rejects.toThrow(UnauthorizedException)
    expect(identityReads()).toHaveLength(0)
    expect(sessions.assertLive).not.toHaveBeenCalled()
  })

  it.each(['sub', 'iss', 'aud', 'role', 'exp', 'iat', 'session_id', 'is_anonymous', 'aal'])(
    'rejects a signed token missing %s',
    async (claim) => {
      const claims = validClaims()
      delete claims[claim]
      await expect(new TokenAuthService(sessions).verify(signedToken(claims))).rejects.toThrow(
        UnauthorizedException,
      )
      expect(identityReads()).toHaveLength(0)
      expect(sessions.assertLive).not.toHaveBeenCalled()
    },
  )

  it.each([
    undefined,
    null,
    [],
    [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) - 30 }],
    [{ method: 'magiclink', timestamp: Math.floor(Date.now() / 1000) - 30 }],
    [{ method: 'password', timestamp: 'not-a-timestamp' }],
    [{ method: 'password', timestamp: Number.NaN }],
    [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) + 60 }],
  ])('rejects a session that was not established with a valid password method %#', async (amr) => {
    await expect(
      new TokenAuthService(sessions).verify(signedToken({ ...validClaims(), amr })),
    ).rejects.toThrow(UnauthorizedException)
    expect(identityReads()).toHaveLength(0)
    expect(sessions.assertLive).not.toHaveBeenCalled()
  })

  it('accepts a refreshed password session whose method history still includes password', async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 30
    await expect(
      new TokenAuthService(sessions).verify(
        signedToken({
          ...validClaims(),
          amr: [
            { method: 'password', timestamp },
            { method: 'token_refresh', timestamp: timestamp + 10 },
            { method: 'totp', timestamp: timestamp + 20 },
          ],
        }),
      ),
    ).resolves.toEqual({ id: DEVELOPER_AUTH_UUID, aal: 'aal2' })
  })

  it('permits aal1 identity verification for setup but does not invent MFA', async () => {
    user.factors = []
    await expect(
      new TokenAuthService(sessions).verify(signedToken({ ...validClaims(), aal: 'aal1' })),
    ).resolves.toEqual({ id: DEVELOPER_AUTH_UUID, aal: 'aal1' })
  })

  it.each([
    [],
    [{ factor_type: 'totp', status: 'unverified' }],
    [{ factor_type: 'phone', status: 'verified' }],
  ])('rejects stale aal2 when current verified TOTP is absent %#', async (...factors) => {
    user.factors = factors
    await expect(new TokenAuthService(sessions).verify(signedToken())).rejects.toThrow(
      UnauthorizedException,
    )
    expect(identityReads()).toHaveLength(1)
  })

  it('rejects a fresh Auth identity that does not match the signed subject', async () => {
    user.id = '20000000-0000-4000-8000-000000000002'
    await expect(new TokenAuthService(sessions).verify(signedToken())).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('rejects a current anonymous identity even if the signed claim says non-anonymous', async () => {
    user.is_anonymous = true
    await expect(new TokenAuthService(sessions).verify(signedToken())).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('never returns role, permission, organization, or assignment metadata as authority', async () => {
    const metadata = {
      role: 'SYSTEM_ADMINISTRATOR',
      permissions: ['*'],
      organizationId: '20000000-0000-4000-8000-000000000002',
      assignedProjectIds: ['*'],
    }
    user.app_metadata = metadata
    user.user_metadata = metadata
    await expect(
      new TokenAuthService(sessions).verify(
        signedToken({ ...validClaims(), app_metadata: metadata, user_metadata: metadata }),
      ),
    ).resolves.toEqual({ id: DEVELOPER_AUTH_UUID, aal: 'aal2' })
  })

  it('sanitizes provider error details and never logs them', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const token = signedToken()
    user = { msg: `Provider detail with test bearer ${token}` }
    userStatus = 401
    await expect(new TokenAuthService(sessions).verify(token)).rejects.toThrow(
      'Invalid or expired authentication. Sign in again.',
    )
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it.each(['identity', 'keys', 'abort'])(
    'contains rejected %s transport details before installed SDK logging',
    async (failure) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const originalFetch = fetchMock.getMockImplementation()
      fetchMock.mockImplementation(async (input, init) => {
        if (failure === 'keys' || String(input).endsWith('/auth/v1/user')) {
          if (failure === 'abort') throw new DOMException('synthetic-private-detail', 'AbortError')
          throw new Error('synthetic-private-transport-detail')
        }
        return originalFetch?.(input, init)
      })
      // Auth JS shares its JWKS cache between clients. Force a cache miss to
      // actually exercise the key-read transport path, not a later user read.
      const token = signedToken(
        validClaims(),
        false,
        failure === 'keys' ? `${keyId}-cache-miss` : keyId,
      )
      await expect(new TokenAuthService(sessions).verify(token)).rejects.toThrow(
        'Invalid or expired authentication. Sign in again.',
      )
      if (failure === 'keys') {
        expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/jwks.json'))).toBe(
          true,
        )
        expect(identityReads()).toHaveLength(0)
      }
      // Compare only a count so a failing assertion cannot print transport contents.
      expect(error.mock.calls.length).toBe(0)
      expect(sessions.assertLive).not.toHaveBeenCalled()
    },
  )

  it('rejects a non-approved project before any network request', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://another-project.example')
    await expect(new TokenAuthService(sessions).verify(signedToken())).rejects.toThrow(
      ServiceUnavailableException,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not fall back to an administrator secret when public keys are missing', async () => {
    for (const name of [
      'SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ]) {
      vi.stubEnv(name, '')
    }
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'unused-local-test-marker')
    await expect(new TokenAuthService(sessions).verify(signedToken())).rejects.toThrow(
      ServiceUnavailableException,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
