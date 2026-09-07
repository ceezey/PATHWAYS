import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from 'next/constants'
import { describe, expect, it } from 'vitest'

import createNextConfig, {
  getWebBuildDirectory,
  passwordRecoveryResponseHeaders,
  sensitiveIncomingRequestPaths,
} from '../next.config'

describe('Next build-directory isolation', () => {
  it('preserves loopback middleware redirects through the Next response adapter', () => {
    expect(createNextConfig(PHASE_DEVELOPMENT_SERVER).skipMiddlewareUrlNormalize).toBe(true)
    expect(createNextConfig(PHASE_PRODUCTION_BUILD).skipMiddlewareUrlNormalize).toBe(true)
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

  it('marks only password-recovery surfaces private and non-referring', async () => {
    const headers = await createNextConfig(PHASE_DEVELOPMENT_SERVER).headers?.()
    expect(headers).toEqual(
      ['/staff/forgot-password', '/auth/update-password', '/auth/recovery/:path*'].map(
        (source) => ({ source, headers: passwordRecoveryResponseHeaders }),
      ),
    )
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
