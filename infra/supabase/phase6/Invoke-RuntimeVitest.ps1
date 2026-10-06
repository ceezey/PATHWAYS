# Runs one DB-backed *.local.test.ts against a disposable copy of the saved replay template cluster.
param([Parameter(Mandatory)][string]$File, [string]$PostgresBin)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/replay-port.ps1"
. "$PSScriptRoot/migrations-hash.ps1"
. "$PSScriptRoot/replay-template.ps1"
# Enable flag per suite, as set by Replay-Local.ps1 -MigrationBaseline.
$flags = @{
  'src/modules/auth/csv-rbac.local.test.ts' = 'PATHWAYS_CSV_RBAC_LOCAL_TESTS'
  'src/modules/activities/feature-read.local.test.ts' = 'PATHWAYS_FEATURE_READ_LOCAL_TESTS'
  'src/modules/dashboards/c8-runtime.local.test.ts' = 'PATHWAYS_C8_LOCAL_TESTS'
  'src/modules/dashboards/dashboard-home-runtime.local.test.ts' = 'PATHWAYS_DASHBOARD_HOME_SCOPE_LOCAL_TESTS'
  'src/modules/reports/reports-runtime.local.test.ts' = 'PATHWAYS_REPORTS_LOCAL_TESTS'
  'src/modules/activity-extensions/activity-extensions.local.test.ts' = 'PATHWAYS_ACTIVITY_EXTENSIONS_LOCAL_TESTS'
  'src/modules/evaluations/evaluations.local.test.ts' = 'PATHWAYS_EVALUATIONS_LOCAL_TESTS'
}
$tableCount = '60'
$root = (Resolve-Path "$PSScriptRoot/../../..").Path
$api = Join-Path $root 'apps/api'
$rel = [IO.Path]::GetRelativePath($api, (Resolve-Path -LiteralPath $File).Path).Replace('\', '/')
if (-not $flags.ContainsKey($rel)) { Write-Output "RUNTIME_VITEST=FAILED; Unmapped file: $rel"; exit 1 }
$names = @($flags[$rel], 'PATHWAYS_REPLAY_PORT', 'PATHWAYS_EXPECTED_TABLE_COUNT', 'DATABASE_URL', 'DIRECT_URL')
$saved = @{}
foreach ($n in $names) { $saved[$n] = [Environment]::GetEnvironmentVariable($n) }
$run = Join-Path $root ('.tmp/pathways-runtime-' + [guid]::NewGuid().ToString('N'))
$data = Join-Path $run 'data'
$started = $false
$exit = 1
try {
  $manifest = Get-TemplateManifest $root
  $PostgresBin = Get-PostgresBin $PostgresBin
  $ext = if ($env:OS -eq 'Windows_NT') { '.exe' } else { '' }
  $port = Get-FreeLoopbackPort
  New-Item -ItemType Directory -Path $run | Out-Null
  Copy-Item -Recurse (Join-Path $root '.tmp/pathways-replay-template/data') $data
  Add-Content (Join-Path $data 'postgresql.conf') "`nport=$port`npathways.replay_port=$port`n"
  & (Join-Path $PostgresBin "pg_ctl$ext") -D $data -l (Join-Path $run 'postgres.log') -w -s start
  if ($LASTEXITCODE -ne 0) { throw 'Runtime cluster start failed.' }
  $started = $true
  # The replay enables LOGIN on the runtime role before these suites.
  'ALTER ROLE pathways_runtime LOGIN;' | & (Join-Path $PostgresBin "psql$ext") -X -w -q -h 127.0.0.1 -p $port -U postgres -d $manifest.database -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw 'Runtime role login setup failed.' }
  $env:PATHWAYS_REPLAY_PORT = "$port"
  $env:DIRECT_URL = "postgresql://postgres@127.0.0.1:$port/$($manifest.database)?sslmode=disable&connection_limit=1"
  $env:DATABASE_URL = $env:DIRECT_URL
  [Environment]::SetEnvironmentVariable($flags[$rel], '1')
  if ($flags[$rel] -ne 'PATHWAYS_CSV_RBAC_LOCAL_TESTS') { $env:PATHWAYS_EXPECTED_TABLE_COUNT = $tableCount }
  pnpm --dir $api exec vitest run $rel
  if ($LASTEXITCODE -ne 0) { throw "Vitest failed: $rel" }
  Write-Output 'RUNTIME_VITEST=PASS'
  $exit = 0
} catch {
  Write-Output ('RUNTIME_VITEST=FAILED; ' + $_.Exception.Message)
} finally {
  foreach ($n in $names) { [Environment]::SetEnvironmentVariable($n, $saved[$n]) }
  if ($started) { & (Join-Path $PostgresBin "pg_ctl$ext") -D $data -m fast -w -s stop }
  if ((Split-Path $run -Leaf) -match '^pathways-runtime-[a-f0-9]{32}$') { Remove-Item -LiteralPath $run -Recurse -Force -ErrorAction SilentlyContinue }
}
exit $exit
