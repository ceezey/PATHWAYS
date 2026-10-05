// The ordered build plan for scripts/db/hosted-build.mjs, kept separate and
// pure (no I/O) so it can be unit tested in isolation. Mirrors the sequence
// in scripts/db/local-reset.mjs, staged for a hosted, non-Docker target.

export const BASELINE = '0000_pathways_baseline_through_0026'

// The exact 40-row migration ledger (baseline plus 0027-0057 and 0058-0065) this script must produce, in order. This is
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
  '0061_activity_extension_requests',
  '0062_rules_escalated_alert_list',
  '0063_rules_scope_memo',
  '0064_evaluation_write_path',
  '0065_zone_check_memo',
  '0065_beneficiary_reach_kpi_values',
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
    // 0044 replaces two rules-owned SECURITY DEFINER functions (owners rules_enqueue_owner and
    // rules_source_proof_owner), so it needs a temporary SET-only owner chain, like 0041.
    {
      type: 'preprovision',
      name: 'activity-review',
      file: 'hosted-activity-review-preprovision.sql',
    },
    { type: 'deploy', migrations: range(44, 44) },
    { type: 'cleanup', name: 'activity-review', file: 'hosted-activity-review-cleanup.sql' },
    // 0045 needs no preprovision: it adds two functions only, and prisma already owns
    // pathways.p06_can, pathways.assessment_results, pathways.project_activities and
    // pathways.project_milestones from the 0000 baseline.
    { type: 'deploy', migrations: range(45, 45) },
    // 0046-0052 need no preprovision: prisma already owns every table and function they touch
    // (0046 adds its own table; 0047, 0048 and 0051 wrap pathways.p09_role_allows). One step each
    // so --resume after a partial ledger restarts at the first unapplied migration.
    ...range(46, 52).map((name) => ({ type: 'deploy', migrations: [name] })),
    // 0053 replaces pathways.p34_submit_expense, owned by finance_operation_owner, so it needs a
    // temporary SET-only membership for prisma, like 0044.
    {
      type: 'preprovision',
      name: 'expense-submit',
      file: 'hosted-expense-submit-preprovision.sql',
    },
    { type: 'deploy', migrations: range(53, 53) },
    { type: 'cleanup', name: 'expense-submit', file: 'hosted-expense-submit-cleanup.sql' },
    // 0054 needs no preprovision: prisma owns pathways.p09_role_allows and p09_role_allows_0048.
    { type: 'deploy', migrations: range(54, 54) },
    // 0055 needs no preprovision: prisma owns pathways.p09_role_allows.
    { type: 'deploy', migrations: range(55, 55) },
    // 0056 replaces two functions owned by rules_enqueue_owner, so it needs the same temporary
    // SET-only chain as 0041, through its own scripts.
    {
      type: 'preprovision',
      name: 'indicator-type',
      file: 'hosted-indicator-type-preprovision.sql',
    },
    { type: 'deploy', migrations: range(56, 56) },
    { type: 'cleanup', name: 'indicator-type', file: 'hosted-indicator-type-cleanup.sql' },
    // 0057 needs no preprovision: prisma owns p06_can, p10_f9_survey_aggregate and the source tables.
    { type: 'deploy', migrations: range(57, 57) },
    // 0058 needs no preprovision: it only adds one enum label owned by prisma.
    { type: 'deploy', migrations: range(58, 58) },
    // 0059 and 0060 replace rules-owned SECURITY DEFINER functions and change policies on rules_store_owner tables,
    // so one temporary SET-only owner chain covers both, like 0044.
    { type: 'preprovision', name: 'rules-catalog', file: 'hosted-rules-catalog-preprovision.sql' },
    { type: 'deploy', migrations: range(59, 59) },
    { type: 'deploy', migrations: range(60, 60) },
    { type: 'cleanup', name: 'rules-catalog', file: 'hosted-rules-catalog-cleanup.sql' },
    // 0061 needs no preprovision: prisma owns every table and helper it references.
    { type: 'deploy', migrations: range(61, 61) },
    // 0062 creates a function owned by rules_human_owner, so it needs a temporary SET-only membership, like 0053.
    {
      type: 'preprovision',
      name: 'rules-escalation',
      file: 'hosted-rules-escalation-preprovision.sql',
    },
    { type: 'deploy', migrations: range(62, 62) },
    { type: 'cleanup', name: 'rules-escalation', file: 'hosted-rules-escalation-cleanup.sql' },
    // 0063 replaces a function owned by rules_eligibility_owner under a rules_store_owner CREATE loan, so it needs a temporary SET-only chain to both.
    {
      type: 'preprovision',
      name: 'rules-scope-memo',
      file: 'hosted-rules-scope-memo-preprovision.sql',
    },
    { type: 'deploy', migrations: range(63, 63) },
    { type: 'cleanup', name: 'rules-scope-memo', file: 'hosted-rules-scope-memo-cleanup.sql' },
    // 0064 needs no preprovision: prisma owns the evaluation tables, policies and p3_guard_evaluation.
    { type: 'deploy', migrations: range(64, 64) },
    // 0065 needs no preprovision: prisma owns both p06 functions and the new helper.
    { type: 'deploy', migrations: range(65, 65) },
    // 0065 needs no preprovision: prisma owns every function and source table it reads.
    { type: 'deploy', migrations: range(66, 66) },
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
      'Ledger is not an exact finished prefix of the expected 0000-0065 migrations; --resume refuses it',
    )
  }
  return appliedCount
}

// Maps a count of already-applied migrations (from assertResumablePrefix) to
// the plan step index to resume at. Cleanup steps are not tracked by the
// Prisma ledger, so when resuming right after a migration that has a
// following cleanup step (0031, 0034, 0041, 0044, 0053, 0060, 0062, 0063), that cleanup step is re-run;
// each cleanup script's own preconditions reject a target that was already
// cleaned, surfacing a clear error rather than silently skipping it.
//
// Some ledgers are, alone, ambiguous, because a temporary owner-role chain (preprovision) is
// granted before and revoked after a deploy and the Prisma ledger cannot see either:
//  * 0041_activity_media_evidence and 0044_activity_progress_review are both (a) the terminal
//    state of a completed build (cleanup already ran) and (b) the state of a build that crashed
//    between the deploy and its own cleanup, which never ran (see the in-process catch in
//    runHostedBuild / hosted-build.mjs). Both have the same appliedCount.
//  * 0043_activity_overdue_explanation is (a) a plain ledger that still needs the 0044
//    preprovision, or (b) a build that crashed after that preprovision and before the 0044
//    deploy, whose temporary chain is still granted (the preprovision would refuse to run again).
//  * 0052_signin_password_hook and 0053_expense_submit_race follow the same two shapes for the 0053
//    expense-submit preprovision and cleanup (temporary finance_operation_owner membership).
//  * 0058_rules_decision_status_auto_resolved and 0060_rules_budget_beneficiary_survey_metrics follow the same
//    two shapes for the rules-catalog chain shared by 0059 and 0060; a ledger ending at 0059 always resumes at
//    the 0060 deploy, whose own precondition fails closed when the chain is not granted.
//  * 0061_activity_extension_requests and 0062_rules_escalated_alert_list follow the same two shapes for the
//    rules-escalation membership (temporary rules_human_owner SET chain) granted before and revoked after 0062.
//  * 0062_rules_escalated_alert_list and 0063_rules_scope_memo follow the same two shapes for the
//    rules-scope-memo membership (temporary rules_store_owner and rules_eligibility_owner SET chain) granted before and revoked after 0063.
//    A 0062 ledger with a residual chain resumes at the rules-escalation cleanup, whose own precondition rejects it
//    when the residual chain is the 0063 one.
// The caller therefore checks live database state (whether prisma still holds a temporary
// rules owner membership) and passes it in as `residualOwnerMemberships`.
// 0042_proof_session_beneficiary_count has no preprovision/cleanup pair (see buildPlan), so a
// ledger stopped exactly there is unambiguous and always resumes at the 0043 deploy.
const PRIOR_BUILD_COMPLETION_POINTS = [
  '0041_activity_media_evidence',
  '0042_proof_session_beneficiary_count',
  '0043_activity_overdue_explanation',
  '0044_activity_progress_review',
  '0052_signin_password_hook',
  '0053_expense_submit_race',
  '0055_rbac_v4_grants',
  '0056_indicator_type',
  '0058_rules_decision_status_auto_resolved',
  '0060_rules_budget_beneficiary_survey_metrics',
  '0061_activity_extension_requests',
  '0062_rules_escalated_alert_list',
  '0063_rules_scope_memo',
]

// The migrations whose completion is ambiguous with a residual temporary owner chain, and the
// cleanup step that revokes it.
export const RESIDUAL_CHAIN_CLEANUPS = Object.freeze({
  '0041_activity_media_evidence': 'activity-media',
  '0044_activity_progress_review': 'activity-review',
  '0053_expense_submit_race': 'expense-submit',
  '0056_indicator_type': 'indicator-type',
  '0060_rules_budget_beneficiary_survey_metrics': 'rules-catalog',
  '0062_rules_escalated_alert_list': 'rules-escalation',
  '0063_rules_scope_memo': 'rules-scope-memo',
})
// Ledger counts at which the caller must read live owner-membership state.
export const RESIDUAL_CHAIN_MIGRATIONS = Object.freeze([
  '0041_activity_media_evidence',
  '0043_activity_overdue_explanation',
  '0044_activity_progress_review',
  '0052_signin_password_hook',
  '0053_expense_submit_race',
  '0055_rbac_v4_grants',
  '0056_indicator_type',
  '0058_rules_decision_status_auto_resolved',
  '0060_rules_budget_beneficiary_survey_metrics',
  '0061_activity_extension_requests',
  '0062_rules_escalated_alert_list',
  '0063_rules_scope_memo',
])

export function planIndexForAppliedCount(appliedCount, { residualOwnerMemberships = false } = {}) {
  const plan = buildPlan()
  if (appliedCount === 0) return 0
  for (const migration of PRIOR_BUILD_COMPLETION_POINTS) {
    const migrationIndex = MIGRATIONS_IN_ORDER.indexOf(migration)
    if (migrationIndex !== -1 && appliedCount === migrationIndex + 1) {
      const cleanupName = RESIDUAL_CHAIN_CLEANUPS[migration]
      if (cleanupName && residualOwnerMemberships) {
        const cleanupStepIndex = plan.findIndex(
          (step) => step.type === 'cleanup' && step.name === cleanupName,
        )
        if (cleanupStepIndex === -1) {
          throw new Error(`Could not locate the ${cleanupName} cleanup step`)
        }
        return cleanupStepIndex
      }
      const nextMigration = MIGRATIONS_IN_ORDER[migrationIndex + 1]
      if (nextMigration === undefined) {
        const finalIndex = plan.findIndex((step) => step.type === 'alter-runtime-role')
        if (finalIndex === -1) throw new Error('Could not locate the alter-runtime-role step')
        return finalIndex
      }
      const nextStepIndex = plan.findIndex(
        (step) => step.type === 'deploy' && step.migrations.includes(nextMigration),
      )
      if (nextStepIndex === -1) {
        throw new Error(`Could not locate a deploy step for migration ${nextMigration}`)
      }
      // A deploy that is preceded by its own preprovision resumes at that preprovision, unless
      // the temporary chain is already granted (a crash after the preprovision): then the
      // preprovision would refuse to run again and the resume goes straight to the deploy.
      const previous = plan[nextStepIndex - 1]
      if (previous?.type === 'preprovision' && !residualOwnerMemberships) return nextStepIndex - 1
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
