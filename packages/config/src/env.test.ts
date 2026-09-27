import { describe, expect, it } from 'vitest'

import { readApiEnv, readWebEnv } from './env'

describe('env readers', () => {
  it('applies defaults for web envs', () => {
    const env = readWebEnv({})

    expect(env.WEB_PORT).toBe(3000)
    expect(env.STAFF_PORTAL_BASE_URL).toBe('')
    expect(env.NEXT_PUBLIC_API_BASE_URL).toBe('http://127.0.0.1:4000/api')
  })

  it('applies defaults for api envs', () => {
    const env = readApiEnv({})

    expect(env.API_PORT).toBe(4000)
    expect(env).not.toHaveProperty('DEV_ADMIN_EMAIL')
    expect(env).not.toHaveProperty('DEV_ADMIN_SUPABASE_ID')
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
})
