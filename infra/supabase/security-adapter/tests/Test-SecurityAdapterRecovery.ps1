# Offline state-machine tests. No database, HTTP, credentials, or subprocesses.
# Executes the recovery runner in memory with every external dependency mocked.
# The production runner/common files are never modified by this test.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$script:phase4MockAdapterRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$phase4RunnerPath=Join-Path $script:phase4MockAdapterRoot 'Invoke-SecurityAdapterRecovery.ps1'
$phase4RunnerSource=[IO.File]::ReadAllText($phase4RunnerPath)
$phase4RunnerSource=$phase4RunnerSource.Replace('$PSScriptRoot','$script:phase4MockAdapterRoot')
$phase4ProvisionCall='& (Join-Path $script:phase4MockAdapterRoot ''Provision-DevRuntime.ps1'')'
$phase4RuntimeCall='& (Join-Path $script:phase4MockAdapterRoot ''Test-RecoveryRuntime.ps1'')'
if (-not $phase4RunnerSource.Contains($phase4ProvisionCall) -or -not $phase4RunnerSource.Contains($phase4RuntimeCall)) {
  throw 'Recovery child-call syntax changed; refuse execution until mocks are reviewed.'
}
$phase4RunnerSource=$phase4RunnerSource.Replace($phase4ProvisionCall,'Invoke-TestProvision')
$phase4RunnerSource=$phase4RunnerSource.Replace($phase4RuntimeCall,'Invoke-TestRuntime')
$phase4RunnerSource=[regex]::Replace($phase4RunnerSource,'(?m)& node\b','Invoke-TestNode')
# ScriptBlock invocation has a child scope rather than a .ps1 script scope.
# Qualify only the runner's state variables to preserve its script semantics.
$phase4Globals='recoveryRoot|recoveryTag|recoveryKnownSessions|recoveryAttempted|recoveryUnknown|recoveryConfirmedFailure|recoveryPassed|recoveryStage|recoveryBefore|recoveryProtected'
$phase4RunnerSource=[regex]::Replace($phase4RunnerSource,'\$('+$phase4Globals+')\b','$$script:$1')
$phase4RunnerSource=[regex]::Replace($phase4RunnerSource,'\bexit [01]\b','return')
if ($phase4RunnerSource.Contains($phase4ProvisionCall) -or
    $phase4RunnerSource.Contains($phase4RuntimeCall) -or
    $phase4RunnerSource -match '(?m)& node\b') {
  throw 'External runner dependency was not mocked.'
}

$phase4Mocks=@'
function Get-FileHash {
  param([string]$LiteralPath,[string]$Algorithm)
  $relative=$LiteralPath
  if ($relative.StartsWith($script:recoveryRoot,[StringComparison]::OrdinalIgnoreCase)) {
    $relative=$relative.Substring($script:recoveryRoot.Length).TrimStart('\','/').Replace('\','/')
  }
  $hash=if($script:recoveryProtected.ContainsKey($relative)){$script:recoveryProtected[$relative]}
    elseif($LiteralPath -like '*PATHWAYS-dev-post-ledger-phase0c-*'){'BC98DF2AD597F83AFB498DCC4D2AFC1827132D933B75615B761EBBC95992A1B9'}
    else{'F'*64}
  [pscustomobject]@{Hash=$hash}
}
function Get-ChildItem {
  param([string]$LiteralPath,[switch]$Directory)
  1..5 | ForEach-Object { [pscustomobject]@{Name=('000'+$_)} }
}
function Test-Path {
  param([string]$LiteralPath)
  if ($LiteralPath -notlike '*dev-db-runtime.credential.xml') { throw 'Unexpected mocked file existence probe.' }
  return $false
}
function Assert-RecoveryBaseline {
  param($Evidence,$RoleState)
  if ($script:phase4Scenario -eq 'PreflightDifference') { throw 'RECOVERY_ASSERTION: mocked post-0005 baseline differs' }
  Assert-Recovery (-not $RoleState.runtime_login -and $RoleState.password_absent -and
    @($RoleState.runtime_sessions).Count -eq 0) 'Mock unprovisioned baseline'
}
function Invoke-TestNode {
  param([Parameter(ValueFromRemainingArguments)]$Arguments)
  $global:LASTEXITCODE=0
}
function Test-RecoveryServices {
  $script:phase4State.Services++
}
function Get-TestInventory {
  $allowlist=@('prisma','authenticator','supabase_auth_admin','supabase_storage_admin',
    'supabase_etl_admin','supabase_read_only_user','supabase_realtime_admin',
    'supabase_replication_admin','supabase_privileged_role')
  $acl=@()
  $acl+=,@('PUBLIC','postgres','CONNECT',$false)
  if (-not $script:phase4State.Applied) { $acl+=,@('PUBLIC','postgres','TEMPORARY',$false) }
  if ($script:phase4State.Applied) {
    foreach($name in $allowlist){ $acl+=,@($name,'postgres','TEMPORARY',$false) }
  }
  $roles=@()
  foreach($name in ($allowlist+@('postgres','dashboard_user','pathways_runtime','anon','authenticated','service_role'))) {
    $temp=(-not $script:phase4State.Applied) -or $name -cin ($allowlist+@('postgres','dashboard_user'))
    $login=if($name -ceq 'pathways_runtime'){$script:phase4State.Login}else{$false}
    $roles+=[pscustomobject]@{name=$name;login=$login;database_connect=$true;database_create=$false;database_temporary=$temp}
  }
  return [pscustomobject]@{
    connection=[pscustomobject]@{database='postgres';current_user='postgres';session_user='postgres';transaction_read_only='on'}
    roles=$roles;database_acl=$acl;runtime_owned_object_count=0
    ledger_locations=@('public._prisma_migrations');ledger=@('mock_completed_0005')
    tables=@('mock_39_unchanged');schemas=@('mock_schema');auth=@('mock_two_users')
    storage=@('mock_private_object');event_triggers=@('mock_managed_triggers')
    pathways_functions=@('mock_adapter_functions');pathways_enums=@('mock_enums')
    default_acl=@('mock_defaults');memberships=@('mock_memberships')
    actual_tables=@('mock_target_and_legacy');auth_foreign_keys=@('mock_set_null_fk')
  }
}
function Get-TestRoleState {
  return [pscustomobject]@{
    database='postgres';current_user='postgres';session_user='postgres';read_only='on'
    runtime_exists=$true;runtime_login=$script:phase4State.Login;admin_can_signal_runtime=$true
    password_absent=(-not $script:phase4State.Provisioned);role_settings_absent=$true
    runtime_sessions=@($script:phase4State.Sessions)
  }
}
function Invoke-RecoveryAdmin {
  param([string]$Action,[object[]]$KnownSessions=@(),[string]$RecoveryTag='',[switch]$ConfirmedFailure)
  $script:phase4Actions.Add($Action)
  $result=[pscustomobject]@{ExitCode=0;Unknown=$false;ConfirmedFailure=$false;Pid=1234;Action=$Action;Output='';Codes=@()}
  switch($Action) {
    'Inventory' {
      if ($script:phase4Scenario -eq 'ReadOnlyBefore' -or
          ($script:phase4Scenario -eq 'ReadOnlyAfterApply' -and $script:phase4State.Applied)) {
        $result.ExitCode=2;$result.Unknown=$true;return $result
      }
      $result.Output=Get-TestInventory | ConvertTo-Json -Depth 100 -Compress
    }
    'RoleState' { $result.Output=Get-TestRoleState | ConvertTo-Json -Depth 100 -Compress }
    'ApplyTemp' {
      $script:phase4State.Applied=$true
      if($script:phase4Scenario -eq 'ApplyUnknown'){ $result.ExitCode=2;$result.Unknown=$true }
    }
    'ApiNegative' {}
    'Contain' {
      if(-not $ConfirmedFailure -or $script:recoveryUnknown){ throw 'Mock: containment lacks confirmed-failure authority.' }
      $script:phase4State.Login=$false
      if($script:phase4Scenario -eq 'UnrelatedSession'){
        $result.ExitCode=3;$result.ConfirmedFailure=$true;$result.Codes=@('P0001');return $result
      }
      if(@($KnownSessions).Count -ne 1 -or $KnownSessions[0].pid -ne 4444 -or
        $KnownSessions[0].backend_start -cne '2026-09-05 00:00:00.000001+00' -or
        $KnownSessions[0].application_name -cne $RecoveryTag){
        throw 'Mock: exact owned backend tuple missing.'
      }
      $script:phase4State.Sessions=@()
    }
    'RestoreTemp' {
      if($script:phase4State.Login -or @($script:phase4State.Sessions).Count -gt 0){
        throw 'Mock: unsafe TEMP restoration before runtime containment.'
      }
      $script:phase4State.Applied=$false
    }
    default { throw 'Unexpected mocked administrator action.' }
  }
  return $result
}
function Invoke-TestProvision {
  $script:phase4Actions.Add('Provision')
  $script:phase4State.Provisioned=$true
  $script:phase4State.Login=$true
  $global:LASTEXITCODE=0
}
function Invoke-TestRuntime {
  param([string]$RecoveryTag)
  $script:phase4Actions.Add('Runtime')
  $backend=[pscustomobject]@{
    pid=4444;backend_start='2026-09-05 00:00:00.000001+00';database='postgres'
    role='pathways_runtime';session_user='pathways_runtime';current_user='pathways_runtime';application_name=$RecoveryTag
  }
  $script:phase4State.Sessions=@($backend)
  Write-Output ('RECOVERY_BACKEND='+($backend | ConvertTo-Json -Compress))
  if($script:phase4Scenario -eq 'RuntimeUnknown'){ $global:LASTEXITCODE=124;return }
  if($script:phase4Scenario -eq 'UnrelatedSession'){
    $script:phase4State.Sessions+= [pscustomobject]@{pid=9999;backend_start='2026-09-05 00:00:01.000001+00';database='postgres';role='pathways_runtime';application_name='<unattributed>'}
    $global:LASTEXITCODE=1;return
  }
  if($script:phase4Scenario -eq 'ConfirmedRuntimeFailure'){ $global:LASTEXITCODE=1;return }
  $script:phase4State.Sessions=@()
  $global:LASTEXITCODE=0
}
'@
$phase4EntryPattern='(?m)^try \{\r?\n  Set-Location'
if([regex]::Matches($phase4RunnerSource,$phase4EntryPattern).Count -ne 1){
  throw 'Recovery runner entry shape changed; review mocks before execution.'
}
$phase4RunnerSource=[regex]::Replace($phase4RunnerSource,$phase4EntryPattern,
  [Text.RegularExpressions.MatchEvaluator]{param($match) $phase4Mocks+[Environment]::NewLine+$match.Value})
$phase4Executable=[scriptblock]::Create($phase4RunnerSource)
$phase4Expected=@{
  PreflightDifference=@()
  ReadOnlyBefore=@()
  ApplyUnknown=@('ApplyTemp')
  ReadOnlyAfterApply=@('ApplyTemp')
  ConfirmedRuntimeFailure=@('ApplyTemp','ApiNegative','Provision','Runtime','Contain','RestoreTemp')
  RuntimeUnknown=@('ApplyTemp','ApiNegative','Provision','Runtime')
  UnrelatedSession=@('ApplyTemp','ApiNegative','Provision','Runtime','Contain')
  Success=@('ApplyTemp','ApiNegative','Provision','Runtime')
}
$phase4Count=0
foreach($phase4Case in @('PreflightDifference','ReadOnlyBefore','ApplyUnknown','ReadOnlyAfterApply',
  'ConfirmedRuntimeFailure','RuntimeUnknown','UnrelatedSession','Success')) {
  $script:phase4Scenario=$phase4Case
  $script:phase4Actions=[Collections.Generic.List[string]]::new()
  $script:phase4State=@{Applied=$false;Provisioned=$false;Login=$false;Sessions=@();Services=0}
  $phase4SavedLocation=(Get-Location).Path
  try {
    $phase4Output=@(& $phase4Executable -Authorization SUPABASE_SECURITY_ADAPTER_0005_ONLY)
  } finally { Set-Location -LiteralPath $phase4SavedLocation }
  $phase4Actual=@($script:phase4Actions | Where-Object { $_ -notin @('Inventory','RoleState') })
  if(($phase4Actual -join ',') -cne ($phase4Expected[$phase4Case] -join ',')){
    throw ('State machine '+$phase4Case+' expected actions ['+($phase4Expected[$phase4Case]-join ',')+'] got ['+($phase4Actual-join ',')+']')
  }
  if($phase4Case -eq 'Success' -and -not $script:recoveryPassed){ throw 'Successful mock did not reach PASS.' }
  if($phase4Case -ne 'Success' -and $script:recoveryPassed){ throw 'Failed/unknown mock reached PASS.' }
  if($phase4Case -eq 'ConfirmedRuntimeFailure' -and
     ($script:phase4State.Login -or $script:phase4State.Applied -or -not $script:phase4State.Provisioned)){
    throw 'Confirmed failure did not contain/restore while preserving provisioned credentials.'
  }
  if($phase4Case -in @('ApplyUnknown','ReadOnlyAfterApply','RuntimeUnknown') -and -not $script:recoveryUnknown){
    throw 'Unknown state was not preserved.'
  }
  Write-Output ('PASS: '+$phase4Case)
  $phase4Count++
}
Write-Output ('OFFLINE_RECOVERY_STATE_MACHINE_TESTS='+$phase4Count+'; NO_NETWORK_OR_CREDENTIAL_ACCESS')
