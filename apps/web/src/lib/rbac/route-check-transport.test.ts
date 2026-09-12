import { AsyncLocalStorage } from 'node:async_hooks'
import { type Server, createServer } from 'node:http'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordNavigationDenial } from './navigation-diagnostic'
import { RouteCheckError, type RouteDecision, requestRouteCheck } from './route-access'

const context = {
  userId: '10000000-0000-4000-8000-000000000001',
  organizationId: '10000000-0000-4000-8000-000000000002',
}
const decision: RouteDecision = {
  route: 'dashboard',
  presentation: 'prototype-only',
  beneficiaryAccess: 'records-or-none',
}
const canary = 'SYNTHETIC_PRIVATE_TRANSPORT_CONTENT'
const nativeFetch = globalThis.fetch
const requireWeb = createRequire(import.meta.url)
const { createPatchedFetcher } = requireWeb('next/dist/server/lib/patch-fetch')

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('route checks through installed Next dynamic server fetch and synthetic loopback HTTP', () => {
  let server: Server
  let base: string
  let status: number
  let body: string
  let disconnect: boolean
  let requests: number
  let requestIsBounded: boolean
  const workStorage = new AsyncLocalStorage()
  const requestStorage = new AsyncLocalStorage()
  const run = () =>
    workStorage.run({ route: '/synthetic', forceDynamic: true, isStaticGeneration: false }, () =>
      requestStorage.run({ type: 'request', isHmrRefresh: false }, () =>
        requestRouteCheck(base, canary, context, { route: 'dashboard' }),
      ),
    )

  beforeEach(async () => {
    status = 200
    body = JSON.stringify(decision)
    disconnect = false
    requests = 0
    requestIsBounded = true
    server = createServer((req, res) => {
      requests++
      requestIsBounded &&=
        req.method === 'GET' &&
        req.url === '/api/access/route-check?route=dashboard' &&
        req.headers.authorization === `Bearer ${canary}` &&
        req.headers['x-pathways-user-id'] === context.userId &&
        req.headers['x-pathways-organization-id'] === context.organizationId &&
        req.headers.cookie === undefined
      if (disconnect) {
        req.socket.destroy()
        return
      }
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'private,no-store',
      })
      res.end(body)
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Synthetic listener unavailable')
    base = `http://127.0.0.1:${address.port}/api`
    vi.stubGlobal(
      'fetch',
      createPatchedFetcher(nativeFetch, {
        workAsyncStorage: workStorage,
        workUnitAsyncStorage: requestStorage,
      }),
    )
  })

  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
    expect(server.listening).toBe(false)
    expect(requestIsBounded).toBe(true)
  })

  it('accepts the exact API contract, then observes a new denial rather than caching permission', async () => {
    await expect(run()).resolves.toEqual(decision)
    status = 403
    body = canary
    await expect(run()).rejects.toMatchObject({ status: 403, failure: 'http' })
    expect(requests).toBe(2)
  })

  it.each([500, 502, 503, 504])(
    'identifies actual HTTP %i without reading or logging the private body',
    async (code) => {
      status = code
      body = canary
      vi.stubEnv('NODE_ENV', 'development')
      const output = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const error = await run().catch((failure: unknown) => failure)
      expect(error).toBeInstanceOf(RouteCheckError)
      expect(error).toMatchObject({ status: code, failure: 'http' })
      recordNavigationDenial('SERVER_PAGE', 'ROUTE_API', error)
      expect(output).toHaveBeenCalledExactlyOnceWith('PATHWAYS_NAVIGATION_DENIED', {
        boundary: 'SERVER_PAGE',
        stage: 'ROUTE_API',
        reason: `HTTP_${code}`,
      })
      expect(JSON.stringify([error, output.mock.calls])).not.toContain(canary)
    },
  )

  it.each([
    canary,
    'null',
    '[]',
    '{}',
    JSON.stringify({ ...decision, route: 'projects' }),
    JSON.stringify({ ...decision, presentation: 'finished' }),
    JSON.stringify({ ...decision, beneficiaryAccess: 'unrestricted' }),
    JSON.stringify({ ...decision, privateData: canary }),
  ])('separates invalid HTTP 200 JSON/schema from an HTTP error %#', async (invalid) => {
    body = invalid
    await expect(run()).rejects.toMatchObject({ status: 503, failure: 'invalid-response' })
    expect(requests).toBe(1)
  })

  it('separates a disconnected socket from an HTTP response', async () => {
    disconnect = true
    await expect(run()).rejects.toMatchObject({ status: 503, failure: 'network' })
  })
})

describe('route-check deadlines and malformed inputs remain fail closed', () => {
  const run = (signal?: AbortSignal, base = 'http://127.0.0.1:4000/api') =>
    requestRouteCheck(base, canary, context, { route: 'dashboard' }, signal)

  it('preserves the 15-second deadline and separates it from an actual HTTP 503', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(
      (_url, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error(canary)), { once: true })
        }),
    )
    vi.stubGlobal('fetch', fetch)
    let settled = false
    const pending = run().catch((error: unknown) => {
      settled = true
      return error
    })
    await vi.advanceTimersByTimeAsync(14999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toMatchObject({ status: 503, failure: 'timeout' })
    expect(fetch).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not fetch when the caller was already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(run(controller.signal)).rejects.toMatchObject({
      status: 503,
      failure: 'cancelled',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['headers', 'body'])('rejects late valid %s after cancellation', async (phase) => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (phase === 'headers') controller.abort()
        return {
          ok: true,
          json: async () => {
            controller.abort()
            return decision
          },
        }
      }),
    )
    await expect(run(controller.signal)).rejects.toMatchObject({
      status: 503,
      failure: 'cancelled',
    })
  })

  it.each([
    'not-a-url',
    'https://example.invalid/api',
    'http://127.0.0.1:4000/api?private=synthetic',
  ])('rejects invalid configuration without fetching %#', async (base) => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(run(undefined, base)).rejects.toMatchObject({
      status: 503,
      failure: 'configuration',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not interpret a malformed selector as an HTTP denial or contact the API', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(
      requestRouteCheck(
        'http://127.0.0.1:4000/api',
        canary,
        { ...context, userId: 'forged' },
        { route: 'dashboard' },
      ),
    ).rejects.toMatchObject({
      status: 403,
      failure: 'rejected',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps request security options and removes the caller listener after success', async () => {
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const fetch = vi.fn(async () => Response.json(decision))
    vi.stubGlobal('fetch', fetch)
    await expect(run(controller.signal)).resolves.toEqual(decision)
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      }),
    )
    expect(remove).toHaveBeenCalledExactlyOnceWith('abort', expect.any(Function))
  })
})
