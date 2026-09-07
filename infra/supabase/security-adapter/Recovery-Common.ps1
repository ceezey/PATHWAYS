# Functions only. Importing this file performs no database or credential action.
function Assert-Recovery {
  param([bool]$Condition,[string]$Label)
  if (-not $Condition) { throw ('RECOVERY_ASSERTION: ' + $Label) }
}

function Invoke-RecoveryAdmin {
  param(
    [ValidateSet('Inventory','RoleState','ApplyTemp','RestoreTemp','ApiNegative','Contain')]
    [string]$Action,
    [object[]]$KnownSessions = @(),
    [string]$RecoveryTag = '',
    [switch]$ConfirmedFailure
  )
  $recoveryInfo = [Diagnostics.ProcessStartInfo]::new()
  $recoveryClient = $null
  $recoveryOut = $null
  $recoveryErr = $null
  $recoveryLaunchAttempted = $false
  $recoveryDispatched = $false
  $recoveryPreserveHandle = $false
  $recoveryEvidenceId = [guid]::NewGuid().ToString('N')
  $recoveryReadOnly = $Action -in @('Inventory','RoleState')
  # Unknown-outcome handles and pending stream tasks stay in process memory.
  # Never print this private store or serialize Process/StartInfo objects.
  if ($null -eq (Get-Variable -Name PathwaysRecoveryPending -Scope Script -ErrorAction SilentlyContinue)) {
    $script:PathwaysRecoveryPending = @{}
  }
  try {
    $recoveryCredentialPath = Join-Path $env:LOCALAPPDATA 'PATHWAYS/secrets/dev-db-admin.credential.xml'
    $recoveryCredential = Import-Clixml -LiteralPath $recoveryCredentialPath
    Assert-Recovery ($recoveryCredential -is [Management.Automation.PSCredential] -and
      $recoveryCredential.UserName -ceq 'postgres.pdqwsknbzkdtiwjjibqt') 'Approved administrator credential identity'
    $recoveryFile = switch ($Action) {
      'Inventory' { 'inventory.sql' }
      'RoleState' { 'recovery-role-state.sql' }
      'ApplyTemp' { 'apply-temp-privileges.sql' }
      'RestoreTemp' { 'restore-temp-privileges.sql' }
      'ApiNegative' { 'api-negative.sql' }
    }
    if ($Action -eq 'Contain') {
      Assert-Recovery ([bool]$ConfirmedFailure) 'Containment requires an independently confirmed failure; never an unknown/read-only failure'
      Assert-Recovery ($RecoveryTag -cmatch '^p4r_[a-f0-9]{32}$') 'Known recovery tag'
      $recoveryValidatedSessions = @()
      foreach ($recoverySession in $KnownSessions) {
        Assert-Recovery ($recoverySession.role -ceq 'pathways_runtime' -and
          $recoverySession.database -ceq 'postgres' -and
          $recoverySession.application_name -ceq $RecoveryTag -and
          [int]$recoverySession.pid -gt 0 -and
          $recoverySession.backend_start -match '^[0-9T :.+-]+$') 'Exact recovery-owned session tuple'
        # Do not serialize arbitrary extra properties supplied by a caller.
        $recoveryValidatedSessions += [pscustomobject]@{
          pid=[int]$recoverySession.pid; backend_start=[string]$recoverySession.backend_start
          database='postgres'; role='pathways_runtime'; application_name=$RecoveryTag
        }
      }
      Assert-Recovery (@($recoveryValidatedSessions.pid | Select-Object -Unique).Count -eq
        @($recoveryValidatedSessions).Count) 'No duplicate containment PID tuples'
      $recoverySessionJson = ConvertTo-Json -InputObject @($recoveryValidatedSessions) -Depth 10 -Compress
      # JSON contains only validated PID/timestamp/role/database/tag metadata.
      $recoverySql = @'
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
DO $$ BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' OR session_user<>'postgres'
    OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname='pathways_runtime'
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls)
    OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
      WHERE r.rolname='pathways_runtime') THEN
  RAISE EXCEPTION 'Containment target mismatch'; END IF;
 -- Reject malformed timestamps before the committed NOLOGIN action.
 PERFORM k.backend_start::timestamptz
 FROM jsonb_to_recordset('__SESSIONS__'::jsonb)
   AS k(pid integer,backend_start text,database text,role text,application_name text);
END $$;
ALTER ROLE pathways_runtime NOLOGIN;
COMMIT;
-- NOLOGIN is committed first. No credential, grant or membership is changed.
-- Its SET LOCAL limits ended at COMMIT: bound the separate termination work.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20s';
DO $contain$
DECLARE item record; terminated boolean;
BEGIN
 PERFORM pg_stat_clear_snapshot();
 IF EXISTS (
   SELECT FROM pg_stat_activity a WHERE a.usename='pathways_runtime'
   AND NOT EXISTS (SELECT FROM jsonb_to_recordset('__SESSIONS__'::jsonb)
     AS k(pid integer,backend_start text,database text,role text,application_name text)
     WHERE a.pid=k.pid AND a.backend_start=k.backend_start::timestamptz
       AND a.datname=k.database AND a.usename=k.role AND a.application_name=k.application_name)
 ) THEN RAISE EXCEPTION 'Unattributed runtime session; no general termination permitted'; END IF;
 FOR item IN
   SELECT k.* FROM jsonb_to_recordset('__SESSIONS__'::jsonb)
     AS k(pid integer,backend_start text,database text,role text,application_name text)
   ORDER BY k.pid
 LOOP
   -- Recheck the complete tuple immediately for each signal; do not keep a
   -- cursor of bare PIDs while waiting for earlier terminations.
   PERFORM pg_stat_clear_snapshot();
   IF NOT EXISTS(SELECT FROM pg_stat_activity WHERE pid=item.pid) THEN
     CONTINUE; -- The exact owned backend has already exited naturally.
   END IF;
   IF NOT EXISTS(SELECT FROM pg_stat_activity a JOIN pg_roles r ON r.rolname=a.usename
     WHERE a.pid=item.pid AND a.backend_start=item.backend_start::timestamptz
       AND a.datname=item.database AND a.usename=item.role
       AND a.application_name=item.application_name AND NOT r.rolsuper) THEN
     RAISE EXCEPTION 'Containment session tuple changed; no signal permitted';
   END IF;
   IF NOT ((SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
     OR pg_has_role(current_user,'pathways_runtime','USAGE')
     OR pg_has_role(current_user,'pg_signal_backend','USAGE')) THEN
     RAISE EXCEPTION 'Administrator lacks authority to terminate the exact runtime backend';
   END IF;
   SELECT pg_terminate_backend(a.pid,5000) INTO terminated
   FROM pg_stat_activity a
   WHERE a.pid=item.pid AND a.backend_start=item.backend_start::timestamptz
     AND a.datname=item.database AND a.usename=item.role
     AND a.application_name=item.application_name;
   IF terminated IS DISTINCT FROM true THEN
     RAISE EXCEPTION 'Exact recovery-owned backend did not terminate'; END IF;
 END LOOP;
 PERFORM pg_stat_clear_snapshot();
 IF EXISTS(SELECT FROM pg_stat_activity WHERE usename='pathways_runtime') THEN
   RAISE EXCEPTION 'Runtime backends remain; no further termination is authorized';
 END IF;
END
$contain$;
COMMIT;
SELECT 'RUNTIME_CONTAINMENT_COMMANDS_COMPLETE';
'@
      $recoverySql = $recoverySql.Replace('__SESSIONS__',$recoverySessionJson.Replace("'","''"))
    } else {
      $recoverySql = [IO.File]::ReadAllText((Join-Path $PSScriptRoot $recoveryFile))
      if ($Action -eq 'Inventory') { $recoverySql = "BEGIN READ ONLY;`n" + $recoverySql + "`nCOMMIT;" }
    }
    $recoveryInfo.FileName = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
    $recoveryInfo.Arguments = '-X -w -q -A -t -h aws-1-ap-southeast-2.pooler.supabase.com -p 5432 -U postgres.pdqwsknbzkdtiwjjibqt -d postgres -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate'
    $recoveryInfo.UseShellExecute = $false
    $recoveryInfo.CreateNoWindow = $true
    $recoveryInfo.RedirectStandardInput = $true
    $recoveryInfo.RedirectStandardOutput = $true
    $recoveryInfo.RedirectStandardError = $true
    foreach ($recoveryEnvName in @($recoveryInfo.EnvironmentVariables.Keys)) {
      if ($recoveryEnvName -match '^(PG|DATABASE_URL$|DIRECT_URL$|SHADOW_DATABASE_URL$)') {
        $recoveryInfo.EnvironmentVariables.Remove($recoveryEnvName)
      }
    }
    $recoveryInfo.EnvironmentVariables['PGPASSWORD'] = $recoveryCredential.GetNetworkCredential().Password
    $recoveryInfo.EnvironmentVariables['PGSSLMODE'] = 'require'
    $recoveryInfo.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '15'
    $recoveryLaunchAttempted = $true
    $recoveryClient = [Diagnostics.Process]::Start($recoveryInfo)
    $recoveryInfo.EnvironmentVariables.Remove('PGPASSWORD')
    $recoveryClient.StartInfo.EnvironmentVariables.Remove('PGPASSWORD')
    $recoveryOut = $recoveryClient.StandardOutput.ReadToEndAsync()
    $recoveryErr = $recoveryClient.StandardError.ReadToEndAsync()
    # Set before Write: a partial pipe write can dispatch SQL before throwing.
    $recoveryDispatched = $true
    $recoveryClient.StandardInput.Write($recoverySql)
    $recoveryClient.StandardInput.Close()
    if (-not $recoveryClient.WaitForExit(60000)) {
      $recoveryPreserveHandle = $true
      return [pscustomobject]@{ ExitCode=124; Unknown=$true; ConfirmedFailure=$false; ReadOnly=$recoveryReadOnly; Pid=$recoveryClient.Id; EvidenceId=$recoveryEvidenceId; Action=$Action; Output=''; Codes=@('CLIENT_TIMEOUT') }
    }
    $recoveryExit = $recoveryClient.ExitCode
    $recoveryRawOut = $recoveryOut.Result
    $recoveryRawErr = $recoveryErr.Result
    $recoveryCodes = @([regex]::Matches($recoveryRawErr,'(?m)(?:ERROR|FATAL):\s+([0-9A-Z]{5})') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
    # psql 2 is a lost/bad connection; 1 is a client failure. Neither proves
    # whether earlier SQL committed. Only a received server SQL error (exit 3)
    # establishes a command failure, and transport/shutdown SQLSTATEs remain
    # uncertain. A confirmed command error still does not imply full rollback.
    $recoveryConfirmedSqlError = $recoveryExit -eq 3 -and $recoveryCodes.Count -gt 0 -and
      @($recoveryCodes | Where-Object { $_ -match '^(08|57P0[123])' }).Count -eq 0
    $recoveryUnknown = $recoveryExit -ne 0 -and -not $recoveryConfirmedSqlError
    $recoveryPreserveHandle = $recoveryUnknown
    # Only successful, reviewed inventory/marker output leaves this function.
    return [pscustomobject]@{ ExitCode=$recoveryExit; Unknown=$recoveryUnknown; ConfirmedFailure=$recoveryConfirmedSqlError; ReadOnly=$recoveryReadOnly; Pid=$recoveryClient.Id; EvidenceId=$recoveryEvidenceId; Action=$Action; Output=$(if($recoveryExit -eq 0){$recoveryRawOut}else{''}); Codes=$recoveryCodes }
  } catch {
    $recoveryPreserveHandle = $recoveryLaunchAttempted
    $recoveryProcessId = if ($null -ne $recoveryClient) { $recoveryClient.Id } else { $null }
    return [pscustomobject]@{ ExitCode=1; Unknown=$recoveryLaunchAttempted; ConfirmedFailure=$false; ReadOnly=$recoveryReadOnly; Pid=$recoveryProcessId; EvidenceId=$recoveryEvidenceId; Action=$Action; Output=''; Codes=@($(if($recoveryLaunchAttempted){'CLIENT_OUTCOME_UNCERTAIN'}else{'CLIENT_GUARD'})) }
  } finally {
    $recoveryInfo.EnvironmentVariables.Remove('PGPASSWORD')
    $recoveryCredential = $null
    # Never kill a child with an uncertain outcome or erase its pending output.
    # The runner must hard stop, then use fresh read-only evidence to reconcile.
    if ($recoveryPreserveHandle) {
      $script:PathwaysRecoveryPending[$recoveryEvidenceId] = [pscustomobject]@{
        Process=$recoveryClient; StdoutTask=$recoveryOut; StderrTask=$recoveryErr
        Action=$Action; Dispatched=$recoveryDispatched; RecordedUtc=[datetime]::UtcNow
      }
    } elseif ($null -ne $recoveryClient -and $recoveryClient.HasExited) {
      $recoveryClient.Dispose()
    }
  }
}

function Read-RecoveryEvidence {
  param([ValidateSet('Inventory','RoleState')][string]$Action)
  $recoveryResult = Invoke-RecoveryAdmin -Action $Action
  try {
    Assert-Recovery (-not $recoveryResult.Unknown -and $recoveryResult.ExitCode -eq 0) ('Read-only ' + $Action)
    $recoveryValue = $recoveryResult.Output.Trim() | ConvertFrom-Json -ErrorAction Stop
    $recoveryConnection = if ($Action -eq 'Inventory') { $recoveryValue.connection } else { $recoveryValue }
    Assert-Recovery ($recoveryConnection.database -ceq 'postgres' -and
      $recoveryConnection.current_user -ceq 'postgres' -and $recoveryConnection.session_user -ceq 'postgres') 'Approved administrator session'
    if ($Action -eq 'Inventory') {
      Assert-Recovery ($recoveryConnection.transaction_read_only -ceq 'on') 'Read-only inventory transaction'
    } else {
      Assert-Recovery ($recoveryConnection.read_only -ceq 'on') 'Read-only role-state transaction'
    }
  } catch {
    # Failed/malformed read-only evidence cannot establish an attributable
    # runtime/service regression. The outer runner must not contain/restore.
    $script:recoveryUnknown = $true
    throw 'RECOVERY_READ_ONLY_EVIDENCE_UNAVAILABLE'
  }
  return $recoveryValue
}

function Compare-RecoveryPreservation {
  param($Before,$After,[switch]$AllowProvisioned)
  foreach ($recoveryKey in @('ledger_locations','ledger','tables','schemas','auth','storage',
    'event_triggers','pathways_functions','pathways_enums','default_acl','memberships','actual_tables','auth_foreign_keys')) {
    Assert-Recovery ((ConvertTo-Json -InputObject $Before.$recoveryKey -Depth 100 -Compress) -ceq
      (ConvertTo-Json -InputObject $After.$recoveryKey -Depth 100 -Compress)) ('Unchanged post-0005 evidence: ' + $recoveryKey)
  }
  Assert-Recovery (@($Before.roles).Count -eq @($After.roles).Count -and $After.runtime_owned_object_count -eq 0) 'No role creation or runtime ownership'
  foreach ($recoveryOldRole in $Before.roles) {
    $recoveryNewRole = $After.roles | Where-Object name -CEQ $recoveryOldRole.name
    Assert-Recovery ($null -ne $recoveryNewRole) 'Existing role retained'
    foreach ($recoveryProperty in $recoveryOldRole.PSObject.Properties.Name) {
      if ($recoveryProperty -ceq 'database_temporary') { continue }
      if ($AllowProvisioned -and $recoveryOldRole.name -ceq 'pathways_runtime' -and $recoveryProperty -ceq 'login') { continue }
      Assert-Recovery ((ConvertTo-Json -InputObject $recoveryNewRole.$recoveryProperty -Depth 20 -Compress) -ceq
        (ConvertTo-Json -InputObject $recoveryOldRole.$recoveryProperty -Depth 20 -Compress)) ('Existing role property: ' + $recoveryOldRole.name + '/' + $recoveryProperty)
    }
  }
}
