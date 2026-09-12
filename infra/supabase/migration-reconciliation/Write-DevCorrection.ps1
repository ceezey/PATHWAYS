# Guarded PATHWAYS-dev writer for the single reviewed audit-function target.
# Do not invoke outside correction-runner.mjs or without the separately reviewed
# authorization, backup/restore evidence, and maintenance window.
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('Correct', 'Rollback')]
  [string]$Action,
  [Parameter(Mandatory)]
  [string]$Authorization,
  [switch]$BackupRestoreConfirmed,
  [switch]$RecoveryAuthorized,
  [Parameter(Mandatory)]
  [switch]$MaintenanceConfirmed
)

$ErrorActionPreference = 'Stop'
$correctionProcess = $null
$correctionLaunched = $false
$correctionExit = 1

try {
  if ($args.Count -ne 0) { throw 'Unexpected arguments.' }
  if ($Action -eq 'Correct') {
    if ($Authorization -cne 'PATHWAYS_DEV_RETIRE_AUDIT_FUNCTION_ONLY' -or
        -not $BackupRestoreConfirmed -or $RecoveryAuthorized) {
      throw 'Correction authorization refused.'
    }
    $correctionFile = 'correction.sql'
    $correctionHash = '46a5557e95671652851f254a78efcbfbd1b1ca241196ae45f4e1c57690842457'
    $correctionMarker = 'PATHWAYS_AUDIT_FUNCTION_CORRECTION_COMMITTED'
  } else {
    if ($Authorization -cne 'PATHWAYS_DEV_RESTORE_AUDIT_FUNCTION_ONLY' -or
        -not $RecoveryAuthorized -or $BackupRestoreConfirmed) {
      throw 'Rollback authorization refused.'
    }
    $correctionFile = 'correction-rollback.sql'
    $correctionHash = '0a3c1c74eb80ece0283da2d2114b86323a8f0e0cc37b8e210630d868d1fc939d'
    $correctionMarker = 'PATHWAYS_AUDIT_FUNCTION_ROLLBACK_COMMITTED'
  }

  $correctionSqlPath = Join-Path $PSScriptRoot $correctionFile
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $correctionSqlPath).Hash.ToLowerInvariant() -cne $correctionHash) {
    throw 'Reviewed SQL fingerprint refused.'
  }

  $correctionCredentialPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'PATHWAYS/secrets/dev-db-admin.credential.xml'
  $correctionCredential = Import-Clixml -LiteralPath $correctionCredentialPath
  if ($correctionCredential -isnot [System.Management.Automation.PSCredential] -or
      $correctionCredential.UserName -cne 'postgres.pdqwsknbzkdtiwjjibqt') {
    throw 'Target refused.'
  }

  $correctionInfo = [Diagnostics.ProcessStartInfo]::new()
  $correctionInfo.UseShellExecute = $false
  $correctionInfo.CreateNoWindow = $true
  $correctionInfo.RedirectStandardInput = $true
  $correctionInfo.RedirectStandardOutput = $true
  $correctionInfo.RedirectStandardError = $true
  $correctionInfo.EnvironmentVariables.Clear()
  $correctionInfo.EnvironmentVariables['SystemRoot'] = $env:SystemRoot
  $correctionInfo.EnvironmentVariables['PGPASSWORD'] = $correctionCredential.GetNetworkCredential().Password
  $correctionInfo.EnvironmentVariables['PGSSLMODE'] = 'require'
  $correctionInfo.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '15'
  $correctionInfo.FileName = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
  $correctionInfo.Arguments = '-X -w -q -A -t -h aws-1-ap-southeast-2.pooler.supabase.com -p 5432 -U postgres.pdqwsknbzkdtiwjjibqt -d postgres -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate'

  $correctionProcess = [Diagnostics.Process]::Start($correctionInfo)
  $correctionLaunched = $true
  $correctionInfo.EnvironmentVariables.Remove('PGPASSWORD')
  $correctionProcess.StartInfo.EnvironmentVariables.Remove('PGPASSWORD')
  $correctionOutput = $correctionProcess.StandardOutput.ReadToEndAsync()
  $correctionError = $correctionProcess.StandardError.ReadToEndAsync()
  $correctionProcess.StandardInput.Write([IO.File]::ReadAllText($correctionSqlPath))
  $correctionProcess.StandardInput.Close()

  if (-not $correctionProcess.WaitForExit(50000)) {
    Write-Output ('{{"status":"UNCERTAIN","action":"{0}","processId":{1}}}' -f $Action, $correctionProcess.Id)
    $correctionExit = 2
  } elseif ($correctionProcess.ExitCode -eq 0 -and
            (($correctionOutput.Result.Trim() -split "`r?`n")[-1] -ceq $correctionMarker)) {
    Write-Output ('{{"status":"PASS","action":"{0}"}}' -f $Action)
    $correctionExit = 0
  } elseif ($correctionProcess.ExitCode -eq 3) {
    Write-Output ('{{"status":"FAILED","action":"{0}","confirmedSqlFailure":true}}' -f $Action)
    $correctionExit = 1
  } else {
    Write-Output ('{{"status":"UNCERTAIN","action":"{0}"}}' -f $Action)
    $correctionExit = 2
  }
} catch {
  if ($correctionLaunched) {
    Write-Output ('{{"status":"UNCERTAIN","action":"{0}"}}' -f $Action)
    $correctionExit = 2
  } else {
    Write-Output ('{{"status":"FAILED","action":"{0}","stage":"guard"}}' -f $Action)
    $correctionExit = 1
  }
} finally {
  $correctionCredential = $null
  if ($null -ne $correctionProcess -and $correctionProcess.HasExited) {
    $correctionProcess.Dispose()
  }
}

exit $correctionExit
