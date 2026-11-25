import { describe, expect, it } from 'vitest'

import { buildCsp, securityHeaders } from './csp'

const origins = {
  api: 'https://api.example.org',
  supabase: 'https://abc.supabase.co',
  tiles: ['https://tiles.example.org'],
  extraConnect: ['https://errors.example.org'],
  extraFrame: ['https://challenges.example.org'],
  extraScript: ['https://challenges.example.org'],
}
const directive = (csp: string, name: string) =>
  csp.split('; ').find((part) => part.startsWith(`${name} `)) ?? ''

describe('buildCsp', () => {
  it('locks framing, plugins and scripts', () => {
    const csp = buildCsp('abc123', origins)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(directive(csp, 'script-src')).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic' https://challenges.example.org",
    )
    expect(directive(csp, 'script-src')).not.toMatch(/unsafe-inline|unsafe-eval/)
  })

  it('lists every origin it is given', () => {
    const csp = buildCsp('n', origins)
    expect(directive(csp, 'connect-src')).toBe(
      "connect-src 'self' https://api.example.org https://abc.supabase.co wss://abc.supabase.co https://tiles.example.org https://errors.example.org",
    )
    expect(directive(csp, 'img-src')).toBe(
      "img-src 'self' data: blob: https://api.example.org https://abc.supabase.co https://tiles.example.org",
    )
    expect(directive(csp, 'media-src')).toBe(
      "media-src 'self' blob: https://api.example.org https://abc.supabase.co",
    )
    expect(directive(csp, 'frame-src')).toBe('frame-src blob: https://challenges.example.org')
  })

  it('keeps only the blob preview frame and drops empty origins', () => {
    const csp = buildCsp('n', {
      api: '',
      supabase: '',
      tiles: [''],
      extraConnect: [],
      extraFrame: [],
      extraScript: [],
    })
    expect(directive(csp, 'frame-src')).toBe('frame-src blob:')
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self'")
    expect(csp).not.toMatch(/ {2}|undefined| ;/)
  })

  it('uses ws for a local http Supabase', () => {
    const csp = buildCsp('n', { ...origins, supabase: 'http://127.0.0.1:54321' })
    expect(directive(csp, 'connect-src')).toContain('http://127.0.0.1:54321 ws://127.0.0.1:54321')
  })
})

it('fixes the three headers every response carries', () => {
  expect(securityHeaders).toEqual([
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
  ])
})
