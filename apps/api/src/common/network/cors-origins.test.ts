import { describe, expect, it } from 'vitest'

import { allowedWebOrigins } from './cors-origins'

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
