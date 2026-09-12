import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { validatePhase6MigrationUrl } from './legacy-retirement-target'

const migrationPath = path.join(
  __dirname,
  '../../../infra/supabase/legacy-retirement/deferred-retire-legacy-public-application-tables.sql',
)
const migration = fs.readFileSync(migrationPath, 'utf8')
const schema = fs.readFileSync(path.join(__dirname, 'schema.prisma'), 'utf8')
const approvedDrops = [
  'UploadRowError',
  'UploadRow',
  'UploadBatch',
  'MetadataField',
  'ParticipantCard',
  'ParticipantJourney',
  'Report',
  'AuditLog',
  'UserRole',
  'Project',
  'FormMetadata',
  'Participant',
  'Program',
  'Role',
  'User',
]

describe('Deferred legacy-table retirement contract', () => {
  it('is outside the executable Prisma history and explicitly refuses use', () => {
    const directories = fs
      .readdirSync(path.join(__dirname, 'migrations'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    expect(directories).toEqual([
      '0001_init',
      '0002_pathways_foundation',
      '0003_pathways_projects_collection',
      '0004_pathways_finance_evaluation_decisions',
      '0005_supabase_security_adapter',
      '0006_auth_session_liveness',
    ])
    expect(migration).toContain('DEFERRED REVIEW ARTIFACT -- NOT AN ACTIVE PRISMA MIGRATION')
  })
  it('contains only the 15 explicit reviewed DROP TABLE RESTRICT statements', () => {
    const drops = [...migration.matchAll(/^DROP TABLE public\."([A-Za-z]+)" RESTRICT;$/gm)].map(
      (match) => match[1],
    )
    expect(drops).toEqual(approvedDrops)
    expect(migration.match(/^DROP TABLE /gm)).toHaveLength(15)
    expect(migration).not.toMatch(/DROP TABLE IF EXISTS/i)
    expect(migration).not.toMatch(/\bCASCADE\b/i)
  })

  it('locks before checking rows and drops inside one explicit transaction', () => {
    expect(migration.trimStart().indexOf('BEGIN;')).toBeGreaterThanOrEqual(0)
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true)
    expect(migration.indexOf('IN ACCESS EXCLUSIVE MODE;')).toBeLessThan(
      migration.indexOf('DO $empty_tables$'),
    )
    expect(migration.indexOf('DO $empty_tables$')).toBeLessThan(
      migration.indexOf('DROP TABLE public."UploadRowError"'),
    )
  })

  it('keeps the datamodel and verifier aligned with the reviewed migration', () => {
    expect(schema).not.toMatch(/^model Legacy/m)
    expect(schema.match(/^model /gm)).toHaveLength(39)
    const checksum = createHash('sha256').update(migration).digest('hex')
    expect(checksum).toBe('9d1a3688fbe3aa9692e615a4e33c182d8544006245bef54a371579fb65fab253')
  })

  it('rejects every hosted migration target while retirement is deferred', () => {
    const fixture = () => {
      const url = new URL('postgresql://aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres')
      url.username = 'prisma.pdqwsknbzkdtiwjjibqt'
      url.password = 'synthetic-not-a-real-credential'
      url.searchParams.set('sslmode', 'require')
      url.searchParams.set('connect_timeout', '30')
      url.searchParams.set('connection_limit', '1')
      return url
    }
    expect(() => validatePhase6MigrationUrl(fixture().toString())).toThrow(/deferred/)
    const invalid = [
      (url: URL) => {
        url.hostname = 'example.invalid'
      },
      (url: URL) => {
        url.port = '6543'
      },
      (url: URL) => {
        url.username = 'prisma.other-project'
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
        url.searchParams.set('connect_timeout', '31')
      },
      (url: URL) => {
        url.searchParams.set('connection_limit', '2')
      },
      (url: URL) => {
        url.searchParams.set('schema', 'pathways')
      },
      (url: URL) => {
        url.hash = 'unreviewed'
      },
    ]
    for (const mutate of invalid) {
      const url = fixture()
      mutate(url)
      expect(() => validatePhase6MigrationUrl(url.toString())).toThrow(/deferred/)
    }
    expect(() => validatePhase6MigrationUrl(undefined)).toThrow(/deferred/)
  })
})
