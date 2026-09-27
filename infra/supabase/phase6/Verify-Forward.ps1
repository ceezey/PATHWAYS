# Called inside the guarded synthetic Replay-Local cluster, after 0028 parity.
if (-not $MigrationBaseline -or -not $phase6Started -or $phase6Port -ne 55448 -or
    $phase6Database -cne 'pathways_phase4_phase6_replay') { throw 'Forward verification requires owned baseline replay.' }
$forwardDatabases = @($phase6Database, 'pathways_phase4_baseline', 'pathways_phase4_forward_fault', 'pathways_phase4_forward_restore')
$forwardStage = Join-Path $phase6Parent 'forward-migrations'
New-Item -ItemType Directory -Path $forwardStage | Out-Null
foreach ($name in @($baselineName,'0027_revised_csv_rbac','0028_revised_aggregate_permission_guards')) {
  Copy-Item -LiteralPath (Join-Path $phase6Root "apps/api/prisma/migrations/$name") -Destination $forwardStage -Recurse
}
Copy-Item -LiteralPath (Join-Path $baselineStage 'migration_lock.toml') -Destination $forwardStage
$forwardMigrations = @(Get-ChildItem -LiteralPath (Join-Path $phase6Root 'apps/api/prisma/migrations') -Directory |
  Where-Object { $_.Name -cmatch '^\d{4}_' -and [int]$_.Name.Substring(0,4) -ge 29 } | Sort-Object Name)
if (($forwardMigrations.Name -join ',') -cne '0029_core_registration_and_import_support,0030_core_profile_partners,0031_f10_f11_rules_runtime,0032_core_workflow_actor_locks,0033_core_canonical_activity_review_guard') { throw 'Forward migration inventory requires renewed review.' }

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
  if ($Database -cnotin $forwardDatabases[2..3]) { throw 'Database ACL restoration requires a fixed restored clone.' }
  Assert-ForwardTarget 'pathways_phase4_baseline'
  Assert-ForwardTarget $Database
  Invoke-LocalSql @'
BEGIN;
DO $acl$
DECLARE source_db record;target_db record;entry record;principal text;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55448 OR current_database() NOT IN ('pathways_phase4_forward_fault','pathways_phase4_forward_restore') THEN RAISE EXCEPTION 'Only owned restored database ACLs may be reconstructed'; END IF;
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

function Invoke-ForwardDeploy([string]$Database, [bool]$Provision = $false, [bool]$ExpectFailure = $false) {
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
    if ($Provision) {
      Assert-ForwardTarget $Database
      Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'forward-rules-cleanup.sql'))) $Database
    }
  }
  if ($Provision -and -not $ExpectFailure) {
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
  if ($LASTEXITCODE -ne 0) { throw 'Forward security/catalog parity failed.' }
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
    foreach ($db in $forwardDatabases[0..1]) { Invoke-ForwardDeploy $db ($migration.Name -ceq '0031_f10_f11_rules_runtime') }
    if ([int]$migration.Name.Substring(0,4) -ge 31) { Invoke-ForwardDeploy 'pathways_phase4_forward_restore' ($migration.Name -ceq '0031_f10_f11_rules_runtime') }
  }
  foreach ($db in $forwardDatabases[0..1]) {
    if ((Read-ForwardLedger $db "migration_name !~ '^00(29|3[0-3])_'") -cne $originalForwardLedgers[$db]) { throw 'Historical ledger rows changed during forward upgrade.' }
    Assert-ForwardChecksums $db
    $beforeRepeat = Read-ForwardLedger $db
    Invoke-ForwardDeploy $db
    if ((Read-ForwardLedger $db) -cne $beforeRepeat) { throw 'Repeated forward deployment changed ledger.' }
  }
  Assert-ForwardChecksums 'pathways_phase4_forward_restore'
  Assert-ForwardParity $phase6Database 'pathways_phase4_baseline'
  Assert-ForwardParity 'pathways_phase4_baseline' 'pathways_phase4_forward_restore'
  Write-Output 'FORWARD_FRESH_UPGRADE_CHECKSUM_PARITY=PASS'
  Write-Output 'FORWARD_IDEMPOTENT_DEPLOY=PASS'
  Write-Output 'FORWARD_BACKUP_RESTORE_RECOVERY=PASS'
} finally {
  foreach ($key in $forwardPriorEnvironment.Keys) { Set-Item -LiteralPath "Env:$key" -Value $forwardPriorEnvironment[$key] }
}
