# Restores only an identified P07-W10 application archive into an owned loopback target.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$BackupDirectory)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$toolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../migration-reconciliation')).Path
$bin = 'C:\Program Files\PostgreSQL\18\bin'
$port = 55454
$database = 'pathways_phase4_backup_restore'
$parent = Join-Path $root ('.tmp/pathways-w10-restore-' + [guid]::NewGuid().ToString('N'))
$data = Join-Path $parent 'data'
$started = $false
$passed = $false
$stage = 'archive-preflight'

function Invoke-Checked([string]$exe, [string[]]$arguments) {
  $result = & $exe @arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Native command failed at $stage ($([IO.Path]::GetFileName($exe)))." }
  return @($result)
}

try {
  $resolvedRoot = (Resolve-Path -LiteralPath 'C:\PATHWAYS-backups').Path
  $resolvedBackup = (Resolve-Path -LiteralPath $BackupDirectory).Path
  if ([IO.Path]::GetDirectoryName($resolvedBackup) -cne $resolvedRoot -or
      [IO.Path]::GetFileName($resolvedBackup) -cnotmatch '^PATHWAYS-dev-pre-P07-W10-\d{8}-\d{6}$') { throw 'Unreviewed backup directory.' }
  $archive = Join-Path $resolvedBackup 'application.dump'
  $evidenceFile = Join-Path $resolvedBackup 'evidence.json'
  if (-not (Test-Path -LiteralPath $archive -PathType Leaf) -or -not (Test-Path -LiteralPath $evidenceFile -PathType Leaf)) { throw 'Archive or evidence missing.' }
  $evidence = Get-Content -LiteralPath $evidenceFile -Raw | ConvertFrom-Json
  if ($evidence.target -cne 'PATHWAYS-dev' -or $evidence.projectRef -cne 'pdqwsknbzkdtiwjjibqt' -or
      $evidence.migrationCount -ne 20 -or $evidence.latestMigration -cne '0020_fixed_sensitive_release_policy' -or
      $evidence.archiveSha256 -cne (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant() -or
      $evidence.tableDataEntries -ne @($evidence.dataBefore).Count) { throw 'Archive identity or SHA-256 refused.' }
  $list = @(Invoke-Checked (Join-Path $bin 'pg_restore.exe') @('--list',$archive))
  if (@($list | Where-Object { "$_" -match ' TABLE DATA (public|pathways) ' }).Count -ne $evidence.tableDataEntries) { throw 'Archive table coverage changed.' }

  $stage = 'disposable-target'
  # The managed source uses UTC; JSON fingerprints of timestamptz depend on
  # session TimeZone, so pin the local client session before comparison.
  $env:PGTZ = 'UTC'
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
  try { $listener.Start() } finally { $listener.Stop() }
  New-Item -ItemType Directory -Path $parent | Out-Null
  [void](Invoke-Checked (Join-Path $bin 'initdb.exe') @('-D',$data,'-U','postgres','-A','trust','--encoding=UTF8','--locale=C'))
  Add-Content -LiteralPath (Join-Path $data 'postgresql.conf') -Value "`nlisten_addresses='127.0.0.1'`nport=$port`n"
  $start = Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList @('-D',$data,'-l',(Join-Path $parent 'postgres.log'),'-w','-t','15','-s','start') -PassThru -WindowStyle Hidden
  if (-not $start.WaitForExit(20000) -or $start.ExitCode -ne 0) { throw 'Disposable PostgreSQL start failed.' }
  $started = $true
  [void](Invoke-Checked (Join-Path $bin 'createdb.exe') @('-w','-h','127.0.0.1','-p',"$port",'-U','postgres',$database))
  $psql = Join-Path $bin 'psql.exe'
  $base = @('-X','-w','-q','-A','-t','-h','127.0.0.1','-p',"$port",'-U','postgres','-d',$database,'-v','ON_ERROR_STOP=1')
  [void](Invoke-Checked $psql ($base + @('-f',(Join-Path $toolRoot 'backup-restore-local-bootstrap.sql'))))
  # Current hosted ACLs name this provider role; create only its inert local name.
  [void](Invoke-Checked $psql ($base + @('-c','CREATE ROLE supabase_admin NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;')))
  if (@($list | Where-Object { "$_" -match ' SCHEMA - public ' }).Count) {
    [void](Invoke-Checked $psql ($base + @('-c','DROP SCHEMA public RESTRICT;')))
  }
  foreach ($section in @('pre-data','data')) {
    $stage = "local-restore-$section"
    [void](Invoke-Checked (Join-Path $bin 'pg_restore.exe') @('--exit-on-error','--single-transaction',"--section=$section",'-h','127.0.0.1','-p',"$port",'-U','postgres','-d',$database,$archive))
  }
  $stage = 'local-auth-reference-scaffold'
  [void](Invoke-Checked $psql ($base + @('-f',(Join-Path $toolRoot 'backup-restore-auth-bootstrap.sql'))))
  $stage = 'local-restore-post-data'
  [void](Invoke-Checked (Join-Path $bin 'pg_restore.exe') @('--exit-on-error','--single-transaction','--section=post-data','-h','127.0.0.1','-p',"$port",'-U','postgres','-d',$database,$archive))

  $stage = 'local-verification'
  $inventory = @(Invoke-Checked $psql ($base + @('-f',(Join-Path $toolRoot 'backup-data-inventory.sql'))) |
    Where-Object { "$_" -match '^\{' } | ForEach-Object { "$_" | ConvertFrom-Json } | Sort-Object -Property key)
  $expected = @($evidence.dataBefore | Sort-Object -Property key)
  if ($inventory.Count -ne $expected.Count) { throw 'Restored table count differs.' }
  for ($index = 0; $index -lt $expected.Count; $index++) {
    if ($inventory[$index].key -cne $expected[$index].key -or
        $inventory[$index].rows -ne $expected[$index].rows -or
        $inventory[$index].sha256 -cne $expected[$index].sha256) {
      throw "Restored application fingerprint differs at $($expected[$index].key): rowCountsMatch=$($inventory[$index].rows -eq $expected[$index].rows)."
    }
  }
  $ledger = (Invoke-Checked $psql ($base + @('-c',"SELECT jsonb_build_object('count',(SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),'bad',(SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL),'latest',(SELECT migration_name FROM public._prisma_migrations ORDER BY started_at DESC LIMIT 1),'checksum',(SELECT checksum FROM public._prisma_migrations WHERE migration_name='0020_fixed_sensitive_release_policy'),'bypass',(SELECT rolbypassrls FROM pg_roles WHERE rolname='pathways_runtime'))::text;")) | Select-Object -Last 1) | ConvertFrom-Json
  if ($ledger.count -ne 20 -or $ledger.bad -ne 0 -or $ledger.latest -cne '0020_fixed_sensitive_release_policy' -or
      $ledger.checksum -cne 'd9c301f26d42fa9b52a5591c43584a900f1b7d0293726616a4bed9a74745f10c' -or $ledger.bypass -ne $false) { throw 'Restored ledger or runtime role differs.' }
  $passed = $true
} catch {
  Write-Output ("W10_LOCAL_RESTORE=FAILED; stage=$stage; reason=$($_.Exception.Message)")
} finally {
  Remove-Item Env:PGTZ -ErrorAction SilentlyContinue
  if ($started) {
    $stop = Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList @('-D',$data,'-m','fast','-w','-t','15','stop') -PassThru -WindowStyle Hidden
    if ($stop.WaitForExit(20000) -and $stop.ExitCode -eq 0) { $started = $false } else { $passed = $false }
  }
  $resolvedParent = [IO.Path]::GetFullPath($parent)
  $resolvedTmp = [IO.Path]::GetFullPath((Join-Path $root '.tmp'))
  if (-not $started -and [IO.Path]::GetDirectoryName($resolvedParent) -ceq $resolvedTmp -and
      [IO.Path]::GetFileName($resolvedParent) -cmatch '^pathways-w10-restore-[a-f0-9]{32}$' -and
      (Test-Path -LiteralPath $resolvedParent)) { Remove-Item -LiteralPath $resolvedParent -Recurse -Force }
  if (Test-Path -LiteralPath $resolvedParent) { $passed = $false }
}
if (-not $passed) { exit 1 }
$verification = [ordered]@{
  result = 'PASS'
  target = 'owned disposable loopback PostgreSQL 18.6'
  backupId = [IO.Path]::GetFileName($resolvedBackup)
  archiveSha256 = $evidence.archiveSha256
  verifiedUtc = [DateTime]::UtcNow.ToString('o')
  applicationTablesMatched = $inventory.Count
  migrations = 20
  providerData = 'EXCLUDED; ID-only local Auth reference scaffold'
  managedWrites = 0
  disposableTargetRemoved = $true
}
[IO.File]::WriteAllText((Join-Path $resolvedBackup 'restore-verification.json'), ($verification | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
Write-Output ("W10_LOCAL_RESTORE=PASS; backupId=$($verification.backupId); sha256=$($evidence.archiveSha256); tables=$($inventory.Count); migrations=20; providerData=EXCLUDED; hostedWrites=0; cleanup=PASS")
