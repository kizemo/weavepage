# Phase 2 — kill zombie via taskkill /F /T (Win32 TerminateProcess), restart HvHost
$ErrorActionPreference = 'Continue'

function Say($msg, $color = 'Cyan') {
  Write-Host "`n=== $msg ===" -ForegroundColor $color
}

Say '1. taskkill /F /T on zombie WindowsSandboxServer.exe'
$zombies = Get-Process -Name WindowsSandboxServer -ErrorAction SilentlyContinue
if ($zombies) {
  foreach ($z in $zombies) {
    Write-Host "  taskkill /F /T /PID $($z.Id)"
    $r = & taskkill.exe /F /T /PID $z.Id 2>&1
    $r | ForEach-Object { Write-Host "    $_" }
  }
  Start-Sleep -Seconds 3
  $left = Get-Process -Name WindowsSandboxServer -ErrorAction SilentlyContinue
  if ($left) {
    Write-Host "  STILL ALIVE after taskkill /F /T: $($left.Id -join ',')" -ForegroundColor Red
    foreach ($l in $left) {
      Write-Host "    PID $($l.Id) — HandleCount=$($l.HandleCount), Threads=$($l.Threads.Count)"
    }
  } else {
    Write-Host "  OK: zombies gone" -ForegroundColor Green
  }
} else {
  Write-Host "  No zombies left"
}

Say '2. Start HvHost service'
Start-Service -Name HvHost -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
$hv = Get-Service HvHost -ErrorAction SilentlyContinue
Write-Host "  HvHost status: $($hv.Status)"

Say '3. Final state'
Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -match 'WindowsSandbox|vmcompute' } |
  Select-Object ProcessName, Id, StartTime, @{N='WS_MB';E={[math]::Round($_.WorkingSet/1MB,1)}} |
  Format-Table -AutoSize | Out-String | Write-Host

Get-Service vmcompute, hvservice, vmms, HvHost -ErrorAction SilentlyContinue |
  Select-Object Name, Status | Format-Table -AutoSize | Out-String | Write-Host

Say '4. Try launching a blank WindowsSandbox.exe (60s watchdog)'
$proc = Start-Process -FilePath 'C:\Windows\System32\WindowsSandbox.exe' -PassThru -ErrorAction SilentlyContinue
if ($proc) {
  Write-Host "  Started PID $($proc.Id), waiting 60s for sandbox UI to appear or fail..."
  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Seconds 5
    $p = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
    if (-not $p) {
      Write-Host "  Sandbox process exited early after ~$($i*5)s" -ForegroundColor Yellow
      break
    }
    $sandboxProc = Get-Process -Name WindowsSandbox -ErrorAction SilentlyContinue
    Write-Host "    t=$($i*5)s — WindowsSandbox.exe alive: $($null -ne $sandboxProc), main WS=$([math]::Round($p.WorkingSet/1MB,1))MB"
  }
  $alive = Get-Process -Name WindowsSandboxServer,WindowsSandbox -ErrorAction SilentlyContinue
  if ($alive) {
    Write-Host "  Final: sandbox procs running:" -ForegroundColor Green
    $alive | Select-Object ProcessName, Id, StartTime, @{N='WS_MB';E={[math]::Round($_.WorkingSet/1MB,1)}} |
      Format-Table -AutoSize | Out-String | Write-Host
  } else {
    Write-Host "  Final: NO sandbox process running (likely init failed)" -ForegroundColor Red
    Write-Host "  Cleaning up..." -ForegroundColor Yellow
    Stop-Process -Name WindowsSandbox -Force -ErrorAction SilentlyContinue
    Stop-Process -Name WindowsSandboxServer -Force -ErrorAction SilentlyContinue
  }
} else {
  Write-Host "  Could not start WindowsSandbox.exe" -ForegroundColor Red
}

Write-Host "`n=== Phase 2 DONE ===" -ForegroundColor Green