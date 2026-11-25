import { existsSync } from 'node:fs'
import path from 'node:path'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

const session = vi.hoisted(() => vi.fn())
vi.mock('./lib/middleware', () => ({ updateSession: session }))
import { config, middleware } from './middleware'

const nonceOf = (policy: string | null) => /'nonce-([^']+)'/.exec(policy ?? '')?.[1]

describe('Next.js middleware entry point', () => {
  it('lives next to src/app so Next actually includes it in the build', () => {
    expect(existsSync(path.join(__dirname, 'middleware.ts'))).toBe(true)
    expect(existsSync(path.join(__dirname, 'app'))).toBe(true)
    expect(existsSync(path.join(__dirname, '..', 'middleware.ts'))).toBe(false)
  })

  it.each(['/', '/staff/login', '/public/projects', '/dashboard', '/print/receipts/x'])(
    'runs on page %s so each address keeps to its own pages',
    (url) => expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true),
  )

  it.each(['/_next/static/example.js', '/brand/pathways-mark.svg', '/maplibre/style.json'])(
    'skips static file %s',
    (url) => expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false),
  )

  it.each([
    '/workspace',
    '/auth/mfa',
    '/dashboard',
    '/projects/example/activities',
    '/beneficiaries/new',
    '/collection',
    '/analytics',
    '/alerts',
    '/recommendations',
    '/imports',
    '/participants',
    '/reports/preview',
    '/settings/users',
    '/unauthorized',
  ])('checks the session on %s', async (url) => {
    session.mockReset().mockResolvedValue(NextResponse.next())
    await middleware(new NextRequest(`http://127.0.0.1:3000${url}`))
    expect(session).toHaveBeenCalledOnce()
  })

  it.each([
    '/',
    '/staff/login',
    '/auth/access-unavailable',
    '/staff/forgot-password',
    '/auth/recovery/callback',
    '/auth/recovery/complete',
    '/auth/update-password',
    '/public/projects',
    '/dashboards',
  ])('does not check the session on %s', async (url) => {
    session.mockReset()
    const response = await middleware(new NextRequest(`http://127.0.0.1:3000${url}`))
    expect(session).not.toHaveBeenCalled()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it.each(['/', '/staff/login'])('sends the policy and the fixed headers on %s', async (url) => {
    const send = () =>
      middleware(
        new NextRequest(`http://127.0.0.1:3000${url}`, {
          headers: { 'content-security-policy': "script-src 'nonce-planted'" },
        }),
      )
    const [first, second] = [await send(), await send()]
    const policy = first.headers.get('content-security-policy')
    expect(policy).toContain("frame-ancestors 'none'")
    // Only next dev may add eval; a wider condition in the middleware must fail here.
    expect(policy).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/)
    expect(first.headers.get('content-security-policy-report-only')).toBeNull()
    expect(first.headers.get('x-frame-options')).toBe('DENY')
    expect(first.headers.get('x-content-type-options')).toBe('nosniff')
    expect(first.headers.get('referrer-policy')).toBe('no-referrer')
    expect(nonceOf(policy)).toBeTruthy()
    expect(nonceOf(policy)).not.toBe('planted')
    expect(nonceOf(policy)).not.toBe(nonceOf(second.headers.get('content-security-policy')))
    // Next takes the nonce for its own scripts from the request header the middleware forwards.
    expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(policy)
  })

  it('checks the session with the policy on the request', async () => {
    session.mockReset().mockResolvedValue(NextResponse.next())
    const response = await middleware(new NextRequest('http://127.0.0.1:3000/dashboard'))
    const policy = response.headers.get('content-security-policy')
    expect(nonceOf(policy)).toBeTruthy()
    expect(session.mock.calls[0]?.[0].headers.get('content-security-policy')).toBe(policy)
    expect(response.headers.get('x-frame-options')).toBe('DENY')
  })

  it('moves the policy to the report-only header when CSP_MODE says so', async () => {
    vi.stubEnv('CSP_MODE', 'report-only')
    vi.resetModules()
    try {
      const reporting = await import('./middleware')
      const response = await reporting.middleware(
        new NextRequest('http://127.0.0.1:3000/staff/login'),
      )
      expect(response.headers.get('content-security-policy')).toBeNull()
      expect(nonceOf(response.headers.get('content-security-policy-report-only'))).toBeTruthy()
      expect(response.headers.get('x-frame-options')).toBe('DENY')
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })

  it('allows the API address the app really calls, where a local localhost becomes 127.0.0.1', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:4000/api')
    vi.resetModules()
    try {
      const local = await import('./middleware')
      const response = await local.middleware(new NextRequest('http://127.0.0.1:3000/'))
      const policy = response.headers.get('content-security-policy')
      expect(policy).toContain("connect-src 'self' http://127.0.0.1:4000")
      expect(policy).not.toContain('localhost')
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })

  it('keeps each address to its own pages when the split is on', async () => {
    vi.stubEnv('NEXT_PUBLIC_PUBLIC_SITE_BASE_URL', 'https://pathways.example.org')
    vi.stubEnv('NEXT_PUBLIC_STAFF_PORTAL_BASE_URL', 'https://staff.example.org')
    vi.resetModules()
    try {
      const split = await import('./middleware')
      const at = (host: string, url: string) =>
        split.middleware(new NextRequest(`https://${host}${url}`, { headers: { host } }))
      session.mockReset().mockResolvedValue(NextResponse.next())
      const hidden = await at('pathways.example.org', '/dashboard')
      expect(session).not.toHaveBeenCalled()
      expect(hidden.status).toBe(404)
      expect(hidden.body).toBeNull()
      expect(hidden.headers.get('x-frame-options')).toBe('DENY')
      expect(hidden.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
      const moved = await at('staff.example.org', '/')
      expect(moved.status).toBe(307)
      expect(moved.headers.get('x-frame-options')).toBe('DENY')
      expect(moved.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
      expect((await at('pathways.example.org', '/')).headers.get('x-robots-tag')).toBeNull()
      const staff = await at('staff.example.org', '/dashboard')
      expect(session).toHaveBeenCalledOnce()
      expect(staff.headers.get('x-robots-tag')).toBe('noindex, nofollow')
      expect((await at('staff.example.org', '/staff/login')).headers.get('x-robots-tag')).toBe(
        'noindex, nofollow',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
