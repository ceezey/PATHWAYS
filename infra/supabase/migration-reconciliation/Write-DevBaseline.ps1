# Guarded writer for sequential Prisma baselining of 0002-0005 only.
# Invoke only through baseline-runner.mjs with separate execution authorization.
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet(
    '0002_pathways_foundation',
    '0003_pathways_projects_collection',
    '0004_pathways_finance_evaluation_decisions',
    '0005_supabase_security_adapter'
  )]
  [string]$Migration,
  [Parameter(Mandatory)]
  [ValidateRange(1,4)]
  [int]$ExpectedPrefix,
  [Parameter(Mandatory)]
  [string]$StagePath,
  [Parameter(Mandatory)]
  [string]$Authorization,
  [Parameter(Mandatory)]
  [switch]$BackupRestoreConfirmed,
  [Parameter(Mandatory)]
  [switch]$MaintenanceConfirmed
)

$ErrorActionPreference = 'Stop'
$baselineWriteProcess = $null
$baselineWriteLaunched = $false
$baselineWriteExit = 1

try {
  if ($args.Count -ne 0 -or
      $Authorization -cne 'PATHWAYS_DEV_BASELINE_0002_0005_ONLY' -or
      -not $BackupRestoreConfirmed -or -not $MaintenanceConfirmed) {
    throw 'Baseline authorization refused.'
  }

  $baselineWriteRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
  if ($baselineWriteRoot -cne 'C:\PATHWAYS') { throw 'Repository root refused.' }
  $baselineWriteExpected = @(
    @{ Name = '0001_init'; Hash = '8b4e25d97b493e6042287373bda015db8e1f1e6a1daf0e49b142484762e248ab' },
    @{ Name = '0002_pathways_foundation'; Hash = 'a0b6964541b4aea56cb8529df93597f182e4e7c8baf0f53bbdf3f6f7ff9ea9b2' },
    @{ Name = '0003_pathways_projects_collection'; Hash = '6388784bce9058736e9b79b6b3e39a0a214255aa8080d810dc99b3b76805194b' },
    @{ Name = '0004_pathways_finance_evaluation_decisions'; Hash = '8c94bde1e4f402610a57be39bae5c07977c5c6aeac4e2a96638da1396c66f08b' },
    @{ Name = '0005_supabase_security_adapter'; Hash = '6e942cfd46833375f5e0d4bbf4f66b84f28a90fc614472974fc309cf98610bdc' }
  )
  if ($Migration -cne $baselineWriteExpected[$ExpectedPrefix].Name) {
    throw 'Baseline sequence refused.'
  }

  $baselineWriteResolvedStage = (Resolve-Path -LiteralPath $StagePath).Path
  $baselineWriteStageParent = Split-Path -Parent $baselineWriteResolvedStage
  $baselineWriteTmp = (Resolve-Path -LiteralPath (Join-Path $baselineWriteRoot '.tmp')).Path
  if ((Split-Path -Parent $baselineWriteStageParent) -cne $baselineWriteTmp -or
      (Split-Path -Leaf $baselineWriteStageParent) -cnotmatch '^pathways-baseline-[A-Za-z0-9]+$' -or
      (Split-Path -Leaf $baselineWriteResolvedStage) -cne 'migrations' -or
      (Get-Item -LiteralPath $baselineWriteResolvedStage).LinkType) {
    throw 'Baseline staging path refused.'
  }
  $baselineWriteNames = @(Get-ChildItem -LiteralPath $baselineWriteResolvedStage -Force | Sort-Object Name | ForEach-Object Name)
  $baselineWriteRequiredNames = @($baselineWriteExpected.Name) + @('migration_lock.toml')
  if (($baselineWriteNames -join "`n") -cne ($baselineWriteRequiredNames -join "`n")) {
    throw 'Baseline staging contents refused.'
  }
  foreach ($baselineWriteItem in $baselineWriteExpected) {
    $baselineWriteFolder = Join-Path $baselineWriteResolvedStage $baselineWriteItem.Name
    $baselineWriteSql = Join-Path $baselineWriteFolder 'migration.sql'
    if ((Get-Item -LiteralPath $baselineWriteFolder).LinkType -or
        (Get-Item -LiteralPath $baselineWriteSql).LinkType -or
        ((@(Get-ChildItem -LiteralPath $baselineWriteFolder -Force).Name -join "`n") -cne 'migration.sql') -or
        (Get-FileHash -Algorithm SHA256 -LiteralPath $baselineWriteSql).Hash.ToLowerInvariant() -cne $baselineWriteItem.Hash) {
      throw 'Baseline staging fingerprint refused.'
    }
  }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $baselineWriteResolvedStage 'migration_lock.toml')).Hash.ToLowerInvariant() -cne
      '74a9137885ce73d3ff088d79d658f8066e05e680fb51c0800a290c91c0c01d48') {
    throw 'Baseline lock fingerprint refused.'
  }
  $baselineWriteConfig = Join-Path $PSScriptRoot 'prisma.baseline.config.ts'
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $baselineWriteConfig).Hash.ToLowerInvariant() -cne
      '0d092aa934c0031688fde628cf8591073b2a415ca2669251cf05c99dbbef0336') {
    throw 'Baseline config fingerprint refused.'
  }

  # Defense in depth: the writer independently checks the exact current prefix
  # and the maintenance condition immediately before it launches Prisma.
  $baselineWriteReader = Join-Path $PSScriptRoot 'Read-DevBaseline.ps1'
  $baselineWriteReadOutput = & 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $baselineWriteReader
  if ($LASTEXITCODE -ne 0) { throw 'Baseline protected preflight failed.' }
  $baselineWriteState = ($baselineWriteReadOutput -join "`n") | ConvertFrom-Json
  $baselineWriteLedger = @($baselineWriteState.catalog.ledger)
  if ($baselineWriteLedger.Count -ne $ExpectedPrefix -or
      [int]$baselineWriteState.maintenance.matchingSessions -ne 0 -or
      [int]$baselineWriteState.maintenance.activeOrTransactional -ne 0) {
    throw 'Baseline preflight state refused.'
  }
  for ($baselineWriteIndex = 0; $baselineWriteIndex -lt $ExpectedPrefix; $baselineWriteIndex++) {
    $baselineWriteRow = $baselineWriteLedger[$baselineWriteIndex]
    $baselineWriteExpectedRow = $baselineWriteExpected[$baselineWriteIndex]
    if ($baselineWriteRow.name -cne $baselineWriteExpectedRow.Name -or
        $baselineWriteRow.checksum -cne $baselineWriteExpectedRow.Hash -or
        -not $baselineWriteRow.finished -or $baselineWriteRow.rolledBack -or
        $baselineWriteRow.failureLog) {
      throw 'Baseline ledger prefix refused.'
    }
  }

  $baselineWriteCredentialPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'PATHWAYS/secrets/dev-db-admin.credential.xml'
  $baselineWriteCredential = Import-Clixml -LiteralPath $baselineWriteCredentialPath
  if ($baselineWriteCredential -isnot [System.Management.Automation.PSCredential] -or
      $baselineWriteCredential.UserName -cne 'postgres.pdqwsknbzkdtiwjjibqt') {
    throw 'Target refused.'
  }
  $baselineWritePassword = [Uri]::EscapeDataString($baselineWriteCredential.GetNetworkCredential().Password)
  $baselineWriteUser = [Uri]::EscapeDataString($baselineWriteCredential.UserName)
  $baselineWriteUrl = 'postgresql://{0}:{1}@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres?sslmode=require&connection_limit=1' -f $baselineWriteUser,$baselineWritePassword

  $baselineWriteInfo = [Diagnostics.ProcessStartInfo]::new()
  $baselineWriteInfo.UseShellExecute = $false
  $baselineWriteInfo.CreateNoWindow = $true
  $baselineWriteInfo.RedirectStandardOutput = $true
  $baselineWriteInfo.RedirectStandardError = $true
  $baselineWriteInfo.EnvironmentVariables.Clear()
  $baselineWriteInfo.EnvironmentVariables['SystemRoot'] = $env:SystemRoot
  $baselineWriteInfo.EnvironmentVariables['TEMP'] = (Join-Path $baselineWriteRoot '.tmp')
  $baselineWriteInfo.EnvironmentVariables['TMP'] = (Join-Path $baselineWriteRoot '.tmp')
  $baselineWriteInfo.EnvironmentVariables['DATABASE_URL'] = $baselineWriteUrl
  $baselineWriteInfo.EnvironmentVariables['DIRECT_URL'] = $baselineWriteUrl
  $baselineWriteInfo.EnvironmentVariables['PATHWAYS_BASELINE_URL'] = $baselineWriteUrl
  $baselineWriteInfo.EnvironmentVariables['PATHWAYS_BASELINE_MODE'] = 'hosted'
  $baselineWriteInfo.EnvironmentVariables['PATHWAYS_BASELINE_STAGE'] = $baselineWriteResolvedStage
  $baselineWriteInfo.FileName = 'C:\nvm4w\nodejs\node.exe'
  $baselineWritePrisma = Join-Path $baselineWriteRoot 'apps\api\node_modules\prisma\build\index.js'
  $baselineWriteInfo.Arguments = ('"{0}" migrate resolve --applied {1} --config "{2}"' -f $baselineWritePrisma,$Migration,$baselineWriteConfig)

  $baselineWriteProcess = [Diagnostics.Process]::Start($baselineWriteInfo)
  $baselineWriteLaunched = $true
  foreach ($baselineWriteSecretKey in @('DATABASE_URL','DIRECT_URL','PATHWAYS_BASELINE_URL')) {
    $baselineWriteInfo.EnvironmentVariables.Remove($baselineWriteSecretKey)
    $baselineWriteProcess.StartInfo.EnvironmentVariables.Remove($baselineWriteSecretKey)
  }
  $baselineWritePassword = $null
  $baselineWriteUrl = $null
  $baselineWriteCredential = $null
  $baselineWriteOutput = $baselineWriteProcess.StandardOutput.ReadToEndAsync()
  $baselineWriteError = $baselineWriteProcess.StandardError.ReadToEndAsync()

  if (-not $baselineWriteProcess.WaitForExit(120000)) {
    Write-Output ('{{"status":"UNCERTAIN","migration":"{0}","processId":{1}}}' -f $Migration,$baselineWriteProcess.Id)
    $baselineWriteExit = 2
  } elseif ($baselineWriteProcess.ExitCode -eq 0) {
    Write-Output ('{{"status":"PASS","migration":"{0}"}}' -f $Migration)
    $baselineWriteExit = 0
  } else {
    # Once Prisma was launched, a nonzero exit is still uncertain until the
    # protected ledger and physical state have been independently re-read.
    Write-Output ('{{"status":"UNCERTAIN","migration":"{0}"}}' -f $Migration)
    $baselineWriteExit = 2
  }
} catch {
  if ($baselineWriteLaunched) {
    Write-Output ('{{"status":"UNCERTAIN","migration":"{0}"}}' -f $Migration)
    $baselineWriteExit = 2
  } else {
    Write-Output ('{{"status":"FAILED","migration":"{0}","stage":"guard"}}' -f $Migration)
    $baselineWriteExit = 1
  }
} finally {
  $baselineWritePassword = $null
  $baselineWriteUrl = $null
  $baselineWriteCredential = $null
  if ($null -ne $baselineWriteProcess -and $baselineWriteProcess.HasExited) {
    $baselineWriteProcess.Dispose()
  }
}

exit $baselineWriteExit
