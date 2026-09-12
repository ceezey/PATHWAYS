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

    Copy-Item -LiteralPath (Join-Path $phase6Root 'apps/api/prisma/migrations/0006_auth_session_liveness') -Destination $phase6Stage -Recurse
    $env:DIRECT_URL = "postgresql://postgres@127.0.0.1:${phase6Port}/${phase6Database}?sslmode=disable&connection_limit=1"
    $env:DATABASE_URL = $env:DIRECT_URL
    pnpm --filter @pathways/api exec prisma migrate deploy --config $phase6Config
    if ($LASTEXITCODE -ne 0) { throw '0006 supported replay failed.' }
    pnpm --filter @pathways/api exec prisma migrate status --config $phase6Config
    if ($LASTEXITCODE -ne 0) { throw 'Replay migration status failed.' }
  } finally { Pop-Location }

  $phase6Post = @'
SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='pathways' AND c.relkind='r')=39
 AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r')=16
 AND to_regclass('public._prisma_migrations') IS NOT NULL
 AND (SELECT count(*) FROM public._prisma_migrations)=6
 AND (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)=0
 AND EXISTS(SELECT FROM pg_extension WHERE extname='pgcrypto')
 AND to_regprocedure('pathways.runtime_auth_session_live(uuid,uuid)') IS NOT NULL
 AND has_function_privilege('pathways_runtime','pathways.runtime_auth_session_live(uuid,uuid)','EXECUTE')
 AND NOT has_table_privilege('pathways_runtime','auth.sessions','SELECT')
 AND EXISTS(SELECT FROM pg_constraint WHERE conname='system_users_auth_user_id_fkey'
            AND conrelid='pathways.system_users'::regclass
            AND confrelid='auth.users'::regclass AND contype='f');
'@
  $phase6Result = $phase6Post | & "$phase6Bin\psql.exe" -X -w -q -A -t -h 127.0.0.1 -p $phase6Port -U postgres -d $phase6Database -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0 -or $phase6Result.Trim() -cne 't') { throw 'Replay postflight failed.' }
  Write-Output 'PHASE6_LOCAL_REPLAY=PASS'
  Write-Output 'LEGACY_TABLE_PRESERVATION=PASS'
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
    if (-not $phase6Stop.WaitForExit(15000) -or $phase6Stop.ExitCode -ne 0) {
      $phase6Exit = 1
    } else {
      $phase6Started = $false
    }
  }
  $phase6ResolvedParent = [IO.Path]::GetFullPath($phase6Parent)
  $phase6ResolvedTemporary = [IO.Path]::GetFullPath((Join-Path $phase6Root '.tmp'))
  if (-not $phase6Started -and
      [IO.Path]::GetDirectoryName($phase6ResolvedParent) -ceq $phase6ResolvedTemporary -and
      [IO.Path]::GetFileName($phase6ResolvedParent) -cmatch '^pathways-phase6-[a-f0-9]{32}$') {
    Remove-Item -LiteralPath $phase6ResolvedParent -Recurse -Force
    Write-Output 'DISPOSABLE_LOCAL_CLEANUP=PASS'
  } else {
    Write-Output 'DISPOSABLE_LOCAL_CLEANUP=UNCERTAIN'
    $phase6Exit = 1
  }
}
exit $phase6Exit
