# 沙盒初始化失败诊断脚本 — 收集证据用
$ErrorActionPreference = 'Continue'

Write-Host '=== Windows 版本 ==='
[System.Environment]::OSVersion | Format-List
Get-ComputerInfo -Property WindowsProductName, WindowsVersion, OsHardwareAbstractionLayer, WindowsInstallationType, WindowsBuildLabEx 2>$null | Format-List

Write-Host '=== Hyper-V 相关服务 ==='
Get-Service vmcompute, hcs, vmms, hvservice -ErrorAction SilentlyContinue |
  Select-Object Name, Status, StartType, DisplayName |
  Format-Table -AutoSize

Write-Host '=== 沙盒相关进程 ==='
Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -match 'WindowsSandbox|vmcompute' } |
  Select-Object ProcessName, Id, StartTime, @{N='WS_MB';E={[math]::Round($_.WorkingSet/1MB,1)}} |
  Format-Table -AutoSize

Write-Host '=== Windows 沙盒可选功能 ==='
Get-WindowsOptionalFeature -Online -FeatureName 'Containers-DisposableClientVM' 2>$null |
  Select-Object FeatureName, State, RestartRequired |
  Format-List

Write-Host '=== Hyper-V 平台/虚拟机监控程序/虚拟机平台 ==='
Get-WindowsOptionalFeature -Online -FeatureName 'HypervisorPlatform','Microsoft-Hyper-V-All','Microsoft-Hyper-V','VirtualMachinePlatform' 2>$null |
  Select-Object FeatureName, State, RestartRequired |
  Format-Table -AutoSize

Write-Host '=== CPU 虚拟化支持 ==='
Get-CimInstance -ClassName Win32_Processor |
  Select-Object Name, VirtualizationFirmwareEnabled, SecondLevelAddressTranslationExtensions |
  Format-Table -AutoSize

Write-Host '=== 安全启动 / VBS 状态 ==='
Try { Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorBIOSParameters 2>$null | Select-Object InstanceName | Format-Table -AutoSize } Catch {}
Try {
  $sec = Get-CimInstance -Namespace root\wmi -ClassName SecurityInformation01 2>$null
  if ($sec) { $sec | Select-Object * | Format-List }
} Catch {}

Write-Host '=== Done ==='