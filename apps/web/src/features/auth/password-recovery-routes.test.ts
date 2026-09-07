import type { CookieOptions } from '@supabase/ssr'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  client: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getClaims: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  updateUser: vi.fn(),
  verifyOtp: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({ createServerClient: mock.client }))
vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_SUPABASE_URL: 'https://pdqwsknbzkdtiwjjibqt.supabase.co' },
  webSupabasePublishableKey: 'publishable-test-fixture',
}))

import { GET as completeCallback } from '@/app/(staff-auth)/auth/recovery/callback/route'
import { POST as completePasswordUpdate } from '@/app/(staff-auth)/auth/recovery/complete/route'
import {
  passwordRecoveryIntentCookie,
  resetPasswordRecoveryGrantsForTesting,
} from '@/lib/supabase/recovery-server'
import { developerAuthUserId } from './auth-access'
import { localPasswordRecoveryOrigin } from './password-recovery'

const session = {
  access_token: 'test-only-session-token',
  refresh_token: 'test-only-refresh-token',
  user: { id: developerAuthUserId },
}
const recoveryClaims = {
  amr: [{ method: 'recovery', timestamp: 1 }],
  iss: 'https://pdqwsknbzkdtiwjjibqt.supabase.co/auth/v1',
  session_id: 'test-only-session-id',
  sub: developerAuthUserId,
}

beforeEach(() => {
  vi.clearAllMocks()
  resetPasswordRecoveryGrantsForTesting()
  mock.client.mockImplementation(
    (
      _url: string,
      _key: string,
      options: {
        cookies: {
          setAll: (
            cookies: Array<{ name: string; value: string; options: CookieOptions }>,
            headers: Record<string, string>,
          ) => void
        }
      },
    ) => {
      options.cookies.setAll(
        [{ name: 'test-auth-cookie', value: 'test-cookie-value', options: { path: '/' } }],
        { 'Cache-Control': 'private, no-cache, no-store' },
      )
      return {
        auth: {
          exchangeCodeForSession: mock.exchangeCodeForSession,
          getClaims: mock.getClaims,
          getSession: mock.getSession,
          getUser: mock.getUser,
          signOut: mock.signOut,
          updateUser: mock.updateUser,
          verifyOtp: mock.verifyOtp,
        },
      }
    },
  )
  mock.exchangeCodeForSession.mockResolvedValue({
    data: { redirectType: 'PASSWORD_RECOVERY', session, user: session.user },
    error: null,
  })
  mock.verifyOtp.mockResolvedValue({ data: { session, user: session.user }, error: null })
  mock.getUser.mockResolvedValue({ data: { user: session.user }, error: null })
  mock.getSession.mockResolvedValue({ data: { session }, error: null })
  mock.getClaims.mockResolvedValue({ data: { claims: recoveryClaims }, error: null })
  mock.updateUser.mockResolvedValue({ data: { user: session.user }, error: null })
  mock.signOut.mockResolvedValue({ error: null })
})

const callbackRequest = (query: string) =>
  new NextRequest(`${localPasswordRecoveryOrigin}/auth/recovery/callback?${query}`, {
    headers: { host: '127.0.0.1:3000' },
  })

const startPasswordRecovery = async () => {
  const response = await completeCallback(callbackRequest('code=test-only-auth-code'))
  const grant = response.cookies.get(passwordRecoveryIntentCookie)?.value
  if (!grant) throw new Error('Expected the verified callback to issue a local recovery grant.')
  return { grant, response }
}

describe('password recovery callback', () => {
  it('exchanges a recovery PKCE code once and removes all callback credentials from the URL', async () => {
    const { grant, response } = await startPasswordRecovery()

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      `${localPasswordRecoveryOrigin}/auth/update-password`,
    )
    expect(mock.exchangeCodeForSession).toHaveBeenCalledOnce()
    expect(mock.exchangeCodeForSession).toHaveBeenCalledWith('test-only-auth-code')
    expect(mock.getClaims).toHaveBeenCalledWith(session.access_token)
    expect(mock.verifyOtp).not.toHaveBeenCalled()
    expect(response.cookies.get('test-auth-cookie')?.value).toBe('test-cookie-value')
    expect(grant).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(grant).not.toContain(session.access_token)
    expect([...response.headers.values()].join(' ')).not.toContain('test-only-auth-code')
  })

  it('supports the official recovery token-hash callback without a code-exchange race', async () => {
    const response = await completeCallback(
      callbackRequest('token_hash=test-only-hash&type=recovery'),
    )

    expect(response.status).toBe(303)
    expect(mock.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'test-only-hash',
      type: 'recovery',
    })
    expect(mock.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(mock.getClaims).toHaveBeenCalledWith(session.access_token)
  })

  it('rejects an ordinary PKCE exchange and any session without a signed recovery method', async () => {
    mock.exchangeCodeForSession.mockResolvedValueOnce({
      data: { redirectType: null, session, user: session.user },
      error: null,
    })
    const ordinary = await completeCallback(callbackRequest('code=ordinary-sign-in-code'))
    expect(ordinary.headers.get('location')).toBe(
      `${localPasswordRecoveryOrigin}/auth/recovery/error`,
    )
    expect(ordinary.cookies.get(passwordRecoveryIntentCookie)?.value).toBe('')

    mock.getClaims.mockResolvedValueOnce({
      data: { claims: { ...recoveryClaims, amr: [{ method: 'password' }] } },
      error: null,
    })
    const unsignedPurpose = await completeCallback(callbackRequest('code=relabelled-code'))
    expect(unsignedPurpose.headers.get('location')).toBe(
      `${localPasswordRecoveryOrigin}/auth/recovery/error`,
    )
    expect(unsignedPurpose.cookies.get(passwordRecoveryIntentCookie)?.value).toBe('')
  })

  it('rejects hostile origins, duplicate or oversized inputs, and redirect parameters before Auth', async () => {
    const foreign = await completeCallback(
      new NextRequest('http://localhost:3000/auth/recovery/callback?code=test-only', {
        headers: { host: 'localhost:3000' },
      }),
    )
    expect(foreign.status).toBe(404)

    for (const request of [
      callbackRequest('code=one&code=two'),
      callbackRequest(`code=${'a'.repeat(2049)}`),
      callbackRequest('code=test-only&next=https://example.com'),
      callbackRequest('token_hash=test-only&type=magiclink'),
    ]) {
      const response = await completeCallback(request)
      expect(response.headers.get('location')).toBe(
        `${localPasswordRecoveryOrigin}/auth/recovery/error`,
      )
    }
    expect(mock.client).not.toHaveBeenCalled()
  })

  it('fails closed and clears recovery authority for another Auth identity', async () => {
    mock.exchangeCodeForSession.mockResolvedValue({
      data: {
        redirectType: 'PASSWORD_RECOVERY',
        session,
        user: { id: 'another-test-user' },
      },
      error: null,
    })
    mock.signOut.mockRejectedValueOnce(new Error('test-only-signout-detail'))

    const response = await completeCallback(callbackRequest('code=test-only'))

    expect(response.headers.get('location')).toBe(
      `${localPasswordRecoveryOrigin}/auth/recovery/error`,
    )
    expect(mock.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(response.cookies.get(passwordRecoveryIntentCookie)?.value).toBe('')
  })

  it('does not expose provider errors or callback credentials', async () => {
    mock.exchangeCodeForSession.mockResolvedValue({
      data: { redirectType: null, session: null, user: null },
      error: { message: 'test-only-sensitive-provider-error' },
    })
    const response = await completeCallback(callbackRequest('code=test-only-sensitive-code'))
    const rendered = `${response.headers.get('location')} ${await response.text()}`

    expect(rendered).not.toContain('test-only-sensitive-provider-error')
    expect(rendered).not.toContain('test-only-sensitive-code')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })
})

const makePasswordUpdateRequest = ({
  grant,
  password = 'Unique-password-42!',
  rawBody,
}: {
  grant?: string
  password?: string
  rawBody?: string
} = {}) => {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Host: '127.0.0.1:3000',
    Origin: localPasswordRecoveryOrigin,
    'Sec-Fetch-Site': 'same-origin',
  })
  if (grant) headers.set('Cookie', `${passwordRecoveryIntentCookie}=${grant}`)
  return new NextRequest(`${localPasswordRecoveryOrigin}/auth/recovery/complete`, {
    method: 'POST',
    body: rawBody ?? JSON.stringify({ password }),
    headers,
  })
}

describe('password recovery completion', () => {
  it('updates only the verified developer password, consumes the grant, and closes the session', async () => {
    const { grant } = await startPasswordRecovery()
    const response = await completePasswordUpdate(makePasswordUpdateRequest({ grant }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, sessionClosed: true })
    expect(mock.getUser).toHaveBeenCalledOnce()
    expect(mock.getSession).toHaveBeenCalledOnce()
    expect(mock.getClaims).toHaveBeenCalledTimes(2)
    expect(mock.updateUser).toHaveBeenCalledOnce()
    expect(mock.updateUser).toHaveBeenCalledWith({ password: 'Unique-password-42!' })
    expect(mock.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(response.cookies.get(passwordRecoveryIntentCookie)?.value).toBe('')

    const replay = await completePasswordUpdate(makePasswordUpdateRequest({ grant }))
    expect(replay.status).toBe(401)
    expect(mock.updateUser).toHaveBeenCalledOnce()
  })

  it('rejects missing and fabricated grants before password mutation', async () => {
    const missing = await completePasswordUpdate(makePasswordUpdateRequest())
    const fabricated = await completePasswordUpdate(
      makePasswordUpdateRequest({ grant: 'a'.repeat(43) }),
    )

    expect(missing.status).toBe(401)
    expect(fabricated.status).toBe(401)
    expect(mock.updateUser).not.toHaveBeenCalled()
  })

  it('rejects a switched session or another identity before password mutation', async () => {
    const { grant } = await startPasswordRecovery()
    mock.getClaims.mockResolvedValueOnce({
      data: { claims: { ...recoveryClaims, session_id: 'different-session' } },
      error: null,
    })
    expect((await completePasswordUpdate(makePasswordUpdateRequest({ grant }))).status).toBe(401)

    const next = await startPasswordRecovery()
    mock.getUser.mockResolvedValueOnce({ data: { user: { id: 'another-test-user' } }, error: null })
    expect(
      (await completePasswordUpdate(makePasswordUpdateRequest({ grant: next.grant }))).status,
    ).toBe(401)
    expect(mock.updateUser).not.toHaveBeenCalled()
  })

  it('rejects cross-site, weak, malformed, oversized, and 129-character inputs before Auth', async () => {
    const hostile = makePasswordUpdateRequest({ grant: 'a'.repeat(43) })
    hostile.headers.set('Origin', 'https://example.com')
    expect((await completePasswordUpdate(hostile)).status).toBe(403)
    expect(
      (await completePasswordUpdate(makePasswordUpdateRequest({ password: 'weak' }))).status,
    ).toBe(400)
    expect(
      (await completePasswordUpdate(makePasswordUpdateRequest({ rawBody: '{not-json' }))).status,
    ).toBe(400)
    expect(
      (
        await completePasswordUpdate(
          makePasswordUpdateRequest({ rawBody: JSON.stringify({ value: 'x'.repeat(1100) }) }),
        )
      ).status,
    ).toBe(413)
    expect(
      (
        await completePasswordUpdate(
          makePasswordUpdateRequest({ password: `Aa1!${'x'.repeat(125)}` }),
        )
      ).status,
    ).toBe(400)
    expect(mock.client).not.toHaveBeenCalled()
  })

  it('consumes the grant on a definite update rejection and sanitizes provider detail', async () => {
    const { grant } = await startPasswordRecovery()
    mock.updateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'test-only-sensitive-update-error', status: 400 },
    })
    const password = 'Unique-password-42!'
    const response = await completePasswordUpdate(makePasswordUpdateRequest({ grant, password }))
    const rendered = await response.text()

    expect(response.status).toBe(400)
    expect(rendered).toBe('{"ok":false,"outcome":"not_changed"}')
    expect(rendered).not.toContain(password)
    expect(rendered).not.toContain('test-only-sensitive-update-error')
    expect(mock.signOut).not.toHaveBeenCalled()

    expect(
      (await completePasswordUpdate(makePasswordUpdateRequest({ grant, password }))).status,
    ).toBe(401)
    expect(mock.updateUser).toHaveBeenCalledOnce()
  })

  it('reports an uncertain update without restoring or retrying the consumed grant', async () => {
    const { grant } = await startPasswordRecovery()
    mock.updateUser.mockRejectedValueOnce(new Error('test-only-network-detail'))

    const response = await completePasswordUpdate(makePasswordUpdateRequest({ grant }))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ ok: false, outcome: 'unknown' })
    expect((await completePasswordUpdate(makePasswordUpdateRequest({ grant }))).status).toBe(401)
    expect(mock.updateUser).toHaveBeenCalledOnce()
  })

  it.each([0, 502, 503, 504, undefined])(
    'treats a returned transport or unknown provider error as uncertain (status %s)',
    async (status) => {
      const { grant } = await startPasswordRecovery()
      mock.updateUser.mockResolvedValueOnce({
        data: { user: null },
        error: {
          message: 'test-only-sensitive-transport-detail',
          name: status === undefined ? 'AuthUnknownError' : 'AuthRetryableFetchError',
          status,
        },
      })

      const response = await completePasswordUpdate(makePasswordUpdateRequest({ grant }))
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({ ok: false, outcome: 'unknown' })
      expect((await completePasswordUpdate(makePasswordUpdateRequest({ grant }))).status).toBe(401)
      expect(mock.updateUser).toHaveBeenCalledOnce()
    },
  )

  it('reports committed password success separately when sign-out is unconfirmed', async () => {
    const first = await startPasswordRecovery()
    mock.signOut.mockResolvedValueOnce({ error: { message: 'test-only-signout-detail' } })
    const returnedError = await completePasswordUpdate(
      makePasswordUpdateRequest({ grant: first.grant }),
    )
    expect(returnedError.status).toBe(200)
    await expect(returnedError.json()).resolves.toEqual({ ok: true, sessionClosed: false })

    const second = await startPasswordRecovery()
    mock.signOut.mockRejectedValueOnce(new Error('test-only-signout-throw'))
    const thrownError = await completePasswordUpdate(
      makePasswordUpdateRequest({ grant: second.grant }),
    )
    expect(thrownError.status).toBe(200)
    await expect(thrownError.json()).resolves.toEqual({ ok: true, sessionClosed: false })
    expect(mock.updateUser).toHaveBeenCalledTimes(2)
  })

  it('allows at most one concurrent password mutation for the same grant', async () => {
    const { grant } = await startPasswordRecovery()
    const responses = await Promise.all([
      completePasswordUpdate(makePasswordUpdateRequest({ grant })),
      completePasswordUpdate(makePasswordUpdateRequest({ grant })),
    ])

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 401])
    expect(mock.updateUser).toHaveBeenCalledOnce()
  })
})
