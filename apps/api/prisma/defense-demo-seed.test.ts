import { describe, expect, it, vi } from 'vitest'

import { schedulerDrain } from './defense-demo-drain'
import { prepareStorage } from './defense-demo-seed'
import { type StaffRow, maskEmail, resolveStaff } from './defense-demo-staff'
import { assertDefenseTarget } from './defense-demo-target'

const REF = 'klbtoqdalmcsfjqophty'
const hosted = () => ({
  SUPABASE_URL: `https://${REF}.supabase.co`,
  DATABASE_URL: `postgresql://pathways_runtime:x@db.${REF}.supabase.co:5432/postgres`,
  DIRECT_URL: `postgresql://prisma:x@db.${REF}.supabase.co:5432/postgres`,
  SUPABASE_SERVICE_ROLE_KEY: 'k',
})

// The hosted guard reads process.env, so each case stubs the whole target.
function check(env: Record<string, string>, testLocal: boolean) {
  for (const key of [
    'SUPABASE_SERVICE_ROLE_KEY',
    'RULES_WORKER_DATABASE_URL',
    'RULES_SWEEPER_DATABASE_URL',
  ])
    vi.stubEnv(key, '')
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  try {
    assertDefenseTarget(testLocal)
  } finally {
    vi.unstubAllEnvs()
  }
}

describe('defense demo target', () => {
  it('accepts exactly devV2 and refuses other projects or users', () => {
    expect(() => check(hosted() as never, false)).not.toThrow()
    expect(() =>
      check({ ...hosted(), SUPABASE_URL: 'https://other.supabase.co' } as never, false),
    ).toThrow('SUPABASE_URL')
    expect(() =>
      check(
        {
          ...hosted(),
          DIRECT_URL: `postgresql://postgres:x@db.${REF}.supabase.co:5432/postgres`,
        } as never,
        false,
      ),
    ).toThrow('DIRECT_URL')
    expect(() =>
      check(
        {
          ...hosted(),
          DATABASE_URL: `postgresql://prisma:x@db.${REF}.supabase.co:5432/postgres`,
        } as never,
        false,
      ),
    ).toThrow('DATABASE_URL')
  })

  it('refuses a rules URL outside devV2 and a missing service key', () => {
    expect(() =>
      check(
        { ...hosted(), RULES_WORKER_DATABASE_URL: 'postgresql://w:x@evil.example.com/p' } as never,
        false,
      ),
    ).toThrow('RULES_WORKER_DATABASE_URL')
    expect(() => check({ ...hosted(), SUPABASE_SERVICE_ROLE_KEY: '' } as never, false)).toThrow(
      'SUPABASE_SERVICE_ROLE_KEY',
    )
  })

  it('refuses hosted URLs in test-local mode', () => {
    expect(() => check(hosted() as never, true)).toThrow()
  })
})

const row = (email: string, roleCode: string, id = email): StaffRow => ({
  id,
  email,
  roleCode,
  authUserId: `auth-${id}`,
  organizationId: 'org',
})
const fullSet = [
  row('admin@x.test', 'SYSTEM_ADMINISTRATOR'),
  row('pg@x.test', 'PROGRAM_MANAGER'),
  row('gm@x.test', 'GRANT_MANAGER'),
  row('pm@x.test', 'PROJECT_MANAGER'),
  row('me@x.test', 'MONITORING_AND_EVALUATION_OFFICER'),
  row('b-po@x.test', 'PROJECT_OFFICER'),
  row('a-po@x.test', 'PROJECT_OFFICER'),
]

describe('defense demo staff mapping', () => {
  it('falls back to role code, ordering the two officers by email', () => {
    const staff = resolveStaff(fullSet, {})
    expect(staff.admin.email).toBe('admin@x.test')
    expect(staff.liza.email).toBe('a-po@x.test')
    expect(staff.emmanuel.email).toBe('b-po@x.test')
  })

  it('prefers known emails over role order', () => {
    const rows = [
      ...fullSet,
      row('liza.bautista@pathways.example', 'PROJECT_OFFICER'),
      row('emmanuel.cruz@pathways.example', 'PROJECT_OFFICER'),
      row('cianjake.francisco@gmail.com', 'SYSTEM_ADMINISTRATOR'),
    ]
    const staff = resolveStaff(rows, {})
    expect(staff.liza.email).toBe('liza.bautista@pathways.example')
    expect(staff.emmanuel.email).toBe('emmanuel.cruz@pathways.example')
    expect(staff.admin.email).toBe('cianjake.francisco@gmail.com')
  })

  it('honours an env override', () => {
    const staff = resolveStaff(fullSet, { DEMO_STAFF_LIZA_EMAIL: 'b-po@x.test' })
    expect(staff.liza.email).toBe('b-po@x.test')
    expect(staff.emmanuel.email).toBe('a-po@x.test')
  })

  it('lists every missing role and never invents users', () => {
    const rows = fullSet.filter(
      (r) => !['GRANT_MANAGER', 'MONITORING_AND_EVALUATION_OFFICER'].includes(r.roleCode),
    )
    expect(() => resolveStaff(rows, {})).toThrow(/grantManager \(GRANT_MANAGER\); me \(MONITORING/)
  })

  it('masks emails', () => {
    expect(maskEmail('priya@example.org')).toBe('p***@example.org')
  })
})

describe('defense demo storage and drain', () => {
  const client = { storage: {} } as never
  it('widens the bucket only in test-local mode', async () => {
    const steps = { reconcile: vi.fn(async () => ({})), widen: vi.fn(async () => undefined) }
    await prepareStorage(client, false, steps as never)
    expect(steps.reconcile).toHaveBeenCalledOnce()
    expect(steps.widen).not.toHaveBeenCalled()
    await prepareStorage(client, true, steps as never)
    expect(steps.widen).toHaveBeenCalledOnce()
  })

  it('polls until the alert signal changes without a TTY', async () => {
    const snaps = ['a', 'a', 'b']
    const sleep = vi.fn(async () => undefined)
    const drain = schedulerDrain({
      snapshot: async () => snaps.shift() as string,
      isTty: false,
      prompt: async () => undefined,
      sleep,
      log: () => undefined,
    })
    await drain()
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('prompts instead of polling on a TTY and fails after the timeout otherwise', async () => {
    const prompt = vi.fn(async () => undefined)
    await schedulerDrain({
      snapshot: async () => 'a',
      isTty: true,
      prompt,
      sleep: async () => undefined,
      log: () => undefined,
    })()
    expect(prompt).toHaveBeenCalledOnce()
    await expect(
      schedulerDrain({
        snapshot: async () => 'a',
        isTty: false,
        prompt,
        sleep: async () => undefined,
        log: () => undefined,
        pollMs: 1,
        timeoutMs: 3,
      })(),
    ).rejects.toThrow('gh workflow run')
  })
})
