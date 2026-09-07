# One-shot recovery of the reviewed post-0005, unprovisioned state only.
# Never invokes migration deployment/resolution or changes an applied migration.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('SUPABASE_SECURITY_ADAPTER_0005_ONLY')][string]$Authorization,
  [switch]$PreflightOnly
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Recovery-Common.ps1')
$recoveryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$recoveryTag = 'p4r_' + [guid]::NewGuid().ToString('N')
$recoveryKnownSessions = @()
$recoveryAttempted = $false
$recoveryUnknown = $false
$recoveryConfirmedFailure = $false
$recoveryPassed = $false
$recoveryStage = 'READ_ONLY_PREFLIGHT'
$recoveryBefore = $null
$recoveryProtected = @{}

function Get-RecoveryFingerprint($Value) {
  $recoveryHash = [Security.Cryptography.SHA256]::Create()
  try {
    return [BitConverter]::ToString($recoveryHash.ComputeHash([Text.Encoding]::UTF8.GetBytes(
      (ConvertTo-Json -InputObject $Value -Depth 100 -Compress)))).Replace('-','')
  } finally { $recoveryHash.Dispose() }
}

function Assert-RecoveryBaseline($Evidence,$RoleState) {
  # Captured read-only after the failed provisioning attempt and independently
  # reconciled with that report. These are catalog fingerprints, not secrets.
  $recoveryExpected = @{
    ledger_locations='D1E09EB79FD9DF54DE82A4898E74886FA871F862587A3E5073DE24ECB523FE38'
    ledger='65EEC29C39A6B6F8D06D4BB8BCC0792BF11AA74949B9AD0D3B2DFFE9BA3E2CE7'
    tables='1302455F6413CE3733215F3B8517EF6D813CCC2214B29FF4CADB229188493650'
    schemas='21479076E3D3B3E69E5C0C58CB1796677A3C62BE6E45F175D8DF41611DDFC083'
    auth='7F71236E29BDB984CF16CF8411D61806F27F6A2BC16214FFE326469E968B921E'
    storage='DB655DC5484A7B3F5B5FB217ACF3F63CB1EB10BC3FB2E4EAFF7949EFCA471D38'
    event_triggers='3FF6EB76AC11CC08CEC3E0AE4E84CB299B44EE458B91977AAE04AF77799A7B81'
    pathways_functions='84A47901DDD53A3516D9B2520BC0383AB3BDBA2C99164AB18384E10393DC7AB7'
    pathways_enums='EA68895A0C94CCF71C83FF557A42304687D8A52AB9C982FEB177D37F6EAD6DF8'
    default_acl='6C5D55722ECBB4925EBBB7BC1EA481325B2C2017CBA12D89161E30BEDAC0D4C0'
    memberships='FBFE3F2D58379B2DACB06491CC89C1F36EAC92C2AC9776B3D9EDCE1CD804D4B8'
    actual_tables='2406FB0DBA746FFA032B106CF9720642E24A2A9E87044A37D9656BE22736CD4B'
    auth_foreign_keys='812CC1C0E0FDA072011B5CAC6E54E53D0A8DB1148527578617EB366710E41097'
    roles='8BEE53F57928D112DD77F0EE9531E43ED38F9F6B1B83991AB1A09E019D9500D1'
    database_acl='2C90189A3ADF5F77C8524E34F7F32DFA9B2A1DA931D779BDAF8703ABD1137C0D'
  }
  foreach ($recoveryKey in $recoveryExpected.Keys) {
    Assert-Recovery ((Get-RecoveryFingerprint $Evidence.$recoveryKey) -ceq $recoveryExpected[$recoveryKey]) ('Reviewed baseline: ' + $recoveryKey)
  }
  Assert-Recovery ($RoleState.admin_can_signal_runtime -and $RoleState.runtime_exists -and -not $RoleState.runtime_login -and
    $RoleState.password_absent -and $RoleState.role_settings_absent -and
    @($RoleState.runtime_sessions).Count -eq 0 -and $Evidence.runtime_owned_object_count -eq 0) 'Unprovisioned runtime without sessions, settings or ownership'
}

function Assert-RecoveryTemp($Before,$After,[switch]$Restored) {
  $recoveryAllowlist = @('prisma','authenticator','supabase_auth_admin','supabase_storage_admin',
    'supabase_etl_admin','supabase_read_only_user','supabase_realtime_admin',
    'supabase_replication_admin','supabase_privileged_role')
  $recoveryExpectedAcl = @()
  foreach ($recoveryEntry in $Before.database_acl) {
    if ($Restored -or -not ($recoveryEntry[0] -ceq 'PUBLIC' -and $recoveryEntry[2] -ceq 'TEMPORARY')) {
      $recoveryExpectedAcl += ,$recoveryEntry
    }
  }
  if (-not $Restored) {
    foreach ($recoveryName in $recoveryAllowlist) { $recoveryExpectedAcl += ,@($recoveryName,'postgres','TEMPORARY',$false) }
  }
  $recoveryExpectedLines = @($recoveryExpectedAcl | ForEach-Object { ConvertTo-Json -InputObject $_ -Compress } | Sort-Object)
  $recoveryActualLines = @($After.database_acl | ForEach-Object { ConvertTo-Json -InputObject $_ -Compress } | Sort-Object)
  Assert-Recovery (($recoveryExpectedLines -join "`n") -ceq ($recoveryActualLines -join "`n")) 'Exact database ACL including preserved CONNECT and grantors'
  foreach ($recoveryOldRole in $Before.roles) {
    $recoveryNewRole = $After.roles | Where-Object name -CEQ $recoveryOldRole.name
    Assert-Recovery ($recoveryNewRole.database_connect -eq $recoveryOldRole.database_connect -and
      $recoveryNewRole.database_create -eq $recoveryOldRole.database_create) 'Unrelated effective database privileges preserved'
    if ($Restored) {
      Assert-Recovery ($recoveryNewRole.database_temporary -eq $recoveryOldRole.database_temporary) 'Original effective TEMP restored'
    } elseif ($recoveryOldRole.name -cin ($recoveryAllowlist + @('postgres','dashboard_user'))) {
      Assert-Recovery $recoveryNewRole.database_temporary ('Allowlisted TEMP: ' + $recoveryOldRole.name)
    } elseif ($recoveryOldRole.name -cin @('pathways_runtime','anon','authenticated','service_role')) {
      Assert-Recovery (-not $recoveryNewRole.database_temporary) ('Denied TEMP: ' + $recoveryOldRole.name)
    }
  }
}

function Invoke-RecoveryCheckedAdmin([string]$Action) {
  $recoveryResult = Invoke-RecoveryAdmin -Action $Action -KnownSessions $script:recoveryKnownSessions -RecoveryTag $script:recoveryTag -ConfirmedFailure:($Action -ceq 'Contain' -and $script:recoveryConfirmedFailure -and -not $script:recoveryUnknown)
  if ($recoveryResult.Unknown) {
    $script:recoveryUnknown = $true
    Write-Output ('OUTCOME_UNKNOWN; ACTION=' + $Action + '; PID=' + $recoveryResult.Pid)
    throw 'Unknown outcome'
  }
  Write-Output ('ADMIN_ACTION=' + $Action + '; EXIT=' + $recoveryResult.ExitCode + '; CODES=' + ($recoveryResult.Codes -join ','))
  Assert-Recovery ($recoveryResult.ExitCode -eq 0) ('Terminal administrator action: ' + $Action)
}

function Test-RecoveryServices {
  & node (Join-Path $PSScriptRoot 'service-smoke.mjs')
  Assert-Recovery ($LASTEXITCODE -eq 0) 'Read-only Auth/Storage/disabled Data API baseline'
}

function Assert-RecoveryFiles {
  foreach ($recoveryFile in $script:recoveryProtected.Keys) {
    Assert-Recovery ((Get-FileHash -LiteralPath (Join-Path $script:recoveryRoot $recoveryFile) -Algorithm SHA256).Hash -ceq
      $script:recoveryProtected[$recoveryFile]) ('Protected file unchanged: ' + $recoveryFile)
  }
}

try {
  Set-Location -LiteralPath $recoveryRoot
  $recoveryMigrationHashes = [ordered]@{
    '0001_init'='8B4E25D97B493E6042287373BDA015DB8E1F1E6A1DAF0E49B142484762E248AB'
    '0002_pathways_foundation'='A0B6964541B4AEA56CB8529DF93597F182E4E7C8BAF0F53BBDF3F6F7FF9EA9B2'
    '0003_pathways_projects_collection'='6388784BCE9058736E9B79B6B3E39A0A214255AA8080D810DC99B3B76805194B'
    '0004_pathways_finance_evaluation_decisions'='8C94BDE1E4F402610A57BE39BAE5C07977C5C6AEAC4E2A96638DA1396C66F08B'
    '0005_supabase_security_adapter'='6E942CFD46833375F5E0D4BBF4F66B84F28A90FC614472974FC309CF98610BDC'
  }
  foreach ($recoveryName in $recoveryMigrationHashes.Keys) {
    $recoveryProtected['apps/api/prisma/migrations/' + $recoveryName + '/migration.sql'] = $recoveryMigrationHashes[$recoveryName]
  }
  $recoveryProtected['apps/api/prisma/schema.prisma']='C44860C59A1F70C01147A84E9592D52A86F7CEA22DDACB903A59024AFEDA18F8'
  $recoveryProtected['infra/supabase/security-adapter/apply-temp-privileges.sql']='7EF5A6E4361D4B71FDAF1E281197DE54E0AAEA4E99401D561BDCD064DE32CA3F'
  $recoveryProtected['infra/supabase/security-adapter/restore-temp-privileges.sql']='8BAC9A3838C38A42305548B1F3B20E88A2DB821C3F3AED4DF807EB84AAFE9461'
  foreach ($recoveryFile in @('.env','apps/api/.env','docs/PHASE_TODO.md')) {
    $recoveryProtected[$recoveryFile]=(Get-FileHash -LiteralPath (Join-Path $recoveryRoot $recoveryFile) -Algorithm SHA256).Hash
  }
  Assert-RecoveryFiles
  Assert-Recovery (@(Get-ChildItem -LiteralPath 'apps/api/prisma/migrations' -Directory).Count -eq 5) 'Only the existing five migrations'
  $recoveryTodo = [IO.File]::ReadAllText((Join-Path $recoveryRoot 'docs/PHASE_TODO.md'))
  $recoveryPhase3 = [regex]::Match($recoveryTodo,'(?s)## Phase 3 -.*?(?=## Phase 4 -)').Value
  $recoveryPhase4 = [regex]::Match($recoveryTodo,'(?s)## Phase 4 -.*?(?=## Phase 5 -)').Value
  Assert-Recovery ($recoveryPhase3.Contains('- [x] Phase result is `PASS`.') -and
    -not $recoveryPhase3.Contains('- [ ]') -and $recoveryPhase4.Contains('- [ ] Phase result is `PASS`.') -and
    -not $recoveryPhase4.Contains('- [x]')) 'Phase 3 passed; Phase 4 still unchecked'
  Assert-Recovery (-not (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'PATHWAYS/secrets/dev-db-runtime.credential.xml'))) 'Runtime encrypted credential absent'
  Assert-Recovery ((Get-FileHash -LiteralPath 'C:\PATHWAYS-backups\PATHWAYS-dev-post-ledger-phase0c-20260904-161649.dump' -Algorithm SHA256).Hash -ceq
    'BC98DF2AD597F83AFB498DCC4D2AFC1827132D933B75615B761EBBC95992A1B9') 'Phase 0C backup and recorded hash'
  $recoveryBefore = Read-RecoveryEvidence -Action Inventory
  Assert-RecoveryBaseline $recoveryBefore (Read-RecoveryEvidence -Action RoleState)
  Test-RecoveryServices
  & node (Join-Path $PSScriptRoot 'migration-connection-check.mjs') Status
  Assert-Recovery ($LASTEXITCODE -eq 0) 'Actual migration identity, TEMP baseline and current history'
  if ($PreflightOnly) { Write-Output 'RECOVERY_PREFLIGHT=PASS; NO_PERSISTENT_MUTATION'; exit 0 }
  # Re-read immediately before mutation; no stale snapshot is used as a gate.
  Assert-RecoveryBaseline (Read-RecoveryEvidence -Action Inventory) (Read-RecoveryEvidence -Action RoleState)
  Assert-RecoveryFiles
  Write-Output 'RECOVERY_PREFLIGHT=PASS; 0005_ALREADY_COMPLETED; NO_MIGRATION_COMMAND_WILL_RUN'
  $recoveryStage='TEMP_RESTRICTION'
  $recoveryAttempted=$true
  Invoke-RecoveryCheckedAdmin 'ApplyTemp'
  $recoveryApplied = Read-RecoveryEvidence -Action Inventory
  Compare-RecoveryPreservation $recoveryBefore $recoveryApplied
  Assert-RecoveryTemp $recoveryBefore $recoveryApplied
  Test-RecoveryServices
  & node (Join-Path $PSScriptRoot 'migration-connection-check.mjs')
  Assert-Recovery ($LASTEXITCODE -eq 0) 'Actual migration TEMP access preserved'
  Invoke-RecoveryCheckedAdmin 'ApiNegative'
  $recoveryStage='FIRST_RUNTIME_PROVISION'
  & (Join-Path $PSScriptRoot 'Provision-DevRuntime.ps1')
  if ($LASTEXITCODE -eq 124) { $recoveryUnknown=$true; throw 'Provision outcome unknown' }
  Assert-Recovery ($LASTEXITCODE -eq 0) 'First runtime provisioning'
  $recoveryStage='TAGGED_RUNTIME_CHECK'
  $recoveryProbeLines = @(& (Join-Path $PSScriptRoot 'Test-RecoveryRuntime.ps1') -RecoveryTag $recoveryTag)
  $recoveryProbeExit = $LASTEXITCODE
  foreach ($recoveryLine in $recoveryProbeLines) {
    Write-Output $recoveryLine
    if ($recoveryLine -is [string] -and $recoveryLine.StartsWith('RECOVERY_BACKEND=')) {
      $recoveryBackend = $recoveryLine.Substring('RECOVERY_BACKEND='.Length) | ConvertFrom-Json
      $recoveryKnownSessions += [pscustomobject]@{pid=$recoveryBackend.pid;backend_start=$recoveryBackend.backend_start;
        database=$recoveryBackend.database;role=$recoveryBackend.session_user;application_name=$recoveryBackend.application_name}
    }
  }
  if ($recoveryProbeExit -eq 124) { $recoveryUnknown=$true; throw 'Runtime probe outcome unknown' }
  Assert-Recovery ($recoveryProbeExit -eq 0 -and $recoveryKnownSessions.Count -gt 0) 'Actual tagged runtime connection and security tests'
  $recoveryStage='FINAL_VERIFICATION'
  & node (Join-Path $PSScriptRoot 'migration-connection-check.mjs') Status
  Assert-Recovery ($LASTEXITCODE -eq 0) 'Migration history remains current'
  Test-RecoveryServices
  $recoveryFinal = Read-RecoveryEvidence -Action Inventory
  Compare-RecoveryPreservation $recoveryBefore $recoveryFinal -AllowProvisioned
  Assert-RecoveryTemp $recoveryBefore $recoveryFinal
  $recoveryFinalRole = Read-RecoveryEvidence -Action RoleState
  Assert-Recovery ($recoveryFinalRole.runtime_login -and -not $recoveryFinalRole.password_absent -and
    $recoveryFinalRole.role_settings_absent) 'Provisioned runtime with unchanged role settings'
  Assert-RecoveryFiles
  $recoveryPassed=$true
  Write-Output 'RECOVERY_SEQUENCE=PASS; ADVISOR_REVIEW_AND_REPOSITORY_ACCEPTANCE_STILL_REQUIRED; TODO_UNCHANGED'
} catch {
  $recoveryMessage = $_.Exception.Message
  $recoveryConfirmedFailure = $recoveryMessage.StartsWith('RECOVERY_ASSERTION: ') -and -not $recoveryUnknown
  if ($recoveryAttempted -and -not $recoveryConfirmedFailure) { $recoveryUnknown=$true }
  if (-not $recoveryMessage.StartsWith('RECOVERY_ASSERTION: ')) { $recoveryMessage='Details withheld; use fixed stage and outcome markers.' }
  Write-Output ('RECOVERY_SEQUENCE=FAILED; STAGE=' + $recoveryStage + '; ' + $recoveryMessage)
  if ($recoveryAttempted -and -not $recoveryUnknown) {
    try {
      $recoveryFailureRole = Read-RecoveryEvidence -Action RoleState
      if ($recoveryFailureRole.runtime_login) {
        Invoke-RecoveryCheckedAdmin 'Contain'
        $recoveryContained = Read-RecoveryEvidence -Action RoleState
        Assert-Recovery (-not $recoveryContained.runtime_login -and @($recoveryContained.runtime_sessions).Count -eq 0 -and
          -not $recoveryContained.password_absent) 'NOLOGIN and no remaining runtime sessions; password preserved'
        Write-Output 'RUNTIME_CONTAINMENT=VERIFIED; PASSWORD_AND_DPAPI_FILE_PRESERVED'
      } else {
        Assert-Recovery (@($recoveryFailureRole.runtime_sessions).Count -eq 0) 'Unprovisioned runtime has no sessions'
      }
      $recoveryFailureInventory = Read-RecoveryEvidence -Action Inventory
      if ((Get-RecoveryFingerprint $recoveryFailureInventory.database_acl) -cne (Get-RecoveryFingerprint $recoveryBefore.database_acl)) {
        Assert-RecoveryTemp $recoveryBefore $recoveryFailureInventory
        Invoke-RecoveryCheckedAdmin 'RestoreTemp'
      }
      $recoveryRestored = Read-RecoveryEvidence -Action Inventory
      Assert-RecoveryTemp $recoveryBefore $recoveryRestored -Restored
      Compare-RecoveryPreservation $recoveryBefore $recoveryRestored
      Test-RecoveryServices
      Write-Output 'EXACT_TEMP_BASELINE_RESTORED=VERIFIED; CONNECT_PRESERVED; HARD_STOP'
    } catch {
      Write-Output 'CRITICAL=CONTAINMENT_OR_RESTORATION_NOT_FULLY_VERIFIED; NO_FURTHER_MUTATION; HARD_STOP'
    }
  } elseif ($recoveryUnknown) {
    Write-Output 'OUTCOME_UNKNOWN; PRESERVE_ALL_EVIDENCE; NO_AUTOMATIC_CONTAINMENT_OR_RESTORE; HARD_STOP'
  } else { Write-Output 'PREFLIGHT_FAILED; NO_LIVE_MUTATION; HARD_STOP' }
}
if ($recoveryPassed) { exit 0 } else { exit 1 }
