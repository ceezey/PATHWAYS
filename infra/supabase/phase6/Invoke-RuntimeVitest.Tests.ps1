BeforeAll {
  $root = (Resolve-Path "$PSScriptRoot/../../..").Path
  $runner = Join-Path $PSScriptRoot 'Invoke-RuntimeVitest.ps1'
  $reports = Join-Path $root 'apps/api/src/modules/reports/reports-runtime.local.test.ts'
  $manifest = Join-Path $root '.tmp/pathways-replay-template/manifest.json'
  $map = [regex]::Matches((Get-Content $runner -Raw), "'(src/modules/[^']+\.local\.test\.ts)' = '(PATHWAYS_\w+)'")
}
Describe 'Invoke-RuntimeVitest' {
  It 'maps every suite to a flag its test file reads' {
    $map.Count | Should -BeGreaterThan 5
    foreach ($m in $map) {
      $file = Join-Path $root "apps/api/$($m.Groups[1].Value)"
      $file | Should -Exist
      (Get-Content $file -Raw) | Should -Match $m.Groups[2].Value
    }
  }
  It 'refuses an unmapped file' {
    $out = pwsh -NoProfile -File $runner -File (Join-Path $PSScriptRoot 'Invoke-RuntimeSql.ps1')
    $LASTEXITCODE | Should -Not -Be 0
    "$out" | Should -Match 'Unmapped'
  }
  It 'refuses a stale template' {
    $saved = Get-Content $manifest -Raw
    try {
      ($saved | ConvertFrom-Json | ForEach-Object { $_.migrationsHash = 'stale'; $_ } | ConvertTo-Json) | Set-Content $manifest
      $out = pwsh -NoProfile -File $runner -File $reports
      $LASTEXITCODE | Should -Not -Be 0
      "$out" | Should -Match 'Replay-Local.ps1 -MigrationBaseline -SaveTemplate'
    } finally { Set-Content $manifest $saved -NoNewline }
  }
  It 'restores the environment and removes the cluster after a run' {
    $out = pwsh -NoProfile -Command "`$env:DATABASE_URL='keep'; Remove-Item Env:PATHWAYS_REPORTS_LOCAL_TESTS -ErrorAction SilentlyContinue; & '$runner' -File '$reports' | Out-Null; `$env:DATABASE_URL; [bool]`$env:PATHWAYS_REPORTS_LOCAL_TESTS; [bool]`$env:PATHWAYS_REPLAY_PORT; exit 0"
    $out | Should -Be @('keep', 'False', 'False')
    (Get-ChildItem (Join-Path $root '.tmp') -Directory -Filter 'pathways-runtime-*').Count | Should -Be 0
  }
}
