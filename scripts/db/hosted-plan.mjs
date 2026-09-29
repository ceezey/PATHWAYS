// The ordered build plan for scripts/db/hosted-build.mjs, kept separate and
// pure (no I/O) so it can be unit tested in isolation. Mirrors the sequence
// in scripts/db/local-reset.mjs, staged for a hosted, non-Docker target.

export const BASELINE = '0000_pathways_baseline_through_0026'

// The exact 19-migration ledger this script must produce, in order. This is
// the repository's own migration directory listing (apps/api/prisma/migrations),
// asserted against the real directory in hosted-plan.test.mjs so this literal
// list can never silently drift from the repo.
export const MIGRATIONS_IN_ORDER = Object.freeze([
  BASELINE,
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
  '0044_f9_descriptive_aggregates',
])

function range(from, to) {
  return MIGRATIONS_IN_ORDER.filter((name) => {
    const n = Number.parseInt(name.slice(0, 4), 10)
    return n >= from && n <= to
  })
}

// Ordered plan. Each step is one unit of work for the orchestrator's
// injectable IO. `type` drives dispatch; the rest is step-specific detail.
export function buildPlan() {
  return [
    { type: 'create-role' },
    { type: 'apply-baseline', migration: BASELINE },
    { type: 'resolve-baseline', migration: BASELINE },
    { type: 'deploy', migrations: range(27, 30) },
    { type: 'preprovision', name: 'rules', file: 'hosted-rules-preprovision.sql' },
    { type: 'deploy', migrations: range(31, 31) },
    {
      type: 'cleanup',
      name: 'rules',
      file: 'hosted-rules-cleanup.sql',
      needsOriginalPrismaDatabaseCreate: true,
    },
    { type: 'deploy', migrations: range(32, 33) },
    { type: 'preprovision', name: 'core', file: 'hosted-core-preprovision.sql' },
    { type: 'deploy', migrations: range(34, 34) },
    { type: 'cleanup', name: 'core', file: 'hosted-core-cleanup.sql' },
    { type: 'deploy', migrations: range(35, 36) },
    { type: 'preprovision', name: 'step-up-pin', file: 'hosted-step-up-pin-preprovision.sql' },
    { type: 'deploy', migrations: range(37, 40) },
    {
      type: 'preprovision',
      name: 'activity-media',
      file: 'hosted-activity-media-preprovision.sql',
    },
    { type: 'deploy', migrations: range(41, 41) },
    { type: 'cleanup', name: 'activity-media', file: 'hosted-activity-media-cleanup.sql' },
    // 0042 needs no preprovision: prisma already owns pathways.activity_updates and
    // pathways.p08_activity_beneficiaries_reached from the 0000 baseline.
    { type: 'deploy', migrations: range(42, 42) },
    // 0043 needs no preprovision: prisma already owns pathways.project_activities,
    // pathways.projects, pathways.organizations, pathways.system_users and
    // pathways.p05_has_project_permission from the 0000 baseline.
    { type: 'deploy', migrations: range(43, 43) },
    // 0044 needs no preprovision: it adds two functions only, and prisma already owns
    // pathways.p06_can, pathways.assessment_results, pathways.project_activities and
    // pathways.project_milestones from the 0000 baseline.
    { type: 'deploy', migrations: range(44, 44) },
    { type: 'alter-runtime-role' },
    { type: 'postconditions' },
  ]
}

// Flattens the plan's `deploy` steps back into per-migration order, purely to
// cross-check that every migration in MIGRATIONS_IN_ORDER is deployed exactly
// once, in order, across the whole plan (baseline handled separately).
export function planMigrationOrder() {
  const order = [BASELINE]
  for (const step of buildPlan()) {
    if (step.type === 'deploy') order.push(...step.migrations)
  }
  return order
}

// --resume support. `ledgerRows` are {migration_name, finished_at, rolled_back_at}
// rows from public._prisma_migrations. Returns the index into MIGRATIONS_IN_ORDER
// of the first migration NOT yet applied (0 if the ledger is empty), or throws
// if the ledger is not a clean, exact, finished prefix of MIGRATIONS_IN_ORDER.
export function assertResumablePrefix(ledgerRows) {
  for (const row of ledgerRows) {
    if (row.rolled_back_at || !row.finished_at) {
      throw new Error(
        `Migration ${row.migration_name} is unfinished or rolled back; --resume refuses a broken ledger`,
      )
    }
  }
  const names = ledgerRows.map((row) => row.migration_name)
  const nameSet = new Set(names)
  if (nameSet.size !== names.length) {
    throw new Error('Ledger has duplicate migration rows; --resume refuses it')
  }
  let appliedCount = 0
  for (const name of MIGRATIONS_IN_ORDER) {
    if (!nameSet.has(name)) break
    appliedCount++
  }
  if (appliedCount !== names.length) {
    throw new Error(
      'Ledger is not an exact finished prefix of the expected 0000-0044 migrations; --resume refuses it',
    )
  }
  return appliedCount
}

// Maps a count of already-applied migrations (from assertResumablePrefix) to
// the plan step index to resume at. Cleanup steps are not tracked by the
// Prisma ledger, so when resuming right after a migration that has a
// following cleanup step (0031, 0034, 0041), that cleanup step is re-run;
// each cleanup script's own preconditions reject a target that was already
// cleaned, surfacing a clear error rather than silently skipping it.
//
// 0041_activity_media_evidence is, in the ledger alone, ambiguous: it is both (a) the
// terminal state of an already-completed hosted build that predates 0042/0043 (cleanup already
// ran, runtime-role already altered) and (b) the state of a build that crashed or was killed
// between the 0041 deploy and its own cleanup step, which never ran (see the in-process catch
// in runHostedBuild / hosted-build.mjs). Both states have the exact same appliedCount, so the
// ledger cannot disambiguate them by itself: the caller must check live database state (whether
// prisma still holds the temporary rules_store_owner/rules_enqueue_owner memberships granted by
// hosted-activity-media-preprovision.sql) and pass the result in as `residualOwnerMemberships`.
// When true, resume must re-run the cleanup step; when false, resume continues at the next
// migration's own deploy step. 0042_proof_session_beneficiary_count has no matching
// preprovision/cleanup pair (see buildPlan's comment on the 0042 deploy step), so a ledger
// stopped exactly there is unambiguous and always resumes at the 0043 deploy; it is listed here
// only so a future migration added with its own preprovision/cleanup keeps this table
// consistent, not because it is currently ambiguous.
const PRIOR_BUILD_COMPLETION_POINTS = [
  '0041_activity_media_evidence',
  '0042_proof_session_beneficiary_count',
]

export function planIndexForAppliedCount(appliedCount, { residualOwnerMemberships = false } = {}) {
  const plan = buildPlan()
  if (appliedCount === 0) return 0
  for (const migration of PRIOR_BUILD_COMPLETION_POINTS) {
    const migrationIndex = MIGRATIONS_IN_ORDER.indexOf(migration)
    if (migrationIndex !== -1 && appliedCount === migrationIndex + 1) {
      if (migration === '0041_activity_media_evidence' && residualOwnerMemberships) {
        const cleanupStepIndex = plan.findIndex(
          (step) => step.type === 'cleanup' && step.name === 'activity-media',
        )
        if (cleanupStepIndex === -1) {
          throw new Error('Could not locate the activity-media cleanup step')
        }
        return cleanupStepIndex
      }
      const nextMigration = MIGRATIONS_IN_ORDER[migrationIndex + 1]
      const nextStepIndex = plan.findIndex(
        (step) => step.type === 'deploy' && step.migrations.includes(nextMigration),
      )
      if (nextStepIndex === -1) {
        throw new Error(`Could not locate a deploy step for migration ${nextMigration}`)
      }
      return nextStepIndex
    }
  }
  const lastApplied = MIGRATIONS_IN_ORDER[appliedCount - 1]
  const stepIndex = plan.findIndex(
    (step) => step.type === 'deploy' && step.migrations.includes(lastApplied),
  )
  if (stepIndex === -1) {
    throw new Error(`Could not locate a deploy step for migration ${lastApplied}`)
  }
  return stepIndex + 1
}
