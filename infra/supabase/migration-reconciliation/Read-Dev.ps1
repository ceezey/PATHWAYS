# Read-only PATHWAYS-dev catalog probe. No selectable action, SQL or URL.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$reconcileExit = 1
$reconcileProcess = $null
try {
  if ($args.Count -ne 0) { throw 'Unexpected arguments.' }
  $reconcileCredentialPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'PATHWAYS/secrets/dev-db-admin.credential.xml'
  $reconcileCredential = Import-Clixml -LiteralPath $reconcileCredentialPath
  if ($reconcileCredential -isnot [System.Management.Automation.PSCredential] -or
      $reconcileCredential.UserName -cne 'postgres.pdqwsknbzkdtiwjjibqt') { throw 'Target refused.' }
  $reconcileInfo = [Diagnostics.ProcessStartInfo]::new()
  $reconcileInfo.UseShellExecute = $false
  $reconcileInfo.CreateNoWindow = $true
  $reconcileInfo.RedirectStandardInput = $true
  $reconcileInfo.RedirectStandardOutput = $true
  $reconcileInfo.RedirectStandardError = $true
  $reconcileInfo.EnvironmentVariables.Clear()
  $reconcileInfo.EnvironmentVariables['SystemRoot'] = $env:SystemRoot
  $reconcileInfo.EnvironmentVariables['PGPASSWORD'] = $reconcileCredential.GetNetworkCredential().Password
  $reconcileInfo.EnvironmentVariables['PGSSLMODE'] = 'require'
  $reconcileInfo.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '15'
  $reconcileInfo.EnvironmentVariables['PGOPTIONS'] = '-c default_transaction_read_only=on -c statement_timeout=30000'
  $reconcileInfo.FileName = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
  $reconcileInfo.Arguments = '-X -w -q -A -t -h aws-1-ap-southeast-2.pooler.supabase.com -p 5432 -U postgres.pdqwsknbzkdtiwjjibqt -d postgres -v ON_ERROR_STOP=1'
  $reconcileSql = "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;`nSET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='3s'; SET LOCAL idle_in_transaction_session_timeout='35s'; SET LOCAL search_path=pg_catalog;`n"
  $reconcileSql += [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'inventory.sql'))
  $reconcileSql += "`nROLLBACK;"
  $reconcileProcess = [Diagnostics.Process]::Start($reconcileInfo)
  $reconcileInfo.EnvironmentVariables.Remove('PGPASSWORD')
  $reconcileOutput = $reconcileProcess.StandardOutput.ReadToEndAsync()
  $reconcileError = $reconcileProcess.StandardError.ReadToEndAsync()
  $reconcileProcess.StandardInput.Write($reconcileSql)
  $reconcileProcess.StandardInput.Close()
  if (-not $reconcileProcess.WaitForExit(50000)) {
    # Exact child is a read-only psql probe; no mutation can be in flight.
    $reconcileProcess.Kill()
    throw 'Read-only probe timed out.'
  }
  if ($reconcileProcess.ExitCode -ne 0) { throw 'Read-only probe failed.' }
  $reconcileJson = $reconcileOutput.Result | ConvertFrom-Json
  if (-not $reconcileJson.readOnly -or $reconcileJson.database -cne 'postgres' -or
      $reconcileJson.user -cne 'postgres' -or $reconcileJson.sessionUser -cne 'postgres') { throw 'Connection refused.' }
  # Machine input for runner.mjs. Do not run this helper to display raw output.
  Write-Output $reconcileOutput.Result
  $reconcileExit = 0
} catch {
  Write-Output '{"status":"FAILED","stage":"protected-readonly-probe"}'
} finally {
  $reconcileCredential = $null
  if ($null -ne $reconcileProcess) { $reconcileProcess.Dispose() }
}
exit $reconcileExit
