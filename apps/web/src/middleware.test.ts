import { existsSync } from 'node:fs'
import path from 'node:path'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

const session = vi.hoisted(() => vi.fn())
vi.mock('./lib/middleware', () => ({ updateSession: session }))
import { config, middleware } from './middleware'

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
})
