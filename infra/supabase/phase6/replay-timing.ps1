# Per-step timing for Replay-Local.ps1: each step prints one REPLAY_STEP line and is summarized at the end.
$script:ReplaySteps = [System.Collections.Generic.List[object]]::new()
$script:ReplayClock = [Diagnostics.Stopwatch]::StartNew()
function Measure-ReplayStep([string]$Name, [scriptblock]$Block) {
  $watch = [Diagnostics.Stopwatch]::StartNew()
  try { & $Block } finally {
    $seconds = [math]::Round($watch.Elapsed.TotalSeconds, 1)
    $script:ReplaySteps.Add([pscustomobject]@{ name = $Name; seconds = $seconds })
    Write-Output "REPLAY_STEP $Name ${seconds}s"
  }
}
function Write-ReplaySummary([string]$JsonPath) {
  $total = [math]::Round($script:ReplayClock.Elapsed.TotalSeconds, 1)
  $steps = @($script:ReplaySteps | Sort-Object seconds -Descending)
  Write-Output 'REPLAY_TIMING (slowest first)'
  foreach ($s in $steps) { Write-Output ('{0,8:N1}s  {1}' -f $s.seconds, $s.name) }
  Write-Output ('{0,8:N1}s  (outside timed steps)' -f ($total - ($steps | Measure-Object seconds -Sum).Sum))
  Write-Output "REPLAY_TOTAL ${total}s"
  [ordered]@{ steps = $steps; totalSeconds = $total } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $JsonPath
}
