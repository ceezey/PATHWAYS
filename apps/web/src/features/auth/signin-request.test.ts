import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api' } }))

import { requestSignIn } from './signin-request'

const reply = (status: number, body: unknown = {}) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))

afterEach(() => vi.unstubAllGlobals())

describe('requestSignIn', () => {
  it('returns the session on success and posts only to the API sign-in route', async () => {
    reply(200, { accessToken: 'a', refreshToken: 'r' })
    await expect(requestSignIn('a@x.org', 'pw')).resolves.toEqual({
      kind: 'session',
      accessToken: 'a',
      refreshToken: 'r',
    })
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
    expect(url).toBe('http://127.0.0.1:4000/api/auth/sign-in')
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error' })
  })

  it('maps 429 to locked and 401 to invalid', async () => {
    reply(429, { code: 'SIGN_IN_LOCKED' })
    await expect(requestSignIn('a@x.org', 'pw')).resolves.toEqual({ kind: 'locked' })
    reply(401)
    await expect(requestSignIn('a@x.org', 'pw')).resolves.toEqual({ kind: 'invalid' })
  })

  it('treats outages and malformed success bodies as unavailable', async () => {
    reply(503)
    await expect(requestSignIn('a@x.org', 'pw')).rejects.toThrow('SIGN_IN_UNAVAILABLE')
    reply(200, { accessToken: 1 })
    await expect(requestSignIn('a@x.org', 'pw')).rejects.toThrow('SIGN_IN_UNAVAILABLE')
  })
})
