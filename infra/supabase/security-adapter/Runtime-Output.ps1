# Internal transport for the already-redacted runtime child. No credential reads.
function Receive-ProtectedRuntimeOutput {
  param([Parameter(Mandatory = $true)][Diagnostics.Process]$Process)
  $runtimeStreams = @(
    @{ Reader = $Process.StandardOutput; Destination = [Console]::Out; Buffer = [char[]]::new(4096); Done = $false },
    @{ Reader = $Process.StandardError; Destination = [Console]::Error; Buffer = [char[]]::new(4096); Done = $false }
  )
  foreach ($runtimeStream in $runtimeStreams) {
    $runtimeStream.Read = $runtimeStream.Reader.ReadAsync($runtimeStream.Buffer, 0, $runtimeStream.Buffer.Length)
  }
  # Both pipes must drain before WaitForExit. Never collect a whole process log
  # or wait for stdout EOF before reading stderr (either can deadlock).
  $runtimeRemaining = $runtimeStreams.Count
  while ($runtimeRemaining -gt 0) {
    $runtimeProgress = $false
    foreach ($runtimeStream in $runtimeStreams) {
      if ($runtimeStream.Done -or -not $runtimeStream.Read.IsCompleted) { continue }
      $runtimeCount = $runtimeStream.Read.GetAwaiter().GetResult()
      if ($runtimeCount -eq 0) {
        $runtimeStream.Done = $true
        $runtimeRemaining--
      } else {
        $runtimeStream.Destination.Write($runtimeStream.Buffer, 0, $runtimeCount)
        $runtimeStream.Destination.Flush()
        $runtimeStream.Read = $runtimeStream.Reader.ReadAsync($runtimeStream.Buffer, 0, $runtimeStream.Buffer.Length)
      }
      $runtimeProgress = $true
    }
    if (-not $runtimeProgress) { Start-Sleep -Milliseconds 10 }
  }
  $Process.WaitForExit()
  return $Process.ExitCode
}
