# Guarded PATHWAYS-dev writer for session-liveness 0006 or its reviewed
# containment rollback. Invoke only through deployment-runner.mjs.
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('Deploy','Rollback')]
  [string]$Action,
  [string]$StagePath = '',
  [Parameter(Mandatory)]
  [string]$Authorization,
  [switch]$BackupRestoreConfirmed,
  [switch]$RecoveryAuthorized,
  [Parameter(Mandatory)]
  [switch]$MaintenanceConfirmed
)

$ErrorActionPreference = 'Stop'
$livenessWriteProcess = $null
$livenessWriteLaunched = $false
$livenessWriteExit = 1

try {
  if ($args.Count -ne 0 -or -not $MaintenanceConfirmed -or
      ($Action -ceq 'Deploy' -and (-not $BackupRestoreConfirmed -or $RecoveryAuthorized)) -or
      ($Action -ceq 'Rollback' -and (-not $RecoveryAuthorized -or $BackupRestoreConfirmed))) {
    throw 'Session-liveness authorization refused.'
  }
  $livenessWriteExpectedAuthorization = if ($Action -ceq 'Deploy') {
    'PATHWAYS_DEV_SESSION_LIVENESS_0006_ONLY'
  } else {
    'PATHWAYS_DEV_SESSION_LIVENESS_0006_ROLLBACK_ONLY'
  }
  if ($Authorization -cne $livenessWriteExpectedAuthorization) {
    throw 'Session-liveness authorization refused.'
  }

  $livenessWriteRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
  if ($livenessWriteRoot -cne 'C:\PATHWAYS') { throw 'Repository root refused.' }
  $livenessWriteExpected = @(
    @{ Name = '0001_init'; Hash = '8b4e25d97b493e6042287373bda015db8e1f1e6a1daf0e49b142484762e248ab' },
    @{ Name = '0002_pathways_foundation'; Hash = 'a0b6964541b4aea56cb8529df93597f182e4e7c8baf0f53bbdf3f6f7ff9ea9b2' },
    @{ Name = '0003_pathways_projects_collection'; Hash = '6388784bce9058736e9b79b6b3e39a0a214255aa8080d810dc99b3b76805194b' },
    @{ Name = '0004_pathways_finance_evaluation_decisions'; Hash = '8c94bde1e4f402610a57be39bae5c07977c5c6aeac4e2a96638da1396c66f08b' },
    @{ Name = '0005_supabase_security_adapter'; Hash = '6e942cfd46833375f5e0d4bbf4f66b84f28a90fc614472974fc309cf98610bdc' },
    @{ Name = '0006_auth_session_liveness'; Hash = '8034f7910e09fae33c6f10d7bec434cf0bc65555e057aa2dd262d35a9b8ade00' }
  )

  $livenessWriteReader = Join-Path $PSScriptRoot 'Read-DevSessionLiveness.ps1'
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $livenessWriteReader).Hash.ToLowerInvariant() -cne
      '0a1b07145b5c976b58bae70cc97a4d995fcebad20c7cf869ad5ccdc8a2330b47') {
    throw 'Protected reader fingerprint refused.'
  }
  $livenessWriteReadOutput = & 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $livenessWriteReader
  if ($LASTEXITCODE -ne 0) { throw 'Protected preflight failed.' }
  $livenessWriteState = ($livenessWriteReadOutput -join "`n") | ConvertFrom-Json
  $livenessWriteLedger = @($livenessWriteState.catalog.ledger)
  $livenessWriteExpectedPrefix = if ($Action -ceq 'Deploy') { 5 } else { 6 }
  if ($livenessWriteLedger.Count -ne $livenessWriteExpectedPrefix -or
      [int]$livenessWriteState.maintenance.matchingSessions -ne 0 -or
      [int]$livenessWriteState.maintenance.activeOrTransactional -ne 0) {
    throw 'Session-liveness preflight state refused.'
  }
  for ($livenessWriteIndex = 0; $livenessWriteIndex -lt $livenessWriteExpectedPrefix; $livenessWriteIndex++) {
    $livenessWriteRow = $livenessWriteLedger[$livenessWriteIndex]
    $livenessWriteExpectedRow = $livenessWriteExpected[$livenessWriteIndex]
    if ($livenessWriteRow.name -cne $livenessWriteExpectedRow.Name -or
        $livenessWriteRow.checksum -cne $livenessWriteExpectedRow.Hash -or
        -not $livenessWriteRow.finished -or $livenessWriteRow.rolledBack -or
        $livenessWriteRow.failureLog) {
      throw 'Session-liveness ledger prefix refused.'
    }
  }
  if (($Action -ceq 'Deploy' -and
       ([bool]$livenessWriteState.liveness.present -or
        [int]$livenessWriteState.liveness.sameNameCount -ne 0 -or
        @($livenessWriteState.catalog.objects).Count -ne 1193)) -or
      ($Action -ceq 'Rollback' -and
       (-not [bool]$livenessWriteState.liveness.valid -or
        [int]$livenessWriteState.liveness.sameNameCount -ne 1 -or
        @($livenessWriteState.catalog.objects).Count -ne 1195))) {
    throw 'Session-liveness catalog state refused.'
  }

  if ($Action -ceq 'Deploy') {
    $livenessWriteResolvedStage = (Resolve-Path -LiteralPath $StagePath).Path
    $livenessWriteStageParent = Split-Path -Parent $livenessWriteResolvedStage
    $livenessWriteTmp = (Resolve-Path -LiteralPath (Join-Path $livenessWriteRoot '.tmp')).Path
    if ((Split-Path -Parent $livenessWriteStageParent) -cne $livenessWriteTmp -or
        (Split-Path -Leaf $livenessWriteStageParent) -cnotmatch '^pathways-session-liveness-[A-Za-z0-9]+$' -or
        (Split-Path -Leaf $livenessWriteResolvedStage) -cne 'migrations' -or
        (Get-Item -LiteralPath $livenessWriteResolvedStage).LinkType) {
      throw 'Session-liveness staging path refused.'
    }
    $livenessWriteNames = @(Get-ChildItem -LiteralPath $livenessWriteResolvedStage -Force | Sort-Object Name | ForEach-Object Name)
    $livenessWriteRequiredNames = @($livenessWriteExpected.Name) + @('migration_lock.toml')
    if (($livenessWriteNames -join "`n") -cne (($livenessWriteRequiredNames | Sort-Object) -join "`n")) {
      throw 'Session-liveness staging contents refused.'
    }
    foreach ($livenessWriteItem in $livenessWriteExpected) {
      $livenessWriteFolder = Join-Path $livenessWriteResolvedStage $livenessWriteItem.Name
      $livenessWriteSql = Join-Path $livenessWriteFolder 'migration.sql'
      if ((Get-Item -LiteralPath $livenessWriteFolder).LinkType -or
          (Get-Item -LiteralPath $livenessWriteSql).LinkType -or
          ((@(Get-ChildItem -LiteralPath $livenessWriteFolder -Force).Name -join "`n") -cne 'migration.sql') -or
          (Get-FileHash -Algorithm SHA256 -LiteralPath $livenessWriteSql).Hash.ToLowerInvariant() -cne $livenessWriteItem.Hash) {
        throw 'Session-liveness staging fingerprint refused.'
      }
    }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $livenessWriteResolvedStage 'migration_lock.toml')).Hash.ToLowerInvariant() -cne
        '74a9137885ce73d3ff088d79d658f8066e05e680fb51c0800a290c91c0c01d48' -or
        (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $PSScriptRoot 'prisma.deploy.config.ts')).Hash.ToLowerInvariant() -cne
        'c8d6795869e4d4b67cd2f6a33a888a2703bfdab9d320b4770fde0d4510328d77') {
      throw 'Session-liveness deployment source refused.'
    }
  } else {
    if ($StagePath -cne '' -or
        (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $PSScriptRoot 'rollback.sql')).Hash.ToLowerInvariant() -cne
        '5a48e607995d85b83f15be3586bee143264656548c23b19569587d8005fd452d') {
      throw 'Session-liveness rollback source refused.'
    }
  }

  $livenessWriteCredentialPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'PATHWAYS/secrets/dev-db-admin.credential.xml'
  $livenessWriteCredential = Import-Clixml -LiteralPath $livenessWriteCredentialPath
  if ($livenessWriteCredential -isnot [System.Management.Automation.PSCredential] -or
      $livenessWriteCredential.UserName -cne 'postgres.pdqwsknbzkdtiwjjibqt') {
    throw 'Target refused.'
  }
  $livenessWriteSecret = $livenessWriteCredential.GetNetworkCredential().Password
  $livenessWriteInfo = [Diagnostics.ProcessStartInfo]::new()
  $livenessWriteInfo.UseShellExecute = $false
  $livenessWriteInfo.CreateNoWindow = $true
  $livenessWriteInfo.RedirectStandardInput = $true
  $livenessWriteInfo.RedirectStandardOutput = $true
  $livenessWriteInfo.RedirectStandardError = $true
  $livenessWriteInfo.EnvironmentVariables.Clear()
  $livenessWriteInfo.EnvironmentVariables['SystemRoot'] = $env:SystemRoot
  $livenessWriteInfo.EnvironmentVariables['TEMP'] = (Join-Path $livenessWriteRoot '.tmp')
  $livenessWriteInfo.EnvironmentVariables['TMP'] = (Join-Path $livenessWriteRoot '.tmp')

  if ($Action -ceq 'Deploy') {
    $livenessWriteUser = [Uri]::EscapeDataString($livenessWriteCredential.UserName)
    $livenessWritePassword = [Uri]::EscapeDataString($livenessWriteSecret)
    $livenessWriteUrl = 'postgresql://{0}:{1}@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres?sslmode=require&connection_limit=1' -f $livenessWriteUser,$livenessWritePassword
    $livenessWriteInfo.EnvironmentVariables['PATHWAYS_SESSION_LIVENESS_URL'] = $livenessWriteUrl
    # Prisma 6 validates schema env() references before applying config overrides.
    $livenessWriteInfo.EnvironmentVariables['DATABASE_URL'] = $livenessWriteUrl
    $livenessWriteInfo.EnvironmentVariables['DIRECT_URL'] = $livenessWriteUrl
    $livenessWriteInfo.EnvironmentVariables['PATHWAYS_SESSION_LIVENESS_STAGE'] = $livenessWriteResolvedStage
    $livenessWriteInfo.FileName = 'C:\nvm4w\nodejs\node.exe'
    $livenessWritePrisma = Join-Path $livenessWriteRoot 'apps\api\node_modules\prisma\build\index.js'
    $livenessWriteConfig = Join-Path $PSScriptRoot 'prisma.deploy.config.ts'
    $livenessWriteInfo.Arguments = ('"{0}" migrate deploy --config "{1}"' -f $livenessWritePrisma,$livenessWriteConfig)
    $livenessWriteInput = ''
  } else {
    $livenessWriteInfo.EnvironmentVariables['PGPASSWORD'] = $livenessWriteSecret
    $livenessWriteInfo.EnvironmentVariables['PGSSLMODE'] = 'require'
    $livenessWriteInfo.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '15'
    $livenessWriteInfo.FileName = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
    $livenessWriteInfo.Arguments = '-X -w -q -A -t -h aws-1-ap-southeast-2.pooler.supabase.com -p 5432 -U postgres.pdqwsknbzkdtiwjjibqt -d postgres -v ON_ERROR_STOP=1'
    $livenessWriteInput = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'rollback.sql'))
  }

  $livenessWriteProcess = [Diagnostics.Process]::Start($livenessWriteInfo)
  $livenessWriteLaunched = $true
  foreach ($livenessWriteSecretKey in @('PATHWAYS_SESSION_LIVENESS_URL','DATABASE_URL','DIRECT_URL','PGPASSWORD')) {
    $livenessWriteInfo.EnvironmentVariables.Remove($livenessWriteSecretKey)
    $livenessWriteProcess.StartInfo.EnvironmentVariables.Remove($livenessWriteSecretKey)
  }
  $livenessWriteSecret = $null
  $livenessWritePassword = $null
  $livenessWriteUrl = $null
  $livenessWriteCredential = $null
  $livenessWriteOutput = $livenessWriteProcess.StandardOutput.ReadToEndAsync()
  $livenessWriteError = $livenessWriteProcess.StandardError.ReadToEndAsync()
  $livenessWriteProcess.StandardInput.Write($livenessWriteInput)
  $livenessWriteProcess.StandardInput.Close()

  if (-not $livenessWriteProcess.WaitForExit(150000)) {
    Write-Output ('{{"status":"UNCERTAIN","action":"{0}","outcome":"CHILD_TIMEOUT","processId":{1}}}' -f $Action,$livenessWriteProcess.Id)
    $livenessWriteExit = 2
  } elseif ($livenessWriteProcess.ExitCode -eq 0) {
    Write-Output ('{{"status":"PASS","action":"{0}","outcome":"CHILD_EXIT_ZERO"}}' -f $Action)
    $livenessWriteExit = 0
  } else {
    Write-Output ('{{"status":"UNCERTAIN","action":"{0}","outcome":"CHILD_NONZERO_EXIT","childExitCode":{1}}}' -f $Action,$livenessWriteProcess.ExitCode)
    $livenessWriteExit = 2
  }
} catch {
  if ($livenessWriteLaunched) {
    Write-Output ('{{"status":"UNCERTAIN","action":"{0}","outcome":"WRITER_EXCEPTION_AFTER_LAUNCH"}}' -f $Action)
    $livenessWriteExit = 2
  } else {
    Write-Output ('{{"status":"FAILED","action":"{0}","outcome":"GUARD_REJECTED","stage":"guard"}}' -f $Action)
    $livenessWriteExit = 1
  }
} finally {
  $livenessWriteSecret = $null
  $livenessWritePassword = $null
  $livenessWriteUrl = $null
  $livenessWriteCredential = $null
  if ($null -ne $livenessWriteProcess -and $livenessWriteProcess.HasExited) {
    $livenessWriteProcess.Dispose()
  }
}

exit $livenessWriteExit
