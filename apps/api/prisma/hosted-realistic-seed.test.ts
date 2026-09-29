import { describe, expect, it } from 'vitest'

import {
  SYSTEM_ADMIN_EMAIL,
  assertGuardedTarget,
  dummyStaff,
  planBeneficiaryRegistration,
  projectPlans,
  stableUuid,
  staffEmail,
} from './hosted-realistic-seed'

const ALLOWED_SUPABASE_URL = 'https://klbtoqdalmcsfjqophty.supabase.co'

function withEnv<T>(vars: Record<string, string | undefined>, run: () => T): T {
  const previous: Record<string, string | undefined> = {}
  for (const key of Object.keys(vars)) previous[key] = process.env[key]
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return run()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

describe('assertGuardedTarget (defense in depth, mirrors scripts/db/hosted-seed-target.mjs)', () => {
  it('accepts the exact allowed hosted project', () => {
    withEnv(
      {
        PATHWAYS_HOSTED_SEED_MODE: undefined,
        SUPABASE_URL: ALLOWED_SUPABASE_URL,
        DATABASE_URL:
          'postgresql://pathways_runtime:x@db.klbtoqdalmcsfjqophty.supabase.co:5432/postgres',
        DIRECT_URL: 'postgresql://prisma:x@db.klbtoqdalmcsfjqophty.supabase.co:5432/postgres',
      },
      () => {
        expect(assertGuardedTarget()).toEqual({ testLocal: false })
      },
    )
  })

  it('refuses the wrong project ref', () => {
    withEnv(
      {
        SUPABASE_URL: ALLOWED_SUPABASE_URL,
        DATABASE_URL: 'postgresql://pathways_runtime:x@db.wrongref.supabase.co:5432/postgres',
        DIRECT_URL: 'postgresql://prisma:x@db.wrongref.supabase.co:5432/postgres',
      },
      () => {
        expect(() => assertGuardedTarget()).toThrow('reference the allowed project ref')
      },
    )
  })

  it('refuses a wrong SUPABASE_URL', () => {
    withEnv(
      {
        SUPABASE_URL: 'https://evil.example.com',
        DATABASE_URL:
          'postgresql://pathways_runtime:x@db.klbtoqdalmcsfjqophty.supabase.co:5432/postgres',
        DIRECT_URL: 'postgresql://prisma:x@db.klbtoqdalmcsfjqophty.supabase.co:5432/postgres',
      },
      () => {
        expect(() => assertGuardedTarget()).toThrow('SUPABASE_URL must equal exactly')
      },
    )
  })

  it('requires all three URLs', () => {
    withEnv(
      { SUPABASE_URL: ALLOWED_SUPABASE_URL, DATABASE_URL: undefined, DIRECT_URL: undefined },
      () => {
        expect(() => assertGuardedTarget()).toThrow('are all required')
      },
    )
  })

  it('test-local mode requires a loopback SUPABASE_URL and cannot be combined with the hosted URL', () => {
    withEnv(
      {
        PATHWAYS_HOSTED_SEED_MODE: 'test-local',
        SUPABASE_URL: ALLOWED_SUPABASE_URL,
        DATABASE_URL: 'postgresql://pathways_runtime:x@127.0.0.1:54322/postgres',
        DIRECT_URL: 'postgresql://prisma:x@127.0.0.1:54322/postgres',
      },
      () => {
        expect(() => assertGuardedTarget()).toThrow('requires a loopback SUPABASE_URL')
      },
    )
    withEnv(
      {
        PATHWAYS_HOSTED_SEED_MODE: 'test-local',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        DATABASE_URL: 'postgresql://pathways_runtime:x@127.0.0.1:54322/postgres',
        DIRECT_URL: 'postgresql://prisma:x@127.0.0.1:54322/postgres',
      },
      () => {
        expect(assertGuardedTarget()).toEqual({ testLocal: true })
      },
    )
  })
})

describe('staff and admin identity', () => {
  it('never treats the System Administrator email as a dummy staff account', () => {
    expect(SYSTEM_ADMIN_EMAIL).toBe('cianjake.francisco@gmail.com')
    for (const staff of dummyStaff) {
      expect(staffEmail(staff)).not.toBe(SYSTEM_ADMIN_EMAIL)
    }
  })

  it('dummy staff emails use only the @example.test namespace', () => {
    for (const staff of dummyStaff) {
      expect(staffEmail(staff)).toMatch(/^[a-z]+\.[a-z]+@example\.test$/)
    }
  })

  it('covers exactly one of each required role plus two project officers', () => {
    const roles = dummyStaff.map((s) => s.role)
    expect(roles.filter((r) => r === 'PROGRAM_MANAGER')).toHaveLength(1)
    expect(roles.filter((r) => r === 'GRANT_MANAGER')).toHaveLength(1)
    expect(roles.filter((r) => r === 'PROJECT_MANAGER')).toHaveLength(1)
    expect(roles.filter((r) => r === 'MONITORING_AND_EVALUATION_OFFICER')).toHaveLength(1)
    expect(roles.filter((r) => r === 'PROJECT_OFFICER')).toHaveLength(2)
  })
})

const RE_PII_LIKE = /\b(cian|francisco|ceezey)\b/i

describe('beneficiary data validity', () => {
  const allRows = projectPlans.flatMap((plan, projectIndex) =>
    Array.from({ length: plan.beneficiaryCount }, (_, i) =>
      planBeneficiaryRegistration(plan, projectIndex, i, '00000000-0000-4000-8000-000000000000'),
    ),
  )

  it('has 45 or more beneficiaries planned, with one deliberately small (<5) cohort', () => {
    const total = projectPlans.reduce((sum, plan) => sum + plan.beneficiaryCount, 0)
    expect(total).toBeGreaterThanOrEqual(45)
    const smallCohorts = projectPlans.filter((plan) => plan.beneficiaryCount < 5)
    expect(smallCohorts).toHaveLength(1)
  })

  it('every planned beneficiary is at least 5 years old and never has a future birth date', () => {
    const today = new Date().toISOString().slice(0, 10)
    for (const row of allRows) {
      expect(row.age).toBeGreaterThanOrEqual(5)
      expect(row.age).toBeLessThanOrEqual(70)
      expect(row.birthDate <= today).toBe(true)
      expect(row.birthDate <= row.enrollmentDate).toBe(true)
    }
  })

  it('every planned beneficiary records both consents', () => {
    for (const row of allRows) {
      expect(row.registerDto.values.consent_recorded).toBe(true)
      expect(row.registerDto.values.data_processing_consent_recorded).toBe(true)
    }
  })

  it('guardian consent is set exactly when the beneficiary is a minor', () => {
    for (const row of allRows) {
      expect(row.registerDto.values.guardian_consent_recorded).toBe(row.registerDto.values.is_minor)
      expect(row.registerDto.values.is_minor).toBe(row.age < 18)
    }
  })

  it('uses no email addresses or external identifiers (no PII surface) and no real-person name patterns', () => {
    for (const row of allRows) {
      const values = row.registerDto.values as Record<string, unknown>
      expect(values.external_identifier_type).toBeUndefined()
      expect(values.external_identifier_value).toBeUndefined()
      const combined = `${values.first_name} ${values.last_name}`
      expect(combined).not.toMatch(RE_PII_LIKE)
      expect(combined).not.toMatch(/@/)
    }
  })

  it('beneficiary codes are unique and match the canonical registration code pattern', () => {
    const codes = allRows.map((row) => row.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) expect(code).toMatch(/^[A-Z0-9][A-Z0-9_-]{1,39}$/)
  })
})

describe('idempotency', () => {
  it('stableUuid is deterministic and produces a structurally valid UUID', () => {
    const a = stableUuid('beneficiary-register:SSG-ES-2026:BEN-SSG-ES-2026-001')
    const b = stableUuid('beneficiary-register:SSG-ES-2026:BEN-SSG-ES-2026-001')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('different natural keys produce different ids', () => {
    const a = stableUuid('beneficiary-register:SSG-ES-2026:BEN-SSG-ES-2026-001')
    const b = stableUuid('beneficiary-register:SSG-ES-2026:BEN-SSG-ES-2026-002')
    expect(a).not.toBe(b)
  })

  it('the planned registration for a given (project, index) is identical across two runs', () => {
    const plan = projectPlans[0]
    const first = planBeneficiaryRegistration(plan, 0, 3, 'form-id')
    const second = planBeneficiaryRegistration(plan, 0, 3, 'form-id')
    expect(first).toEqual(second)
    expect(first.registerDto.clientRegistrationId).toBe(second.registerDto.clientRegistrationId)
  })
})
