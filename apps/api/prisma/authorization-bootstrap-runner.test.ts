import { describe, expect, it } from 'vitest'
import {
  type Phase5LedgerRow,
  phase5Checksums,
  phase5Failure,
  phase5LedgerState,
  sessionLivenessMigration,
  validatePhase5Url,
} from './authorization-bootstrap-runner'

function fixture() {
  const url = new URL('postgresql://aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres')
  url.username = 'postgres.pdqwsknbzkdtiwjjibqt'
  url.password = 'synthetic-not-a-real-credential'
  url.searchParams.set('sslmode', 'require')
  return url
}

describe('Phase 5 fail-closed operator guard', () => {
  it('accepts only the reviewed administrator Session Pooler target', () => {
    expect(Boolean(validatePhase5Url(fixture().toString()))).toBe(true)
  })
  it('rejects absent, non-TLS, wrong-role, wrong-project, wrong-port and injected options', () => {
    expect(() => validatePhase5Url(undefined)).toThrow()
    const invalid = [
      (url: URL) => {
        url.hostname = 'example.invalid'
      },
      (url: URL) => {
        url.port = '6543'
      },
      (url: URL) => {
        url.username = 'prisma.pdqwsknbzkdtiwjjibqt'
      },
      (url: URL) => {
        url.username = 'postgres.other-project'
      },
      (url: URL) => {
        url.pathname = '/other'
      },
      (url: URL) => {
        url.password = ''
      },
      (url: URL) => {
        url.searchParams.set('sslmode', 'disable')
      },
      (url: URL) => {
        url.searchParams.set('schema', 'pathways')
      },
      (url: URL) => {
        url.searchParams.set('options', 'unreviewed')
      },
      (url: URL) => {
        url.hash = 'unreviewed'
      },
    ]
    for (const mutate of invalid) {
      const url = fixture()
      mutate(url)
      expect(() => validatePhase5Url(url.toString())).toThrow()
    }
  })
  it('never emits raw errors, connection strings or database error messages', () => {
    expect(phase5Failure({ code: 'P2028', message: 'private diagnostic' })).toEqual({
      status: 'FAILED',
      stage: 'configuration',
      prismaCode: 'P2028',
    })
    expect(phase5Failure({ code: 'private diagnostic' }).prismaCode).toBe('NONE')
    expect(JSON.stringify(phase5Failure(new Error('private diagnostic')))).not.toContain(
      'private diagnostic',
    )
  })

  function completed(name: keyof typeof phase5Checksums): Phase5LedgerRow {
    return {
      migration_name: name,
      checksum: phase5Checksums[name],
      finished_at: new Date('2026-09-01T00:00:00Z'),
      rolled_back_at: null,
      applied_steps_count: name === '0001_init' ? 1 : 0,
      expected_failure: false,
      logs_absent: true,
    }
  }

  function foundationLedger(): Phase5LedgerRow[] {
    return [
      completed('0001_init'),
      completed('0002_pathways_foundation'),
      completed('0003_pathways_projects_collection'),
      completed('0004_pathways_finance_evaluation_decisions'),
      completed('0005_supabase_security_adapter'),
    ]
  }

  it('accepts only the exact completed 0001-0005 foundation ledger', () => {
    expect(phase5LedgerState(foundationLedger())).toBe('FOUNDATION_READY')
    expect(
      phase5LedgerState([
        ...foundationLedger(),
        {
          ...completed('0005_supabase_security_adapter'),
          migration_name: sessionLivenessMigration.name,
          checksum: sessionLivenessMigration.checksum,
          applied_steps_count: 1,
        },
      ]),
    ).toBe('FOUNDATION_READY')
  })

  it('rejects unresolved, failed, duplicate, drifted and unexpected history', () => {
    const before = foundationLedger()
    const migration = completed('0005_supabase_security_adapter')
    const invalidRows: Phase5LedgerRow[][] = [
      before.map((row, index) => (index === 4 ? { ...row, finished_at: null } : row)),
      before.map((row, index) => (index === 4 ? { ...row, rolled_back_at: new Date() } : row)),
      before.map((row, index) => (index === 4 ? { ...row, checksum: '0'.repeat(64) } : row)),
      before.map((row, index) => (index === 4 ? { ...row, logs_absent: false } : row)),
      [...before, migration],
      [...before.slice(0, 4), { ...migration, migration_name: 'unexpected' }],
      [
        ...before,
        {
          ...migration,
          migration_name: sessionLivenessMigration.name,
          checksum: '0'.repeat(64),
        },
      ],
    ]
    for (const rows of invalidRows) expect(() => phase5LedgerState(rows)).toThrow()
  })
})
