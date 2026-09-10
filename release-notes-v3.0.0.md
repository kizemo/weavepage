# WeavePage v3.0.0 — 图片拖拽/粘贴 + 编辑器体验全面升级

> 发布日期:2026-09-10
> 主线:图片插入从「按钮选文件」进化为「拖拽 / 粘贴 + SHA-256 去重」,编辑器图片流程彻底完善

## 下载

- 完整安装版(`setup.exe`):https://www.aiec.fun/weavepage/download.php?file=WeavePage_3.0.0_x64-setup.exe
- 升级包(`update.exe`,5.5MB):https://www.aiec.fun/weavepage/WeavePage_3.0.0_x64-update.exe
- GitHub Release:https://github.com/kizemo/weavepage/releases/tag/v3.0.0

| 文件 | 大小 | SHA256 |
|---|---|---|
| WeavePage_3.0.0_x64-setup.exe | 254 MB | `f37155594a3bad985cc59d743c2e25385c904d21566c1d32aa206a2d790acfab` |
| WeavePage_3.0.0_x64-update.exe | 5.5 MB | `5efbd68a4f26fe17706d2d7e9cedef11802e6ad9f0cdd6f7310cb85598a853de` |

## 新增功能

### 图片拖拽插入(Tauri IPC 实现)

- **从资源管理器拖图片到 WeavePage 任意位置**(编辑器 / Ribbon / Sidebar / StatusBar),自动落盘 + 插入文档
- 拖入多张图片时按 OS 顺序逐张处理(过滤非图片)
- 非图片文件(`.txt` / `.zip` 等)自动跳过,不报错

### 图片粘贴插入(Ctrl+V)

- 截图工具 / 浏览器复制图片后,在编辑器聚焦按 `Ctrl+V` 直接插入
- 自动用 SHA-256 前 16 位哈希命名,内容相同则去重(同图不重复落盘)
- 粘贴的文件没有原始文件名时用 `pasted_<timestamp>.<ext>` 命名

### 图片流程统一入口

- 三个入口(按钮选文件 / 拖拽 / 粘贴)共用同一份 `processImageBytes()` 函数
- 写入磁盘前用 SHA-256 哈希,**重复图片自动去重**(同内容不写第二份)
- 图片文件全部存放在 `<html_dir>/img/img_<hash>.<ext>`,源视图是干净的相对路径

## 修复与重构

### 拖拽流程根因(Tauri 2.x 已知机制)

- **坑点**:Tauri 2.x 把 webview 的 OS drag-drop events **完全拦截**,**不走 DOM `dragover` / `drop` 事件**,只通过 `getCurrentWebviewWindow().onDragDropEvent(callback)` IPC 转发文件路径
- **错误尝试 1**:iframe 内 DOM `dragover` 无条件 `preventDefault` — **no-op**,因为 DOM 根本不收 events
- **错误尝试 2**:`tauri.conf.json` 加 `"dragDropEnabled": true` — **no-op**(默认值已是正确状态)
- **正确方案**:用 `getCurrentWebviewWindow().onDragDropEvent`,callback 拿到 `payload.paths`(Rust 端验证过的绝对路径),走 `readFile` + `processImageBytes`
- 移除 iframe 内 DOM `dragover` / `drop` listener(纯噪音,留给 paste listener 仍可工作)

### 视图切换不丢编辑(v2.3.7)

- `editorSrcDoc` useMemo deps 加 `mode` + `filePath`,切源码/编辑视图不丢光标
- `srcDocVersion` 触发 srcDoc 重建,图片缓存更新后 iframe 立即显示新图

### 撤销/重做 Ctrl+Z / Ctrl+Y(v2.3.7)

- 历史栈(`historyRef`)记录 `docHtml` 快照,500ms 防抖,上限 50
- `iframeReloadKey` 触发 srcDoc 重建,iframe 显示历史快照
- `skipNextHistoryRef` 防止 undo/redo 自身入栈

### 通用 Delete 键(v2.3.7)

- `blockSelectionActive` flag 区分「选区态」与「文本编辑态」
- 任意块元素可删除(void 元素 IMG/BR/HR/INPUT 无视 flag)

## 完整 changelog(v2.3.0 → v3.0.0)

### v3.0.0(本版本,2026-09-10)
- **新增 图片拖拽**:Tauri IPC `onDragDropEvent` 接管,所有 OS drag-drop 路径生效
- **新增 图片粘贴**:iframe 内 `paste` listener + postMessage,所有 OS clipboard image 生效
- **重构 `processImageBytes`**:按钮 / 拖拽 / 粘贴共用 SHA-256 去重 + sidecar 写入
- **修复 Tauri 2.x drag-drop 误解**:移除 no-op 的 iframe DOM 监听器,文档 IPC 机制
- **清理**:移除 v2.3.8/v2.3.9 调试用 `console.log` / 重复 listener

### v2.3.7(2026-09-02)
- **图片全流程**:sidecar `img/` 目录 + data URL iframe 渲染 + input 事件反向剥 data URL
- **视图同步**:`editorSrcDoc` deps 加 `mode` + `filePath` + `srcDocVersion`
- **撤销/重做**:`Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z` 走历史栈
- **通用 Delete**:`blockSelectionActive` flag + void 元素特判
- **base 累积剥除**:`buildFullDoc` 输出前剥除 `sh.head` 残留 `<base>`
- **iframe overlay 挂 documentElement**:`blockSelectorScript` 把 hover/selected overlay 移出 body,避免被 input 事件污染 docHtml
- **script 移到 head**:`blockSelectorScript` 改在 `<head>` 注入,避免 body input 捕获

### v2.3.0(2026-08-28)
- **可视块选择(Goal 1)**:编辑器内 hover / click 任意块元素 → 蓝实线 + breadcrumb 角标;Esc 脱选;Ctrl+↑/↓ drill 父/子
- **容器样式编辑(Goal 2)**:Ribbon 编辑 tab 末尾「容器」组(背景 / 边框 / 圆角 / 内边距)+ ⭐「提升」按钮把 inline 抽成 head CSS 命名块规则
- **关闭未保存弹窗(Goal 3)**:应用关闭时若 dirty tab → 自定义 React 模态列 dirty tabs
- **重构 块选择架构**:iframe 内 srcdoc 注入 `<script>` 自渲染 overlay,通过 postMessage 跟 outer 通信(规避 Tauri WebView2 跨 frame 监听不可靠问题)

### v2.2.0(2026-08-27)
- **顶级 Ribbon Tab**:「设计」tab 从「编辑」内 dropdown 提升为顶级 tab(与「编辑」「插入」平级)
- **重构 缩略图横排条**:9 张缩略图(默认 + 8 套预设)改为 ribbon 内 scrollable 横排

### v2.1.0(2026-08-26)
- **文档设计子菜单**:8 套预设 CSS(经典学术 / 现代简约 / 文艺书卷 / 科技感 / 商务正式 / 柔雅 / 薄荷清新 / 复古印刷)
- **设计样式持久化**:选中 design CSS 注入 `<style data-weavepage-design>` 到 `<head>`,保存重开自动恢复

### v0.1.x(2026-08-14 ~ 2026-08-16)
- 文件菜单「打开最近」二级子菜单 + 「最近使用」色组
- 「更多颜色」原生系统色盘(WebView2)
- 多标签 / 预览 / 源码视图 / 块源码 / 外联资源侧边栏
- 织纹 W 品牌应用图标

## 升级说明

- **首次安装**:下载 `setup.exe`,双击运行(包含 WebView2 离线包)
- **已安装用户**:WeavePage 内置升级通道会自动拉取 `update.exe`,或手动下载双击(5.5MB,数秒装完)
- **从 2.x 升级**:NSIS 升级链自动处理,文档 / 配置 / 设置全部保留

## 文件清单

```
WeavePage_3.0.0_x64-setup.exe   ~254 MB  完整安装版(落地页)
WeavePage_3.0.0_x64-update.exe   5.5 MB   升级包(应用内升级)
```

## 已知问题 / 下个版本目标

- **大图卡 UI**:base64 编码仍在主线程,2-5MB 图片会卡 UI 100-300ms(下版本挪到 Web Worker)
- **切源码视图光标丢失**:用 `useMemo` 重建 srcDoc 时 caret offset 未持久化
- **撤销栈不持久化**:重启应用后历史栈丢失(下次会话再支持)

## 反馈

- Issues:https://github.com/kizemo/weavepage/issues
- 邮件:aiec.fun
