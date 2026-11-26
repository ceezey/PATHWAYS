# Called inside the guarded synthetic Replay-Local cluster, after 0028 parity.
# Non-secret placeholder for a trust-auth disposable cluster; overridable from the environment.
$trustLocalPlaceholder = if ($env:PHASE2_TRUST_PLACEHOLDER) { $env:PHASE2_TRUST_PLACEHOLDER } else { 'trust-local' }
if (-not $MigrationBaseline -or -not $phase6Started -or $phase6Port -le 0 -or
    $phase6Database -cne 'pathways_phase4_phase6_replay') { throw 'Forward verification requires owned baseline replay.' }
$forwardDatabases = @($phase6Database, 'pathways_phase4_baseline', 'pathways_phase4_forward_fault', 'pathways_phase4_forward_restore', 'pathways_phase4_core_fault', 'pathways_phase4_core_retry', 'pathways_phase4_pdf_fault', 'pathways_phase4_pdf_retry', 'pathways_phase4_pin_fault', 'pathways_phase4_pin_retry', 'pathways_phase4_import_fault', 'pathways_phase4_import_retry', 'pathways_phase4_partner_fault', 'pathways_phase4_partner_retry', 'pathways_phase4_partner_suite', 'pathways_phase4_drf_fault', 'pathways_phase4_drf_retry', 'pathways_phase4_media_fault', 'pathways_phase4_media_retry', 'pathways_phase4_psc_fault', 'pathways_phase4_psc_retry', 'pathways_phase4_oex_fault', 'pathways_phase4_oex_retry', 'pathways_phase4_prv_fault', 'pathways_phase4_prv_retry', 'pathways_phase4_f9a_fault', 'pathways_phase4_f9a_retry', 'pathways_phase4_rar_fault', 'pathways_phase4_rar_retry', 'pathways_phase4_rmt_fault', 'pathways_phase4_rmt_retry', 'pathways_phase4_legacy_guard', 'pathways_phase4_audit_race')
$forwardStage = Join-Path $phase6Parent 'forward-migrations'
New-Item -ItemType Directory -Path $forwardStage | Out-Null
foreach ($name in @($baselineName,'0027_revised_csv_rbac','0028_revised_aggregate_permission_guards')) {
  Copy-Item -LiteralPath (Join-Path $phase6Root "apps/api/prisma/migrations/$name") -Destination $forwardStage -Recurse
}
Copy-Item -LiteralPath (Join-Path $baselineStage 'migration_lock.toml') -Destination $forwardStage
$forwardMigrations = @(Get-ChildItem -LiteralPath (Join-Path $phase6Root 'apps/api/prisma/migrations') -Directory |
  Where-Object { $_.Name -cmatch '^\d{4}_' -and [int]$_.Name.Substring(0,4) -ge 29 } | Sort-Object Name)
# Reviewed forward inventory, one migration per line. A new migration adds one line here
# plus its own self-contained verification section below.
$forwardInventory = @(
  '0029_core_registration_and_import_support'
  '0030_core_profile_partners'
  '0031_f10_f11_rules_runtime'
  '0032_core_workflow_actor_locks'
  '0033_core_canonical_activity_review_guard'
  '0034_core_feature_completion'
  '0035_admin_read_access'
  '0036_import_pdf_file_type'
  '0037_step_up_pin'
  '0038_import_smart_mapping'
  '0039_project_partner_backfill'
  '0040_default_registration_form'
  '0041_activity_media_evidence'
  '0042_proof_session_beneficiary_count'
  '0043_activity_overdue_explanation'
  '0044_activity_progress_review'
  '0045_f9_descriptive_aggregates'
  '0046_signin_lockout'
  '0047_revoke_sa_journeys_read'
  '0048_identity_review_grant'
  '0049_journey_event_note'
  '0050_import_value_map'
  '0051_indicator_library'
  '0052_signin_password_hook'
  '0053_expense_submit_race'
  '0054_p09_role_allows_grants'
  '0055_rbac_v4_grants'
  '0056_indicator_type'
  '0057_f9_survey_period_release'
  '0058_rules_decision_status_auto_resolved'
  '0059_rules_recommendation_auto_resolve'
  '0060_rules_budget_beneficiary_survey_metrics'
  '0061_activity_extension_requests'
  '0062_rules_escalated_alert_list'
  '0063_rules_scope_memo'
  '0064_evaluation_write_path'
  '0065_zone_check_memo'
  '0066_beneficiary_reach_kpi_values'
  '0067_beneficiary_progress_read'
  '0068_timeline_final_position'
  '0069_evaluation_auto_scoring'
  '0070_activity_escalations'
  '0071_assessment_score_entry'
  '0072_severity_classification'
  '0073_rules_kpi_assessment_metrics'
  '0074_indicator_measurement_lookup'
  '0075_indicator_summary_measurement_lookup'
  '0076_saddd_exact_counts'
  '0077_saddd_by_place'
  '0078_form_field_intake_metadata'
  '0079_import_date_order_and_sheet'
  '0080_participant_file_import'
  '0081_submission_check_once'
  '0082_permission_check_plpgsql'
  '0083_stage_import'
  '0084_smart_mapping_v4'
  '0085_public_tracker_live_revision'
  '0086_public_tracker_media'
  '0087_public_tracker_analytics'
  '0088_smart_mapping_v5'
  '0089_project_map_pins'
  '0090_test_case_gap_closure'
  '0091_backup_recovery'
  '0092_rules_outcomes_freshness'
  '0093_alert_outcome_notes'
  '0094_session_management'
  '0095_retire_legacy_public_tables'
  '0096_audit_tamper_evidence'
  '0097_publication_checklist'
  '0098_rate_limiting'
)
if (($forwardMigrations.Name -join ',') -cne ($forwardInventory -join ',')) { throw 'Forward migration inventory requires renewed review.' }

function Assert-ForwardTarget([string]$Database) {
  if ($Database -cnotin $forwardDatabases) { throw 'Unapproved forward database.' }
  $identity = (& $phase6Tools['psql'] -X -q -A -t -w -h 127.0.0.1 -p $phase6Port -U postgres -d $Database -v ON_ERROR_STOP=1 -c "SELECT json_build_object('database',current_database(),'host',host(inet_server_addr()),'port',inet_server_port(),'data',current_setting('data_directory'));") | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $identity.database -cne $Database -or $identity.host -cne '127.0.0.1' -or $identity.port -ne $phase6Port -or
      [IO.Path]::GetFullPath($identity.data) -cne [IO.Path]::GetFullPath($phase6Data)) { throw 'Forward cluster identity differs.' }
}
function Read-ForwardSql([string]$Database, [string]$Sql) {
  Assert-ForwardTarget $Database
  $result = $Sql | & $phase6Tools['psql'] -X -q -A -t -w -h 127.0.0.1 -p $phase6Port -U postgres -d $Database -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw 'Forward assertion SQL failed.' }
  return ($result -join "`n")
}
function Read-ForwardData([string]$Database) {
  $inventory = [IO.File]::ReadAllText((Join-Path $phase6Root 'infra/supabase/migration-reconciliation/baseline-data-inventory.sql'))
  $inventory = $inventory.Replace("namespace.nspname IN ('pathways', 'public')", "namespace.nspname IN ('pathways', 'public', 'pathways_rules_internal')")
  if ($inventory -notmatch "namespace.nspname IN \('pathways', 'public', 'pathways_rules_internal'\)") { throw 'Forward inventory schema coverage differs.' }
  return Read-ForwardSql $Database ("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='60s'; SET LOCAL lock_timeout='5s'; SET LOCAL search_path=pg_catalog; SET LOCAL TimeZone='UTC';" + $inventory + "ROLLBACK;")
}
function Read-ForwardLedger([string]$Database, [string]$Predicate = 'true') {
  return Read-ForwardSql $Database "SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY migration_name),'[]'::jsonb)::text FROM public._prisma_migrations m WHERE $Predicate;"
}
function Read-ForwardPostgresLog {
  Assert-ForwardTarget 'pathways_phase4_baseline'
  $stream = [IO.FileStream]::new((Join-Path $phase6Parent 'postgres.log'), [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  $reader = $null
  try { $reader = [IO.StreamReader]::new($stream); return $reader.ReadToEnd() }
  finally { if ($null -ne $reader) { $reader.Dispose() }; $stream.Dispose() }
}
function Read-ForwardDatabaseAcl([string]$Database) {
  return Read-ForwardSql $Database @'
SELECT jsonb_build_object('owner',pg_catalog.pg_get_userbyid(d.datdba),'grants',
 (SELECT jsonb_agg(jsonb_build_array(a.grantee,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,pg_catalog.pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) ORDER BY a.grantee,a.grantor,a.privilege_type,a.is_grantable)
  FROM pg_catalog.aclexplode(coalesce(d.datacl,pg_catalog.acldefault('d',d.datdba))) a))::text
FROM pg_catalog.pg_database d WHERE d.datname=current_database();
'@
}
function Restore-ForwardDatabaseAcl([string]$Database) {
  if ($Database -cnotin $forwardDatabases[2..($forwardDatabases.Count - 1)]) { throw 'Database ACL restoration requires a fixed restored clone.' }
  Assert-ForwardTarget 'pathways_phase4_baseline'
  Assert-ForwardTarget $Database
  Invoke-LocalSql (@'
BEGIN;
DO $acl$
DECLARE source_db record;target_db record;entry record;principal text;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>__PORT__ OR current_database() NOT IN ('pathways_phase4_forward_fault','pathways_phase4_forward_restore','pathways_phase4_core_fault','pathways_phase4_core_retry','pathways_phase4_pdf_fault','pathways_phase4_pdf_retry','pathways_phase4_pin_fault','pathways_phase4_pin_retry','pathways_phase4_import_fault','pathways_phase4_import_retry','pathways_phase4_partner_fault','pathways_phase4_partner_retry','pathways_phase4_drf_fault','pathways_phase4_drf_retry','pathways_phase4_media_fault','pathways_phase4_media_retry','pathways_phase4_psc_fault','pathways_phase4_psc_retry','pathways_phase4_oex_fault','pathways_phase4_oex_retry','pathways_phase4_prv_fault','pathways_phase4_prv_retry','pathways_phase4_f9a_fault','pathways_phase4_f9a_retry','pathways_phase4_rar_fault','pathways_phase4_rar_retry','pathways_phase4_rmt_fault','pathways_phase4_rmt_retry') THEN RAISE EXCEPTION 'Only owned restored database ACLs may be reconstructed'; END IF;
 SELECT * INTO STRICT source_db FROM pg_catalog.pg_database WHERE datname='pathways_phase4_baseline';
 SELECT * INTO STRICT target_db FROM pg_catalog.pg_database WHERE datname=current_database();
 IF source_db.datdba<>target_db.datdba OR source_db.datdba<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='postgres') THEN RAISE EXCEPTION 'Unexpected source/restore database owner'; END IF;
 IF EXISTS(SELECT FROM pg_catalog.aclexplode(coalesce(source_db.datacl,pg_catalog.acldefault('d',source_db.datdba))) a WHERE a.grantor<>source_db.datdba OR a.privilege_type NOT IN ('CREATE','CONNECT','TEMPORARY') OR (a.grantee<>0 AND NOT EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.oid=a.grantee))) THEN RAISE EXCEPTION 'Unsupported source database ACL'; END IF;
 FOR entry IN SELECT DISTINCT a.grantee FROM pg_catalog.aclexplode(coalesce(target_db.datacl,pg_catalog.acldefault('d',target_db.datdba))) a UNION SELECT DISTINCT a.grantee FROM pg_catalog.aclexplode(coalesce(source_db.datacl,pg_catalog.acldefault('d',source_db.datdba))) a LOOP
  principal:=CASE WHEN entry.grantee=0 THEN 'PUBLIC' ELSE (SELECT pg_catalog.format('%I',r.rolname) FROM pg_catalog.pg_roles r WHERE r.oid=entry.grantee) END;
  IF principal IS NULL THEN RAISE EXCEPTION 'Unresolved target ACL principal'; END IF;
  EXECUTE pg_catalog.format('REVOKE ALL ON DATABASE %I FROM %s',current_database(),principal);
 END LOOP;
 FOR entry IN SELECT * FROM pg_catalog.aclexplode(coalesce(source_db.datacl,pg_catalog.acldefault('d',source_db.datdba))) LOOP
  principal:=CASE WHEN entry.grantee=0 THEN 'PUBLIC' ELSE (SELECT pg_catalog.format('%I',r.rolname) FROM pg_catalog.pg_roles r WHERE r.oid=entry.grantee) END;
  EXECUTE pg_catalog.format('GRANT %s ON DATABASE %I TO %s%s',entry.privilege_type,current_database(),principal,CASE WHEN entry.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
 END LOOP;
END $acl$;
COMMIT;
'@).Replace('__PORT__', "$phase6Port") $Database
  if ((Read-ForwardDatabaseAcl $Database) -cne (Read-ForwardDatabaseAcl 'pathways_phase4_baseline')) { throw 'Restored database ACL differs from source, including default PUBLIC rights.' }
}

function Invoke-ForwardDeploy {
  param(
    [Parameter(Mandatory)][string]$Database,
    [switch]$Provision,
    [switch]$ExpectFailure,
    [switch]$ProvisionCore,
    [switch]$ProvisionPin,
    [switch]$ProvisionMedia,
    [switch]$ProvisionReview,
    [switch]$ProvisionExpense,
    [switch]$ProvisionRulesCatalog,
    [switch]$ProvisionRulesEscalation,
    [switch]$ProvisionRulesScopeMemo,
    [switch]$ProvisionRulesSeverity,
    [switch]$ProvisionRulesMetrics,
    [switch]$ProvisionIndicatorSummary,
    [switch]$ProvisionSadddExact,
    [switch]$ProvisionTestCaseGaps,
    [switch]$ProvisionBackup,
    [switch]$ProvisionRulesOutcomes,
    [switch]$ProvisionAlertNotes
  )
  Assert-ForwardTarget $Database
  $beforeDeployLog = Read-ForwardPostgresLog
  $env:PATHWAYS_PHASE6_REPLAY_MIGRATIONS = $forwardStage
  $env:DIRECT_URL = "postgresql://prisma@127.0.0.1:${phase6Port}/${Database}?sslmode=disable&connection_limit=1"
  $env:DATABASE_URL = $env:DIRECT_URL
  try {
    if ($Provision) {
      Invoke-LocalSql "REVOKE CREATE,TEMPORARY ON DATABASE $Database FROM PUBLIC,pathways_runtime;" $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-preprovision.sql'))) $Database
    }
    if ($ProvisionCore) {
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-core-preprovision.sql'))) $Database
    }
    if ($ProvisionPin) {
      # Idempotent DBA prerequisite for 0037; runs in the post-0031/0034-cleanup role state.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-step-up-pin-preprovision.sql'))) $Database
    }
    if ($ProvisionMedia) {
      # Idempotent DBA prerequisite for 0041; temporary SET-only chain to the rules owner roles.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-activity-media-preprovision.sql'))) $Database
    }
    if ($ProvisionReview) {
      # DBA prerequisite for 0044; temporary SET-only chain to the rules owner roles.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-activity-review-preprovision.sql'))) $Database
    }
    if ($ProvisionExpense) {
      # DBA prerequisite for 0053; temporary SET-only membership to finance_operation_owner.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-expense-submit-preprovision.sql'))) $Database
    }
    if ($ProvisionRulesCatalog) {
      # DBA prerequisite for 0059 and 0060; temporary SET-only chain to six rules owner roles.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-catalog-preprovision.sql'))) $Database
    }
    if ($ProvisionRulesEscalation) {
      # DBA prerequisite for 0062; temporary SET-only membership to rules_human_owner.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-escalation-preprovision.sql'))) $Database
    }
    if ($ProvisionRulesScopeMemo) {
      # DBA prerequisite for 0063; temporary SET-only membership to rules_eligibility_owner.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-scope-memo-preprovision.sql'))) $Database
    }
    if ($ProvisionRulesSeverity) {
      # DBA prerequisite for 0072; temporary SET-only chain to six rules owner roles.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-severity-preprovision.sql'))) $Database
    }
    if ($ProvisionRulesMetrics) {
      # DBA prerequisite for 0073; temporary SET-only chain to three rules owner roles.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-metrics-preprovision.sql'))) $Database
    }
    if ($ProvisionIndicatorSummary) {
      # DBA prerequisite for 0075; temporary SET-only membership to report_projection_owner.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-indicator-summary-preprovision.sql'))) $Database
    }
    if ($ProvisionSadddExact) {
      # DBA prerequisite for 0076; temporary SET-only chain to the report and rules owner roles.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-saddd-exact-preprovision.sql'))) $Database
    }
    if ($ProvisionTestCaseGaps) {
      # DBA prerequisite for 0090; temporary SET-only chain to rules_store_owner and rules_config_owner.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-test-case-gaps-preprovision.sql'))) $Database
    }
    if ($ProvisionBackup) {
      # DBA prerequisite for 0091; temporary SET-only chain to the backup, rules store, rules context and report owners.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-backup-preprovision.sql'))) $Database
    }
    if ($ProvisionRulesOutcomes) {
      # DBA prerequisite for 0092; temporary SET-only chain to six rules owner roles.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-outcomes-preprovision.sql'))) $Database
    }
    if ($ProvisionAlertNotes) {
      # DBA prerequisite for 0093; temporary SET-only chain to three rules owner roles.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-alert-notes-preprovision.sql'))) $Database
    }
    # Native failure is expected only for the isolated copied fault migration.
    $savedPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      $output = (& pnpm --filter @pathways/api exec prisma migrate deploy --config $phase6Config 2>&1) -join "`n"
      $deployExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $savedPreference }
    [IO.File]::WriteAllText((Join-Path $phase6Parent ($Database + '-forward-deploy.log')), $output)
    if ($deployExit -ne 0) {
      Write-Output $output
      $afterDeployLog = Read-ForwardPostgresLog
      if (-not $afterDeployLog.StartsWith($beforeDeployLog,[StringComparison]::Ordinal)) { throw 'Owned PostgreSQL log changed before diagnostic interval capture.' }
      $failedLog = $afterDeployLog.Substring($beforeDeployLog.Length)
      [IO.File]::WriteAllText(($phase6Parent + '-' + $Database + '-failed-postgres.log'), $failedLog)
      if ($ExpectFailure) { $script:forwardFaultLog = $failedLog }
    }
    if ($ExpectFailure) {
      if ($deployExit -eq 0) { throw 'Injected forward failure did not fail.' }
    } elseif ($deployExit -ne 0) { throw "Forward Prisma deployment failed for $Database." }
  } finally {
    if ($ProvisionCore) {
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-core-cleanup.sql'))) $Database
    }
    if ($Provision) {
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-cleanup.sql'))) $Database
    }
    if ($ProvisionMedia) {
      # Run after a successful 0041 deploy and also after a failed/rolled-back attempt.
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-activity-media-cleanup.sql'))) $Database
    }
    if ($ProvisionExpense) {
      # Run after a successful 0053 deploy and also after a failed/rolled-back attempt.
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-expense-submit-cleanup.sql'))) $Database
    }
    if ($ProvisionReview) {
      # Run after a successful 0044 deploy and also after a failed/rolled-back attempt.
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-activity-review-cleanup.sql'))) $Database
    }
    if ($ProvisionRulesCatalog) {
      # Run after a successful 0059 or 0060 deploy and also after a failed/rolled-back attempt.
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-catalog-cleanup.sql'))) $Database
    }
    if ($ProvisionRulesEscalation) {
      # Run after a successful 0062 deploy and also after a failed/rolled-back attempt.
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-escalation-cleanup.sql'))) $Database
    }
    if ($ProvisionRulesScopeMemo) {
      # Run after a successful 0063 deploy and also after a failed/rolled-back attempt.
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-scope-memo-cleanup.sql'))) $Database
    }
    if ($ProvisionRulesSeverity) {
      # Run after a successful 0072 deploy and also after a failed/rolled-back attempt.
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-severity-cleanup.sql'))) $Database
    }
    if ($ProvisionRulesMetrics) {
      # Run after a successful 0073 deploy and also after a failed/rolled-back attempt.
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-metrics-cleanup.sql'))) $Database
    }
    if ($ProvisionIndicatorSummary) {
      # Run after a successful 0075 deploy and also after a failed/rolled-back attempt.
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-indicator-summary-cleanup.sql'))) $Database
    }
    if ($ProvisionSadddExact) {
      # Run after a successful 0076 deploy and also after a failed/rolled-back attempt.
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-saddd-exact-cleanup.sql'))) $Database
    }
    if ($ProvisionTestCaseGaps) {
      # Run after a successful 0090 deploy and also after a failed/rolled-back attempt.
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-test-case-gaps-cleanup.sql'))) $Database
    }
    if ($ProvisionBackup) {
      # Run after a successful 0091 deploy and also after a failed/rolled-back attempt.
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-backup-cleanup.sql'))) $Database
    }
    if ($ProvisionRulesOutcomes) {
      # Run after a successful 0092 deploy and also after a failed/rolled-back attempt.
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-outcomes-cleanup.sql'))) $Database
    }
    if ($ProvisionAlertNotes) {
      # Run after a successful 0093 deploy and also after a failed/rolled-back attempt.
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-alert-notes-cleanup.sql'))) $Database
    }
  }
  if (($Provision -or $ProvisionCore) -and -not $ExpectFailure) {
    Assert-ForwardTarget $Database
    Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-function-validation.sql'))) $Database
    Write-Output "FORWARD_FUNCTION_COMPILATION_${Database}=PASS"
  }
}
function Invoke-ForwardFaultRetryClones {
  # Shared pre-N dump/clone/restore/ACL/parity/inject/restore-file/marker sequence used by the
  # 0038-0041 independent fault/retry clone blocks. Each caller supplies only what differs:
  # the migration, its on-disk path, the message/marker label and the injected fault token.
  param(
    [Parameter(Mandatory)][string]$Migration,
    [Parameter(Mandatory)][string]$MigrationPath,
    [Parameter(Mandatory)][string]$Label,
    [Parameter(Mandatory)][string]$Token,
    [Parameter(Mandatory)][string]$FaultDatabase,
    [Parameter(Mandatory)][string]$RetryDatabase,
    [switch]$ProvisionMedia,
    [switch]$ProvisionReview,
    [switch]$ProvisionRulesCatalog
  )
  $snapshot = Join-Path $phase6Parent ('forward-pre' + $Label + '.dump')
  Assert-ForwardTarget 'pathways_phase4_baseline'
  & $phase6Tools['pg_dump'] -w -h 127.0.0.1 -p $phase6Port -U postgres -d pathways_phase4_baseline --format=custom --file=$snapshot
  if ($LASTEXITCODE -ne 0) { throw "$Label recovery backup failed." }
  foreach ($db in @($FaultDatabase, $RetryDatabase)) {
    Invoke-LocalSql "CREATE DATABASE $db;" 'postgres'
    Assert-ForwardTarget $db
    & $phase6Tools['pg_restore'] -w -h 127.0.0.1 -p $phase6Port -U postgres -d $db --exit-on-error $snapshot
    if ($LASTEXITCODE -ne 0) { throw "$Label recovery restore failed." }
    Restore-ForwardDatabaseAcl $db
    if ((Read-ForwardLedger $db) -cne (Read-ForwardLedger 'pathways_phase4_baseline')) { throw "$Label recovery changed original ledger." }
    Assert-ForwardParity 'pathways_phase4_baseline' $db
    if ((Read-ForwardData $db) -cne (Read-ForwardData 'pathways_phase4_baseline')) { throw "$Label recovery changed table data." }
  }
  # Invoke-ForwardDeploy performs the preprovision/cleanup pair itself when -ProvisionMedia is
  # set; an extra manual call here would double-grant and trip its own already-granted guard.
  $beforeLedger = Read-ForwardLedger $FaultDatabase
  $beforeCatalog = Read-ForwardCatalog $FaultDatabase
  $beforeData = Read-ForwardData $FaultDatabase
  $faultPath = Join-Path $forwardStage ($Migration + '/migration.sql')
  $canonicalSql = [IO.File]::ReadAllText($faultPath)
  if ($canonicalSql -notmatch '(?s)COMMIT;\s*$') { throw "Unexpected $Label fault injection boundary." }
  try {
    $faultSql = [regex]::Replace($canonicalSql, 'COMMIT;\s*$', "DO `$fault`$ BEGIN RAISE EXCEPTION 'PATHWAYS_EXPECTED_${Token}_FORWARD_FAULT'; END `$fault`$;`nCOMMIT;`n")
    [IO.File]::WriteAllText($faultPath, $faultSql)
    Invoke-ForwardDeploy -Database $FaultDatabase -ExpectFailure -ProvisionMedia:$ProvisionMedia -ProvisionReview:$ProvisionReview -ProvisionRulesCatalog:$ProvisionRulesCatalog
  } finally { Copy-Item -LiteralPath (Join-Path $MigrationPath 'migration.sql') -Destination $faultPath -Force }
  if ((Read-ForwardLedger $FaultDatabase "migration_name<>'$Migration'") -cne $beforeLedger -or
      (Read-ForwardCatalog $FaultDatabase) -cne $beforeCatalog -or (Read-ForwardData $FaultDatabase) -cne $beforeData) {
    throw "Injected $Label failure changed pre$Label ledger, catalog, data or database ACL."
  }
  if ($script:forwardFaultLog -notmatch "(?m)^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \S+ \[\d+\] ERROR:\s+PATHWAYS_EXPECTED_${Token}_FORWARD_FAULT\s*`$") { throw "Exact $Label ERROR marker absent from this invocation interval." }
  Write-Output "${Token}_FORWARD_INJECTED_TRANSACTION_ROLLBACK=PASS"
}
function Invoke-ForwardBoundedNode {
  # Runs a node concurrency race under a bounded wall-clock timeout so a hang cannot stall the
  # replay indefinitely. Output is captured (not inherited) so the script's own PASS marker can
  # still be asserted here, in addition to the exit code.
  param(
    [Parameter(Mandatory)][string]$ScriptPath,
    [Parameter(Mandatory)][string]$ExpectedMarker,
    [int]$TimeoutMilliseconds = 180000
  )
  # Resolve the exact same node executable that `& node ...` would use, rather than letting
  # .NET's own PATH search pick a possibly different shim/install, and pin the working directory
  # to the caller's current location, since Process.Start does not otherwise guarantee either.
  $nodeCommand = Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $nodeCommand.Source
  $psi.Arguments = '"' + $ScriptPath + '"'
  $psi.WorkingDirectory = (Get-Location).ProviderPath
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $proc = [System.Diagnostics.Process]::new()
  $proc.StartInfo = $psi
  $null = $proc.Start()
  $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
  $stderrTask = $proc.StandardError.ReadToEndAsync()
  $exited = $proc.WaitForExit($TimeoutMilliseconds)
  if (-not $exited) {
    try { $proc.Kill($true) } catch { try { $proc.Kill() } catch {} }
    $null = $proc.WaitForExit(10000)
    throw "Timed out after ${TimeoutMilliseconds}ms waiting for $ScriptPath."
  }
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  if ($stdout) { Write-Output $stdout }
  if ($stderr) { Write-Output $stderr }
  if ($proc.ExitCode -ne 0) { throw "$ScriptPath failed." }
  if (($stdout + "`n" + $stderr) -notmatch [regex]::Escape($ExpectedMarker)) { throw "$ScriptPath did not emit $ExpectedMarker." }
}
function Read-ForwardCatalog([string]$Database) {
  # Extend the established comparison to include the private rules schema.
  $sql = [IO.File]::ReadAllText($rbacCatalogSql).Replace("table_schema='pathways'", "table_schema IN ('pathways','pathways_rules_internal')").Replace("n.nspname='pathways'", "n.nspname IN ('pathways','pathways_rules_internal')").Replace("schemaname='pathways'", "schemaname IN ('pathways','pathways_rules_internal')")
  $catalog = (Read-ForwardSql $Database $sql) | ConvertFrom-Json
  $securitySql = @'
SELECT jsonb_build_object(
 'schemas',(SELECT jsonb_agg(jsonb_build_array(nspname,pg_get_userbyid(nspowner),ARRAY(SELECT x::text FROM unnest(nspacl) x ORDER BY x::text)) ORDER BY nspname) FROM pg_namespace WHERE nspname IN ('pathways','pathways_rules_internal')),
 'relationOwners',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,pg_get_userbyid(c.relowner)) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('pathways','pathways_rules_internal')),
 'functionOwners',(SELECT jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_userbyid(p.proowner)) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('pathways','pathways_rules_internal')),
 'defaults',(SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(d.defaclrole),coalesce(n.nspname,''),d.defaclobjtype,ARRAY(SELECT x::text FROM unnest(d.defaclacl) x ORDER BY x::text)) ORDER BY pg_get_userbyid(d.defaclrole),coalesce(n.nspname,''),d.defaclobjtype) FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace)
)::text;
'@
  # Only forward catalogs use owner-derived effective ACLs; legacy snapshots stay unchanged.
  $effectiveTableSql = @'
SELECT jsonb_build_object('tableSecurity',coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,pg_catalog.pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity,
 ARRAY(SELECT a::text FROM unnest(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a ORDER BY a::text)) ORDER BY n.nspname,c.relname),'[]'::jsonb))::text
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('pathways','pathways_rules_internal') AND c.relkind='r';
'@
  $effectiveTables = (Read-ForwardSql $Database $effectiveTableSql) | ConvertFrom-Json
  $catalog.tableSecurity = $effectiveTables.tableSecurity
  $catalog | Add-Member -NotePropertyName tableSecurityFormat -NotePropertyValue 'OWNER_DERIVED_EFFECTIVE_ACL_V1'
  $catalog | Add-Member -NotePropertyName databaseAcl -NotePropertyValue ((Read-ForwardDatabaseAcl $Database) | ConvertFrom-Json)
  $catalog | Add-Member -NotePropertyName forwardSecurity -NotePropertyValue ((Read-ForwardSql $Database $securitySql) | ConvertFrom-Json)
  return $catalog | ConvertTo-Json -Depth 100 -Compress
}
function Assert-ForwardParity([string]$Left, [string]$Right) {
  $leftPath = Join-Path $phase6Parent ($Left + '-forward-catalog.json')
  $rightPath = Join-Path $phase6Parent ($Right + '-forward-catalog.json')
  [IO.File]::WriteAllText($leftPath, (Read-ForwardCatalog $Left))
  [IO.File]::WriteAllText($rightPath, (Read-ForwardCatalog $Right))
  python (Join-Path $phase6Root 'scripts/migrations/compare_catalogs.py') $leftPath $rightPath
  if ($LASTEXITCODE -ne 0) {
    $parityEvidenceRoot = Join-Path $phase6Root ('.tmp/forward-parity-failure-' + [guid]::NewGuid().ToString('N'))
    if (Test-Path -LiteralPath $parityEvidenceRoot) { throw 'Refusing parity diagnostic overwrite.' }
    New-Item -ItemType Directory -Path $parityEvidenceRoot | Out-Null
    $parityLeft = Join-Path $parityEvidenceRoot 'left-catalog.json'
    $parityRight = Join-Path $parityEvidenceRoot 'right-catalog.json'
    Copy-Item -LiteralPath $leftPath -Destination $parityLeft
    Copy-Item -LiteralPath $rightPath -Destination $parityRight
    $parityReceipt = [ordered]@{
      status = 'FAILED_PARITY_DIAGNOSTICS_ONLY'
      leftDatabase = $Left
      rightDatabase = $Right
      leftSha256 = (Get-FileHash -LiteralPath $parityLeft).Hash.ToLowerInvariant()
      rightSha256 = (Get-FileHash -LiteralPath $parityRight).Hash.ToLowerInvariant()
      helperSha256 = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'Verify-Forward.ps1')).Hash.ToLowerInvariant()
    }
    [IO.File]::WriteAllText((Join-Path $parityEvidenceRoot 'receipt.json'), ($parityReceipt | ConvertTo-Json))
    Write-Output ('FORWARD_PARITY_FAILURE_EVIDENCE=' + $parityEvidenceRoot)
    throw 'Forward security/catalog parity failed.'
  }
}
function Assert-ForwardChecksums([string]$Database) {
  $ledger = (Read-ForwardLedger $Database) | ConvertFrom-Json
  foreach ($migration in $forwardMigrations) {
    $rows = @($ledger | Where-Object { $_.migration_name -ceq $migration.Name })
    $checksum = (Get-FileHash -LiteralPath (Join-Path $migration.FullName 'migration.sql') -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($rows.Count -ne 1 -or $rows[0].checksum -cne $checksum -or -not $rows[0].finished_at -or $rows[0].rolled_back_at) { throw 'Forward canonical ledger checksum/completion mismatch.' }
  }
}
$forwardPriorEnvironment = @{}
foreach ($key in @('PATHWAYS_PHASE6_REPLAY_MIGRATIONS','DIRECT_URL','DATABASE_URL')) { $forwardPriorEnvironment[$key] = (Get-Item -LiteralPath "Env:$key").Value }
try {
  $originalForwardLedgers = @{}
  foreach ($db in $forwardDatabases[0..1]) { $originalForwardLedgers[$db] = Read-ForwardLedger $db }
  foreach ($migration in $forwardMigrations) {
    Copy-Item -LiteralPath $migration.FullName -Destination $forwardStage -Recurse
    if ($migration.Name -ceq '0031_f10_f11_rules_runtime') {
      # Restore a real custom-format pre-0031 backup twice: a failure target and
      # a clean recovery target. Neither target fabricates/resolves ledger rows.
      $snapshot = Join-Path $phase6Parent 'forward-pre0031.dump'
      Assert-ForwardTarget 'pathways_phase4_baseline'
      & $phase6Tools['pg_dump'] -w -h 127.0.0.1 -p $phase6Port -U postgres -d pathways_phase4_baseline --format=custom --file=$snapshot
      if ($LASTEXITCODE -ne 0) { throw 'Forward recovery backup failed.' }
      foreach ($db in $forwardDatabases[2..3]) {
        Invoke-LocalSql "CREATE DATABASE $db;" 'postgres'
        Assert-ForwardTarget $db
        & $phase6Tools['pg_restore'] -w -h 127.0.0.1 -p $phase6Port -U postgres -d $db --exit-on-error $snapshot
        if ($LASTEXITCODE -ne 0) { throw 'Forward recovery restore failed.' }
        Restore-ForwardDatabaseAcl $db
        if ((Read-ForwardLedger $db) -cne (Read-ForwardLedger 'pathways_phase4_baseline')) { throw 'Recovery changed original ledger rows.' }
        Assert-ForwardParity 'pathways_phase4_baseline' $db
        $inventorySql = [IO.File]::ReadAllText((Join-Path $phase6Root 'infra/supabase/migration-reconciliation/baseline-data-inventory.sql'))
        if ((Read-ForwardSql $db $inventorySql) -cne (Read-ForwardSql 'pathways_phase4_baseline' $inventorySql)) { throw 'Recovery changed pre0031 data digests.' }
      }
      $faultDb = 'pathways_phase4_forward_fault'
      # Complete fixed DBA database-rights reconciliation before rollback snapshots.
      Invoke-LocalSql "REVOKE CREATE,TEMPORARY ON DATABASE $faultDb FROM PUBLIC,pathways_runtime;" $faultDb
      $beforeFaultLedger = Read-ForwardLedger $faultDb
      $beforeFaultCatalog = Read-ForwardCatalog $faultDb
      $beforeFaultData = Read-ForwardSql $faultDb ([IO.File]::ReadAllText((Join-Path $phase6Root 'infra/supabase/migration-reconciliation/baseline-data-inventory.sql')))
      $faultPath = Join-Path $forwardStage ($migration.Name + '/migration.sql')
      $canonicalSql = [IO.File]::ReadAllText($faultPath)
      if ($canonicalSql -notmatch '(?s)COMMIT;\s*$') { throw 'Unexpected fault injection boundary.' }
      try {
        $faultSql = [regex]::Replace($canonicalSql, 'COMMIT;\s*$', "DO `$fault`$ BEGIN RAISE EXCEPTION 'PATHWAYS_EXPECTED_FORWARD_FAULT'; END `$fault`$;`nCOMMIT;`n")
        [IO.File]::WriteAllText($faultPath, $faultSql)
        Invoke-ForwardDeploy -Database $faultDb -Provision -ExpectFailure
      } finally { Copy-Item -LiteralPath (Join-Path $migration.FullName 'migration.sql') -Destination $faultPath -Force }
      if ((Read-ForwardLedger $faultDb "migration_name<>'0031_f10_f11_rules_runtime'") -cne $beforeFaultLedger -or
          (Read-ForwardCatalog $faultDb) -cne $beforeFaultCatalog -or
          (Read-ForwardSql $faultDb ([IO.File]::ReadAllText((Join-Path $phase6Root 'infra/supabase/migration-reconciliation/baseline-data-inventory.sql')))) -cne $beforeFaultData) { throw 'Injected failure changed pre0031 ledger, catalog or data.' }
      if ($script:forwardFaultLog -notmatch '(?m)^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \S+ \[\d+\] ERROR:\s+PATHWAYS_EXPECTED_FORWARD_FAULT\s*$') { throw 'Failure occurred before the intended rollback boundary; exact ERROR marker absent from this invocation interval.' }
      Write-Output 'FORWARD_INJECTED_TRANSACTION_ROLLBACK=PASS'
    }
    if ($migration.Name -ceq '0034_core_feature_completion') {
      # Independent pre-0034 fault/retry clones preserve the original failed0031
      # evidence and avoid resolving or editing either migration ledger.
      $coreSnapshot = Join-Path $phase6Parent 'forward-pre0034.dump'
      Assert-ForwardTarget 'pathways_phase4_baseline'
      & $phase6Tools['pg_dump'] -w -h 127.0.0.1 -p $phase6Port -U postgres -d pathways_phase4_baseline --format=custom --file=$coreSnapshot
      if ($LASTEXITCODE -ne 0) { throw 'Core recovery backup failed.' }
      foreach ($db in $forwardDatabases[4..5]) {
        Invoke-LocalSql "CREATE DATABASE $db;" 'postgres'
        Assert-ForwardTarget $db
        & $phase6Tools['pg_restore'] -w -h 127.0.0.1 -p $phase6Port -U postgres -d $db --exit-on-error $coreSnapshot
        if ($LASTEXITCODE -ne 0) { throw 'Core recovery restore failed.' }
        Restore-ForwardDatabaseAcl $db
        if ((Read-ForwardLedger $db) -cne (Read-ForwardLedger 'pathways_phase4_baseline')) { throw 'Core recovery changed original ledger.' }
        Assert-ForwardParity 'pathways_phase4_baseline' $db
        if ((Read-ForwardData $db) -cne (Read-ForwardData 'pathways_phase4_baseline')) { throw 'Core recovery changed table data.' }
      }
      $coreFaultDb = 'pathways_phase4_core_fault'
      $coreBeforeLedger = Read-ForwardLedger $coreFaultDb
      $coreBeforeCatalog = Read-ForwardCatalog $coreFaultDb
      $coreBeforeData = Read-ForwardData $coreFaultDb
      $coreFaultPath = Join-Path $forwardStage ($migration.Name + '/migration.sql')
      $coreCanonicalSql = [IO.File]::ReadAllText($coreFaultPath)
      if ($coreCanonicalSql -notmatch '(?s)COMMIT;\s*$') { throw 'Unexpected core fault injection boundary.' }
      try {
        $coreFaultSql = [regex]::Replace($coreCanonicalSql, 'COMMIT;\s*$', "DO `$fault`$ BEGIN RAISE EXCEPTION 'PATHWAYS_EXPECTED_CORE_FORWARD_FAULT'; END `$fault`$;`nCOMMIT;`n")
        [IO.File]::WriteAllText($coreFaultPath, $coreFaultSql)
        Invoke-ForwardDeploy -Database $coreFaultDb -ExpectFailure -ProvisionCore
      } finally { Copy-Item -LiteralPath (Join-Path $migration.FullName 'migration.sql') -Destination $coreFaultPath -Force }
      if ((Read-ForwardLedger $coreFaultDb "migration_name<>'0034_core_feature_completion'") -cne $coreBeforeLedger -or
          (Read-ForwardCatalog $coreFaultDb) -cne $coreBeforeCatalog -or (Read-ForwardData $coreFaultDb) -cne $coreBeforeData) {
        throw 'Injected core failure changed pre0034 ledger, catalog, data or database ACL.'
      }
      if ($script:forwardFaultLog -notmatch '(?m)^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \S+ \[\d+\] ERROR:\s+PATHWAYS_EXPECTED_CORE_FORWARD_FAULT\s*$') { throw 'Exact core ERROR marker absent from this invocation interval.' }
      Write-Output 'CORE_FORWARD_INJECTED_TRANSACTION_ROLLBACK=PASS'
    }
    if ($migration.Name -ceq '0036_import_pdf_file_type') {
      # cr-pathways-import-throughput-and-pdf: independent pre-0036 fault/retry clones.
      # 0036 runs after the 0031/0034 cleanup scripts, so it is verified against the
      # post-cleanup role state; prisma needs only its ownership of the enum type.
      $pdfSnapshot = Join-Path $phase6Parent 'forward-pre0036.dump'
      Assert-ForwardTarget 'pathways_phase4_baseline'
      & $phase6Tools['pg_dump'] -w -h 127.0.0.1 -p $phase6Port -U postgres -d pathways_phase4_baseline --format=custom --file=$pdfSnapshot
      if ($LASTEXITCODE -ne 0) { throw '0036 recovery backup failed.' }
      foreach ($db in @('pathways_phase4_pdf_fault', 'pathways_phase4_pdf_retry')) {
        Invoke-LocalSql "CREATE DATABASE $db;" 'postgres'
        Assert-ForwardTarget $db
        & $phase6Tools['pg_restore'] -w -h 127.0.0.1 -p $phase6Port -U postgres -d $db --exit-on-error $pdfSnapshot
        if ($LASTEXITCODE -ne 0) { throw '0036 recovery restore failed.' }
        Restore-ForwardDatabaseAcl $db
        if ((Read-ForwardLedger $db) -cne (Read-ForwardLedger 'pathways_phase4_baseline')) { throw '0036 recovery changed original ledger.' }
        Assert-ForwardParity 'pathways_phase4_baseline' $db
        if ((Read-ForwardData $db) -cne (Read-ForwardData 'pathways_phase4_baseline')) { throw '0036 recovery changed table data.' }
      }
      $pdfFaultDb = 'pathways_phase4_pdf_fault'
      $pdfLabelsSql = "SELECT string_agg(e.enumlabel::text,',' ORDER BY e.enumsortorder) FROM pg_catalog.pg_enum e WHERE e.enumtypid='pathways.import_file_type'::regtype;"
      $pdfBeforeLedger = Read-ForwardLedger $pdfFaultDb
      $pdfBeforeCatalog = Read-ForwardCatalog $pdfFaultDb
      $pdfBeforeData = Read-ForwardData $pdfFaultDb
      $pdfBeforeLabels = Read-ForwardSql $pdfFaultDb $pdfLabelsSql
      if ($pdfBeforeLabels.Trim() -cne 'CSV,XLSX,XLS,JSON,OTHER') { throw 'Pre-0036 import_file_type labels differ.' }
      $pdfFaultPath = Join-Path $forwardStage ($migration.Name + '/migration.sql')
      $pdfCanonicalSql = [IO.File]::ReadAllText($pdfFaultPath)
      if ($pdfCanonicalSql -notmatch '(?s)COMMIT;\s*$') { throw 'Unexpected 0036 fault injection boundary.' }
      try {
        $pdfFaultSql = [regex]::Replace($pdfCanonicalSql, 'COMMIT;\s*$', "DO `$fault`$ BEGIN RAISE EXCEPTION 'PATHWAYS_EXPECTED_PDF_FORWARD_FAULT'; END `$fault`$;`nCOMMIT;`n")
        [IO.File]::WriteAllText($pdfFaultPath, $pdfFaultSql)
        Invoke-ForwardDeploy -Database $pdfFaultDb -ExpectFailure
      } finally { Copy-Item -LiteralPath (Join-Path $migration.FullName 'migration.sql') -Destination $pdfFaultPath -Force }
      if ((Read-ForwardLedger $pdfFaultDb "migration_name<>'0036_import_pdf_file_type'") -cne $pdfBeforeLedger -or
          (Read-ForwardCatalog $pdfFaultDb) -cne $pdfBeforeCatalog -or (Read-ForwardData $pdfFaultDb) -cne $pdfBeforeData -or
          (Read-ForwardSql $pdfFaultDb $pdfLabelsSql) -cne $pdfBeforeLabels) {
        throw 'Injected 0036 failure changed pre0036 ledger, catalog, data, database ACL or enum labels.'
      }
      if ($script:forwardFaultLog -notmatch '(?m)^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \S+ \[\d+\] ERROR:\s+PATHWAYS_EXPECTED_PDF_FORWARD_FAULT\s*$') { throw 'Exact 0036 ERROR marker absent from this invocation interval.' }
      Write-Output 'PDF_FORWARD_INJECTED_TRANSACTION_ROLLBACK=PASS'
    }
    if ($migration.Name -ceq '0037_step_up_pin') {
      # cr-pathways-beneficiary-step-up-pin: independent pre-0037 fault/retry clones.
      $pinSnapshot = Join-Path $phase6Parent 'forward-pre0037.dump'
      Assert-ForwardTarget 'pathways_phase4_baseline'
      & $phase6Tools['pg_dump'] -w -h 127.0.0.1 -p $phase6Port -U postgres -d pathways_phase4_baseline --format=custom --file=$pinSnapshot
      if ($LASTEXITCODE -ne 0) { throw 'Step-up PIN recovery backup failed.' }
      foreach ($db in @('pathways_phase4_pin_fault', 'pathways_phase4_pin_retry')) {
        Invoke-LocalSql "CREATE DATABASE $db;" 'postgres'
        Assert-ForwardTarget $db
        & $phase6Tools['pg_restore'] -w -h 127.0.0.1 -p $phase6Port -U postgres -d $db --exit-on-error $pinSnapshot
        if ($LASTEXITCODE -ne 0) { throw 'Step-up PIN recovery restore failed.' }
        Restore-ForwardDatabaseAcl $db
        if ((Read-ForwardLedger $db) -cne (Read-ForwardLedger 'pathways_phase4_baseline')) { throw 'Step-up PIN recovery changed original ledger.' }
        Assert-ForwardParity 'pathways_phase4_baseline' $db
        if ((Read-ForwardData $db) -cne (Read-ForwardData 'pathways_phase4_baseline')) { throw 'Step-up PIN recovery changed table data.' }
      }
      # The 0037 definers must work without the owner-role memberships the cleanups revoke.
      $pinRoleState = Read-ForwardSql 'pathways_phase4_pin_retry' @"
SELECT NOT EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
 WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma')
 AND (r.rolname LIKE 'rules\_%\_owner' OR r.rolname IN('public_projection_owner','report_projection_owner','finance_operation_owner')))
 AND NOT has_function_privilege('prisma','pathways.runtime_context_organization()','EXECUTE');
"@
      if ($pinRoleState.Trim() -cne 't') { throw '0037 replay is not in the post-cleanup role state.' }
      # Fail closed without the DBA prerequisite: run the canonical SQL directly (no ledger row).
      Assert-ForwardTarget 'pathways_phase4_pin_retry'
      $savedPreference = $ErrorActionPreference
      try {
        $ErrorActionPreference = 'Continue'
        $pinGuardOutput = (& $phase6Tools['psql'] -X -q -w -h 127.0.0.1 -p $phase6Port -U prisma -d pathways_phase4_pin_retry -v ON_ERROR_STOP=1 -f (Join-Path $migration.FullName 'migration.sql') 2>&1) -join "`n"
        $pinGuardExit = $LASTEXITCODE
      } finally { $ErrorActionPreference = $savedPreference }
      if ($pinGuardExit -eq 0 -or $pinGuardOutput -notmatch '0037 requires pgcrypto installed in schema extensions') { throw '0037 did not fail closed without its DBA prerequisite.' }
      if ((Read-ForwardLedger 'pathways_phase4_pin_retry') -cne (Read-ForwardLedger 'pathways_phase4_baseline')) { throw '0037 guard failure changed the ledger.' }
      Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_pin_retry'
      Write-Output 'PIN_FORWARD_PREREQUISITE_FAIL_CLOSED=PASS'
      $pinFaultDb = 'pathways_phase4_pin_fault'
      # The DBA prerequisite precedes the rollback snapshots, as it precedes 0037 when hosted.
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-step-up-pin-preprovision.sql'))) $pinFaultDb
      $pinBeforeLedger = Read-ForwardLedger $pinFaultDb
      $pinBeforeCatalog = Read-ForwardCatalog $pinFaultDb
      $pinBeforeData = Read-ForwardData $pinFaultDb
      $pinFaultPath = Join-Path $forwardStage ($migration.Name + '/migration.sql')
      $pinCanonicalSql = [IO.File]::ReadAllText($pinFaultPath)
      if ($pinCanonicalSql -notmatch '(?s)COMMIT;\s*$') { throw 'Unexpected step-up PIN fault injection boundary.' }
      try {
        $pinFaultSql = [regex]::Replace($pinCanonicalSql, 'COMMIT;\s*$', "DO `$fault`$ BEGIN RAISE EXCEPTION 'PATHWAYS_EXPECTED_PIN_FORWARD_FAULT'; END `$fault`$;`nCOMMIT;`n")
        [IO.File]::WriteAllText($pinFaultPath, $pinFaultSql)
        Invoke-ForwardDeploy -Database $pinFaultDb -ExpectFailure -ProvisionPin
      } finally { Copy-Item -LiteralPath (Join-Path $migration.FullName 'migration.sql') -Destination $pinFaultPath -Force }
      if ((Read-ForwardLedger $pinFaultDb "migration_name<>'0037_step_up_pin'") -cne $pinBeforeLedger -or
          (Read-ForwardCatalog $pinFaultDb) -cne $pinBeforeCatalog -or (Read-ForwardData $pinFaultDb) -cne $pinBeforeData -or
          (Read-ForwardSql $pinFaultDb "SELECT to_regclass('pathways.user_step_up_pins') IS NULL AND to_regclass('pathways.beneficiary_step_up_grants') IS NULL;").Trim() -cne 't') {
        throw 'Injected step-up PIN failure changed pre0037 ledger, catalog, data or database ACL.'
      }
      if ($script:forwardFaultLog -notmatch '(?m)^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \S+ \[\d+\] ERROR:\s+PATHWAYS_EXPECTED_PIN_FORWARD_FAULT\s*$') { throw 'Exact step-up PIN ERROR marker absent from this invocation interval.' }
      Write-Output 'PIN_FORWARD_INJECTED_TRANSACTION_ROLLBACK=PASS'
    }
    if ($migration.Name -ceq '0038_import_smart_mapping') {
      # cr-pathways-smart-import-mapping: independent pre-0038 fault/retry clones.
      Measure-ReplayStep 'forward fault-retry 0038' { Invoke-ForwardFaultRetryClones -Migration $migration.Name -MigrationPath $migration.FullName -Label '0038' -Token 'IMPORT' -FaultDatabase 'pathways_phase4_import_fault' -RetryDatabase 'pathways_phase4_import_retry' }
    }
    if ($migration.Name -ceq '0039_project_partner_backfill') {
      # cr-pathways-project-rbac-ui-and-partners 3.5: independent pre-0039 fault/retry clones.
      Measure-ReplayStep 'forward fault-retry 0039' { Invoke-ForwardFaultRetryClones -Migration $migration.Name -MigrationPath $migration.FullName -Label '0039' -Token 'PARTNER' -FaultDatabase 'pathways_phase4_partner_fault' -RetryDatabase 'pathways_phase4_partner_retry' }
    }
    if ($migration.Name -ceq '0040_default_registration_form') {
      # cr-pathways-default-registration-form: independent pre-0040 fault/retry clones.
      Measure-ReplayStep 'forward fault-retry 0040' { Invoke-ForwardFaultRetryClones -Migration $migration.Name -MigrationPath $migration.FullName -Label '0040' -Token 'DRF' -FaultDatabase 'pathways_phase4_drf_fault' -RetryDatabase 'pathways_phase4_drf_retry' }
    }
    if ($migration.Name -ceq '0041_activity_media_evidence') {
      # cr-pathways-activity-progress-media: independent pre-0041 fault/retry clones. The DBA
      # preprovision precedes the rollback snapshots, as it precedes 0041 when hosted.
      Measure-ReplayStep 'forward fault-retry 0041' { Invoke-ForwardFaultRetryClones -Migration $migration.Name -MigrationPath $migration.FullName -Label '0041' -Token 'MEDIA' -FaultDatabase 'pathways_phase4_media_fault' -RetryDatabase 'pathways_phase4_media_retry' -ProvisionMedia }
    }
    if ($migration.Name -ceq '0042_proof_session_beneficiary_count') {
      # cr-pathways-proof-session-beneficiary-count: independent pre-0042 fault/retry clones.
      # No preprovision/cleanup pair is needed; prisma already owns pathways.activity_updates
      # and pathways.p08_activity_beneficiaries_reached from the 0000 baseline.
      Measure-ReplayStep 'forward fault-retry 0042' { Invoke-ForwardFaultRetryClones -Migration $migration.Name -MigrationPath $migration.FullName -Label '0042' -Token 'PSC' -FaultDatabase 'pathways_phase4_psc_fault' -RetryDatabase 'pathways_phase4_psc_retry' }
    }
    if ($migration.Name -ceq '0043_activity_overdue_explanation') {
      # cr-pathways-activity-overdue-explanation: independent pre-0043 fault/retry clones.
      # No preprovision/cleanup pair is needed; prisma already owns pathways.project_activities,
      # pathways.projects, pathways.organizations, pathways.system_users and
      # pathways.p05_has_project_permission from the 0000 baseline.
      Measure-ReplayStep 'forward fault-retry 0043' { Invoke-ForwardFaultRetryClones -Migration $migration.Name -MigrationPath $migration.FullName -Label '0043' -Token 'OEX' -FaultDatabase 'pathways_phase4_oex_fault' -RetryDatabase 'pathways_phase4_oex_retry' }
    }
    if ($migration.Name -ceq '0044_activity_progress_review') {
      # Progress-only activity review: independent pre-0044 fault/retry clones. The DBA
      # preprovision (temporary SET chain to the rules owner roles) precedes the rollback
      # snapshots, as it precedes 0044 when hosted.
      Measure-ReplayStep 'forward fault-retry 0044' { Invoke-ForwardFaultRetryClones -Migration $migration.Name -MigrationPath $migration.FullName -Label '0044' -Token 'PRV' -FaultDatabase 'pathways_phase4_prv_fault' -RetryDatabase 'pathways_phase4_prv_retry' -ProvisionReview }
    }
    if ($migration.Name -ceq '0045_f9_descriptive_aggregates') {
      # cr-pathways-f9-trusted-aggregates: independent pre-0045 fault/retry clones.
      # No preprovision/cleanup pair is needed; the migration adds two functions only and prisma
      # already owns pathways.p06_can and the source tables from the 0000 baseline.
      Measure-ReplayStep 'forward fault-retry 0045' { Invoke-ForwardFaultRetryClones -Migration $migration.Name -MigrationPath $migration.FullName -Label '0045' -Token 'F9A' -FaultDatabase 'pathways_phase4_f9a_fault' -RetryDatabase 'pathways_phase4_f9a_retry' }
    }
    # 0058 (enum value only) needs no clones: no preprovision, no catalog change beyond the enum label.
    if ($migration.Name -ceq '0059_rules_recommendation_auto_resolve') {
      # PRD-F11 G-F11-5: independent pre-0059 fault/retry clones. The DBA preprovision (temporary SET
      # chain to six rules owner roles) precedes the rollback snapshots, as it precedes 0059 when hosted.
      Measure-ReplayStep 'forward fault-retry 0059' { Invoke-ForwardFaultRetryClones -Migration $migration.Name -MigrationPath $migration.FullName -Label '0059' -Token 'RAR' -FaultDatabase 'pathways_phase4_rar_fault' -RetryDatabase 'pathways_phase4_rar_retry' -ProvisionRulesCatalog }
    }
    if ($migration.Name -ceq '0060_rules_budget_beneficiary_survey_metrics') {
      # PRD-F10 G-F10-6: independent pre-0060 fault/retry clones, same preprovision as 0059.
      Measure-ReplayStep 'forward fault-retry 0060' { Invoke-ForwardFaultRetryClones -Migration $migration.Name -MigrationPath $migration.FullName -Label '0060' -Token 'RMT' -FaultDatabase 'pathways_phase4_rmt_fault' -RetryDatabase 'pathways_phase4_rmt_retry' -ProvisionRulesCatalog }
    }
    if ($migration.Name -ceq '0095_retire_legacy_public_tables') {
      # cr-pathways-legacy-public-schema-removal: 0095 must abort and drop nothing when a legacy table holds a row, so run it on a 0094 clone with one Role row.
      $legacyGuardDb = 'pathways_phase4_legacy_guard'
      Assert-ForwardTarget 'pathways_phase4_baseline'
      Invoke-LocalSql "CREATE DATABASE $legacyGuardDb TEMPLATE pathways_phase4_baseline;" 'postgres'
      try {
        Assert-ForwardTarget $legacyGuardDb
        Invoke-LocalSql 'INSERT INTO public."Role" (name) VALUES (''legacy_guard_probe'');' $legacyGuardDb
        $savedPreference = $ErrorActionPreference
        try {
          $ErrorActionPreference = 'Continue'
          $legacyGuardOutput = (& $phase6Tools['psql'] -X -q -w -h 127.0.0.1 -p $phase6Port -U prisma -d $legacyGuardDb -v ON_ERROR_STOP=1 -f (Join-Path $migration.FullName 'migration.sql') 2>&1) -join "`n"
          $legacyGuardExit = $LASTEXITCODE
        } finally { $ErrorActionPreference = $savedPreference }
        if ($legacyGuardExit -eq 0 -or $legacyGuardOutput -notmatch 'Legacy table Role is not empty') { throw '0095 did not refuse a non-empty legacy table.' }
        if ((Read-ForwardSql $legacyGuardDb "SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r';").Trim() -cne '16') { throw '0095 refusal did not leave all 16 public tables in place.' }
      } finally {
        Assert-ForwardTarget 'pathways_phase4_baseline'
        Invoke-LocalSql "DROP DATABASE $legacyGuardDb;" 'postgres'
      }
      Write-Output 'FORWARD_0095_NONEMPTY_REFUSAL=PASS'
    }
    $forwardPin = $migration.Name -ceq '0037_step_up_pin'
    $forwardMedia = ($migration.Name -ceq '0041_activity_media_evidence') -or ($migration.Name -ceq '0056_indicator_type')
    $forwardReview = $migration.Name -ceq '0044_activity_progress_review'
    $forwardExpense = $migration.Name -ceq '0053_expense_submit_race'
    $forwardCatalog = $migration.Name -cin @('0059_rules_recommendation_auto_resolve', '0060_rules_budget_beneficiary_survey_metrics')
    $forwardEscalation = $migration.Name -ceq '0062_rules_escalated_alert_list'
    $forwardScopeMemo = $migration.Name -ceq '0063_rules_scope_memo'
    $forwardSeverity = $migration.Name -ceq '0072_severity_classification'
    $forwardMetrics = $migration.Name -ceq '0073_rules_kpi_assessment_metrics'
    $forwardSummary = $migration.Name -ceq '0075_indicator_summary_measurement_lookup'
    $forwardSaddd = $migration.Name -ceq '0076_saddd_exact_counts'
    $forwardGaps = $migration.Name -ceq '0090_test_case_gap_closure'
    $forwardBackup = $migration.Name -ceq '0091_backup_recovery'
    $forwardOutcomes = $migration.Name -ceq '0092_rules_outcomes_freshness'
    $forwardAlertNotes = $migration.Name -ceq '0093_alert_outcome_notes'
    foreach ($db in $forwardDatabases[0..1]) { Invoke-ForwardDeploy -Database $db -Provision:($migration.Name -ceq '0031_f10_f11_rules_runtime') -ProvisionCore:($migration.Name -ceq '0034_core_feature_completion') -ProvisionPin:$forwardPin -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo -ProvisionRulesSeverity:$forwardSeverity -ProvisionRulesMetrics:$forwardMetrics -ProvisionIndicatorSummary:$forwardSummary -ProvisionSadddExact:$forwardSaddd -ProvisionTestCaseGaps:$forwardGaps -ProvisionBackup:$forwardBackup -ProvisionRulesOutcomes:$forwardOutcomes -ProvisionAlertNotes:$forwardAlertNotes }
    if ([int]$migration.Name.Substring(0,4) -ge 31) { Invoke-ForwardDeploy -Database 'pathways_phase4_forward_restore' -Provision:($migration.Name -ceq '0031_f10_f11_rules_runtime') -ProvisionCore:($migration.Name -ceq '0034_core_feature_completion') -ProvisionPin:$forwardPin -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo -ProvisionRulesSeverity:$forwardSeverity -ProvisionRulesMetrics:$forwardMetrics -ProvisionIndicatorSummary:$forwardSummary -ProvisionSadddExact:$forwardSaddd -ProvisionTestCaseGaps:$forwardGaps -ProvisionBackup:$forwardBackup -ProvisionRulesOutcomes:$forwardOutcomes -ProvisionAlertNotes:$forwardAlertNotes }
    if ([int]$migration.Name.Substring(0,4) -ge 34) { Invoke-ForwardDeploy -Database 'pathways_phase4_core_retry' -ProvisionCore:($migration.Name -ceq '0034_core_feature_completion') -ProvisionPin:$forwardPin -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo -ProvisionRulesSeverity:$forwardSeverity -ProvisionRulesMetrics:$forwardMetrics -ProvisionIndicatorSummary:$forwardSummary -ProvisionSadddExact:$forwardSaddd -ProvisionTestCaseGaps:$forwardGaps -ProvisionBackup:$forwardBackup -ProvisionRulesOutcomes:$forwardOutcomes -ProvisionAlertNotes:$forwardAlertNotes }
    if ([int]$migration.Name.Substring(0,4) -ge 36) { Invoke-ForwardDeploy -Database 'pathways_phase4_pdf_retry' -ProvisionPin:$forwardPin -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo -ProvisionRulesSeverity:$forwardSeverity -ProvisionRulesMetrics:$forwardMetrics -ProvisionIndicatorSummary:$forwardSummary -ProvisionSadddExact:$forwardSaddd -ProvisionTestCaseGaps:$forwardGaps -ProvisionBackup:$forwardBackup -ProvisionRulesOutcomes:$forwardOutcomes -ProvisionAlertNotes:$forwardAlertNotes }
    if ([int]$migration.Name.Substring(0,4) -ge 37) { Invoke-ForwardDeploy -Database 'pathways_phase4_pin_retry' -ProvisionPin:$forwardPin -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo -ProvisionRulesSeverity:$forwardSeverity -ProvisionRulesMetrics:$forwardMetrics -ProvisionIndicatorSummary:$forwardSummary -ProvisionSadddExact:$forwardSaddd -ProvisionTestCaseGaps:$forwardGaps -ProvisionBackup:$forwardBackup -ProvisionRulesOutcomes:$forwardOutcomes -ProvisionAlertNotes:$forwardAlertNotes }
    if ([int]$migration.Name.Substring(0,4) -ge 38) { Invoke-ForwardDeploy -Database 'pathways_phase4_import_retry' -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo -ProvisionRulesSeverity:$forwardSeverity -ProvisionRulesMetrics:$forwardMetrics -ProvisionIndicatorSummary:$forwardSummary -ProvisionSadddExact:$forwardSaddd -ProvisionTestCaseGaps:$forwardGaps -ProvisionBackup:$forwardBackup -ProvisionRulesOutcomes:$forwardOutcomes -ProvisionAlertNotes:$forwardAlertNotes }
    if ([int]$migration.Name.Substring(0,4) -ge 39) { Invoke-ForwardDeploy -Database 'pathways_phase4_partner_retry' -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo -ProvisionRulesSeverity:$forwardSeverity -ProvisionRulesMetrics:$forwardMetrics -ProvisionIndicatorSummary:$forwardSummary -ProvisionSadddExact:$forwardSaddd -ProvisionTestCaseGaps:$forwardGaps -ProvisionBackup:$forwardBackup -ProvisionRulesOutcomes:$forwardOutcomes -ProvisionAlertNotes:$forwardAlertNotes }
    if ([int]$migration.Name.Substring(0,4) -ge 40) { Invoke-ForwardDeploy -Database 'pathways_phase4_drf_retry' -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo -ProvisionRulesSeverity:$forwardSeverity -ProvisionRulesMetrics:$forwardMetrics -ProvisionIndicatorSummary:$forwardSummary -ProvisionSadddExact:$forwardSaddd -ProvisionTestCaseGaps:$forwardGaps -ProvisionBackup:$forwardBackup -ProvisionRulesOutcomes:$forwardOutcomes -ProvisionAlertNotes:$forwardAlertNotes }
    if ([int]$migration.Name.Substring(0,4) -ge 41) { Invoke-ForwardDeploy -Database 'pathways_phase4_media_retry' -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo -ProvisionRulesSeverity:$forwardSeverity -ProvisionRulesMetrics:$forwardMetrics -ProvisionIndicatorSummary:$forwardSummary -ProvisionSadddExact:$forwardSaddd -ProvisionTestCaseGaps:$forwardGaps -ProvisionBackup:$forwardBackup -ProvisionRulesOutcomes:$forwardOutcomes -ProvisionAlertNotes:$forwardAlertNotes }
    if ([int]$migration.Name.Substring(0,4) -ge 42) { Invoke-ForwardDeploy -Database 'pathways_phase4_psc_retry' -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo -ProvisionRulesSeverity:$forwardSeverity -ProvisionRulesMetrics:$forwardMetrics -ProvisionIndicatorSummary:$forwardSummary -ProvisionSadddExact:$forwardSaddd -ProvisionTestCaseGaps:$forwardGaps -ProvisionBackup:$forwardBackup -ProvisionRulesOutcomes:$forwardOutcomes -ProvisionAlertNotes:$forwardAlertNotes }
    if ([int]$migration.Name.Substring(0,4) -ge 43) { Invoke-ForwardDeploy -Database 'pathways_phase4_oex_retry' -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo -ProvisionRulesSeverity:$forwardSeverity -ProvisionRulesMetrics:$forwardMetrics -ProvisionIndicatorSummary:$forwardSummary -ProvisionSadddExact:$forwardSaddd -ProvisionTestCaseGaps:$forwardGaps -ProvisionBackup:$forwardBackup -ProvisionRulesOutcomes:$forwardOutcomes -ProvisionAlertNotes:$forwardAlertNotes }
    if ([int]$migration.Name.Substring(0,4) -ge 44) { Invoke-ForwardDeploy -Database 'pathways_phase4_prv_retry' -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo -ProvisionRulesSeverity:$forwardSeverity -ProvisionRulesMetrics:$forwardMetrics -ProvisionIndicatorSummary:$forwardSummary -ProvisionSadddExact:$forwardSaddd -ProvisionTestCaseGaps:$forwardGaps -ProvisionBackup:$forwardBackup -ProvisionRulesOutcomes:$forwardOutcomes -ProvisionAlertNotes:$forwardAlertNotes }
    if ([int]$migration.Name.Substring(0,4) -ge 45) { Invoke-ForwardDeploy -Database 'pathways_phase4_f9a_retry' -ProvisionMedia:$forwardMedia -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo -ProvisionRulesSeverity:$forwardSeverity -ProvisionRulesMetrics:$forwardMetrics -ProvisionIndicatorSummary:$forwardSummary -ProvisionSadddExact:$forwardSaddd -ProvisionTestCaseGaps:$forwardGaps -ProvisionBackup:$forwardBackup -ProvisionRulesOutcomes:$forwardOutcomes -ProvisionAlertNotes:$forwardAlertNotes }
    if ([int]$migration.Name.Substring(0,4) -ge 59) { Invoke-ForwardDeploy -Database 'pathways_phase4_rar_retry' -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo -ProvisionRulesSeverity:$forwardSeverity -ProvisionRulesMetrics:$forwardMetrics -ProvisionIndicatorSummary:$forwardSummary -ProvisionSadddExact:$forwardSaddd -ProvisionTestCaseGaps:$forwardGaps -ProvisionBackup:$forwardBackup -ProvisionRulesOutcomes:$forwardOutcomes -ProvisionAlertNotes:$forwardAlertNotes }
    if ([int]$migration.Name.Substring(0,4) -ge 60) { Invoke-ForwardDeploy -Database 'pathways_phase4_rmt_retry' -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo -ProvisionRulesSeverity:$forwardSeverity -ProvisionRulesMetrics:$forwardMetrics -ProvisionIndicatorSummary:$forwardSummary -ProvisionSadddExact:$forwardSaddd -ProvisionTestCaseGaps:$forwardGaps -ProvisionBackup:$forwardBackup -ProvisionRulesOutcomes:$forwardOutcomes -ProvisionAlertNotes:$forwardAlertNotes }
  }
  foreach ($db in $forwardDatabases[0..1]) {
    if ((Read-ForwardLedger $db ("migration_name NOT IN ('" + ($forwardInventory -join "','") + "')")) -cne $originalForwardLedgers[$db]) { throw 'Historical ledger rows changed during forward upgrade.' }
    Assert-ForwardChecksums $db
    $beforeRepeat = Read-ForwardLedger $db
    Invoke-ForwardDeploy -Database $db
    if ((Read-ForwardLedger $db) -cne $beforeRepeat) { throw 'Repeated forward deployment changed ledger.' }
  }
  Assert-ForwardChecksums 'pathways_phase4_core_retry'
  $coreRepeatLedger = Read-ForwardLedger 'pathways_phase4_core_retry'
  Invoke-ForwardDeploy -Database 'pathways_phase4_core_retry'
  if ((Read-ForwardLedger 'pathways_phase4_core_retry') -cne $coreRepeatLedger) { throw 'Repeated core recovery deployment changed ledger.' }
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_core_retry'
  Write-Output 'CORE_FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  Write-Output 'CORE_FORWARD_IDEMPOTENT_DEPLOY=PASS'
  Assert-ForwardChecksums 'pathways_phase4_pin_retry'
  $pinRepeatLedger = Read-ForwardLedger 'pathways_phase4_pin_retry'
  Invoke-ForwardDeploy -Database 'pathways_phase4_pin_retry' -ProvisionPin
  if ((Read-ForwardLedger 'pathways_phase4_pin_retry') -cne $pinRepeatLedger) { throw 'Repeated step-up PIN recovery deployment changed ledger.' }
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_pin_retry'
  Write-Output 'PIN_FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  Write-Output 'PIN_FORWARD_IDEMPOTENT_DEPLOY=PASS'
  Assert-ForwardChecksums 'pathways_phase4_forward_restore'
  Assert-ForwardParity $phase6Database 'pathways_phase4_baseline'
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_forward_restore'
  Write-Output 'FORWARD_FRESH_UPGRADE_CHECKSUM_PARITY=PASS'
  Write-Output 'FORWARD_IDEMPOTENT_DEPLOY=PASS'
  Write-Output 'FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  # cr-pathways-admin-read-access: Admin gains only activities.read; 0055 (RBAC v4) revokes budgets.read,
  # and writes, expenses and Beneficiary detail stay denied.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore', 'pathways_phase4_core_retry')) {
    $adminRead = Read-ForwardSql $db @"
SELECT (pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','activities.read')
 AND NOT pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','budgets.read')
 AND NOT pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','beneficiaries.records.read')
 AND NOT pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','activities.update')
 AND NOT pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','budgets.create')
 AND NOT pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','expenses.read')
 AND NOT pathways.p09_role_allows('PROGRAM_MANAGER','beneficiaries.records.read')
 AND NOT pathways.p09_role_allows('GRANT_MANAGER','beneficiaries.records.read')
 AND (SELECT count(*) FROM pathways.role_permissions rp JOIN pathways.roles r ON r.id=rp.role_id
      JOIN pathways.permissions p ON p.id=rp.permission_id
      WHERE r.code='SYSTEM_ADMINISTRATOR' AND p.code IN ('activities.read','budgets.read'))=1
 AND (SELECT count(*) FROM pathways.role_permissions)=318)::text;
"@
    if ($adminRead.Trim() -cne 'true') { throw "0035 admin read grants differ in $db." }
  }
  Write-Output 'FORWARD_0035_ADMIN_READ_GRANTS=PASS'
  # cr-pathways-import-throughput-and-pdf (0036): the pre-0036 recovery clone retries
  # cleanly, redeploys idempotently, matches the upgraded baseline catalog, and every
  # target holds exactly the six ordered import_file_type labels under prisma ownership.
  Assert-ForwardChecksums 'pathways_phase4_pdf_retry'
  $pdfRepeatLedger = Read-ForwardLedger 'pathways_phase4_pdf_retry'
  Invoke-ForwardDeploy -Database 'pathways_phase4_pdf_retry'
  if ((Read-ForwardLedger 'pathways_phase4_pdf_retry') -cne $pdfRepeatLedger) { throw 'Repeated 0036 recovery deployment changed ledger.' }
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_pdf_retry'
  foreach ($db in @($phase6Database, 'pathways_phase4_baseline', 'pathways_phase4_forward_restore', 'pathways_phase4_core_retry', 'pathways_phase4_pdf_retry')) {
    $pdfState = Read-ForwardSql $db @"
SELECT (string_agg(e.enumlabel::text,',' ORDER BY e.enumsortorder)='CSV,XLSX,XLS,JSON,OTHER,PDF'
 AND pg_catalog.pg_get_userbyid(min(t.typowner))='prisma'
 AND EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0036_import_pdf_file_type' AND finished_at IS NOT NULL AND rolled_back_at IS NULL))::text
FROM pg_catalog.pg_enum e JOIN pg_catalog.pg_type t ON t.oid=e.enumtypid WHERE t.oid='pathways.import_file_type'::regtype;
"@
    if ($pdfState.Trim() -cne 'true') { throw "0036 import_file_type state differs in $db." }
  }
  Write-Output 'PDF_FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  Write-Output 'PDF_FORWARD_IDEMPOTENT_DEPLOY=PASS'
  # Runtime suite last: its fixtures commit only into the disposable retry clone, and
  # the runtime login returns to its prior state afterwards.
  $pdfRuntimeLogin = (Read-ForwardSql 'pathways_phase4_pdf_retry' "SELECT rolcanlogin::text FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime';").Trim()
  if ($pdfRuntimeLogin -cnotin @('true','false')) { throw 'Runtime role state unavailable.' }
  Invoke-LocalSql 'ALTER ROLE pathways_runtime LOGIN;' 'pathways_phase4_pdf_retry'
  try {
    Assert-ForwardTarget 'pathways_phase4_pdf_retry'
    $pdfRuntime = [IO.File]::ReadAllText((Join-Path $phase6Root 'apps/api/prisma/tests/import-pdf-file-type-runtime.sql')) |
      & $phase6Tools['psql'] -X -q -A -t -w -h 127.0.0.1 -p $phase6Port -U postgres -d pathways_phase4_pdf_retry -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0 -or ($pdfRuntime -join "`n") -notmatch 'IMPORT_PDF_FILE_TYPE_RUNTIME_ASSERTIONS_PASSED=4') { throw '0036 runtime suite failed.' }
  } finally {
    if ($pdfRuntimeLogin -ceq 'false') { Invoke-LocalSql 'ALTER ROLE pathways_runtime NOLOGIN;' 'pathways_phase4_pdf_retry' }
  }
  Write-Output 'PDF_FORWARD_IMPORT_FILE_TYPE_RUNTIME=PASS'
  # cr-pathways-beneficiary-step-up-pin: behavioral suite (rolled back) in the post-cleanup role
  # state on the fresh and recovered paths, then the row-lock race on the recovered clone.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_pin_retry')) {
    $pinSuite = Read-ForwardSql $db ([IO.File]::ReadAllText((Join-Path $phase6Root 'apps/api/prisma/tests/step-up-pin-runtime.sql')))
    if ($pinSuite -notmatch '(?m)^STEP_UP_PIN_ASSERTIONS_PASSED=11\s*$') { throw "Step-up PIN runtime suite failed in $db." }
  }
  Write-Output 'FORWARD_0037_STEP_UP_PIN_RUNTIME=PASS'
  Assert-ForwardTarget 'pathways_phase4_pin_retry'
  Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $phase6Root 'apps/api/prisma/tests/step-up-pin-concurrency-fixture.sql'))) 'pathways_phase4_pin_retry'
  $pinRuntimeLogin = (Read-ForwardSql 'pathways_phase4_pin_retry' "SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime';").Trim()
  $pinRaceEnvironment = @{ PHASE2_RACE_DATABASE = 'pathways_phase4_pin_retry'; PHASE2_LOCAL_PORT = "$phase6Port"; PHASE2_RUNTIME_PASSWORD = $trustLocalPlaceholder; PHASE2_OWNER_PASSWORD = $trustLocalPlaceholder }
  try {
    Invoke-LocalSql 'ALTER ROLE pathways_runtime LOGIN;' 'pathways_phase4_pin_retry'
    foreach ($key in $pinRaceEnvironment.Keys) { Set-Item -LiteralPath "Env:$key" -Value $pinRaceEnvironment[$key] }
    Measure-ReplayStep 'node step-up-pin-concurrency' { Invoke-ForwardBoundedNode -ScriptPath (Join-Path $phase6Root 'apps/api/prisma/tests/step-up-pin-concurrency.mjs') -ExpectedMarker 'STEP_UP_PIN_CONCURRENCY=PASS' -TimeoutMilliseconds 180000 }
  } finally {
    foreach ($key in $pinRaceEnvironment.Keys) { Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue }
    if ($pinRuntimeLogin -cne 't') { Invoke-LocalSql 'ALTER ROLE pathways_runtime NOLOGIN;' 'pathways_phase4_pin_retry' }
  }
  Write-Output 'FORWARD_0037_STEP_UP_PIN_CONCURRENCY=PASS'
  # cr-pathways-smart-import-mapping (0038): the pre-0038 recovery clone retries cleanly,
  # redeploys idempotently and matches the upgraded baseline catalog.
  Assert-ForwardChecksums 'pathways_phase4_import_retry'
  $importRepeatLedger = Read-ForwardLedger 'pathways_phase4_import_retry'
  Invoke-ForwardDeploy -Database 'pathways_phase4_import_retry'
  if ((Read-ForwardLedger 'pathways_phase4_import_retry') -cne $importRepeatLedger) { throw 'Repeated 0038 recovery deployment changed ledger.' }
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_import_retry'
  Write-Output 'IMPORT_FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  Write-Output 'IMPORT_FORWARD_IDEMPOTENT_DEPLOY=PASS'
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_import_retry')) {
    $importSuite = Read-ForwardSql $db ([IO.File]::ReadAllText((Join-Path $phase6Root 'apps/api/prisma/tests/import-smart-mapping-runtime.sql')))
    if ($importSuite -notmatch 'IMPORT_SMART_MAPPING_RUNTIME=PASS') { throw "Smart mapping runtime suite failed in $db." }
  }
  Write-Output 'FORWARD_0038_IMPORT_SMART_MAPPING_RUNTIME=PASS'
  # cr-pathways-project-rbac-ui-and-partners 3.5 (0039): the pre-0039 recovery clone retries
  # cleanly and redeploys idempotently. The runtime suite commits synthetic data and re-sources
  # the migration.sql itself to prove idempotency, so it runs only on a disposable throwaway
  # clone of the retry database, dropped afterwards; the retry clone's own ledger/catalog stay
  # untouched by the suite.
  Assert-ForwardChecksums 'pathways_phase4_partner_retry'
  $partnerRepeatLedger = Read-ForwardLedger 'pathways_phase4_partner_retry'
  Invoke-ForwardDeploy -Database 'pathways_phase4_partner_retry'
  if ((Read-ForwardLedger 'pathways_phase4_partner_retry') -cne $partnerRepeatLedger) { throw 'Repeated 0039 recovery deployment changed ledger.' }
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_partner_retry'
  Write-Output 'PARTNER_FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  Write-Output 'PARTNER_FORWARD_IDEMPOTENT_DEPLOY=PASS'
  $partnerSuiteDb = 'pathways_phase4_partner_suite'
  Invoke-LocalSql "CREATE DATABASE $partnerSuiteDb TEMPLATE pathways_phase4_partner_retry;" 'postgres'
  try {
    Assert-ForwardTarget $partnerSuiteDb
    $partnerSuiteOutput = (& $phase6Tools['psql'] -X -q -w -h 127.0.0.1 -p $phase6Port -U prisma -d $partnerSuiteDb -v ON_ERROR_STOP=1 -f (Join-Path $phase6Root 'apps/api/prisma/tests/project-partner-backfill-runtime.sql') 2>&1) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $partnerSuiteOutput -notmatch 'PROJECT_PARTNER_BACKFILL_RUNTIME_ASSERTIONS_PASSED=13') { throw '0039 runtime suite failed.' }
  } finally {
    Assert-ForwardTarget 'pathways_phase4_baseline'
    Invoke-LocalSql "DROP DATABASE $partnerSuiteDb;" 'postgres'
  }
  Write-Output 'FORWARD_0039_PROJECT_PARTNER_BACKFILL_RUNTIME=PASS'
  # cr-pathways-default-registration-form (0040): the pre-0040 recovery clone retries cleanly,
  # redeploys idempotently, then the behavioral suite (rolled back) and the concurrency race.
  Assert-ForwardChecksums 'pathways_phase4_drf_retry'
  $drfRepeatLedger = Read-ForwardLedger 'pathways_phase4_drf_retry'
  Invoke-ForwardDeploy -Database 'pathways_phase4_drf_retry'
  if ((Read-ForwardLedger 'pathways_phase4_drf_retry') -cne $drfRepeatLedger) { throw 'Repeated 0040 recovery deployment changed ledger.' }
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_drf_retry'
  Write-Output 'DRF_FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  Write-Output 'DRF_FORWARD_IDEMPOTENT_DEPLOY=PASS'
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_drf_retry')) {
    $drfSuite = Read-ForwardSql $db ([IO.File]::ReadAllText((Join-Path $phase6Root 'apps/api/prisma/tests/default-registration-form-runtime.sql')))
    if ($drfSuite -notmatch 'DEFAULT_REGISTRATION_FORM_ASSERTIONS_PASSED=12') { throw "Default registration form runtime suite failed in $db." }
  }
  Write-Output 'FORWARD_0040_DEFAULT_REGISTRATION_FORM_RUNTIME=PASS'
  Assert-ForwardTarget 'pathways_phase4_drf_retry'
  Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $phase6Root 'apps/api/prisma/tests/default-registration-form-concurrency-fixture.sql'))) 'pathways_phase4_drf_retry'
  $drfRuntimeLogin = (Read-ForwardSql 'pathways_phase4_drf_retry' "SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime';").Trim()
  $drfRaceEnvironment = @{ PHASE2_RACE_DATABASE = 'pathways_phase4_drf_retry'; PHASE2_LOCAL_PORT = "$phase6Port"; PHASE2_RUNTIME_PASSWORD = $trustLocalPlaceholder; PHASE2_OWNER_PASSWORD = $trustLocalPlaceholder }
  try {
    Invoke-LocalSql 'ALTER ROLE pathways_runtime LOGIN;' 'pathways_phase4_drf_retry'
    foreach ($key in $drfRaceEnvironment.Keys) { Set-Item -LiteralPath "Env:$key" -Value $drfRaceEnvironment[$key] }
    Measure-ReplayStep 'node default-registration-form-concurrency' { Invoke-ForwardBoundedNode -ScriptPath (Join-Path $phase6Root 'apps/api/prisma/tests/default-registration-form-concurrency.mjs') -ExpectedMarker 'DEFAULT_REGISTRATION_FORM_CONCURRENCY=PASS' -TimeoutMilliseconds 180000 }
  } finally {
    foreach ($key in $drfRaceEnvironment.Keys) { Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue }
    if ($drfRuntimeLogin -cne 't') { Invoke-LocalSql 'ALTER ROLE pathways_runtime NOLOGIN;' 'pathways_phase4_drf_retry' }
  }
  Write-Output 'FORWARD_0040_DEFAULT_REGISTRATION_FORM_CONCURRENCY=PASS'
  # cr-pathways-activity-progress-media (0041): the pre-0041 recovery clone retries cleanly and
  # redeploys idempotently under the same temporary preprovision/cleanup pair used when hosted.
  Assert-ForwardChecksums 'pathways_phase4_media_retry'
  $mediaRepeatLedger = Read-ForwardLedger 'pathways_phase4_media_retry'
  Invoke-ForwardDeploy -Database 'pathways_phase4_media_retry' -ProvisionMedia
  if ((Read-ForwardLedger 'pathways_phase4_media_retry') -cne $mediaRepeatLedger) { throw 'Repeated 0041 recovery deployment changed ledger.' }
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_media_retry'
  Write-Output 'MEDIA_FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  Write-Output 'MEDIA_FORWARD_IDEMPOTENT_DEPLOY=PASS'
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_media_retry')) {
    # The suite's completion marker is a RAISE NOTICE (stderr), so merge streams rather than
    # using the stdout-only Read-ForwardSql helper.
    Assert-ForwardTarget $db
    $mediaSuite = (& $phase6Tools['psql'] -X -q -w -h 127.0.0.1 -p $phase6Port -U postgres -d $db -v ON_ERROR_STOP=1 -f (Join-Path $phase6Root 'apps/api/prisma/tests/activity-media-evidence-runtime.sql') 2>&1) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $mediaSuite -notmatch 'ACTIVITY_MEDIA_EVIDENCE_RUNTIME=PASS') { throw "Activity media evidence runtime suite failed in $db." }
  }
  Write-Output 'FORWARD_0041_ACTIVITY_MEDIA_EVIDENCE_RUNTIME=PASS'
  # cr-pathways-proof-session-beneficiary-count (0042): the pre-0042 recovery clone retries
  # cleanly and redeploys idempotently. No preprovision/cleanup pair is needed.
  Assert-ForwardChecksums 'pathways_phase4_psc_retry'
  $pscRepeatLedger = Read-ForwardLedger 'pathways_phase4_psc_retry'
  Invoke-ForwardDeploy -Database 'pathways_phase4_psc_retry'
  if ((Read-ForwardLedger 'pathways_phase4_psc_retry') -cne $pscRepeatLedger) { throw 'Repeated 0042 recovery deployment changed ledger.' }
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_psc_retry'
  Write-Output 'PSC_FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  Write-Output 'PSC_FORWARD_IDEMPOTENT_DEPLOY=PASS'
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_psc_retry')) {
    # The suite's completion marker is a RAISE NOTICE (stderr), so merge streams rather than
    # using the stdout-only Read-ForwardSql helper.
    Assert-ForwardTarget $db
    $pscSuite = (& $phase6Tools['psql'] -X -q -w -h 127.0.0.1 -p $phase6Port -U postgres -d $db -v ON_ERROR_STOP=1 -f (Join-Path $phase6Root 'apps/api/prisma/tests/proof-session-beneficiary-count-runtime.sql') 2>&1) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $pscSuite -notmatch 'PROOF_SESSION_BENEFICIARY_COUNT_RUNTIME=PASS') {
      Write-Output $pscSuite
      throw "Proof-session beneficiary count runtime suite failed in $db."
    }
  }
  Write-Output 'FORWARD_0042_PROOF_SESSION_BENEFICIARY_COUNT_RUNTIME=PASS'
  # cr-pathways-activity-overdue-explanation (0043): the pre-0043 recovery clone retries
  # cleanly and redeploys idempotently. No preprovision/cleanup pair is needed.
  Assert-ForwardChecksums 'pathways_phase4_oex_retry'
  $oexRepeatLedger = Read-ForwardLedger 'pathways_phase4_oex_retry'
  Invoke-ForwardDeploy -Database 'pathways_phase4_oex_retry'
  if ((Read-ForwardLedger 'pathways_phase4_oex_retry') -cne $oexRepeatLedger) { throw 'Repeated 0043 recovery deployment changed ledger.' }
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_oex_retry'
  Write-Output 'OEX_FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  Write-Output 'OEX_FORWARD_IDEMPOTENT_DEPLOY=PASS'
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_oex_retry')) {
    # The suite's completion marker is a RAISE NOTICE (stderr), so merge streams rather than
    # using the stdout-only Read-ForwardSql helper.
    Assert-ForwardTarget $db
    $oexSuite = (& $phase6Tools['psql'] -X -q -w -h 127.0.0.1 -p $phase6Port -U postgres -d $db -v ON_ERROR_STOP=1 -f (Join-Path $phase6Root 'apps/api/prisma/tests/activity-overdue-explanation-runtime.sql') 2>&1) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $oexSuite -notmatch 'ACTIVITY_OVERDUE_EXPLANATION_RUNTIME=PASS') {
      Write-Output $oexSuite
      throw "Activity overdue explanation runtime suite failed in $db."
    }
  }
  Write-Output 'FORWARD_0043_ACTIVITY_OVERDUE_EXPLANATION_RUNTIME=PASS'
  # Progress-only activity review (0044): the pre-0044 recovery clone retries cleanly and
  # redeploys idempotently. The temporary SET chain was granted and revoked by each deploy.
  Assert-ForwardChecksums 'pathways_phase4_prv_retry'
  $prvRepeatLedger = Read-ForwardLedger 'pathways_phase4_prv_retry'
  Invoke-ForwardDeploy -Database 'pathways_phase4_prv_retry'
  if ((Read-ForwardLedger 'pathways_phase4_prv_retry') -cne $prvRepeatLedger) { throw 'Repeated 0044 recovery deployment changed ledger.' }
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_prv_retry'
  Write-Output 'PRV_FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  Write-Output 'PRV_FORWARD_IDEMPOTENT_DEPLOY=PASS'
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_prv_retry')) {
    # The suite's completion marker is a RAISE NOTICE (stderr), so merge streams rather than
    # using the stdout-only Read-ForwardSql helper.
    Assert-ForwardTarget $db
    $prvSuite = (& $phase6Tools['psql'] -X -q -w -h 127.0.0.1 -p $phase6Port -U postgres -d $db -v ON_ERROR_STOP=1 -f (Join-Path $phase6Root 'apps/api/prisma/tests/activity-progress-review-runtime.sql') 2>&1) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $prvSuite -notmatch 'ACTIVITY_PROGRESS_REVIEW_RUNTIME=PASS') {
      Write-Output $prvSuite
      throw "Activity progress review runtime suite failed in $db."
    }
  }
  Write-Output 'FORWARD_0044_ACTIVITY_PROGRESS_REVIEW_RUNTIME=PASS'
  # cr-pathways-f9-trusted-aggregates (0045): the pre-0045 recovery clone retries cleanly and
  # redeploys idempotently. No preprovision/cleanup pair is needed.
  Assert-ForwardChecksums 'pathways_phase4_f9a_retry'
  $f9aRepeatLedger = Read-ForwardLedger 'pathways_phase4_f9a_retry'
  Invoke-ForwardDeploy -Database 'pathways_phase4_f9a_retry'
  if ((Read-ForwardLedger 'pathways_phase4_f9a_retry') -cne $f9aRepeatLedger) { throw 'Repeated 0045 recovery deployment changed ledger.' }
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_f9a_retry'
  Write-Output 'F9A_FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  Write-Output 'F9A_FORWARD_IDEMPOTENT_DEPLOY=PASS'
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_f9a_retry')) {
    # The suite's completion marker is a RAISE NOTICE (stderr), so merge streams rather than
    # using the stdout-only Read-ForwardSql helper.
    Assert-ForwardTarget $db
    $f9aSuite = (& $phase6Tools['psql'] -X -q -w -h 127.0.0.1 -p $phase6Port -U postgres -d $db -v ON_ERROR_STOP=1 -f (Join-Path $phase6Root 'apps/api/prisma/tests/f9-descriptive-aggregates-runtime.sql') 2>&1) -join "`n"
    if ($LASTEXITCODE -ne 0 -or $f9aSuite -notmatch 'F9_DESCRIPTIVE_AGGREGATES_RUNTIME=PASS') {
      Write-Output $f9aSuite
      throw "F9 descriptive aggregates runtime suite failed in $db."
    }
  }
  Write-Output 'FORWARD_0045_F9_DESCRIPTIVE_AGGREGATES_RUNTIME=PASS'
  # PRD-F11 G-F11-5 (0059): the pre-0059 recovery clone retries cleanly and redeploys idempotently.
  Assert-ForwardChecksums 'pathways_phase4_rar_retry'
  $rarRepeatLedger = Read-ForwardLedger 'pathways_phase4_rar_retry'
  Invoke-ForwardDeploy -Database 'pathways_phase4_rar_retry'
  if ((Read-ForwardLedger 'pathways_phase4_rar_retry') -cne $rarRepeatLedger) { throw 'Repeated 0059 recovery deployment changed ledger.' }
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_rar_retry'
  Write-Output 'RAR_FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  Write-Output 'RAR_FORWARD_IDEMPOTENT_DEPLOY=PASS'
  # PRD-F10 G-F10-6 (0060): the pre-0060 recovery clone retries cleanly and redeploys idempotently.
  Assert-ForwardChecksums 'pathways_phase4_rmt_retry'
  $rmtRepeatLedger = Read-ForwardLedger 'pathways_phase4_rmt_retry'
  Invoke-ForwardDeploy -Database 'pathways_phase4_rmt_retry'
  if ((Read-ForwardLedger 'pathways_phase4_rmt_retry') -cne $rmtRepeatLedger) { throw 'Repeated 0060 recovery deployment changed ledger.' }
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_rmt_retry'
  Write-Output 'RMT_FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  Write-Output 'RMT_FORWARD_IDEMPOTENT_DEPLOY=PASS'
  # 0053 expense submit race: the two-session replay race on the recovered clone, runtime login restored after.
  Assert-ForwardTarget 'pathways_phase4_f9a_retry'
  Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $phase6Root 'apps/api/prisma/tests/finance-expense-concurrency-fixture.sql'))) 'pathways_phase4_f9a_retry'
  $expenseRuntimeLogin = (Read-ForwardSql 'pathways_phase4_f9a_retry' "SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime';").Trim()
  $expenseRaceEnvironment = @{ PHASE2_RACE_DATABASE = 'pathways_phase4_f9a_retry'; PHASE2_LOCAL_PORT = "$phase6Port"; PHASE2_RUNTIME_PASSWORD = $trustLocalPlaceholder; PHASE2_OWNER_PASSWORD = $trustLocalPlaceholder }
  try {
    Invoke-LocalSql 'ALTER ROLE pathways_runtime LOGIN;' 'pathways_phase4_f9a_retry'
    foreach ($key in $expenseRaceEnvironment.Keys) { Set-Item -LiteralPath "Env:$key" -Value $expenseRaceEnvironment[$key] }
    Measure-ReplayStep 'node finance-expense-concurrency' { Invoke-ForwardBoundedNode -ScriptPath (Join-Path $phase6Root 'apps/api/prisma/tests/finance-expense-concurrency.mjs') -ExpectedMarker 'FINANCE_EXPENSE_CONCURRENCY=PASS' -TimeoutMilliseconds 180000 }
  } finally {
    foreach ($key in $expenseRaceEnvironment.Keys) { Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue }
    if ($expenseRuntimeLogin -cne 't') { Invoke-LocalSql 'ALTER ROLE pathways_runtime NOLOGIN;' 'pathways_phase4_f9a_retry' }
  }
  Write-Output 'FORWARD_0053_FINANCE_EXPENSE_CONCURRENCY=PASS'
  # F10/F11 rules runtime suite (0058-0060). It commits its synthetic data across machine and human
  # transactions, so it runs last and only on the recovered 0060 clone.
  Assert-ForwardTarget 'pathways_phase4_rmt_retry'
  $rulesSuite = (& $phase6Tools['psql'] -X -q -w -h 127.0.0.1 -p $phase6Port -U postgres -d 'pathways_phase4_rmt_retry' -v ON_ERROR_STOP=1 -f (Join-Path $phase6Root 'apps/api/prisma/tests/f10-f11-rules-runtime.sql') 2>&1) -join "`n"
  if ($LASTEXITCODE -ne 0 -or $rulesSuite -notmatch 'F10_F11_RULES_RUNTIME=PASS') {
    Write-Output $rulesSuite
    throw 'F10/F11 rules runtime suite failed in pathways_phase4_rmt_retry.'
  }
  Write-Output 'FORWARD_0058_0060_F10_F11_RULES_RUNTIME=PASS'
  # 0062 inventory: one SECURITY DEFINER function owned by rules_human_owner, EXECUTE only for pathways_runtime.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore', 'pathways_phase4_rmt_retry')) {
    $escalationShape = Read-ForwardSql $db @"
SELECT (pg_catalog.pg_get_userbyid(p.proowner)='rules_human_owner' AND p.prosecdef
 AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE')
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND NOT has_function_privilege('service_role',p.oid,'EXECUTE') AND NOT has_function_privilege('pathways_rules_worker',p.oid,'EXECUTE')
 AND NOT has_schema_privilege('rules_human_owner','pathways','CREATE')
 AND NOT pg_catalog.pg_has_role('prisma','rules_human_owner','MEMBER'))::text
FROM pg_catalog.pg_proc p WHERE p.oid='pathways.f10_escalated_alert_list(jsonb)'::pg_catalog.regprocedure;
"@
    if ($escalationShape.Trim() -cne 'true') { throw "0062 escalated alert list inventory differs in $db." }
  }
  Write-Output 'FORWARD_0062_ESCALATED_ALERT_LIST_INVENTORY=PASS'
  # cr-pathways-escalated-alerts (0062): reuses the committed rules suite alerts, so it runs right after it.
  $escalationSuite = (& $phase6Tools['psql'] -X -q -w -h 127.0.0.1 -p $phase6Port -U postgres -d 'pathways_phase4_rmt_retry' -v ON_ERROR_STOP=1 -f (Join-Path $phase6Root 'apps/api/prisma/tests/escalated-alert-list-runtime.sql') 2>&1) -join "`n"
  if ($LASTEXITCODE -ne 0 -or $escalationSuite -notmatch 'ESCALATED_ALERT_LIST_RUNTIME=PASS') {
    Write-Output $escalationSuite
    throw 'Escalated alert list runtime suite failed in pathways_phase4_rmt_retry.'
  }
  Write-Output 'FORWARD_0062_ESCALATED_ALERT_LIST_RUNTIME=PASS'
  # 0063 inventory: human_rules_scope stays owned by rules_eligibility_owner, plpgsql and invoker, with no schema CREATE or residual membership.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore', 'pathways_phase4_rmt_retry')) {
    $scopeMemoShape = Read-ForwardSql $db @"
SELECT (pg_catalog.pg_get_userbyid(p.proowner)='rules_eligibility_owner' AND NOT p.prosecdef AND p.provolatile='s'
 AND (SELECT lanname FROM pg_catalog.pg_language WHERE oid=p.prolang)='plpgsql'
 AND NOT has_function_privilege('pathways_runtime',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
 AND NOT has_schema_privilege('rules_eligibility_owner','pathways_rules_internal','CREATE')
 AND NOT pg_catalog.pg_has_role('prisma','rules_eligibility_owner','MEMBER')
 AND NOT pg_catalog.pg_has_role('prisma','rules_store_owner','MEMBER'))::text
FROM pg_catalog.pg_proc p WHERE p.oid='pathways_rules_internal.human_rules_scope(uuid,uuid)'::pg_catalog.regprocedure;
"@
    if ($scopeMemoShape.Trim() -cne 'true') { throw "0063 rules scope memo inventory differs in $db." }
  }
  Write-Output 'FORWARD_0063_RULES_SCOPE_MEMO_INVENTORY=PASS'
  # 0063 runtime checks run in the rules-suite database, after the suites that commit their fixtures.
  $scopeMemoSuite = (& $phase6Tools['psql'] -X -q -w -h 127.0.0.1 -p $phase6Port -U postgres -d 'pathways_phase4_rmt_retry' -v ON_ERROR_STOP=1 -f (Join-Path $phase6Root 'apps/api/prisma/tests/rules-scope-memo-runtime.sql') 2>&1) -join "`n"
  if ($LASTEXITCODE -ne 0 -or $scopeMemoSuite -notmatch 'RULES_SCOPE_MEMO_RUNTIME=PASS') {
    Write-Output $scopeMemoSuite
    throw 'Rules scope memo runtime suite failed in pathways_phase4_rmt_retry.'
  }
  Write-Output 'FORWARD_0063_RULES_SCOPE_MEMO_RUNTIME=PASS'
  # 0091 backup and restore races on the rules-suite clone, after every suite that commits fixtures there; runtime login restored after.
  Assert-ForwardTarget 'pathways_phase4_rmt_retry'
  Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $phase6Root 'apps/api/prisma/tests/backup-recovery-concurrency-fixture.sql'))) 'pathways_phase4_rmt_retry'
  $backupRuntimeLogin = (Read-ForwardSql 'pathways_phase4_rmt_retry' "SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname='pathways_runtime';").Trim()
  $backupRaceEnvironment = @{ PHASE2_RACE_DATABASE = 'pathways_phase4_rmt_retry'; PHASE2_LOCAL_PORT = "$phase6Port"; PHASE2_RUNTIME_PASSWORD = $trustLocalPlaceholder; PHASE2_OWNER_PASSWORD = $trustLocalPlaceholder }
  try {
    Invoke-LocalSql 'ALTER ROLE pathways_runtime LOGIN;' 'pathways_phase4_rmt_retry'
    foreach ($key in $backupRaceEnvironment.Keys) { Set-Item -LiteralPath "Env:$key" -Value $backupRaceEnvironment[$key] }
    Measure-ReplayStep 'node backup-recovery-concurrency' { Invoke-ForwardBoundedNode -ScriptPath (Join-Path $phase6Root 'apps/api/prisma/tests/backup-recovery-concurrency.mjs') -ExpectedMarker 'BACKUP_RECOVERY_CONCURRENCY=PASS' -TimeoutMilliseconds 180000 }
  } finally {
    foreach ($key in $backupRaceEnvironment.Keys) { Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue }
    if ($backupRuntimeLogin -cne 't') { Invoke-LocalSql 'ALTER ROLE pathways_runtime NOLOGIN;' 'pathways_phase4_rmt_retry' }
  }
  Write-Output 'FORWARD_0091_BACKUP_RECOVERY_CONCURRENCY=PASS'
  # 0066 inventory: two release functions owned by prisma with runtime-only EXECUTE; helpers stay owner-only.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $reachShape = Read-ForwardSql $db @"
SELECT ((SELECT bool_and(pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef
  AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))
 FROM pg_catalog.pg_proc p WHERE p.oid IN ('pathways.p06_participation_breakdown(uuid,date,date)'::pg_catalog.regprocedure,
  'pathways.p06_indicator_values(uuid,text)'::pg_catalog.regprocedure))
 AND NOT has_function_privilege('pathways_runtime','pathways.p06_release_reach(jsonb)','EXECUTE')
 AND (SELECT count(*) FROM pathways.role_permissions)=318)::text;
"@
    if ($reachShape.Trim() -cne 'true') { throw "0066 beneficiary reach inventory differs in $db." }
  }
  Write-Output 'FORWARD_0066_BENEFICIARY_REACH_INVENTORY=PASS'
  # 0067 inventory: the progress read function is owned by prisma, SECURITY DEFINER, with runtime-only EXECUTE.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $progressShape = Read-ForwardSql $db @"
SELECT (SELECT pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.provolatile='s'
  AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
 FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p05_beneficiary_progress(uuid,uuid,uuid[])'::pg_catalog.regprocedure)::text;
"@
    if ($progressShape.Trim() -cne 'true') { throw "0067 beneficiary progress inventory differs in $db." }
  }
  Write-Output 'FORWARD_0067_BENEFICIARY_PROGRESS_INVENTORY=PASS'
  # 0068 inventory: the additive last-completion function is a runtime-only, prisma-owned stable definer.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $timelineShape = Read-ForwardSql $db @"
SELECT (SELECT pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.provolatile='s'
  AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
 FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p10_f9_timeline_last_completion(uuid,uuid)'::pg_catalog.regprocedure)::text;
"@
    if ($timelineShape.Trim() -cne 'true') { throw "0068 timeline last completion inventory differs in $db." }
  }
  Write-Output 'FORWARD_0068_TIMELINE_LAST_COMPLETION_INVENTORY=PASS'
  # 0069 inventory: criterion_type gained INDICATOR_LINKAGE and ASSESSMENT_GAIN and kept its five earlier values.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $criterionShape = Read-ForwardSql $db @"
SELECT (SELECT count(*)=7 AND bool_and(e.enumlabel IN ('KPI','TIMELINE_COMPLIANCE','BUDGET_EFFICIENCY','BENEFICIARY_REACH','OTHER','INDICATOR_LINKAGE','ASSESSMENT_GAIN'))
 FROM pg_catalog.pg_enum e WHERE e.enumtypid='pathways.criterion_type'::pg_catalog.regtype)::text;
"@
    if ($criterionShape.Trim() -cne 'true') { throw "0069 criterion type inventory differs in $db." }
  }
  Write-Output 'FORWARD_0069_EVALUATION_AUTO_SCORING_INVENTORY=PASS'
  # 0071 inventory: assessments.record is held by exactly three roles and a restrictive runtime INSERT policy requires it.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $scoreEntryShape = Read-ForwardSql $db @"
SELECT ((SELECT count(*) FROM pathways.role_permissions rp JOIN pathways.permissions p ON p.id=rp.permission_id
  WHERE p.code='assessments.record')=3
 AND EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polrelid='pathways.assessment_results'::pg_catalog.regclass
  AND polname='p09_insert' AND NOT polpermissive AND polcmd='a')
 AND NOT pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','assessments.record'))::text;
"@
    if ($scoreEntryShape.Trim() -cne 'true') { throw "0071 assessment score entry inventory differs in $db." }
  }
  Write-Output 'FORWARD_0071_ASSESSMENT_SCORE_ENTRY_INVENTORY=PASS'
  # 0072 inventory: nullable severities, rule expectations, the prisma-owned classifier and no residual owner chain or schema loan.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore', 'pathways_phase4_rmt_retry')) {
    $severityShape = Read-ForwardSql $db @"
SELECT ((SELECT NOT attnotnull AND NOT atthasdef FROM pg_catalog.pg_attribute WHERE attrelid='pathways.alert_rules'::pg_catalog.regclass AND attname='severity')
 AND (SELECT NOT attnotnull FROM pg_catalog.pg_attribute WHERE attrelid='pathways.rule_based_alerts'::pg_catalog.regclass AND attname='severity')
 AND (SELECT count(*) FROM pg_catalog.pg_attribute WHERE NOT attisdropped AND ((attrelid='pathways.alert_rules'::pg_catalog.regclass
   AND attname IN ('expected_score_improvement','manageable_follow_up_percent'))
  OR (attrelid='pathways.rule_based_alerts'::pg_catalog.regclass AND attname IN ('severity_basis','severity_change'))))=4
 AND (SELECT count(*) FROM pg_catalog.pg_proc WHERE pronamespace='pathways_rules_internal'::pg_catalog.regnamespace
  AND proname IN ('classify_alert_severity','severity_shown','severity_calendar_date','severity_node_result','severity_condition_basis')
  AND pg_catalog.pg_get_userbyid(proowner)='prisma' AND NOT prosecdef AND provolatile='i')=5
 AND NOT EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma') AND r.rolname LIKE 'rules\_%\_owner')
 AND NOT has_schema_privilege('prisma','pathways_rules_internal','USAGE'))::text;
"@
    if ($severityShape.Trim() -cne 'true') { throw "0072 severity classification inventory differs in $db." }
  }
  Write-Output 'FORWARD_0072_SEVERITY_CLASSIFICATION_INVENTORY=PASS'
  # 0073 inventory: the three metric keys in the bindings CHECK, the KPI projection policies and no residual owner chain or schema loan.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore', 'pathways_phase4_rmt_retry')) {
    $metricsShape = Read-ForwardSql $db @"
SELECT ((SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid='pathways_rules_internal.rule_bindings'::pg_catalog.regclass
  AND contype='c' AND pg_catalog.pg_get_constraintdef(oid) LIKE '%KPI_ACHIEVEMENT_PERCENT%'
  AND pg_catalog.pg_get_constraintdef(oid) LIKE '%SURVEY_MEAN_PRE_TEST_PERCENT%'
  AND pg_catalog.pg_get_constraintdef(oid) LIKE '%SURVEY_MEAN_POST_TEST_PERCENT%')=1
 AND (SELECT count(*) FROM pg_catalog.pg_policy WHERE polname IN ('f10_projection_kpi_indicator','f10_projection_kpi_measurement'))=2
 AND (SELECT count(*) FROM pg_catalog.pg_policy WHERE polname IN ('f10_projection_indicator_numeric_guard','f10_projection_measurement_numeric_guard')
  AND NOT polpermissive AND pg_catalog.pg_get_expr(polqual,polrelid) LIKE '%''KPI''%')=2
 AND NOT EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma') AND r.rolname LIKE 'rules\_%\_owner')
 AND NOT has_schema_privilege('prisma','pathways_rules_internal','USAGE'))::text;
"@
    if ($metricsShape.Trim() -cne 'true') { throw "0073 rules metrics inventory differs in $db." }
  }
  Write-Output 'FORWARD_0073_RULES_METRICS_INVENTORY=PASS'
  # 0075 inventory: the Indicator Summary body as 0076 replaced it, under its owner, and no residual membership or schema loan.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore', 'pathways_phase4_rmt_retry')) {
    $summaryShape = Read-ForwardSql $db @"
SELECT ((SELECT pg_catalog.md5(prosrc)='65f2b6fe8bf48f7023dd435ca5888bdd' AND pg_catalog.pg_get_userbyid(proowner)='report_projection_owner'
  FROM pg_catalog.pg_proc WHERE oid='pathways.p34_compute_indicator_value(uuid,uuid,uuid,text)'::pg_catalog.regprocedure)
 AND NOT pg_catalog.pg_has_role('prisma','report_projection_owner','MEMBER')
 AND NOT pg_catalog.has_schema_privilege('report_projection_owner','pathways','CREATE'))::text;
"@
    if ($summaryShape.Trim() -cne 'true') { throw "0075 indicator summary inventory differs in $db." }
  }
  Write-Output 'FORWARD_0075_INDICATOR_SUMMARY_INVENTORY=PASS'
  # 0085 inventory: live columns and CHECKs, the prisma live-read policy, runtime-only p85 functions, and every upgraded row
  # carries media and views arrays with each PUBLISHED one live as itself.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore', 'pathways_phase4_rmt_retry')) {
    $liveShape = Read-ForwardSql $db @"
SELECT ((SELECT count(*) FROM pg_catalog.pg_attribute WHERE attrelid='pathways.project_publications'::pg_catalog.regclass AND NOT attisdropped
  AND NOT attnotnull AND attname IN ('live_revision','live_snapshot','live_published_at','live_published_by_id'))=4
 AND (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid='pathways.project_publications'::pg_catalog.regclass AND convalidated
  AND conname IN ('publication_live_together','publication_snapshot_shape'))=2
 AND EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polname='p85_prisma_live_read' AND polrelid='pathways.project_publications'::pg_catalog.regclass)
 AND (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid IN ('pathways.p85_public_projects(uuid,integer,integer)'::pg_catalog.regprocedure,
   'pathways.p85_publication_media(jsonb,uuid)'::pg_catalog.regprocedure,'pathways.p85_publication_views(jsonb)'::pg_catalog.regprocedure)
  AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE')
  AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))=3
 AND NOT EXISTS(SELECT FROM pathways.project_publications WHERE snapshot->'media' IS DISTINCT FROM '[]'::jsonb
  OR snapshot->'views' IS DISTINCT FROM '[]'::jsonb OR (state='PUBLISHED' AND ROW(live_revision,live_snapshot,live_published_at,live_published_by_id)
   IS DISTINCT FROM ROW(revision,snapshot,published_at,published_by_id))))::text;
"@
    if ($liveShape.Trim() -cne 'true') { throw "0085 public tracker live inventory differs in $db." }
  }
  Write-Output 'FORWARD_0085_PUBLIC_TRACKER_LIVE_INVENTORY=PASS'
  # 0086 inventory: the validated public media queue CHECK, the 0086 validator and the evidence guard body (replaced by 0097, so its
  # 0097 md5), the runtime-only p86 lookup, the public read body (replaced by 0089, so its 0089 md5), and every evidence row still PRIVATE.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $mediaShape = Read-ForwardSql $db @"
SELECT (EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.evidence_media'::pg_catalog.regclass AND conname='p3_evidence_public' AND convalidated)
 AND (SELECT pg_catalog.md5(prosrc) FROM pg_catalog.pg_proc WHERE oid='pathways.p85_publication_media(jsonb,uuid)'::pg_catalog.regprocedure)='60613af01de09c839c3408f0193ceb82'
 AND (SELECT pg_catalog.md5(prosrc) FROM pg_catalog.pg_proc WHERE oid='pathways.p3_guard_public_evidence()'::pg_catalog.regprocedure)='0a3bbf27aa39aa691d7ba0cd57c876cc'
 AND (SELECT pg_catalog.md5(prosrc) FROM pg_catalog.pg_proc WHERE oid='pathways.p85_public_projects(uuid,integer,integer)'::pg_catalog.regprocedure)='2e377c27df955be9547b46648b7c32d9'
 AND (SELECT pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE')
  AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND NOT has_function_privilege('service_role',p.oid,'EXECUTE') FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p86_public_media(uuid,uuid)'::pg_catalog.regprocedure)
 AND NOT EXISTS(SELECT FROM pathways.evidence_media WHERE public_visibility_status<>'PRIVATE'))::text;
"@
    if ($mediaShape.Trim() -cne 'true') { throw "0086 public tracker media inventory differs in $db." }
  }
  Write-Output 'FORWARD_0086_PUBLIC_TRACKER_MEDIA_INVENTORY=PASS'
  # 0087 inventory: the five-view validator, the gated analytics bodies that call the cores, the internal cores, the
  # prisma-only saddd fingerprint, the runtime-only p87 public read and the prisma live-view policies with their USING text.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $analyticsShape = Read-ForwardSql $db @"
SELECT ((SELECT count(*) FROM (VALUES ('pathways.p85_publication_views(jsonb)','e780b7908f1941ab6369d808a98d2c6b'),
   ('pathways.p06_compute_saddd(uuid,uuid[],date,date,text)','7559c376a86d32a5a01198df573ed9fb'),
   ('pathways.p06_saddd(uuid,uuid[],date,date,text)','52c7180d5550de4d48dcfcdd82cbf5fa'),
   ('pathways.p06_saddd_by_place(uuid,uuid,text)','1a61e6dfdbf63db03d334e7ab7ef69d3'),
   ('pathways.p06_compute_indicator_value(uuid,uuid,uuid,text)','3f969e2940ba31cf592e6feb75cc69b2'),
   ('pathways.p06_indicator_values(uuid,text)','aac67ef4de765a95bfbc24edd65f73a4'),
   ('pathways.p10_f9_timeline_aggregate(uuid,uuid,date)','2feb9edc66a5326f333a3f2b59400c76'),
   ('pathways.p10_f9_timeline_last_completion(uuid,uuid)','28d0913ee4f26777dd9b0ff027d7f535'),
   ('pathways.p06_participation_breakdown(uuid,date,date)','da745fcf47b3483a9e4dd5964f521dfc')) w(sig,md5)
  JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig) WHERE pg_catalog.md5(p.prosrc)=w.md5)=9
 AND (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.pronamespace='pathways'::pg_catalog.regnamespace AND p.proname LIKE 'p87\_%\_core'
  AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND NOT has_function_privilege('pathways_runtime',p.oid,'EXECUTE')
  AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))=7
 AND (SELECT pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE')
  AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND NOT has_function_privilege('service_role',p.oid,'EXECUTE') FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p87_public_view(uuid,text)'::pg_catalog.regprocedure)
 AND has_function_privilege('pathways_runtime','pathways.p85_publication_views(jsonb)','EXECUTE')
 AND (SELECT pg_catalog.array_agg(a.grantee::pg_catalog.regrole::text ORDER BY a.grantee::pg_catalog.regrole::text) FROM pg_catalog.pg_proc p,
  pg_catalog.aclexplode(p.proacl) a WHERE p.oid='pathways.p87_saddd_fingerprint(uuid,uuid,jsonb)'::pg_catalog.regprocedure)=ARRAY['prisma']
 AND (SELECT count(*) FROM pg_catalog.pg_policy WHERE polcmd='r' AND polroles=ARRAY['prisma'::pg_catalog.regrole::oid]
  AND ((polname='p87_prisma_live_kpi_read' AND polrelid IN ('pathways.project_indicator_bindings'::pg_catalog.regclass,
    'pathways.project_indicator_measurements'::pg_catalog.regclass))
   OR (polname='p87_prisma_live_saddd_read' AND polrelid='pathways.sensitive_aggregate_releases'::pg_catalog.regclass))
  AND pg_catalog.regexp_replace(pg_catalog.pg_get_expr(polqual,polrelid),'\s+',' ','g')=pg_catalog.format('(EXISTS ( SELECT FROM pathways.project_publications pub'
   ||' WHERE ((pub.organization_id = %1`$s.organization_id) AND (pub.project_id = %1`$s.project_id) AND ((pub.live_snapshot -> ''views''::text) ? %2`$L::text))))',
   (SELECT relname FROM pg_catalog.pg_class WHERE oid=polrelid),CASE WHEN polname='p87_prisma_live_kpi_read' THEN 'kpi' ELSE 'saddd' END))=3)::text;
"@
    if ($analyticsShape.Trim() -cne 'true') { throw "0087 public tracker analytics inventory differs in $db." }
  }
  Write-Output 'FORWARD_0087_PUBLIC_TRACKER_ANALYTICS_INVENTORY=PASS'
  # 0088 inventory: the 0088 p78_record_smart_mapping body under prisma, SECURITY DEFINER with an empty search_path, and EXECUTE for pathways_runtime only.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $smartShape = Read-ForwardSql $db @"
SELECT (SELECT pg_catalog.md5(p.prosrc)='8f38e72b2d04a29694bd514ca6b4317d' AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef
  AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
  AND (SELECT pg_catalog.array_agg(a.grantee::pg_catalog.regrole::text ORDER BY a.grantee::pg_catalog.regrole::text)
   FROM pg_catalog.aclexplode(p.proacl) a WHERE a.privilege_type='EXECUTE' AND a.grantee<>p.proowner)=ARRAY['pathways_runtime']
  AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
  AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
 FROM pg_catalog.pg_proc p WHERE p.oid='pathways.p78_record_smart_mapping(uuid,integer,text,jsonb)'::pg_catalog.regprocedure)::text;
"@
    if ($smartShape.Trim() -cne 'true') { throw "0088 smart mapping V5 inventory differs in $db." }
  }
  Write-Output 'FORWARD_0088_SMART_MAPPING_V5_INVENTORY=PASS'
  # 0089 inventory: the prisma-owned forced-RLS pins table with its keys, checks, policies and column grants, the pins-aware snapshot
  # check, and the three replaced publication bodies under prisma with their modes and the runtime-only public ACLs (guard and public
  # read at their 0097 md5).
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $pinsShape = Read-ForwardSql $db @"
SELECT ((SELECT pg_catalog.pg_get_userbyid(relowner)='prisma' AND relrowsecurity AND relforcerowsecurity
  FROM pg_catalog.pg_class WHERE oid='pathways.project_map_pins'::pg_catalog.regclass)
 AND (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid='pathways.project_map_pins'::pg_catalog.regclass
  AND polroles=ARRAY['pathways_runtime'::pg_catalog.regrole::oid])=4
 AND (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid='pathways.project_map_pins'::pg_catalog.regclass AND convalidated
  AND contype IN ('c','f','p'))=8
 AND has_table_privilege('pathways_runtime','pathways.project_map_pins','SELECT') AND has_table_privilege('pathways_runtime','pathways.project_map_pins','INSERT')
 AND has_table_privilege('pathways_runtime','pathways.project_map_pins','DELETE') AND NOT has_table_privilege('pathways_runtime','pathways.project_map_pins','UPDATE')
 AND has_column_privilege('pathways_runtime','pathways.project_map_pins','locked','UPDATE')
 AND NOT has_column_privilege('pathways_runtime','pathways.project_map_pins','place_name','UPDATE')
 AND NOT has_table_privilege('anon','pathways.project_map_pins','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('authenticated','pathways.project_map_pins','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('service_role','pathways.project_map_pins','SELECT,INSERT,UPDATE,DELETE')
 AND EXISTS(SELECT FROM pg_catalog.pg_constraint WHERE conrelid='pathways.project_publications'::pg_catalog.regclass
  AND conname='publication_snapshot_shape' AND convalidated AND pg_catalog.pg_get_constraintdef(oid) LIKE '%pins%')
 AND (SELECT count(*) FROM (VALUES ('pathways.p34_guard_publication()','98cfb36b48ee1d1299db3910be6eab97',false),
   ('pathways.p85_public_projects(uuid,integer,integer)','2e377c27df955be9547b46648b7c32d9',true),
   ('pathways.p87_public_view(uuid,text)','065e0225b531038d92328a473acdbc4a',true)) w(sig,md5,secdef)
  JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig)
  WHERE pg_catalog.md5(p.prosrc)=w.md5 AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef=w.secdef
   AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
   AND (NOT w.secdef OR (has_function_privilege('pathways_runtime',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))))=3)::text;
"@
    if ($pinsShape.Trim() -cne 'true') { throw "0089 project map pins inventory differs in $db." }
  }
  Write-Output 'FORWARD_0089_PROJECT_MAP_PINS_INVENTORY=PASS'
  # 0090 inventory: the prisma-owned public view counter with row security on, no policy and no API-role grant, the three
  # runtime-only definers (public view counter, password reset audit, dashboard view throttle) with their reviewed bodies,
  # and configuration_operation with its distinct rule conflict codes, no schema CREATE loan and no residual owner chain.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $gapShape = Read-ForwardSql $db @"
SELECT ((SELECT pg_catalog.pg_get_userbyid(relowner)='prisma' AND relrowsecurity AND NOT relforcerowsecurity
  FROM pg_catalog.pg_class WHERE oid='pathways.public_project_views'::pg_catalog.regclass)
 AND NOT EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polrelid='pathways.public_project_views'::pg_catalog.regclass)
 AND (SELECT pg_catalog.string_agg(contype::text,'' ORDER BY contype) FROM pg_catalog.pg_constraint
  WHERE conrelid='pathways.public_project_views'::pg_catalog.regclass AND convalidated AND contype IN ('c','f','p'))='cfp'
 AND NOT EXISTS(SELECT FROM pg_catalog.unnest(ARRAY['pathways_runtime','anon','authenticated','service_role']) r
  WHERE has_table_privilege(r,'pathways.public_project_views','SELECT,INSERT,UPDATE,DELETE'))
 AND (SELECT count(*) FROM (VALUES ('pathways.p90_count_public_view(uuid)','cfb21cf6fa70efc079f1660c0ffc49b2'),
   ('pathways.p90_record_password_reset(uuid)','e2ffa51704707c0525e3d394154ef75f'),
   ('pathways.p90_dashboard_view_due(uuid,uuid,text)','bab5035acc9c2b020d35d747919ceaf4')) w(sig,md5)
  JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig)
  WHERE pg_catalog.md5(p.prosrc)=w.md5 AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef
   AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""'] AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE')
   AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
   AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))=3
 AND (SELECT pg_catalog.md5(prosrc)='9c27a063e27d3b2b05321f357b590329' AND pg_catalog.pg_get_userbyid(proowner)='rules_config_owner'
   AND prosecdef AND provolatile='v' AND proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
  FROM pg_catalog.pg_proc WHERE oid='pathways_rules_internal.configuration_operation(uuid,jsonb,text)'::pg_catalog.regprocedure)
 AND NOT has_schema_privilege('rules_config_owner','pathways_rules_internal','CREATE')
 AND NOT EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma') AND r.rolname LIKE 'rules\_%\_owner'))::text;
"@
    if ($gapShape.Trim() -cne 'true') { throw "0090 test case gap closure inventory differs in $db." }
  }
  Write-Output 'FORWARD_0090_TEST_CASE_GAP_CLOSURE_INVENTORY=PASS'
  # 0091 inventory: the forced recovery points table with its policies and grants, the capture policies, the twelve p91 functions
  # and the two widened assertions with their pinned bodies, owners, modes and exact EXECUTE grantees, and the backup roles.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $backupShape = Read-ForwardSql $db @"
SELECT ((SELECT pg_catalog.pg_get_userbyid(relowner)='prisma' AND relrowsecurity AND relforcerowsecurity
  FROM pg_catalog.pg_class WHERE oid='pathways.recovery_points'::pg_catalog.regclass)
 AND (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid='pathways.recovery_points'::pg_catalog.regclass
  AND polroles=ARRAY['pathways_runtime'::pg_catalog.regrole::oid])=4
 AND (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid='pathways.recovery_points'::pg_catalog.regclass
  AND polroles=ARRAY['prisma'::pg_catalog.regrole::oid])=2
 AND (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid='pathways.recovery_points'::pg_catalog.regclass)=6
 AND (SELECT pg_catalog.array_agg(pg_catalog.pg_get_userbyid(a.grantee)||':'||a.privilege_type ORDER BY pg_catalog.pg_get_userbyid(a.grantee)||':'||a.privilege_type)
  FROM pg_catalog.pg_class c, pg_catalog.aclexplode(c.relacl) a WHERE c.oid='pathways.recovery_points'::pg_catalog.regclass AND a.grantee<>c.relowner)
  =ARRAY['pathways_runtime:DELETE','pathways_runtime:INSERT','pathways_runtime:SELECT']
 AND (SELECT pg_catalog.array_agg(t.attname::text||':'||pg_catalog.pg_get_userbyid(a.grantee)||':'||a.privilege_type ORDER BY t.attname)
  FROM pg_catalog.pg_attribute t, pg_catalog.aclexplode(t.attacl) a WHERE t.attrelid='pathways.recovery_points'::pg_catalog.regclass)
  =ARRAY['captured_at:pathways_runtime:UPDATE','completed_at:pathways_runtime:UPDATE','failure_reason:pathways_runtime:UPDATE',
   'manifest_sha256:pathways_runtime:UPDATE','migration_name:pathways_runtime:UPDATE','size_bytes:pathways_runtime:UPDATE','status:pathways_runtime:UPDATE']
 AND (SELECT pg_catalog.array_agg(polname::text ORDER BY polname) FROM pg_catalog.pg_policy WHERE polrelid='pathways.audit_logs'::pg_catalog.regclass
  AND 'pathways_runtime'::pg_catalog.regrole::oid=ANY(polroles))=ARRAY['p09_select','p4_runtime_insert','p4_runtime_select']
 AND NOT EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polrelid='pathways.audit_logs'::pg_catalog.regclass
  AND polroles && ARRAY[0,'prisma'::pg_catalog.regrole::oid,'pathways_backup_job'::pg_catalog.regrole::oid,'pathways_backup_owner'::pg_catalog.regrole::oid])
 AND (SELECT pg_catalog.array_agg(p.polrelid::pg_catalog.regclass::text ORDER BY p.polrelid::pg_catalog.regclass::text) FROM pg_catalog.pg_policy p
  WHERE p.polname='p91_backup_capture_select' AND p.polcmd='r' AND p.polpermissive AND p.polroles=ARRAY['pathways_backup_owner'::pg_catalog.regrole::oid])
  =(SELECT pg_catalog.array_agg(c.oid::pg_catalog.regclass::text ORDER BY c.oid::pg_catalog.regclass::text) FROM pathways.p91_backup_tables() b
   JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass(b.table_name) WHERE c.relforcerowsecurity)
 AND (SELECT count(*) FROM pg_catalog.pg_policy WHERE polname='p91_backup_capture_select')
  =(SELECT count(*) FROM pathways.p91_backup_tables() b JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass(b.table_name) WHERE c.relforcerowsecurity)
 AND (SELECT count(*) FROM (VALUES
   ('pathways.p91_backup_tables()','pathways_backup_owner',true,'978337df9e7cf14c1d850048fe6d8eea','{pathways_runtime}'),
   ('pathways.p91_capture_organization(uuid)','pathways_backup_owner',true,'d20367285730e33e6d114a4bd872b7e1','{pathways_backup_job,pathways_runtime}'),
   ('pathways.p91_restore_organization(uuid,jsonb,jsonb)','pathways_backup_owner',true,'a669c77bdcb58221c75bb9392cd742d8','{pathways_runtime}'),
   ('pathways.p91_backup_actor(text[])','prisma',true,'1c19d8e7781b5d82bb69dc3cab4b7fa8','{pathways_runtime}'),
   ('pathways.p91_current_migration()','prisma',true,'7169fd50627fa84b7ea2685c306ea9e2','{pathways_runtime}'),
   ('pathways.p91_backup_job_actor(uuid)','prisma',true,'d20c32763851d75ef1dda7bb8b21637f','{}'),
   ('pathways.p91_job_organizations()','prisma',true,'f951b8594fba6e79c02fd277c29a5ec5','{pathways_backup_job}'),
   ('pathways.p91_job_begin_point(uuid,text)','prisma',true,'2fc32b45ebf225083761f709803e58b3','{pathways_backup_job}'),
   ('pathways.p91_job_finish_point(uuid,uuid,jsonb)','prisma',true,'11981c6ecdcd7ea0164e45e7424f8923','{pathways_backup_job}'),
   ('pathways.p91_job_fail_point(uuid,uuid,text,jsonb)','prisma',true,'cbd1cc2ec609e3f4f43f1c5d00ddac42','{pathways_backup_job}'),
   ('pathways.p91_job_retention_points(uuid)','prisma',true,'4b5a279239cdbb08752a5ca8dc09d426','{pathways_backup_job}'),
   ('pathways.p91_job_delete_point(uuid,uuid)','prisma',true,'d50710b32f3e0f9084909dd3fd8e3777','{pathways_backup_job}'),
   ('pathways_rules_internal.assert_runtime_provisioned()','rules_context_owner',false,'e0253a20a840859753e73997c2ff1c86',NULL),
   ('pathways.p34_assert_projection_provisioned()','report_projection_owner',false,'cbe9a226514bb68959b55b4bafaa9db7',NULL)) w(sig,owner,secdef,md5,callers)
  JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig)
  WHERE pg_catalog.md5(p.prosrc)=w.md5 AND pg_catalog.pg_get_userbyid(p.proowner)=w.owner AND p.prosecdef=w.secdef
   AND p.proconfig IS NOT DISTINCT FROM (CASE WHEN w.owner='pathways_backup_owner' THEN ARRAY['search_path=""','lock_timeout=5s'] ELSE ARRAY['search_path=""'] END)
   AND (w.callers IS NULL OR (SELECT coalesce(pg_catalog.array_agg(pg_catalog.pg_get_userbyid(a.grantee)::text ORDER BY pg_catalog.pg_get_userbyid(a.grantee)),'{}')
    FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee<>p.proowner)=w.callers::text[]))=14
 AND (SELECT pg_catalog.array_agg(pg_catalog.pg_get_userbyid(m.roleid)::text ORDER BY pg_catalog.pg_get_userbyid(m.roleid)) FROM pg_catalog.pg_auth_members m
  WHERE m.member='pathways_backup_owner'::pg_catalog.regrole AND m.inherit_option AND NOT m.set_option)
  =ARRAY['prisma','report_projection_owner','rules_store_owner']
 AND (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE member='pathways_backup_owner'::pg_catalog.regrole)=3
 AND NOT EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member='prisma'::pg_catalog.regrole
  AND pg_catalog.pg_get_userbyid(m.roleid) IN ('pathways_backup_owner','rules_store_owner','rules_context_owner','report_projection_owner'))
 AND (SELECT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname='pathways_backup_job')
 AND NOT EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.member='pathways_backup_job'::pg_catalog.regrole)
 AND NOT EXISTS(SELECT FROM pg_catalog.pg_auth_members m WHERE m.roleid='pathways_backup_job'::pg_catalog.regrole AND NOT (m.member='postgres'::pg_catalog.regrole
  AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option AND pg_catalog.pg_get_userbyid(m.grantor)='supabase_admin'))
 AND NOT EXISTS(SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('pathways','pathways_rules_internal') AND c.relkind IN ('r','p','v','m','f','S')
   AND (pg_catalog.has_table_privilege('pathways_backup_job',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR pg_catalog.has_any_column_privilege('pathways_backup_job',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
    OR CASE WHEN c.relkind='S' THEN pg_catalog.has_sequence_privilege('pathways_backup_job',c.oid,'USAGE') ELSE false END)))::text;
"@
    if ($backupShape.Trim() -cne 'true') { throw "0091 backup recovery inventory differs in $db." }
  }
  Write-Output 'FORWARD_0091_BACKUP_RECOVERY_INVENTORY=PASS'
  # 0092 inventory: the outcome read and the dry run are definers with one EXECUTE holder each, the outcome owner's decision
  # read policy exists, no rules owner keeps a schema CREATE loan and prisma keeps no rules owner membership.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $outcomesShape = Read-ForwardSql $db @"
SELECT ((SELECT pg_catalog.pg_get_userbyid(proowner)='rules_outcome_owner' AND prosecdef AND proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
   AND has_function_privilege('rules_human_owner',oid,'EXECUTE') AND NOT has_function_privilege('pathways_runtime',oid,'EXECUTE')
   AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE')
  FROM pg_catalog.pg_proc WHERE oid='pathways_rules_internal.recommendation_outcome(uuid)'::pg_catalog.regprocedure)
 AND (SELECT pg_catalog.pg_get_userbyid(proowner)='rules_eligibility_owner' AND prosecdef AND proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
   AND has_function_privilege('pathways_runtime',oid,'EXECUTE') AND NOT has_function_privilege('anon',oid,'EXECUTE')
   AND NOT has_function_privilege('authenticated',oid,'EXECUTE') AND NOT has_function_privilege('service_role',oid,'EXECUTE')
   AND NOT has_function_privilege('pathways_rules_worker',oid,'EXECUTE')
  FROM pg_catalog.pg_proc WHERE oid='pathways.f10_rule_dry_run_current(uuid)'::pg_catalog.regprocedure)
 AND EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polname='f10_outcome_decision_read'
  AND polrelid='pathways_rules_internal.decisions'::pg_catalog.regclass)
 AND NOT EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.rolname LIKE 'rules\_%\_owner'
  AND (has_schema_privilege(r.oid,'pathways_rules_internal','CREATE') OR has_schema_privilege(r.oid,'pathways','CREATE')))
 AND NOT EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma') AND r.rolname LIKE 'rules\_%\_owner'))::text;
"@
    if ($outcomesShape.Trim() -cne 'true') { throw "0092 rules outcomes inventory differs in $db." }
  }
  Write-Output 'FORWARD_0092_RULES_OUTCOMES_INVENTORY=PASS'
  # 0093 inventory: the alert decision detail is a rules_outcome_owner definer executable only by rules_human_owner, its policy
  # exists, and no rules owner keeps a schema CREATE loan or a prisma membership.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $alertNotesShape = Read-ForwardSql $db @"
SELECT ((SELECT pg_catalog.pg_get_userbyid(proowner)='rules_outcome_owner' AND prosecdef AND proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
   AND has_function_privilege('rules_human_owner',oid,'EXECUTE') AND NOT has_function_privilege('pathways_runtime',oid,'EXECUTE')
   AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE')
  FROM pg_catalog.pg_proc WHERE oid='pathways_rules_internal.alert_decision_detail(uuid)'::pg_catalog.regprocedure)
 AND (SELECT pg_catalog.pg_get_userbyid(proowner)='rules_human_owner' AND prosecdef AND has_function_privilege('pathways_runtime',oid,'EXECUTE')
   AND NOT has_function_privilege('anon',oid,'EXECUTE')
  FROM pg_catalog.pg_proc WHERE oid='pathways.f10_alert_history(uuid,jsonb)'::pg_catalog.regprocedure)
 AND EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polname='f10_outcome_alert_decision_read'
  AND polrelid='pathways_rules_internal.decisions'::pg_catalog.regclass)
 AND NOT EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.rolname LIKE 'rules\_%\_owner'
  AND (has_schema_privilege(r.oid,'pathways_rules_internal','CREATE') OR has_schema_privilege(r.oid,'pathways','CREATE')))
 AND NOT EXISTS(SELECT FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
  WHERE m.member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='prisma') AND r.rolname LIKE 'rules\_%\_owner'))::text;
"@
    if ($alertNotesShape.Trim() -cne 'true') { throw "0093 alert outcome notes inventory differs in $db." }
  }
  Write-Output 'FORWARD_0093_ALERT_OUTCOME_NOTES_INVENTORY=PASS'
  # 0094 inventory: the prisma-owned session table with row security on, no policy and no API-role grant, and the six app_session
  # functions with their reviewed bodies; the five runtime definers are executable only by pathways_runtime, app_session_open by nobody.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $sessionShape = Read-ForwardSql $db @"
SELECT ((SELECT pg_catalog.pg_get_userbyid(relowner)='prisma' AND relrowsecurity AND NOT relforcerowsecurity
  FROM pg_catalog.pg_class WHERE oid='pathways.app_sessions'::pg_catalog.regclass)
 AND NOT EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polrelid='pathways.app_sessions'::pg_catalog.regclass)
 AND NOT EXISTS(SELECT FROM pg_catalog.unnest(ARRAY['pathways_runtime','anon','authenticated','service_role']) r
  WHERE has_table_privilege(r,'pathways.app_sessions','SELECT,INSERT,UPDATE,DELETE'))
 AND (SELECT count(*) FROM (VALUES ('pathways.app_session_open(timestamptz,timestamptz,timestamptz)','38440fd81c5f296d553d4ac7e171ed47',false),
   ('pathways.app_session_current(uuid,uuid)','80e1b5df676229b8726ef06acb60c245',true),
   ('pathways.app_session_touch(uuid,uuid,text)','1a7859309d2555c86b1962c75d6c6922',true),
   ('pathways.app_session_list(uuid,uuid)','ad5708ea29b3250828381accaab61398',true),
   ('pathways.app_session_end(uuid,uuid,uuid,text)','2c798934db7d9d30576ae97c00ecc221',true),
   ('pathways.app_session_end_user(uuid,text)','2a14032795d2b557238c4d5c559c8239',true)) w(sig,md5,secdef)
  JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(w.sig)
  WHERE pg_catalog.md5(p.prosrc)=w.md5 AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef=w.secdef
   AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""']
   AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE')=w.secdef
   AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
   AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))=6)::text;
"@
    if ($sessionShape.Trim() -cne 'true') { throw "0094 session management inventory differs in $db." }
  }
  Write-Output 'FORWARD_0094_SESSION_MANAGEMENT_INVENTORY=PASS'
  # 0095 inventory: the 15 legacy tables are gone and the migration ledger is the only table left in public.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $publicTables = Read-ForwardSql $db "SELECT coalesce(string_agg(c.relname,',' ORDER BY c.relname),'') FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r';"
    if ($publicTables.Trim() -cne '_prisma_migrations') { throw "0095 legacy public retirement inventory differs in $db." }
  }
  Write-Output 'FORWARD_0095_LEGACY_PUBLIC_RETIREMENT_INVENTORY=PASS'
  # 0096 inventory: the three block triggers are on and every organization's audit chain verifies.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $auditShape = Read-ForwardSql $db "SELECT ((SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid='pathways.audit_logs'::pg_catalog.regclass AND tgenabled='O' AND tgname IN ('p96_audit_chain','p96_audit_no_rewrite','p96_audit_no_truncate'))=3 AND NOT EXISTS(SELECT FROM (SELECT DISTINCT organization_id FROM pathways.audit_logs) o, pathways.p96_verify_audit_chain(o.organization_id) v WHERE NOT v.ok))::text;"
    if ($auditShape.Trim() -cne 'true') { throw "0096 audit tamper evidence inventory differs in $db." }
  }
  Write-Output 'FORWARD_0096_AUDIT_TAMPER_INVENTORY=PASS'
  # cr-pathways-audit-tamper-evidence: the 200-insert race commits rows, so it runs on a throwaway clone of the finished chain.
  $auditRaceDb = 'pathways_phase4_audit_race'
  Assert-ForwardTarget 'pathways_phase4_baseline'
  Invoke-LocalSql "CREATE DATABASE $auditRaceDb TEMPLATE pathways_phase4_baseline;" 'postgres'
  $auditRaceEnvironment = @{ PHASE2_RACE_DATABASE = $auditRaceDb; PHASE2_LOCAL_PORT = "$phase6Port"; PHASE2_OWNER_PASSWORD = $trustLocalPlaceholder }
  try {
    Assert-ForwardTarget $auditRaceDb
    foreach ($key in $auditRaceEnvironment.Keys) { Set-Item -LiteralPath "Env:$key" -Value $auditRaceEnvironment[$key] }
    Measure-ReplayStep 'node audit-tamper-concurrency' { Invoke-ForwardBoundedNode -ScriptPath (Join-Path $phase6Root 'apps/api/prisma/tests/audit-tamper-concurrency.mjs') -ExpectedMarker 'AUDIT_TAMPER_CONCURRENCY=PASS' -TimeoutMilliseconds 180000 }
  } finally {
    foreach ($key in $auditRaceEnvironment.Keys) { Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue }
    Assert-ForwardTarget 'pathways_phase4_baseline'
    Invoke-LocalSql "DROP DATABASE $auditRaceDb WITH (FORCE);" 'postgres'
  }
  Write-Output 'FORWARD_0096_AUDIT_TAMPER_CONCURRENCY=PASS'
  # 0097 inventory: both checklist checks, both guards marked 0097, the review read for pathways_runtime only, the shared view body
  # for no API role, and prisma's review policy.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $checklistShape = Read-ForwardSql $db "SELECT ((SELECT count(*) FROM pg_catalog.pg_constraint WHERE convalidated AND conname IN ('p97_publication_checklist_shape','p97_media_checklist_shape'))=2 AND (SELECT count(*) FROM pg_catalog.pg_proc WHERE oid IN ('pathways.p34_guard_publication()'::pg_catalog.regprocedure,'pathways.p3_guard_public_evidence()'::pg_catalog.regprocedure) AND prosrc LIKE '%(0097)%')=2 AND has_function_privilege('pathways_runtime','pathways.p97_review_view(uuid,text)','EXECUTE') AND NOT has_function_privilege('anon','pathways.p97_review_view(uuid,text)','EXECUTE') AND NOT has_function_privilege('pathways_runtime','pathways.p97_view_payload(uuid,uuid,jsonb,text,date,date,text)','EXECUTE') AND EXISTS(SELECT FROM pg_catalog.pg_policy WHERE polname='p97_prisma_review_read' AND polrelid='pathways.project_publications'::pg_catalog.regclass))::text;"
    if ($checklistShape.Trim() -cne 'true') { throw "0097 publication checklist inventory differs in $db." }
  }
  Write-Output 'FORWARD_0097_PUBLICATION_CHECKLIST_INVENTORY=PASS'
  # 0098 inventory: the counter table (RLS, prisma-owned, no API role privilege, hash check, window index) and the SECURITY DEFINER
  # hit function with an empty search_path, executable by pathways_runtime only.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $rateShape = Read-ForwardSql $db @'
SELECT ((SELECT c.relrowsecurity AND pg_catalog.pg_get_userbyid(c.relowner)='prisma' FROM pg_catalog.pg_class c WHERE c.oid='pathways.rate_limit_counters'::pg_catalog.regclass)
 AND NOT EXISTS(SELECT FROM unnest(ARRAY['public','anon','authenticated','service_role','pathways_runtime']) r WHERE has_table_privilege(r,'pathways.rate_limit_counters','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
 AND (SELECT count(*) FROM pg_catalog.pg_constraint WHERE convalidated AND conrelid='pathways.rate_limit_counters'::pg_catalog.regclass AND conname IN ('rate_limit_counters_hash','rate_limit_counters_hits'))=2
 AND EXISTS(SELECT FROM pg_catalog.pg_indexes WHERE schemaname='pathways' AND indexname='rate_limit_counters_window_idx')
 AND (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.oid='pathways.rate_limit_hit(text,integer,integer)'::pg_catalog.regprocedure
   AND pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef AND p.proconfig IS NOT DISTINCT FROM ARRAY['search_path=""'])=1
 AND has_function_privilege('pathways_runtime','pathways.rate_limit_hit(text,integer,integer)','EXECUTE')
 AND NOT EXISTS(SELECT FROM unnest(ARRAY['public','anon','authenticated','service_role']) r WHERE has_function_privilege(r,'pathways.rate_limit_hit(text,integer,integer)','EXECUTE')))::text;
'@
    if ($rateShape.Trim() -cne 'true') { throw "0098 rate limiting inventory differs in $db." }
  }
  Write-Output 'FORWARD_0098_RATE_LIMITING_INVENTORY=PASS'
  # 0098 behaviour as pathways_runtime on a rolled-back transaction: the limit holds, buckets are independent, only hashes are stored.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $rateRuntime = Read-ForwardSql $db @'
BEGIN;
SET LOCAL ROLE pathways_runtime;
DO $$
DECLARE r integer; i integer; refused boolean;
BEGIN
 FOR i IN 1..30 LOOP
  IF pathways.rate_limit_hit('rl-check-one',30,60)<>0 THEN RAISE EXCEPTION 'hit % refused early',i; END IF;
 END LOOP;
 r:=pathways.rate_limit_hit('rl-check-one',30,60);
 IF r NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'hit 31 gave %',r; END IF;
 FOR i IN 1..20 LOOP
  IF pathways.rate_limit_hit('rl-check-many-'||i,30,60)<>0 THEN RAISE EXCEPTION 'bucket % refused',i; END IF;
 END LOOP;
 FOR i IN 1..4 LOOP
  refused:=false;
  BEGIN
   PERFORM CASE i WHEN 1 THEN pathways.rate_limit_hit('',30,60) WHEN 2 THEN pathways.rate_limit_hit('rl-check-bad',0,60)
    WHEN 3 THEN pathways.rate_limit_hit('rl-check-bad',30,3601) ELSE pathways.rate_limit_hit(repeat('x',513),30,60) END;
  EXCEPTION WHEN SQLSTATE '22023' THEN refused:=true; END;
  IF NOT refused THEN RAISE EXCEPTION 'invalid arguments case % accepted',i; END IF;
 END LOOP;
END $$;
RESET ROLE;
SELECT (NOT EXISTS(SELECT FROM pathways.rate_limit_counters WHERE key_hash !~ '^[0-9a-f]{64}$' OR key_hash LIKE 'rl-check%')
 AND (SELECT count(*) FROM pathways.rate_limit_counters WHERE hits=31)=1)::text;
ROLLBACK;
'@
    if ($rateRuntime.Trim() -cne 'true') { throw "0098 rate limiting runtime check differs in $db." }
  }
  Write-Output 'FORWARD_0098_RATE_LIMITING_RUNTIME=PASS'
} finally {
  foreach ($key in $forwardPriorEnvironment.Keys) { Set-Item -LiteralPath "Env:$key" -Value $forwardPriorEnvironment[$key] }
}
