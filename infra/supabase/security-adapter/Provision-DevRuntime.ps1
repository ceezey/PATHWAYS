# Phase 4 first provisioning only; never use this as a password rotation tool.
# Requires the reviewed/applied 0005 role to be NOLOGIN with no password.
# Fixed PATHWAYS-dev target. No credentials or complete URLs are printed.
# The caller must complete the Phase 4 inventory/maintenance preflight first.
# If interrupted, preserve the credential file and inspect state; never rerun
# by deleting the file or clearing/resetting a database password.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function New-Phase4ScramVerifier {
    param([Parameter(Mandatory)][string]$Password)

    $phase4Rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $phase4Salt = New-Object byte[] 16
    $phase4Rng.GetBytes($phase4Salt)
    $phase4PasswordBytes = [Text.Encoding]::UTF8.GetBytes($Password)
    $phase4Deriver = $null
    $phase4Hmac = $null
    $phase4Sha = $null
    try {
        # Passwords generated below are ASCII hex; SASLprep cannot change them.
        $phase4Deriver = [Security.Cryptography.Rfc2898DeriveBytes]::new(
            $phase4PasswordBytes, $phase4Salt, 4096,
            [Security.Cryptography.HashAlgorithmName]::SHA256
        )
        $phase4SaltedPassword = $phase4Deriver.GetBytes(32)
        $phase4Hmac = [Security.Cryptography.HMACSHA256]::new($phase4SaltedPassword)
        $phase4ClientKey = $phase4Hmac.ComputeHash([Text.Encoding]::ASCII.GetBytes('Client Key'))
        $phase4ServerKey = $phase4Hmac.ComputeHash([Text.Encoding]::ASCII.GetBytes('Server Key'))
        $phase4Sha = [Security.Cryptography.SHA256]::Create()
        $phase4StoredKey = $phase4Sha.ComputeHash($phase4ClientKey)
        return ('SCRAM-SHA-256$4096:{0}${1}:{2}' -f
            [Convert]::ToBase64String($phase4Salt),
            [Convert]::ToBase64String($phase4StoredKey),
            [Convert]::ToBase64String($phase4ServerKey))
    } finally {
        foreach ($phase4Buffer in @($phase4PasswordBytes, $phase4SaltedPassword,
                  $phase4ClientKey, $phase4ServerKey, $phase4StoredKey)) {
            if ($null -ne $phase4Buffer) { [Array]::Clear($phase4Buffer, 0, $phase4Buffer.Length) }
        }
        if ($null -ne $phase4Deriver) { $phase4Deriver.Dispose() }
        if ($null -ne $phase4Hmac) { $phase4Hmac.Dispose() }
        if ($null -ne $phase4Sha) { $phase4Sha.Dispose() }
        $phase4Rng.Dispose()
    }
}

function Get-Phase4ProvisionSqlOutcome {
    param(
        [Parameter(Mandatory)][string]$Stage,
        [Parameter(Mandatory)][bool]$Exited,
        [int]$ExitCode = -1,
        [string]$Output = '',
        [string]$ErrorOutput = ''
    )

    $phase4Codes = @([regex]::Matches($ErrorOutput, '(?m)(?:ERROR|FATAL):\s+([0-9A-Z]{5})') |
        ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
    $phase4UncertainError = $ErrorOutput -match '(?m)FATAL:' -or
        @($phase4Codes | Where-Object { $_ -match '^08' -or $_ -eq '40003' }).Count -gt 0
    $phase4CommitAck = $Output -match '(?m)^PHASE4_RUNTIME_PROVISION_COMMIT_ACK\r?$'
    $phase4Expected = 'PHASE4_RUNTIME_PROVISION_STEP_OK'
    if ($Stage -eq 'FIRST_DATABASE_PROVISION') {
        $phase4Expected = "PHASE4_RUNTIME_PROVISION_COMMIT_ACK`nPHASE4_RUNTIME_PROVISION_STEP_OK"
    }
    $phase4Normalized = $Output.Replace("`r`n", "`n").Trim()
    $phase4Outcome = 'READ_ONLY_FAILURE'
    if (-not $Exited) {
        $phase4Outcome = 'OUTCOME_UNKNOWN'
    } elseif ($ExitCode -eq 0 -and $phase4Normalized -ceq $phase4Expected) {
        $phase4Outcome = 'PASS'
    } elseif ($ExitCode -eq 3 -and $phase4Codes.Count -gt 0 -and -not $phase4CommitAck -and
              -not $phase4UncertainError) {
        # ON_ERROR_STOP script failure before the client's COMMIT acknowledgement.
        $phase4Outcome = 'CONFIRMED_SQL_FAILURE'
    } elseif ($Stage -eq 'FIRST_DATABASE_PROVISION') {
        # Network/psql failures and missing final success evidence are uncertain,
        # even if an administrator later discovers the role was provisioned.
        $phase4Outcome = 'OUTCOME_UNKNOWN'
    }
    return [pscustomobject]@{ Outcome = $phase4Outcome; SqlStates = $phase4Codes }
}

function Invoke-Phase4ProvisionSql {
    param(
        [Parameter(Mandatory)][System.Management.Automation.PSCredential]$Credential,
        [Parameter(Mandatory)][string]$Sql
    )

    $phase4Info = [Diagnostics.ProcessStartInfo]::new()
    $phase4Info.FileName = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
    $phase4Info.Arguments = '-X -w -q -A -t -h aws-1-ap-southeast-2.pooler.supabase.com -p 5432 -U postgres.pdqwsknbzkdtiwjjibqt -d postgres -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate'
    $phase4Info.UseShellExecute = $false
    $phase4Info.CreateNoWindow = $true
    $phase4Info.RedirectStandardInput = $true
    $phase4Info.RedirectStandardOutput = $true
    $phase4Info.RedirectStandardError = $true
    foreach ($phase4Name in @($phase4Info.EnvironmentVariables.Keys)) {
        if ($phase4Name -match '^(PG|DATABASE_URL$|DIRECT_URL$|SHADOW_DATABASE_URL$|SUPABASE_)') {
            $phase4Info.EnvironmentVariables.Remove($phase4Name)
        }
    }
    $phase4Info.EnvironmentVariables['PGPASSWORD'] = $Credential.GetNetworkCredential().Password
    $phase4Info.EnvironmentVariables['PGSSLMODE'] = 'require'
    $phase4Info.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '15'
    $phase4Info.EnvironmentVariables['PGOPTIONS'] = '-c statement_timeout=20000 -c lock_timeout=5000'
    $phase4Process = $null
    $phase4ObservedExit = $false
    $phase4ConfirmedSqlFailure = $false
    $script:phase4ChildPid = $null
    $script:phase4SqlExitCode = $null
    try {
        $phase4Process = [Diagnostics.Process]::Start($phase4Info)
        $script:phase4ChildPid = $phase4Process.Id
        $phase4Info.EnvironmentVariables.Remove('PGPASSWORD')
        $phase4Out = $phase4Process.StandardOutput.ReadToEndAsync()
        $phase4Err = $phase4Process.StandardError.ReadToEndAsync()
        $phase4Process.StandardInput.Write($Sql)
        $phase4Process.StandardInput.Close()
        if (-not $phase4Process.WaitForExit(45000)) {
            # Do not terminate an uncertain provisioning client or infer that its
            # transaction failed. Preserve the running process and its exact PID.
            $script:phase4OutcomeUnknown = $true
            throw 'Provisioning observation timed out; outcome unknown.'
        }
        $phase4ObservedExit = $true
        $script:phase4SqlExitCode = $phase4Process.ExitCode
        $phase4Output = $phase4Out.Result
        $phase4Error = $phase4Err.Result
        $phase4Result = Get-Phase4ProvisionSqlOutcome -Stage $script:phase4Stage `
            -Exited $true -ExitCode $phase4Process.ExitCode -Output $phase4Output -ErrorOutput $phase4Error
        if ($phase4Result.Outcome -ne 'PASS') {
            $phase4ConfirmedSqlFailure = $phase4Result.Outcome -eq 'CONFIRMED_SQL_FAILURE'
            $script:phase4OutcomeUnknown = $phase4Result.Outcome -eq 'OUTCOME_UNKNOWN'
            Write-Output ('RUNTIME_PROVISION_SQL_RESULT=' + $phase4Result.Outcome +
                '; CHILD_PID=' + $script:phase4ChildPid + '; SQL_EXIT=' + $phase4Process.ExitCode +
                '; CODES=' + ($phase4Result.SqlStates -join ','))
            throw 'Provisioning SQL failed; raw output withheld.'
        }
    } catch {
        if ($null -ne $phase4Process -and -not $phase4ObservedExit) {
            $script:phase4OutcomeUnknown = $true
            $script:phase4ChildMayRun = $true
            $script:phase4PreservedSqlProcess = $phase4Process
        }
        if ($null -ne $phase4Process -and $script:phase4Stage -eq 'FIRST_DATABASE_PROVISION' -and
            -not $phase4ConfirmedSqlFailure) {
            $script:phase4OutcomeUnknown = $true
        }
        throw
    } finally {
        $phase4Info.EnvironmentVariables.Remove('PGPASSWORD')
        # Dispose handles only after an observed terminal exit. A timeout retains
        # the running client; the orchestrator must inspect, not kill or retry it.
        if ($null -ne $phase4Process -and $phase4ObservedExit) { $phase4Process.Dispose() }
    }
}

$phase4Stage = 'START'
$phase4Saved = $false
$phase4Exit = 1
$phase4OutcomeUnknown = $false
$phase4ChildPid = $null
$phase4SqlExitCode = $null
$phase4ChildMayRun = $false
$phase4PreservedSqlProcess = $null
try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw 'Windows DPAPI is required.'
    }
    $phase4AdminPath = Join-Path $env:LOCALAPPDATA 'PATHWAYS/secrets/dev-db-admin.credential.xml'
    $phase4RuntimePath = Join-Path $env:LOCALAPPDATA 'PATHWAYS/secrets/dev-db-runtime.credential.xml'
    if (Test-Path -LiteralPath $phase4RuntimePath) {
        throw 'Runtime credential file already exists; do not overwrite it.'
    }
    $phase4Admin = Import-Clixml -LiteralPath $phase4AdminPath
    if ($phase4Admin -isnot [System.Management.Automation.PSCredential] -or
        $phase4Admin.UserName -cne 'postgres.pdqwsknbzkdtiwjjibqt' -or
        $phase4Admin.Password.Length -eq 0) {
        throw 'Unexpected administrator credential.'
    }
    $phase4MigrationPath = Join-Path $PSScriptRoot '../../../apps/api/prisma/migrations/0005_supabase_security_adapter/migration.sql'
    $phase4MigrationChecksum = (Get-FileHash -LiteralPath $phase4MigrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($phase4MigrationChecksum -cne '6e942cfd46833375f5e0d4bbf4f66b84f28a90fc614472974fc309cf98610bdc') {
        throw 'Reviewed migration checksum changed.'
    }
    $phase4Guard = @'
DO $phase4_runtime_first_provision$
DECLARE runtime_row record; runtime_password_present boolean;
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'postgres' OR session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Unexpected runtime provisioning connection';
  END IF;
  IF NOT EXISTS (SELECT FROM public._prisma_migrations
      WHERE migration_name='0005_supabase_security_adapter'
        AND finished_at IS NOT NULL AND rolled_back_at IS NULL
        AND checksum='__PHASE4_MIGRATION_CHECKSUM__') THEN
    RAISE EXCEPTION 'Reviewed 0005 is not recorded completed';
  END IF;
  -- pg_roles supplies rolconfig; pg_authid does not have that column.
  -- Read only password presence from pg_authid, never a password/verifier value.
  SELECT * INTO runtime_row FROM pg_roles WHERE rolname='pathways_runtime';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The unprovisioned runtime role does not exist';
  END IF;
  SELECT rolpassword IS NOT NULL INTO runtime_password_present
    FROM pg_authid WHERE oid=runtime_row.oid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The runtime password-presence check did not find the expected role';
  END IF;
  IF runtime_row.rolcanlogin OR runtime_password_present IS DISTINCT FROM false
     OR runtime_row.rolsuper OR runtime_row.rolinherit OR runtime_row.rolcreatedb
     OR runtime_row.rolcreaterole OR runtime_row.rolreplication OR runtime_row.rolbypassrls
     OR runtime_row.rolconfig IS NOT NULL OR runtime_row.rolvaliduntil IS NOT NULL
     -- pg_roles.rolconfig covers role-wide defaults, not database-specific ones.
     OR EXISTS (SELECT FROM pg_db_role_setting WHERE setrole=runtime_row.oid)
     OR EXISTS (SELECT FROM pg_auth_members WHERE member=runtime_row.oid)
     OR EXISTS (SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass
                AND refobjid=runtime_row.oid AND deptype='o')
     OR has_database_privilege(runtime_row.oid, current_database(), 'CREATE')
     OR has_database_privilege(runtime_row.oid, current_database(), 'TEMPORARY')
     OR NOT has_database_privilege(runtime_row.oid, current_database(), 'CONNECT') THEN
    RAISE EXCEPTION 'Runtime first-provision guard failed; never overwrite an existing credential';
  END IF;
END;
$phase4_runtime_first_provision$;
'@
    $phase4Guard = $phase4Guard.Replace('__PHASE4_MIGRATION_CHECKSUM__', $phase4MigrationChecksum)
    $phase4Stage = 'READ_ONLY_PREFLIGHT'
    Invoke-Phase4ProvisionSql -Credential $phase4Admin -Sql (
        "BEGIN READ ONLY;`n" + $phase4Guard + "`nCOMMIT;`nSELECT 'PHASE4_RUNTIME_PROVISION_STEP_OK';"
    )

    $phase4Stage = 'GENERATE_AND_SAVE_DPAPI'
    $phase4Random = [Security.Cryptography.RandomNumberGenerator]::Create()
    $phase4PasswordBytes = New-Object byte[] 32
    try { $phase4Random.GetBytes($phase4PasswordBytes) } finally { $phase4Random.Dispose() }
    $phase4Password = [BitConverter]::ToString($phase4PasswordBytes).Replace('-', '').ToLowerInvariant()
    [Array]::Clear($phase4PasswordBytes, 0, $phase4PasswordBytes.Length)
    $phase4Verifier = New-Phase4ScramVerifier -Password $phase4Password
    $phase4Secure = ConvertTo-SecureString -String $phase4Password -AsPlainText -Force
    $phase4Runtime = [System.Management.Automation.PSCredential]::new(
        'pathways_runtime.pdqwsknbzkdtiwjjibqt', $phase4Secure
    )
    $phase4Runtime | Export-Clixml -LiteralPath $phase4RuntimePath -NoClobber
    $phase4Saved = $true
    # Change only the new runtime file's ACL, not the directory or admin file.
    $phase4Sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $phase4Acl = [Security.AccessControl.FileSecurity]::new()
    $phase4Acl.SetOwner($phase4Sid)
    $phase4Acl.SetAccessRuleProtection($true, $false)
    $phase4Acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
        $phase4Sid, [Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.AccessControlType]::Allow
    ))
    Set-Acl -LiteralPath $phase4RuntimePath -AclObject $phase4Acl
    $phase4StoredAcl = Get-Acl -LiteralPath $phase4RuntimePath
    $phase4Rules = @($phase4StoredAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if (-not $phase4StoredAcl.AreAccessRulesProtected -or $phase4Rules.Count -ne 1 -or
        $phase4Rules[0].IdentityReference.Value -cne $phase4Sid.Value -or
        $phase4Rules[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
        $phase4Rules[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) {
        throw 'Runtime credential ACL verification failed.'
    }
    $phase4Reloaded = Import-Clixml -LiteralPath $phase4RuntimePath
    if ($phase4Reloaded.UserName -cne $phase4Runtime.UserName -or
        $phase4Reloaded.GetNetworkCredential().Password -cne $phase4Password) {
        throw 'Runtime DPAPI round-trip verification failed.'
    }

    $phase4Stage = 'FIRST_DATABASE_PROVISION'
    # The server receives only a SCRAM verifier, never the generated plaintext
    # password. The verifier is also sensitive: do not print/log the SQL input.
    $phase4ProvisionSql = "BEGIN;`n" + $phase4Guard +
        "`nALTER ROLE pathways_runtime WITH LOGIN PASSWORD '" + $phase4Verifier + "';`n" + @'
DO $phase4_runtime_provisioned$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_authid WHERE rolname='pathways_runtime'
      AND rolcanlogin AND rolpassword LIKE 'SCRAM-SHA-256$4096:%'
      AND NOT rolsuper AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolreplication AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'Runtime credential postcondition failed';
  END IF;
END;
$phase4_runtime_provisioned$;
COMMIT;
\echo PHASE4_RUNTIME_PROVISION_COMMIT_ACK
SELECT 'PHASE4_RUNTIME_PROVISION_STEP_OK';
'@
    Invoke-Phase4ProvisionSql -Credential $phase4Admin -Sql $phase4ProvisionSql
    Write-Output 'RUNTIME_FIRST_PROVISION=PASS; DPAPI_FILE_SAVED=YES; CURRENT_USER_ONLY_ACL=YES; LOGIN_TEST_STILL_REQUIRED=YES'
    $phase4Exit = 0
} catch {
    if ($phase4OutcomeUnknown) {
        $phase4Exit = 124
        Write-Output ('RUNTIME_FIRST_PROVISION=OUTCOME_UNKNOWN; EXIT=124; STAGE=' + $phase4Stage +
            '; CHILD_PID=' + $phase4ChildPid + '; CHILD_MAY_STILL_RUN=' + $phase4ChildMayRun +
            '; SQL_EXIT=' + $phase4SqlExitCode + '; DPAPI_FILE_PRESERVED=' + $phase4Saved +
            '; DETAILS_WITHHELD=YES')
        Write-Output 'HARD STOP: preserve the client and credential evidence. Do not kill, retry, or infer a rolled-back outcome.'
    } else {
        Write-Output ('RUNTIME_FIRST_PROVISION=FAILED; STAGE=' + $phase4Stage + '; DPAPI_FILE_PRESERVED=' + $phase4Saved + '; DETAILS_WITHHELD=YES')
    }
    Write-Output 'Do not delete the credential file, reset a password, or rerun provisioning. Inspect the non-secret role state first.'
} finally {
    $phase4Admin = $null
    $phase4Runtime = $null
    $phase4Reloaded = $null
    $phase4Password = $null
    $phase4Secure = $null
    $phase4Verifier = $null
    $phase4ProvisionSql = $null
}
exit $phase4Exit
