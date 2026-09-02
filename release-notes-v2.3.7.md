# WeavePage v2.3.7 — 编辑器图片 + 视图切换 + 撤销重做 + 通用 Delete 修复包

> 发布日期:2026-09-02
> 关键路径:本版本累积了 10+ 个图片/视图相关 bug 修复,所有改动均经真机装机验收

## 下载

- 完整安装版(`setup.exe`):https://www.aiec.fun/weavepage/download.php?file=WeavePage_2.3.7_x64-setup.exe
- 升级包(`update.exe`,5.5MB):https://www.aiec.fun/weavepage/WeavePage_2.3.7_x64-update.exe
- GitHub Release:https://github.com/kizemo/weavepage/releases/tag/v2.3.7

| 文件 | 大小 | SHA256 |
|---|---|---|
| WeavePage_2.3.7_x64-setup.exe | 254 MB | `d7138c2a35c934fd5ea9321f996f40f5714435db78b539efa1e7233035996094` |
| WeavePage_2.3.7_x64-update.exe | 5.5 MB | `0f9409a4c2f62028cef86978eeeb1fc718e16649e6717c48dc5a467aadc6e890` |

## 修复内容

### 图片插入与显示(v2.3.0 起的最大遗留问题)

- **sidecar img/ 目录**:插入图片时复制到 `<html_dir>/img/img_<sha256前16>.<ext>`,`src` 写相对路径 `img/xxx.jpg`。HTML 文件小巧、可移植、源视图可读。
- **Tauri WebView iframe 限制修复**:WebView 禁 iframe 加载 `file://`,原 `v2.3.1` 的 `<base href="file://...">` 形同虚设。v2.3.6 起 `buildFullDoc(editable=true)` 把 docHtml 里的 `<img src="img/...">` 临时替换为 `<img src="data:image/...;base64,...">`,iframe 看到图片。
- **input 事件剥 data URL**:`iframe.onLoad` 注册的 `input` handler 在 `setDocHtml` 前先做反向映射,把 `data:` URL 还原为 `img/xxx.jpg` 相对路径,**确保 docHtml / 源视图 / 保存文件始终是干净代码**。
- **图片选中**:点图片 → 蓝色框 + `img` 标签 → Delete 删除(也支持任意元素)。

### 视图同步

- **切源码视图不丢编辑**:`editorSrcDoc` useMemo deps 加 `mode` 与 `filePath`,避免切回时 iframe 用旧 docHtml 重建。
- **base 累积修复**:`buildFullDoc` 输出前剥除 `sh.head` 里残留的 `<base>`,旧版本保存不再累积 base tag。
- **iframe overlay 移出 body**:`blockSelectorScript` 把 overlay div 挂到 `documentElement` 而非 `body`,避免被 input 事件捕获。
- **script 移到 head**:blockSelectorScript 从 body 移到 head(若在 body,会被 input 捕获进 docHtml)。

### 撤销/重做(Ctrl+Z / Ctrl+Y)

- 历史栈(`historyRef`)记录 `docHtml` 快照(500ms 防抖,上限 50)
- `iframeReloadKey` 触发 srcDoc 重建以显示历史内容
- iframe 内 keydown 拦截 Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z → postMessage 走 outer handler
- 撤销/重做时 `setDocHtml` 后 `skipNextHistoryRef` 阻止自身入栈

### 通用 Delete 键

- `blockSelectionActive` flag 区分"选区态"(click 后)与"文本编辑态"(开始打字)
- click 块 → flag = true
- input 事件 → flag = false
- Delete/Backspace 在 flag=true 时删整个块(任意元素)
- void 元素(IMG/BR/HR/INPUT)无视 flag 状态都能删

## 完整 changelog(v2.3.0 → v2.3.7)

### v2.3.7(本版本)
- 图片全流程:sidecar img/ 目录 + data URL iframe 渲染 + input 剥 data URL
- 视图同步:editorSrcDoc deps 加 mode + filePath
- 撤销/重做:Ctrl+Z/Y 历史栈
- 通用 Delete:任意元素可删
- base 累积剥除
- iframe overlay 挂 documentElement
- blockSelectorScript 移 head

### v2.3.0 → v2.3.6(已发版)
- 可视块选择 + 容器样式编辑 + 关闭未保存弹窗
- 各种编辑器基础能力

## 升级说明

- **首次安装**:下载 `setup.exe`,双击运行(包含 WebView2 离线包)
- **已安装用户**:WeavePage 内置升级通道会自动拉取 `update.exe`,或手动下载双击(5.5MB,数秒装完)
- **降级**:旧版本(2.2.x → 2.3.0)会先升级到 2.3.0,再升级到 2.3.7

## 文件清单

```
WeavePage_2.3.7_x64-setup.exe   254 MB  完整安装版(落地页)
WeavePage_2.3.7_x64-update.exe   5.5 MB  升级包(应用内升级)
```

## 已知问题

- 浏览器打开保存的 HTML,在 IE 11 / Edge Legacy 不可用(需 WebView2 / Chromium 内核)
- 在 Windows 7 不可用(需 Windows 10+)

## 反馈

- Issues:https://github.com/kizemo/weavepage/issues
- 邮件:aiec.fun
