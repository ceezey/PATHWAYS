BeforeAll {
  $root = (Resolve-Path "$PSScriptRoot/../../..").Path
  $check = Join-Path $PSScriptRoot 'Test-SchemaDrift.ps1'
  function Get-DriftDirs { (Get-ChildItem (Join-Path $root '.tmp') -Directory -Filter 'pathways-drift-*').Count }
}
Describe 'Test-SchemaDrift' {
  It 'reports CLEAN for the committed schema and cleans up' {
    $out = pwsh -NoProfile -File $check
    $LASTEXITCODE | Should -Be 0
    ($out -join "`n") | Should -Match 'SCHEMA_DRIFT=CLEAN'
    Get-DriftDirs | Should -Be 0
  }
  It 'reports DRIFT for a schema copy with an unused field' {
    $copy = Join-Path $root '.tmp/drift-schema-copy.prisma'
    try {
      $text = Get-Content (Join-Path $root 'apps/api/prisma/schema.prisma') -Raw
      $text -replace '(?m)^(model Organization \{\r?\n)', "`$1  driftProbe String?`n" | Set-Content $copy -NoNewline
      $out = pwsh -NoProfile -File $check -Schema $copy
      $LASTEXITCODE | Should -Be 2
      ($out -join "`n") | Should -Match 'SCHEMA_DRIFT=DRIFT'
      Get-DriftDirs | Should -Be 0
    } finally { Remove-Item $copy -ErrorAction SilentlyContinue }
  }
  It 'refuses a stale template' {
    $manifest = Join-Path $root '.tmp/pathways-replay-template/manifest.json'
    $saved = Get-Content $manifest -Raw
    try {
      ($saved | ConvertFrom-Json | ForEach-Object { $_.migrationsHash = 'stale'; $_ } | ConvertTo-Json) | Set-Content $manifest
      pwsh -NoProfile -File $check | Out-Null
      $LASTEXITCODE | Should -Not -Be 0
      Get-DriftDirs | Should -Be 0
    } finally { Set-Content $manifest $saved -NoNewline }
  }
}
