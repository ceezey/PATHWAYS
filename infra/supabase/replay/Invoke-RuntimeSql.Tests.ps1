BeforeAll {
  $root = (Resolve-Path "$PSScriptRoot/../../..").Path
  $runner = Join-Path $PSScriptRoot 'Invoke-RuntimeSql.ps1'
  $ok = Join-Path $root '.tmp/runtime-ok.sql'
  $bad = Join-Path $root '.tmp/runtime-bad.sql'
  Set-Content $ok 'SELECT 1;'
  Set-Content $bad "DO `$`$ BEGIN RAISE EXCEPTION 'expected failure'; END `$`$;"
}
Describe 'Invoke-RuntimeSql' {
  It 'passes a good file and cleans up' {
    pwsh -NoProfile -File $runner -File $ok | Out-Null
    $LASTEXITCODE | Should -Be 0
    (Get-ChildItem (Join-Path $root '.tmp') -Directory -Filter 'pathways-runtime-*').Count | Should -Be 0
  }
  It 'fails a bad file and still cleans up' {
    pwsh -NoProfile -File $runner -File $bad | Out-Null
    $LASTEXITCODE | Should -Not -Be 0
    (Get-ChildItem (Join-Path $root '.tmp') -Directory -Filter 'pathways-runtime-*').Count | Should -Be 0
  }
  It 'refuses a stale template' {
    $manifest = Join-Path $root '.tmp/pathways-replay-template/manifest.json'
    $saved = Get-Content $manifest -Raw
    try {
      ($saved | ConvertFrom-Json | ForEach-Object { $_.migrationsHash = 'stale'; $_ } | ConvertTo-Json) | Set-Content $manifest
      pwsh -NoProfile -File $runner -File $ok | Out-Null
      $LASTEXITCODE | Should -Not -Be 0
    } finally { Set-Content $manifest $saved -NoNewline }
  }
}
