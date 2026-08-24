# WeavePage v0.1.8

## in-app 升级:streaming 下载 + 进度 overlay + 自动关窗

解决 v0.1.7 反馈的三个体验问题:
1. 弹窗后等很久才报错(`Failed to fetch`,因为 220MB 一次性 arrayBuffer 在 webview heap 触发 IPC 流断)
2. 看不到任何下载过程
3. 不关闭主窗口,安装受影响

### 新行为

- **实时进度 overlay**:点击「立即升级」后,屏幕右下角浮出 progress <div>,实时显示 `XX%` + 进度条 + 已下载/总字节(例如 `120.5 MB / 220.0 MB`)
- **自动关窗**:下载完成 + 启动 installer 后等 1.5s(让 NSIS 锁定文件),`getCurrentWindow().close()` 自动关闭本应用。若 close 失败,降级弹 message 提示用户手动关闭
- **streaming download**:用 `response.body.getReader()` 累积字节,避免一次性 arrayBuffer 超大文件崩溃
- **错误仍可见**:任何步骤失败弹 `message(kind=error)` 显示真实原因

### AboutDialog 越界修复

**「帮助 → 关于 WeavePage → 立即更新」按钮现在也走 in-app 升级**(之前是 `openUrl(APP_DOWNLOAD_URL)` 跳浏览器)。**注**:AboutDialog.tsx 在 v0.1.3 dirty 工作区,本次越界修是因为用户显式要求。

## 下载与校验

- **NSIS 安装包**:`WeavePage_0.1.8_x64-setup.exe`
- **SHA256**:`d84e236bda96d66deb8598739491c479911a875e9a4660a62f54e63840fc973f`

```
certutil -hashfile WeavePage_0.1.8_x64-setup.exe SHA256
```

## v0.1.6 → v0.1.7(降撤销组 + 加页面背景)

如果你是从 v0.1.6 升级,这之间还有:
- v0.1.7 Ribbon 加「页面背景」按钮(浅色调色板)
- 撤销组(撤销 + 重做按钮)已移除
