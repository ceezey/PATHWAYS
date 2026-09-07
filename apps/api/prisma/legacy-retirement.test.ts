import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { phase5Checksums } from './authorization-bootstrap-runner'
import { validatePhase6MigrationUrl } from './legacy-retirement-target'

const migrationPath = path.join(
  __dirname,
  'migrations/0006_retire_legacy_public_application_tables/migration.sql',
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

describe('Phase 6 destructive migration contract', () => {
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
    expect(checksum).toBe(phase5Checksums['0006_retire_legacy_public_application_tables'])
  })

  it('accepts only the exact protected PATHWAYS-dev migration target', () => {
    const fixture = () => {
      const url = new URL('postgresql://aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres')
      url.username = 'prisma.pdqwsknbzkdtiwjjibqt'
      url.password = 'synthetic-not-a-real-credential'
      url.searchParams.set('sslmode', 'require')
      url.searchParams.set('connect_timeout', '30')
      url.searchParams.set('connection_limit', '1')
      return url
    }
    expect(validatePhase6MigrationUrl(fixture().toString())).toBe(fixture().toString())
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
      expect(() => validatePhase6MigrationUrl(url.toString())).toThrow()
    }
  })
})
