# Invoked only inside Replay-Local's isolated loopback cluster; no hosted credentials.
if (-not $MigrationBaseline -or -not $phase6Started -or $phase6Port -ne 55448 -or
    $phase6Database -cne 'pathways_phase4_phase6_replay') { throw 'Baseline verifier requires guarded local replay' }
$baselineName='0000_pathways_baseline_through_0026'
$baselineStage=Join-Path $phase6Parent 'baseline-migrations'
New-Item -ItemType Directory -Path $baselineStage | Out-Null
Copy-Item -LiteralPath (Join-Path $phase6Root "apps/api/prisma/migrations/$baselineName") -Destination $baselineStage -Recurse
Copy-Item -LiteralPath (Join-Path $phase6History 'migration_lock.toml') -Destination $baselineStage
$env:PATHWAYS_PHASE6_REPLAY_MIGRATIONS=$baselineStage
Invoke-LocalSql 'CREATE DATABASE pathways_phase4_baseline;' 'postgres'
Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $phase6Root 'apps/api/prisma/tests/security-adapter-local-bootstrap.sql'))) 'pathways_phase4_baseline'
$env:DIRECT_URL='postgresql://postgres@127.0.0.1:55448/pathways_phase4_baseline?sslmode=disable&connection_limit=1'
$env:DATABASE_URL=$env:DIRECT_URL
pnpm --filter @pathways/api exec prisma migrate deploy --config $phase6Config
if ($LASTEXITCODE -ne 0) { throw 'Fresh consolidated baseline deployment failed' }
Invoke-LocalSql 'ALTER TABLE public._prisma_migrations OWNER TO prisma;' 'pathways_phase4_baseline'
function Read-BaselineCatalog([string]$Database) {
 $value=(& "$phase6Bin\psql.exe" -X -q -A -t -w -h 127.0.0.1 -p $phase6Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $rbacCatalogSql) | ConvertFrom-Json
 if ($LASTEXITCODE -ne 0) { throw 'Baseline catalog read failed' }
 foreach($item in $value.functions){ if($null -ne $item[3]){$item[3]=@($item[3]|Sort-Object)} }
 foreach($item in $value.tableSecurity){ if($null -ne $item[3]){$item[3]=@($item[3]|Sort-Object)} }
 return $value
}
$freshBaseline=Read-BaselineCatalog 'pathways_phase4_baseline'
$historicalBaseline=Read-BaselineCatalog $phase6Database
[IO.File]::WriteAllText((Join-Path $phase6Root '.tmp/baseline-fresh-catalog.json'),($freshBaseline|ConvertTo-Json -Depth 100))
python (Join-Path $phase6Root 'scripts/migrations/compare_catalogs.py') (Join-Path $phase6Root '.tmp/rbac-local-after-catalog.json') (Join-Path $phase6Root '.tmp/baseline-fresh-catalog.json')
if($LASTEXITCODE -ne 0){throw 'Consolidated baseline differs from historical replay'}
Write-Output 'CONSOLIDATED_BASELINE_CATALOG_PARITY=PASS'
$baselineSecuritySql=Join-Path $phase6Root 'apps/api/prisma/tests/baseline-security-catalog.sql'
$baselineSecurity=@()
foreach($securityDatabase in @($phase6Database,'pathways_phase4_baseline')){
 $security=(& "$phase6Bin\psql.exe" -X -q -A -t -w -h 127.0.0.1 -p $phase6Port -U postgres -d $securityDatabase -v ON_ERROR_STOP=1 -f $baselineSecuritySql)|ConvertFrom-Json
 if($LASTEXITCODE -ne 0){throw 'Baseline ownership/privilege inventory unavailable'}
 foreach($item in $security.defaults){$item[3]=@($item[3]|Sort-Object)}
 $baselineSecurity+=($security|ConvertTo-Json -Depth 100 -Compress)
}
if($baselineSecurity[0] -cne $baselineSecurity[1]){throw 'Baseline effective privileges, owners, extensions or defaults differ'}
Write-Output 'BASELINE_OWNERSHIP_AND_EFFECTIVE_PRIVILEGES=PASS'
$originalLedger=(& "$phase6Bin\psql.exe" -X -q -A -t -w -h 127.0.0.1 -p $phase6Port -U postgres -d $phase6Database -c 'SELECT jsonb_agg(to_jsonb(m) ORDER BY migration_name) FROM public._prisma_migrations m;') -join "`n"
$env:DIRECT_URL="postgresql://prisma@127.0.0.1:55448/${phase6Database}?sslmode=disable&connection_limit=1"
$env:DATABASE_URL=$env:DIRECT_URL
pnpm --filter @pathways/api exec prisma migrate resolve --applied $baselineName --config $phase6Config
if($LASTEXITCODE -ne 0){throw 'Existing-history baseline registration failed'}
# Prisma status may report the archived names; deploy must never re-execute them.
$statusPreviousPreference=$ErrorActionPreference
try{
 $ErrorActionPreference='Continue'
 $statusOutput=(& pnpm --filter @pathways/api exec prisma migrate status --config $phase6Config 2>&1) -join "`n"
 $statusExit=$LASTEXITCODE
}finally{$ErrorActionPreference=$statusPreviousPreference}
[IO.File]::WriteAllText((Join-Path $phase6Root '.tmp/baseline-prisma-status.txt'),$statusOutput)
if($statusExit -ne 0 -and -not ($statusOutput.Contains('diverge') -or $statusOutput.Contains('different'))){throw 'Unexpected Prisma baseline status diagnostic'}
Copy-Item -LiteralPath (Join-Path $phase6Root 'apps/api/prisma/migrations/0027_revised_csv_rbac') -Destination $baselineStage -Recurse
foreach($baselineDatabase in @($phase6Database,'pathways_phase4_baseline')){
 $env:DIRECT_URL="postgresql://prisma@127.0.0.1:55448/${baselineDatabase}?sslmode=disable&connection_limit=1"
 $env:DATABASE_URL=$env:DIRECT_URL
 pnpm --filter @pathways/api exec prisma migrate deploy --config $phase6Config
 if($LASTEXITCODE -ne 0){throw 'Revised RBAC deployment through consolidated chain failed'}
 Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $phase6Root 'apps/api/prisma/tests/revised-csv-rbac-runtime.sql'))) $baselineDatabase
}
$afterLedger=(& "$phase6Bin\psql.exe" -X -q -A -t -w -h 127.0.0.1 -p $phase6Port -U postgres -d $phase6Database -c "SELECT jsonb_agg(to_jsonb(m) ORDER BY migration_name) FROM public._prisma_migrations m WHERE migration_name NOT IN ('$baselineName','0027_revised_csv_rbac');") -join "`n"
if($originalLedger -cne $afterLedger){throw 'Historical ledger rows changed'}
$upgradeCatalog=Read-BaselineCatalog $phase6Database
$freshCatalog=Read-BaselineCatalog 'pathways_phase4_baseline'
[IO.File]::WriteAllText((Join-Path $phase6Root '.tmp/revised-rbac-local-after-catalog.json'),($upgradeCatalog|ConvertTo-Json -Depth 100))
[IO.File]::WriteAllText((Join-Path $phase6Root '.tmp/revised-rbac-local-fresh-catalog.json'),($freshCatalog|ConvertTo-Json -Depth 100))
python (Join-Path $phase6Root 'scripts/migrations/compare_catalogs.py') (Join-Path $phase6Root '.tmp/revised-rbac-local-after-catalog.json') (Join-Path $phase6Root '.tmp/revised-rbac-local-fresh-catalog.json')
if($LASTEXITCODE -ne 0){throw 'Revised baseline fresh/upgrade catalogs differ'}
Write-Output 'REVISED_RBAC_BASELINE_UPGRADE_PARITY=PASS'

# The SQL-only revision must not introduce Prisma datamodel drift.
foreach($modelDatabase in @($phase6Database,'pathways_phase4_baseline')){
 $env:DIRECT_URL="postgresql://prisma@127.0.0.1:55448/${modelDatabase}?sslmode=disable&connection_limit=1"
 $env:DATABASE_URL=$env:DIRECT_URL
 $modelDiff=Join-Path $phase6Parent ($modelDatabase+'-model.sql')
 pnpm --filter @pathways/api exec prisma migrate diff --from-schema-datasource $rbacIntrospectionSchema --to-schema-datamodel (Join-Path $phase6Root 'apps/api/prisma/schema.prisma') --script --output $modelDiff --config $phase6Config
 if($LASTEXITCODE -ne 0 -or [IO.File]::ReadAllText($modelDiff) -cne [IO.File]::ReadAllText($rbacModelDiffAfter)){throw 'Baseline revision introduced datamodel divergence'}
}
Write-Output 'BASELINE_REVISED_PRISMA_DATAMODEL_PARITY=PASS'

# Create a real subsequent migration through Prisma diff between disposable catalogs.
Invoke-LocalSql "CREATE DATABASE pathways_phase4_baseline_probe TEMPLATE pathways_phase4_baseline;" 'postgres'
Invoke-LocalSql 'SET ROLE prisma; CREATE TABLE pathways.baseline_compatibility_probe(id uuid PRIMARY KEY);' 'pathways_phase4_baseline_probe'
$probeMigration=Join-Path $baselineStage '0028_disposable_compatibility_probe'
New-Item -ItemType Directory -Path $probeMigration | Out-Null
$probeFromSchema=Join-Path $phase6Parent 'probe-from.prisma'
$probeToSchema=Join-Path $phase6Parent 'probe-to.prisma'
$probeSchema=[IO.File]::ReadAllText($rbacIntrospectionSchema)
[IO.File]::WriteAllText($probeFromSchema,$probeSchema.Replace('env("DATABASE_URL")','env("PATHWAYS_PROBE_FROM")').Replace('env("DIRECT_URL")','env("PATHWAYS_PROBE_FROM")'))
[IO.File]::WriteAllText($probeToSchema,$probeSchema.Replace('env("DATABASE_URL")','env("PATHWAYS_PROBE_TO")').Replace('env("DIRECT_URL")','env("PATHWAYS_PROBE_TO")'))
$env:PATHWAYS_PROBE_FROM='postgresql://prisma@127.0.0.1:55448/pathways_phase4_baseline?sslmode=disable'
$env:PATHWAYS_PROBE_TO='postgresql://prisma@127.0.0.1:55448/pathways_phase4_baseline_probe?sslmode=disable'
pnpm --filter @pathways/api exec prisma migrate diff --from-schema-datasource $probeFromSchema --to-schema-datasource $probeToSchema --script --output (Join-Path $probeMigration 'migration.sql') --config $phase6Config
Remove-Item Env:PATHWAYS_PROBE_FROM,Env:PATHWAYS_PROBE_TO
if($LASTEXITCODE -ne 0){throw 'Subsequent Prisma migration generation failed'}
$probeSql=[IO.File]::ReadAllText((Join-Path $probeMigration 'migration.sql'))
if($probeSql -notmatch 'CREATE TABLE.*baseline_compatibility_probe' -or $probeSql -match '(?i)DROP|ALTER|TRUNCATE|DELETE'){throw 'Unexpected subsequent migration SQL'}
foreach($baselineDatabase in @($phase6Database,'pathways_phase4_baseline')){
 $env:DIRECT_URL="postgresql://prisma@127.0.0.1:55448/${baselineDatabase}?sslmode=disable&connection_limit=1"
 $env:DATABASE_URL=$env:DIRECT_URL
 pnpm --filter @pathways/api exec prisma migrate deploy --config $phase6Config
 if($LASTEXITCODE -ne 0){throw 'Subsequent forward migration application failed'}
}
Write-Output 'SUBSEQUENT_PRISMA_FORWARD_MIGRATION=PASS'
Write-Output 'HISTORICAL_LEDGER_PRESERVATION=PASS'
