# WeavePage v0.1.11

## 修复 Ribbon「页面背景」按钮选色无效

v0.1.10 装上后,功能区「背景」按钮选任意颜色,编辑区背景都没变化。两个原因:

### 1. CSS 优先级 — 注入规则输给页式视图的「白纸」背景

`scopedCss` 把文档里的 `body { background-color: X }` 改写成 `.editor-body { ... }`(specificity 0,1,0)。
但 App.css 的 `.editor-page .editor-body { background: var(--page-bg) }`(0,2,0)在「页式视图」下直接覆盖,
注入的 `<style>` 输了优先级,看起来没生效。

**修复**:`scopedCss` 改写为 `.editor-scroll .editor-body { ... }`(0,2,0)。
和 `.editor-page .editor-body` 平局,但注入的 `<style>` 在 DOM 中位于 App.css 之后,平局靠后胜出,
可正确覆盖页式视图的「白纸」背景。

### 2. 空文档 `shell=null` 时 `handlePageBg` 早退

`emptyDoc()` 初始化 `shell: null`,原 `handlePageBg` 第一行 `if (!shell) return` 直接退出,
新建空白文档选色啥都不发生。

**修复**:`handlePageBg` 在 shell 为 null 时用最小 DocShell 兜底,让选色立刻生效,
保存时也能带上 `<style id="weavepage-body-bg">` 命名块。

## in-app 升级兜底(老版本 ACL 拒绝时降级到浏览器)

v0.1.9 升级到 v0.1.10 时报 `open_path not allowed by ACL` — v0.1.9 没声明 `opener:allow-open-path`。
v0.1.10 已加权限,但 chicken-and-egg 让 v0.1.9 无法升级到 v0.1.10。

**修复**:`startInAppUpgrade` 在 catch 里识别 ACL 错误,自动改用 `openUrl` 打开下载页
(`opener:default` 自带 `allow-open-url`,老版本可用)。
老版本用户不用手动打开浏览器也能升级。

## 下载与校验

- **NSIS 安装包**:`WeavePage_0.1.11_x64-setup.exe`
- **NSIS SHA256**:`4bdc4a2cf7eda1614dcb8931d4eced7f834e4789a1a841197abb9debec24fb76`
- **MSI 安装包**:`WeavePage_0.1.11_x64_en-US.msi`
- **MSI SHA256**:`2e7bd9febf41ae050782650a5749ac85a9dc4486dd9a3b8bce47db704a85e292`

## 注意事项

**Cloudflare 缓存**:`https://www.aiec.fun/weavepage/version.json` 在边缘有 2h 缓存,旧版本的 in-app 升级检查可能短暂拉不到 v0.1.11。重启 WeavePage 或等 2h 即可。