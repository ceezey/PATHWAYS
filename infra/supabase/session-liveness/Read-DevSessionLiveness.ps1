# Fixed read-only PATHWAYS-dev session-liveness probe. No selectable SQL or URL.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$livenessReadExit = 1
$livenessReadProcess = $null

try {
  if ($args.Count -ne 0) { throw 'Unexpected arguments.' }
  $livenessReadRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
  if ($livenessReadRoot -cne 'C:\PATHWAYS') { throw 'Repository root refused.' }
  $livenessReadSources = @{
    '..\migration-reconciliation\inventory.sql' = 'cc194070f526f07897625c0a4aeecc35a4be3bcecd8b3bc305dfedf3011f6f7b'
    '..\migration-reconciliation\baseline-data-inventory.sql' = '962507c1907ed6ab0786d6efed8b4b0ecfa6b678ed830ec96e307d01af868fcb'
    'read-status.sql' = '7daf4975a7b922a7c9f4bdcfb9811a5e67f1ad12905c2fbc2e46f2f3a9fab78d'
  }
  foreach ($livenessReadEntry in $livenessReadSources.GetEnumerator()) {
    $livenessReadPath = Join-Path $PSScriptRoot $livenessReadEntry.Key
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $livenessReadPath).Hash.ToLowerInvariant() -cne $livenessReadEntry.Value) {
      throw 'Reviewed read source refused.'
    }
  }

  $livenessReadCredentialPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'PATHWAYS/secrets/dev-db-admin.credential.xml'
  $livenessReadCredential = Import-Clixml -LiteralPath $livenessReadCredentialPath
  if ($livenessReadCredential -isnot [System.Management.Automation.PSCredential] -or
      $livenessReadCredential.UserName -cne 'postgres.pdqwsknbzkdtiwjjibqt') {
    throw 'Target refused.'
  }

  $livenessReadInfo = [Diagnostics.ProcessStartInfo]::new()
  $livenessReadInfo.UseShellExecute = $false
  $livenessReadInfo.CreateNoWindow = $true
  $livenessReadInfo.RedirectStandardInput = $true
  $livenessReadInfo.RedirectStandardOutput = $true
  $livenessReadInfo.RedirectStandardError = $true
  $livenessReadInfo.EnvironmentVariables.Clear()
  $livenessReadInfo.EnvironmentVariables['SystemRoot'] = $env:SystemRoot
  $livenessReadInfo.EnvironmentVariables['PGPASSWORD'] = $livenessReadCredential.GetNetworkCredential().Password
  $livenessReadInfo.EnvironmentVariables['PGSSLMODE'] = 'require'
  $livenessReadInfo.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '15'
  $livenessReadInfo.EnvironmentVariables['PGOPTIONS'] = '-c default_transaction_read_only=on -c statement_timeout=120000'
  $livenessReadInfo.FileName = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
  $livenessReadInfo.Arguments = '-X -w -q -A -t -h aws-1-ap-southeast-2.pooler.supabase.com -p 5432 -U postgres.pdqwsknbzkdtiwjjibqt -d postgres -v ON_ERROR_STOP=1'

  $livenessReadSql = "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;`nSET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='3s'; SET LOCAL idle_in_transaction_session_timeout='130s'; SET LOCAL search_path=pg_catalog; SET LOCAL timezone='UTC';`n"
  $livenessReadSql += [IO.File]::ReadAllText((Join-Path $PSScriptRoot '..\migration-reconciliation\inventory.sql'))
  $livenessReadSql += "`n"
  $livenessReadSql += [IO.File]::ReadAllText((Join-Path $PSScriptRoot '..\migration-reconciliation\baseline-data-inventory.sql'))
  $livenessReadSql += "`n"
  $livenessReadSql += [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'read-status.sql'))
  $livenessReadSql += @'

SELECT jsonb_build_object(
  'kind','maintenance',
  'matchingSessions',count(*),
  'activeOrTransactional',count(*) FILTER (
    WHERE state IS DISTINCT FROM 'idle' OR xact_start IS NOT NULL
  )
)::text
FROM pg_stat_activity
WHERE pid <> pg_backend_pid()
  AND datname = current_database()
  AND usename IN ('prisma','pathways_runtime');
ROLLBACK;
'@

  $livenessReadProcess = [Diagnostics.Process]::Start($livenessReadInfo)
  $livenessReadInfo.EnvironmentVariables.Remove('PGPASSWORD')
  $livenessReadProcess.StartInfo.EnvironmentVariables.Remove('PGPASSWORD')
  $livenessReadOutput = $livenessReadProcess.StandardOutput.ReadToEndAsync()
  $livenessReadError = $livenessReadProcess.StandardError.ReadToEndAsync()
  $livenessReadProcess.StandardInput.Write($livenessReadSql)
  $livenessReadProcess.StandardInput.Close()

  if (-not $livenessReadProcess.WaitForExit(150000)) {
    $livenessReadProcess.Kill()
    throw 'Read-only probe timed out.'
  }
  if ($livenessReadProcess.ExitCode -ne 0) { throw 'Read-only probe failed.' }

  $livenessReadLines = @($livenessReadOutput.Result -split "`r?`n" | Where-Object { $_.Trim().StartsWith('{') })
  if ($livenessReadLines.Count -lt 4) { throw 'Read-only result incomplete.' }
  $livenessReadCatalog = $livenessReadLines[0] | ConvertFrom-Json
  $livenessReadLiveness = $livenessReadLines[-2] | ConvertFrom-Json
  $livenessReadMaintenance = $livenessReadLines[-1] | ConvertFrom-Json
  $livenessReadData = @()
  for ($livenessReadIndex = 1; $livenessReadIndex -lt ($livenessReadLines.Count - 2); $livenessReadIndex++) {
    $livenessReadRow = $livenessReadLines[$livenessReadIndex] | ConvertFrom-Json
    if ($livenessReadRow.kind -cne 'data') { throw 'Read-only data result refused.' }
    $livenessReadData += $livenessReadRow
  }
  if (-not $livenessReadCatalog.readOnly -or
      $livenessReadCatalog.database -cne 'postgres' -or
      $livenessReadCatalog.user -cne 'postgres' -or
      $livenessReadCatalog.sessionUser -cne 'postgres' -or
      $livenessReadLiveness.kind -cne 'liveness' -or
      $livenessReadMaintenance.kind -cne 'maintenance') {
    throw 'Connection refused.'
  }

  Write-Output (@{
    catalog = $livenessReadCatalog
    data = $livenessReadData
    liveness = $livenessReadLiveness
    maintenance = $livenessReadMaintenance
  } | ConvertTo-Json -Depth 100 -Compress)
  $livenessReadExit = 0
} catch {
  Write-Output '{"status":"FAILED","stage":"protected-liveness-read"}'
} finally {
  $livenessReadCredential = $null
  if ($null -ne $livenessReadProcess) { $livenessReadProcess.Dispose() }
}

exit $livenessReadExit
