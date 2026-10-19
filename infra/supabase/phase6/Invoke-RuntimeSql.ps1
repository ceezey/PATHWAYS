# Forwards to the renamed folder for callers that still use the old path.
& (Join-Path $PSScriptRoot '../replay/Invoke-RuntimeSql.ps1') @args
exit $LASTEXITCODE
