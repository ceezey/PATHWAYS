import { generateKeyPairSync, sign, webcrypto } from 'node:crypto'
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEVELOPER_AUTH_UUID, DEVELOPER_SUPABASE_URL } from './developer-access'
import { TokenAuthService } from './token-auth.service'

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
})

const signedToken = (claims = validClaims(), attackerSigned = false) => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const body = `${encode({ alg: 'ES256', typ: 'JWT', kid: keyId })}.${encode(claims)}`
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
  it('accepts a genuinely signed aal2 token with a current verified TOTP factor', async () => {
    await expect(new TokenAuthService().verify(signedToken())).resolves.toEqual({
      id: DEVELOPER_AUTH_UUID,
      aal: 'aal2',
    })
    expect(identityReads()).toHaveLength(1)
  })

  it('rejects an attacker signature even when all decoded claims look valid', async () => {
    await expect(new TokenAuthService().verify(signedToken(validClaims(), true))).rejects.toThrow(
      UnauthorizedException,
    )
    expect(identityReads()).toHaveLength(0)
  })

  it.each(['not-a-jwt', 'a.b.c', '', 'Bearer extra-prefix'])(
    'rejects malformed token %#',
    async (token) => {
      await expect(new TokenAuthService().verify(token)).rejects.toThrow(UnauthorizedException)
      expect(identityReads()).toHaveLength(0)
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
      new TokenAuthService().verify(signedToken({ ...validClaims(), [claim]: value })),
    ).rejects.toThrow(UnauthorizedException)
    expect(identityReads()).toHaveLength(0)
  })

  it.each(['sub', 'iss', 'aud', 'role', 'exp', 'iat', 'session_id', 'is_anonymous', 'aal'])(
    'rejects a signed token missing %s',
    async (claim) => {
      const claims = validClaims()
      delete claims[claim]
      await expect(new TokenAuthService().verify(signedToken(claims))).rejects.toThrow(
        UnauthorizedException,
      )
      expect(identityReads()).toHaveLength(0)
    },
  )

  it('permits aal1 identity verification for setup but does not invent MFA', async () => {
    user.factors = []
    await expect(
      new TokenAuthService().verify(signedToken({ ...validClaims(), aal: 'aal1' })),
    ).resolves.toEqual({ id: DEVELOPER_AUTH_UUID, aal: 'aal1' })
  })

  it.each([
    [],
    [{ factor_type: 'totp', status: 'unverified' }],
    [{ factor_type: 'phone', status: 'verified' }],
  ])('rejects stale aal2 when current verified TOTP is absent %#', async (...factors) => {
    user.factors = factors
    await expect(new TokenAuthService().verify(signedToken())).rejects.toThrow(
      UnauthorizedException,
    )
    expect(identityReads()).toHaveLength(1)
  })

  it('rejects a fresh Auth identity that does not match the signed subject', async () => {
    user.id = '20000000-0000-4000-8000-000000000002'
    await expect(new TokenAuthService().verify(signedToken())).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('rejects a current anonymous identity even if the signed claim says non-anonymous', async () => {
    user.is_anonymous = true
    await expect(new TokenAuthService().verify(signedToken())).rejects.toThrow(
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
      new TokenAuthService().verify(
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
    await expect(new TokenAuthService().verify(token)).rejects.toThrow(
      'Invalid or expired authentication. Sign in again.',
    )
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('rejects a non-approved project before any network request', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://another-project.example')
    await expect(new TokenAuthService().verify(signedToken())).rejects.toThrow(
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
    await expect(new TokenAuthService().verify(signedToken())).rejects.toThrow(
      ServiceUnavailableException,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
