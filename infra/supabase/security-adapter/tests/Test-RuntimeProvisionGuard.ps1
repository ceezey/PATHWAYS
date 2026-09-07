# Local PostgreSQL regression tests for the exact inline provisioning guard.
# This file never runs provisioning, generates a live credential, reads a DPAPI
# file, or executes a migration command. Host is fixed to loopback and database
# names must unmistakably identify disposable Phase 4 test databases.
# Every negative fixture is transaction-scoped and rolled back on disconnect.
[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)][int]$Port = 55439,
    [ValidatePattern('^pathways_phase4_[a-z0-9_]+$')]
    [string]$Database = 'pathways_phase4_replay'
)

$ErrorActionPreference = 'Stop'
$phase4ExpectedChecksum = '6e942cfd46833375f5e0d4bbf4f66b84f28a90fc614472974fc309cf98610bdc'

function Invoke-Phase4LocalGuardSql {
    param([Parameter(Mandatory)][string]$Sql)

    $phase4Info = [Diagnostics.ProcessStartInfo]::new()
    $phase4Info.FileName = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
    $phase4Info.Arguments = "-X -w -q -A -t -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -v VERBOSITY=verbose"
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
    $phase4Info.EnvironmentVariables['PGSSLMODE'] = 'disable'
    $phase4Info.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '5'
    $phase4Info.EnvironmentVariables['PGOPTIONS'] = '-c statement_timeout=10000 -c lock_timeout=3000'
    $phase4Process = $null
    try {
        $phase4Process = [Diagnostics.Process]::Start($phase4Info)
        $phase4Out = $phase4Process.StandardOutput.ReadToEndAsync()
        $phase4Err = $phase4Process.StandardError.ReadToEndAsync()
        $phase4Process.StandardInput.Write($Sql)
        $phase4Process.StandardInput.Close()
        if (-not $phase4Process.WaitForExit(20000)) {
            $phase4Process.Kill()
            $phase4Process.WaitForExit()
            throw 'Local guard test timed out; client closed to roll back its fixture.'
        }
        return [pscustomobject]@{
            ExitCode = $phase4Process.ExitCode
            Output = $phase4Out.Result.Trim()
            ErrorOutput = $phase4Err.Result
        }
    } finally {
        if ($null -ne $phase4Process) { $phase4Process.Dispose() }
    }
}

$phase4ProvisionPath = Join-Path $PSScriptRoot '../Provision-DevRuntime.ps1'
$phase4MigrationPath = Join-Path $PSScriptRoot '../../../../apps/api/prisma/migrations/0005_supabase_security_adapter/migration.sql'
if ((Get-FileHash -LiteralPath $phase4MigrationPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $phase4ExpectedChecksum) {
    throw 'Reviewed 0005 checksum changed; no tests executed.'
}

# Read the constant here-string from the PowerShell AST. Do not dot-source the
# provisioning script: that would execute its credential and database actions.
$phase4Tokens = $null
$phase4ParseErrors = $null
$phase4Ast = [Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path -LiteralPath $phase4ProvisionPath).Path,
    [ref]$phase4Tokens, [ref]$phase4ParseErrors
)
if (@($phase4ParseErrors).Count -ne 0) { throw 'Provisioning script does not parse.' }

# Exercise the actual pure outcome classifier without starting any process or
# touching credentials. Timeout/network/commit uncertainty must never become a
# contained SQL failure; the caller must preserve evidence and exit 124.
$phase4OutcomeFunctions = @($phase4Ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'Get-Phase4ProvisionSqlOutcome'
}, $true))
if ($phase4OutcomeFunctions.Count -ne 1) { throw 'Provisioning outcome classifier is unavailable.' }
. ([scriptblock]::Create($phase4OutcomeFunctions[0].Extent.Text))
$phase4CommitAck = 'PHASE4_RUNTIME_PROVISION_COMMIT_ACK'
$phase4StepOk = 'PHASE4_RUNTIME_PROVISION_STEP_OK'
$phase4OutcomeCases = @(
    @{ Name='TIMEOUT'; Stage='FIRST_DATABASE_PROVISION'; Exited=$false; ExitCode=-1; Output=''; ErrorOutput=''; Expected='OUTCOME_UNKNOWN' },
    @{ Name='READ_ONLY_TIMEOUT'; Stage='READ_ONLY_PREFLIGHT'; Exited=$false; ExitCode=-1; Output=''; ErrorOutput=''; Expected='OUTCOME_UNKNOWN' },
    @{ Name='GUARD_ERROR'; Stage='FIRST_DATABASE_PROVISION'; Exited=$true; ExitCode=3; Output=''; ErrorOutput='ERROR:  P0001'; Expected='CONFIRMED_SQL_FAILURE' },
    @{ Name='CATALOG_ERROR'; Stage='READ_ONLY_PREFLIGHT'; Exited=$true; ExitCode=3; Output=''; ErrorOutput='ERROR:  42703'; Expected='CONFIRMED_SQL_FAILURE' },
    @{ Name='SCRIPT_ERROR_WITHOUT_SQLSTATE'; Stage='FIRST_DATABASE_PROVISION'; Exited=$true; ExitCode=3; Output=''; ErrorOutput=''; Expected='OUTCOME_UNKNOWN' },
    @{ Name='NETWORK_ERROR'; Stage='FIRST_DATABASE_PROVISION'; Exited=$true; ExitCode=2; Output=''; ErrorOutput='FATAL:  08006'; Expected='OUTCOME_UNKNOWN' },
    @{ Name='PSQL_FATAL_ERROR'; Stage='FIRST_DATABASE_PROVISION'; Exited=$true; ExitCode=1; Output=''; ErrorOutput=''; Expected='OUTCOME_UNKNOWN' },
    @{ Name='MISSING_MARKER'; Stage='FIRST_DATABASE_PROVISION'; Exited=$true; ExitCode=0; Output=''; ErrorOutput=''; Expected='OUTCOME_UNKNOWN' },
    @{ Name='COMMIT_ACK_ONLY'; Stage='FIRST_DATABASE_PROVISION'; Exited=$true; ExitCode=0; Output=$phase4CommitAck; ErrorOutput=''; Expected='OUTCOME_UNKNOWN' },
    @{ Name='POST_COMMIT_ERROR'; Stage='FIRST_DATABASE_PROVISION'; Exited=$true; ExitCode=3; Output=$phase4CommitAck; ErrorOutput='ERROR:  57014'; Expected='OUTCOME_UNKNOWN' },
    @{ Name='COMPLETE_COMMIT_EVIDENCE'; Stage='FIRST_DATABASE_PROVISION'; Exited=$true; ExitCode=0; Output=($phase4CommitAck + "`r`n" + $phase4StepOk); ErrorOutput=''; Expected='PASS' },
    @{ Name='READ_ONLY_SUCCESS'; Stage='READ_ONLY_PREFLIGHT'; Exited=$true; ExitCode=0; Output=$phase4StepOk; ErrorOutput=''; Expected='PASS' },
    @{ Name='READ_ONLY_NETWORK_FAILURE'; Stage='READ_ONLY_PREFLIGHT'; Exited=$true; ExitCode=2; Output=''; ErrorOutput='FATAL:  08006'; Expected='READ_ONLY_FAILURE' },
    @{ Name='OLD_MARKER_WITHOUT_COMMIT_ACK'; Stage='FIRST_DATABASE_PROVISION'; Exited=$true; ExitCode=0; Output=$phase4StepOk; ErrorOutput=''; Expected='OUTCOME_UNKNOWN' },
    @{ Name='CONNECTION_SQLSTATE'; Stage='FIRST_DATABASE_PROVISION'; Exited=$true; ExitCode=3; Output=''; ErrorOutput='ERROR:  08007'; Expected='OUTCOME_UNKNOWN' },
    @{ Name='UNKNOWN_COMPLETION_SQLSTATE'; Stage='FIRST_DATABASE_PROVISION'; Exited=$true; ExitCode=3; Output=''; ErrorOutput='ERROR:  40003'; Expected='OUTCOME_UNKNOWN' }
)
foreach ($phase4OutcomeCase in $phase4OutcomeCases) {
    $phase4Outcome = Get-Phase4ProvisionSqlOutcome -Stage $phase4OutcomeCase.Stage `
        -Exited $phase4OutcomeCase.Exited -ExitCode $phase4OutcomeCase.ExitCode `
        -Output $phase4OutcomeCase.Output -ErrorOutput $phase4OutcomeCase.ErrorOutput
    if ($phase4Outcome.Outcome -cne $phase4OutcomeCase.Expected) {
        throw ('Provisioning outcome classification failed: ' + $phase4OutcomeCase.Name)
    }
}
$phase4KillCalls = @($phase4Ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.InvokeMemberExpressionAst] -and
    $node.Member -is [Management.Automation.Language.StringConstantExpressionAst] -and
    $node.Member.Value -eq 'Kill'
}, $true))
if ($phase4KillCalls.Count -ne 0) { throw 'Provisioning must not kill an uncertain client.' }
Write-Output ('LOCAL_RUNTIME_PROVISION_OUTCOME_TESTS=PASS; CASES=' + $phase4OutcomeCases.Count + '; PROVISION_KILL_CALLS=0')

$phase4Guards = @($phase4Ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.AssignmentStatementAst] -and
    $node.Left -is [Management.Automation.Language.VariableExpressionAst] -and
    $node.Left.VariablePath.UserPath -eq 'phase4Guard' -and
    $node.Right -is [Management.Automation.Language.CommandExpressionAst] -and
    $node.Right.Expression -is [Management.Automation.Language.StringConstantExpressionAst]
}, $true))
if ($phase4Guards.Count -ne 1) { throw 'Expected exactly one literal production guard.' }
$phase4Guard = $phase4Guards[0].Right.Expression.Value
$phase4ProductionNameCheck = "current_database() <> 'postgres'"
if ([regex]::Matches($phase4Guard, [regex]::Escape($phase4ProductionNameCheck)).Count -ne 1 -or
    [regex]::Matches($phase4Guard, '__PHASE4_MIGRATION_CHECKSUM__').Count -ne 1) {
    throw 'Unexpected guard shape; refuse to change or bypass its predicates.'
}
# Only the target database literal is adapted for this isolated local fixture.
# All role, password-presence, configuration, ledger and privilege checks are
# extracted unchanged from the production guard. The checksum is the same pin.
$phase4Guard = $phase4Guard.Replace($phase4ProductionNameCheck, "current_database() <> '$Database'")
$phase4Guard = $phase4Guard.Replace('__PHASE4_MIGRATION_CHECKSUM__', $phase4ExpectedChecksum)

$phase4ConnectionGuard = @"
DO __PHASE4_LOCAL_QUOTE__
BEGIN
  IF current_database() <> '$Database' OR current_user <> 'postgres'
     OR session_user <> 'postgres' OR inet_server_addr() <> inet '127.0.0.1'
     OR inet_server_port() <> $Port THEN
    RAISE EXCEPTION 'Local guard test target mismatch';
  END IF;
END;
__PHASE4_LOCAL_QUOTE__;
"@
# Insert a literal dollar-quote marker after PowerShell expands only the
# validated local database name and numeric port.
$phase4ConnectionGuard = $phase4ConnectionGuard.Replace('__PHASE4_LOCAL_QUOTE__', '$local_target$')

$phase4SnapshotSql = @'
SELECT md5(jsonb_build_object(
  'runtime', (SELECT to_jsonb(role_row)-'rolpassword' FROM pg_roles role_row
               WHERE rolname='pathways_runtime'),
  'password_present', (SELECT rolpassword IS NOT NULL FROM pg_authid
                        WHERE rolname='pathways_runtime'),
  'database_acl', (SELECT datacl::text FROM pg_database WHERE datname=current_database()),
  'memberships', (SELECT jsonb_agg(to_jsonb(membership) ORDER BY membership.roleid,
                                  membership.member,membership.grantor)
                   FROM pg_auth_members membership
                  WHERE member='pathways_runtime'::regrole OR roleid='pathways_runtime'::regrole),
  'settings', (SELECT jsonb_agg(to_jsonb(setting_row) ORDER BY setdatabase,setrole)
                FROM pg_db_role_setting setting_row WHERE setrole='pathways_runtime'::regrole),
  'ownership', (SELECT jsonb_agg(to_jsonb(dependency) ORDER BY dbid,classid,objid,objsubid)
                 FROM pg_shdepend dependency
                WHERE refclassid='pg_authid'::regclass
                  AND refobjid='pathways_runtime'::regrole AND deptype='o'),
  'fixture_schemas', (SELECT count(*) FROM pg_namespace
                      WHERE nspname LIKE 'phase4_provision_guard_owned_%')
)::text);
'@

$phase4Baseline = Invoke-Phase4LocalGuardSql -Sql ($phase4ConnectionGuard + "`nBEGIN READ ONLY;`n" + $phase4SnapshotSql + "`nCOMMIT;")
if ($phase4Baseline.ExitCode -ne 0 -or $phase4Baseline.Output -notmatch '^[a-f0-9]{32}$') {
    throw 'Local guard baseline failed; raw SQL output withheld.'
}
$phase4Eligible = Invoke-Phase4LocalGuardSql -Sql ($phase4ConnectionGuard + "`nBEGIN READ ONLY;`n" + $phase4Guard + "`nCOMMIT;`nSELECT 'ELIGIBLE_GUARD_PASS';")
if ($phase4Eligible.ExitCode -ne 0 -or $phase4Eligible.Output -cne 'ELIGIBLE_GUARD_PASS') {
    throw 'Eligible local guard failed; raw SQL output withheld.'
}
Write-Output 'LOCAL_RUNTIME_GUARD_ELIGIBLE=PASS'

# Extract only the pure crypto helper to produce an ephemeral, never-printed
# fixture verifier. No live credential is loaded, generated or assigned.
$phase4CryptoFunctions = @($phase4Ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'New-Phase4ScramVerifier'
}, $true))
if ($phase4CryptoFunctions.Count -ne 1) { throw 'SCRAM fixture helper is unavailable.' }
. ([scriptblock]::Create($phase4CryptoFunctions[0].Extent.Text))
$phase4FixtureVerifier = New-Phase4ScramVerifier -Password ('a' * 64)
$phase4OwnedSchema = 'phase4_provision_guard_owned_' + [Guid]::NewGuid().ToString('N')
$phase4Cases = @(
    @{ Name = 'EXISTING_PASSWORD'; Fixture = "ALTER ROLE pathways_runtime PASSWORD '$phase4FixtureVerifier';" },
    @{ Name = 'LOGIN_ENABLED'; Fixture = 'ALTER ROLE pathways_runtime LOGIN;' },
    @{ Name = 'GLOBAL_ROLE_SETTING'; Fixture = "ALTER ROLE pathways_runtime SET statement_timeout = '1s';" },
    @{ Name = 'DATABASE_ROLE_SETTING'; Fixture = "ALTER ROLE pathways_runtime IN DATABASE $Database SET statement_timeout = '1s';" },
    @{ Name = 'MEMBERSHIP'; Fixture = 'GRANT prisma TO pathways_runtime;' },
    @{ Name = 'OWNERSHIP'; Fixture = "CREATE SCHEMA $phase4OwnedSchema AUTHORIZATION pathways_runtime;" },
    @{ Name = 'TEMPORARY'; Fixture = "GRANT TEMPORARY ON DATABASE $Database TO pathways_runtime;" },
    @{ Name = 'CREATE'; Fixture = "GRANT CREATE ON DATABASE $Database TO pathways_runtime;" },
    @{ Name = 'CONNECT_ABSENT'; Fixture = "REVOKE CONNECT ON DATABASE $Database FROM PUBLIC; REVOKE CONNECT ON DATABASE $Database FROM pathways_runtime;" },
    @{ Name = 'SUPERUSER'; Fixture = 'ALTER ROLE pathways_runtime SUPERUSER;' },
    @{ Name = 'INHERIT'; Fixture = 'ALTER ROLE pathways_runtime INHERIT;' },
    @{ Name = 'CREATEDB'; Fixture = 'ALTER ROLE pathways_runtime CREATEDB;' },
    @{ Name = 'CREATEROLE'; Fixture = 'ALTER ROLE pathways_runtime CREATEROLE;' },
    @{ Name = 'REPLICATION'; Fixture = 'ALTER ROLE pathways_runtime REPLICATION;' },
    @{ Name = 'BYPASSRLS'; Fixture = 'ALTER ROLE pathways_runtime BYPASSRLS;' },
    @{ Name = 'VALID_UNTIL'; Fixture = "ALTER ROLE pathways_runtime VALID UNTIL '2099-01-01 00:00:00+00';" }
)

foreach ($phase4Case in $phase4Cases) {
    $phase4ProbeSql = $phase4ConnectionGuard + "`nBEGIN;`n" + $phase4Case.Fixture + "`n" + $phase4Guard + "`nROLLBACK;"
    $phase4Probe = Invoke-Phase4LocalGuardSql -Sql $phase4ProbeSql
    # Match both SQLSTATE and our exact guard message. A fixture syntax error,
    # missing catalog column, or permission error must never count as a PASS.
    if ($phase4Probe.ExitCode -eq 0 -or
        $phase4Probe.ErrorOutput -notmatch 'P0001: Runtime first-provision guard failed; never overwrite an existing credential') {
        throw ('Expected local guard rejection not observed: ' + $phase4Case.Name + '; raw SQL output withheld.')
    }
    $phase4Restored = Invoke-Phase4LocalGuardSql -Sql ($phase4ConnectionGuard + "`nBEGIN READ ONLY;`n" + $phase4SnapshotSql + "`nCOMMIT;")
    if ($phase4Restored.ExitCode -ne 0 -or $phase4Restored.Output -cne $phase4Baseline.Output) {
        throw ('Local fixture state was not restored: ' + $phase4Case.Name)
    }
    Write-Output ('LOCAL_RUNTIME_GUARD_' + $phase4Case.Name + '=REJECTED; SQLSTATE=P0001; FIXTURE_ROLLBACK=PASS')
}

$phase4Final = Invoke-Phase4LocalGuardSql -Sql ($phase4ConnectionGuard + "`nBEGIN READ ONLY;`n" + $phase4Guard + "`nCOMMIT;`nSELECT 'ELIGIBLE_GUARD_PASS';")
if ($phase4Final.ExitCode -ne 0 -or $phase4Final.Output -cne 'ELIGIBLE_GUARD_PASS') {
    throw 'Final eligible local guard recheck failed; raw SQL output withheld.'
}
$phase4FixtureVerifier = $null
$phase4CaseCount = 2 + $phase4Cases.Count
$phase4Cases = $null
Write-Output ('LOCAL_RUNTIME_PROVISION_GUARD_TESTS=PASS; CASES=' + $phase4CaseCount + '; COMMITTED_MUTATIONS=NO')
