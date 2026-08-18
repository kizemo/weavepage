# WeavePage 织页

> 桌面所见即所得 HTML 编辑器 · 像 Dreamweaver,但更轻更简单

## 一句话定义

WeavePage 是 aiec.fun 旗下 Windows 桌面应用,用 Tauri(原生 shell)+ WebView2(渲染层)做轻量化本地 HTML 编辑器,既能保留完整 HTML 文档结构(head/style/script/外链),又支持富文本所见即所得编辑。

## 解决什么问题

- 现有网页编辑工具要么太重(Dreamweaver、VS Code 都要从零启动服务),
- 要么功能残缺(纯 markdown 工具不能保留 `<head>` CSS)。
- 个人 + 少量独立开发者需要一款可**直接打开本地 HTML 文件、保存仍为完整 HTML** 的桌面工具,允许在编辑器里同时改 head(脚本、外链、CSS)和 body(富文本)。

## 谁在用

- 一人公司 / 个人开发者
- 自托管 aiec.fun 分发,少量试用
- 国内 Windows 11 用户为主(用 WebView2 runtime,需 Win10+)

## 当前状态

| 项 | 值 |
|---|---|
| 最新版本 | v0.1.10(2026-08-18) |
| 主程序 NSIS 安装包 | ~220 MB(含 WebView2 + Rust + NSIS 引导) |
| 公网分发 | https://www.aiec.fun/weavepage/ |
| GitHub | https://github.com/kizemo/weavepage |
| License | (项目内未声明,默认私有/作者保留) |

## 核心能力(TL;DR)

- **富文本 body 编辑**:段落 / 标题 / 列表 / 任务清单 / 引用 / 代码块 / 图片 / 表格 / 分割
- **head 完整保留**:style/script/link/meta/external CSS 全部保留并可视化编辑
- **段落样式工具条**:Ribbon「段落」组提供 行距 / 段前 / 段后 三控件,直接写块 inline style
- **「设为默认样式」**:右键菜单把当前块显式属性(p/h1-h6 白名单 8 项)写进 head 内嵌的命名块 `weavepage-default-styles`,同类型后续块跟随
- **页面背景色**:Ribbon 字体组「背景」按钮,16 色浅色调色板,写到 head body 规则

详细代码地图见 [`code-map.md`](./code-map.md),系统架构见 [`architecture.md`](./architecture.md),开发指南见 [`development.md`](./development.md)。

## 技术栈

- **Shell**:Tauri 2(`@tauri-apps/api` ^2,rust binary 作 host,WebView2 渲染)
- **前端**:React 19 + Tiptap 3.30(基于 ProseMirror)
- **打包**:Vite 7(产出分 hash chunks)+ tauri-cli + NSIS + MSI
- **后端桥**(Rust)`tauri-plugin-fs` / `tauri-plugin-http` / `tauri-plugin-dialog` / `tauri-plugin-opener`,均由 `src-tauri/capabilities/default.json` 列出 ACL allowlist
- **服务端 ops**(aiec.fun):PHP 落地页 `download.php` + SFTP 上传脚本 + Cloudflare cache 2h
- **测试**:`node:test` + `tsx` 直接跑 `src/utils/*.test.ts`(无 Vitest)
