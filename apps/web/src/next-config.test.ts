import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from 'next/constants'
import { describe, expect, it, vi } from 'vitest'

import createNextConfig, {
  getWebBuildDirectory,
  passwordRecoveryResponseHeaders,
  privateAuthSurfacePaths,
  publicSiteHostname,
  sensitiveIncomingRequestPaths,
} from '../next.config'

describe('Next build-directory isolation', () => {
  it('omits authentication and private route-check URLs from request logs', () => {
    for (const pathname of [
      '/staff/login?code=synthetic-private-detail',
      '/staff/forgot-password?email=synthetic-private-detail',
      '/auth/mfa?code=synthetic-private-detail',
      '/auth/update-password',
      '/api/access/route-check?projectId=synthetic-private-detail',
    ]) {
      expect(sensitiveIncomingRequestPaths.some((pattern) => pattern.test(pathname))).toBe(true)
    }
  })
  it('omits internal route identifiers from incoming request logs', () => {
    for (const pathname of [
      '/projects/synthetic-private-id',
      '/beneficiaries/synthetic-private-id',
      '/reports/preview?kind=beneficiary-summary',
      '/dashboard',
      '/settings/users',
      '/collection/import',
    ]) {
      expect(sensitiveIncomingRequestPaths.some((pattern) => pattern.test(pathname))).toBe(true)
    }
  })
  it('preserves loopback middleware redirects through the Next response adapter', () => {
    expect(createNextConfig(PHASE_DEVELOPMENT_SERVER).skipMiddlewareUrlNormalize).toBe(true)
    expect(createNextConfig(PHASE_PRODUCTION_BUILD).skipMiddlewareUrlNormalize).toBe(true)
  })
  it('redirects the retired collection entry route before middleware gating', async () => {
    const redirects = (await createNextConfig(PHASE_PRODUCTION_BUILD).redirects?.()) ?? []
    expect(redirects).toContainEqual({
      source: '/collection/entry',
      destination: '/collection',
      permanent: true,
    })
  })
  it('keeps staff redirects and headers off the public address when the split is on', async () => {
    expect(publicSiteHostname({})).toBe('')
    expect(publicSiteHostname({ NEXT_PUBLIC_PUBLIC_SITE_BASE_URL: 'https://a.org' })).toBe('')
    // Next host conditions ignore the port, so addresses that differ only by port are not split.
    expect(
      publicSiteHostname({
        NEXT_PUBLIC_PUBLIC_SITE_BASE_URL: 'https://a.org:8443',
        NEXT_PUBLIC_STAFF_PORTAL_BASE_URL: 'https://a.org',
      }),
    ).toBe('')
    vi.stubEnv('NEXT_PUBLIC_PUBLIC_SITE_BASE_URL', 'https://pathways.example.org')
    vi.stubEnv('NEXT_PUBLIC_STAFF_PORTAL_BASE_URL', 'https://staff.example.org')
    try {
      const config = createNextConfig(PHASE_PRODUCTION_BUILD)
      const missing = [{ type: 'host', value: 'pathways\\.example\\.org\\.?' }]
      expect(await config.redirects?.()).toContainEqual({
        source: '/login',
        destination: '/staff/login',
        permanent: false,
        missing,
      })
      const headers = (await config.headers?.()) ?? []
      expect(headers).toHaveLength(privateAuthSurfacePaths.length)
      for (const rule of headers) expect(rule.missing).toEqual(missing)
    } finally {
      vi.unstubAllEnvs()
    }
  })
  it('keeps development artifacts separate from build and start artifacts', () => {
    expect(getWebBuildDirectory(PHASE_DEVELOPMENT_SERVER)).toBe('.next-dev')
    expect(getWebBuildDirectory(PHASE_PRODUCTION_BUILD)).toBe('.next')
    expect(getWebBuildDirectory(PHASE_PRODUCTION_SERVER)).toBe('.next')

    expect(createNextConfig(PHASE_DEVELOPMENT_SERVER).distDir).toBe('.next-dev')
    expect(createNextConfig(PHASE_PRODUCTION_BUILD).distDir).toBe('.next')
  })

  it('keeps password-recovery callback credentials out of development request logs', () => {
    const logging = createNextConfig(PHASE_DEVELOPMENT_SERVER).logging
    expect(logging).not.toBe(false)
    if (!logging) throw new Error('Expected recovery-safe Next.js logging configuration.')
    expect(sensitiveIncomingRequestPaths[0].test('/auth/recovery/callback?code=test-only')).toBe(
      true,
    )
    expect(sensitiveIncomingRequestPaths[0].test('/staff/login')).toBe(false)
    expect(logging.incomingRequests).toEqual({
      ignore: sensitiveIncomingRequestPaths,
    })
  })

  it('marks password login and recovery surfaces private and non-referring', async () => {
    const headers = await createNextConfig(PHASE_DEVELOPMENT_SERVER).headers?.()
    expect(headers).toEqual(
      privateAuthSurfacePaths.map((source) => ({
        source,
        headers: passwordRecoveryResponseHeaders,
      })),
    )
    expect(privateAuthSurfacePaths).toContain('/staff/login')
    expect(privateAuthSurfacePaths).toContain('/auth/mfa')
    expect(privateAuthSurfacePaths).toContain('/auth/access-unavailable')
    expect(privateAuthSurfacePaths).not.toContain('/auth/otp/:path*')
    expect(passwordRecoveryResponseHeaders).toContainEqual({
      key: 'Cache-Control',
      value: 'private, no-store, max-age=0',
    })
    expect(passwordRecoveryResponseHeaders).toContainEqual({
      key: 'Referrer-Policy',
      value: 'no-referrer',
    })
  })
})
