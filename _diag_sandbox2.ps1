# 二轮诊断 — 虚拟化层 + 沙盒日志
$ErrorActionPreference = 'Continue'

Write-Host '=== systeminfo Hyper-V 需求节 ==='
$sys = systeminfo 2>$null | Select-String -Pattern 'Hyper'
$sys | ForEach-Object { Write-Host $_ }

Write-Host '=== WSL 状态 (Hypervisor 是否在跑) ==='
wsl --status 2>&1 | Select-Object -First 20

Write-Host '=== 虚拟化平台是否启用 ==='
Get-CimInstance -ClassName Win32_ComputerSystem |
  Select-Object Manufacturer, Model, HypervisorPresent, SystemType |
  Format-List

Write-Host '=== Hyper-V 虚拟机监控程序 (hypervisor) 是否运行 ==='
Try {
  Get-CimInstance -Namespace 'root\virtualization\v2' -ClassName Msvm_VirtualSystemManagementService 2>$null |
    Select-Object Name, ElementName, EnabledState, HealthState |
    Format-List
} Catch { Write-Host "Err: $_" }

Write-Host '=== Windows 沙盒 / Hyper-V 服务 (完整列表) ==='
Get-Service | Where-Object {
  $_.Name -match 'vmcompute|vmms|hvservice|hcs|vmic|vmsif|vmsmb|vmicheartbeat|gcs|icss|hv|hyper'
} | Select-Object Name, Status, StartType, DisplayName | Format-Table -AutoSize

Write-Host '=== HCS 服务详情 ==='
Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\hcs' -ErrorAction SilentlyContinue |
  Select-Object Start, Type, ErrorControl, DependOnService |
  Format-List

Write-Host '=== Sandbox 注册表 + 默认 .wsb 配置 ==='
Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Containers\DisposableClientVM' -ErrorAction SilentlyContinue |
  Format-List

Write-Host '=== 应用日志:最近 50 条 Hyper-V-Hypervisor / HCS / sandbox 错误 ==='
Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=(Get-Date).AddHours(-2); ProviderName='*hyper-v*','Microsoft-Windows-Hyper-V*','HCS','*Sandbox*','Microsoft-Windows-Containers-Wcs','Microsoft-Windows-Containers-Worker*'} -ErrorAction SilentlyContinue |
  Select-Object -First 50 TimeCreated, ProviderName, Id, LevelDisplayName, Message |
  Format-Table -AutoSize -Wrap

Write-Host '=== 系统日志:Hyper-V-Hypervisor 错误 ==='
Get-WinEvent -LogName 'Microsoft-Windows-Hyper-V-Hypervisor-Operational' -MaxEvents 30 -ErrorAction SilentlyContinue |
  Select-Object TimeCreated, Id, LevelDisplayName, Message |
  Format-Table -AutoSize -Wrap

Write-Host '=== Done ==='