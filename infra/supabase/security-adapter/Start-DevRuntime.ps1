# Windows-only protected runtime launcher. Never prints the connection URL.
[CmdletBinding()]
param([ValidateSet('Check', 'Start')][string]$Action = 'Check')
$ErrorActionPreference = 'Stop'
$phase4Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$phase4CredentialFile = Join-Path $env:LOCALAPPDATA 'PATHWAYS/secrets/dev-db-runtime.credential.xml'
$phase4Process = $null
try {
  . (Join-Path $PSScriptRoot 'Runtime-Output.ps1')
  $phase4Credential = Import-Clixml -LiteralPath $phase4CredentialFile
  if ($phase4Credential -isnot [System.Management.Automation.PSCredential] -or
      $phase4Credential.UserName -cne 'pathways_runtime.pdqwsknbzkdtiwjjibqt') {
    throw 'Unexpected credential identity.'
  }
  $phase4Uri = [UriBuilder]::new()
  $phase4Uri.Scheme = 'postgresql'
  $phase4Uri.Host = 'aws-1-ap-southeast-2.pooler.supabase.com'
  $phase4Uri.Port = 5432
  $phase4Uri.Path = 'postgres'
  $phase4Uri.UserName = $phase4Credential.UserName
  $phase4Uri.Password = [Uri]::EscapeDataString($phase4Credential.GetNetworkCredential().Password)
  # Development-only bounded cap. Confirm pooler/database headroom before activation.
  # A second connection avoids one slow transaction monopolizing all checks.
  $phase4Uri.Query = 'sslmode=require&connect_timeout=30&connection_limit=2'
  $phase4Info = [Diagnostics.ProcessStartInfo]::new()
  $phase4Info.FileName = (Get-Command node.exe -ErrorAction Stop).Source
  $phase4Info.WorkingDirectory = Join-Path $phase4Root 'apps/api'
  $phase4Info.UseShellExecute = $false
  $phase4Info.CreateNoWindow = $true
  # Forward the Node redactor's output explicitly: hidden native children do
  # not reliably inherit PowerShell's captured stdout/stderr handles.
  $phase4Info.RedirectStandardOutput = $true
  $phase4Info.RedirectStandardError = $true
  $phase4Info.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
  $phase4Info.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
  $phase4Info.Arguments = '../../infra/supabase/security-adapter/runtime-launch.mjs ' + $Action
  $phase4Info.EnvironmentVariables['DATABASE_URL'] = $phase4Uri.Uri.AbsoluteUri
  # Migration/admin credentials are not supplied by this launcher. Nest config
  # may load ignored dev envs; they must never be used for runtime database access.
  # Empty values block dotenv override=false from reloading owner credentials.
  $phase4Info.EnvironmentVariables['DIRECT_URL'] = ''
  $phase4Info.EnvironmentVariables['SHADOW_DATABASE_URL'] = ''
  $phase4Info.EnvironmentVariables.Remove('PGPASSWORD')
  $phase4Process = [Diagnostics.Process]::Start($phase4Info)
  $phase4Info.EnvironmentVariables.Remove('DATABASE_URL')
  $phase4Uri.Password = ''
  $phase4Credential = $null
  $phase4Exit = Receive-ProtectedRuntimeOutput -Process $phase4Process
  $phase4Process.Dispose()
  exit $phase4Exit
} catch {
  if ($null -ne $phase4Process -and -not $phase4Process.HasExited) {
    [Console]::Error.WriteLine('Protected runtime output capture failed. Runtime state is uncertain; do not start another instance. Details withheld.')
    exit 1
  }
  [Console]::Error.WriteLine('Protected runtime launch failed. Verify the current Windows-user DPAPI credential and dedicated runtime role; details withheld.')
  exit 1
}
