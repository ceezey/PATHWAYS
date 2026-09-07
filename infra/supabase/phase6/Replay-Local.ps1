# Fresh synthetic loopback replay only. No hosted URL, credential or env file is read.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$phase6Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$phase6Bin = 'C:\Program Files\PostgreSQL\18\bin'
$phase6Parent = Join-Path $phase6Root ('.tmp/pathways-phase6-' + [guid]::NewGuid().ToString('N'))
$phase6Data = Join-Path $phase6Parent 'data'
$phase6Stage = Join-Path $phase6Parent 'migrations'
$phase6Config = Join-Path $PSScriptRoot 'prisma.replay.config.ts'
$phase6Database = 'pathways_phase4_phase6_replay'
$phase6Port = 55448
$phase6Exit = 1
$phase6Started = $false
$phase6PreviousEnvironment = @{}
foreach ($phase6EnvironmentName in @('PATHWAYS_PHASE6_REPLAY_MIGRATIONS','DIRECT_URL','DATABASE_URL')) {
  $phase6EnvironmentItem = Get-Item -LiteralPath "Env:$phase6EnvironmentName" -ErrorAction SilentlyContinue
  $phase6PreviousEnvironment[$phase6EnvironmentName] = if ($null -eq $phase6EnvironmentItem) {
    @{ Present = $false; Value = $null }
  } else {
    @{ Present = $true; Value = $phase6EnvironmentItem.Value }
  }
}

function Invoke-LocalSql([string]$Sql, [string]$Database, [string]$Role = 'postgres') {
  $Sql | & "$phase6Bin\psql.exe" -X -w -q -h 127.0.0.1 -p $phase6Port -U $Role -d $Database -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw "Disposable local SQL failed for $Database." }
}

function Invoke-ExpectedFailure([string]$Database) {
  $phase6FailureLog = Join-Path $phase6Parent ($Database + '.expected-error.log')
  $phase6PreviousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & "$phase6Bin\psql.exe" -X -w -q -h 127.0.0.1 -p $phase6Port -U prisma -d $Database `
    -v ON_ERROR_STOP=1 -f (Join-Path $phase6Root 'apps/api/prisma/migrations/0006_retire_legacy_public_application_tables/migration.sql') `
    2> $phase6FailureLog
  $phase6ExpectedExit = $LASTEXITCODE
  $ErrorActionPreference = $phase6PreviousPreference
  if ($phase6ExpectedExit -eq 0) { throw "Expected 0006 failure was accepted for $Database." }
  $phase6StillPresent = @'
SELECT count(*)=15 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'_prisma_migrations';
'@ | & "$phase6Bin\psql.exe" -X -w -q -A -t -h 127.0.0.1 -p $phase6Port -U postgres -d $Database -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0 -or $phase6StillPresent.Trim() -cne 't') {
    throw "Expected-failure transaction was not atomic for $Database."
  }
}

try {
  $phase6Listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $phase6Port)
  try { $phase6Listener.Start() } finally { $phase6Listener.Stop() }
  New-Item -ItemType Directory -Path $phase6Stage -Force | Out-Null
  & "$phase6Bin\initdb.exe" -D $phase6Data -U postgres -A trust --encoding=UTF8 --locale=C | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Disposable cluster creation failed.' }
  Add-Content -LiteralPath (Join-Path $phase6Data 'postgresql.conf') -Value "`nlisten_addresses='127.0.0.1'`nport=$phase6Port`n"
  $phase6Start = Start-Process -FilePath "$phase6Bin\pg_ctl.exe" `
    -ArgumentList @('-D',$phase6Data,'-l',(Join-Path $phase6Parent 'postgres.log'),'-s','start') `
    -PassThru -WindowStyle Hidden
  $phase6StartDeadline = [DateTime]::UtcNow.AddSeconds(15)
  do {
    & "$phase6Bin\pg_isready.exe" -q -h 127.0.0.1 -p $phase6Port
    if ($LASTEXITCODE -eq 0) { break }
    if ($phase6Start.HasExited -and $phase6Start.ExitCode -ne 0) {
      throw 'Disposable cluster start failed.'
    }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $phase6StartDeadline)
  if ($LASTEXITCODE -ne 0) { throw 'Disposable cluster readiness timed out.' }
  $phase6Started = $true
  & "$phase6Bin\createdb.exe" -w -h 127.0.0.1 -p $phase6Port -U postgres $phase6Database
  if ($LASTEXITCODE -ne 0) { throw 'Disposable database creation failed.' }
  Invoke-LocalSql ([IO.File]::ReadAllText((Join-Path $phase6Root 'apps/api/prisma/tests/security-adapter-local-bootstrap.sql'))) $phase6Database

  foreach ($phase6Migration in @('0001_init','0002_pathways_foundation','0003_pathways_projects_collection','0004_pathways_finance_evaluation_decisions')) {
    Copy-Item -LiteralPath (Join-Path $phase6Root "apps/api/prisma/migrations/$phase6Migration") -Destination $phase6Stage -Recurse
  }
  $env:PATHWAYS_PHASE6_REPLAY_MIGRATIONS = $phase6Stage
  $env:DIRECT_URL = "postgresql://prisma@127.0.0.1:${phase6Port}/${phase6Database}?sslmode=disable&connection_limit=1"
  $env:DATABASE_URL = $env:DIRECT_URL
  Push-Location $phase6Root
  try {
    pnpm --filter @pathways/api exec prisma migrate deploy --config $phase6Config
    if ($LASTEXITCODE -ne 0) { throw '0001-0004 supported replay failed.' }
    Copy-Item -LiteralPath (Join-Path $phase6Root 'apps/api/prisma/migrations/0005_supabase_security_adapter') -Destination $phase6Stage -Recurse
    $env:DIRECT_URL = "postgresql://postgres@127.0.0.1:${phase6Port}/${phase6Database}?sslmode=disable&connection_limit=1"
    $env:DATABASE_URL = $env:DIRECT_URL
    pnpm --filter @pathways/api exec prisma migrate deploy --config $phase6Config
    if ($LASTEXITCODE -ne 0) { throw '0005 administrator replay failed.' }

    foreach ($phase6Case in @('nonzero','dependency','missing','rlsdrift')) {
      $phase6CaseDb = "pathways_phase4_phase6_$phase6Case"
      & "$phase6Bin\createdb.exe" -w -h 127.0.0.1 -p $phase6Port -U postgres -T $phase6Database $phase6CaseDb
      if ($LASTEXITCODE -ne 0) { throw "Could not clone $phase6CaseDb." }
    }
    Invoke-LocalSql 'INSERT INTO public."Role"(name) VALUES(''must_block'');' 'pathways_phase4_phase6_nonzero'
    Invoke-LocalSql 'CREATE VIEW public.phase6_external_dependency AS SELECT id FROM public."Role";' 'pathways_phase4_phase6_dependency'
    Invoke-LocalSql 'ALTER TABLE public."Role" RENAME TO "Role_missing";' 'pathways_phase4_phase6_missing'
    Invoke-LocalSql 'ALTER TABLE pathways.organizations DISABLE ROW LEVEL SECURITY;' 'pathways_phase4_phase6_rlsdrift'
    Invoke-ExpectedFailure 'pathways_phase4_phase6_nonzero'
    Invoke-ExpectedFailure 'pathways_phase4_phase6_dependency'
    Invoke-ExpectedFailure 'pathways_phase4_phase6_missing'
    Invoke-ExpectedFailure 'pathways_phase4_phase6_rlsdrift'

    Copy-Item -LiteralPath (Join-Path $phase6Root 'apps/api/prisma/migrations/0006_retire_legacy_public_application_tables') -Destination $phase6Stage -Recurse
    $env:DIRECT_URL = "postgresql://prisma@127.0.0.1:${phase6Port}/${phase6Database}?sslmode=disable&connection_limit=1"
    $env:DATABASE_URL = $env:DIRECT_URL
    pnpm --filter @pathways/api exec prisma migrate deploy --config $phase6Config
    if ($LASTEXITCODE -ne 0) { throw '0006 supported replay failed.' }
    pnpm --filter @pathways/api exec prisma migrate status --config $phase6Config
    if ($LASTEXITCODE -ne 0) { throw 'Replay migration status failed.' }
    $phase6DiffDatabase = 'pathways_phase4_phase6_diff'
    & "$phase6Bin\createdb.exe" -w -h 127.0.0.1 -p $phase6Port -U postgres -T $phase6Database $phase6DiffDatabase
    if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated Prisma diff clone.' }
    Invoke-LocalSql 'ALTER TABLE pathways.system_users DROP CONSTRAINT system_users_auth_user_id_fkey;' $phase6DiffDatabase
    $phase6DiffUrl = "postgresql://prisma@127.0.0.1:${phase6Port}/${phase6DiffDatabase}?sslmode=disable"
    pnpm --filter @pathways/api exec prisma migrate diff --from-url $phase6DiffUrl `
      --to-schema-datamodel (Join-Path $phase6Root 'apps/api/prisma/schema.prisma') --exit-code
    if ($LASTEXITCODE -ne 0) { throw 'Replay physical diff is not empty.' }
  } finally { Pop-Location }

  $phase6Post = @'
SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='pathways' AND c.relkind='r')=39
 AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r')=1
 AND to_regclass('public._prisma_migrations') IS NOT NULL
 AND (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)=0
 AND EXISTS(SELECT FROM pg_extension WHERE extname='pgcrypto')
 AND EXISTS(SELECT FROM pg_constraint WHERE conname='system_users_auth_user_id_fkey'
            AND conrelid='pathways.system_users'::regclass
            AND confrelid='auth.users'::regclass AND contype='f');
'@
  $phase6Result = $phase6Post | & "$phase6Bin\psql.exe" -X -w -q -A -t -h 127.0.0.1 -p $phase6Port -U postgres -d $phase6Database -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0 -or $phase6Result.Trim() -cne 't') { throw 'Replay postflight failed.' }
  Write-Output 'PHASE6_LOCAL_REPLAY=PASS'
  Write-Output 'PHASE6_NEGATIVE_CASES=4'
  $phase6Exit = 0
} catch {
  Write-Output ('PHASE6_LOCAL_REPLAY=FAILED; ' + $_.Exception.Message)
  $phase6Exit = 1
} finally {
  foreach ($phase6EnvironmentName in $phase6PreviousEnvironment.Keys) {
    $phase6Previous = $phase6PreviousEnvironment[$phase6EnvironmentName]
    if ($phase6Previous.Present) {
      Set-Item -LiteralPath "Env:$phase6EnvironmentName" -Value $phase6Previous.Value
    } else {
      Remove-Item -LiteralPath "Env:$phase6EnvironmentName" -ErrorAction SilentlyContinue
    }
  }
  if ($phase6Started) {
    $phase6Stop = Start-Process -FilePath "$phase6Bin\pg_ctl.exe" `
      -ArgumentList @('-D',$phase6Data,'-m','fast','-s','stop') -PassThru -WindowStyle Hidden
    if (-not $phase6Stop.WaitForExit(15000) -or $phase6Stop.ExitCode -ne 0) { $phase6Exit = 1 }
  }
  Write-Output ('DISPOSABLE_LOCAL_EVIDENCE_DIRECTORY=' + $phase6Parent)
}
exit $phase6Exit
