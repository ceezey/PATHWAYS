# Forwards to the renamed folder for callers that still use the old path.
& (Join-Path $PSScriptRoot '../replay/Test-SchemaDrift.ps1') @args
exit $LASTEXITCODE
