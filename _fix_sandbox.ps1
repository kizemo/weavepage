# Sandbox fix — handoff §4 recommended path (Win11 24H2 logon flake mitigation)
# All messages in English to avoid PS 5.1 ANSI/UTF-8 ambiguity on CJK tokens.
$ErrorActionPreference = 'Continue'

function Say($msg, $color = 'Cyan') {
  Write-Host "`n=== $msg ===" -ForegroundColor $color
}

Say '0. Before state'
Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -match 'WindowsSandbox|vmcompute' } |
  Select-Object ProcessName, Id, StartTime, @{N='WS_MB';E={[math]::Round($_.WorkingSet/1MB,1)}} |
  Format-Table -AutoSize | Out-String | Write-Host

Get-Service vmcompute, hvservice, vmms, HvHost -ErrorAction SilentlyContinue |
  Select-Object Name, Status | Format-Table -AutoSize | Out-String | Write-Host

Say '1. Stop vmcompute service'
Stop-Service -Name vmcompute -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
$vmc = Get-Service vmcompute -ErrorAction SilentlyContinue
Write-Host "  vmcompute status after Stop: $($vmc.Status)"

Say '2. Kill zombie WindowsSandboxServer.exe processes'
$zombies = Get-Process -Name WindowsSandboxServer -ErrorAction SilentlyContinue
if ($zombies) {
  $zombies | ForEach-Object {
    Write-Host "  Killing PID $($_.Id), StartTime=$($_.StartTime), WS=$([math]::Round($_.WorkingSet/1MB,1))MB"
    $_ | Stop-Process -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
  $left = Get-Process -Name WindowsSandboxServer -ErrorAction SilentlyContinue
  if ($left) {
    Write-Host "  WARN: still alive: $($left.Id -join ',')" -ForegroundColor Yellow
  } else {
    Write-Host "  OK: all WindowsSandboxServer.exe killed" -ForegroundColor Green
  }
} else {
  Write-Host "  No WindowsSandboxServer.exe running, nothing to kill"
}

Say '3. Restart hvservice (VSP)'
Stop-Service -Name hvservice -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-Service -Name hvservice -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
$hvs = Get-Service hvservice -ErrorAction SilentlyContinue
Write-Host "  hvservice status: $($hvs.Status)"

Say '4. Start vmcompute'
Start-Service -Name vmcompute -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5
$vmc2 = Get-Service vmcompute -ErrorAction SilentlyContinue
Write-Host "  vmcompute status: $($vmc2.Status)"

Say '5. Wait 30 seconds for hypervisor re-init'
Start-Sleep -Seconds 30

Say '6. Verify Hyper-V ready'
$sys = systeminfo 2>$null | Select-String -Pattern 'Hyper-V'
$sys | ForEach-Object { Write-Host "  $_" }
$hp = (Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue).HypervisorPresent
Write-Host "  HypervisorPresent: $hp"

Say '7. After state'
Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -match 'WindowsSandbox|vmcompute' } |
  Select-Object ProcessName, Id, StartTime, @{N='WS_MB';E={[math]::Round($_.WorkingSet/1MB,1)}} |
  Format-Table -AutoSize | Out-String | Write-Host

Get-Service vmcompute, hvservice, vmms, HvHost -ErrorAction SilentlyContinue |
  Select-Object Name, Status | Format-Table -AutoSize | Out-String | Write-Host

Write-Host "`n=== DONE. User should now try launching a blank WindowsSandbox.exe manually ===" -ForegroundColor Green