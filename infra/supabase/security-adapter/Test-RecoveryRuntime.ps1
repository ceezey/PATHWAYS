# Actual-login Phase 4 recovery verification. Fixed live dev target only.
# Does not create/overwrite credentials, edit envs, or change privileges.
# A timeout leaves the exact child observable; the recovery runner owns any
# authorized quarantine/session containment. Never broadly terminate sessions.
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^p4r_[a-f0-9]{32}$')]
    [string]$RecoveryTag
)

$ErrorActionPreference = 'Stop'
$phase4Exit = 1
$phase4Unknown = $false
$phase4Process = $null
$phase4Secret = $null
$phase4Credential = $null
$phase4Info = $null
$phase4Uri = $null

try {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or
        $RecoveryTag -cnotmatch '^p4r_[a-f0-9]{32}$') {
        throw 'Windows DPAPI and an exact recovery tag are required.'
    }
    $phase4Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
    $phase4Path = Join-Path $env:LOCALAPPDATA 'PATHWAYS/secrets/dev-db-runtime.credential.xml'
    $phase4Credential = Import-Clixml -LiteralPath $phase4Path
    if ($phase4Credential -isnot [System.Management.Automation.PSCredential] -or
        $phase4Credential.UserName -cne 'pathways_runtime.pdqwsknbzkdtiwjjibqt' -or
        $phase4Credential.Password.Length -eq 0) {
        throw 'Unexpected protected runtime credential.'
    }
    $phase4Sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $phase4Acl = Get-Acl -LiteralPath $phase4Path
    $phase4Rules = @($phase4Acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if (-not $phase4Acl.AreAccessRulesProtected -or $phase4Rules.Count -ne 1 -or
        $phase4Acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $phase4Sid.Value -or
        $phase4Rules[0].IdentityReference.Value -cne $phase4Sid.Value -or
        $phase4Rules[0].AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
        $phase4Rules[0].FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl) {
        throw 'Runtime credential ACL is not the reviewed current-user-only ACL.'
    }
    $phase4Info = [Diagnostics.ProcessStartInfo]::new()
    $phase4Info.FileName = (Get-Command node.exe -ErrorAction Stop).Source
    $phase4Info.Arguments = '"' + (Join-Path $PSScriptRoot 'recovery-runtime-check.mjs') + '" ' + $RecoveryTag
    $phase4Info.WorkingDirectory = Join-Path $phase4Root 'apps/api'
    $phase4Info.UseShellExecute = $false
    $phase4Info.CreateNoWindow = $true
    $phase4Info.RedirectStandardOutput = $true
    $phase4Info.RedirectStandardError = $true
    foreach ($phase4Name in @($phase4Info.EnvironmentVariables.Keys)) {
        if ($phase4Name -match '^(PG|PRISMA_|DATABASE_URL$|DIRECT_URL$|SHADOW_DATABASE_URL$|SUPABASE_|NEXT_PUBLIC_SUPABASE_|DEBUG$|RUST_LOG$|RUST_BACKTRACE$|NODE_OPTIONS$|NODE_PATH$)') {
            $phase4Info.EnvironmentVariables.Remove($phase4Name)
        }
    }
    $phase4Secret = $phase4Credential.GetNetworkCredential().Password
    $phase4Uri = [UriBuilder]::new()
    $phase4Uri.Scheme = 'postgresql'
    $phase4Uri.Host = 'aws-1-ap-southeast-2.pooler.supabase.com'
    $phase4Uri.Port = 5432
    $phase4Uri.Path = 'postgres'
    $phase4Uri.UserName = $phase4Credential.UserName
    $phase4Uri.Password = [Uri]::EscapeDataString($phase4Secret)
    $phase4Uri.Query = 'sslmode=require&connect_timeout=15&connection_limit=1'
    $phase4Info.EnvironmentVariables['DATABASE_URL'] = $phase4Uri.Uri.AbsoluteUri
    $phase4Info.EnvironmentVariables['DIRECT_URL'] = ''
    $phase4Info.EnvironmentVariables['SHADOW_DATABASE_URL'] = ''
    $phase4Process = [Diagnostics.Process]::Start($phase4Info)
    $phase4Info.EnvironmentVariables.Remove('DATABASE_URL')
    $phase4Uri.Password = ''
    $phase4Secret = $null
    $phase4Credential = $null

    # Stream each safe marker as it arrives. ReadToEnd would hide the backend
    # tuple until after a later timeout, preventing exact-session containment.
    $phase4Clock = [Diagnostics.Stopwatch]::StartNew()
    $phase4OutTask = $phase4Process.StandardOutput.ReadLineAsync()
    $phase4ErrTask = $phase4Process.StandardError.ReadLineAsync()
    $phase4OutDone = $false
    $phase4ErrDone = $false
    $phase4Unexpected = $false
    $phase4BackendCount = 0
    $phase4PassedMarker = $false
    while ($true) {
        if (-not $phase4OutDone -and $phase4OutTask.IsCompleted) {
            $phase4Line = $phase4OutTask.GetAwaiter().GetResult()
            if ($null -eq $phase4Line) {
                $phase4OutDone = $true
            } else {
                if ($phase4Line.StartsWith('RECOVERY_BACKEND=')) {
                    try {
                        $phase4Backend = $phase4Line.Substring('RECOVERY_BACKEND='.Length) | ConvertFrom-Json
                        if ($phase4Backend.pid -isnot [int] -or $phase4Backend.pid -le 0 -or
                            $phase4Backend.backend_start -cnotmatch '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}\+00$' -or
                            $phase4Backend.database -cne 'postgres' -or
                            $phase4Backend.role -cne 'pathways_runtime' -or
                            $phase4Backend.session_user -cne 'pathways_runtime' -or
                            $phase4Backend.current_user -cnotmatch '^[A-Za-z_][A-Za-z0-9_$]{0,62}$' -or
                            $phase4Backend.application_name -cne $RecoveryTag) {
                            throw 'Unexpected backend metadata.'
                        }
                        $phase4SafeBackend = [ordered]@{
                            pid = $phase4Backend.pid
                            backend_start = $phase4Backend.backend_start
                            database = $phase4Backend.database
                            role = $phase4Backend.role
                            session_user = $phase4Backend.session_user
                            current_user = $phase4Backend.current_user
                            application_name = $phase4Backend.application_name
                        }
                        Write-Output ('RECOVERY_BACKEND=' + ($phase4SafeBackend | ConvertTo-Json -Compress))
                        $phase4BackendCount++
                    } catch {
                        $phase4Unexpected = $true
                    }
                } elseif ($phase4Line -cin @(
                    'RECOVERY_PRISMA_STARTUP=PASS',
                    'RECOVERY_CONTEXT_CHECK=PASS',
                    'RECOVERY_NEGATIVE_SECURITY_PROBES_9=PASS',
                    'RECOVERY_RUNTIME_CHECK=PASS'
                )) {
                    Write-Output $phase4Line
                    if ($phase4Line -ceq 'RECOVERY_RUNTIME_CHECK=PASS') { $phase4PassedMarker = $true }
                } elseif ($phase4Line -cmatch '^RECOVERY_RUNTIME_CHECK=FAILED; STAGE=[A-Z0-9_]{1,64}; PRISMA=(NONE|P[0-9]{4}); SQLSTATE=(NONE|[0-9A-Z]{5})$') {
                    Write-Output $phase4Line
                } elseif ($phase4Line.Length -gt 0) {
                    $phase4Unexpected = $true
                }
                $phase4OutTask = $phase4Process.StandardOutput.ReadLineAsync()
            }
        }
        if (-not $phase4ErrDone -and $phase4ErrTask.IsCompleted) {
            $phase4ErrorLine = $phase4ErrTask.GetAwaiter().GetResult()
            if ($null -eq $phase4ErrorLine) {
                $phase4ErrDone = $true
            } else {
                if ($phase4ErrorLine.Length -gt 0) { $phase4Unexpected = $true }
                # Never relay raw stderr: it can contain connection/query data.
                $phase4ErrTask = $phase4Process.StandardError.ReadLineAsync()
            }
        }
        if ($phase4Process.HasExited -and $phase4OutDone -and $phase4ErrDone) { break }
        if ($phase4Clock.ElapsedMilliseconds -ge 45000) {
            $phase4Unknown = $true
            $phase4Exit = 124
            Write-Output ('OUTCOME_UNKNOWN; ACTION=RECOVERY_RUNTIME; PID=' + $phase4Process.Id + '; TAG=' + $RecoveryTag)
            break
        }
        [Threading.Thread]::Sleep(25)
    }
    if (-not $phase4Unknown) {
        $phase4Exit = $phase4Process.ExitCode
        if ($phase4Exit -ne 0 -or $phase4Unexpected -or $phase4BackendCount -ne 1 -or -not $phase4PassedMarker) {
            if ($phase4Exit -eq 0) { $phase4Exit = 1 }
            Write-Output ('RECOVERY_RUNTIME_WRAPPER=FAILED; EXIT=' + $phase4Exit + '; DETAILS_WITHHELD=YES')
        } else {
            Write-Output 'RECOVERY_RUNTIME_WRAPPER=PASS; EXIT=0'
        }
    }
} catch {
    # Any local exception after child creation may leave an observable client.
    if ($null -ne $phase4Process -and -not $phase4Process.HasExited) {
        $phase4Unknown = $true
        $phase4Exit = 124
        Write-Output ('OUTCOME_UNKNOWN; ACTION=RECOVERY_RUNTIME; PID=' + $phase4Process.Id + '; TAG=' + $RecoveryTag)
    } else {
        $phase4Exit = 1
        Write-Output 'RECOVERY_RUNTIME_WRAPPER=FAILED; EXIT=1; DETAILS_WITHHELD=YES'
    }
} finally {
    if ($null -ne $phase4Info) { $phase4Info.EnvironmentVariables.Remove('DATABASE_URL') }
    if ($null -ne $phase4Uri) { $phase4Uri.Password = '' }
    $phase4Secret = $null
    $phase4Credential = $null
    if ($null -ne $phase4Process -and -not $phase4Unknown) { $phase4Process.Dispose() }
}
exit $phase4Exit
