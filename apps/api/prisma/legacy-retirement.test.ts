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
      '0000_pathways_baseline_through_0026',
      '0027_revised_csv_rbac',
      '0028_revised_aggregate_permission_guards',
      '0029_core_registration_and_import_support',
      '0030_core_profile_partners',
      '0031_f10_f11_rules_runtime',
      '0032_core_workflow_actor_locks',
      '0033_core_canonical_activity_review_guard',
      '0034_core_feature_completion',
      '0035_admin_read_access',
      '0036_import_pdf_file_type',
      '0037_step_up_pin',
      '0038_import_smart_mapping',
      '0039_project_partner_backfill',
      '0040_default_registration_form',
      '0041_activity_media_evidence',
      '0042_proof_session_beneficiary_count',
      '0043_activity_overdue_explanation',
      '0044_activity_progress_review',
      '0045_f9_descriptive_aggregates',
      '0046_signin_lockout',
      '0047_revoke_sa_journeys_read',
      '0048_identity_review_grant',
      '0049_journey_event_note',
      '0050_import_value_map',
      '0051_indicator_library',
      '0052_signin_password_hook',
      '0053_expense_submit_race',
      '0054_p09_role_allows_grants',
      '0055_rbac_v4_grants',
      '0056_indicator_type',
      '0057_f9_survey_period_release',
      '0058_rules_decision_status_auto_resolved',
      '0059_rules_recommendation_auto_resolve',
      '0060_rules_budget_beneficiary_survey_metrics',
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
    expect(schema.match(/^model /gm)).toHaveLength(57)
    expect(schema).toMatch(/^model UserStepUpPin\s*\{/m)
    expect(schema).toMatch(/^model BeneficiaryStepUpGrant\s*\{/m)
    expect(schema).toMatch(/^model ExpenseSignoff\s*\{/m)
    expect(schema).toMatch(/^model ProjectPublication\s*\{/m)
    expect(schema).toMatch(/^model PublicationRequest\s*\{/m)
    expect(schema).toMatch(/^model SurveyAggregateRelease\s*\{/m)
    expect(schema).toMatch(/^model ImplementingPartner\s*\{/m)
    expect(schema).toMatch(/^model ProjectImplementingPartner\s*\{/m)
    expect(schema).toMatch(/^model ProjectIndicatorBinding\s*\{/m)
    expect(schema).toMatch(/^model ProjectIndicatorMeasurement\s*\{/m)
    expect(schema).toMatch(/^model SensitiveAggregateRelease\s*\{/m)
    expect(schema).toMatch(/^model ActivityIndicatorLink\s*\{/m)
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
