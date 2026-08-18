# WeavePage 项目文档 设计 spec

> **日期**:2026-08-18
> **状态**:已获用户批准(澄清会 4 决定已锁定:受众 = AI + 人 + 可能外部 / 4 层多文件)
> **项目**:`F:\soft\00selfmade\tiptap_app`(Tauri 2 + React + Vite,Windows 桌面 WYSIWYG HTML 编辑器)
> **目标版本**:随本次合并随即生效(无代码改动,仅新文档 + 一个 spec commit + docs commit)

## 1. 目标

让新会话或新成员能:
- **5 分钟**看完 `PROJECT.md` 知道项目是什么、能干什么、当前跑在哪个版本
- **15 分钟**读完 `code-map.md` 知道代码在哪些目录、哪些文件改什么 feature
- **30 分钟**读完 `architecture.md` 知道每个核心流程怎么流、ACL/CSP/服务端的边界在哪
- **按需** 翻 `development.md` 查"加新功能该走哪条路、版本号同步哪几处、这台 server 的坑是什么"

## 2. 受众与文档形态决定

- **AI 接续会话**(主):新会话第一件事读 `PROJECT.md` + `memory/MEMORY.md` 即可掌握 80% 上下文
- **人(未来的自己)**:接手时不用从零摸索
- **外部读者**(可能):有项目介绍 + 品牌等基础信息,外人 5 分钟看懂这是啥

**渐进披露** — 4 个文档,字数预期递增:

| 文档 | 行数预估 | 抽象级别 | 谁会读 |
|---|---|---|---|
| `docs/PROJECT.md` | ~60 | 一句话回答"是什么、能干什么、跑哪" | 所有人 |
| `docs/code-map.md` | ~250 | 文件级,告诉你"哪个文件改什么 feature" | AI + 接手人 |
| `docs/architecture.md` | ~400 | 系统级,数据流、ACL、约束 | AI + 接手人 |
| `docs/development.md` | ~300 | 操作级,加功能/发布/调试 | 接手人(AI 需要时查) |

## 3. 文档内容定义

### 3.1 `docs/PROJECT.md`(L1 入口)

| 章节 | 内容 | 字数 |
|---|---|---|
| 一句话定义 | WeavePage 织页 — Windows 桌面所见即所得 HTML 编辑器 |  |
| Why | 像 Dreamweaver 但是轻便;离线编辑本地 HTML,保存完整文档结构;用户自托管 aiec.fun 分发 |  |
| Who | 个人/少量发布用户;通过 aiec.fun 下载安装 |  |
| Status | v0.1.10 当前 / 公网地址 / SHA256 链接 + gh release |  |
| Capabilities 5-bullet | 富文本编辑 / 图片表格任务清单 / 段落样式 / 页面背景色 / 在线升级 |  |
| Tech stack | Tauri 2 / React 19 / Tiptap 3.30 / TypeScript strict |  |
| 链接 | code-map.md / architecture.md / development.md / GitHub release |  |

### 3.2 `docs/code-map.md`(L2 文件地图)

| 章节 | 内容 |
|---|---|
| 顶层结构 | `src/` / `src-tauri/` / `docs/` / `release/` / `scripts/` / `memory/` 一句话责任 |
| 完整 `src/` 树 + 每文件入口 | 目录树(代码块)+ 文字注释每文件关键 export/handler |
| 模块依赖图 | 文字版"谁 import 谁" — App.tsx 是 hub,utils 是 leaf |
| 主要数据契约 | DocState / DocShell / Selector / RemoteVersion 等类型归属 |
| Feature → 文件 map | 表格:段落间距样式 / 设为默认样式 / 页面背景 / in-app upgrade / 上下文菜单 / 服务器分发 → 哪个文件 / 行 |
| `src-tauri/` 简述 | Tauri 配置 + plugin.opener/fs/http/dialog/window + Rust 入口 |
| `docs/superpowers/` 简述 | 历史 spec/plan 路径习惯 |
| `docs/operations/` 简述 | 已存在的 server/release/counter/upload 文档 |

### 3.3 `docs/architecture.md`(L3 系统架构)

| 章节 | 内容 |
|---|---|
| 系统边界 | 4 象限:webview-JS / Tauri Rust 后端 / 网络 / 文件系统 |
| 模块依赖 | ASCII art 文字图 |
| 启动流程 | editor init → 设置 listener → useEffect 链 → 滚动条 |
| 编辑流程 | 键盘 → Tiptap → state.transition → onUpdate → setState |
| 文件保存流程 | saveFile → IPC → shell.wrap → .html |
| 样式持久化流程 | 设为默认 → readBlockExplicitProps → upsertShellHead → setShell |
| 升级流程 | 启动 → fetchRemoteVersion → ask → startInAppUpgrade(streaming) → openPath → close |
| 关键数据结构 | DocState、DocShell(head/headCss/bodyAttrs/scripts/styles/baseHref) |
| Tauri ACL | capabilities/default.json 权限清单(v0.1.10)、拒绝示例(open_path 失败历史) |
| CSP/scopedCss | "security.csp=null" + html→.editor-scroll、body→.editor-body、fixed→absolute |
| 服务端约束 | aiec nginx 不识 .htaccess / Cloudflare cache 2h / kizemo 无 sudo / Tauri build 文件锁 |
| 已知边界 | 离线优先(无云同步)、多 tab 编辑、MDI 限制、单一 windows 11 |

### 3.4 `docs/development.md`(L4 开发指南)

| 章节 | 内容 |
|---|---|
| 环境 | Node 18+ / Rust 1.x / tauri-cli;pnpm;pnpm build / tauri build |
| 工作流 | 加新功能路径:tools spec → plan → TDD → commit → build → 真机验收 → 发布 |
| 版本号规则 | 4 处同步:`package.json` / `tauri.conf.json` / `copy-release.mjs` / README;hotfix 升 PATCH |
| 测试 | `pnpm tsx src/utils/*.test.ts`(node:test + tsx,无 Vitest) |
| 调试 | webview dev tools / 日志 grep / 已知断点 |
| 发布 | `pnpm release` → SHA256 → cp 到 `_upload_weavepage.py` working copy → `python _upload_weavepage.py` → 升 `_upload_weavepage.py` LOCAL_FILE → `_upload_weavepage_files.py` → `gh release create --draft=false` |
| 真机验收 | "no commit without real-machine test"(README + memory 纪律) |
| 已知陷阱 / 约束列表 | (bullet 形式 6-10 条)|
| **跨会话接续指南** | 第一步读 `docs/PROJECT.md`;第二步读 `~/.claude/projects/.../memory/MEMORY.md`;第三步读最近的 `handoff-*.md` + `prompt-*.md` |

## 4. 实施步骤

按文档 L1 → L2 → L3 → L4 顺序写,每文档单独 commit:

1. L1 `docs/PROJECT.md`
2. L2 `docs/code-map.md`
3. L3 `docs/architecture.md`
4. L4 `docs/development.md`

每文档 commit 信息格式:`docs: 添加 <文件名> — 项目文档 L<n>`。所有 4 个写完一次性 git push。

## 5. 跨引用规则

- `PROJECT.md` 必须有最上 5 行 TL;DR,后面才能引向 L2/L3/L4
- `code-map.md` 引用 `architecture.md` 时提供锚点链接(用 `##` 标题作为锚)
- `development.md` 引用 `docs/operations/*.md`,**不重写**已有内容(避免分叉)
- `memory/MEMORY.md` 里 `feedback_no_commit_without_real_test` / `project_weavepage_release_flow` 等仍有效,文档引用而非复制

## 6. 设计原则

- **渐进披露**:每文档前两三段就建立上下文;细节下钻
- **AI 友好**:用 markdown 锚,grep `# xxx` 即可定位;代码示例可直接复用
- **紧贴现状**:写 v0.1.10 状态,不放"未来可能"占位
- **指向已有**:`docs/operations/*.md` 和 memory 索引都引用,不重复
- **可独立 commit**:4 个 .md 单独 commit,可单独回滚

## 7. 不做

- ❌ 不改 `README.md`(dirty 中,等用户单独处理)
- ❌ 不写 API 自动生成(项目不大,源码就是 API)
- ❌ 不写 CI/CD 文档(没 CI)
- ❌ 不写部署文档(已用 `docs/operations/server-upload.md`)
- ❌ 不在本轮做 dirty workspace 合并(README/Cargo/MenuBar.tsx 等)
- ❌ 不重写 `docs/operations/*.md`(引用即可)

## 8. Self-Review(草案)

- 没有 placeholder ✓
- 与现状 v0.1.10 一致 ✓
- 引用关系闭环 ✓
- 不冲突 dirty workspace ✓

## 9. 风险

- **Code map 的精确行号**:grep 拿的是 snapshot,代码后续会改。要么不写精确行号(用模块/函数名),要么标 "as of v0.1.10"。**决定**:不写精确行号(用函数名 + 模块名)
- **跨文件事实冗余**:PROJECT.md 中 SHA256 也会出现在 development.md — 显式声明 PROJECT.md 是权威源,其它"见 PROJECT.md"
