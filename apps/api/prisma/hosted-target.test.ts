// @ts-nocheck -- exercises the plain .mjs guard module directly (no .d.ts); tsc cannot type
// resolve it since apps/api does not enable allowJs, but vitest runs it correctly at runtime.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  ALLOWED_PROJECT_REF,
  ALLOWED_SUPABASE_URL,
  assertSeedTarget,
  resolveEnvFilePath,
} from '../../../scripts/db/hosted-target.mjs'

const repoRoot = path.resolve(__dirname, '..', '..', '..')
const repoTmpDir = path.join(repoRoot, '.tmp')

const hostedEnv = {
  SUPABASE_URL: ALLOWED_SUPABASE_URL,
  DATABASE_URL: `postgresql://pathways_runtime:x@db.${ALLOWED_PROJECT_REF}.supabase.co:5432/postgres`,
  DIRECT_URL: `postgresql://prisma:x@db.${ALLOWED_PROJECT_REF}.supabase.co:5432/postgres`,
}

describe('hosted seed target guard', () => {
  it('accepts exactly the allowed hosted project', () => {
    expect(assertSeedTarget(hostedEnv, { testLocal: false })).toEqual({
      mode: 'hosted',
      projectRef: ALLOWED_PROJECT_REF,
    })
  })

  it('refuses a wrong project ref in the database URLs', () => {
    expect(() =>
      assertSeedTarget(
        {
          ...hostedEnv,
          DATABASE_URL: 'postgresql://pathways_runtime:x@db.someotherref.supabase.co:5432/postgres',
        },
        { testLocal: false },
      ),
    ).toThrow('DATABASE_URL must reference the allowed project ref')

    expect(() =>
      assertSeedTarget(
        {
          ...hostedEnv,
          DIRECT_URL: 'postgresql://prisma:x@db.someotherref.supabase.co:5432/postgres',
        },
        { testLocal: false },
      ),
    ).toThrow('DIRECT_URL must reference the allowed project ref')
  })

  it('refuses a wrong SUPABASE_URL even when it looks similar', () => {
    for (const url of [
      'https://klbtoqdalmcsfjqophty.supabase.co/',
      'https://klbtoqdalmcsfjqophty.supabase.co:443',
      'http://klbtoqdalmcsfjqophty.supabase.co',
      'https://evil.example.com',
      'https://pdqwsknbzkdtiwjjibqt.supabase.co',
    ]) {
      expect(() =>
        assertSeedTarget({ ...hostedEnv, SUPABASE_URL: url }, { testLocal: false }),
      ).toThrow('SUPABASE_URL must equal exactly')
    }
  })

  it('refuses a hosted run that targets a loopback host', () => {
    expect(() =>
      assertSeedTarget(
        { ...hostedEnv, DATABASE_URL: 'postgresql://pathways_runtime:x@127.0.0.1:5432/postgres' },
        { testLocal: false },
      ),
    ).toThrow()
  })

  it('requires every URL and refuses a partial env', () => {
    expect(() => assertSeedTarget({}, { testLocal: false })).toThrow('SUPABASE_URL is required')
    expect(() =>
      assertSeedTarget({ SUPABASE_URL: ALLOWED_SUPABASE_URL }, { testLocal: false }),
    ).toThrow('DATABASE_URL is required')
  })

  it('--test-local accepts only an all-loopback target', () => {
    const loopback = {
      SUPABASE_URL: 'http://127.0.0.1:54321',
      DATABASE_URL: 'postgresql://pathways_runtime:x@127.0.0.1:54322/postgres',
      DIRECT_URL: 'postgresql://prisma:x@127.0.0.1:54322/postgres',
    }
    expect(assertSeedTarget(loopback, { testLocal: true })).toEqual({ mode: 'test-local' })
  })

  it('--test-local is structurally impossible to use with any hosted-looking URL', () => {
    const loopback = {
      SUPABASE_URL: 'http://127.0.0.1:54321',
      DATABASE_URL: 'postgresql://pathways_runtime:x@127.0.0.1:54322/postgres',
      DIRECT_URL: 'postgresql://prisma:x@127.0.0.1:54322/postgres',
    }
    // Every field individually made non-loopback must fail, even the real hosted project.
    expect(() =>
      assertSeedTarget({ ...loopback, SUPABASE_URL: ALLOWED_SUPABASE_URL }, { testLocal: true }),
    ).toThrow('--test-local requires every URL')
    expect(() =>
      assertSeedTarget({ ...loopback, DATABASE_URL: hostedEnv.DATABASE_URL }, { testLocal: true }),
    ).toThrow('--test-local requires every URL')
    expect(() =>
      assertSeedTarget({ ...loopback, DIRECT_URL: hostedEnv.DIRECT_URL }, { testLocal: true }),
    ).toThrow('--test-local requires every URL')
    // And the hosted env, run with --test-local, must also fail (never silently downgrades).
    expect(() => assertSeedTarget(hostedEnv, { testLocal: true })).toThrow(
      '--test-local requires every URL',
    )
  })
})

describe('hosted seed env-file location guard', () => {
  it('accepts a file under .tmp/', () => {
    mkdirSync(repoTmpDir, { recursive: true })
    const dir = mkdtempSync(path.join(repoTmpDir, 'hosted-seed-test-'))
    try {
      const file = path.join(dir, 'seed.env')
      writeFileSync(file, 'X=1\n')
      expect(() => resolveEnvFilePath(file)).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('accepts a file entirely outside the repository', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pathways-hosted-seed-test-'))
    try {
      const file = path.join(dir, 'seed.env')
      writeFileSync(file, 'X=1\n')
      expect(() => resolveEnvFilePath(file)).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses a file inside the tracked repository tree (outside .tmp/)', () => {
    const file = path.join(repoRoot, 'apps', 'api', 'prisma', '__hosted-seed-guard-test.env')
    try {
      writeFileSync(file, 'X=1\n')
      expect(() => resolveEnvFilePath(file)).toThrow('must be under .tmp/')
    } finally {
      rmSync(file, { force: true })
    }
  })

  it('requires --env-file to be supplied', () => {
    expect(() => resolveEnvFilePath(undefined)).toThrow('--env-file <path> is required')
  })

  it('requires the file to exist', () => {
    expect(() => resolveEnvFilePath(path.join(repoTmpDir, 'does-not-exist.env'))).toThrow(
      'Env file not found',
    )
  })
})
