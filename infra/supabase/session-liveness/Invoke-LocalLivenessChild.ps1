# Synthetic test adapter only. Executes the exact fingerprinted writer child
# statements, NEVER its hosted credential/preflight wrapper. No target URL input.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$StagePath,
  [Parameter(Mandatory)][ValidateSet('Original','DirectOnly','Corrected')][string]$Variant,
  [Parameter(Mandatory)][ValidateSet('prisma','postgres')][string]$Role
)
$ErrorActionPreference = 'Stop'
$livenessWriteProcess = $null
$localExit = 1
$localStage = 'path-guard'
try {
  if ($args.Count -ne 0) { throw 'LOCAL_GUARD' }
  $livenessWriteRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
  if ($livenessWriteRoot -cne 'C:\PATHWAYS') { throw 'LOCAL_GUARD' }
  $livenessWriteResolvedStage = (Resolve-Path -LiteralPath $StagePath).Path
  $localParent = Split-Path -Parent $livenessWriteResolvedStage
  if ((Split-Path -Parent $localParent) -cne (Join-Path $livenessWriteRoot '.tmp') -or
      (Split-Path -Leaf $localParent) -cnotmatch '^pathways-session-liveness-[A-Za-z0-9]+$' -or
      (Split-Path -Leaf $livenessWriteResolvedStage) -cne 'migrations' -or
      (Get-Item -LiteralPath $localParent).LinkType -or
      (Get-Item -LiteralPath $livenessWriteResolvedStage).LinkType -or
      -not (Test-Path -LiteralPath (Join-Path $localParent 'synthetic-child-test'))) { throw 'LOCAL_GUARD' }
  $localWriter = Join-Path $PSScriptRoot 'Write-DevSessionLiveness.ps1'
  if ((Get-FileHash -LiteralPath $localWriter -Algorithm SHA256).Hash.ToLowerInvariant() -cne
      '05ab5b0a245f5a52eeec87f9daddfb40e75148b3d92aba1c1b164959c66315e2' -or
      (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'prisma.deploy.config.ts') -Algorithm SHA256).Hash.ToLowerInvariant() -cne
      'c8d6795869e4d4b67cd2f6a33a888a2703bfdab9d320b4770fde0d4510328d77') { throw 'LOCAL_GUARD' }

  # Permit only a checksum-matching canonical prefix (4/5/6) for this replay.
  $localStage = 'staging-guard'
  $localSource = [IO.File]::ReadAllText($localWriter).Replace("`r`n","`n")
  $localExpected = [regex]::Matches($localSource, "Name = '(000[1-6]_[a-z0-9_]+)'; Hash = '([0-9a-f]{64})'")
  $localEntries = @(Get-ChildItem -LiteralPath $livenessWriteResolvedStage -Force | Sort-Object Name)
  if ($localExpected.Count -ne 6 -or $localEntries.Count -notin @(5,6,7)) { throw 'LOCAL_GUARD' }
  for ($localIndex = 0; $localIndex -lt $localEntries.Count - 1; $localIndex++) {
    $localEntry = $localEntries[$localIndex]
    $localSql = Join-Path $localEntry.FullName 'migration.sql'
    if ($localEntry.Name -cne $localExpected[$localIndex].Groups[1].Value -or $localEntry.LinkType -or
        (Get-Item -LiteralPath $localSql).LinkType -or
        (@(Get-ChildItem -LiteralPath $localEntry.FullName -Force).Name -join ',') -cne 'migration.sql' -or
        (Get-FileHash -LiteralPath $localSql -Algorithm SHA256).Hash.ToLowerInvariant() -cne $localExpected[$localIndex].Groups[2].Value) { throw 'LOCAL_GUARD' }
  }
  if ($localEntries[-1].Name -cne 'migration_lock.toml' -or $localEntries[-1].LinkType -or
      (Get-FileHash -LiteralPath $localEntries[-1].FullName -Algorithm SHA256).Hash.ToLowerInvariant() -cne
      '74a9137885ce73d3ff088d79d658f8066e05e680fb51c0800a290c91c0c01d48') { throw 'LOCAL_GUARD' }

  # Confirm the fixed loopback server belongs to this exact disposable directory.
  $localStage = 'target-probe'
  $localProbe = [Diagnostics.ProcessStartInfo]::new()
  $localProbe.FileName = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
  $localProbe.Arguments = '-X -w -q -A -t -h 127.0.0.1 -p 55457 -U postgres -d pathways_phase4_phase6_replay -v ON_ERROR_STOP=1'
  $localProbe.UseShellExecute = $false
  $localProbe.CreateNoWindow = $true
  $localProbe.RedirectStandardInput = $true
  $localProbe.RedirectStandardOutput = $true
  $localProbe.RedirectStandardError = $true
  $localProbe.EnvironmentVariables.Clear()
  $localProbe.EnvironmentVariables['SystemRoot'] = $env:SystemRoot
  $localProbe.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '5'
  $localProbe.EnvironmentVariables['PGPASSFILE'] = 'NUL'
  $localProbe.EnvironmentVariables['PGSSLMODE'] = 'disable'
  $localProbeProcess = [Diagnostics.Process]::Start($localProbe)
  $localProbeOut = $localProbeProcess.StandardOutput.ReadToEndAsync()
  $localProbeErr = $localProbeProcess.StandardError.ReadToEndAsync()
  $localProbeProcess.StandardInput.Write("SELECT current_setting('data_directory') WHERE inet_server_addr() = '127.0.0.1'::inet AND inet_server_port() = 55457 AND current_database() = 'pathways_phase4_phase6_replay';")
  $localProbeProcess.StandardInput.Close()
  if (-not $localProbeProcess.WaitForExit(10000)) { $localProbeProcess.Kill(); throw 'LOCAL_GUARD' }
  if ($localProbeProcess.ExitCode -ne 0 -or
      $localProbeOut.Result.Trim().Replace('/','\') -cne (Join-Path $localParent 'data')) { throw 'LOCAL_GUARD' }
  $localProbeProcess.Dispose()

  $localStage = 'extract-child'
  function Get-UniqueBlock([string]$Start,[string]$End) {
    $startIndex = $localSource.IndexOf($Start,[StringComparison]::Ordinal)
    if ($startIndex -lt 0 -or $localSource.IndexOf($Start,$startIndex + $Start.Length,[StringComparison]::Ordinal) -ge 0) { throw 'LOCAL_GUARD' }
    $endIndex = $localSource.IndexOf($End,$startIndex + $Start.Length,[StringComparison]::Ordinal)
    if ($endIndex -lt 0) { throw 'LOCAL_GUARD' }
    return $localSource.Substring($startIndex,$endIndex - $startIndex)
  }
  $localSetup = Get-UniqueBlock '$livenessWriteInfo = [Diagnostics.ProcessStartInfo]::new()' "  if (`$Action -ceq 'Deploy') {"
  $localDeploy = Get-UniqueBlock "`$livenessWriteInfo.EnvironmentVariables['PATHWAYS_SESSION_LIVENESS_URL'] = `$livenessWriteUrl" '  } else {'
  $localLaunch = Get-UniqueBlock '$livenessWriteProcess = [Diagnostics.Process]::Start($livenessWriteInfo)' '  if (-not $livenessWriteProcess.WaitForExit(150000))'
  if ($Variant -cne 'Corrected') {
    $localOmitted = if ($Variant -ceq 'Original') { @('DATABASE_URL','DIRECT_URL') } else { @('DATABASE_URL') }
    foreach ($localKey in $localOmitted) {
      $localLine = "    `$livenessWriteInfo.EnvironmentVariables['$localKey'] = `$livenessWriteUrl`n"
      if (-not $localDeploy.Contains($localLine)) { throw 'LOCAL_GUARD' }
      $localDeploy = $localDeploy.Replace($localLine,'')
    }
  }
  $localStatements = $localSetup + $localDeploy + $localLaunch
  if ($localStatements -match 'Import-Clixml|supabase\.com|Read-DevSessionLiveness|rollback\.sql' -or
      $localStatements -notmatch 'migrate deploy --config') { throw 'LOCAL_GUARD' }
  $livenessWriteUrl = 'postgresql://{0}@127.0.0.1:55457/pathways_phase4_phase6_replay?sslmode=disable&connection_limit=1' -f $Role
  $localStage = 'launch-child'
  # ScriptBlock.Create has no file-backed PSScriptRoot. Restore the writer's
  # known script directory before running its otherwise unchanged statements.
  . ([scriptblock]::Create("`$PSScriptRoot = 'C:\PATHWAYS\infra\supabase\session-liveness'`n" + $localStatements))
  $localStage = 'wait-child'
  if (-not $livenessWriteProcess.WaitForExit(150000)) {
    $livenessWriteProcess.Kill()
    if (-not $livenessWriteProcess.WaitForExit(10000)) { throw 'LOCAL_CHILD_UNCERTAIN' }
    throw 'LOCAL_CHILD_TIMEOUT'
  }
  $localText = $livenessWriteOutput.Result + $livenessWriteError.Result
  if ($localText.Length -gt 65536) { throw 'LOCAL_OUTPUT_BOUND' }
  $localClean = $true
  foreach ($localKey in @('PATHWAYS_SESSION_LIVENESS_URL','DATABASE_URL','DIRECT_URL','PGPASSWORD')) {
    if ($livenessWriteInfo.EnvironmentVariables.ContainsKey($localKey) -or
        $livenessWriteProcess.StartInfo.EnvironmentVariables.ContainsKey($localKey)) { $localClean = $false }
  }
  [ordered]@{
    status = 'COMPLETE'
    childExitCode = $livenessWriteProcess.ExitCode
    schemaEnvironmentFailure = [bool]($localText -match 'P1012')
    missingDirectUrl = [bool]($localText -match 'Environment variable not found: DIRECT_URL')
    missingDatabaseUrl = [bool]($localText -match 'Environment variable not found: DATABASE_URL')
    migrationsApplied = [bool]($localText -match 'successfully applied')
    envFilesSkipped = [bool]($localText -match 'skipping environment variable loading')
    secretCopiesCleared = [bool]($localClean -and $null -eq $livenessWriteUrl)
    outputBounded = $true
  } | ConvertTo-Json -Compress
  $localExit = 0
} catch {
  # No exception text or raw provider output, even for synthetic failures.
  [ordered]@{status='FAILED'; failure='LOCAL_CHILD_GUARD_OR_EXECUTION'; stage=$localStage} | ConvertTo-Json -Compress
} finally {
  $localText = $null
  $livenessWriteUrl = $null
  if ($null -ne $livenessWriteProcess -and $livenessWriteProcess.HasExited) { $livenessWriteProcess.Dispose() }
}
exit $localExit
