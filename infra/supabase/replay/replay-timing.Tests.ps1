BeforeAll { . "$PSScriptRoot/replay-timing.ps1" }
Describe 'replay timing' {
  It 'times a step, prints one line and keeps LASTEXITCODE visible' {
    $out = Measure-ReplayStep 'demo' { pwsh -NoProfile -Command 'exit 3' }
    $LASTEXITCODE | Should -Be 3
    "$out" | Should -Match '^REPLAY_STEP demo [0-9.]+s$'
  }
  It 'records a failing step and rethrows' {
    { Measure-ReplayStep 'boom' { throw 'x' } } | Should -Throw
    ($script:ReplaySteps | Where-Object name -eq 'boom').Count | Should -Be 1
  }
  It 'writes a slowest-first summary json' {
    $script:ReplaySteps.Clear()
    $script:ReplaySteps.Add([pscustomobject]@{ name = 'a'; seconds = 1.0 })
    $script:ReplaySteps.Add([pscustomobject]@{ name = 'b'; seconds = 5.0 })
    $path = Join-Path $TestDrive 'timing.json'
    Write-ReplaySummary $path | Out-Null
    $json = Get-Content $path -Raw | ConvertFrom-Json
    $json.steps[0].name | Should -Be 'b'
    $json.totalSeconds | Should -BeGreaterOrEqual 0
  }
}
