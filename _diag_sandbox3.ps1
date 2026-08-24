# 三轮诊断 — 拿具体错误事件
$ErrorActionPreference = 'Continue'

Write-Host '=== System 日志最近 100 条 Hyper-V / Containers / HCS ==='
$Providers = @(
  'Microsoft-Windows-Hyper-V-Hypervisor',
  'Microsoft-Windows-Hyper-V-VmSwitch',
  'Microsoft-Windows-Hyper-V-Worker',
  'Microsoft-Windows-Containers',
  'Microsoft-Windows-Containers-Wcs',
  'Microsoft-Windows-Containers-Worker',
  'Microsoft-Windows-Containers-ImgMgr',
  'Microsoft-Windows-WindowsSandbox',
  'Microsoft-Windows-HostGuardianService'
)

ForEach ($p in $Providers) {
  Write-Host "--- $p ---"
  try {
    Get-WinEvent -LogName 'System' -ProviderName $p -MaxEvents 20 -ErrorAction SilentlyContinue |
      Where-Object { $_.LevelDisplayName -in @('Error','Warning') -or $_.Id -gt 1000 } |
      Select-Object -First 15 TimeCreated, Id, LevelDisplayName, @{N='Msg';E={$_.Message.Substring(0,[Math]::Min(200,$_.Message.Length))}} |
      Format-Table -AutoSize -Wrap
  } catch { Write-Host "(无事件)" }
}

Write-Host '=== Application 日志最近 50 条 Application Error / .NET Runtime ==='
Get-WinEvent -LogName 'Application' -MaxEvents 50 -ErrorAction SilentlyContinue |
  Where-Object { $_.LevelDisplayName -in @('Error','Warning') -and ($_.ProviderName -match 'Application Error|.NET Runtime|Windows Error Reporting|HCS|Hyper-V|Sandbox') } |
  Select-Object -First 20 TimeCreated, ProviderName, Id, LevelDisplayName, @{N='Msg';E={$_.Message.Substring(0,[Math]::Min(200,$_.Message.Length))}} |
  Format-Table -AutoSize -Wrap

Write-Host '=== Microsoft-Windows-Containers-Wcs / -Worker 日志 ==='
Get-WinEvent -LogName 'Microsoft-Windows-Containers-Wcs' -MaxEvents 20 -ErrorAction SilentlyContinue |
  Select-Object TimeCreated, Id, LevelDisplayName, @{N='Msg';E={$_.Message.Substring(0,[Math]::Min(200,$_.Message.Length))}} |
  Format-Table -AutoSize -Wrap
Get-WinEvent -LogName 'Microsoft-Windows-Containers-Worker' -MaxEvents 20 -ErrorAction SilentlyContinue |
  Select-Object TimeCreated, Id, LevelDisplayName, @{N='Msg';E={$_.Message.Substring(0,[Math]::Min(200,$_.Message.Length))}} |
  Format-Table -AutoSize -Wrap

Write-Host '=== Sandbox 二进制路径 / 版本 ==='
$sb = Get-ItemProperty 'C:\Windows\System32\WindowsSandbox.exe' -ErrorAction SilentlyContinue
if ($sb) { $sb | Select-Object FullName, VersionInfo | Format-List }
$wss = Get-ItemProperty 'C:\Windows\System32\WindowsSandboxServer.exe' -ErrorAction SilentlyContinue
if ($wss) { $wss | Select-Object FullName, VersionInfo | Format-List }

Write-Host '=== Done ==='