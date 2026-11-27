import { isAbsolute } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { verifiedDatabaseUrl } from './database-tls'

const hosted = 'postgresql://u.ref:pw@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'

describe('verifiedDatabaseUrl', () => {
  it('adds strict verification against the shipped CA for a hosted host', () => {
    const url = new URL(verifiedDatabaseUrl(`${hosted}?sslmode=require`))
    expect(url.searchParams.get('sslmode')).toBe('require')
    expect(url.searchParams.get('sslaccept')).toBe('strict')
    const cert = url.searchParams.get('sslcert') ?? ''
    expect(isAbsolute(cert)).toBe(true)
    expect(cert.endsWith('supabase-root-2021-ca.crt')).toBe(true)
  })

  it('forces sslmode=require so a missing or weaker mode cannot allow plaintext', () => {
    for (const query of ['', '?sslmode=prefer']) {
      expect(new URL(verifiedDatabaseUrl(`${hosted}${query}`)).searchParams.get('sslmode')).toBe(
        'require',
      )
    }
  })

  it('keeps existing parameters and replaces a weaker sslaccept', () => {
    const url = new URL(
      verifiedDatabaseUrl(
        `${hosted}?sslmode=require&connection_limit=1&sslaccept=accept_invalid_certs`,
      ),
    )
    expect(url.searchParams.get('connection_limit')).toBe('1')
    expect(url.searchParams.getAll('sslaccept')).toEqual(['strict'])
  })

  it.each([
    'postgresql://postgres@127.0.0.1:5432/db?sslmode=disable',
    'postgresql://postgres@localhost/db',
    'postgresql://postgres@[::1]:5432/db',
  ])('leaves a local URL unchanged: %s', (local) => {
    expect(verifiedDatabaseUrl(local)).toBe(local)
  })

  it('fails closed when the CA file is missing', async () => {
    vi.resetModules()
    vi.doMock('node:fs', async (original) => ({
      ...(await original<typeof import('node:fs')>()),
      existsSync: () => false,
    }))
    const { verifiedDatabaseUrl: withoutCa } = await import('./database-tls.js')
    expect(() => withoutCa(hosted)).toThrow('Database CA certificate is missing')
    expect(withoutCa('postgresql://postgres@127.0.0.1/db')).toBe(
      'postgresql://postgres@127.0.0.1/db',
    )
    vi.doUnmock('node:fs')
  })
})
