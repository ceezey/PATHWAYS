# Single authorized Phase 4 sequence. Exact TEMP reversal on confirmed regression.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('SUPABASE_SECURITY_ADAPTER_0005_ONLY')][string]$Authorization,
  [switch]$PreflightOnly
)
$ErrorActionPreference = 'Stop'
$phase4TempApplied = $false
$phase4TempAttempted = $false
$phase4Passed = $false
$phase4OutcomeUnknown = $false
$phase4Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$phase4Before = $null

function Assert-Phase4([bool]$Condition, [string]$Label) {
  if (-not $Condition) { throw ('Phase 4 assertion failed: ' + $Label) }
}
function Get-Phase4Inventory {
  $phase4Lines = @(& (Join-Path $PSScriptRoot 'Invoke-DevAdmin.ps1') -Action Inventory)
  if ($LASTEXITCODE -ne 0) {
    foreach ($phase4Line in $phase4Lines) {
      if ($phase4Line -is [string] -and $phase4Line.StartsWith('ADMIN_ACTION_FAILED=')) {
        Write-Host $phase4Line
      }
    }
  }
  Assert-Phase4 ($LASTEXITCODE -eq 0) 'Read-only inventory connection'
  $phase4Json = $phase4Lines | Where-Object { $_ -is [string] -and $_.StartsWith('{') }
  Assert-Phase4 (@($phase4Json).Count -eq 1) 'Single inventory result'
  $phase4Value = $phase4Json | ConvertFrom-Json
  Assert-Phase4 ($phase4Value.connection.database -ceq 'postgres' -and
    $phase4Value.connection.current_user -ceq 'postgres' -and
    $phase4Value.connection.session_user -ceq 'postgres' -and
    $phase4Value.connection.transaction_read_only -ceq 'on') 'Approved read-only administrator session'
  return $phase4Value
}
function Test-Phase4Services {
  & node (Join-Path $PSScriptRoot 'service-smoke.mjs')
  Assert-Phase4 ($LASTEXITCODE -eq 0) 'Auth/Storage/Data API service smoke'
}
function Compare-Phase4Preserved($Before, $After) {
  Assert-Phase4 ($After.auth.users_md5 -ceq $Before.auth.users_md5 -and
    $After.auth.identities_md5 -ceq $Before.auth.identities_md5) 'Preserved Auth identities'
  Assert-Phase4 ($After.storage.buckets_md5 -ceq $Before.storage.buckets_md5 -and
    $After.storage.objects_md5 -ceq $Before.storage.objects_md5) 'Preserved private Storage'
  Assert-Phase4 ($After.managed_event_triggers_md5 -ceq $Before.managed_event_triggers_md5) 'Managed event triggers unchanged'
  Assert-Phase4 ($After.legacy_structure_md5 -ceq $Before.legacy_structure_md5) 'Legacy structure unchanged'
  Assert-Phase4 (@($After.tables).Count -eq 54 -and @($After.tables | Where-Object { -not $_.present -or $_.row_count -ne 0 -or $_.owner -cne 'prisma' }).Count -eq 0) 'All 54 tables present, empty and prisma-owned'
  foreach ($phase4Table in $Before.tables) {
    $phase4AfterTable = $After.tables | Where-Object { $_.schema -ceq $phase4Table.schema -and $_.table -ceq $phase4Table.table }
    if ($phase4Table.group -ceq 'legacy') {
      Assert-Phase4 (($phase4AfterTable | ConvertTo-Json -Depth 30 -Compress) -ceq ($phase4Table | ConvertTo-Json -Depth 30 -Compress)) 'Legacy definitions, owners, RLS, policies and grants unchanged'
    } else {
      foreach ($phase4Component in @('columns_md5','indexes_md5','triggers_md5')) {
        Assert-Phase4 ($phase4AfterTable.$phase4Component -ceq $phase4Table.$phase4Component) ('Target structural component: ' + $phase4Table.table + '/' + $phase4Component)
      }
      if ($phase4Table.table -ceq 'system_users' -and @($After.auth_foreign_keys).Count -eq 1) {
        Assert-Phase4 ($phase4AfterTable.constraints_count -eq $phase4Table.constraints_count + 1) 'Only one added profile constraint'
      } else {
        Assert-Phase4 ($phase4AfterTable.constraints_md5 -ceq $phase4Table.constraints_md5) ('Unchanged target constraints: ' + $phase4Table.table)
      }
    }
  }
  foreach ($phase4Row in $Before.ledger) {
    $phase4AfterRow = $After.ledger | Where-Object id -CEQ $phase4Row.id
    Assert-Phase4 (($phase4AfterRow | ConvertTo-Json -Depth 10 -Compress) -ceq ($phase4Row | ConvertTo-Json -Depth 10 -Compress)) 'Original ledger row preserved'
  }
  Assert-Phase4 (@($After.ledger_locations).Count -eq 1 -and $After.ledger_locations[0] -ceq 'public._prisma_migrations' -and @($After.ledger | Where-Object { -not $_.finished_at -and -not $_.rolled_back_at }).Count -eq 0) 'Single ledger with no unresolved row'
  $phase4OldMemberships = @($After.memberships | Where-Object { $_.role -cne 'pathways_runtime' })
  Assert-Phase4 (($phase4OldMemberships | ConvertTo-Json -Depth 10 -Compress) -ceq ($Before.memberships | ConvertTo-Json -Depth 10 -Compress)) 'Existing role memberships unchanged'
  Assert-Phase4 (@($After.memberships | Where-Object { $_.member -ceq 'pathways_runtime' -or ($_.role -ceq 'pathways_runtime' -and $_.member -cne 'postgres') }).Count -eq 0) 'No runtime membership/elevation or unexpected grantee'
  foreach ($phase4Role in $Before.roles) {
    $phase4AfterRole = $After.roles | Where-Object name -CEQ $phase4Role.name
    Assert-Phase4 ($null -ne $phase4AfterRole) 'Existing role preserved'
    foreach ($phase4Property in @('database_connect','database_create','login','inherit','superuser','create_database','create_role','replication','bypass_rls','connection_limit','valid_until')) {
      Assert-Phase4 ($phase4AfterRole.$phase4Property -eq $phase4Role.$phase4Property) ('Unrelated role privilege: ' + $phase4Role.name + '/' + $phase4Property)
    }
  }
}

try {
  Set-Location -LiteralPath $phase4Root
  $phase4Before = Get-Phase4Inventory
  Assert-Phase4 $phase4Before.connection.admin_can_read_role_catalog 'Administrator can verify unprovisioned role password presence without output'
  Assert-Phase4 (-not (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'PATHWAYS/secrets/dev-db-runtime.credential.xml'))) 'Runtime credential file absent before first provisioning'
  Assert-Phase4 (@($phase4Before.ledger_locations).Count -eq 1 -and $phase4Before.ledger_locations[0] -ceq 'public._prisma_migrations') 'Single public ledger'
  Assert-Phase4 (@($phase4Before.ledger).Count -eq 5 -and @($phase4Before.ledger | Where-Object { -not $_.finished_at -and -not $_.rolled_back_at }).Count -eq 0) 'No unresolved migrations'
  $phase4OriginalFailure = @($phase4Before.ledger | Where-Object { $_.migration_name -ceq '0002_pathways_foundation' -and -not $_.finished_at -and $_.rolled_back_at -and $_.applied_steps_count -eq 0 -and $_.failure_contains_postgres_42501 -and $_.checksum.ToUpperInvariant() -ceq 'A0B6964541B4AEA56CB8529DF93597F182E4E7C8BAF0F53BBDF3F6F7FF9EA9B2' })
  Assert-Phase4 ($phase4OriginalFailure.Count -eq 1) 'Original rolled-back 0002 audit history'
  Assert-Phase4 (@($phase4Before.roles | Where-Object name -CEQ 'pathways_runtime').Count -eq 0) 'Runtime role absent before first deployment'
  Assert-Phase4 ($phase4Before.auth.users_count -eq 2 -and $phase4Before.auth.identities_count -eq 2 -and $phase4Before.storage.buckets_count -eq 1 -and $phase4Before.storage.objects_count -eq 1) 'Auth/Storage baseline counts'
  Assert-Phase4 (@($phase4Before.auth_foreign_keys).Count -eq 0 -and @($phase4Before.tables | Where-Object { $_.policies.Count -ne 0 }).Count -eq 0) 'No unexpected adapter policies or Auth FK'
  Assert-Phase4 (@($phase4Before.event_triggers).Count -eq 9 -and ($phase4Before.event_triggers | Where-Object name -CEQ 'ensure_rls').function_definition_md5 -ceq '6998ea6b4c2480f5d2e34b5dcf3f8d36') 'Exact custom and managed trigger capture'
  Compare-Phase4Preserved $phase4Before $phase4Before
  $phase4Hashes = @{
    '0001_init'='8B4E25D97B493E6042287373BDA015DB8E1F1E6A1DAF0E49B142484762E248AB'
    '0002_pathways_foundation'='A0B6964541B4AEA56CB8529DF93597F182E4E7C8BAF0F53BBDF3F6F7FF9EA9B2'
    '0003_pathways_projects_collection'='6388784BCE9058736E9B79B6B3E39A0A214255AA8080D810DC99B3B76805194B'
    '0004_pathways_finance_evaluation_decisions'='8C94BDE1E4F402610A57BE39BAE5C07977C5C6AEAC4E2A96638DA1396C66F08B'
    '0005_supabase_security_adapter'='6E942CFD46833375F5E0D4BBF4F66B84F28A90FC614472974FC309CF98610BDC'
  }
  foreach ($phase4Name in $phase4Hashes.Keys) {
    $phase4Hash = (Get-FileHash -LiteralPath (Join-Path $phase4Root "apps/api/prisma/migrations/$phase4Name/migration.sql") -Algorithm SHA256).Hash
    Assert-Phase4 ($phase4Hash -ceq $phase4Hashes[$phase4Name]) ('Migration checksum: ' + $phase4Name)
    if ($phase4Name -ne '0005_supabase_security_adapter') {
      $phase4Completed = @($phase4Before.ledger | Where-Object { $_.migration_name -ceq $phase4Name -and $_.finished_at -and -not $_.rolled_back_at })
      Assert-Phase4 ($phase4Completed.Count -eq 1 -and $phase4Completed[0].checksum.ToUpperInvariant() -ceq $phase4Hash) ('Completed ledger checksum: ' + $phase4Name)
    }
  }
  Assert-Phase4 ((Get-FileHash -LiteralPath 'C:\PATHWAYS-backups\PATHWAYS-dev-post-ledger-phase0c-20260904-161649.dump' -Algorithm SHA256).Hash -ceq 'BC98DF2AD597F83AFB498DCC4D2AFC1827132D933B75615B761EBBC95992A1B9') 'Preserved Phase 0C backup'
  Test-Phase4Services
  & node (Join-Path $PSScriptRoot 'migration-connection-check.mjs')
  Assert-Phase4 ($LASTEXITCODE -eq 0) 'Migration connection and original TEMP access'
  if ($PreflightOnly) {
    Write-Output 'PREFLIGHT_ONLY=PASS; NO_PERSISTENT_MUTATION'
    exit 0
  }
  Write-Output 'PREFLIGHT=PASS; APPLYING_ONLY_REVIEWED_TEMP_CHANGE'
  $phase4TempAttempted = $true
  $phase4TempLines = @(& (Join-Path $PSScriptRoot 'Invoke-DevAdmin.ps1') -Action ApplyTemp)
  $phase4TempExit = $LASTEXITCODE
  $phase4TempLines | Write-Output
  if ($phase4TempExit -eq 124) {
    $phase4OutcomeUnknown = $true
    throw 'TEMP outcome unresolved; inspect the reported exact process before another action.'
  }
  Assert-Phase4 ($phase4TempExit -eq 0) 'Atomic TEMP apply'
  $phase4TempApplied = $true
  Test-Phase4Services
  & node (Join-Path $PSScriptRoot 'migration-connection-check.mjs')
  Assert-Phase4 ($LASTEXITCODE -eq 0) 'Migration TEMP access preserved'
  & (Join-Path $PSScriptRoot 'Invoke-DevAdmin.ps1') -Action ApiNegative
  Assert-Phase4 ($LASTEXITCODE -eq 0) 'Actual API-role TEMP/table/DDL denial'
  $phase4TempState = Get-Phase4Inventory
  Compare-Phase4Preserved $phase4Before $phase4TempState
  Write-Output 'TEMP_POSTCHECK=PASS; DEPLOYING_ONLY_REVIEWED_0005'
  $phase4DeployLines = @(& (Join-Path $PSScriptRoot 'Invoke-DevAdmin.ps1') -Action Deploy0005)
  $phase4DeployExit = $LASTEXITCODE
  $phase4DeployLines | Write-Output
  if ($phase4DeployExit -eq 124) {
    $phase4OutcomeUnknown = $true
    throw 'Deployment is still unresolved; inspect the reported exact process before another action.'
  }
  Assert-Phase4 ($phase4DeployExit -eq 0) '0005 terminal deployment success'
  Test-Phase4Services
  $phase4Applied = Get-Phase4Inventory
  & (Join-Path $PSScriptRoot 'Invoke-DevAdmin.ps1') -Action ApiNegative
  Assert-Phase4 ($LASTEXITCODE -eq 0) 'API-role security preserved after 0005'
  Compare-Phase4Preserved $phase4Before $phase4Applied
  Assert-Phase4 (@($phase4Applied.ledger | Where-Object { $_.migration_name -ceq '0005_supabase_security_adapter' -and $_.finished_at -and -not $_.rolled_back_at -and -not $_.has_failure_log -and $_.checksum.ToUpperInvariant() -ceq $phase4Hashes['0005_supabase_security_adapter'] }).Count -eq 1) 'Exactly one completed 0005'
  Assert-Phase4 (@($phase4Applied.ledger).Count -eq 6) 'Only one new ledger entry'
  Assert-Phase4 (@($phase4Applied.tables | Where-Object { $_.group -ceq 'target' -and $_.rls_enabled }).Count -eq 39) 'RLS on all targets'
  Assert-Phase4 (($phase4Applied.tables | ForEach-Object { $_.policies.Count } | Measure-Object -Sum).Sum -eq 105) '105 reviewed policies'
  Assert-Phase4 (@($phase4Applied.event_triggers).Count -eq 8 -and @($phase4Applied.event_triggers | Where-Object name -CEQ 'ensure_rls').Count -eq 0) 'Exact custom helper retired'
  Assert-Phase4 ($phase4Applied.auth_foreign_keys.Count -eq 1 -and $phase4Applied.auth_foreign_keys[0].definition -match 'ON DELETE SET NULL') 'One SET NULL Auth FK'
  & (Join-Path $PSScriptRoot 'Provision-DevRuntime.ps1')
  Assert-Phase4 ($LASTEXITCODE -eq 0) 'First runtime credential provision'
  & (Join-Path $PSScriptRoot 'Check-DevRuntime.ps1')
  Assert-Phase4 ($LASTEXITCODE -eq 0) 'Actual runtime credential and security probes'
  & (Join-Path $PSScriptRoot 'Start-DevRuntime.ps1') -Action Check
  Assert-Phase4 ($LASTEXITCODE -eq 0) 'Prisma runtime connection and startup guard'
  & node (Join-Path $PSScriptRoot 'migration-connection-check.mjs') Status
  Assert-Phase4 ($LASTEXITCODE -eq 0) 'Prisma migration status current'
  Test-Phase4Services
  $phase4Final = Get-Phase4Inventory
  Compare-Phase4Preserved $phase4Before $phase4Final
  $phase4Passed = $true
  Write-Output 'AUTHORIZED_DEPLOYMENT_SEQUENCE=PASS; FINAL_CATALOG_REVIEW_AND_TODO_CLOSEOUT_STILL_REQUIRED'
} catch {
  # Assertions contain only fixed non-secret labels. Never relay native errors.
  $phase4SafeMessage = $_.Exception.Message
  if (-not $phase4SafeMessage.StartsWith('Phase 4 assertion failed:')) {
    $phase4SafeMessage = 'Sensitive error details withheld; inspect stage markers and non-secret catalog evidence.'
  }
  Write-Output ('AUTHORIZED_DEPLOYMENT_SEQUENCE=FAILED; ' + $phase4SafeMessage)
} finally {
  if ($phase4TempAttempted -and -not $phase4Passed -and -not $phase4OutcomeUnknown) {
    # A terminal client failure can occur after server COMMIT. Read state even
    # when no success marker was received. Exact restore SQL rejects all drift.
    $phase4FailureState = Get-Phase4Inventory
    $phase4AlreadyOriginal = (($phase4FailureState.database_acl | ConvertTo-Json -Depth 10 -Compress) -ceq ($phase4Before.database_acl | ConvertTo-Json -Depth 10 -Compress))
    if ($phase4AlreadyOriginal) {
      Write-Output 'TEMP_BASELINE_ALREADY_ORIGINAL=VERIFIED; NO_RESTORE_NEEDED; HARD_STOP'
    } else {
    Write-Output 'REGRESSION_HANDLING=RESTORING_EXACT_TEMP_BASELINE_NOW'
    & (Join-Path $PSScriptRoot 'Invoke-DevAdmin.ps1') -Action RestoreTemp
    if ($LASTEXITCODE -ne 0) {
      Write-Output 'CRITICAL=TEMP_RESTORATION_FAILED; HARD_STOP'
    } else {
      $phase4Restored = Get-Phase4Inventory
      Assert-Phase4 (($phase4Restored.database_acl | ConvertTo-Json -Depth 10 -Compress) -ceq ($phase4Before.database_acl | ConvertTo-Json -Depth 10 -Compress)) 'Restored exact original database ACL'
      Test-Phase4Services
      Write-Output 'TEMP_RESTORATION=VERIFIED; ORIGINAL_CONNECT_AND_UNRELATED_PRIVILEGES_PRESERVED; HARD_STOP'
    }
    }
  }
}
if ($phase4Passed) { exit 0 } else { exit 1 }
