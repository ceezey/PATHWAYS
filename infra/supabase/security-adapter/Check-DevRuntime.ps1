# Phase 4 actual-login verification only. No Auth/Storage writes, business data,
# credential provisioning, privilege changes, or migration commands occur here.
# Negative DDL probes run in transactions that always roll back. Unexpected DDL
# success raises an exception before any commit; ON_ERROR_STOP closes the client.
# The external orchestrator must immediately restore TEMP ACLs on a regression.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Invoke-Phase4RuntimeCheckSql {
    param(
        [Parameter(Mandatory)][System.Management.Automation.PSCredential]$Credential,
        [Parameter(Mandatory)][string]$Sql,
        [Parameter(Mandatory)][string]$ExpectedMarker
    )

    $phase4Info = [Diagnostics.ProcessStartInfo]::new()
    $phase4Info.FileName = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
    $phase4Info.Arguments = '-X -w -q -A -t -h aws-1-ap-southeast-2.pooler.supabase.com -p 5432 -U pathways_runtime.pdqwsknbzkdtiwjjibqt -d postgres -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate'
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
    try {
        $phase4Process = [Diagnostics.Process]::Start($phase4Info)
        $phase4Info.EnvironmentVariables.Remove('PGPASSWORD')
        $phase4Out = $phase4Process.StandardOutput.ReadToEndAsync()
        $phase4Err = $phase4Process.StandardError.ReadToEndAsync()
        $phase4Process.StandardInput.Write($Sql)
        $phase4Process.StandardInput.Close()
        if (-not $phase4Process.WaitForExit(45000)) {
            $phase4Process.Kill()
            throw 'Runtime check timed out; inspect before proceeding.'
        }
        $phase4Output = $phase4Out.Result
        $phase4Error = $phase4Err.Result
        if ($phase4Process.ExitCode -ne 0) {
            $phase4Codes = @([regex]::Matches($phase4Error, '(?m)(?:ERROR|FATAL):\s+([0-9A-Z]{5})') |
                ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
            Write-Output ('RUNTIME_SQL_CHECK=FAILED; EXIT=' + $phase4Process.ExitCode + '; CODES=' + ($phase4Codes -join ','))
            throw 'Runtime SQL check failed; raw output withheld.'
        }
        if ($phase4Output.Trim() -cne $ExpectedMarker) {
            throw 'Runtime check returned an unexpected result; raw output withheld.'
        }
        Write-Output $ExpectedMarker
    } finally {
        $phase4Info.EnvironmentVariables.Remove('PGPASSWORD')
        if ($null -ne $phase4Process) { $phase4Process.Dispose() }
    }
}

$phase4Stage = 'READ_CREDENTIAL'
$phase4Exit = 1
try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw 'Windows DPAPI is required.'
    }
    $phase4CredentialPath = Join-Path $env:LOCALAPPDATA 'PATHWAYS/secrets/dev-db-runtime.credential.xml'
    $phase4Credential = Import-Clixml -LiteralPath $phase4CredentialPath
    if ($phase4Credential -isnot [System.Management.Automation.PSCredential] -or
        $phase4Credential.UserName -cne 'pathways_runtime.pdqwsknbzkdtiwjjibqt' -or
        $phase4Credential.Password.Length -eq 0) {
        throw 'Unexpected runtime credential identity.'
    }
    $phase4Sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $phase4Acl = Get-Acl -LiteralPath $phase4CredentialPath
    $phase4Rules = @($phase4Acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if (-not $phase4Acl.AreAccessRulesProtected -or $phase4Rules.Count -ne 1 -or
        $phase4Rules[0].IdentityReference.Value -cne $phase4Sid.Value -or
        $phase4Rules[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
        $phase4Rules[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) {
        throw 'Runtime credential is not protected by the reviewed current-user-only ACL.'
    }
    $phase4Stage = 'READ_ONLY_LOGIN_CONTEXT_CHECK'
    $phase4ReadSql = @'
BEGIN READ ONLY;
SET LOCAL app.organization_id = '';
SET LOCAL app.user_id = '';
DO $phase4_runtime_read$
DECLARE runtime_row record;
BEGIN
  IF current_database() <> 'postgres'
     OR current_user <> 'pathways_runtime' OR session_user <> 'pathways_runtime' THEN
    RAISE EXCEPTION 'Unexpected actual runtime connection';
  END IF;
  SELECT * INTO runtime_row FROM pg_roles WHERE rolname=current_user;
  IF NOT runtime_row.rolcanlogin OR runtime_row.rolsuper OR runtime_row.rolinherit
     OR runtime_row.rolcreatedb OR runtime_row.rolcreaterole OR runtime_row.rolreplication
     OR runtime_row.rolbypassrls
     OR EXISTS (SELECT FROM pg_auth_members WHERE member=runtime_row.oid)
     OR has_database_privilege(current_user,current_database(),'CREATE')
     OR has_database_privilege(current_user,current_database(),'TEMPORARY')
     OR NOT has_database_privilege(current_user,current_database(),'CONNECT')
     OR has_schema_privilege(current_user,'pathways','CREATE')
     OR has_schema_privilege(current_user,'public','CREATE') THEN
    RAISE EXCEPTION 'Runtime role privilege check failed';
  END IF;
  IF pathways.runtime_context_organization() IS NOT NULL
     OR pathways.runtime_context_user() IS NOT NULL
     OR EXISTS (SELECT FROM pathways.organizations)
     OR EXISTS (SELECT FROM pathways.system_users)
     OR EXISTS (SELECT FROM pathways.projects) THEN
    RAISE EXCEPTION 'Runtime missing-context check did not fail closed';
  END IF;
  PERFORM set_config('app.organization_id','invalid-context',true);
  PERFORM set_config('app.user_id','invalid-context',true);
  IF pathways.runtime_context_organization() IS NOT NULL
     OR pathways.runtime_context_user() IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime invalid-context check did not fail closed';
  END IF;
END;
$phase4_runtime_read$;
COMMIT;
SELECT 'RUNTIME_READ_ONLY_LOGIN_AND_CONTEXT=PASS';
'@
    Invoke-Phase4RuntimeCheckSql -Credential $phase4Credential -Sql $phase4ReadSql `
        -ExpectedMarker 'RUNTIME_READ_ONLY_LOGIN_AND_CONTEXT=PASS'

    $phase4Stage = 'NEGATIVE_SECURITY_CHECKS'
    $phase4NegativeSql = @'
BEGIN;
DO $phase4_runtime_negative$
DECLARE probe text; denied boolean;
BEGIN
  IF current_database() <> 'postgres'
     OR current_user <> 'pathways_runtime' OR session_user <> 'pathways_runtime' THEN
    RAISE EXCEPTION 'Unexpected runtime negative-test connection';
  END IF;
  FOREACH probe IN ARRAY ARRAY[
    'CREATE TEMP TABLE phase4_runtime_temp_denied (id integer) ON COMMIT DROP',
    'CREATE SCHEMA phase4_runtime_schema_denied',
    'CREATE TABLE pathways.phase4_runtime_table_denied (id integer)',
    'CREATE TABLE public.phase4_runtime_public_denied (id integer)',
    'SET LOCAL ROLE prisma',
    'SET LOCAL ROLE postgres',
    'SELECT 1 FROM auth.users LIMIT 1',
    'SELECT 1 FROM storage.objects LIMIT 1',
    'SELECT 1 FROM public._prisma_migrations LIMIT 1'
  ] LOOP
    denied := false;
    BEGIN
      EXECUTE probe;
    EXCEPTION WHEN insufficient_privilege THEN
      denied := true;
    END;
    IF NOT denied THEN
      -- Any unexpectedly successful DDL is rolled back by this exception and
      -- ON_ERROR_STOP. Do not catch this exception or commit this transaction.
      RAISE EXCEPTION 'Runtime negative security probe unexpectedly succeeded';
    END IF;
  END LOOP;
END;
$phase4_runtime_negative$;
ROLLBACK;
SELECT 'RUNTIME_NEGATIVE_SECURITY_PROBES_9=PASS';
'@
    Invoke-Phase4RuntimeCheckSql -Credential $phase4Credential -Sql $phase4NegativeSql `
        -ExpectedMarker 'RUNTIME_NEGATIVE_SECURITY_PROBES_9=PASS'
    Write-Output 'RUNTIME_CONNECTION_SECURITY_CHECK=PASS; MUTATIONS_COMMITTED=NO'
    $phase4Exit = 0
} catch {
    Write-Output ('RUNTIME_CONNECTION_SECURITY_CHECK=FAILED; STAGE=' + $phase4Stage + '; DETAILS_WITHHELD=YES')
} finally {
    $phase4Credential = $null
}
exit $phase4Exit
