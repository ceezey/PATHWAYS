import { describe, expect, it } from 'vitest'

import { assertLoopback } from './local-synthetic-seed'

describe('local synthetic seed target guard', () => {
  it('accepts only loopback database and Supabase targets', () => {
    for (const value of [
      'postgresql://prisma:x@127.0.0.1:54322/postgres',
      'postgresql://prisma:x@localhost:54322/postgres',
      'postgresql://prisma:x@[::1]:54322/postgres',
      'http://127.0.0.1:54321',
    ]) {
      expect(() => assertLoopback('TARGET', value)).not.toThrow()
    }
  })

  it('refuses hosted, remote, disguised or missing targets', () => {
    for (const value of [
      'postgresql://prisma:x@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres',
      'https://pdqwsknbzkdtiwjjibqt.supabase.co',
      'postgresql://prisma:x@127.0.0.1.nip.io:54322/postgres',
      'http://localhost.example.com:54321',
      'postgresql://prisma:x@10.0.0.5:54322/postgres',
    ]) {
      expect(() => assertLoopback('TARGET', value)).toThrow(
        'must point at the local Supabase instance',
      )
    }
    expect(() => assertLoopback('TARGET', undefined)).toThrow('TARGET is required.')
    expect(() => assertLoopback('TARGET', '')).toThrow('TARGET is required.')
  })
})
