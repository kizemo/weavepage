# Word 功能区 UI 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Tiptap 桌面编辑器改造为 Word 风格的三选项卡功能区界面，支持排版增强、表格、图片、源码视图、页式/全宽切换与主题切换。

**Architecture:** 保持现有 Tauri v2 + React 19 + Tiptap 3.29 架构。前端按组件拆分：MenuBar（菜单栏）、Ribbon（选项卡外壳）、RibbonHome/RibbonInsert/RibbonView（三个选项卡）、StatusBar（状态栏）、controls（复用控件）、TableGridPicker（表格网格选择器）。CSS 全部重构为 CSS 变量主题系统（浅/深/跟随系统）。

**Tech Stack:** Tauri v2, React 19, Tiptap 3.29, pnpm, TypeScript

## Global Constraints

- 工作目录：`F:\soft\00selfmade\tiptap_app`，所有命令在该目录下执行
- Tiptap v3 的 StarterKit **已内置** Link、Underline、Blockquote、Code、CodeBlock、Heading、Lists、Strike、History 等——不要重复安装/注册 `@tiptap/extension-link`、`@tiptap/extension-underline`（会导致重复注册歧义）
- 项目无测试框架，每个任务的验证门 = `pnpm build`（tsc + vite build）通过 + 手动功能清单
- 界面文字使用中文；按钮遵循 Word 风格：图标+文字标签
- 主题状态、视图模式、文档内容均持久化到 localStorage（key：`tiptap-theme`、`tiptap-view-mode`、`tiptap-editor-content`）
- 不引入 CodeMirror（源码视图用 textarea）
- 图片用 base64 data URL 嵌入（`allowBase64: true`），不配置 asset 协议
- 不要修改 `src-tauri/` 下的 Rust 代码和权限（本计划不需要新增 Tauri 能力）
- 每次 `pnpm build` 后如有 git，进行 commit（无 git 则跳过，本项目当前无 git 仓库）

---

### Task 1: 安装 Tiptap 扩展依赖 + 自定义字号扩展 + 常量表

**Files:**
- Create: `src/extensions/FontSize.ts`
- Create: `src/utils/fonts.ts`
- Modify: `package.json`（通过 pnpm add 自动修改）

**Interfaces:**
- Produces: `FontSize` 扩展（`setFontSize(size: string)` / `unsetFontSize()` 命令），`FONT_FAMILIES`、`FONT_SIZES` 常量数组

- [ ] **Step 1: 安装依赖**

```bash
cd F:\soft\00selfmade\tiptap_app && pnpm add @tiptap/extension-text-style @tiptap/extension-color @tiptap/extension-highlight @tiptap/extension-text-align @tiptap/extension-font-family @tiptap/extension-image @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-header @tiptap/extension-table-cell @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-placeholder
```

预期：`Done in Xs using pnpm`，dependencies 增加上述包。

- [ ] **Step 2: 创建字号扩展**

`src/extensions/FontSize.ts`（Tiptap 官方 TextStyle 自定义扩展模式，字号 9-36pt）：

```ts
import { Extension } from "@tiptap/core";
import "@tiptap/extension-text-style";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] as string[] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain()
            .setMark("textStyle", { fontSize: null })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});
```

- [ ] **Step 3: 创建字体/字号常量表**

`src/utils/fonts.ts`：

```ts
export const FONT_FAMILIES = [
  { label: "默认字体", value: "" },
  { label: "宋体", value: "SimSun, serif" },
  { label: "黑体", value: "SimHei, sans-serif" },
  { label: "微软雅黑", value: "Microsoft YaHei, sans-serif" },
  { label: "楷体", value: "KaiTi, serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Consolas", value: "Consolas, monospace" },
] as const;

export const FONT_SIZES = [
  { label: "默认", value: "" },
  { label: "9", value: "9pt" },
  { label: "10", value: "10pt" },
  { label: "12", value: "12pt" },
  { label: "14", value: "14pt" },
  { label: "16", value: "16pt" },
  { label: "18", value: "18pt" },
  { label: "24", value: "24pt" },
  { label: "36", value: "36pt" },
] as const;

export const TEXT_COLORS = [
  "#000000", "#444444", "#666666", "#999999",
  "#c00000", "#ff0000", "#ff6600", "#ffc000",
  "#ffff00", "#92d050", "#00b050", "#00b0f0",
  "#0070c0", "#002060", "#7030a0", "#ffffff",
] as const;

export const HIGHLIGHT_COLORS = [
  "#ffff00", "#ffe599", "#ffd966", "#f4b183",
  "#ffc000", "#c00000", "#ff0000", "#00b0f0",
  "#92d050", "#00b050", "#7030a0", "#e6e6e6",
] as const;
```

- [ ] **Step 4: 验证编译**

```bash
cd F:\soft\00selfmade\tiptap_app && pnpm build
```

预期：`tsc && vite build` 通过，`✓ built in ~2s`。

- [ ] **Step 5: Commit**（无 git 则跳过，下同）

---

### Task 2: CSS 主题系统重构（浅/深/跟随系统 + 页式白纸 + 功能区样式）

**Files:**
- Rewrite: `src/App.css`

**Interfaces:**
- Consumes: 无
- Produces: CSS 变量命名约定 `--accent`、`--bg`、`--surface`、`--border`、`--text`、`--text-dim`、`--hover`、`--active-bg`、`--active-text`、`--shadow`；`html[data-theme="dark"]` 与 `:root`（system 跟随）双轨；`.editor-page`（白纸）与 `.editor-wide`（全宽）布局类；`.ribbon-*`、`.status-*`、`.menu-*` 类名约定（供 Task 3-8 的 JSX 使用）

- [ ] **Step 1: 整体重写 App.css**

```css
/* ============ 主题变量 ============ */
:root {
  --accent: #1a56db;
  --accent-hover: #1550c4;
  --bg: #f4f5f7;
  --bg-panel: #f8f9fa;
  --surface: #ffffff;
  --border: #e0e2e6;
  --text: #1f2328;
  --text-dim: #6b7280;
  --hover: #eceff3;
  --active-bg: #e3edff;
  --active-text: #1a56db;
  --shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  --page-bg: #ffffff;
  --page-shadow: 0 1px 4px rgba(0, 0, 0, 0.15), 0 8px 24px rgba(0, 0, 0, 0.08);
  --scrollbar-thumb: #c8ccd2;
  --scrollbar-thumb-hover: #a8adb5;
  --code-bg: #f0f0f0;
  --code-text: inherit;
  --quote-border: #c0c0c0;
  --quote-text: #666666;
}

html[data-theme="dark"] {
  --accent: #5b9bff;
  --accent-hover: #7cb3ff;
  --bg: #1e1e1e;
  --bg-panel: #2a2a2e;
  --surface: #2a2a2e;
  --border: #3a3a3e;
  --text: #e8e8e8;
  --text-dim: #9a9fa8;
  --hover: #3a3f4a;
  --active-bg: #1e3a5f;
  --active-text: #7cb3ff;
  --shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  --page-bg: #2f2f33;
  --page-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  --scrollbar-thumb: #4a4f57;
  --scrollbar-thumb-hover: #5a6068;
  --code-bg: #333333;
  --quote-border: #555555;
  --quote-text: #aaaaaa;
}

/* 跟随系统（无 data-theme 属性时） */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --accent: #5b9bff;
    --accent-hover: #7cb3ff;
    --bg: #1e1e1e;
    --bg-panel: #2a2a2e;
    --surface: #2a2a2e;
    --border: #3a3a3e;
    --text: #e8e8e8;
    --text-dim: #9a9fa8;
    --hover: #3a3f4a;
    --active-bg: #1e3a5f;
    --active-text: #7cb3ff;
    --shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    --page-bg: #2f2f33;
    --page-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
    --scrollbar-thumb: #4a4f57;
    --scrollbar-thumb-hover: #5a6068;
    --code-bg: #333333;
    --quote-border: #555555;
    --quote-text: #aaaaaa;
  }
}

/* ============ 基础 ============ */
* { margin: 0; padding: 0; box-sizing: border-box; }

html, body, #root { height: 100%; }

body {
  font-family: Inter, "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
  background: var(--bg);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  -webkit-user-select: none;
}

.editor-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
}

/* ============ 标题栏 ============ */
.title-bar {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 16px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-dim);
  flex-shrink: 0;
}
.title-bar-text { font-weight: 600; color: var(--text); }
.title-bar-app { margin-left: 4px; }

/* ============ 菜单栏 ============ */
.menu-bar {
  display: flex;
  height: 30px;
  padding: 0 4px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  z-index: 30;
}
.menu-item { position: relative; }
.menu-title {
  display: inline-flex;
  align-items: center;
  height: 29px;
  padding: 0 12px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 4px 4px 0 0;
}
.menu-title:hover { background: var(--hover); }
.menu-title.menu-open { background: var(--active-bg); color: var(--active-text); }

.menu-dropdown {
  position: absolute;
  top: 29px;
  left: 0;
  min-width: 240px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0 0 6px 6px;
  box-shadow: var(--shadow);
  padding: 4px 0;
  z-index: 40;
}
.menu-dropdown button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  text-align: left;
  padding: 6px 16px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
.menu-dropdown button:hover { background: var(--hover); }
.menu-dropdown button:disabled { color: var(--text-dim); cursor: default; }
.menu-dropdown button:disabled:hover { background: transparent; }
.menu-dropdown .shortcut { color: var(--text-dim); font-size: 12px; }
.menu-sep { height: 1px; margin: 4px 8px; background: var(--border); }

/* ============ 功能区 ============ */
.ribbon {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  z-index: 20;
}
.ribbon-tabs {
  display: flex;
  align-items: center;
  height: 34px;
  padding: 0 8px;
  gap: 2px;
}
.ribbon-tab {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: 5px 5px 0 0;
  background: transparent;
  color: var(--text-dim);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
.ribbon-tab:hover { background: var(--hover); color: var(--text); }
.ribbon-tab.active {
  color: var(--accent);
  background: var(--active-bg);
  font-weight: 600;
  border-bottom: 2px solid var(--accent);
}
.ribbon-collapse-btn {
  margin-left: auto;
  width: 28px;
  height: 26px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  font-size: 13px;
  cursor: pointer;
}
.ribbon-collapse-btn:hover { background: var(--hover); color: var(--text); }

.ribbon-body {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 56px;
  padding: 6px 10px;
  border-top: 1px solid var(--border);
  overflow-x: auto;
}
.ribbon-body.collapsed { display: none; }
.ribbon-body.disabled { opacity: 0.35; pointer-events: none; }

.ribbon-group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  flex-shrink: 0;
}
.ribbon-group + .ribbon-group {
  border-left: 1px solid var(--border);
}
.ribbon-group-title {
  font-size: 11px;
  color: var(--text-dim);
  text-align: center;
  padding: 2px 0;
  letter-spacing: 1px;
}

.ribbon-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 52px;
  padding: 5px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.ribbon-btn .btn-icon {
  font-size: 15px;
  line-height: 1;
  font-weight: 600;
}
.ribbon-btn:hover { background: var(--hover); }
.ribbon-btn.is-active { background: var(--active-bg); color: var(--active-text); }
.ribbon-btn:disabled { color: var(--text-dim); opacity: 0.5; cursor: default; }
.ribbon-btn:disabled:hover { background: transparent; }

.ribbon-select-wrap { position: relative; display: inline-block; }
.ribbon-select {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  max-width: 120px;
}
.ribbon-select:hover { border-color: var(--accent); }

.ribbon-color-wrap { position: relative; display: inline-block; }
.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--border);
  background: #000;
  cursor: pointer;
  padding: 0;
}
.color-swatch:hover { border-color: var(--accent); }
.color-picker-pop {
  position: absolute;
  top: 30px;
  left: 0;
  z-index: 50;
  display: grid;
  grid-template-columns: repeat(4, 24px);
  gap: 6px;
  padding: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: var(--shadow);
}
.color-cell {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid var(--border);
  cursor: pointer;
}
.color-cell:hover { transform: scale(1.15); }
.color-clear-btn {
  grid-column: 1 / -1;
  border: none;
  background: var(--hover);
  color: var(--text);
  font-size: 12px;
  padding: 4px 0;
  border-radius: 4px;
  cursor: pointer;
}

/* 表格网格选择器 */
.grid-picker-wrap { position: relative; }
.grid-picker-pop {
  position: absolute;
  top: 34px;
  left: 0;
  z-index: 50;
  padding: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: var(--shadow);
}
.grid-picker-cells {
  display: grid;
  grid-template-columns: repeat(5, 18px);
  gap: 3px;
}
.grid-picker-cell {
  width: 18px;
  height: 18px;
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--surface);
  cursor: pointer;
}
.grid-picker-cell.active { background: var(--accent); border-color: var(--accent); }
.grid-picker-hint {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-dim);
  text-align: center;
}

/* ============ 编辑区 ============ */
.editor-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg);
}
.editor-scroll::-webkit-scrollbar { width: 12px; }
.editor-scroll::-webkit-scrollbar-track { background: transparent; }
.editor-scroll::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 6px;
  border: 3px solid transparent;
  background-clip: content-box;
}
.editor-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
  border: 3px solid transparent;
  background-clip: content-box;
}

.editor-body {
  outline: none;
  border: none;
  overflow-wrap: break-word;
  user-select: text;
  -webkit-user-select: text;
}

/* 页式视图：灰底 + 居中白纸 */
.editor-page .editor-body {
  max-width: 794px;
  min-height: 1123px;
  margin: 24px auto;
  padding: 48px 64px;
  background: var(--page-bg);
  box-shadow: var(--page-shadow);
  border-radius: 2px;
}

/* 全宽视图 */
.editor-wide .editor-body {
  padding: 24px 40px;
}

/* 源码视图 */
.source-view {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  font-family: Consolas, "Courier New", monospace;
  font-size: 13px;
  line-height: 1.5;
  padding: 16px 24px;
  border: none;
  background: var(--bg);
  color: var(--text);
  outline: none;
  resize: none;
  user-select: text;
  -webkit-user-select: text;
}

/* ============ 状态栏 ============ */
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 26px;
  padding: 0 12px;
  background: var(--bg-panel);
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-dim);
  flex-shrink: 0;
}
.status-left, .status-right { display: flex; align-items: center; gap: 12px; }
.status-item { display: inline-flex; align-items: center; gap: 4px; }
.status-btn {
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 3px;
}
.status-btn:hover { background: var(--hover); color: var(--text); }
.status-btn.active { color: var(--accent); font-weight: 600; }

/* ============ 编辑区内容排版 ============ */
.editor-body p { margin-bottom: 0.5em; }
.editor-body h1 { margin: 0.8em 0 0.4em; font-size: 2em; font-weight: 700; }
.editor-body h2 { margin: 0.7em 0 0.3em; font-size: 1.5em; font-weight: 600; }
.editor-body h3 { margin: 0.6em 0 0.3em; font-size: 1.2em; font-weight: 600; }
.editor-body ul, .editor-body ol { padding-left: 1.5em; margin-bottom: 0.5em; }
.editor-body li { margin-bottom: 0.2em; }
.editor-body a { color: var(--accent); text-decoration: underline; }
.editor-body blockquote {
  border-left: 3px solid var(--quote-border);
  padding-left: 1em;
  margin: 0.5em 0;
  color: var(--quote-text);
}
.editor-body code { background: var(--code-bg); padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
.editor-body pre {
  background: #2f2f2f;
  color: #e0e0e0;
  padding: 1em;
  border-radius: 6px;
  margin: 0.5em 0;
  overflow-x: auto;
}
.editor-body pre code { background: none; padding: 0; color: inherit; }
.editor-body table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.5em 0;
  table-layout: fixed;
}
.editor-body td, .editor-body th {
  border: 1px solid var(--border);
  padding: 6px 10px;
  position: relative;
}
.editor-body th { background: var(--hover); font-weight: 600; }
.editor-body .selectedCell::after {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--active-bg);
  opacity: 0.3;
  pointer-events: none;
}
.editor-body ul[data-type="taskList"] { list-style: none; padding-left: 0.2em; }
.editor-body ul[data-type="taskList"] li { display: flex; gap: 8px; align-items: flex-start; }
.editor-body ul[data-type="taskList"] li > label { margin-top: 3px; user-select: none; }
.editor-body p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: var(--text-dim);
  pointer-events: none;
}
```

- [ ] **Step 2: 验证编译**

```bash
cd F:\soft\00selfmade\tiptap_app && pnpm build
```

预期：通过（App.tsx 仍引用旧类名，暂不生效无碍，Task 9 统一装配）。

---

### Task 3: 复用控件（controls.tsx）+ 表格网格选择器

**Files:**
- Create: `src/components/controls.tsx`
- Create: `src/components/TableGridPicker.tsx`

**Interfaces:**
- Consumes: 无
- Produces:
  - `GroupTitle({ children })` — 功能区组标题
  - `RibbonButton({ icon, label, onClick, active?, disabled?, title? })` — 功能区按钮
  - `SelectControl({ value, onChange, options })` — 下拉框（options: `{ label, value }[]`）
  - `ColorControl({ value, onChange, onClear, colors, title })` — 颜色圆形按钮 + 弹出色板
  - `TableGridPicker({ onPick, onClear })` — 5×5 网格选择器（`onPick(rows, cols)` 回调），内含自身 open 状态

- [ ] **Step 1: 创建 controls.tsx**

```tsx
import { useState, useEffect, useRef, type ReactNode } from "react";

export function GroupTitle({ children }: { children: ReactNode }) {
  return <div className="ribbon-group-title">{children}</div>;
}

interface RibbonButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}

export function RibbonButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  title,
}: RibbonButtonProps) {
  return (
    <button
      className={`ribbon-btn ${active ? "is-active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
    >
      <span className="btn-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

interface SelectControlProps {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  title?: string;
}

export function SelectControl({ value, onChange, options, title }: SelectControlProps) {
  return (
    <div className="ribbon-select-wrap">
      <select
        className="ribbon-select"
        value={value}
        title={title}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface ColorControlProps {
  value: string;
  onChange: (color: string) => void;
  onClear: () => void;
  colors: readonly string[];
  title: string;
}

export function ColorControl({ value, onChange, onClear, colors, title }: ColorControlProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="ribbon-color-wrap" ref={wrapRef}>
      <button
        className="color-swatch"
        style={{ background: value || "#000" }}
        title={title}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div className="color-picker-pop">
          {colors.map((c) => (
            <button
              key={c}
              className="color-cell"
              style={{ background: c }}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
            />
          ))}
          <button className="color-clear-btn" onClick={() => { onClear(); setOpen(false); }}>
            清除
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 TableGridPicker.tsx**

```tsx
import { useState, useEffect, useRef } from "react";

interface TableGridPickerProps {
  onPick: (rows: number, cols: number) => void;
  onClear: () => void;
}

const MAX = 5;

export function TableGridPicker({ onPick, onClear }: TableGridPickerProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<[number, number]>([1, 1]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const [rows, cols] = hover;

  return (
    <div className="grid-picker-wrap" ref={wrapRef}>
      <RibbonButton
        icon="▦"
        label="表格"
        onClick={() => setOpen((v) => !v)}
        active={open}
      />
      {open && (
        <div className="grid-picker-pop">
          <div className="grid-picker-cells">
            {Array.from({ length: MAX * MAX }).map((_, i) => {
              const r = Math.floor(i / MAX) + 1;
              const c = (i % MAX) + 1;
              const active = r <= rows && c <= cols;
              return (
                <button
                  key={i}
                  className={`grid-picker-cell ${active ? "active" : ""}`}
                  onMouseEnter={() => setHover([r, c])}
                  onClick={() => {
                    onPick(r, c);
                    setOpen(false);
                  }}
                />
              );
            })}
          </div>
          <div className="grid-picker-hint">
            {rows} × {cols} 表格
          </div>
          <button
            className="color-clear-btn"
            style={{ width: "100%", marginTop: 6 }}
            onClick={() => { onClear(); setOpen(false); }}
          >
            删除表格
          </button>
        </div>
      )}
    </div>
  );
}
```

注意：TableGridPicker 引用 `RibbonButton`，需从 `./controls` 导入：

```tsx
import { RibbonButton } from "./controls";
```

- [ ] **Step 3: 验证编译**

```bash
cd F:\soft\00selfmade\tiptap_app && pnpm build
```

预期：通过。

---

### Task 4: MenuBar 组件（文件/编辑/视图菜单 + 导出网页）

**Files:**
- Create: `src/components/MenuBar.tsx`

**Interfaces:**
- Consumes: `editor`（Tiptap Editor 实例）
- Produces: `MenuBar({ editor, filePath, isModified, onNew, onOpen, onSave, onSaveAs, onExportPage, onViewMode, viewMode, onToggleSource, sourceMode, theme, onThemeChange, onToggleRibbon, ribbonCollapsed })` props 接口
- 交互：点击外部关闭下拉；`Ctrl+N/O/S/Shift+S` 快捷键由 App 层处理（Task 9），本组件只做菜单按钮

- [ ] **Step 1: 创建 MenuBar.tsx**

```tsx
import { useState, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";

type MenuId = "file" | "edit" | "view" | null;
type ThemeMode = "system" | "light" | "dark";
type ViewMode = "page" | "wide";

interface MenuBarProps {
  editor: Editor;
  filePath: string | null;
  isModified: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExportPage: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onToggleSource: () => void;
  sourceMode: boolean;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  theme: ThemeMode;
  onThemeChange: (t: ThemeMode) => void;
  ribbonCollapsed: boolean;
  onToggleRibbon: () => void;
}

export function MenuBar(props: MenuBarProps) {
  const {
    editor, filePath, isModified, onNew, onOpen, onSave, onSaveAs, onExportPage,
    onCut, onCopy, onPaste, onToggleSource, sourceMode,
    viewMode, onViewMode, theme, onThemeChange,
    ribbonCollapsed, onToggleRibbon,
  } = props;
  const [activeMenu, setActiveMenu] = useState<MenuId>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (id: MenuId) => setActiveMenu((cur) => (cur === id ? null : id));
  const close = () => setActiveMenu(null);
  const fileName = filePath
    ? (filePath.split("\\").pop() ?? "未命名").replace(/\.html?$/, "")
    : "未命名";

  return (
    <div className="menu-bar" ref={barRef}>
      <div className="menu-item">
        <button className={`menu-title ${activeMenu === "file" ? "menu-open" : ""}`} onClick={() => toggle("file")}>
          {isModified ? "文件 •" : "文件"}
        </button>
        {activeMenu === "file" && (
          <div className="menu-dropdown">
            <button onClick={() => { onNew(); close(); }}>新建 <span className="shortcut">Ctrl+N</span></button>
            <button onClick={() => { onOpen(); close(); }}>打开... <span className="shortcut">Ctrl+O</span></button>
            <div className="menu-sep" />
            <button onClick={() => { onSave(); close(); }}>保存 <span className="shortcut">Ctrl+S</span></button>
            <button onClick={() => { onSaveAs(); close(); }}>另存为... <span className="shortcut">Ctrl+Shift+S</span></button>
            <div className="menu-sep" />
            <button onClick={() => { onExportPage(); close(); }}>导出网页...</button>
          </div>
        )}
      </div>

      <div className="menu-item">
        <button className={`menu-title ${activeMenu === "edit" ? "menu-open" : ""}`} onClick={() => toggle("edit")}>
          编辑
        </button>
        {activeMenu === "edit" && (
          <div className="menu-dropdown">
            <button disabled={!editor.can().undo()} onClick={() => { editor.chain().focus().undo().run(); close(); }}>
              撤销 <span className="shortcut">Ctrl+Z</span>
            </button>
            <button disabled={!editor.can().redo()} onClick={() => { editor.chain().focus().redo().run(); close(); }}>
              重做 <span className="shortcut">Ctrl+Y</span>
            </button>
            <div className="menu-sep" />
            <button onClick={() => { onCut(); close(); }}>剪切 <span className="shortcut">Ctrl+X</span></button>
            <button onClick={() => { onCopy(); close(); }}>复制 <span className="shortcut">Ctrl+C</span></button>
            <button onClick={() => { onPaste(); close(); }}>粘贴 <span className="shortcut">Ctrl+V</span></button>
            <div className="menu-sep" />
            <button onClick={() => { editor.commands.selectAll(); close(); }}>全选 <span className="shortcut">Ctrl+A</span></button>
          </div>
        )}
      </div>

      <div className="menu-item">
        <button className={`menu-title ${activeMenu === "view" ? "menu-open" : ""}`} onClick={() => toggle("view")}>
          视图
        </button>
        {activeMenu === "view" && (
          <div className="menu-dropdown">
            <button onClick={() => { onViewMode("page"); close(); }}>
              页式视图 {viewMode === "page" ? "✓" : ""}
            </button>
            <button onClick={() => { onViewMode("wide"); close(); }}>
              全宽视图 {viewMode === "wide" ? "✓" : ""}
            </button>
            <div className="menu-sep" />
            <button onClick={() => { onToggleSource(); close(); }}>
              {sourceMode ? "退出源码视图" : "源码视图"}
            </button>
            <div className="menu-sep" />
            <button onClick={() => { onThemeChange("system"); close(); }}>
              主题：跟随系统 {theme === "system" ? "✓" : ""}
            </button>
            <button onClick={() => { onThemeChange("light"); close(); }}>
              主题：浅色 {theme === "light" ? "✓" : ""}
            </button>
            <button onClick={() => { onThemeChange("dark"); close(); }}>
              主题：深色 {theme === "dark" ? "✓" : ""}
            </button>
            <div className="menu-sep" />
            <button onClick={() => { onToggleRibbon(); close(); }}>
              {ribbonCollapsed ? "展开功能区" : "折叠功能区"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd F:\soft\00selfmade\tiptap_app && pnpm build
```

预期：通过（MenuBar 暂未被引用，TypeScript 会因未使用变量报错——如有 `noUnusedLocals` 报错，Task 9 装配后再验证；本任务只需确认文件语法正确，可用 `npx tsc --noEmit` 只对单文件无法检查，故改为：确认无 import 错误即可）。

---

### Task 5: Ribbon 外壳 + 开始选项卡（RibbonHome）

**Files:**
- Create: `src/components/Ribbon.tsx`
- Create: `src/components/RibbonHome.tsx`

**Interfaces:**
- Consumes: `controls.tsx`（RibbonButton、SelectControl、ColorControl、GroupTitle）、`utils/fonts.ts`（FONT_FAMILIES、FONT_SIZES、TEXT_COLORS、HIGHLIGHT_COLORS）
- Produces: `Ribbon({ editor, collapsed, onToggleCollapsed, disabled, theme, onThemeChange, viewMode, onViewMode, onToggleSource, sourceMode, onInsertTable, onInsertImage, onInsertHr, onPickTable })` 属性；`RibbonHome({ editor, onLink })` 属性

- [ ] **Step 1: 创建 Ribbon.tsx 外壳**

```tsx
import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { RibbonHome } from "./RibbonHome";
import { RibbonInsert } from "./RibbonInsert";
import { RibbonView } from "./RibbonView";

export type ViewMode = "page" | "wide";
export type ThemeMode = "system" | "light" | "dark";

interface RibbonProps {
  editor: Editor;
  disabled: boolean; // 源码视图时禁用
  theme: ThemeMode;
  onThemeChange: (t: ThemeMode) => void;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  sourceMode: boolean;
  onToggleSource: () => void;
  onInsertImage: () => void;
  onInsertTable: (rows: number, cols: number) => void;
  onDeleteTable: () => void;
}

type TabId = "home" | "insert" | "view";

export function Ribbon(props: RibbonProps) {
  const [tab, setTab] = useState<TabId>("home");
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="ribbon">
      <div className="ribbon-tabs">
        <button className={`ribbon-tab ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}>
          开始
        </button>
        <button className={`ribbon-tab ${tab === "insert" ? "active" : ""}`} onClick={() => setTab("insert")}>
          插入
        </button>
        <button className={`ribbon-tab ${tab === "view" ? "active" : ""}`} onClick={() => setTab("view")}>
          视图
        </button>
        <button
          className="ribbon-collapse-btn"
          title={collapsed ? "展开功能区" : "折叠功能区"}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? "▲" : "▲"}
        </button>
      </div>
      <div className={`ribbon-body ${collapsed ? "collapsed" : ""} ${props.disabled ? "disabled" : ""}`}>
        {tab === "home" && <RibbonHome editor={props.editor} />}
        {tab === "insert" && (
          <RibbonInsert
            editor={props.editor}
            onInsertImage={props.onInsertImage}
            onInsertTable={props.onInsertTable}
            onDeleteTable={props.onDeleteTable}
          />
        )}
        {tab === "view" && (
          <RibbonView
            theme={props.theme}
            onThemeChange={props.onThemeChange}
            viewMode={props.viewMode}
            onViewMode={props.onViewMode}
            sourceMode={props.sourceMode}
            onToggleSource={props.onToggleSource}
          />
        )}
      </div>
    </div>
  );
}
```

注意：`collapsed` 状态需同步给 MenuBar 的"折叠功能区"菜单项（Task 4 的 `ribbonCollapsed`/`onToggleRibbon`）。为保持简单，将 collapsed 状态提升到 App：`Ribbon` 接收 `collapsed` + `onToggleCollapsed` props。修正后 `RibbonProps` 增加两个字段，Task 9 装配时传入。MenuBar 的 `ribbonCollapsed` 和 `onToggleRibbon` 对接同一状态。

- [ ] **Step 2: 创建 RibbonHome.tsx（开始选项卡）**

```tsx
import { useCallback } from "react";
import type { Editor } from "@tiptap/react";
import { GroupTitle, RibbonButton, SelectControl, ColorControl } from "./controls";
import { FONT_FAMILIES, FONT_SIZES, TEXT_COLORS, HIGHLIGHT_COLORS } from "../utils/fonts";

interface RibbonHomeProps {
  editor: Editor;
  onLink: () => void;
}

export function RibbonHome({ editor, onLink }: RibbonHomeProps) {
  const fontFamily = editor.getAttributes("textStyle").fontFamily ?? "";
  const fontSize = editor.getAttributes("textStyle").fontSize ?? "";
  const textColor = editor.getAttributes("textStyle").color ?? "";
  const highlightColor = editor.getAttributes("highlight").color ?? "";

  const setFontFamily = useCallback(
    (value: string) => {
      if (value === "") editor.chain().focus().unsetFontFamily().run();
      else editor.chain().focus().setFontFamily(value).run();
    },
    [editor]
  );

  const setFontSize = useCallback(
    (value: string) => {
      if (value === "") editor.chain().focus().unsetFontSize().run();
      else editor.chain().focus().setFontSize(value).run();
    },
    [editor]
  );

  const setColor = useCallback(
    (value: string) => editor.chain().focus().setColor(value).run(),
    [editor]
  );

  const clearColor = useCallback(
    () => editor.chain().focus().unsetColor().run(),
    [editor]
  );

  const setHighlight = useCallback(
    (value: string) => editor.chain().focus().toggleHighlight({ color: value }).run(),
    [editor]
  );

  const clearHighlight = useCallback(
    () => editor.chain().focus().unsetHighlight().run(),
    [editor]
  );

  return (
    <>
      {/* 撤销/重做组 */}
      <div className="ribbon-group">
        <GroupTitle>撤销</GroupTitle>
        <RibbonButton
          icon="↩"
          label="撤销"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        />
        <RibbonButton
          icon="↪"
          label="重做"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        />
      </div>

      {/* 字体组 */}
      <div className="ribbon-group">
        <GroupTitle>字体</GroupTitle>
        <SelectControl
          value={fontFamily}
          onChange={setFontFamily}
          options={[...FONT_FAMILIES]}
          title="字体"
        />
        <SelectControl
          value={fontSize}
          onChange={setFontSize}
          options={[...FONT_SIZES]}
          title="字号"
        />
        <RibbonButton
          icon={<strong>B</strong>}
          label="粗体"
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
        />
        <RibbonButton
          icon={<em>I</em>}
          label="斜体"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
        />
        <RibbonButton
          icon={<u>U</u>}
          label="下划线"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
        />
        <RibbonButton
          icon={<s>S</s>}
          label="删除线"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
        />
        <ColorControl
          value={textColor}
          onChange={setColor}
          onClear={clearColor}
          colors={TEXT_COLORS}
          title="文字颜色"
        />
        <ColorControl
          value={highlightColor}
          onChange={setHighlight}
          onClear={clearHighlight}
          colors={HIGHLIGHT_COLORS}
          title="高亮"
        />
      </div>

      {/* 段落组 */}
      <div className="ribbon-group">
        <GroupTitle>段落</GroupTitle>
        <RibbonButton
          icon="≡"
          label="左对齐"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
        />
        <RibbonButton
          icon="☰"
          label="居中"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
        />
        <RibbonButton
          icon="≣"
          label="右对齐"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
        />
        <RibbonButton
          icon="▭"
          label="两端"
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          active={editor.isActive({ textAlign: "justify" })}
        />
        <RibbonButton
          icon="•"
          label="项目符号"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
        />
        <RibbonButton
          icon="1."
          label="编号"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
        />
        <RibbonButton
          icon="☑"
          label="任务清单"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive("taskList")}
        />
        <RibbonButton
          icon="⇤"
          label="减少缩进"
          onClick={() => editor.chain().focus().liftListItem("listItem").run()}
          disabled={!editor.can().liftListItem("listItem")}
        />
        <RibbonButton
          icon="⇥"
          label="增加缩进"
          onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
          disabled={!editor.can().sinkListItem("listItem")}
        />
        <RibbonButton
          icon="❝"
          label="引用"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
        />
        <RibbonButton
          icon="{}"
          label="代码块"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
        />
      </div>

      {/* 样式组 */}
      <div className="ribbon-group">
        <GroupTitle>样式</GroupTitle>
        <RibbonButton
          icon="T"
          label="正文"
          onClick={() => editor.chain().focus().setParagraph().run()}
          active={editor.isActive("paragraph")}
        />
        <RibbonButton
          icon="H1"
          label="标题1"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive("heading", { level: 1 })}
        />
        <RibbonButton
          icon="H2"
          label="标题2"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
        />
        <RibbonButton
          icon="H3"
          label="标题3"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
        />
      </div>

      {/* 链接组 */}
      <div className="ribbon-group">
        <GroupTitle>链接</GroupTitle>
        <RibbonButton
          icon="🔗"
          label="链接"
          onClick={onLink}
          active={editor.isActive("link")}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 3: 创建空壳 RibbonInsert.tsx 与 RibbonView.tsx（占位，Task 6/7 填充）**

`src/components/RibbonInsert.tsx`：

```tsx
import type { Editor } from "@tiptap/react";

interface RibbonInsertProps {
  editor: Editor;
  onInsertImage: () => void;
  onInsertTable: (rows: number, cols: number) => void;
  onDeleteTable: () => void;
}

export function RibbonInsert(_props: RibbonInsertProps) {
  return null;
}
```

`src/components/RibbonView.tsx`：

```tsx
import type { ViewMode, ThemeMode } from "./Ribbon";

interface RibbonViewProps {
  theme: ThemeMode;
  onThemeChange: (t: ThemeMode) => void;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  sourceMode: boolean;
  onToggleSource: () => void;
}

export function RibbonView(_props: RibbonViewProps) {
  return null;
}
```

- [ ] **Step 4: 验证编译**

```bash
cd F:\soft\00selfmade\tiptap_app && pnpm build
```

预期：通过（Ribbon 未被引用，Task 9 装配）。

---

### Task 6: 插入选项卡（表格网格 + 行列操作 + 图片 + 水平线）

**Files:**
- Modify: `src/components/RibbonInsert.tsx`

**Interfaces:**
- Consumes: `controls.tsx`、`TableGridPicker.tsx`
- Produces: 完整 RibbonInsert 实现

- [ ] **Step 1: 实现 RibbonInsert.tsx**

```tsx
import type { Editor } from "@tiptap/react";
import { GroupTitle, RibbonButton } from "./controls";
import { TableGridPicker } from "./TableGridPicker";

interface RibbonInsertProps {
  editor: Editor;
  onInsertImage: () => void;
  onInsertTable: (rows: number, cols: number) => void;
  onDeleteTable: () => void;
}

export function RibbonInsert({
  editor,
  onInsertImage,
  onInsertTable,
  onDeleteTable,
}: RibbonInsertProps) {
  const inTable = editor.isActive("table");

  return (
    <>
      {/* 表格组 */}
      <div className="ribbon-group">
        <GroupTitle>表格</GroupTitle>
        <TableGridPicker onPick={onInsertTable} onClear={onDeleteTable} />
        <RibbonButton
          icon="⇣"
          label="上行"
          onClick={() => editor.chain().focus().addRowBefore().run()}
          disabled={!inTable}
          title="在光标上方插入行"
        />
        <RibbonButton
          icon="⇩"
          label="下行"
          onClick={() => editor.chain().focus().addRowAfter().run()}
          disabled={!inTable}
          title="在光标下方插入行"
        />
        <RibbonButton
          icon="⇢"
          label="右列"
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          disabled={!inTable}
          title="在光标右侧插入列"
        />
        <RibbonButton
          icon="⇠"
          label="左列"
          onClick={() => editor.chain().focus().addColumnBefore().run()}
          disabled={!inTable}
          title="在光标左侧插入列"
        />
        <RibbonButton
          icon="✕"
          label="删行"
          onClick={() => editor.chain().focus().deleteRow().run()}
          disabled={!inTable}
          title="删除光标所在行"
        />
        <RibbonButton
          icon="✕"
          label="删列"
          onClick={() => editor.chain().focus().deleteColumn().run()}
          disabled={!inTable}
          title="删除光标所在列"
        />
      </div>

      {/* 插图组 */}
      <div className="ribbon-group">
        <GroupTitle>插图</GroupTitle>
        <RibbonButton icon="🖼" label="图片" onClick={onInsertImage} />
        <RibbonButton
          icon="—"
          label="水平线"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        />
      </div>

      {/* 链接组 */}
      <div className="ribbon-group">
        <GroupTitle>链接</GroupTitle>
        <RibbonButton
          icon="🔗"
          label="链接"
          onClick={() => {
            const prev = editor.getAttributes("link").href;
            const url = window.prompt("输入链接 URL", prev || "https://");
            if (url === null) return;
            if (url === "") editor.chain().focus().unsetLink().run();
            else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }}
          active={editor.isActive("link")}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd F:\soft\00selfmade\tiptap_app && pnpm build
```

预期：通过。

---

### Task 7: 视图选项卡（页式/全宽、源码视图、主题）

**Files:**
- Modify: `src/components/RibbonView.tsx`

**Interfaces:**
- Consumes: `controls.tsx`
- Produces: 完整 RibbonView 实现

- [ ] **Step 1: 实现 RibbonView.tsx**

```tsx
import { GroupTitle, RibbonButton } from "./controls";
import type { ViewMode, ThemeMode } from "./Ribbon";

interface RibbonViewProps {
  theme: ThemeMode;
  onThemeChange: (t: ThemeMode) => void;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  sourceMode: boolean;
  onToggleSource: () => void;
}

export function RibbonView({
  theme,
  onThemeChange,
  viewMode,
  onViewMode,
  sourceMode,
  onToggleSource,
}: RibbonViewProps) {
  return (
    <>
      {/* 视图模式组 */}
      <div className="ribbon-group">
        <GroupTitle>视图</GroupTitle>
        <RibbonButton
          icon="▣"
          label="页式视图"
          onClick={() => onViewMode("page")}
          active={viewMode === "page"}
          title="灰底白纸，所见即所得"
        />
        <RibbonButton
          icon="▤"
          label="全宽视图"
          onClick={() => onViewMode("wide")}
          active={viewMode === "wide"}
          title="编辑区铺满窗口"
        />
        <RibbonButton
          icon="<>"
          label={sourceMode ? "退出源码" : "源码视图"}
          onClick={onToggleSource}
          active={sourceMode}
          title="查看/编辑 HTML 源码"
        />
      </div>

      {/* 主题组 */}
      <div className="ribbon-group">
        <GroupTitle>主题</GroupTitle>
        <RibbonButton
          icon="◐"
          label="跟随系统"
          onClick={() => onThemeChange("system")}
          active={theme === "system"}
        />
        <RibbonButton
          icon="☀"
          label="浅色"
          onClick={() => onThemeChange("light")}
          active={theme === "light"}
        />
        <RibbonButton
          icon="☾"
          label="深色"
          onClick={() => onThemeChange("dark")}
          active={theme === "dark"}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd F:\soft\00selfmade\tiptap_app && pnpm build
```

预期：通过。

---

### Task 8: 状态栏（字数统计、视图模式、主题）

**Files:**
- Create: `src/components/StatusBar.tsx`

**Interfaces:**
- Consumes: `editor`、`viewMode`、`onViewMode`、`theme`、`onThemeChange`、`wordCount`
- Produces: `StatusBar({ editor, wordCount, viewMode, onViewMode, theme, onThemeChange, sourceMode })`

- [ ] **Step 1: 创建 StatusBar.tsx**

```tsx
import type { Editor } from "@tiptap/react";
import type { ViewMode, ThemeMode } from "./Ribbon";

interface StatusBarProps {
  editor: Editor;
  wordCount: number;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  theme: ThemeMode;
  onThemeChange: (t: ThemeMode) => void;
  sourceMode: boolean;
}

export function StatusBar({
  wordCount,
  viewMode,
  onViewMode,
  theme,
  onThemeChange,
  sourceMode,
}: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="status-item">字数：{wordCount}</span>
        {sourceMode && <span className="status-item" style={{ color: "var(--accent)" }}>源码模式</span>}
      </div>
      <div className="status-right">
        <button
          className={`status-btn ${viewMode === "page" ? "active" : ""}`}
          onClick={() => onViewMode("page")}
          title="页式视图"
        >
          页式
        </button>
        <button
          className={`status-btn ${viewMode === "wide" ? "active" : ""}`}
          onClick={() => onViewMode("wide")}
          title="全宽视图"
        >
          全宽
        </button>
        <button
          className="status-btn"
          onClick={() => onThemeChange(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
          title={`主题：${theme === "dark" ? "深色" : theme === "light" ? "浅色" : "跟随系统"}`}
        >
          {theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"} {theme === "dark" ? "深色" : theme === "light" ? "浅色" : "跟随系统"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd F:\soft\00selfmade\tiptap_app && pnpm build
```

预期：通过。

---

### Task 9: App.tsx 装配（编辑器扩展、视图模式、源码视图、文件逻辑、导出网页）

**Files:**
- Rewrite: `src/App.tsx`
- Modify: `src/main.tsx`（如需要挂载主题初始化，本方案在 App 内处理，main.tsx 不动）

**Interfaces:**
- Consumes: 全部 Task 1-8 产物
- Produces: 完整可运行应用

- [ ] **Step 1: 整体重写 App.tsx**

```tsx
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import FontFamily from "@tiptap/extension-font-family";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, readFile } from "@tauri-apps/plugin-fs";
import { FontSize } from "./extensions/FontSize";
import { MenuBar } from "./components/MenuBar";
import { Ribbon } from "./components/Ribbon";
import { StatusBar } from "./components/StatusBar";
import type { ViewMode, ThemeMode } from "./components/Ribbon";
import "./App.css";

const STORAGE_KEY = "tiptap-editor-content";
const THEME_KEY = "tiptap-theme";
const VIEW_KEY = "tiptap-view-mode";

type ThemeState = ThemeMode;

function App() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isModified, setIsModified] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_KEY) as ViewMode) || "page"
  );
  const [theme, setTheme] = useState<ThemeState>(
    () => (localStorage.getItem(THEME_KEY) as ThemeState) || "system"
  );
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false);
  const [wordCount, setWordCount] = useState(0);

  // ---- 主题应用 ----
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // ---- 视图模式持久化 ----
  useEffect(() => {
    localStorage.setItem(VIEW_KEY, viewMode);
  }, [viewMode]);

  // ---- 编辑器 ----
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, HTMLAttributes: { target: "_blank" } },
      }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "开始写作..." }),
    ],
    content: localStorage.getItem(STORAGE_KEY) || "<p>开始写作...</p>",
    editorProps: { attributes: { class: "editor-body" } },
    onUpdate: ({ editor }) => {
      setIsModified(true);
      localStorage.setItem(STORAGE_KEY, editor.getHTML());
      setWordCount(editor.getText().replace(/\s+/g, "").length);
    },
  });

  // ---- 文件操作 ----
  const newDoc = useCallback(() => {
    if (!editor) return;
    editor.commands.setContent("<p></p>");
    setFilePath(null);
    setIsModified(false);
  }, [editor]);

  const openFile = useCallback(async () => {
    if (!editor) return;
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: "HTML 文件", extensions: ["html", "htm"] },
          { name: "所有文件", extensions: ["*"] },
        ],
      });
      if (!selected) return;
      const path = selected as string;
      const raw = await readTextFile(path);
      let html = raw;
      if (path.endsWith(".html") || path.endsWith(".htm")) {
        const doc = new DOMParser().parseFromString(raw, "text/html");
        html = doc.body.innerHTML || raw;
      }
      editor.commands.setContent(html);
      setFilePath(path);
      setIsModified(false);
      if (sourceMode) setSourceText(editor.getHTML());
    } catch (e) {
      console.error("打开文件失败:", e);
      window.alert("打开文件失败：" + String(e));
    }
  }, [editor, sourceMode]);

  const doSave = useCallback(
    async (path: string) => {
      await writeTextFile(path, editor!.getHTML());
      setFilePath(path);
      setIsModified(false);
    },
    [editor]
  );

  const saveFile = useCallback(async () => {
    if (!editor) return;
    try {
      if (filePath) {
        await doSave(filePath);
      } else {
        const selected = await save({
          filters: [{ name: "HTML 文件", extensions: ["html"] }],
        });
        if (!selected) return;
        const path = selected.endsWith(".html") ? selected : selected + ".html";
        await doSave(path);
      }
    } catch (e) {
      console.error("保存失败:", e);
      window.alert("保存失败：" + String(e));
    }
  }, [editor, filePath, doSave]);

  const saveAsFile = useCallback(async () => {
    if (!editor) return;
    try {
      const selected = await save({
        filters: [{ name: "HTML 文件", extensions: ["html"] }],
      });
      if (!selected) return;
      const path = selected.endsWith(".html") ? selected : selected + ".html";
      await doSave(path);
    } catch (e) {
      console.error("另存为失败:", e);
      window.alert("另存为失败：" + String(e));
    }
  }, [editor, doSave]);

  const exportPage = useCallback(async () => {
    if (!editor) return;
    try {
      const selected = await save({
        filters: [{ name: "HTML 文件", extensions: ["html"] }],
        defaultPath: "untitled.html",
      });
      if (!selected) return;
      const path = selected.endsWith(".html") ? selected : selected + ".html";
      const title = (filePath?.split("\\").pop() ?? "文档").replace(/\.html?$/, "");
      const body = editor.getHTML();
      const full = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>body{font-family:'Segoe UI','Microsoft YaHei',sans-serif;line-height:1.7;max-width:794px;margin:0 auto;padding:32px;color:#222}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 10px}blockquote{border-left:3px solid #ccc;margin:0.5em 0;padding-left:1em;color:#666}pre{background:#f0f0f0;padding:1em;border-radius:6px;overflow-x:auto}code{background:#f0f0f0;padding:0.2em 0.4em;border-radius:3px}img{max-width:100%;height:auto}</style>
</head>
<body>${body}</body>
</html>`;
      await writeTextFile(path, full);
    } catch (e) {
      console.error("导出失败:", e);
      window.alert("导出失败：" + String(e));
    }
  }, [editor, filePath]);

  // ---- 剪贴板 ----
  const doCut = useCallback(() => {
    if (!editor) return;
    navigator.clipboard.writeText(editor.getSelectedText()).catch(() => {});
    editor.chain().focus().deleteSelection().run();
  }, [editor]);

  const doCopy = useCallback(() => {
    if (!editor) return;
    navigator.clipboard.writeText(editor.getSelectedText()).catch(() => {});
  }, [editor]);

  const doPaste = useCallback(async () => {
    if (!editor) return;
    try {
      const text = await navigator.clipboard.readText();
      editor.chain().focus().insertContent(text).run();
    } catch (e) {
      console.error("粘贴失败:", e);
    }
  }, [editor]);

  // ---- 图片插入 ----
  const insertImage = useCallback(async () => {
    if (!editor) return;
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] },
        ],
      });
      if (!selected) return;
      const path = selected as string;
      const data = await readFile(path);
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const ext = (path.split(".").pop() ?? "png").toLowerCase();
      const mime =
        ext === "jpg" || ext === "jpeg" ? "image/jpeg"
        : ext === "svg" ? "image/svg+xml"
        : ext === "webp" ? "image/webp"
        : ext === "gif" ? "image/gif"
        : ext === "bmp" ? "image/bmp"
        : "image/png";
      const base64 = btoa(binary);
      editor.chain().focus().setImage({ src: `data:${mime};base64,${base64}` }).run();
    } catch (e) {
      console.error("插入图片失败:", e);
      window.alert("插入图片失败：" + String(e));
    }
  }, [editor]);

  // ---- 表格 ----
  const insertTable = useCallback(
    (rows: number, cols: number) => {
      editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    },
    [editor]
  );

  const deleteTable = useCallback(() => {
    editor?.chain().focus().deleteTable().run();
  }, [editor]);

  // ---- 链接 ----
  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href;
    const url = window.prompt("输入链接 URL", prev || "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  // ---- 源码视图 ----
  const toggleSource = useCallback(() => {
    if (!editor) return;
    if (!sourceMode) {
      setSourceText(editor.getHTML());
      setSourceMode(true);
    } else {
      try {
        const parsed = new DOMParser().parseFromString(sourceText, "text/html");
        const html = parsed.body.innerHTML || sourceText;
        editor.commands.setContent(html);
        setSourceMode(false);
        setIsModified(true);
      } catch (e) {
        console.error("源码解析失败:", e);
        window.alert("源码解析失败，请检查 HTML 语法");
      }
    }
  }, [editor, sourceMode, sourceText]);

  // ---- 快捷键 ----
  const refs = useRef({
    save: async () => {},
    saveAs: async () => {},
    open: async () => {},
    new: () => {},
  });
  refs.current.save = saveFile;
  refs.current.saveAs = saveAsFile;
  refs.current.open = openFile;
  refs.current.new = newDoc;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) refs.current.saveAs();
        else refs.current.save();
      }
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        refs.current.open();
      }
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        refs.current.new();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!editor) return null;

  const viewClass = viewMode === "page" ? "editor-page" : "editor-wide";

  return (
    <div className="editor-container">
      {/* 标题栏 */}
      <div className="title-bar">
        <span className="title-bar-text">
          {filePath
            ? (filePath.split("\\").pop() ?? "未命名").replace(/\.html?$/, "")
            : "未命名"}
          {isModified ? " *" : ""}
        </span>
        <span className="title-bar-app">- Tiptap Editor</span>
      </div>

      {/* 菜单栏 */}
      <MenuBar
        editor={editor}
        filePath={filePath}
        isModified={isModified}
        onNew={newDoc}
        onOpen={openFile}
        onSave={saveFile}
        onSaveAs={saveAsFile}
        onExportPage={exportPage}
        onCut={doCut}
        onCopy={doCopy}
        onPaste={doPaste}
        onToggleSource={toggleSource}
        sourceMode={sourceMode}
        viewMode={viewMode}
        onViewMode={setViewMode}
        theme={theme}
        onThemeChange={setTheme}
        ribbonCollapsed={ribbonCollapsed}
        onToggleRibbon={() => setRibbonCollapsed((v) => !v)}
      />

      {/* 功能区 */}
      <Ribbon
        editor={editor}
        disabled={sourceMode}
        theme={theme}
        onThemeChange={setTheme}
        viewMode={viewMode}
        onViewMode={setViewMode}
        sourceMode={sourceMode}
        onToggleSource={toggleSource}
        onInsertImage={insertImage}
        onInsertTable={insertTable}
        onDeleteTable={deleteTable}
        collapsed={ribbonCollapsed}
        onToggleCollapsed={() => setRibbonCollapsed((v) => !v)}
      />

      {/* 编辑区 / 源码区 */}
      {sourceMode ? (
        <textarea
          className="source-view"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <div className={`editor-scroll ${viewClass}`}>
          <EditorContent editor={editor} />
        </div>
      )}

      {/* 状态栏 */}
      <StatusBar
        editor={editor}
        wordCount={wordCount}
        viewMode={viewMode}
        onViewMode={setViewMode}
        theme={theme}
        onThemeChange={setTheme}
        sourceMode={sourceMode}
      />
    </div>
  );
}

export default App;
```

- [ ] **Step 2: 修正 Ribbon.tsx 以支持提升的 collapsed 状态**

Task 5 中的 Ribbon 外壳需调整为受控组件（`collapsed` + `onToggleCollapsed` 由 App 传入）：

```tsx
interface RibbonProps {
  editor: Editor;
  disabled: boolean;
  theme: ThemeMode;
  onThemeChange: (t: ThemeMode) => void;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  sourceMode: boolean;
  onToggleSource: () => void;
  onInsertImage: () => void;
  onInsertTable: (rows: number, cols: number) => void;
  onDeleteTable: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}
```

将 `const [collapsed, setCollapsed] = useState(false);` 删除，改用 props，并将折叠按钮 onClick 改为 `props.onToggleCollapsed`。

- [ ] **Step 3: 验证编译**

```bash
cd F:\soft\00selfmade\tiptap_app && pnpm build
```

预期：`tsc && vite build` 全部通过，无 TS 报错。

- [ ] **Step 4: 功能自测清单（`pnpm tauri dev` 运行后逐项手测）**

- [ ] 应用启动无报错，默认页式视图（灰底白纸）
- [ ] 三个选项卡可切换，功能区折叠/展开正常
- [ ] 粗体/斜体/下划线/删除线/颜色/高亮/字体/字号 对选中文字生效
- [ ] 对齐、列表、任务清单、缩进、引用、代码块生效
- [ ] 插入 3×4 表格成功；光标在表格内时行/列增删按钮可用
- [ ] 插入图片（选 png/jpg）成功显示；保存 HTML 后重新打开图片仍在
- [ ] 源码视图切换正常：进入显示 HTML，修改后退出解析回编辑器
- [ ] 页式/全宽切换即时生效，重启后保持
- [ ] 主题三态切换生效，重启后保持
- [ ] 状态栏字数实时更新
- [ ] Ctrl+N/O/S/Shift+S 快捷键有效
- [ ] 打开长 HTML 文档滚动条正常、可滚动到文档末尾

---

### Task 10: 完整构建验证与打包

**Files:**
- 无代码改动

**Interfaces:**
- Consumes: 全部任务产物

- [ ] **Step 1: 前端生产构建**

```bash
cd F:\soft\00selfmade\tiptap_app && pnpm build
```

预期：`✓ built in ~2s`，无 TS 错误。

- [ ] **Step 2: Rust 后端检查**

```bash
cd F:\soft\00selfmade\tiptap_app/src-tauri && cargo check
```

预期：`Finished \`dev\` profile` 无错误（本计划未改 Rust 代码，应秒过）。

- [ ] **Step 3: 完整打包**

```bash
cd F:\soft\00selfmade\tiptap_app && pnpm tauri build
```

预期：生成
- `src-tauri/target/release/bundle/nsis/tiptap-app_0.1.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/tiptap-app_0.1.0_x64_en-US.msi`

- [ ] **Step 4: 运行安装包（或 `pnpm tauri dev`）执行 Task 9 Step 4 全部手测项**

- [ ] **Step 5: 更新 README.md 功能清单（新增表格/图片/源码视图/主题/页式视图）**

---

## Self-Review 记录

**1. Spec 覆盖：**
- 三选项卡功能区 → Task 5/6/7 ✓
- 排版增强（颜色/高亮/字体/字号/对齐/缩进/任务清单） → Task 6 的 RibbonHome ✓
- 表格（网格选择器+行列操作） → Task 3/6 ✓
- 图片（base64 嵌入） → Task 9 insertImage ✓
- 源码视图 → Task 9 toggleSource + Task 7 按钮 ✓
- 页式/全宽切换 → Task 9 viewMode + Task 7 ✓
- 主题三态 → Task 2 CSS + Task 9 应用逻辑 ✓
- 菜单栏扩展（导出网页/视图菜单） → Task 4 + Task 9 exportPage ✓
- 状态栏（字数） → Task 8 ✓
- 滚动条 → Task 2（.editor-scroll 已含 overflow-y: auto + min-height: 0）✓

**2. 占位符扫描：** 无 TBD/TODO；Task 5 的空壳组件在 Task 6/7 被完整实现。✓

**3. 类型一致性：**
- `ViewMode`/`ThemeMode` 定义于 Ribbon.tsx，被 MenuBar/StatusBar/App import type ✓
- `RibbonButton` props 名称在 TableGridPicker 与 RibbonHome 中一致 ✓
- `FontSize` 扩展命令名 `setFontSize`/`unsetFontSize` 与 RibbonHome 调用一致 ✓
- Ribbon 的 `collapsed`/`onToggleCollapsed` 提升后，MenuBar 的 `ribbonCollapsed`/`onToggleRibbon` 由 App 统一接线 ✓
