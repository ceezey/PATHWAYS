# Called inside the guarded synthetic Replay-Local cluster, after 0028 parity.
# Non-secret placeholder for a trust-auth disposable cluster; overridable from the environment.
$trustLocalPlaceholder = if ($env:PHASE2_TRUST_PLACEHOLDER) { $env:PHASE2_TRUST_PLACEHOLDER } else { 'trust-local' }
if (-not $MigrationBaseline -or -not $phase6Started -or $phase6Port -le 0 -or
    $phase6Database -cne 'pathways_phase4_phase6_replay') { throw 'Forward verification requires owned baseline replay.' }
$forwardDatabases = @($phase6Database, 'pathways_phase4_baseline', 'pathways_phase4_forward_fault', 'pathways_phase4_forward_restore', 'pathways_phase4_core_fault', 'pathways_phase4_core_retry', 'pathways_phase4_pdf_fault', 'pathways_phase4_pdf_retry', 'pathways_phase4_pin_fault', 'pathways_phase4_pin_retry', 'pathways_phase4_import_fault', 'pathways_phase4_import_retry', 'pathways_phase4_partner_fault', 'pathways_phase4_partner_retry', 'pathways_phase4_partner_suite', 'pathways_phase4_drf_fault', 'pathways_phase4_drf_retry', 'pathways_phase4_media_fault', 'pathways_phase4_media_retry', 'pathways_phase4_psc_fault', 'pathways_phase4_psc_retry', 'pathways_phase4_oex_fault', 'pathways_phase4_oex_retry', 'pathways_phase4_prv_fault', 'pathways_phase4_prv_retry', 'pathways_phase4_f9a_fault', 'pathways_phase4_f9a_retry', 'pathways_phase4_rar_fault', 'pathways_phase4_rar_retry', 'pathways_phase4_rmt_fault', 'pathways_phase4_rmt_retry')
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
    [switch]$ProvisionRulesScopeMemo
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
    $forwardPin = $migration.Name -ceq '0037_step_up_pin'
    $forwardMedia = ($migration.Name -ceq '0041_activity_media_evidence') -or ($migration.Name -ceq '0056_indicator_type')
    $forwardReview = $migration.Name -ceq '0044_activity_progress_review'
    $forwardExpense = $migration.Name -ceq '0053_expense_submit_race'
    $forwardCatalog = $migration.Name -cin @('0059_rules_recommendation_auto_resolve', '0060_rules_budget_beneficiary_survey_metrics')
    $forwardEscalation = $migration.Name -ceq '0062_rules_escalated_alert_list'
    $forwardScopeMemo = $migration.Name -ceq '0063_rules_scope_memo'
    foreach ($db in $forwardDatabases[0..1]) { Invoke-ForwardDeploy -Database $db -Provision:($migration.Name -ceq '0031_f10_f11_rules_runtime') -ProvisionCore:($migration.Name -ceq '0034_core_feature_completion') -ProvisionPin:$forwardPin -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo }
    if ([int]$migration.Name.Substring(0,4) -ge 31) { Invoke-ForwardDeploy -Database 'pathways_phase4_forward_restore' -Provision:($migration.Name -ceq '0031_f10_f11_rules_runtime') -ProvisionCore:($migration.Name -ceq '0034_core_feature_completion') -ProvisionPin:$forwardPin -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo }
    if ([int]$migration.Name.Substring(0,4) -ge 34) { Invoke-ForwardDeploy -Database 'pathways_phase4_core_retry' -ProvisionCore:($migration.Name -ceq '0034_core_feature_completion') -ProvisionPin:$forwardPin -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo }
    if ([int]$migration.Name.Substring(0,4) -ge 36) { Invoke-ForwardDeploy -Database 'pathways_phase4_pdf_retry' -ProvisionPin:$forwardPin -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo }
    if ([int]$migration.Name.Substring(0,4) -ge 37) { Invoke-ForwardDeploy -Database 'pathways_phase4_pin_retry' -ProvisionPin:$forwardPin -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo }
    if ([int]$migration.Name.Substring(0,4) -ge 38) { Invoke-ForwardDeploy -Database 'pathways_phase4_import_retry' -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo }
    if ([int]$migration.Name.Substring(0,4) -ge 39) { Invoke-ForwardDeploy -Database 'pathways_phase4_partner_retry' -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo }
    if ([int]$migration.Name.Substring(0,4) -ge 40) { Invoke-ForwardDeploy -Database 'pathways_phase4_drf_retry' -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo }
    if ([int]$migration.Name.Substring(0,4) -ge 41) { Invoke-ForwardDeploy -Database 'pathways_phase4_media_retry' -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo }
    if ([int]$migration.Name.Substring(0,4) -ge 42) { Invoke-ForwardDeploy -Database 'pathways_phase4_psc_retry' -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo }
    if ([int]$migration.Name.Substring(0,4) -ge 43) { Invoke-ForwardDeploy -Database 'pathways_phase4_oex_retry' -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo }
    if ([int]$migration.Name.Substring(0,4) -ge 44) { Invoke-ForwardDeploy -Database 'pathways_phase4_prv_retry' -ProvisionMedia:$forwardMedia -ProvisionReview:$forwardReview -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo }
    if ([int]$migration.Name.Substring(0,4) -ge 45) { Invoke-ForwardDeploy -Database 'pathways_phase4_f9a_retry' -ProvisionMedia:$forwardMedia -ProvisionExpense:$forwardExpense -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo }
    if ([int]$migration.Name.Substring(0,4) -ge 59) { Invoke-ForwardDeploy -Database 'pathways_phase4_rar_retry' -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo }
    if ([int]$migration.Name.Substring(0,4) -ge 60) { Invoke-ForwardDeploy -Database 'pathways_phase4_rmt_retry' -ProvisionRulesCatalog:$forwardCatalog -ProvisionRulesEscalation:$forwardEscalation -ProvisionRulesScopeMemo:$forwardScopeMemo }
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
 AND (SELECT count(*) FROM pathways.role_permissions)=314)::text;
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
  # 0066 inventory: two release functions owned by prisma with runtime-only EXECUTE; helpers stay owner-only.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore')) {
    $reachShape = Read-ForwardSql $db @"
SELECT ((SELECT bool_and(pg_catalog.pg_get_userbyid(p.proowner)='prisma' AND p.prosecdef
  AND has_function_privilege('pathways_runtime',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
  AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))
 FROM pg_catalog.pg_proc p WHERE p.oid IN ('pathways.p06_participation_breakdown(uuid,date,date)'::pg_catalog.regprocedure,
  'pathways.p06_indicator_values(uuid,text)'::pg_catalog.regprocedure))
 AND NOT has_function_privilege('pathways_runtime','pathways.p06_release_reach(jsonb)','EXECUTE')
 AND (SELECT count(*) FROM pathways.role_permissions)=314)::text;
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
} finally {
  foreach ($key in $forwardPriorEnvironment.Keys) { Set-Item -LiteralPath "Env:$key" -Value $forwardPriorEnvironment[$key] }
}
