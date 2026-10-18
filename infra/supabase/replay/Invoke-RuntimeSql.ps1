# Runs one runtime SQL file against a disposable copy of the saved replay template cluster.
param([Parameter(Mandatory)][string]$File, [string]$PostgresBin)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/replay-port.ps1"
. "$PSScriptRoot/migrations-hash.ps1"
. "$PSScriptRoot/replay-template.ps1"
$root = (Resolve-Path "$PSScriptRoot/../../..").Path
$template = Join-Path $root '.tmp/pathways-replay-template'
$manifest = Get-TemplateManifest $root
$PostgresBin = Get-PostgresBin $PostgresBin
$ext = if ($env:OS -eq 'Windows_NT') { '.exe' } else { '' }
$File = (Resolve-Path -LiteralPath $File).Path
$run = Join-Path $root ('.tmp/pathways-runtime-' + [guid]::NewGuid().ToString('N'))
$data = Join-Path $run 'data'
$port = Get-FreeLoopbackPort
$started = $false
$exit = 1
try {
  New-Item -ItemType Directory -Path $run | Out-Null
  Copy-Item -Recurse (Join-Path $template 'data') $data
  # The template carries the replay's old port; later lines win.
  Add-Content (Join-Path $data 'postgresql.conf') "`nport=$port`npathways.replay_port=$port`n"
  & (Join-Path $PostgresBin "pg_ctl$ext") -D $data -l (Join-Path $run 'postgres.log') -w -s start
  if ($LASTEXITCODE -ne 0) { throw 'Runtime cluster start failed.' }
  $started = $true
  & (Join-Path $PostgresBin "psql$ext") -X -w -q -h 127.0.0.1 -p $port -U postgres -d $manifest.database -v ON_ERROR_STOP=1 -f $File
  if ($LASTEXITCODE -ne 0) { throw "Runtime SQL failed: $File" }
  Write-Output 'RUNTIME_SQL=PASS'
  $exit = 0
} catch {
  Write-Output ('RUNTIME_SQL=FAILED; ' + $_.Exception.Message)
} finally {
  if ($started) { & (Join-Path $PostgresBin "pg_ctl$ext") -D $data -m fast -w -s stop }
  if ((Split-Path $run -Leaf) -match '^pathways-runtime-[a-f0-9]{32}$') { Remove-Item -LiteralPath $run -Recurse -Force -ErrorAction SilentlyContinue }
}
exit $exit
