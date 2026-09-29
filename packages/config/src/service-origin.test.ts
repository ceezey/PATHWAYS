import { describe, expect, it } from 'vitest'

import { isApprovedServiceProtocol } from './service-origin'

describe('Supabase service origin protocol', () => {
  it('accepts HTTPS everywhere', () => {
    expect(isApprovedServiceProtocol(new URL('https://example.supabase.co'), 'production')).toBe(
      true,
    )
    expect(isApprovedServiceProtocol(new URL('https://127.0.0.1:54321'), 'development')).toBe(true)
  })

  it('accepts plain HTTP only on loopback outside production', () => {
    for (const origin of [
      'http://127.0.0.1:54321',
      'http://localhost:54321',
      'http://[::1]:54321',
    ]) {
      expect(isApprovedServiceProtocol(new URL(origin), 'development')).toBe(true)
      expect(isApprovedServiceProtocol(new URL(origin), undefined)).toBe(true)
      expect(isApprovedServiceProtocol(new URL(origin), 'production')).toBe(false)
    }
  })

  it('rejects remote or disguised plain-HTTP origins', () => {
    for (const origin of [
      'http://example.supabase.co',
      'http://127.0.0.1.nip.io:54321',
      'http://localhost.example.com',
      'http://10.0.0.5:54321',
      'ftp://127.0.0.1',
    ]) {
      expect(isApprovedServiceProtocol(new URL(origin), 'development')).toBe(false)
    }
  })
})
