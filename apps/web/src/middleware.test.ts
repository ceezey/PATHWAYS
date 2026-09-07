import { existsSync } from 'node:fs'
import path from 'node:path'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./lib/middleware', () => ({ updateSession: vi.fn() }))
import { config } from './middleware'

describe('Next.js middleware entry point', () => {
  it('lives next to src/app so Next actually includes it in the build', () => {
    expect(existsSync(path.join(__dirname, 'middleware.ts'))).toBe(true)
    expect(existsSync(path.join(__dirname, 'app'))).toBe(true)
    expect(existsSync(path.join(__dirname, '..', 'middleware.ts'))).toBe(false)
  })

  it.each([
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
  ])('protects %s through the real Next matcher', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true)
  })

  it.each([
    '/staff/login',
    '/staff/forgot-password',
    '/auth/recovery/callback',
    '/auth/recovery/complete',
    '/auth/update-password',
    '/',
    '/public/projects',
    '/_next/static/example.js',
  ])('does not redirect public navigation/assets %s', (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false)
  })
})
