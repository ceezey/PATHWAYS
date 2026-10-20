BeforeAll { . "$PSScriptRoot/replay-port.ps1" }
Describe 'Get-FreeLoopbackPort' {
  It 'returns a bindable loopback port' {
    $port = Get-FreeLoopbackPort
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
    { $listener.Start() } | Should -Not -Throw
    $listener.Stop()
  }
  It 'returns different ports while the first is held' {
    $first = Get-FreeLoopbackPort
    $hold = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $first)
    $hold.Start()
    try { Get-FreeLoopbackPort | Should -Not -Be $first } finally { $hold.Stop() }
  }
}
