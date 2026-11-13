// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4000/api' } }))

import { recordSignOut } from './record-sign-out'

const SUBJECT = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const ORG = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  document.cookie = `pathways-context=${encodeURIComponent(
    JSON.stringify({ authUserId: SUBJECT, userId: USER, organizationId: ORG }),
  )}`
})

afterEach(() => {
  document.cookie = 'pathways-context=; Max-Age=0'
  vi.unstubAllGlobals()
})

describe('recordSignOut', () => {
  it('posts the sign-out with the given bearer and workspace selectors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(recordSignOut('token-1', SUBJECT)).resolves.toBeUndefined()
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? []
    expect(url).toBe('http://127.0.0.1:4000/api/auth/sign-out')
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        Authorization: 'Bearer token-1',
        'X-Pathways-Organization-Id': ORG,
        'X-Pathways-User-Id': USER,
      },
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('sends nothing without a workspace context for this subject', async () => {
    document.cookie = 'pathways-context=; Max-Age=0'
    vi.stubGlobal('fetch', vi.fn())
    await recordSignOut('token-1', SUBJECT)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends nothing when the context belongs to another subject', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await recordSignOut('token-1', '44444444-4444-4444-8444-444444444444')
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['a network failure', () => Promise.reject(new TypeError('x'))],
    ['a 403', () => Promise.resolve(new Response(null, { status: 403 }))],
  ])('resolves after %s', async (_label, reply) => {
    vi.stubGlobal('fetch', vi.fn(reply))
    await expect(recordSignOut('token-1', SUBJECT)).resolves.toBeUndefined()
  })
})
