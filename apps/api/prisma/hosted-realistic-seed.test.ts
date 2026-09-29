import { describe, expect, it } from 'vitest'

import {
  SYSTEM_ADMIN_EMAIL,
  assertGuardedTarget,
  dummyStaff,
  planBeneficiaryRegistration,
  projectPlans,
  reconcileStorageBuckets,
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
        expect(() => assertGuardedTarget()).toThrow('DATABASE_URL host must be exactly')
      },
    )
  })

  it('refuses a foreign host even when the ref appears only in the password or path', () => {
    withEnv(
      {
        SUPABASE_URL: ALLOWED_SUPABASE_URL,
        DATABASE_URL:
          'postgresql://pathways_runtime:klbtoqdalmcsfjqophty@evil.example.com:5432/klbtoqdalmcsfjqophty',
        DIRECT_URL: 'postgresql://prisma:x@db.klbtoqdalmcsfjqophty.supabase.co:5432/postgres',
      },
      () => {
        expect(() => assertGuardedTarget()).toThrow('DATABASE_URL host must be exactly')
      },
    )
  })

  it('refuses a foreign pooler username', () => {
    withEnv(
      {
        SUPABASE_URL: ALLOWED_SUPABASE_URL,
        DATABASE_URL:
          'postgresql://pathways_runtime.someotherref:x@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
        DIRECT_URL: 'postgresql://prisma:x@db.klbtoqdalmcsfjqophty.supabase.co:5432/postgres',
      },
      () => {
        expect(() => assertGuardedTarget()).toThrow('DATABASE_URL must use username')
      },
    )
  })

  it('refuses a loopback DIRECT_URL in hosted mode', () => {
    withEnv(
      {
        SUPABASE_URL: ALLOWED_SUPABASE_URL,
        DATABASE_URL:
          'postgresql://pathways_runtime:x@db.klbtoqdalmcsfjqophty.supabase.co:5432/postgres',
        DIRECT_URL: 'postgresql://prisma:x@127.0.0.1:5432/postgres',
      },
      () => {
        expect(() => assertGuardedTarget()).toThrow('DIRECT_URL host must be exactly')
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
        expect(() => assertGuardedTarget()).toThrow('--test-local requires every URL')
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

  it('test-local with a loopback SUPABASE_URL but a hosted DATABASE_URL or DIRECT_URL must throw', () => {
    withEnv(
      {
        PATHWAYS_HOSTED_SEED_MODE: 'test-local',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        DATABASE_URL:
          'postgresql://pathways_runtime:x@db.klbtoqdalmcsfjqophty.supabase.co:5432/postgres',
        DIRECT_URL: 'postgresql://prisma:x@127.0.0.1:54322/postgres',
      },
      () => {
        expect(() => assertGuardedTarget()).toThrow('--test-local requires every URL')
      },
    )
    withEnv(
      {
        PATHWAYS_HOSTED_SEED_MODE: 'test-local',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        DATABASE_URL: 'postgresql://pathways_runtime:x@127.0.0.1:54322/postgres',
        DIRECT_URL: 'postgresql://prisma:x@db.klbtoqdalmcsfjqophty.supabase.co:5432/postgres',
      },
      () => {
        expect(() => assertGuardedTarget()).toThrow('--test-local requires every URL')
      },
    )
  })
})

describe('reconcileStorageBuckets', () => {
  const plans = [
    {
      id: 'pathways-private',
      fileSizeLimit: 52_428_800,
      allowedMimeTypes: ['image/png', 'application/pdf'],
    },
    { id: 'uploads', fileSizeLimit: 52_428_800 },
  ]

  function fakeStorage(
    existing: Array<{
      id: string
      public: boolean
      file_size_limit?: number | null
      allowed_mime_types?: string[] | null
    }>,
  ) {
    const created: unknown[] = []
    const updated: unknown[] = []
    return {
      created,
      updated,
      async listBuckets() {
        return { data: existing, error: null }
      },
      async createBucket(id: string, options: unknown) {
        created.push({ id, options })
        return { error: null }
      },
      async updateBucket(id: string, options: unknown) {
        updated.push({ id, options })
        return { error: null }
      },
    }
  }

  it('creates every bucket that does not exist yet', async () => {
    const storage = fakeStorage([])
    const outcomes = await reconcileStorageBuckets(storage, plans)
    expect(outcomes).toEqual({ 'pathways-private': 'CREATED', uploads: 'CREATED' })
    expect(storage.created).toHaveLength(2)
    expect(storage.updated).toHaveLength(0)
  })

  it('leaves an existing bucket alone when it already matches the required settings', async () => {
    const storage = fakeStorage([
      {
        id: 'pathways-private',
        public: false,
        file_size_limit: 52_428_800,
        allowed_mime_types: ['application/pdf', 'image/png'], // order must not matter
      },
      { id: 'uploads', public: false, file_size_limit: 52_428_800, allowed_mime_types: null },
    ])
    const outcomes = await reconcileStorageBuckets(storage, plans)
    expect(outcomes).toEqual({ 'pathways-private': 'UNCHANGED', uploads: 'UNCHANGED' })
    expect(storage.created).toHaveLength(0)
    expect(storage.updated).toHaveLength(0)
  })

  it('updates an existing bucket whose settings drifted from the required ones', async () => {
    const storage = fakeStorage([
      // A stale bucket left with no limit and no MIME restriction, as if created before
      // these requirements existed, or manually.
      { id: 'pathways-private', public: false, file_size_limit: null, allowed_mime_types: null },
      { id: 'uploads', public: true, file_size_limit: 52_428_800, allowed_mime_types: null },
    ])
    const outcomes = await reconcileStorageBuckets(storage, plans)
    expect(outcomes).toEqual({ 'pathways-private': 'UPDATED', uploads: 'UPDATED' })
    expect(storage.updated).toHaveLength(2)
    const privateUpdate = storage.updated.find(
      (call): call is { id: string; options: Record<string, unknown> } =>
        (call as { id: string }).id === 'pathways-private',
    )
    expect(privateUpdate?.options).toMatchObject({
      public: false,
      fileSizeLimit: 52_428_800,
      allowedMimeTypes: ['image/png', 'application/pdf'],
    })
  })

  it('propagates a listBuckets error without creating or updating anything', async () => {
    const storage = {
      async listBuckets() {
        return { data: null, error: new Error('storage unavailable') }
      },
      createBucket: async () => ({ error: null }),
      updateBucket: async () => ({ error: null }),
    }
    await expect(reconcileStorageBuckets(storage, plans)).rejects.toThrow('storage unavailable')
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
    const a = stableUuid('beneficiary-register:SGE-ES-2026:BEN-SGE-ES-2026-001')
    const b = stableUuid('beneficiary-register:SGE-ES-2026:BEN-SGE-ES-2026-001')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('different natural keys produce different ids', () => {
    const a = stableUuid('beneficiary-register:SGE-ES-2026:BEN-SGE-ES-2026-001')
    const b = stableUuid('beneficiary-register:SGE-ES-2026:BEN-SGE-ES-2026-002')
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
