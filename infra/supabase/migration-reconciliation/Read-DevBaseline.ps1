# Fixed, read-only PATHWAYS-dev baseline probe. No selectable SQL, target or URL.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$baselineReadExit = 1
$baselineReadProcess = $null

try {
  if ($args.Count -ne 0) { throw 'Unexpected arguments.' }

  $baselineReadFiles = @{
    'inventory.sql' = 'cc194070f526f07897625c0a4aeecc35a4be3bcecd8b3bc305dfedf3011f6f7b'
    'baseline-data-inventory.sql' = '962507c1907ed6ab0786d6efed8b4b0ecfa6b678ed830ec96e307d01af868fcb'
  }
  foreach ($baselineReadEntry in $baselineReadFiles.GetEnumerator()) {
    $baselineReadPath = Join-Path $PSScriptRoot $baselineReadEntry.Key
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $baselineReadPath).Hash.ToLowerInvariant() -cne $baselineReadEntry.Value) {
      throw 'Reviewed read source refused.'
    }
  }

  $baselineReadCredentialPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'PATHWAYS/secrets/dev-db-admin.credential.xml'
  $baselineReadCredential = Import-Clixml -LiteralPath $baselineReadCredentialPath
  if ($baselineReadCredential -isnot [System.Management.Automation.PSCredential] -or
      $baselineReadCredential.UserName -cne 'postgres.pdqwsknbzkdtiwjjibqt') {
    throw 'Target refused.'
  }

  $baselineReadInfo = [Diagnostics.ProcessStartInfo]::new()
  $baselineReadInfo.UseShellExecute = $false
  $baselineReadInfo.CreateNoWindow = $true
  $baselineReadInfo.RedirectStandardInput = $true
  $baselineReadInfo.RedirectStandardOutput = $true
  $baselineReadInfo.RedirectStandardError = $true
  $baselineReadInfo.EnvironmentVariables.Clear()
  $baselineReadInfo.EnvironmentVariables['SystemRoot'] = $env:SystemRoot
  $baselineReadInfo.EnvironmentVariables['PGPASSWORD'] = $baselineReadCredential.GetNetworkCredential().Password
  $baselineReadInfo.EnvironmentVariables['PGSSLMODE'] = 'require'
  $baselineReadInfo.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '15'
  $baselineReadInfo.EnvironmentVariables['PGOPTIONS'] = '-c default_transaction_read_only=on -c statement_timeout=120000'
  $baselineReadInfo.FileName = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
  $baselineReadInfo.Arguments = '-X -w -q -A -t -h aws-1-ap-southeast-2.pooler.supabase.com -p 5432 -U postgres.pdqwsknbzkdtiwjjibqt -d postgres -v ON_ERROR_STOP=1'

  $baselineReadSql = "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;`nSET LOCAL statement_timeout='120s'; SET LOCAL lock_timeout='3s'; SET LOCAL idle_in_transaction_session_timeout='130s'; SET LOCAL search_path=pg_catalog; SET LOCAL timezone='UTC';`n"
  $baselineReadSql += [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'inventory.sql'))
  $baselineReadSql += "`n"
  $baselineReadSql += [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'baseline-data-inventory.sql'))
  $baselineReadSql += @'

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

  $baselineReadProcess = [Diagnostics.Process]::Start($baselineReadInfo)
  $baselineReadInfo.EnvironmentVariables.Remove('PGPASSWORD')
  $baselineReadProcess.StartInfo.EnvironmentVariables.Remove('PGPASSWORD')
  $baselineReadOutput = $baselineReadProcess.StandardOutput.ReadToEndAsync()
  $baselineReadError = $baselineReadProcess.StandardError.ReadToEndAsync()
  $baselineReadProcess.StandardInput.Write($baselineReadSql)
  $baselineReadProcess.StandardInput.Close()

  if (-not $baselineReadProcess.WaitForExit(150000)) {
    # This exact child is forced read-only, so it can be safely stopped.
    $baselineReadProcess.Kill()
    throw 'Read-only probe timed out.'
  }
  if ($baselineReadProcess.ExitCode -ne 0) { throw 'Read-only probe failed.' }

  $baselineReadLines = @($baselineReadOutput.Result -split "`r?`n" | Where-Object { $_.Trim().StartsWith('{') })
  if ($baselineReadLines.Count -lt 3) { throw 'Read-only result incomplete.' }
  $baselineReadCatalog = $baselineReadLines[0] | ConvertFrom-Json
  $baselineReadMaintenance = $baselineReadLines[-1] | ConvertFrom-Json
  $baselineReadData = @()
  for ($baselineReadIndex = 1; $baselineReadIndex -lt ($baselineReadLines.Count - 1); $baselineReadIndex++) {
    $baselineReadRow = $baselineReadLines[$baselineReadIndex] | ConvertFrom-Json
    if ($baselineReadRow.kind -cne 'data') { throw 'Read-only data result refused.' }
    $baselineReadData += $baselineReadRow
  }
  if (-not $baselineReadCatalog.readOnly -or
      $baselineReadCatalog.database -cne 'postgres' -or
      $baselineReadCatalog.user -cne 'postgres' -or
      $baselineReadCatalog.sessionUser -cne 'postgres' -or
      $baselineReadMaintenance.kind -cne 'maintenance') {
    throw 'Connection refused.'
  }

  # Machine input for baseline-runner.mjs. Never display this helper's output.
  Write-Output (@{
    catalog = $baselineReadCatalog
    data = $baselineReadData
    maintenance = $baselineReadMaintenance
  } | ConvertTo-Json -Depth 100 -Compress)
  $baselineReadExit = 0
} catch {
  Write-Output '{"status":"FAILED","stage":"protected-baseline-read"}'
} finally {
  $baselineReadCredential = $null
  if ($null -ne $baselineReadProcess) { $baselineReadProcess.Dispose() }
}

exit $baselineReadExit
