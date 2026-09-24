import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACCESS_UNAVAILABLE_PATH, providerFailureStatus } from './access-recovery'

const source = (file: string) => readFileSync(path.resolve(__dirname, '../..', file), 'utf8')
describe('auth navigation failure and wiring contracts', () => {
  it.each([undefined, new Error('private'), { status: 429 }, { status: 500 }, { status: 503 }])(
    'does not infer logout from unavailable or unknown provider failures %#',
    (error) => {
      expect(providerFailureStatus(error)).toBe(503)
    },
  )
  it.each([
    { status: 401 },
    { status: 403 },
    { code: 'refresh_token_not_found' },
    { code: 'session_not_found' },
  ])('classifies explicit authentication rejection %#', (error) =>
    expect(providerFailureStatus(error)).toBe(401),
  )
  it('does not evaluate private provider accessors', () => {
    const error = Object.defineProperty({}, 'status', {
      get: () => {
        throw new Error('never evaluate')
      },
    })
    expect(providerFailureStatus(error)).toBe(503)
  })
  it('keeps the application shell outside the content guard without a duplicate layout RPC', () => {
    const layout = source('app/(dashboard)/layout.tsx')
    expect(layout).not.toContain('await requireServerRoute')
    expect(layout).toMatch(/<AppShell>\s*<ProtectedRoute>/)
  })
  it('keeps recovery free of domain data, arbitrary destinations and automatic redirects', () => {
    expect(ACCESS_UNAVAILABLE_PATH).toBe('/auth/access-unavailable')
    const recovery = source('features/auth/access-recovery.tsx')
    expect(recovery).toContain('href="/workspace"')
    expect(recovery).not.toMatch(/pathwaysClient|useEffect|searchParams|localStorage/)
  })
  it('retains a native user-initiated MFA retry and only action-specific MFA status requests', () => {
    const form = source('features/auth/mfa-form.tsx')
    expect(form).toContain('<a href="/workspace">Retry opening workspace</a>')
    expect(form.match(/'\/auth\/mfa\/status'/g)).toHaveLength(2)
    expect(form).not.toMatch(/window\.location\.(?:replace|assign)/)
  })
  it('keeps route denials out of workspace-cookie mutation and retains the route API', () => {
    const guard = source('components/layout/route-access-guard.tsx')
    expect(guard).not.toContain('clearWorkspaceContext')
    expect(guard).not.toContain('setInterval')
    expect(guard).toContain('requestRouteCheck(')
    expect(guard).toContain('verificationRevision')
  })
  it('revalidates only on trust-boundary recovery without interaction or idle polling', () => {
    const provider = source('providers/current-role-provider.tsx')
    expect(provider).not.toContain('setInterval')
    expect(provider).not.toContain("window.addEventListener('focus'")
    expect(provider).not.toContain("document.addEventListener('visibilitychange'")
    expect(provider).not.toContain("window.addEventListener('pagehide'")
    expect(provider).toContain("window.addEventListener('online', revalidateAfterReconnect)")
    expect(provider).toContain("window.addEventListener('pageshow', revalidateRestoredPage)")
    expect(provider).toContain('event.persisted')
  })
})
