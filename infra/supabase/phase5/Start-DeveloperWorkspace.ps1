# Local-only launcher after successful reviewed Phase 5 bootstrap. No secrets in argv.
[CmdletBinding()]
param([switch]$StrongUniquePasswordConfirmed)
$ErrorActionPreference = 'Stop'
if (-not $StrongUniquePasswordConfirmed) {
  Write-Output 'WORKSPACE_BLOCKED; human confirmation of a strong unique private password is required.'
  exit 1
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Invoke-AuthorizationBootstrap.ps1') -Action Verify
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$phase5PreviousAccess = $env:PATHWAYS_DEVELOPER_ACCESS_ENABLED
try {
  $env:PATHWAYS_DEVELOPER_ACCESS_ENABLED = 'true'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot '../security-adapter/Start-DevRuntime.ps1') -Action Start
  $phase5WorkspaceExit = $LASTEXITCODE
} finally {
  if ($null -eq $phase5PreviousAccess) {
    Remove-Item Env:PATHWAYS_DEVELOPER_ACCESS_ENABLED -ErrorAction SilentlyContinue
  } else { $env:PATHWAYS_DEVELOPER_ACCESS_ENABLED = $phase5PreviousAccess }
}
exit $phase5WorkspaceExit
