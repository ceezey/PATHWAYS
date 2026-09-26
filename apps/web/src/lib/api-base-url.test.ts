import { describe, expect, it } from 'vitest'

import { approvedApiBaseUrl } from './api-base-url'

describe('approved API destinations', () => {
  it('keeps local development on IPv4 loopback', () => {
    expect(approvedApiBaseUrl('http://localhost:4000/api', 'http://127.0.0.1:4000/api').host).toBe(
      '127.0.0.1:4000',
    )
  })

  it('accepts only the configured HTTPS API origin and path for deployment', () => {
    const trusted = 'https://pathways-api.vercel.app/api'
    expect(approvedApiBaseUrl(trusted, trusted).toString()).toBe(trusted)
    for (const candidate of [
      'http://pathways-api.vercel.app/api',
      'https://pathways-api.vercel.app.evil.example/api',
      'https://pathways-api.vercel.app/other',
      'https://pathways-api.vercel.app/api?token=secret',
      'https://user:password@pathways-api.vercel.app/api',
      'http://127.0.0.1:4000/api',
    ]) {
      expect(() => approvedApiBaseUrl(candidate, trusted)).toThrow()
    }
  })
})
