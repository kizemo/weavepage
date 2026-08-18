# WeavePage 代码地图

> 读 [PROJECT.md](./PROJECT.md) 后看这张图。代码在 `F:\soft\00selfmade\tiptap_app`。

## 1. 顶层结构

```
tiptap_app/
├── src/                  # React + Tiptap 前端(打包成 dist/,被 Tauri 加载)
├── src-tauri/            # Rust host + Tauri 配置 + capabilities
├── docs/                  # 项目文档(本目录)
│   ├── PROJECT.md        # ← 你在这里
│   ├── code-map.md       # ← 这篇
│   ├── architecture.md   # 系统架构 + 数据流
│   ├── development.md    # 开发 + 发布 + 调试 + 跨会话接续
│   ├── operations/       # 服务器/发布/计数器等 ops 文档(已有)
│   └── superpowers/      # 过去的 spec / plan(历史归档)
├── release/              # pnpm release 产出的 NSIS + MSI(Vite build 完成后自动 copy 进来)
├── scripts/              # 一行 ops 脚本
│   ├── copy-release.mjs  # pnpm release 后半段,把 7z+msi 从 src-tauri/target 复制到 release/
│   ├── _upload_weavepage.py      # 上传 setup.exe 到 aiec(server-side .htaccess 验证)
│   └── _upload_weavepage_files.py # 上传 5 个 site files(common.php/version.json/download.php/counter.php/.htaccess)
├── release-notes-v0.1.X.md # 每个版本的 GitHub release 笔记草稿
├── package.json          # vite + tsx + tauri-cli
├── pnpm-lock.yaml
├── tsconfig.json
└── README.md             # dirty,v0.1.2 那个 changelog,本轮不动它
```

## 2. `src/` 详细结构

```
src/
├── App.tsx                 # 中央组件;编辑器实例、文档状态、活动 doc 选择、菜单/侧栏/状态栏装配
├── App.css                 # 主题变量 + ribbon + 下拉 + 上下文菜单 + 进度 overlay 样式
├── main.tsx                # React DOM 入口(由 vite/tauri 生成入口)
│
├── components/             # 视图组件
│   ├── MenuBar.tsx         # 顶部菜单条(文件 / 视图 / 帮助,含「打开最近」二级)
│   ├── Ribbon.tsx          # Ribbon 容器,activeTab 切换 edit / insert
│   ├── RibbonHome.tsx      # 「编辑」tab 内容(字体/字号/粗斜下删/颜色/段落组/样式组/链接组)
│   ├── RibbonInsert.tsx    # 「插入」tab 内容(图片/表格/链接)
│   ├── Sidebar.tsx         # 侧边栏(资源链接列表)
│   ├── TabBar.tsx          # 多文档切换 tab
│   ├── StatusBar.tsx       # 底部字数 + 视图模式 + 主题 + 跟随时钟
│   ├── AboutDialog.tsx     # 「关于 WeavePage」对话框 + in-app 升级入口
│   ├── BlockSourcePanel.tsx # 右键「块源码」侧拉面板
│   ├── EditorContextMenu.tsx # 右键菜单(块源码 + 设为默认样式)
│   ├── ColorPicker.tsx     # Word-风格色板 = 预设 + 最近 + 系统色盘 + 清除
│   └── controls.tsx        # GroupTitle / RibbonButton / SelectControl / ColorControl
│
├── extensions/             # Tiptap ProseMirror 扩展
│   ├── HtmlCompat.ts       # GlobalAttrs(全局 style attr) + DivNode + SpanNode,允许块级 div/span
│   └── FontSize.ts         # font-family / font-size mark(由于 Tiptap 3.30 的 fontSize 没有内置)
│
└── utils/                  # 纯函数工具,无 React 耦合(可以 node:test)
    ├── paragraphSpacing.ts # 段距预设 + pt↔px + inline style 合并
    ├── defaultStyle.ts     # 命名块 parseStyleBlock + upsertStyleBlock + 同步 shell.head
    ├── headShell.ts        # 页面背景色 applyBodyBackground + extractBodyBackground
    ├── inAppUpdater.ts     # in-app 升级流(streaming + progress overlay + 关主窗口)
    ├── updateCheck.ts      # version.json 拉取 + semver 比较 + APP_TAGLINE / APP_DOWNLOAD_URL
    ├── fonts.ts            # FONT_FAMILIES / FONT_SIZES / TEXT_COLORS / HIGHLIGHT_COLORS / PAGE_BG_COLORS
    ├── formatHtml.ts       # 文档 ↔ source text 序列化
    ├── recentFiles.ts      # 最近文件 LRU(写 %APPDATA%\fun.aiec.weavepage\recent-files.json)
    ├── recentColors.ts     # 最近用色 LRU(text + highlight 各自限 8)
    └── *.test.ts           # 单元测试(node:test + tsx 直跑)
```

## 3. `src-tauri/` 简述

```
src-tauri/
├── Cargo.toml              # 编辑器 crate,依赖 tauri-plugin-{fs,http,dialog,opener}
├── tauri.conf.json         # 4 个关键字段:version / identifier=fun.aiec.weavepage / bundle.targets=all
│                           # app.security.csp=null(scopedCss 是我们自己的策略)
│                           # bundle.windows.offlineInstaller(silent 模式,WebView2 重定向)
├── capabilities/
│   └── default.json        # Tauri v2 ACL allowlist(opener:allow-open-path,http:allow-fetch:*.aiec.fun,fs:scope.** 等)
├── src/lib.rs              # 注册上面 4 个 plugin(其余逻辑在 src/ JS 端)
└── icons/                  # NSIS/ICO 资源
```

## 4. 模块依赖关系(谁 import 谁)

```
                     ┌──────────────┐
                     │   App.tsx    │  中央调度
                     └──┬───┬─────┬──┘
        ┌────────────────┘   │     └──────────────┐
        ▼                    ▼                    ▼
   components/*        extensions/*           utils/*
   (Ribbon 系列,         (Tiptap 扩展)        (纯函数 +
    MenuBar,              (HtmlCompat           node:test 单元)
    AboutDialog...)       / FontSize)               ▲
                                                   │
                                  updateCheck / inAppUpdater
                                  (被 App + AboutDialog 调用)
```

依赖方向是单向的:**App → components → utils**;utils 之间互相可调(`defaultStyle.ts` 需要识别 props 白名单);components 自己相互 import(`BlockSourcePanel` import 自 App.tsx)。

## 5. 主要数据契约(类型归属)

| 类型 | 归属文件 | 意义 |
|---|---|---|
| `DocState` | `src/components/TabBar.tsx` | 多文档数组中每条 doc 的状态(id/kind/body/sourceText/mode/shell/filePath/isModified/resources) |
| `DocShell` | `src/App.tsx`(就地定义) | head / headCss / bodyAttrs / scripts / styles / baseHref — parseShell 的产物 |
| `Selector` | `src/utils/defaultStyle.ts` | `"p" \| "h1" \| ... \| "h6"`,白名单 CSS selector |
| `SUPPORTED_PROPS`(8 项) | `src/utils/defaultStyle.ts` | font-family/font-size/color/background-color/text-align/line-height/margin-top/margin-bottom |
| `RemoteVersion` | `src/utils/updateCheck.ts` | version/notes/pub_date/url — aiec /version.json 内容 |
| `DocId`(私有) | `src/App.tsx`(就地) | 自增 number |
| `RibbonTab`/`EditMode`/`ViewMode`/`ThemeMode` | `src/components/MenuBar.tsx`(集中 export) | UI 状态机 |

## 6. Feature → 文件表(改什么 feature 看这节)

| Feature | 主改文件 | 次改文件 |
|---|---|---|
| 段落间距(行距 / 段前 / 段后)| `src/utils/paragraphSpacing.ts` + `src/components/RibbonHome.tsx` | `src/App.tsx`(handleSpacingChange)|
| 设为默认样式(右键 → p/h1-h6 → body rule)| `src/utils/defaultStyle.ts` + `src/components/EditorContextMenu.tsx` | `src/App.tsx`(readBlockExplicitProps + handleSetAsDefault)|
| 页面背景色 | `src/utils/headShell.ts` + `src/components/RibbonHome.tsx` | `src/App.tsx`(handlePageBg)|
| in-app 升级 | `src/utils/inAppUpdater.ts` + `src/utils/updateCheck.ts` | `src/App.tsx`(启动 useEffect) + `src/components/AboutDialog.tsx`(onDownload)|
| 在线检测 URL / 版本 | `src/utils/updateCheck.ts` + `src/App.tsx` 启动 | — |
| 右键菜单 | `src/components/EditorContextMenu.tsx` + `src/App.css` | `src/App.tsx`(contextMenu state)|
| 关于对话框 | `src/components/AboutDialog.tsx` | `src/App.tsx`(showAbout)|
| 多文档 tab | `src/components/TabBar.tsx` + `src/App.tsx`(docs/activeId)| — |
| 菜单栏最近文件 | `src/components/MenuBar.tsx` + `src/utils/recentFiles.ts` | — |
| 最近用色 | `src/components/ColorPicker.tsx` + `src/utils/recentColors.ts` | `src/App.tsx`(onColorUsed)|
| 主题(themes)| `src/App.css` CSS variables `:root[data-theme="dark"]` | `src/App.tsx`(theme state,持久化 localStorage tiptap-theme)|
| 视图模式(page/wide)| `src/App.css`(.content-area.page / .wide)| `src/App.tsx`(viewClass)|
| 编辑/源码/预览 模式 | `src/components/Ribbon/Ribbon.tsx` + `src/App.tsx` | `src/components/RibbonInsert.tsx` 仅 edit 模式下出 tab |

## 7. `docs/operations/`(已存在,引用即可)

| 文件 | 内容 |
|---|---|
| `docs/operations/README.md` | ops 目录索引 |
| `docs/operations/release-workflow.md` | 发版流程文字版(与 `scripts/copy-release.mjs` 同义) |
| `docs/operations/version-info.md` | version.json 与 4 字符串版本号同步说明 |
| `docs/operations/server-architecture.md` | aiec.fun serve 端 PHP 逻辑(download.php / counter.php 行为)|
| `docs/operations/download-counter.md` | 下载计数器语义 |
| `docs/operations/server-upload.md` | SFTP 上传流程细节 |

这些文档作者已写过;`development.md` 会引用它们,不重复。

## 8. `docs/superpowers/`(历史 spec / plan 归档)

过去文件:
- `2026-08-13-word-ribbon-ui-design.md` + `2026-08-13-word-ribbon-ui.md`
- `2026-08-16-recent-files-and-color-picker-design.md` + `.md`(plan)
- `2026-08-17-paragraph-spacing-and-default-style-design.md` + `.md`(plan)
- `2026-08-18-project-documentation-design.md` ← 本 spec

每对(spec+plan)用 brainstorming + writing-plans skill 的标准产出。release 完成后 spec 已"体现在 commit history 中",plan 可保留作历史参考。
