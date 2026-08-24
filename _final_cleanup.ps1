# Phase 4 — final cleanup + state snapshot
$ErrorActionPreference = 'Continue'
function Say($msg, $color = 'Cyan') {
  Write-Host "`n=== $msg ===" -ForegroundColor $color
}

Say '1. Kill leftover SandboxRemoteSession + any sandbox procs we started'
Get-Process -Name WindowsSandboxRemoteSession, WindowsSandbox, WindowsSandboxServer -ErrorAction SilentlyContinue |
  Where-Object { $_.StartTime -gt (Get-Date).AddHours(-2) } |
  ForEach-Object {
    Write-Host "  Killing $($_.ProcessName) PID $($_.Id), started $($_.StartTime)"
    & taskkill.exe /F /T /PID $_.Id 2>&1 | Out-Null
  }
Start-Sleep -Seconds 3

Say '2. Final state snapshot'
Write-Host '--- Services ---'
Get-Service vmcompute, hvservice, vmms, HvHost, gcs -ErrorAction SilentlyContinue |
  Select-Object Name, Status, StartType | Format-Table -AutoSize | Out-String | Write-Host

Write-Host '--- All sandbox-related processes ---'
Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -match 'WindowsSandbox|vmcompute' } |
  Select-Object ProcessName, Id, StartTime, @{N='WS_MB';E={[math]::Round($_.WorkingSet/1MB,1)}}, HandleCount, @{N='Threads';E={$_.Threads.Count}} |
  Format-Table -AutoSize | Out-String | Write-Host

Write-Host '--- Hypervisor ready check ---'
$hp = (Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue).HypervisorPresent
$ver = [System.Environment]::OSVersion.Version.ToString()
Write-Host "  Windows: $ver"
Write-Host "  HypervisorPresent: $hp"

Write-Host "`n=== Phase 4 DONE ===" -ForegroundColor Green