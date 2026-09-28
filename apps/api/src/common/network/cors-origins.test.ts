import { describe, expect, it } from 'vitest'

import { CORS_PREFLIGHT_MAX_AGE_SECONDS, allowedWebOrigins, corsOptions } from './cors-origins'

describe('API browser origin allowlist', () => {
  it('allows the exact deployed web origin alongside local development', () => {
    expect(allowedWebOrigins('https://pathways-web.vercel.app')).toEqual([
      'http://127.0.0.1:3000',
      'http://localhost:3000',
      'https://pathways-web.vercel.app',
    ])
  })

  it.each([
    'http://pathways-web.vercel.app',
    'https://pathways-web.vercel.app/other',
    'https://pathways-web.vercel.app?x=1',
    'https://user:password@pathways-web.vercel.app',
    'https://*.vercel.app',
  ])('rejects an unsafe deployed web origin (%s)', (candidate) => {
    expect(() => allowedWebOrigins(candidate)).toThrow()
  })
})

describe('API CORS options', () => {
  it('caches CORS preflight responses for the browser-max duration', () => {
    const options = corsOptions('https://pathways-web.vercel.app')
    expect(options.maxAge).toBe(CORS_PREFLIGHT_MAX_AGE_SECONDS)
    expect(options.maxAge).toBe(86400)
  })

  it('does not widen the allowed origins, methods, or headers', () => {
    const options = corsOptions('https://pathways-web.vercel.app')
    expect(options.origin).toEqual([
      'http://127.0.0.1:3000',
      'http://localhost:3000',
      'https://pathways-web.vercel.app',
    ])
    expect(options.credentials).toBe(false)
    expect(options.methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'])
    expect(options.allowedHeaders).toEqual([
      'Authorization',
      'Content-Type',
      'X-Pathways-Organization-Id',
      'X-Pathways-User-Id',
    ])
  })
})
