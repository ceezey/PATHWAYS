# Current protected PATHWAYS-dev application capture for P07-W10 only.
# No hosted writes, Auth data, Storage data or object bytes.
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$Authorization
)

$ErrorActionPreference = 'Stop'
$backupExit = 1
$backupStage = 'authorization'
$backupProcess = $null
$backupDirectory = $null
$backupArchive = $null
$backupEvidence = $null
$backupIdentifier = $null
$backupToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../migration-reconciliation')).Path

function Set-BackupProtectedAcl([string]$LiteralPath, [bool]$IsDirectory) {
  $backupCurrentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $backupSystemSid = [Security.Principal.SecurityIdentifier]::new(
    [Security.Principal.WellKnownSidType]::LocalSystemSid,
    $null
  )
  if ($IsDirectory) {
    $backupSecurity = [Security.AccessControl.DirectorySecurity]::new()
    $backupInheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
  } else {
    $backupSecurity = [Security.AccessControl.FileSecurity]::new()
    $backupInheritance = [Security.AccessControl.InheritanceFlags]::None
  }
  $backupSecurity.SetAccessRuleProtection($true, $false)
  foreach ($backupSid in @($backupCurrentSid, $backupSystemSid)) {
    $backupRule = [Security.AccessControl.FileSystemAccessRule]::new(
      $backupSid,
      [Security.AccessControl.FileSystemRights]::FullControl,
      $backupInheritance,
      [Security.AccessControl.PropagationFlags]::None,
      [Security.AccessControl.AccessControlType]::Allow
    )
    [void]$backupSecurity.AddAccessRule($backupRule)
  }
  Set-Acl -LiteralPath $LiteralPath -AclObject $backupSecurity
}

function Invoke-BackupProcess(
  [string]$FileName,
  [string[]]$Arguments,
  [AllowNull()][string]$StandardInput,
  [int]$TimeoutMilliseconds
) {
  $backupInfo = [Diagnostics.ProcessStartInfo]::new()
  $backupInfo.UseShellExecute = $false
  $backupInfo.CreateNoWindow = $true
  $backupInfo.RedirectStandardInput = $true
  $backupInfo.RedirectStandardOutput = $true
  $backupInfo.RedirectStandardError = $true
  $backupInfo.EnvironmentVariables.Clear()
  $backupInfo.EnvironmentVariables['SystemRoot'] = $env:SystemRoot
  $backupInfo.EnvironmentVariables['PGPASSWORD'] = $script:backupCredential.GetNetworkCredential().Password
  $backupInfo.EnvironmentVariables['PGSSLMODE'] = 'require'
  $backupInfo.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '15'
  $backupInfo.EnvironmentVariables['PGOPTIONS'] = '-c default_transaction_read_only=on -c statement_timeout=180000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=190000'
  $backupInfo.FileName = $FileName
  $backupInfo.Arguments = [string]::Join(' ', $Arguments)
  $script:backupProcess = [Diagnostics.Process]::Start($backupInfo)
  $backupInfo.EnvironmentVariables.Remove('PGPASSWORD')
  $script:backupProcess.StartInfo.EnvironmentVariables.Remove('PGPASSWORD')
  $backupOutputTask = $script:backupProcess.StandardOutput.ReadToEndAsync()
  $backupErrorTask = $script:backupProcess.StandardError.ReadToEndAsync()
  if ($null -ne $StandardInput) {
    $script:backupProcess.StandardInput.Write($StandardInput)
  }
  $script:backupProcess.StandardInput.Close()
  if (-not $script:backupProcess.WaitForExit($TimeoutMilliseconds)) {
    # Every child is constrained to read-only hosted work or local archive
    # validation. Terminate only this exact child on timeout.
    $script:backupProcess.Kill()
    throw 'Protected backup child timed out.'
  }
  if ($script:backupProcess.ExitCode -ne 0) {
    throw 'Protected backup child failed.'
  }
  $backupOutput = $backupOutputTask.Result
  [void]$backupErrorTask.Result
  $script:backupProcess.Dispose()
  $script:backupProcess = $null
  return $backupOutput.Trim()
}

function Get-BackupCatalogSnapshot {
  $backupSql = "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;`n"
  $backupSql += "SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='3s'; SET LOCAL idle_in_transaction_session_timeout='35s'; SET LOCAL search_path=pg_catalog;`n"
  $backupSql += [IO.File]::ReadAllText((Join-Path $backupToolRoot 'inventory.sql'))
  $backupSql += "`nROLLBACK;"
  $backupOutput = Invoke-BackupProcess $script:backupPsql $script:backupPsqlArguments $backupSql 50000
  $backupSnapshot = $backupOutput | ConvertFrom-Json
  if (-not $backupSnapshot.readOnly -or $backupSnapshot.database -cne 'postgres' -or
      $backupSnapshot.user -cne 'postgres' -or $backupSnapshot.sessionUser -cne 'postgres' -or
      -not $backupSnapshot.pgcryptoPresent -or $backupSnapshot.ledger.Count -ne 20 -or
      $backupSnapshot.ledger[19].name -cne '0020_fixed_sensitive_release_policy' -or
      $backupSnapshot.ledger[19].checksum -cne 'd9c301f26d42fa9b52a5591c43584a900f1b7d0293726616a4bed9a74745f10c' -or
      @($backupSnapshot.ledger | Where-Object { -not $_.finished -or $_.rolledBack -or $_.failureLog }).Count -ne 0 -or
      -not $backupSnapshot.runtimeSafe) {
    throw 'Hosted catalog baseline refused.'
  }
  return [pscustomobject]@{ Object = $backupSnapshot; Raw = $backupOutput }
}

function Get-BackupDataSnapshot {
  $backupSql = [IO.File]::ReadAllText((Join-Path $backupToolRoot 'backup-data-inventory.sql'))
  $backupOutput = Invoke-BackupProcess $script:backupPsql $script:backupPsqlArguments $backupSql 150000
  $backupRows = @($backupOutput -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 } |
    ForEach-Object { $_ | ConvertFrom-Json } | Sort-Object -Property key)
  if ($backupRows.Count -lt 55 -or
      @($backupRows | Where-Object {
        $_.key -notmatch '^(public|pathways)\.[A-Za-z0-9_]+$' -or
        $_.rows -lt 0 -or $_.sha256 -notmatch '^[a-f0-9]{64}$'
      }).Count -ne 0) {
    throw 'Hosted data inventory refused.'
  }
  return $backupRows
}

function ConvertTo-BackupJson([object]$Value, [int]$Depth = 100) {
  return ConvertTo-Json -InputObject $Value -Depth $Depth -Compress
}

try {
  if ($args.Count -ne 0 -or
      $Authorization -cne 'PATHWAYS_DEV_W10_CURRENT_APPLICATION_BACKUP_ONLY') {
    throw 'Backup authorization refused.'
  }

  $backupStage = 'credential'
  $backupCredentialPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'PATHWAYS/secrets/dev-db-admin.credential.xml'
  $backupCredential = Import-Clixml -LiteralPath $backupCredentialPath
  if ($backupCredential -isnot [System.Management.Automation.PSCredential] -or
      $backupCredential.UserName -cne 'postgres.pdqwsknbzkdtiwjjibqt') {
    throw 'Backup target refused.'
  }

  $backupBin = 'C:\Program Files\PostgreSQL\18\bin'
  $backupPsql = Join-Path $backupBin 'psql.exe'
  $backupDump = Join-Path $backupBin 'pg_dump.exe'
  $backupRestore = Join-Path $backupBin 'pg_restore.exe'
  $backupPsqlArguments = @(
    '-X', '-w', '-q', '-A', '-t',
    '-h', 'aws-1-ap-southeast-2.pooler.supabase.com',
    '-p', '5432', '-U', 'postgres.pdqwsknbzkdtiwjjibqt',
    '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'
  )

  $backupStage = 'protected-directory'
  $backupRoot = 'C:\PATHWAYS-backups'
  if (-not (Test-Path -LiteralPath $backupRoot -PathType Container)) {
    New-Item -ItemType Directory -Path $backupRoot | Out-Null
  }
  $backupIdentifier = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
  $backupDirectory = Join-Path $backupRoot ("PATHWAYS-dev-pre-P07-W10-$backupIdentifier")
  New-Item -ItemType Directory -Path $backupDirectory | Out-Null
  Set-BackupProtectedAcl $backupDirectory $true
  $backupArchive = Join-Path $backupDirectory 'application.dump'
  $backupEvidence = Join-Path $backupDirectory 'evidence.json'

  $backupStage = 'hosted-preflight'
  $backupCatalogBefore = Get-BackupCatalogSnapshot
  $backupDataBefore = Get-BackupDataSnapshot

  $backupStage = 'custom-backup'
  [void](Invoke-BackupProcess $backupDump @(
    '-Fc', '-Z6', '--serializable-deferrable', '--no-password',
    '-h', 'aws-1-ap-southeast-2.pooler.supabase.com',
    '-p', '5432', '-U', 'postgres.pdqwsknbzkdtiwjjibqt', '-d', 'postgres',
    '--schema=public', '--schema=pathways', "--file=$backupArchive"
  ) $null 240000)
  if (-not (Test-Path -LiteralPath $backupArchive -PathType Leaf) -or
      (Get-Item -LiteralPath $backupArchive).Length -le 0) {
    throw 'Backup archive missing.'
  }
  Set-BackupProtectedAcl $backupArchive $false
  $backupCompletedUtc = [DateTime]::UtcNow.ToString('o')
  $backupArchiveSha256 = (Get-FileHash -LiteralPath $backupArchive -Algorithm SHA256).Hash.ToLowerInvariant()

  $backupStage = 'archive-validation'
  $backupArchiveList = Invoke-BackupProcess $backupRestore @('--list', $backupArchive) $null 60000
  $backupTableDataEntries = @($backupArchiveList -split "`r?`n" |
    Where-Object { $_ -match ' TABLE DATA (public|pathways) ' })
  if ($backupTableDataEntries.Count -ne $backupDataBefore.Count -or
      $backupArchiveList -match ' TABLE DATA (auth|storage) ') {
    throw 'Backup archive scope refused.'
  }
  foreach ($backupRequiredTable in @(
    'public _prisma_migrations', 'pathways organizations', 'pathways system_users',
    'pathways projects', 'pathways project_activities', 'pathways audit_logs',
    'pathways data_import_batches', 'pathways data_import_rows',
    'pathways metadata_mappings', 'pathways form_submissions',
    'pathways form_response_values', 'pathways sensitive_aggregate_releases'
  )) {
    if (@($backupTableDataEntries | Where-Object { $_ -match " TABLE DATA $backupRequiredTable " }).Count -ne 1) {
      throw "Required W10 application table missing: $backupRequiredTable"
    }
  }

  $backupStage = 'hosted-postflight'
  $backupCatalogAfter = Get-BackupCatalogSnapshot
  $backupDataAfter = Get-BackupDataSnapshot
  if ($backupCatalogBefore.Raw -cne $backupCatalogAfter.Raw -or
      (ConvertTo-BackupJson $backupDataBefore) -cne (ConvertTo-BackupJson $backupDataAfter)) {
    throw 'Concurrent hosted drift detected.'
  }

  $backupStage = 'evidence'
  $backupPrivateEvidence = [ordered]@{
    version = 1
    target = 'PATHWAYS-dev'
    projectRef = 'pdqwsknbzkdtiwjjibqt'
    hostedWrites = 0
    backupCompletedUtc = $backupCompletedUtc
    archiveSha256 = $backupArchiveSha256
    archiveBytes = (Get-Item -LiteralPath $backupArchive).Length
    archiveListSha256 = ([Security.Cryptography.SHA256]::Create().ComputeHash(
      [Text.Encoding]::UTF8.GetBytes($backupArchiveList)
    ) | ForEach-Object { $_.ToString('x2') }) -join ''
    tableDataEntries = $backupTableDataEntries.Count
    sourceVersion = $backupCatalogBefore.Object.serverVersion
    migrationCount = $backupCatalogBefore.Object.ledger.Count
    latestMigration = $backupCatalogBefore.Object.ledger[19].name
    affectedTables = @('pathways.organizations','pathways.system_users','pathways.projects','pathways.project_activities','pathways.audit_logs','pathways.data_import_batches','pathways.data_import_rows','pathways.metadata_mappings','pathways.form_submissions','pathways.form_response_values','pathways.sensitive_aggregate_releases','public._prisma_migrations')
    catalogBefore = $backupCatalogBefore.Object
    catalogAfter = $backupCatalogAfter.Object
    dataBefore = $backupDataBefore
    dataAfter = $backupDataAfter
    restore = $null
  }
  $backupUtf8 = [Text.UTF8Encoding]::new($false)
  [IO.File]::WriteAllText($backupEvidence, (ConvertTo-BackupJson $backupPrivateEvidence), $backupUtf8)
  Set-BackupProtectedAcl $backupEvidence $false

  Write-Output (ConvertTo-BackupJson ([ordered]@{
    status = 'PASS'
    action = 'backup'
    backupId = $backupIdentifier
    backupUtc = $backupCompletedUtc
    archiveSha256Recorded = $true
    archiveValidated = $true
    hostedWrites = 0
    archive = $backupArchive
    evidence = $backupEvidence
  }))
  $backupExit = 0
} catch {
  if ($null -ne $backupDirectory -and (Test-Path -LiteralPath $backupDirectory -PathType Container)) {
    $backupFailureEvidence = Join-Path $backupDirectory 'failure.json'
    $backupFailureJson = ConvertTo-BackupJson ([ordered]@{
      status = 'FAILED'
      action = 'backup'
      stage = $backupStage
      hostedWrites = 0
      backupId = $backupIdentifier
    })
    [IO.File]::WriteAllText($backupFailureEvidence, $backupFailureJson, [Text.UTF8Encoding]::new($false))
    Set-BackupProtectedAcl $backupFailureEvidence $false
  }
  Write-Output (ConvertTo-BackupJson ([ordered]@{
    status = 'FAILED'
    action = 'backup'
    stage = $backupStage
    hostedWrites = 0
    backupId = $backupIdentifier
  }))
} finally {
  $backupCredential = $null
  if ($null -ne $backupProcess) { $backupProcess.Dispose() }
}

exit $backupExit
