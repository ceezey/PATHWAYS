# Shared helpers for the fast runners that copy the saved replay template cluster.
function Get-TemplateManifest([string]$Root) {
  $manifest = Get-Content (Join-Path $Root '.tmp/pathways-replay-template/manifest.json') -Raw | ConvertFrom-Json
  if ($manifest.migrationsHash -ne (Get-MigrationsHash $Root)) { throw 'Template is stale; rerun Replay-Local.ps1 -MigrationBaseline -SaveTemplate.' }
  return $manifest
}
function Get-PostgresBin([string]$Override) {
  if ($Override) { return $Override }
  if ($env:OS -eq 'Windows_NT') { 'C:\Program Files\PostgreSQL\18\bin' } else { '/usr/lib/postgresql/18/bin' }
}
