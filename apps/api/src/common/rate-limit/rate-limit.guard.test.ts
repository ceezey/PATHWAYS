import 'reflect-metadata'
import type { AddressInfo } from 'node:net'
import { Controller, type ExecutionContext, Get, HttpException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RateLimit, RateLimitGuard } from './rate-limit.guard'
import { RateLimitService } from './rate-limit.service'

const TOKEN = 'c'.repeat(64)

// In-memory model of pathways.rate_limit_hit: a fixed window per bucket that refuses past the maximum.
function counter() {
  const hits = new Map<string, number>()
  const service = {
    hit: vi.fn(async (bucket: string, max: number) => {
      const n = (hits.get(bucket) ?? 0) + 1
      hits.set(bucket, n)
      return n <= max ? 0 : 42
    }),
  }
  return { service, hits }
}

class Routes {
  @RateLimit('sign-in') signIn() {}
  @RateLimit('public-analytics') analytics() {}
  @RateLimit('public-media') media() {}
}

type Call = { headers?: Record<string, string>; body?: unknown; ip?: string }

function caller(route: keyof Routes, env: Record<string, string> = {}) {
  vi.stubEnv('PUBLIC_VISITOR_TOKEN', env.PUBLIC_VISITOR_TOKEN ?? '')
  if (env.VERCEL) vi.stubEnv('VERCEL', env.VERCEL)
  const { service, hits } = counter()
  const guard = new RateLimitGuard(service as unknown as RateLimitService, new Reflector())
  return {
    service,
    hits,
    call: async (request: Call) => {
      const headers: Record<string, string> = {}
      const response = { setHeader: (name: string, value: string) => (headers[name] = value) }
      const context = {
        getHandler: () => Routes.prototype[route],
        switchToHttp: () => ({
          getRequest: () => ({
            headers: request.headers ?? {},
            body: request.body,
            socket: { remoteAddress: request.ip ?? '10.0.0.1' },
          }),
          getResponse: () => response,
        }),
      } as unknown as ExecutionContext
      try {
        return { allowed: await guard.canActivate(context), headers }
      } catch (error) {
        if (!(error instanceof HttpException)) throw error
        return { status: error.getStatus(), body: error.getResponse(), headers }
      }
    },
  }
}

afterEach(() => vi.unstubAllEnvs())

describe('sign-in limit', () => {
  it('refuses the 31st request from one address with the pinned 429', async () => {
    const { call } = caller('signIn')
    for (let i = 0; i < 30; i++)
      expect(await call({ body: { email: `user${i}@x.org` } })).toMatchObject({ allowed: true })
    expect(await call({ body: { email: 'user31@x.org' } })).toEqual({
      status: 429,
      headers: { 'Retry-After': '42' },
      body: {
        statusCode: 429,
        error: 'Too Many Requests',
        code: 'RATE_LIMITED',
        message: 'Too many requests. Try again shortly.',
        retryAfterSeconds: 42,
      },
    })
  })

  it('lets 20 different accounts from one shared address sign in once each', async () => {
    const { call } = caller('signIn')
    for (let i = 0; i < 20; i++)
      expect(await call({ body: { email: `staff${i}@x.org` } })).toMatchObject({ allowed: true })
  })

  it('refuses the 11th attempt on one account from one address, spelled any way', async () => {
    const { call } = caller('signIn')
    for (let i = 0; i < 10; i++)
      expect(await call({ body: { email: i % 2 ? ' A@X.org ' : 'a@x.org' } })).toMatchObject({
        allowed: true,
      })
    expect(await call({ body: { email: 'a@x.org' } })).toMatchObject({ status: 429 })
    expect(await call({ body: { email: 'b@x.org' } })).toMatchObject({ allowed: true })
  })

  it('counts only the address bucket when the body has no email', async () => {
    const { call, hits } = caller('signIn')
    await call({ body: { email: 7 } })
    await call({})
    expect([...hits.keys()]).toEqual(['signin-ip:10.0.0.1'])
  })

  it('cannot be dodged with a client-sent X-Forwarded-For or X-Real-IP', async () => {
    const { call } = caller('signIn')
    for (let i = 0; i < 30; i++)
      await call({
        headers: { 'x-forwarded-for': `9.9.9.${i}`, 'x-real-ip': `8.8.8.${i}` },
        body: { email: `u${i}@x.org` },
      })
    expect(
      await call({ headers: { 'x-forwarded-for': '7.7.7.7' }, body: { email: 'z@x.org' } }),
    ).toMatchObject({ status: 429 })
  })

  it('counts the x-real-ip address on Vercel, not x-forwarded-for', async () => {
    const { call, hits } = caller('signIn', { VERCEL: '1' })
    await call({ headers: { 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '9.9.9.9' } })
    expect([...hits.keys()]).toEqual(['signin-ip:203.0.113.9'])
  })
})

describe('public analytics limit', () => {
  const visitor = (address: string, token = TOKEN) => ({
    'x-pathways-visitor-address': address,
    'x-pathways-visitor-token': token,
  })

  it('gives each forwarded visitor their own 120 per minute', async () => {
    const { call } = caller('analytics', { PUBLIC_VISITOR_TOKEN: TOKEN })
    for (let i = 0; i < 120; i++)
      expect(await call({ headers: visitor('198.51.100.1') })).toMatchObject({ allowed: true })
    expect(await call({ headers: visitor('198.51.100.1') })).toMatchObject({ status: 429 })
    expect(await call({ headers: visitor('198.51.100.2') })).toMatchObject({ allowed: true })
  })

  it('ignores the visitor header without the right token', async () => {
    const { call, hits } = caller('analytics', { PUBLIC_VISITOR_TOKEN: TOKEN })
    await call({ headers: visitor('198.51.100.1', 'd'.repeat(64)) })
    expect([...hits.keys()]).toEqual(['analytics:10.0.0.1'])
  })

  it('is off when the token is empty', async () => {
    const { call, service } = caller('analytics')
    expect(await call({ headers: visitor('198.51.100.1') })).toMatchObject({ allowed: true })
    expect(service.hit).not.toHaveBeenCalled()
  })
})

describe('public media limit', () => {
  it('refuses the 301st request from one address', async () => {
    const { call } = caller('media')
    for (let i = 0; i < 300; i++) await call({})
    expect(await call({})).toMatchObject({ status: 429, headers: { 'Retry-After': '42' } })
    expect(await call({ ip: '10.0.0.2' })).toMatchObject({ allowed: true })
  })
})

describe('over HTTP', () => {
  it('sends the 429 body and the Retry-After header on the wire', async () => {
    @Controller('limited')
    class Limited {
      @Get()
      @RateLimit('public-media')
      get() {
        return { ok: true }
      }
    }
    vi.stubEnv('PUBLIC_VISITOR_TOKEN', '')
    const module = await Test.createTestingModule({
      controllers: [Limited],
      providers: [{ provide: RateLimitService, useValue: { hit: async () => 17 } }],
    }).compile()
    const app = module.createNestApplication({ logger: false })
    await app.listen(0, '127.0.0.1')
    try {
      const { port } = app.getHttpServer().address() as AddressInfo
      const response = await fetch(`http://127.0.0.1:${port}/limited`)
      expect(response.status).toBe(429)
      expect(response.headers.get('retry-after')).toBe('17')
      expect(await response.json()).toEqual({
        statusCode: 429,
        error: 'Too Many Requests',
        code: 'RATE_LIMITED',
        message: 'Too many requests. Try again shortly.',
        retryAfterSeconds: 17,
      })
    } finally {
      await app.close()
    }
  })
})
