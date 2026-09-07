# Secure, explicit operator entrypoint; no credential contents in console/argv.
[CmdletBinding()]
param(
  [ValidateSet('Check','Seed','Organization','Administrator','Verify')][string]$Action = 'Check',
  [string]$Authorization = '',
  [switch]$StrongUniquePasswordConfirmed
)
$ErrorActionPreference = 'Stop'
$phase5Exit = 1
try {
  if ($Action -notin @('Check','Verify') -and $Authorization -cne 'CANONICAL_SEED_AUTHORIZATION_ADMIN_PROVISIONING_ONLY') {
    throw 'Exact Phase 5 authorization required.'
  }
  if ($Action -eq 'Administrator' -and -not $StrongUniquePasswordConfirmed) {
    throw 'Human confirmation of a strong unique private password is required.'
  }
  $phase5Credential = Import-Clixml -LiteralPath (Join-Path $env:LOCALAPPDATA 'PATHWAYS/secrets/dev-db-admin.credential.xml')
  if ($phase5Credential -isnot [Management.Automation.PSCredential] -or $phase5Credential.UserName -cne 'postgres.pdqwsknbzkdtiwjjibqt') {
    throw 'Unexpected administrator credential identity.'
  }
  $phase5Uri = [UriBuilder]::new()
  $phase5Uri.Scheme = 'postgresql'
  $phase5Uri.Host = 'aws-1-ap-southeast-2.pooler.supabase.com'
  $phase5Uri.Port = 5432
  $phase5Uri.Path = 'postgres'
  $phase5Uri.UserName = $phase5Credential.UserName
  $phase5Uri.Password = [Uri]::EscapeDataString($phase5Credential.GetNetworkCredential().Password)
  $phase5Uri.Query = 'sslmode=require&connect_timeout=15&connection_limit=1'
  $phase5Info = [Diagnostics.ProcessStartInfo]::new()
  $phase5Info.FileName = (Get-Command node.exe -ErrorAction Stop).Source
  $phase5Info.WorkingDirectory = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../../apps/api')).Path
  $phase5Info.UseShellExecute = $false
  $phase5Info.CreateNoWindow = $true
  $phase5Info.RedirectStandardOutput = $true
  $phase5Info.RedirectStandardError = $true
  $phase5Info.Arguments = '-r ts-node/register -r tsconfig-paths/register prisma/authorization-bootstrap-runner.ts ' + $Action
  $phase5Info.EnvironmentVariables['PHASE5_ADMIN_URL'] = $phase5Uri.Uri.AbsoluteUri
  $phase5Info.EnvironmentVariables['PATHWAYS_PHASE5_AUTHORIZATION'] = $Authorization
  $phase5Info.EnvironmentVariables['PATHWAYS_STRONG_UNIQUE_PASSWORD_CONFIRMED'] = $(if ($StrongUniquePasswordConfirmed) {'YES'} else {'NO'})
  $phase5Info.EnvironmentVariables['DIRECT_URL'] = ''
  $phase5Info.EnvironmentVariables['DATABASE_URL'] = ''
  $phase5Info.EnvironmentVariables['SHADOW_DATABASE_URL'] = ''
  $phase5Process = [Diagnostics.Process]::Start($phase5Info)
  $phase5Info.EnvironmentVariables.Remove('PHASE5_ADMIN_URL')
  $phase5Uri.Password = ''
  $phase5Credential = $null
  $phase5Out = $phase5Process.StandardOutput.ReadToEndAsync()
  $phase5Err = $phase5Process.StandardError.ReadToEndAsync()
  if (-not $phase5Process.WaitForExit(60000)) {
    Write-Output ('PHASE5_OUTCOME_UNKNOWN; PID=' + $phase5Process.Id + '; inspect read-only before any retry')
    exit 124
  }
  $phase5Exit = $phase5Process.ExitCode
  if ($phase5Exit -eq 0) {
    # Do not relay arbitrary child text, even on success: parse known-safe fields.
    $phase5Result = $phase5Out.Result.Trim() | ConvertFrom-Json
    if ($phase5Result.action -cne $Action) { throw 'Unexpected result.' }
    $phase5Safe = [ordered]@{action=$Action; exit=0}
    foreach ($phase5Key in @('preflight','roles','permissions','mappings','id','name','code','userId','organizationId','authUserId')) {
      if ($phase5Result.result.PSObject.Properties.Name -contains $phase5Key) {
        $phase5Value = [string]$phase5Result.result.$phase5Key
        if ($phase5Value -notmatch '^[a-zA-Z0-9 _-]{1,100}$') { throw 'Unexpected non-secret output field.' }
        $phase5Safe[$phase5Key] = $phase5Value
      }
    }
    $phase5Safe | ConvertTo-Json -Compress
  } else {
    $phase5Failure = $null
    try { $phase5Failure = $phase5Err.Result.Trim() | ConvertFrom-Json } catch { }
    $phase5SafeFailure = [ordered]@{status='FAILED'; action=$Action; exit=$phase5Exit}
    if ($phase5Failure.stage -cin @('configuration','transaction_start','connection_security','ledger','table_allowlist','legacy_state','business_counts','legacy_counts','provider_inventory','canonical_seed','organization_bootstrap','administrator_bootstrap')) {
      $phase5SafeFailure.stage = $phase5Failure.stage
    }
    if ($phase5Failure.prismaCode -cmatch '^(P[0-9]{4}|NONE)$') { $phase5SafeFailure.prismaCode = $phase5Failure.prismaCode }
    $phase5SafeFailure | ConvertTo-Json -Compress
  }
} catch {
  Write-Output 'PHASE5_BLOCKED; credential, input or preflight unavailable; sensitive details withheld.'
  $phase5Exit = 1
} finally { $phase5Credential = $null; $phase5Uri = $null }
exit $phase5Exit
