import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  BASELINE,
  MIGRATIONS_IN_ORDER,
  assertResumablePrefix,
  buildPlan,
  planIndexForAppliedCount,
  planMigrationOrder,
} from './hosted-plan.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const migrationsDir = path.join(root, 'apps', 'api', 'prisma', 'migrations')

test('MIGRATIONS_IN_ORDER matches the real migrations directory exactly, in order', () => {
  const onDisk = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  assert.deepEqual([...MIGRATIONS_IN_ORDER].sort(), onDisk)
  // The migrations directory holds one folder per Prisma migration. 0000
  // squashes the original 0001-0026 into a single reviewed baseline, so the
  // ledger has 30 rows (baseline plus 0027-0056) even though the numbering has gaps.
  assert.equal(MIGRATIONS_IN_ORDER.length, 31)
  assert.equal(MIGRATIONS_IN_ORDER[0], BASELINE)
})

test('the dry-run plan order exactly matches the documented stop points', () => {
  const plan = buildPlan()
  const shape = plan.map((step) =>
    step.type === 'deploy'
      ? `deploy:${step.migrations.join(',')}`
      : step.type === 'preprovision' || step.type === 'cleanup'
        ? `${step.type}:${step.name}`
        : step.type,
  )
  assert.deepEqual(shape, [
    'create-role',
    'apply-baseline',
    'resolve-baseline',
    'deploy:0027_revised_csv_rbac,0028_revised_aggregate_permission_guards,0029_core_registration_and_import_support,0030_core_profile_partners',
    'preprovision:rules',
    'deploy:0031_f10_f11_rules_runtime',
    'cleanup:rules',
    'deploy:0032_core_workflow_actor_locks,0033_core_canonical_activity_review_guard',
    'preprovision:core',
    'deploy:0034_core_feature_completion',
    'cleanup:core',
    'deploy:0035_admin_read_access,0036_import_pdf_file_type',
    'preprovision:step-up-pin',
    'deploy:0037_step_up_pin,0038_import_smart_mapping,0039_project_partner_backfill,0040_default_registration_form',
    'preprovision:activity-media',
    'deploy:0041_activity_media_evidence',
    'cleanup:activity-media',
    'deploy:0042_proof_session_beneficiary_count',
    'deploy:0043_activity_overdue_explanation',
    'preprovision:activity-review',
    'deploy:0044_activity_progress_review',
    'cleanup:activity-review',
    'deploy:0045_f9_descriptive_aggregates',
    'deploy:0046_signin_lockout',
    'deploy:0047_revoke_sa_journeys_read',
    'deploy:0048_identity_review_grant',
    'deploy:0049_journey_event_note',
    'deploy:0050_import_value_map',
    'deploy:0051_indicator_library',
    'deploy:0052_signin_password_hook',
    'preprovision:expense-submit',
    'deploy:0053_expense_submit_race',
    'cleanup:expense-submit',
    'deploy:0054_p09_role_allows_grants',
    'deploy:0055_rbac_v4_grants',
    'deploy:0056_f9_survey_period_release',
    'alter-runtime-role',
    'postconditions',
  ])
})

test('planMigrationOrder covers every migration exactly once, in order', () => {
  assert.deepEqual(planMigrationOrder(), MIGRATIONS_IN_ORDER)
})

test('the rules cleanup step is flagged as needing the captured original_prisma_database_create value', () => {
  const plan = buildPlan()
  const rulesCleanup = plan.find((step) => step.type === 'cleanup' && step.name === 'rules')
  assert.ok(rulesCleanup.needsOriginalPrismaDatabaseCreate)
  const coreCleanup = plan.find((step) => step.type === 'cleanup' && step.name === 'core')
  assert.ok(!coreCleanup.needsOriginalPrismaDatabaseCreate)
})

test('assertResumablePrefix accepts an empty ledger', () => {
  assert.equal(assertResumablePrefix([]), 0)
})

test('assertResumablePrefix accepts an exact finished prefix', () => {
  const ledger = MIGRATIONS_IN_ORDER.slice(0, 5).map((migration_name) => ({
    migration_name,
    finished_at: '2026-01-01T00:00:00Z',
    rolled_back_at: null,
  }))
  assert.equal(assertResumablePrefix(ledger), 5)
})

test('assertResumablePrefix refuses an unfinished row', () => {
  const ledger = [{ migration_name: BASELINE, finished_at: null, rolled_back_at: null }]
  assert.throws(() => assertResumablePrefix(ledger), /unfinished or rolled back/)
})

test('assertResumablePrefix refuses a rolled-back row', () => {
  const ledger = [
    { migration_name: BASELINE, finished_at: '2026-01-01', rolled_back_at: '2026-01-02' },
  ]
  assert.throws(() => assertResumablePrefix(ledger), /unfinished or rolled back/)
})

test('assertResumablePrefix refuses a ledger with a gap (not an exact prefix)', () => {
  const ledger = [
    { migration_name: BASELINE, finished_at: '2026-01-01', rolled_back_at: null },
    {
      migration_name: '0028_revised_aggregate_permission_guards',
      finished_at: '2026-01-01',
      rolled_back_at: null,
    },
  ]
  assert.throws(() => assertResumablePrefix(ledger), /not an exact finished prefix/)
})

test('assertResumablePrefix refuses duplicate rows', () => {
  const ledger = [
    { migration_name: BASELINE, finished_at: '2026-01-01', rolled_back_at: null },
    { migration_name: BASELINE, finished_at: '2026-01-01', rolled_back_at: null },
  ]
  assert.throws(() => assertResumablePrefix(ledger), /duplicate/)
})

test('assertResumablePrefix refuses an unknown migration name', () => {
  const ledger = [
    { migration_name: 'not_a_real_migration', finished_at: '2026-01-01', rolled_back_at: null },
  ]
  assert.throws(() => assertResumablePrefix(ledger), /not an exact finished prefix/)
})

test('planIndexForAppliedCount(0) resumes at the very first step', () => {
  assert.equal(planIndexForAppliedCount(0), 0)
})

test('planIndexForAppliedCount resumes right after the deploy step for the last applied migration', () => {
  const plan = buildPlan()
  // 5 applied: baseline + 0027..0030, i.e. right after the first deploy batch.
  const index = planIndexForAppliedCount(5)
  assert.equal(plan[index].type, 'preprovision')
  assert.equal(plan[index].name, 'rules')
})

test('planIndexForAppliedCount resumes right after the deploy step for 0034 (mid-sequence cleanup still re-runs)', () => {
  const plan = buildPlan()
  // 9 applied: baseline + 0027..0034, i.e. right after the core-feature-completion deploy.
  const index = planIndexForAppliedCount(9)
  assert.equal(plan[index].type, 'cleanup')
  assert.equal(plan[index].name, 'core')
})

test('planIndexForAppliedCount on a complete 0000-0041 ledger resumes directly at the 0042 deploy, skipping the already-run 0041 cleanup', () => {
  const plan = buildPlan()
  const appliedThrough0041 = MIGRATIONS_IN_ORDER.indexOf('0041_activity_media_evidence') + 1
  const index = planIndexForAppliedCount(appliedThrough0041, { residualOwnerMemberships: false })
  assert.equal(plan[index].type, 'deploy')
  assert.deepEqual(plan[index].migrations, ['0042_proof_session_beneficiary_count'])
})

test('planIndexForAppliedCount on a 0000-0041 ledger with residual owner memberships resumes at the activity-media cleanup step instead', () => {
  const plan = buildPlan()
  const appliedThrough0041 = MIGRATIONS_IN_ORDER.indexOf('0041_activity_media_evidence') + 1
  const index = planIndexForAppliedCount(appliedThrough0041, { residualOwnerMemberships: true })
  assert.equal(plan[index].type, 'cleanup')
  assert.equal(plan[index].name, 'activity-media')
})

test('planIndexForAppliedCount defaults residualOwnerMemberships to false when omitted', () => {
  const plan = buildPlan()
  const appliedThrough0041 = MIGRATIONS_IN_ORDER.indexOf('0041_activity_media_evidence') + 1
  const index = planIndexForAppliedCount(appliedThrough0041)
  assert.equal(plan[index].type, 'deploy')
  assert.deepEqual(plan[index].migrations, ['0042_proof_session_beneficiary_count'])
})

test('planIndexForAppliedCount on a complete 0000-0042 ledger resumes directly at the 0043 deploy', () => {
  const plan = buildPlan()
  const appliedThrough0042 = MIGRATIONS_IN_ORDER.indexOf('0042_proof_session_beneficiary_count') + 1
  const index = planIndexForAppliedCount(appliedThrough0042)
  assert.equal(plan[index].type, 'deploy')
  assert.deepEqual(plan[index].migrations, ['0043_activity_overdue_explanation'])
})

test('planIndexForAppliedCount on a clean 0000-0043 ledger resumes at the activity-review preprovision that precedes the 0044 deploy', () => {
  const plan = buildPlan()
  const appliedThrough0043 = MIGRATIONS_IN_ORDER.indexOf('0043_activity_overdue_explanation') + 1
  const index = planIndexForAppliedCount(appliedThrough0043)
  assert.equal(plan[index].type, 'preprovision')
  assert.equal(plan[index].name, 'activity-review')
  assert.deepEqual(plan[index + 1].migrations, ['0044_activity_progress_review'])
})

test('planIndexForAppliedCount on a 0000-0043 ledger whose temporary chain is already granted resumes at the 0044 deploy', () => {
  const plan = buildPlan()
  const appliedThrough0043 = MIGRATIONS_IN_ORDER.indexOf('0043_activity_overdue_explanation') + 1
  const index = planIndexForAppliedCount(appliedThrough0043, { residualOwnerMemberships: true })
  assert.equal(plan[index].type, 'deploy')
  assert.deepEqual(plan[index].migrations, ['0044_activity_progress_review'])
})

test('planIndexForAppliedCount on a clean 0000-0044 ledger resumes directly at the 0045 deploy', () => {
  const plan = buildPlan()
  const appliedThrough0044 = MIGRATIONS_IN_ORDER.indexOf('0044_activity_progress_review') + 1
  const index = planIndexForAppliedCount(appliedThrough0044)
  assert.equal(plan[index].type, 'deploy')
  assert.deepEqual(plan[index].migrations, ['0045_f9_descriptive_aggregates'])
})

test('planIndexForAppliedCount on a 0000-0045 ledger resumes at the 0046 deploy', () => {
  const plan = buildPlan()
  const appliedThrough0045 = MIGRATIONS_IN_ORDER.indexOf('0045_f9_descriptive_aggregates') + 1
  const index = planIndexForAppliedCount(appliedThrough0045)
  assert.equal(plan[index].type, 'deploy')
  assert.deepEqual(plan[index].migrations, ['0046_signin_lockout'])
})

test('planIndexForAppliedCount on a 0000-0048 ledger resumes at the 0049 deploy', () => {
  const plan = buildPlan()
  const index = planIndexForAppliedCount(
    MIGRATIONS_IN_ORDER.indexOf('0048_identity_review_grant') + 1,
  )
  assert.deepEqual(plan[index].migrations, ['0049_journey_event_note'])
})

test('planIndexForAppliedCount on a complete 0000-0056 ledger resumes at alter-runtime-role', () => {
  const plan = buildPlan()
  const index = planIndexForAppliedCount(MIGRATIONS_IN_ORDER.length)
  assert.equal(plan[index].type, 'alter-runtime-role')
})

test('planIndexForAppliedCount on a 0000-0055 ledger resumes at the 0056 deploy', () => {
  const index = planIndexForAppliedCount(MIGRATIONS_IN_ORDER.length - 1)
  assert.deepEqual(buildPlan()[index].migrations, ['0056_f9_survey_period_release'])
})

test('planIndexForAppliedCount on a 0000-0044 ledger with residual owner memberships resumes at the activity-review cleanup step', () => {
  const plan = buildPlan()
  const appliedThrough0044 = MIGRATIONS_IN_ORDER.indexOf('0044_activity_progress_review') + 1
  const index = planIndexForAppliedCount(appliedThrough0044, {
    residualOwnerMemberships: true,
  })
  assert.equal(plan[index].type, 'cleanup')
  assert.equal(plan[index].name, 'activity-review')
})

test('planIndexForAppliedCount on a 0000-0052 ledger resumes at the expense-submit preprovision, or at the 0053 deploy when its chain is granted', () => {
  const plan = buildPlan()
  const applied = MIGRATIONS_IN_ORDER.indexOf('0052_signin_password_hook') + 1
  const fresh = planIndexForAppliedCount(applied)
  assert.equal(plan[fresh].type, 'preprovision')
  assert.equal(plan[fresh].name, 'expense-submit')
  const granted = planIndexForAppliedCount(applied, { residualOwnerMemberships: true })
  assert.deepEqual(plan[granted].migrations, ['0053_expense_submit_race'])
})

test('planIndexForAppliedCount on a 0000-0053 ledger resumes at the 0054 deploy, or at the expense-submit cleanup with residual owner memberships', () => {
  const plan = buildPlan()
  const applied = MIGRATIONS_IN_ORDER.indexOf('0053_expense_submit_race') + 1
  assert.equal(applied, 28)
  assert.deepEqual(plan[planIndexForAppliedCount(applied)].migrations, [
    '0054_p09_role_allows_grants',
  ])
  const index = planIndexForAppliedCount(applied, {
    residualOwnerMemberships: true,
  })
  assert.equal(plan[index].type, 'cleanup')
  assert.equal(plan[index].name, 'expense-submit')
})
