# Fresh synthetic cluster only. No hosted URLs, credentials or .env reads.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$phase5Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$phase5Bin = 'C:\Program Files\PostgreSQL\18\bin'
$phase5Parent = Join-Path ([IO.Path]::GetTempPath()) ('pathways-phase5-' + [guid]::NewGuid().ToString('N'))
$phase5Data = Join-Path $phase5Parent 'data'
$phase5Exit = 1
$phase5Started = $false
function Invoke-LocalSql([string]$Sql, [string]$Role = 'postgres') {
  $Sql | & "$phase5Bin\psql.exe" -X -w -q -h 127.0.0.1 -p 55439 -U $Role -d pathways_phase4_replay -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw 'Disposable local SQL failed.' }
}
try {
  $phase5Listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 55439)
  try { $phase5Listener.Start() } finally { $phase5Listener.Stop() }
  New-Item -ItemType Directory -Path $phase5Parent | Out-Null
  & "$phase5Bin\initdb.exe" -D $phase5Data -U postgres -A trust --encoding=UTF8 --locale=C | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Disposable cluster creation failed.' }
  & "$phase5Bin\pg_ctl.exe" -D $phase5Data -l (Join-Path $phase5Parent 'postgres.log') -o '-h 127.0.0.1 -p 55439' -w start
  if ($LASTEXITCODE -ne 0) { throw 'Disposable cluster start failed.' }
  $phase5Started = $true
  & "$phase5Bin\createdb.exe" -w -h 127.0.0.1 -p 55439 -U postgres pathways_phase4_replay
  if ($LASTEXITCODE -ne 0) { throw 'Disposable database creation failed.' }
  Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $phase5Root 'apps/api/prisma/tests/security-adapter-local-bootstrap.sql')))
  foreach ($phase5Migration in @('0001_init','0002_pathways_foundation','0003_pathways_projects_collection','0004_pathways_finance_evaluation_decisions')) {
    Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $phase5Root "apps/api/prisma/migrations/$phase5Migration/migration.sql"))) 'prisma'
  }
  Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $phase5Root 'apps/api/prisma/migrations/0005_supabase_security_adapter/migration.sql')))
  # Synthetic Auth shape only, required to test the UUID bootstrap without live Auth.
  Invoke-LocalSql @'
ALTER TABLE auth.users ADD COLUMN email text,
  ADD COLUMN email_confirmed_at timestamptz,
  ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN banned_until timestamptz;
CREATE TABLE auth.mfa_factors(user_id uuid, factor_type text, status text);
'@
  $phase5Inventory = [IO.File]::ReadAllText((Join-Path $phase5Root 'infra/supabase/security-adapter/inventory.sql'))
  $phase5Prefix = $phase5Inventory.Substring(0, $phase5Inventory.IndexOf('auth_users_evidence AS')).TrimEnd()
  $phase5Prefix = $phase5Prefix.TrimEnd(',')
  Invoke-LocalSql ($phase5Prefix + @'
SELECT 'LOCAL_LEGACY_STRUCTURE_MD5=' || md5(jsonb_agg(jsonb_build_array(table_name,evidence->>'structure_md5') ORDER BY table_name)::text)
FROM table_evidence WHERE table_group='legacy';
'@)
  $env:PATHWAYS_MFA_LOCAL_DB_TESTS = '1'
  $env:PATHWAYS_PHASE5_LOCAL_DB_TESTS = '1'
  Push-Location $phase5Root
  try {
    pnpm --filter @pathways/api test
    $phase5Exit = $LASTEXITCODE
  } finally { Pop-Location }
} catch {
  Write-Output ('LOCAL_REPLAY_FAILED=' + $_.Exception.Message)
  $phase5Exit = 1
} finally {
  Remove-Item Env:PATHWAYS_MFA_LOCAL_DB_TESTS -ErrorAction SilentlyContinue
  Remove-Item Env:PATHWAYS_PHASE5_LOCAL_DB_TESTS -ErrorAction SilentlyContinue
  if ($phase5Started) {
    # Only the exact cluster created by this invocation. Preserve all test evidence.
    & "$phase5Bin\pg_ctl.exe" -D $phase5Data -m fast -w stop
    if ($LASTEXITCODE -ne 0) { $phase5Exit = 1 }
  }
  Write-Output ('DISPOSABLE_LOCAL_EVIDENCE_DIRECTORY=' + $phase5Parent)
}
exit $phase5Exit
