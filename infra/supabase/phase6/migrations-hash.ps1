# Returns one SHA-256 over every migration file path and content in sorted order.
function Get-MigrationsHash([string]$Root) {
  $dir = Join-Path $Root 'apps/api/prisma/migrations'
  $sha = [Security.Cryptography.SHA256]::Create()
  $files = Get-ChildItem -LiteralPath $dir -Recurse -File | Sort-Object { $_.FullName.Substring($dir.Length).Replace('\','/') }
  foreach ($f in $files) {
    $name = [Text.Encoding]::UTF8.GetBytes($f.FullName.Substring($dir.Length).Replace('\','/'))
    [void]$sha.TransformBlock($name, 0, $name.Length, $null, 0)
    $bytes = [IO.File]::ReadAllBytes($f.FullName)
    [void]$sha.TransformBlock($bytes, 0, $bytes.Length, $null, 0)
  }
  [void]$sha.TransformFinalBlock(@(), 0, 0)
  return ([BitConverter]::ToString($sha.Hash) -replace '-','').ToLowerInvariant()
}
