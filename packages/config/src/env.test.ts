import { describe, expect, it } from 'vitest'

import { readApiEnv, readWebEnv } from './env'

describe('env readers', () => {
  it('applies defaults for web envs', () => {
    const env = readWebEnv({})

    expect(env.WEB_PORT).toBe(3000)
    expect(env.STAFF_PORTAL_BASE_URL).toBe('')
    expect(env.NEXT_PUBLIC_API_BASE_URL).toBe('http://127.0.0.1:4000/api')
  })

  it('enforces the content security policy unless report-only is spelled exactly', () => {
    expect(readWebEnv({}).CSP_MODE).toBe('enforce')
    expect(readWebEnv({ CSP_MODE: 'report-only' }).CSP_MODE).toBe('report-only')
    expect(readWebEnv({ CSP_MODE: 'report_only' }).CSP_MODE).toBe('enforce')
  })

  it('applies defaults for api envs', () => {
    const env = readApiEnv({})

    expect(env.API_PORT).toBe(4000)
    expect(env.ENABLE_SWAGGER).toBe(false)
    expect(readApiEnv({ ENABLE_SWAGGER: 'true' }).ENABLE_SWAGGER).toBe(true)
    expect(env).not.toHaveProperty('DEV_ADMIN_EMAIL')
    expect(env).not.toHaveProperty('DEV_ADMIN_SUPABASE_ID')
  })

  it('bounds the per-file evidence limit between 1 MiB and 100 MiB with a 50 MiB default', () => {
    expect(readApiEnv({}).EVIDENCE_MAX_FILE_BYTES).toBe(52_428_800)
    expect(readApiEnv({ EVIDENCE_MAX_FILE_BYTES: '50000000' }).EVIDENCE_MAX_FILE_BYTES).toBe(
      50_000_000,
    )
    expect(readApiEnv({ EVIDENCE_MAX_FILE_BYTES: '104857600' }).EVIDENCE_MAX_FILE_BYTES).toBe(
      104_857_600,
    )
    for (const value of ['104857601', '1048575', '0', '-1', '5e7', '50.5', ' 52428800', 'x'])
      expect(() => readApiEnv({ EVIDENCE_MAX_FILE_BYTES: value })).toThrow()
  })

  it('does not expose retired developer-only workspace gates', () => {
    const retiredGate = 'synthetic-retired-configuration'
    expect(readWebEnv({ PATHWAYS_DEVELOPER_WORKSPACE_CANDIDATES: retiredGate })).not.toHaveProperty(
      'PATHWAYS_DEVELOPER_WORKSPACE_CANDIDATES',
    )
    expect(readApiEnv({ PATHWAYS_DEVELOPER_WORKSPACE_CANDIDATES: retiredGate })).not.toHaveProperty(
      'PATHWAYS_DEVELOPER_WORKSPACE_CANDIDATES',
    )
  })
})

const machine = {
  RULES_WORKER_ENABLED: 'true',
  RULES_DRAIN_TOKEN: 'a'.repeat(64),
  RULES_SWEEP_TOKEN: 'b'.repeat(64),
  RULES_WORKER_DATABASE_URL: 'postgresql://pathways_rules_worker@127.0.0.1/local',
  RULES_SWEEPER_DATABASE_URL: 'postgresql://pathways_rules_sweeper@127.0.0.1/local',
  RULES_RUNTIME_VERIFIED_MS: '30000',
  RULES_PERIODIC_DRAIN_VERIFIED: 'true',
}
describe('server-only machine readiness configuration', () => {
  it('defaults disabled and never includes machine keys in web output', () => {
    expect(readApiEnv({}).RULES_WORKER_ENABLED).toBe(false)
    const web = readWebEnv(machine)
    for (const key of Object.keys(machine)) expect(web).not.toHaveProperty(key)
    expect(
      readApiEnv({ RULES_WORKER_DATABASE_URL: 'invalid', RULES_DRAIN_TOKEN: 'invalid' })
        .RULES_WORKER_ENABLED,
    ).toBe(false)
  })
  it('accepts exact distinct purpose credentials and dedicated local principals with reviewed readiness', () => {
    expect(readApiEnv(machine).RULES_WORKER_ENABLED).toBe(true)
  })
  it.each([
    { RULES_SWEEP_TOKEN: 'a'.repeat(64) },
    { RULES_DRAIN_TOKEN: 'A'.repeat(64) },
    { RULES_RUNTIME_VERIFIED_MS: '29999' },
    { RULES_PERIODIC_DRAIN_VERIFIED: 'false' },
    { BUSINESS_TIME_ZONE: 'UTC' },
    { RULES_WORKER_DATABASE_URL: 'postgresql://postgres@127.0.0.1/local' },
    { RULES_SWEEPER_DATABASE_URL: 'postgresql://pathways_rules_sweeper@127.0.0.1/other' },
    {
      RULES_WORKER_DATABASE_URL:
        'postgresql://pathways_rules_worker:synthetic@remote.invalid/local',
    },
  ])(
    'rejects unsafe or unverified enabled configuration%j without reflecting supplied secrets',
    (change) => {
      const result = readApiEnv
      expect(() => result({ ...machine, ...change })).toThrow()
    },
  )
  it('accepts matching remote TLS-required dedicated logins', () => {
    expect(
      readApiEnv({
        ...machine,
        RULES_WORKER_DATABASE_URL:
          'postgresql://pathways_rules_worker:synthetic-worker@db.example.invalid/local?sslmode=require',
        RULES_SWEEPER_DATABASE_URL:
          'postgresql://pathways_rules_sweeper:synthetic-sweeper@db.example.invalid/local?sslmode=require',
      }).RULES_WORKER_ENABLED,
    ).toBe(true)
  })
  it('accepts pooler logins with a project ref and rejects a wrong role or malformed ref', () => {
    const ref = 'abcdefghijklmnopqrst'
    const remote = (user: string) =>
      `postgresql://${user}:synthetic@db.example.invalid/local?sslmode=require`
    const pooled = {
      ...machine,
      RULES_WORKER_DATABASE_URL: remote(`pathways_rules_worker.${ref}`),
      RULES_SWEEPER_DATABASE_URL: remote(`pathways_rules_sweeper.${ref}`),
    }
    expect(readApiEnv(pooled).RULES_WORKER_ENABLED).toBe(true)
    for (const user of [
      `pathways_rules_sweeper.${ref}`,
      `pathways_rules_worker.${ref}x`,
      `pathways_rules_worker.${ref.slice(1)}`,
      `pathways_rules_worker.${ref.toUpperCase()}`,
      `pathways_rules_worker_x.${ref}`,
    ])
      expect(() => readApiEnv({ ...pooled, RULES_WORKER_DATABASE_URL: remote(user) })).toThrow()
  })
})

describe('backup settings', () => {
  const jobUrl = 'postgresql://pathways_backup_job@127.0.0.1/local'

  it('defaults backups to manifest mode with the job route off', () => {
    expect(readApiEnv({})).toMatchObject({ BACKUP_FILE_MODE: 'manifest', BACKUP_JOB_TOKEN: '' })
    expect(readApiEnv({ BACKUP_FILE_MODE: 'copy' }).BACKUP_FILE_MODE).toBe('copy')
    expect(() => readApiEnv({ BACKUP_FILE_MODE: 'full' })).toThrow()
  })

  it('requires a distinct 64-hex backup job token when one is set', () => {
    expect(
      readApiEnv({ BACKUP_JOB_TOKEN: 'b'.repeat(64), BACKUP_JOB_DATABASE_URL: jobUrl })
        .BACKUP_JOB_TOKEN,
    ).toBe('b'.repeat(64))
    for (const value of ['B'.repeat(64), 'b'.repeat(63), 'not-a-token'])
      expect(() =>
        readApiEnv({ BACKUP_JOB_TOKEN: value, BACKUP_JOB_DATABASE_URL: jobUrl }),
      ).toThrow('backup job credential')
    for (const key of ['RULES_DRAIN_TOKEN', 'RULES_SWEEP_TOKEN'])
      expect(() =>
        readApiEnv({
          BACKUP_JOB_TOKEN: 'a'.repeat(64),
          BACKUP_JOB_DATABASE_URL: jobUrl,
          [key]: 'a'.repeat(64),
        }),
      ).toThrow('backup job credential')
  })

  it('requires the dedicated backup job login together with the token', () => {
    expect(readApiEnv({}).BACKUP_JOB_DATABASE_URL).toBe('')
    expect(() => readApiEnv({ BACKUP_JOB_TOKEN: 'b'.repeat(64) })).toThrow('backup job credential')
    expect(() => readApiEnv({ BACKUP_JOB_DATABASE_URL: jobUrl })).toThrow('backup job credential')
    for (const url of [
      'postgresql://pathways_runtime@127.0.0.1/local',
      'postgresql://pathways_backup_job@db.example.com/postgres',
      'invalid',
    ])
      expect(() =>
        readApiEnv({ BACKUP_JOB_TOKEN: 'b'.repeat(64), BACKUP_JOB_DATABASE_URL: url }),
      ).toThrow('backup job database')
  })
})

describe('public visitor token', () => {
  it('is optional, so the public analytics limit is off when it is empty', () => {
    expect(readApiEnv({}).VISITOR_FORWARD_TOKEN).toBe('')
    expect(readWebEnv({}).VISITOR_FORWARD_TOKEN).toBe('')
  })

  it('must be 64 lowercase hex and distinct from the other tokens', () => {
    expect(readApiEnv({ VISITOR_FORWARD_TOKEN: 'e'.repeat(64) }).VISITOR_FORWARD_TOKEN).toBe(
      'e'.repeat(64),
    )
    for (const value of ['E'.repeat(64), 'e'.repeat(63), 'not-a-token'])
      expect(() => readApiEnv({ VISITOR_FORWARD_TOKEN: value })).toThrow('visitor forwarding')
    for (const key of ['RULES_DRAIN_TOKEN', 'RULES_SWEEP_TOKEN'])
      expect(() =>
        readApiEnv({ VISITOR_FORWARD_TOKEN: 'e'.repeat(64), [key]: 'e'.repeat(64) }),
      ).toThrow('visitor forwarding')
    expect(() =>
      readApiEnv({
        VISITOR_FORWARD_TOKEN: 'e'.repeat(64),
        BACKUP_JOB_TOKEN: 'e'.repeat(64),
        BACKUP_JOB_DATABASE_URL: 'postgresql://pathways_backup_job@127.0.0.1/local',
      }),
    ).toThrow('visitor forwarding')
  })
})
