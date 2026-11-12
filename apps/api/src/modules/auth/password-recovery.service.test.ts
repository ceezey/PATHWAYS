import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PrismaService } from '../../prisma/prisma.service'
import { PasswordRecoveryService } from './password-recovery.service'

const provider = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  updateUserById: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: provider.createClient }))

const userId = '72000000-0000-4000-8000-000000000001'
const sessionId = '72000000-0000-4000-8000-000000000002'
const token = 'header.payload.signature'
const bearer = `Bearer ${token}`
const password = 'Unique-password-42!'
const claims = () => ({
  amr: [{ method: 'recovery', timestamp: Math.floor(Date.now() / 1000) }],
  aud: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 3600,
  is_anonymous: false,
  iss: 'https://synthetic.supabase.co/auth/v1',
  role: 'authenticated',
  session_id: sessionId,
  sub: userId,
})
const db = { $queryRaw: vi.fn() }
const service = () => new PasswordRecoveryService(db as unknown as PrismaService)
const complete = (authorization: string | undefined = bearer) =>
  service().complete(authorization, password)

describe('PasswordRecoveryService', () => {
  beforeEach(() => {
    db.$queryRaw.mockReset().mockResolvedValue([{ s: 0 }])
    vi.stubEnv('SUPABASE_URL', 'https://synthetic.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'server-only-synthetic-key')
    provider.createClient.mockReset().mockReturnValue({
      auth: {
        admin: { signOut: provider.signOut, updateUserById: provider.updateUserById },
        getClaims: provider.getClaims,
        getUser: provider.getUser,
      },
    })
    provider.getClaims.mockReset().mockResolvedValue({ data: { claims: claims() }, error: null })
    provider.getUser.mockReset().mockResolvedValue({ data: { user: { id: userId } }, error: null })
    provider.updateUserById
      .mockReset()
      .mockResolvedValue({ data: { user: { id: userId } }, error: null })
    provider.signOut.mockReset().mockResolvedValue({ data: null, error: null })
  })

  afterEach(() => vi.unstubAllEnvs())

  it('sets the password of the token owner only and ends every session', async () => {
    await expect(complete()).resolves.toEqual({ ok: true, sessionsClosed: true })
    expect(provider.getClaims).toHaveBeenCalledWith(token)
    expect(provider.getUser).toHaveBeenCalledWith(token)
    expect(provider.updateUserById).toHaveBeenCalledExactlyOnceWith(userId, { password })
    expect(provider.signOut).toHaveBeenCalledExactlyOnceWith(token, 'global')
    expect(provider.createClient.mock.calls[0]?.slice(0, 2)).toEqual([
      'https://synthetic.supabase.co',
      'server-only-synthetic-key',
    ])
  })

  it('accepts an invite sign-in as a recovery sign-in', async () => {
    provider.getClaims.mockResolvedValueOnce({
      data: { claims: { ...claims(), amr: [{ method: 'invite', timestamp: Date.now() / 1000 }] } },
      error: null,
    })
    await expect(complete()).resolves.toEqual({ ok: true, sessionsClosed: true })
  })

  it('records the completed reset once for the token subject', async () => {
    await expect(complete()).resolves.toEqual({ ok: true, sessionsClosed: true })
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
    const [strings, ...values] = db.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]]
    expect(strings.join('?')).toContain('pathways.p90_record_password_reset(?::uuid)')
    expect(values).toEqual([userId])
  })

  it('records nothing when the password was not changed', async () => {
    provider.updateUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 422 } })
    await expect(complete()).rejects.toBeInstanceOf(BadRequestException)
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })

  it('still reports success when recording fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    db.$queryRaw.mockRejectedValueOnce(new Error('synthetic database failure'))
    await expect(complete()).resolves.toEqual({ ok: true, sessionsClosed: true })
    expect(warn).toHaveBeenCalledExactlyOnceWith({ event: 'PATHWAYS_PASSWORD_RESET_AUDIT_FAILED' })
    warn.mockRestore()
  })

  it('records an invite first password the same way', async () => {
    provider.getClaims.mockResolvedValueOnce({
      data: { claims: { ...claims(), amr: [{ method: 'invite', timestamp: Date.now() / 1000 }] } },
      error: null,
    })
    await expect(complete()).resolves.toEqual({ ok: true, sessionsClosed: true })
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, '', token, 'Basic abc', 'Bearer not-a-jwt', `Bearer ${token} extra`])(
    'rejects a missing or malformed bearer token before Auth (%s)',
    async (authorization) => {
      await expect(service().complete(authorization, password)).rejects.toBeInstanceOf(
        UnauthorizedException,
      )
      expect(provider.createClient).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['a password sign-in', { amr: [{ method: 'password', timestamp: Date.now() / 1000 }] }],
    ['a stale recovery sign-in', { amr: [{ method: 'recovery', timestamp: 1 }] }],
    ['another issuer', { iss: 'https://example.com/auth/v1' }],
    ['another audience', { aud: 'service' }],
    ['another role', { role: 'service_role' }],
    ['an anonymous user', { is_anonymous: true }],
    ['an expired token', { exp: 1 }],
    ['a malformed subject', { sub: 'not-a-uuid' }],
    ['a malformed session', { session_id: '' }],
  ])('rejects %s without changing the password', async (_label, change) => {
    provider.getClaims.mockResolvedValueOnce({
      data: { claims: { ...claims(), ...change } },
      error: null,
    })
    await expect(complete()).rejects.toBeInstanceOf(UnauthorizedException)
    expect(provider.updateUserById).not.toHaveBeenCalled()
  })

  it('rejects a revoked session or another current user without changing the password', async () => {
    provider.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 403 } })
    await expect(complete()).rejects.toBeInstanceOf(UnauthorizedException)
    provider.getUser.mockResolvedValueOnce({
      data: { user: { id: '72000000-0000-4000-8000-000000000009' } },
      error: null,
    })
    await expect(complete()).rejects.toBeInstanceOf(UnauthorizedException)
    provider.getClaims.mockResolvedValueOnce({ data: null, error: { message: 'bad signature' } })
    await expect(complete()).rejects.toBeInstanceOf(UnauthorizedException)
    expect(provider.updateUserById).not.toHaveBeenCalled()
  })

  it('maps a definite provider rejection to 400 and anything uncertain to 503, without detail', async () => {
    provider.updateUserById.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'synthetic-sensitive-detail', status: 422 },
    })
    const rejected = await complete().catch((error: unknown) => error)
    expect(rejected).toBeInstanceOf(BadRequestException)
    expect(JSON.stringify((rejected as BadRequestException).getResponse())).not.toContain(
      'synthetic-sensitive-detail',
    )

    provider.updateUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 500 } })
    await expect(complete()).rejects.toBeInstanceOf(ServiceUnavailableException)
    provider.updateUserById.mockRejectedValueOnce(new Error('synthetic network failure'))
    await expect(complete()).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(provider.signOut).not.toHaveBeenCalled()
  })

  it('reports a committed change when ending the sessions is unconfirmed', async () => {
    provider.signOut.mockResolvedValueOnce({ data: null, error: { status: 500 } })
    await expect(complete()).resolves.toEqual({ ok: true, sessionsClosed: false })
    provider.signOut.mockRejectedValueOnce(new Error('synthetic network failure'))
    await expect(complete()).resolves.toEqual({ ok: true, sessionsClosed: false })
  })

  it('fails closed when the server key is missing', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    await expect(complete()).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(provider.updateUserById).not.toHaveBeenCalled()
  })

  describe('setPassword', () => {
    it('sets the password of the given Auth user without touching the database', async () => {
      await expect(service().setPassword(userId, password)).resolves.toBeUndefined()
      expect(provider.updateUserById).toHaveBeenCalledExactlyOnceWith(userId, { password })
      expect(db.$queryRaw).not.toHaveBeenCalled()
    })

    it('maps a 4xx Auth refusal to 400', async () => {
      provider.updateUserById.mockResolvedValue({ error: { status: 422 } })
      await expect(service().setPassword(userId, password)).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('maps a thrown Auth call to 503', async () => {
      provider.updateUserById.mockRejectedValue(new Error('network'))
      await expect(service().setPassword(userId, password)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      )
    })
  })
})
