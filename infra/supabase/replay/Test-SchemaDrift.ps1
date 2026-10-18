# Fails when schema.prisma drifts from the migration chain, using a disposable copy of the saved replay template.
param([string]$Schema = 'apps/api/prisma/schema.prisma', [switch]$Accept, [string]$PostgresBin)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/replay-port.ps1"
. "$PSScriptRoot/migrations-hash.ps1"
$root = (Resolve-Path "$PSScriptRoot/../../..").Path
$expectedFile = Join-Path $PSScriptRoot 'schema-drift-expected.sql'
if (-not $PostgresBin) { $PostgresBin = if ($env:OS -eq 'Windows_NT') { 'C:\Program Files\PostgreSQL\18\bin' } else { '/usr/lib/postgresql/18/bin' } }
$ext = if ($env:OS -eq 'Windows_NT') { '.exe' } else { '' }
$run = Join-Path $root ('.tmp/pathways-drift-' + [guid]::NewGuid().ToString('N'))
$data = Join-Path $run 'data'
$saved = @{ DIRECT_URL = $env:DIRECT_URL; DATABASE_URL = $env:DATABASE_URL; PATHWAYS_PHASE6_REPLAY_MIGRATIONS = $env:PATHWAYS_PHASE6_REPLAY_MIGRATIONS }
$started = $false
$exit = 1
function Get-Normalized([string]$Path) { ([IO.File]::ReadAllText($Path) -replace "`r`n", "`n").TrimEnd() }
try {
  $template = Join-Path $root '.tmp/pathways-replay-template'
  $manifest = Get-Content (Join-Path $template 'manifest.json') -Raw | ConvertFrom-Json
  if ($manifest.migrationsHash -ne (Get-MigrationsHash $root)) { throw 'Template is stale; rerun Replay-Local.ps1 -MigrationBaseline -SaveTemplate.' }
  $Schema = [IO.Path]::GetFullPath($Schema, $root)
  $port = Get-FreeLoopbackPort
  New-Item -ItemType Directory -Path $run | Out-Null
  Copy-Item -Recurse (Join-Path $template 'data') $data
  # The template carries the replay's old port; later lines win.
  Add-Content (Join-Path $data 'postgresql.conf') "`nport=$port`npathways.replay_port=$port`n"
  & (Join-Path $PostgresBin "pg_ctl$ext") -D $data -l (Join-Path $run 'postgres.log') -w -s start
  if ($LASTEXITCODE -ne 0) { throw 'Drift cluster start failed.' }
  $started = $true
  # Introspection must include provider and rules schemas referenced by domain objects.
  $introspection = Join-Path $run 'introspection.prisma'
  [IO.File]::WriteAllText($introspection, [IO.File]::ReadAllText($Schema).Replace('schemas   = ["public", "pathways"]', 'schemas   = ["public", "pathways", "auth", "storage", "pathways_rules_internal"]'))
  New-Item -ItemType Directory -Path (Join-Path $run 'migrations') | Out-Null
  $env:PATHWAYS_PHASE6_REPLAY_MIGRATIONS = Join-Path $run 'migrations'
  $env:DIRECT_URL = "postgresql://postgres@127.0.0.1:${port}/$($manifest.database)?sslmode=disable&connection_limit=1"
  $env:DATABASE_URL = $env:DIRECT_URL
  $diff = Join-Path $run 'diff.sql'
  pnpm --dir (Join-Path $root 'apps/api') exec prisma migrate diff --from-schema-datasource $introspection --to-schema-datamodel $Schema --script --output $diff --config (Join-Path $PSScriptRoot 'prisma.replay.config.ts') | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Prisma migrate diff failed.' }
  if ($Accept) {
    [IO.File]::WriteAllText($expectedFile, (Get-Normalized $diff) + "`n")
    Write-Output "SCHEMA_DRIFT=CLEAN; expected file updated: $expectedFile"
    $exit = 0
  } elseif ((Get-Normalized $diff) -ceq (Get-Normalized $expectedFile)) {
    Write-Output 'SCHEMA_DRIFT=CLEAN'
    $exit = 0
  } else {
    $report = Join-Path $root '.tmp/schema-drift-diff.txt'
    Compare-Object ((Get-Normalized $expectedFile) -split "`n") ((Get-Normalized $diff) -split "`n") | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" } | Set-Content $report
    Get-Content $report -TotalCount 40
    Write-Output "SCHEMA_DRIFT=DRIFT; full difference (=> new, <= expected): $report"
    $exit = 2
  }
} catch {
  Write-Output ('SCHEMA_DRIFT=ERROR; ' + $_.Exception.Message)
} finally {
  foreach ($k in $saved.Keys) { Set-Item "env:$k" $saved[$k] -ErrorAction SilentlyContinue; if ($null -eq $saved[$k]) { Remove-Item "env:$k" -ErrorAction SilentlyContinue } }
  if ($started) { & (Join-Path $PostgresBin "pg_ctl$ext") -D $data -m fast -w -s stop }
  if ((Split-Path $run -Leaf) -match '^pathways-drift-[a-f0-9]{32}$') { Remove-Item -LiteralPath $run -Recurse -Force -ErrorAction SilentlyContinue }
}
exit $exit
