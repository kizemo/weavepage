# WeavePage 架构

> 读 [PROJECT.md](./PROJECT.md) + [code-map.md](./code-map.md) 后看这边。

## 1. 系统边界

```
┌─────────────────────────── 桌面进程内(WebView2 渲染) ───────────────────────────┐
│                                                                                    │
│   ┌────────────────────────────────────────────────────────────────────┐          │
│   │  React 19 + Tiptap 3.30(ProseMirror)                                │          │
│   │                                                                     │          │
│   │   App.tsx (中央)                                                    │          │
│   │    ├─ MenuBar / Ribbon / TabBar / Sidebar / StatusBar / AboutDialog│          │
│   │    ├─ BlockSourcePanel / EditorContextMenu                          │          │
│   │    └─ utils/* (纯函数;in-app upgrade 远程 RPC 在这里)             │          │
│   │                                                                     │          │
│   └────────────────────────────────────────────────────────────────────┘          │
│                          │                                                       │
│                          │ Tauri 桥(JS ↔ Rust IPC)                                 │
│                          ▼                                                       │
│   ┌────────────────────────────────────────────────────────────────────┐          │
│   │  Rust host(src-tauri/src/lib.rs)                                   │          │
│   │    ├─ tauri-plugin-fs (writeFile 启动器或下载文件)               │          │
│   │    ├─ tauri-plugin-http (fetch Rust 后端代理,绕过 webview CORS)  │          │
│   │    ├─ tauri-plugin-opener (openUrl / openPath 启动 .exe)          │          │
│   │    └─ tauri-plugin-dialog (ask / message 模态)                     │          │
│   └────────────────────────────────────────────────────────────────────┘          │
│                          │                                                       │
│   ┌────────────────────────webview fs namespace─────────────────────────┐        │
│   │  %APPDATA%\fun.aiec.weavepage\  recent-files.json, recent-colors   │        │
│   │  %USERPROFILE%\Downloads\WeavePage-X.Y.Z-setup.exe(升级下载产物)    │        │
│   └────────────────────────────────────────────────────────────────────┘        │
└────────────────────────────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
  ┌────────────┐    ┌────────────┐     ┌──────────────────┐
  │ filesystem │    │ Tauri 后端  │     │ aiec.fun 网络   │
  │ local *.html│    │ NSIS       │     │ /version.json   │
  │  via dialog │    │ installer  │     │ /weavepage/...   │
  │  (save/open)│    │            │     │ Cloudflare cache │
  └────────────┘    └────────────┘     └──────────────────┘
```

## 2. 启动流程(从冷启动 → 编辑就绪)

```
1. tauri 启动 Rust host
2. 注册 4 个 plugin(fs / http / opener / dialog)
3. WebView2 加载 dist/index.html
4. JS:bundle 解析 React,创建 useEditor 实例
   ├─ 配置 extensions 列表(StarterKit + GlobalAttrs + 颜色 / 字体 / 高亮 / 链接 / 表格 / 任务 / 占位...)
   ├─ 配置 content="<p></p>"(空白文档)
   └─ 绑定 onUpdate → setIsModified + updateActiveDoc + setWordCount
5. App 渲染 TabBar + MenuBar + Ribbon + 内容区(空)+ StatusBar
6. 启动 useEffect:
   ├─ getCurrentWindow → setAppVersion
   ├─ fetchRemoteVersion → 若 newer:
   │   - ask("发现新版本 vX.Y.Z ...", okLabel="立即升级")
   │   - 若 ok:startInAppUpgrade(remote.url, filename)
   └─ 加载最近文件/最近颜色到 state
7. 用户点击 open / 双击 .html 文件:
   parseShell(fullHtml) → DocShell
   editor.commands.setContent(doc.body)
```

## 3. 编辑流程(用户敲字到显示)

```
键入
  → Tiptap 捕获 input event
  → ProseMirror EditorView.dispatch(transaction)
  → 编辑器 state 改变
  → Tiptap 触发 onUpdate({ editor })
  → App.tsx 的 listener:
     ├─ setIsModified(true)
     ├─ updateActiveDoc({ isModified: true })
     └─ setWordCount(editor.getText().length)
  → React 重渲染选中状态(Ribbon 的 fmt/selector 重算)
  → 显示新内容
```

Ribbon 的 `useEditorState` hook 在每次状态变时让 selector 重算,只对引用变化的部分才重渲染(`bold/italic/.../lineHeight/marginTop/marginBottom`)。

## 4. 文件保存流程

```
Ctrl+S 触发
  → MenuBar/快捷键 路由到 saveFile handler
  → editor.getHTML() → 完整 body HTML
  → buildFullDoc(html, shell) → 拼出完整 HTML 文档(doctype + head + body)
  → Tauri dialog.save → 用户选路径
  → writeFile(path, fullDoc)
  → setIsModified(false)
  → updateActiveDoc({ filePath, isModified: false })
  → pushRecent(path)
```

buildFullDoc 的实现细节在 `src/utils/formatHtml.ts`。

## 5. 样式持久化流程(右键「设为默认样式」)

```
右键块
  → handleEditorContextMenu → 防默认 + 弹 setContextMenu
  → 用户点「设为默认样式」
  → handleSetAsDefault:
     ├─ readBlockExplicitProps()  ←── 从节点 DOM 读 textStyle/highlight mark + inline style
     ├─ blockTypeToSelector(node.type.name, node.attrs) → "p" | "h1"|...|"h6"
     ├─ upsertShellHead(shell.head, selector, props)
     │    ↑ parseStyleBlock(已有命名块)
     │    ↑ 合并 + upsertStyleBlock
     │    ↑ 替换或追加 <style id="weavepage-default-styles">
     └─ setShell({ ...shell, head, headCss }) + updateActiveDoc({ shell })
```

App 渲染时:
```
<style>{scopedCss(shell.headCss)}</style>  ← 把 body { ... } 改名为 .editor-body
```

白名单 8 项外的属性读不出来不写;已有 inline style 不动(参 spec)。

## 6. 升级流程(in-app 升级)

```
启动 useEffect 拉到 remote 较新
  → ask("立即升级")
  → startInAppUpgrade(remote.url, filename):
     ├─ 创建 fixed <div> overlay(右下角,百分比 + 进度条 + 字节数)
     ├─ downloadInstaller:
     │    ├─ res = tauriFetch(url, GET)  ← Rust 后端代理
     │    ├─ const total = res.headers.get("content-length")
     │    ├─ reader = res.body.getReader()  ← streaming
     │    ├─ while read: chunks.push(value)
     │    └─ writeFile(downloadDir/join(filename), chunks)
     │       ← 全程更新 overlay 百分比
     ├─ openPath(filepath)  ← Rust ShellExecute 启动 NSIS 安装器
     ├─ await 1.5s 让 NSIS 锁定文件
     ├─ getCurrentWindow().close()  ← 关主窗口
     │    (失败 → message() fallback 提醒用户手动关)
     └─ 任何步骤错 → message(kind=error) 弹真实错误,不静默
```

注意 capabilities 加了 `opener:allow-open-path`,否则 `plugin:opener|open_path` ACL 拒绝(v0.1.10 修复)。

## 7. 关键数据结构

### DocState(`src/components/TabBar.tsx`)
```ts
interface DocState {
  id: number;           // 自增,TabBar key
  kind: "html" | "text";
  body: string;         // editor.getHTML()
  sourceText: string;   // 源码视图状态(text/html only)
  mode: "edit" | "preview";
  shell: DocShell;      // 仅 html
  rawFullDoc: string;   // 完整文档原文,用于「网页预览」iframe
  filePath: string | null;
  isModified: boolean;
  resources: ResourceRef[];  // 侧栏显示用,自动从 doc 中扫描 link/script/img
}
```

### DocShell(`src/App.tsx`)
```ts
interface DocShell {
  doctype: string;
  head: string;           // head.innerHTML,保存时直接回到 .html
  headCss: string;        // <style> 内容,运行时给 scopedCss 包装到 .editor-body
  bodyAttrs: string;      // <body ...> 属性,保存回去
  scripts: string;        // <body> 内 <script>
  styles: string;         // <body> 内 <style>
  baseHref: string;
}
```

## 8. Tauri ACL(`src-tauri/capabilities/default.json` 当前 v0.1.10)

```json
{
  "permissions": [
    "core:default",                    // 包含 show/hide/close 等窗口命令
    "opener:default",                  // openUrl / revealItemInDir / defaultUrls
    "opener:allow-open-path",          // v0.1.10 加:openPath() 启动 .exe
    "dialog:default",                  // ask / message / open / save
    "fs:default", "fs:allow-read-text-file", "fs:allow-write-text-file",
    "fs:allow-read-file", "fs:allow-write-file",
    { "fs:scope": { "allow": ["**"] } },
    "http:default",
    { "http:allow-fetch": {
      "allow": [
        { "url": "https://www.aiec.fun" },
        { "url": "https://*.aiec.fun" }
      ]
    }}
  ]
}
```

**任何新加的 `plugin-X|Y` 命令,如未在 `default` 集合里,需单独 declare**。常见踩坑(已在 hot-fix history):
- `opener|open_path` 用了却忘 declare → `Command plugin:opener|open_path not allowed by ACL`

## 9. CSP / scopedCss 策略

`app.security.csp = null`(让 webview 不受 CSP 限制 — 我们的 web 是纯本地数据驱动)。

`src/utils/App.css` 没用 native CSS scope,而是 Tauri `scopedCss()` 把文档 CSS 重写:
```
html  → .editor-scroll
body  → .editor-body
position: fixed  → position: absolute
```

作用域到 webview 内,不污染应用 chrome。

## 10. 服务端约束

| 约束 | 影响 | workaround |
|---|---|---|
| aiec nginx 不认 `.htaccess` | `/weavepage/` 目录请求 → 403 | 在 `/var/www/wordpress/weavepage/index.html` 放 meta refresh 跳 `download.php`(v0.1.5+) |
| Cloudflare cache max-age=7200 (2h) | server 改动要等 ≤2h 才能稳态 | 用 `?_<timestamp>` cache-bust 直链 |
| `kizemo` 没 sudo | nginx config 改不动 | workaround 在 weavepage 目录(file owner = kizemo)|
| Tauri bundle 文件锁(os error 32) | 偶发 build 失败 | 重试即可(NSIS/Defender 临时占用)|

详见 `~/.claude/projects/.../memory/project_aiec_nginx_quirks.md`(跨会话接续路径)。

## 11. 已知边界

- 不支持云同步(纯离线)
- 不支持协同编辑(单进程单文档)
- 多 tab 但单窗口(无 MDI)
- 仅 Windows 64(没 macOS/Linux releases)
- WebView2 要求 Win10+/Win11
- 编辑"head/script"里的 CSS 是「写标签里」而不是可视化编辑,文档的 head 内容以字符串保留
