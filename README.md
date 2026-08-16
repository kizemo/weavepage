<p align="center">
  <img src="assets/logo.svg" alt="WeavePage 织页" width="520" />
</p>

<p align="center">
  <a href="https://github.com/kizemo/weavepage/releases"><img src="https://img.shields.io/github/v/release/kizemo/weavepage?label=release&color=0b3d91" alt="release"></a>
  <a href="https://github.com/kizemo/weavepage"><img src="https://img.shields.io/badge/platform-Windows%2010%2F11-blue" alt="platform"></a>
  <a href="#"><img src="https://img.shields.io/badge/stack-Tauri%20v2%20%2B%20React%2019%20%2B%20Tiptap%203-0b3d91" alt="stack"></a>
  <a href="#"><img src="https://img.shields.io/badge/developer-aiec.fun-orange" alt="developer"></a>
</p>

<p align="center">
  <b>像 Dreamweaver 一样「织」网页 —— 但更轻、更简单、更现代。</b><br/>
  打开任意 HTML 文件，立即呈现完整的 CSS 样式与 JS 动态效果。<b>编辑界面就是最终效果。</b>
</p>

---

## What is WeavePage?

WeavePage（织页）是一款 **Windows 桌面网页编辑器**。传统网页编辑器要么笨重复杂（Dreamweaver 时代的老工具），要么依赖浏览器和网络（在线编辑器）；WeavePage 把「所见即所得」带回本地桌面：双击安装、打开即编辑，零配置、零学习成本。

|  | Dreamweaver | 在线编辑器 | **WeavePage** |
|---|---|---|---|
| 启动速度 | 慢（数秒） | 依赖浏览器 | **秒开** |
| 网络依赖 | 无 | **必须联网** | **完全离线** |
| 学习成本 | 高（专业工具） | 中 | **零（像 Word 一样）** |
| 文档 CSS 渲染 | ✓ | 部分 | **打开即见 + 可编辑** |
| 安装 | 数 GB | 无需 | **205MB 双击即装** |
| JS 动态效果 | ✓ | ✓ | **预览可见 + 可编辑** |

---

## ✨ Features

### 所见即所得

- 打开 HTML 文件，**文档 CSS 自动注入编辑区** —— 标题、字体、颜色、排版与最终页面完全一致
- **网页预览模式**：完整渲染 CSS 样式与 JS 动态效果（悬浮目录、平滑滚动、交互组件），并且**可直接在预览中编辑**，改动实时同步回编辑器
- 外部 CSS / JS / 图片**自动内联**为自包含文档，保存重开效果不丢

### 像 Word 一样编辑网页

- **Word 风格功能区**：字体、字号（9-36pt）、颜色、高亮、对齐、列表、引用、代码块
- 选中文字时，功能区**自动显示该文字的实际字体 / 字号 / 颜色**
- **文字颜色 / 高亮**：弹出色板集成「更多颜色」（系统色盘）+「最近使用」色组（各 8 个，自动 LRU）
- **打开最近**：文件菜单「打开最近 ▶」二级菜单，默认保存最近 10 个工作文档，子菜单尾部一键清除
- **表格**：5×5 网格选择器一键插入，行列增删
- **图片**：本地图片以 base64 嵌入，所见即所得

### 面向开发者的细节

- **源码视图**：查看 / 编辑完整页面代码（head、CSS、JS 全部可见），Ctrl+S 直接保存
- **块级源码编辑**：右键任意块 → 右侧边栏编辑该块 HTML，可导航父块 / 子块 / 兄弟块
- **外联资源侧边栏**：网页引用的 CSS / JS 自动列出，点击即在新标签打开编辑
- **多标签页**：同时打开 HTML / CSS / JS / 文本文件，独立状态自由切换
- **页式 / 全宽视图**、**主题三态**（浅色 / 深色 / 跟随系统），重启保持

### 轻量可靠

- 安装包自带 **WebView2 离线运行时** —— 全新电脑、无网络双击安装直接使用
- 基于 Tauri，单进程低占用

## 📸 界面预览

| 编辑视图（所见即所得） | 网页预览（完整 CSS/JS 效果） |
|:---:|:---:|
| ![编辑视图](assets/screenshots/editor.png) | ![网页预览](assets/screenshots/preview.png) |

| 主界面（Word 风格功能区 + 多标签页） |
|:---:|
| ![主界面](assets/screenshots/main.png) |

## 🚀 安装

1. 前往 [Releases](https://github.com/kizemo/weavepage/releases) 下载 `WeavePage_0.1.2_x64-setup.exe`
2. 双击安装（自动安装 WebView2 运行时，全程无需联网）
3. 从开始菜单启动 **WeavePage**

> **系统要求**：Windows 10/11 x64

### 🔐 校验

```
# NSIS 安装包 (~208 MB)
sha256: 447313ac7a3f5fd5f0d61c69e97b56775dec81f618a7d575049dd6f491988555

# MSI 安装包 (~206 MB)
sha256: 4fc0170eb3928dbf48b42cefb4a8f74951026f40abe1023435a6c3f800f84b15
```

Windows 验证：`certutil -hashfile WeavePage_0.1.2_x64-setup.exe SHA256`

## 📖 使用指南

| 你想做什么 | 怎么做 |
|---|---|
| 打开网页 | `文件 → 打开`（Ctrl+O）选择 HTML 文件，自动进入编辑视图 |
| 快速重开最近文档 | `文件 → 打开最近 ▶`（自动保存 10 个,一级子菜单带「清除」） |
| 编辑内容 | 直接在编辑区输入，用功能区调整格式，所见即所得 |
| 自定义文字/高亮颜色 | 功能区「文字颜色」/「高亮」弹窗 → 「更多颜色...」系统色盘；常用色自动入「最近使用」 |
| 查看真实效果 | 功能区「👁 网页预览」（或 F9），可直接在预览中改文字 |
| 同步编辑到预览 | 预览中按 **F5** 刷新 |
| 编辑整页源码 | `视图 → 源码视图`，head / CSS / JS 全部可改，Ctrl+S 保存 |
| 编辑单个块源码 | 编辑区**右键任意块** → 右侧面板改 HTML → 应用 |
| 编辑外联 CSS/JS | 左侧「外联资源」栏点击文件 → 新标签编辑 → Ctrl+S 写回 |
| 多文件同时处理 | Ctrl+N 新建、Ctrl+O 打开、Ctrl+W 关闭标签 |
| 插入表格/图片 | 「插入」选项卡：网格选择表格；图片按钮选本地图片 |

**全部快捷键**：`Ctrl+N/O/S/Shift+S/W` 文件操作 · `Ctrl+Z/Y` 撤销重做 · `F5` 刷新预览 · `F9` 切换编辑/预览

## 🛠 Development Quickstart

```bash
# 环境要求：Node.js ≥ 20、Rust ≥ 1.77、pnpm
pnpm install        # 安装依赖
pnpm tauri dev      # 开发模式运行
pnpm build          # 前端构建（tsc + vite）
pnpm release        # 打包安装程序到 release/ 目录
```

## 🏗 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | [Tauri v2](https://tauri.app)（Windows · WebView2） |
| 前端 | React 19 + TypeScript + Vite |
| 编辑器 | [Tiptap 3](https://tiptap.dev)（ProseMirror） |
| 包管理 | pnpm |

## 📁 项目结构

```
├── src/                    # React 前端
│   ├── App.tsx             # 应用装配（多标签/文件操作/模式切换/快捷键）
│   ├── App.css             # CSS 变量主题系统 + 功能区/编辑区样式
│   ├── extensions/         # 自定义扩展（字号/HTML 保真）
│   ├── utils/              # 字体常量表/HTML 格式化
│   └── components/         # 菜单栏/功能区/标签栏/侧边栏/状态栏/块源码面板
├── src-tauri/              # Tauri 壳（capabilities/图标/打包配置）
├── assets/                 # logo、示例文档与界面截图
└── scripts/                # 发布脚本（构建后复制安装包到 release/）
```

## 💬 反馈与支持

- 遇到问题或有功能建议，欢迎在 [Issues](https://github.com/kizemo/weavepage/issues) 提出
- 演示文档见 [`assets/demo/demo.html`](assets/demo/demo.html)，下载后可直接用 WeavePage 打开体验

## 📋 变更日志

### v0.1.2 — 2026-08-16
- 新增 文件菜单「打开最近 ▶」二级子菜单，默认保存最近 10 个工作文档，附「清除」按钮
- 新增 文字颜色 / 高亮弹出集成「更多颜色...」原生系统色盘(WebView2)
- 新增 「最近使用」色组，自动保留最近 8 个文字色 + 8 个高亮色（LRU，hex 归一化）
- 数据持久化于 `%APPDATA%\fun.aiec.weavepage\`（`recent.json` + `recent-colors.json`）
- 重构 提取 `loadDocFromPath` 共用 `openFile` / `openResource` / `打开最近` 三处读取逻辑

### v0.1.1 — 2026-08-15
- 更换 织纹 W 品牌应用图标（窗口 / 安装包 / 任务栏）

### v0.1.0 — 2026-08-14
- 发布 初版：所见即所得 + Word 功能区 + 多标签 + 预览/源码/块编辑 + 外联资源侧边栏

## 许可

© 2026 [aiec.fun](https://aiec.fun) · WeavePage 织页
