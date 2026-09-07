# Narrow, reviewed Phase 4 operations. Credentials are child-process-only.
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('Inventory', 'ApplyTemp', 'RestoreTemp', 'ApiNegative', 'Deploy0005')]
  [string]$Action
)
$ErrorActionPreference = 'Stop'
$phase4Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$phase4CredentialFile = Join-Path $env:LOCALAPPDATA 'PATHWAYS/secrets/dev-db-admin.credential.xml'
$phase4Exit = 1
try {
  $phase4Credential = Import-Clixml -LiteralPath $phase4CredentialFile
  if ($phase4Credential -isnot [System.Management.Automation.PSCredential] -or
      $phase4Credential.UserName -cne 'postgres.pdqwsknbzkdtiwjjibqt') {
    throw 'Unexpected administrator credential identity.'
  }
  $phase4Info = [Diagnostics.ProcessStartInfo]::new()
  $phase4Info.UseShellExecute = $false
  $phase4Info.CreateNoWindow = $true
  $phase4Info.RedirectStandardOutput = $true
  $phase4Info.RedirectStandardError = $true
  $phase4Info.RedirectStandardInput = $true
  $phase4Info.WorkingDirectory = Join-Path $phase4Root 'apps/api'
  $phase4Secret = $phase4Credential.GetNetworkCredential().Password
  if ($Action -eq 'Deploy0005') {
    $phase4Expected = @{
      '0001_init' = '8B4E25D97B493E6042287373BDA015DB8E1F1E6A1DAF0E49B142484762E248AB'
      '0002_pathways_foundation' = 'A0B6964541B4AEA56CB8529DF93597F182E4E7C8BAF0F53BBDF3F6F7FF9EA9B2'
      '0003_pathways_projects_collection' = '6388784BCE9058736E9B79B6B3E39A0A214255AA8080D810DC99B3B76805194B'
      '0004_pathways_finance_evaluation_decisions' = '8C94BDE1E4F402610A57BE39BAE5C07977C5C6AEAC4E2A96638DA1396C66F08B'
      '0005_supabase_security_adapter' = '6E942CFD46833375F5E0D4BBF4F66B84F28A90FC614472974FC309CF98610BDC'
    }
    $phase4Migrations = Join-Path $phase4Root 'apps/api/prisma/migrations'
    if (@(Get-ChildItem -LiteralPath $phase4Migrations -Directory).Count -ne 5) {
      throw 'Unexpected migration directory count.'
    }
    foreach ($phase4Name in $phase4Expected.Keys) {
      if ((Get-FileHash -LiteralPath (Join-Path $phase4Migrations "$phase4Name/migration.sql") -Algorithm SHA256).Hash -cne $phase4Expected[$phase4Name]) {
        throw 'Migration checksum guard failed.'
      }
    }
    $phase4Info.FileName = (Get-Command node.exe -ErrorAction Stop).Source
    $phase4Info.Arguments = 'node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma'
    $phase4Uri = [UriBuilder]::new()
    $phase4Uri.Scheme = 'postgresql'
    $phase4Uri.Host = 'aws-1-ap-southeast-2.pooler.supabase.com'
    $phase4Uri.Port = 5432
    $phase4Uri.Path = 'postgres'
    $phase4Uri.UserName = $phase4Credential.UserName
    $phase4Uri.Password = [Uri]::EscapeDataString($phase4Secret)
    $phase4Uri.Query = 'sslmode=require&connect_timeout=30&connection_limit=1'
    $phase4Info.EnvironmentVariables['DIRECT_URL'] = $phase4Uri.Uri.AbsoluteUri
    $phase4Input = ''
  } else {
    $phase4Info.FileName = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
    $phase4Info.Arguments = '-X -w -q -A -t -h aws-1-ap-southeast-2.pooler.supabase.com -p 5432 -U postgres.pdqwsknbzkdtiwjjibqt -d postgres -v ON_ERROR_STOP=1'
    $phase4Info.EnvironmentVariables['PGPASSWORD'] = $phase4Secret
    $phase4Info.EnvironmentVariables['PGSSLMODE'] = 'require'
    $phase4Info.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '15'
    $phase4File = switch ($Action) {
      'Inventory' { 'inventory.sql' }
      'ApplyTemp' { 'apply-temp-privileges.sql' }
      'RestoreTemp' { 'restore-temp-privileges.sql' }
      'ApiNegative' { 'api-negative.sql' }
    }
    if ($Action -eq 'Inventory') {
      $phase4Info.EnvironmentVariables['PGOPTIONS'] = '-c default_transaction_read_only=on -c statement_timeout=45000'
    }
    $phase4Input = [IO.File]::ReadAllText((Join-Path $PSScriptRoot $phase4File))
    if ($Action -eq 'Inventory') {
      # Session-pooler startup options are not a read-only guarantee. Enforce it
      # in the SQL transaction as well, and verify the returned setting is on.
      $phase4Input = "BEGIN READ ONLY;`n" + $phase4Input + "`nCOMMIT;"
    }
  }
  $phase4Process = [Diagnostics.Process]::Start($phase4Info)
  $phase4Info.EnvironmentVariables.Remove('PGPASSWORD')
  $phase4Info.EnvironmentVariables.Remove('DIRECT_URL')
  $phase4OutTask = $phase4Process.StandardOutput.ReadToEndAsync()
  $phase4ErrTask = $phase4Process.StandardError.ReadToEndAsync()
  $phase4Process.StandardInput.Write($phase4Input)
  $phase4Process.StandardInput.Close()
  if (-not $phase4Process.WaitForExit(180000)) {
    # Do not kill an uncertain migration; caller must preserve and inspect state.
    Write-Output ('OUTCOME_UNKNOWN; ACTION=' + $Action + '; PID=' + $phase4Process.Id + '; inspect this exact child before any rollback')
    $phase4Exit = 124
    throw 'Phase 4 process exceeded the bounded observation period.'
  }
  $phase4Output = $phase4OutTask.Result
  $phase4ErrorOutput = $phase4ErrTask.Result
  $phase4Exit = $phase4Process.ExitCode
  # Suppress raw database error context and any complete connection strings.
  if ($phase4Exit -ne 0) {
    $phase4Codes = [regex]::Matches($phase4Output + $phase4ErrorOutput, '\b(?:P[0-9]{4}|[0-9]{2}[A-Z0-9]{3})\b') | ForEach-Object Value | Select-Object -Unique
    Write-Output ('ADMIN_ACTION_FAILED=' + $Action + '; EXIT=' + $phase4Exit + '; CODES=' + ($phase4Codes -join ','))
  } else {
    $phase4Output = $phase4Output.Replace($phase4Secret, '[secret withheld]')
    $phase4Output = [regex]::Replace($phase4Output, 'postgres(?:ql)?://\S+', '[connection URL withheld]')
    Write-Output $phase4Output
    Write-Output ('ADMIN_ACTION=' + $Action + '; EXIT=0')
  }
} catch {
  if ($phase4Exit -eq 0) { $phase4Exit = 1 }
  Write-Output ('ADMIN_ACTION_FAILED=' + $Action + '; sensitive error details withheld')
} finally {
  $phase4Credential = $null
  $phase4Secret = $null
}
exit $phase4Exit
