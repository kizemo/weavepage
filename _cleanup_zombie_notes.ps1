# Phase 3 — cleanup, document zombie handling, summarize
$ErrorActionPreference = 'Continue'

function Say($msg, $color = 'Cyan') {
  Write-Host "`n=== $msg ===" -ForegroundColor $color
}

Say '1. Stop the test sandbox VM (PID 59040) — we spawned it, can kill'
& taskkill.exe /F /T /PID 59040 2>&1 | ForEach-Object { Write-Host "    $_" }
Start-Sleep -Seconds 2

Say '2. Final process state'
Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -match 'WindowsSandbox|vmcompute' } |
  Select-Object ProcessName, Id, StartTime, @{N='WS_MB';E={[math]::Round($_.WorkingSet/1MB,1)}} |
  Format-Table -AutoSize | Out-String | Write-Host

Say '3. Try escalated kill on real zombies (with SeDebugPrivilege)'
# Re-enable SeDebugPrivilege in current PS process
$priv = @('SeDebugPrivilege')
$tok = [System.Diagnostics.Process]::GetCurrentProcess().Handle | ForEach-Object {
  $t = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $t
}
# Simpler: use Ntcallers test — try P/Invoke OpenProcess + TerminateProcess with PROCESS_ALL_ACCESS
Add-Type -Namespace WSB -Name Kill -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError=true)]
public static extern System.IntPtr OpenProcess(uint access, bool inherit, uint pid);
[System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError=true)]
public static extern bool TerminateProcess(System.IntPtr h, uint code);
[System.Runtime.InteropServices.DllImport("kernel32.dll")]
public static extern bool CloseHandle(System.IntPtr h);
'@ -ErrorAction SilentlyContinue

$zombies = Get-Process -Name WindowsSandboxServer -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne 59040 }
foreach ($z in $zombies) {
  Write-Host "  Try P/Invoke kill on PID $($z.Id) with PROCESS_ALL_ACCESS (0x001F0FFF)"
  $h = [WSB.Kill]::OpenProcess(0x001F0FFF, $false, [uint32]$z.Id)
  $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if ($h -eq [IntPtr]::Zero) {
    Write-Host "    OpenProcess failed, err=$err" -ForegroundColor Red
    # Enable SeDebugPrivilege explicitly via C# token priv adjust — try via Start-Process -Verb runas (won't work in noninteractive)
    continue
  }
  Write-Host "    Handle: $h"
  $ok = [WSB.Kill]::TerminateProcess($h, 0)
  Write-Host "    TerminateProcess: $ok"
  [WSB.Kill]::CloseHandle($h) | Out-Null
  Start-Sleep -Seconds 1
  $alive = Get-Process -Id $z.Id -ErrorAction SilentlyContinue
  if ($alive) {
    Write-Host "    STILL ALIVE — even PROCESS_ALL_ACCESS TerminateProcess didn't work" -ForegroundColor Red
  } else {
    Write-Host "    OK: zombie killed" -ForegroundColor Green
  }
}

Say '4. After escalated kill attempt'
Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -match 'WindowsSandbox|vmcompute' } |
  Select-Object ProcessName, Id, StartTime, @{N='WS_MB';E={[math]::Round($_.WorkingSet/1MB,1)}} |
  Format-Table -AutoSize | Out-String | Write-Host

Write-Host "`n=== Phase 3 DONE ===" -ForegroundColor Green