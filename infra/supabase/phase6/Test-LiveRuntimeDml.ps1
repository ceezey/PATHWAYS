# Phase 6 hosted-dev runtime DML smoke test. This uses the existing protected
# runtime credential, targets only PATHWAYS-dev through the approved Session
# Pooler, and always rolls its single audit-log insert back.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$phase6Process = $null
$phase6Credential = $null
$phase6Info = $null
$phase6Exit = 1

try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw 'Windows DPAPI is required.'
    }

    $phase6CredentialPath = Join-Path $env:LOCALAPPDATA 'PATHWAYS/secrets/dev-db-runtime.credential.xml'
    $phase6Credential = Import-Clixml -LiteralPath $phase6CredentialPath
    if ($phase6Credential -isnot [System.Management.Automation.PSCredential] -or
        $phase6Credential.UserName -cne 'pathways_runtime.pdqwsknbzkdtiwjjibqt' -or
        $phase6Credential.Password.Length -eq 0) {
        throw 'Unexpected protected runtime credential.'
    }

    $phase6Sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $phase6Acl = Get-Acl -LiteralPath $phase6CredentialPath
    $phase6Rules = @($phase6Acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if (-not $phase6Acl.AreAccessRulesProtected -or $phase6Rules.Count -ne 1 -or
        $phase6Acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $phase6Sid.Value -or
        $phase6Rules[0].IdentityReference.Value -cne $phase6Sid.Value -or
        $phase6Rules[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
        $phase6Rules[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) {
        throw 'Runtime credential ACL is not the reviewed current-user-only ACL.'
    }

    $phase6ProbeTag = 'P6_RUNTIME_ROLLBACK_' + [Guid]::NewGuid().ToString('N')
    $phase6Sql = @'
\set ON_ERROR_STOP on
SELECT (current_database()='postgres'
  AND current_user='pathways_runtime'
  AND session_user='pathways_runtime'
  AND NOT has_database_privilege(current_user,current_database(),'CREATE')
  AND NOT has_database_privilege(current_user,current_database(),'TEMPORARY')
  AND NOT has_schema_privilege(current_user,'pathways','CREATE')) AS target_safe \gset
\if :target_safe
\else
  \quit 3
\endif

BEGIN;
SET LOCAL "request.jwt.claim.sub" = '56ad4c1a-113f-401b-84e8-1d2135f174c1';
SET LOCAL "app.organization_id" = '7541cfc6-541d-4057-9229-03d89d361d34';
SET LOCAL "app.user_id" = 'de2013ab-4bb8-47b5-a7a3-0f89705e1442';
WITH inserted AS (
  INSERT INTO pathways.audit_logs
    (organization_id,actor_user_id,action,entity_type,entity_id,changes)
  VALUES
    ('7541cfc6-541d-4057-9229-03d89d361d34',
     'de2013ab-4bb8-47b5-a7a3-0f89705e1442',
     :'probe_tag','phase6_verification',:'probe_tag','{}'::jsonb)
  RETURNING id
)
SELECT count(*)::integer AS inserted_count FROM inserted \gset
SELECT (1 / CASE WHEN :inserted_count::integer=1 THEN 1 ELSE 0 END) AS insert_assertion \gset
ROLLBACK;

BEGIN READ ONLY;
SET LOCAL "request.jwt.claim.sub" = '56ad4c1a-113f-401b-84e8-1d2135f174c1';
SET LOCAL "app.organization_id" = '7541cfc6-541d-4057-9229-03d89d361d34';
SET LOCAL "app.user_id" = 'de2013ab-4bb8-47b5-a7a3-0f89705e1442';
SELECT CASE WHEN count(*)=0
  THEN 'RUNTIME_POSITIVE_DML_ROLLBACK=PASS'
  ELSE 'RUNTIME_POSITIVE_DML_ROLLBACK=FAILED'
END
FROM pathways.audit_logs
WHERE action=:'probe_tag';
COMMIT;
'@

    $phase6Info = [Diagnostics.ProcessStartInfo]::new()
    $phase6Info.FileName = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
    $phase6Info.Arguments = '-X -w -q -A -t -h aws-1-ap-southeast-2.pooler.supabase.com -p 5432 -U pathways_runtime.pdqwsknbzkdtiwjjibqt -d postgres -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v probe_tag=' + $phase6ProbeTag
    $phase6Info.UseShellExecute = $false
    $phase6Info.CreateNoWindow = $true
    $phase6Info.RedirectStandardInput = $true
    $phase6Info.RedirectStandardOutput = $true
    $phase6Info.RedirectStandardError = $true
    foreach ($phase6Name in @($phase6Info.EnvironmentVariables.Keys)) {
        if ($phase6Name -match '^(PG|DATABASE_URL$|DIRECT_URL$|SHADOW_DATABASE_URL$|SUPABASE_)') {
            $phase6Info.EnvironmentVariables.Remove($phase6Name)
        }
    }
    $phase6Info.EnvironmentVariables['PGPASSWORD'] = $phase6Credential.GetNetworkCredential().Password
    $phase6Info.EnvironmentVariables['PGSSLMODE'] = 'require'
    $phase6Info.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '15'
    $phase6Info.EnvironmentVariables['PGOPTIONS'] = '-c statement_timeout=20000 -c lock_timeout=5000'

    $phase6Process = [Diagnostics.Process]::Start($phase6Info)
    $phase6Info.EnvironmentVariables.Remove('PGPASSWORD')
    $phase6Credential = $null
    $phase6OutputTask = $phase6Process.StandardOutput.ReadToEndAsync()
    $phase6ErrorTask = $phase6Process.StandardError.ReadToEndAsync()
    $phase6Process.StandardInput.Write($phase6Sql)
    $phase6Process.StandardInput.Close()
    if (-not $phase6Process.WaitForExit(45000)) {
        $phase6Process.Kill()
        throw 'Runtime DML test timed out.'
    }

    $phase6Output = $phase6OutputTask.Result.Trim()
    $phase6Error = $phase6ErrorTask.Result
    if ($phase6Process.ExitCode -ne 0) {
        $phase6Codes = @([regex]::Matches($phase6Error, '(?m)(?:ERROR|FATAL):\s+([0-9A-Z]{5})') |
            ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
        Write-Output ('RUNTIME_POSITIVE_DML_ROLLBACK=FAILED; EXIT=' + $phase6Process.ExitCode +
            '; CODES=' + ($phase6Codes -join ','))
        throw 'Runtime DML test failed; raw output withheld.'
    }
    if ($phase6Output -cne 'RUNTIME_POSITIVE_DML_ROLLBACK=PASS') {
        throw 'Runtime DML test returned an unexpected result; raw output withheld.'
    }
    Write-Output $phase6Output
    Write-Output 'RUNTIME_DML_MUTATIONS_COMMITTED=NO'
    $phase6Exit = 0
} catch {
    if ($phase6Exit -ne 0) {
        Write-Output 'RUNTIME_POSITIVE_DML_CHECK=FAILED; DETAILS_WITHHELD=YES'
    }
} finally {
    if ($null -ne $phase6Info) { $phase6Info.EnvironmentVariables.Remove('PGPASSWORD') }
    $phase6Credential = $null
    if ($null -ne $phase6Process) { $phase6Process.Dispose() }
}
exit $phase6Exit
