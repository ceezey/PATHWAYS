# Called inside the guarded synthetic Replay-Local cluster, after 0028 parity.
if (-not $MigrationBaseline -or -not $phase6Started -or $phase6Port -ne 55448 -or
    $phase6Database -cne 'pathways_phase4_phase6_replay') { throw 'Forward verification requires owned baseline replay.' }
$forwardDatabases = @($phase6Database, 'pathways_phase4_baseline', 'pathways_phase4_forward_fault', 'pathways_phase4_forward_restore', 'pathways_phase4_core_fault', 'pathways_phase4_core_retry', 'pathways_phase4_pdf_fault', 'pathways_phase4_pdf_retry')
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
)
if (($forwardMigrations.Name -join ',') -cne ($forwardInventory -join ',')) { throw 'Forward migration inventory requires renewed review.' }

function Assert-ForwardTarget([string]$Database) {
  if ($Database -cnotin $forwardDatabases) { throw 'Unapproved forward database.' }
  $identity = (& $phase6Tools['psql'] -X -q -A -t -w -h 127.0.0.1 -p 55448 -U postgres -d $Database -v ON_ERROR_STOP=1 -c "SELECT json_build_object('database',current_database(),'host',host(inet_server_addr()),'port',inet_server_port(),'data',current_setting('data_directory'));") | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $identity.database -cne $Database -or $identity.host -cne '127.0.0.1' -or $identity.port -ne 55448 -or
      [IO.Path]::GetFullPath($identity.data) -cne [IO.Path]::GetFullPath($phase6Data)) { throw 'Forward cluster identity differs.' }
}
function Read-ForwardSql([string]$Database, [string]$Sql) {
  Assert-ForwardTarget $Database
  $result = $Sql | & $phase6Tools['psql'] -X -q -A -t -w -h 127.0.0.1 -p 55448 -U postgres -d $Database -v ON_ERROR_STOP=1
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
  Invoke-LocalSql @'
BEGIN;
DO $acl$
DECLARE source_db record;target_db record;entry record;principal text;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55448 OR current_database() NOT IN ('pathways_phase4_forward_fault','pathways_phase4_forward_restore','pathways_phase4_core_fault','pathways_phase4_core_retry','pathways_phase4_pdf_fault','pathways_phase4_pdf_retry') THEN RAISE EXCEPTION 'Only owned restored database ACLs may be reconstructed'; END IF;
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
'@ $Database
  if ((Read-ForwardDatabaseAcl $Database) -cne (Read-ForwardDatabaseAcl 'pathways_phase4_baseline')) { throw 'Restored database ACL differs from source, including default PUBLIC rights.' }
}

function Invoke-ForwardDeploy([string]$Database, [bool]$Provision = $false, [bool]$ExpectFailure = $false, [bool]$ProvisionCore = $false) {
  Assert-ForwardTarget $Database
  $beforeDeployLog = Read-ForwardPostgresLog
  $env:PATHWAYS_PHASE6_REPLAY_MIGRATIONS = $forwardStage
  $env:DIRECT_URL = "postgresql://prisma@127.0.0.1:55448/${Database}?sslmode=disable&connection_limit=1"
  $env:DATABASE_URL = $env:DIRECT_URL
  try {
    if ($Provision) {
      Invoke-LocalSql "REVOKE CREATE,TEMPORARY ON DATABASE $Database FROM PUBLIC,pathways_runtime;" $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-preprovision.sql'))) $Database
    }
    if ($ProvisionCore) {
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-core-preprovision.sql'))) $Database
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
  }
  if (($Provision -or $ProvisionCore) -and -not $ExpectFailure) {
    Assert-ForwardTarget $Database
    Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-function-validation.sql'))) $Database
    Write-Output "FORWARD_FUNCTION_COMPILATION_${Database}=PASS"
  }
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
      & $phase6Tools['pg_dump'] -w -h 127.0.0.1 -p 55448 -U postgres -d pathways_phase4_baseline --format=custom --file=$snapshot
      if ($LASTEXITCODE -ne 0) { throw 'Forward recovery backup failed.' }
      foreach ($db in $forwardDatabases[2..3]) {
        Invoke-LocalSql "CREATE DATABASE $db;" 'postgres'
        Assert-ForwardTarget $db
        & $phase6Tools['pg_restore'] -w -h 127.0.0.1 -p 55448 -U postgres -d $db --exit-on-error $snapshot
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
        Invoke-ForwardDeploy $faultDb $true $true
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
      & $phase6Tools['pg_dump'] -w -h 127.0.0.1 -p 55448 -U postgres -d pathways_phase4_baseline --format=custom --file=$coreSnapshot
      if ($LASTEXITCODE -ne 0) { throw 'Core recovery backup failed.' }
      foreach ($db in $forwardDatabases[4..5]) {
        Invoke-LocalSql "CREATE DATABASE $db;" 'postgres'
        Assert-ForwardTarget $db
        & $phase6Tools['pg_restore'] -w -h 127.0.0.1 -p 55448 -U postgres -d $db --exit-on-error $coreSnapshot
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
        Invoke-ForwardDeploy $coreFaultDb $false $true $true
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
      & $phase6Tools['pg_dump'] -w -h 127.0.0.1 -p 55448 -U postgres -d pathways_phase4_baseline --format=custom --file=$pdfSnapshot
      if ($LASTEXITCODE -ne 0) { throw '0036 recovery backup failed.' }
      foreach ($db in @('pathways_phase4_pdf_fault', 'pathways_phase4_pdf_retry')) {
        Invoke-LocalSql "CREATE DATABASE $db;" 'postgres'
        Assert-ForwardTarget $db
        & $phase6Tools['pg_restore'] -w -h 127.0.0.1 -p 55448 -U postgres -d $db --exit-on-error $pdfSnapshot
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
        Invoke-ForwardDeploy $pdfFaultDb $false $true
      } finally { Copy-Item -LiteralPath (Join-Path $migration.FullName 'migration.sql') -Destination $pdfFaultPath -Force }
      if ((Read-ForwardLedger $pdfFaultDb "migration_name<>'0036_import_pdf_file_type'") -cne $pdfBeforeLedger -or
          (Read-ForwardCatalog $pdfFaultDb) -cne $pdfBeforeCatalog -or (Read-ForwardData $pdfFaultDb) -cne $pdfBeforeData -or
          (Read-ForwardSql $pdfFaultDb $pdfLabelsSql) -cne $pdfBeforeLabels) {
        throw 'Injected 0036 failure changed pre0036 ledger, catalog, data, database ACL or enum labels.'
      }
      if ($script:forwardFaultLog -notmatch '(?m)^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \S+ \[\d+\] ERROR:\s+PATHWAYS_EXPECTED_PDF_FORWARD_FAULT\s*$') { throw 'Exact 0036 ERROR marker absent from this invocation interval.' }
      Write-Output 'PDF_FORWARD_INJECTED_TRANSACTION_ROLLBACK=PASS'
    }
    foreach ($db in $forwardDatabases[0..1]) { Invoke-ForwardDeploy $db ($migration.Name -ceq '0031_f10_f11_rules_runtime') $false ($migration.Name -ceq '0034_core_feature_completion') }
    if ([int]$migration.Name.Substring(0,4) -ge 31) { Invoke-ForwardDeploy 'pathways_phase4_forward_restore' ($migration.Name -ceq '0031_f10_f11_rules_runtime') $false ($migration.Name -ceq '0034_core_feature_completion') }
    if ([int]$migration.Name.Substring(0,4) -ge 34) { Invoke-ForwardDeploy 'pathways_phase4_core_retry' $false $false ($migration.Name -ceq '0034_core_feature_completion') }
    if ([int]$migration.Name.Substring(0,4) -ge 36) { Invoke-ForwardDeploy 'pathways_phase4_pdf_retry' }
  }
  foreach ($db in $forwardDatabases[0..1]) {
    if ((Read-ForwardLedger $db ("migration_name NOT IN ('" + ($forwardInventory -join "','") + "')")) -cne $originalForwardLedgers[$db]) { throw 'Historical ledger rows changed during forward upgrade.' }
    Assert-ForwardChecksums $db
    $beforeRepeat = Read-ForwardLedger $db
    Invoke-ForwardDeploy $db
    if ((Read-ForwardLedger $db) -cne $beforeRepeat) { throw 'Repeated forward deployment changed ledger.' }
  }
  Assert-ForwardChecksums 'pathways_phase4_core_retry'
  $coreRepeatLedger = Read-ForwardLedger 'pathways_phase4_core_retry'
  Invoke-ForwardDeploy 'pathways_phase4_core_retry'
  if ((Read-ForwardLedger 'pathways_phase4_core_retry') -cne $coreRepeatLedger) { throw 'Repeated core recovery deployment changed ledger.' }
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_core_retry'
  Write-Output 'CORE_FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  Write-Output 'CORE_FORWARD_IDEMPOTENT_DEPLOY=PASS'
  Assert-ForwardChecksums 'pathways_phase4_forward_restore'
  Assert-ForwardParity $phase6Database 'pathways_phase4_baseline'
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_forward_restore'
  Write-Output 'FORWARD_FRESH_UPGRADE_CHECKSUM_PARITY=PASS'
  Write-Output 'FORWARD_IDEMPOTENT_DEPLOY=PASS'
  Write-Output 'FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
  # cr-pathways-admin-read-access: Admin gains only the two reads; writes, expenses and
  # Beneficiary detail stay denied, and aggregate-only roles are unchanged.
  foreach ($db in @('pathways_phase4_baseline', 'pathways_phase4_forward_restore', 'pathways_phase4_core_retry')) {
    $adminRead = Read-ForwardSql $db @"
SELECT (pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','activities.read')
 AND pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','budgets.read')
 AND NOT pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','beneficiaries.records.read')
 AND NOT pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','activities.update')
 AND NOT pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','budgets.create')
 AND NOT pathways.p09_role_allows('SYSTEM_ADMINISTRATOR','expenses.read')
 AND NOT pathways.p09_role_allows('PROGRAM_MANAGER','beneficiaries.records.read')
 AND NOT pathways.p09_role_allows('GRANT_MANAGER','beneficiaries.records.read')
 AND (SELECT count(*) FROM pathways.role_permissions rp JOIN pathways.roles r ON r.id=rp.role_id
      JOIN pathways.permissions p ON p.id=rp.permission_id
      WHERE r.code='SYSTEM_ADMINISTRATOR' AND p.code IN ('activities.read','budgets.read'))=2
 AND (SELECT count(*) FROM pathways.role_permissions)=308)::text;
"@
    if ($adminRead.Trim() -cne 'true') { throw "0035 admin read grants differ in $db." }
  }
  Write-Output 'FORWARD_0035_ADMIN_READ_GRANTS=PASS'
  # cr-pathways-import-throughput-and-pdf (0036): the pre-0036 recovery clone retries
  # cleanly, redeploys idempotently, matches the upgraded baseline catalog, and every
  # target holds exactly the six ordered import_file_type labels under prisma ownership.
  Assert-ForwardChecksums 'pathways_phase4_pdf_retry'
  $pdfRepeatLedger = Read-ForwardLedger 'pathways_phase4_pdf_retry'
  Invoke-ForwardDeploy 'pathways_phase4_pdf_retry'
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
      & $phase6Tools['psql'] -X -q -A -t -w -h 127.0.0.1 -p 55448 -U postgres -d pathways_phase4_pdf_retry -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0 -or ($pdfRuntime -join "`n") -notmatch 'IMPORT_PDF_FILE_TYPE_RUNTIME_ASSERTIONS_PASSED=4') { throw '0036 runtime suite failed.' }
  } finally {
    if ($pdfRuntimeLogin -ceq 'false') { Invoke-LocalSql 'ALTER ROLE pathways_runtime NOLOGIN;' 'pathways_phase4_pdf_retry' }
  }
  Write-Output 'PDF_FORWARD_IMPORT_FILE_TYPE_RUNTIME=PASS'
} finally {
  foreach ($key in $forwardPriorEnvironment.Keys) { Set-Item -LiteralPath "Env:$key" -Value $forwardPriorEnvironment[$key] }
}
