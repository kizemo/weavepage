# WeavePage v2.2.0 — 「设计」顶级 Ribbon Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 v2.1.0 设计按钮从 ribbon「编辑」tab 内提升为顶级 ribbon tab,缩略图改为横向 scrollable 一条;v2.1.0 设计功能(8 套 CSS + 持久化 + WYSIWYG)完全复用,不动。

**Architecture:**
- `MenuBar` 增加 `RibbonTab = "edit" | "insert" | "design"`,新增「设计」tab 按钮(插入后,视图菜单前)
- `Ribbon` 增加 `activeTab === "design"` 分支,渲染 `<DesignStrip />`(替代原 `RibbonDesign` 按钮)
- 新增 `DesignStrip.tsx`(横向 scrollable 容器)+ `DesignThumb.tsx`(从 RibbonDesign 拆出,缩到 90×60)
- 删除 `RibbonDesign.tsx`(200 行 portal+anchor 浮层逻辑全部作废)
- `App.css` 新增 `.ribbon-design-strip-wrap` / `.ribbon-design-strip` / `.ribbon-thumb-mini`
- 复用 `applyDesign` / `parseDesignId` / `currentDesignId`(v2.1.0 已实现)

**Tech Stack:**
- Tauri 2 + React 18 + Vite + TypeScript
- iframe srcdoc(编辑器 + 缩略图)
- `pnpm tsc --noEmit`(类型检查)
- 真机验证(sandbox-verify per `memory/reference_sandbox_verify_weavepage.md`)

---

## Global Constraints

- **提交前必须真机验证**:本项目硬规则,见 `memory/feedback_no_commit_without_real_test.md`
- **不修改 v2.1.0 设计功能核心逻辑**:`src/utils/designs.ts` / `App.applyDesign` / `App.parseDesignId` / 持久化(HTML 内 `<style data-weavepage-design>`)全部沿用,不动
- **git identity per-command**:`git -c user.name=... -c user.email=... commit`,绝不动全局 config
- **菜单栏顺序不变**:文件 / 编辑 / 插入 / 设计 / 视图 / 帮助(用户硬约束)
- **不加快捷键**:其他顶级菜单也都没快捷键,YAGNI
- **source 视图禁用设计 tab**:`disabled={mode === "source"}` + tooltip「请切换到编辑视图」
- **TypeScript strict 模式**:`pnpm tsc --noEmit` 必须 0 error 后才能 commit
- **路径**:Windows 项目根 `F:\soft\00selfmade\tiptap_app`,所有路径用 Unix 风格

---

## File Structure(本 plan 改动总览)

| 文件 | 动作 | 字节变化 |
|---|---|---|
| `src/components/DesignThumb.tsx` | **新建**(从 RibbonDesign 拆出) | +100 |
| `src/components/DesignStrip.tsx` | **新建** | +60 |
| `src/components/RibbonDesign.tsx` | **删除** | -200 |
| `src/components/RibbonHome.tsx` | 改(移除 RibbonDesign 引用) | -10 |
| `src/components/Ribbon.tsx` | 改(增加 design 分支 + 移除已下传 prop) | +12 / -8 |
| `src/components/MenuBar.tsx` | 改(RibbonTab 加 "design" + tab 按钮) | +12 |
| `src/App.tsx` | 改(RibbonTab 自动同步 + 清理 prop 透传) | +3 / -5 |
| `src/App.css` | 改(新增 3 个 CSS 类) | +30 |

**预计**:+225 / -223 行(净 +2 行;RibbonDesign 删 200 行抵消新增)

---

## Task 1: 新建 DesignThumb + DesignStrip + 加 CSS

**Files:**
- Create: `src/components/DesignThumb.tsx`
- Create: `src/components/DesignStrip.tsx`
- Modify: `src/App.css`(末尾新增 3 个 CSS 类)

**Interfaces:**
- Consumes:
  - `DESIGNS` / `DEFAULT_DESIGN_ID` / `DesignMeta`(`src/utils/designs.ts`,v2.1.0 已存在)
- Produces:
  - `DesignThumbProps { design: DesignMeta | null; selected: boolean; onClick: () => void; disabled?: boolean }`
  - `DesignStripProps { currentDesignId: string | null; onApply: (id: string | null) => void; disabled: boolean }`
- 公开导出:`DesignThumb`(named),`DesignStrip`(named)

**Step 1.1: 创建 `src/components/DesignThumb.tsx`**

完整文件内容(从 `src/components/RibbonDesign.tsx` 的 `DesignThumb` + `SAMPLE_HTML` + `THUMB_BODY_CSS` + `buildThumbSrcDoc` 拆出,但字号压缩以适配 90×60):

```tsx
import { type DesignMeta } from "../utils/designs";

// 缩略图内部通用样例 HTML(每个 design 共用,只换 design CSS)
const SAMPLE_HTML = `
<h1>一级标题</h1>
<h2>二级标题</h2>
<p>正文示例,展示<strong>粗体</strong>与<em>斜体</em>与<a href="#">链接</a>。</p>
<blockquote>引用块示例,展示左侧边线与背景。</blockquote>
<pre><code>const x = 'code';</code></pre>
<table><tr><th>表头</th><th>表头</th></tr><tr><td>单元格</td><td>单元格</td></tr></table>
<ul><li>列表项 1</li><li>列表项 2</li></ul>
<hr>
<p>行内 <code>code</code> 与 <kbd>Ctrl</kbd> 演示。</p>
`;

// 缩略图内部小字体规则(适配 90×60px 缩略图,字号压缩到 5-8px)
const THUMB_BODY_CSS = `
body { margin: 0; }
.design-thumb-body { font-size: 5px; line-height: 1.4; padding: 4px 6px; }
.design-thumb-body h1 { font-size: 8px; margin: 1px 0; }
.design-thumb-body h2 { font-size: 7px; margin: 1px 0; }
.design-thumb-body h3 { font-size: 6px; margin: 1px 0; }
.design-thumb-body p { margin: 1px 0; }
.design-thumb-body blockquote { margin: 1px 0; padding: 1px 4px; }
.design-thumb-body pre { margin: 1px 0; padding: 2px 3px; font-size: 4px; }
.design-thumb-body table { font-size: 4px; }
.design-thumb-body td, .design-thumb-body th { padding: 0px 2px; }
.design-thumb-body ul { padding-left: 8px; margin: 1px 0; }
.design-thumb-body hr { margin: 1px 0; }
.design-thumb-body img { max-width: 100%; height: auto; }
`;

interface DesignThumbProps {
  design: DesignMeta | null; // null = "默认"卡
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

// 构造缩略图 iframe srcdoc(iframe 自带 CSS 隔离,9 个 design 各自独立 CSS 域,不会冲突)
function buildThumbSrcDoc(design: DesignMeta): string {
  return `<!DOCTYPE html><html><head><style>${THUMB_BODY_CSS}\n${design.css}</style></head><body class="design-thumb-body">${SAMPLE_HTML}</body></html>`;
}

export function DesignThumb({ design, selected, onClick, disabled }: DesignThumbProps) {
  return (
    <button
      type="button"
      className={`design-thumb-card ribbon-thumb-mini ${selected ? "is-selected" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={design ? design.name : "默认(无设计样式)"}
    >
      <div
        className="design-thumb-frame"
        style={{
          background: design?.preview.bg ?? "#ffffff",
        }}
      >
        {design ? (
          <iframe
            className="design-thumb-iframe"
            title={design.name}
            sandbox=""
            srcDoc={buildThumbSrcDoc(design)}
          />
        ) : (
          // 默认卡:不嵌 iframe,直接渲染样例 HTML(浏览器默认样式 + serif)
          <div
            className="design-thumb-body default"
            style={{ fontFamily: "serif" }}
            dangerouslySetInnerHTML={{ __html: SAMPLE_HTML }}
          />
        )}
      </div>
      <span className="design-thumb-name">{design ? design.name : "默认"}</span>
    </button>
  );
}
```

**Step 1.2: 创建 `src/components/DesignStrip.tsx`**

完整文件内容:

```tsx
import { useRef } from "react";
import { DESIGNS, DEFAULT_DESIGN_ID } from "../utils/designs";
import { DesignThumb } from "./DesignThumb";

interface DesignStripProps {
  currentDesignId: string | null;
  onApply: (id: string | null) => void;
  disabled: boolean;
}

export function DesignStrip({ currentDesignId, onApply, disabled }: DesignStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);

  return (
    <div className="ribbon-design-strip-wrap">
      <div
        ref={stripRef}
        className="ribbon-design-strip"
        role="toolbar"
        aria-label="文档设计"
      >
        {/* 默认卡(第一格) */}
        <DesignThumb
          design={null}
          selected={currentDesignId === DEFAULT_DESIGN_ID}
          onClick={() => { if (!disabled) onApply(null); }}
          disabled={disabled}
        />
        {/* 8 个预设 */}
        {DESIGNS.map((d) => (
          <DesignThumb
            key={d.id}
            design={d}
            selected={currentDesignId === d.id}
            onClick={() => { if (!disabled) onApply(d.id); }}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
```

**Step 1.3: 在 `src/App.css` 末尾追加 3 个 CSS 类**

找到 `src/App.css` 文件末尾,在最后一个 `}` 之后追加:

```css
/* === v2.2.0 设计顶级 Ribbon Tab === */
.ribbon-design-strip-wrap {
  flex: 1;
  overflow: hidden;
  padding: 4px 8px;
  background: var(--ribbon-bg, #f8f9fa);
}

.ribbon-design-strip {
  display: flex;
  flex-direction: row;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 0;
  scrollbar-width: thin;
}

.ribbon-design-strip::-webkit-scrollbar {
  height: 6px;
}

.ribbon-design-strip::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb, #cbd5e0);
  border-radius: 3px;
}

.ribbon-thumb-mini {
  flex: 0 0 auto;
  width: 90px;
  padding: 3px;
}

.ribbon-thumb-mini .design-thumb-frame {
  width: 84px;
  height: 48px;
  overflow: hidden;
  border-radius: 3px;
}

.ribbon-thumb-mini .design-thumb-iframe {
  width: 84px;
  height: 48px;
  border: none;
  pointer-events: none;
}

.ribbon-thumb-mini .design-thumb-name {
  font-size: 10px;
  margin-top: 2px;
  text-align: center;
}

.ribbon-thumb-mini.is-selected {
  outline: 2px solid #1f3a68;
  outline-offset: 1px;
}
```

**注意**:原 `RibbonDesign.tsx` 的 `.design-thumb-card` / `.design-thumb-frame` / `.design-thumb-iframe` / `.design-thumb-name` 样式在 `App.css` 中已存在(v2.1.0 加的),不需要重复。新加的 `.ribbon-thumb-mini` 是尺寸覆盖变体。

**Step 1.4: 验证 TypeScript 编译**

Run:
```bash
cd /f/soft/00selfmade/tiptap_app
pnpm tsc --noEmit
```

Expected: 0 errors。新文件 DesignThumb.tsx 和 DesignStrip.tsx 编译通过。

**Step 1.5: 确认无外部消费者**

Run:
```bash
cd /f/soft/00selfmade/tiptap_app
grep -r "DesignThumb\|DesignStrip" src/ --include="*.tsx" --include="*.ts" | grep -v "DesignThumb.tsx\|DesignStrip.tsx"
```

Expected: 无输出(还没人 import 这两个组件,Task 2 才接入)。

**Step 1.6: Commit**

```bash
cd /f/soft/00selfmade/tiptap_app
git add src/components/DesignThumb.tsx src/components/DesignStrip.tsx src/App.css
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(design): extract DesignThumb + add DesignStrip + layout CSS

DesignThumb 从 RibbonDesign.tsx 拆出(90×60px 缩略图变体,字号压缩到 5-8px)
DesignStrip 新增(横向 scrollable 容器,9 张缩略图横排)
App.css 新增 .ribbon-design-strip-wrap / .ribbon-design-strip / .ribbon-thumb-mini

尚未接入 Ribbon,下一步接线。"
```

---

## Task 2: MenuBar 加「设计」tab + Ribbon 接入 DesignStrip

**Files:**
- Modify: `src/components/MenuBar.tsx:6` (RibbonTab type)
- Modify: `src/components/MenuBar.tsx:152-157` (在「插入」tab 后加「设计」tab)
- Modify: `src/components/Ribbon.tsx:42-64` (增加 activeTab === "design" 分支)
- Modify: `src/App.tsx` (RibbonTab type 自动同步;Ribbon 接收新 prop `designDisabled` 用于 design 分支)

**Interfaces:**
- Consumes:
  - `RibbonTab` 当前 `"edit" | "insert"`(改后 `"edit" | "insert" | "design"`)
  - `currentDesignId: string | null`
  - `onApplyDesign: (id: string | null) => void`
  - `designDisabled: boolean`
- Produces:
  - MenuBar 渲染「第 3 个 tab 按钮:设计」(在插入后,视图菜单前)
  - Ribbon 渲染 `activeTab === "design" ? <DesignStrip /> : <RibbonHome | RibbonInsert />`

**Step 2.1: 修改 `MenuBar.tsx` 的 `RibbonTab` type**

定位 `src/components/MenuBar.tsx:6`:
```ts
export type RibbonTab = "edit" | "insert";
```

改为:
```ts
export type RibbonTab = "edit" | "insert" | "design";
```

**Step 2.2: 在 MenuBar.tsx 的「插入」tab 后加「设计」tab**

定位 `src/components/MenuBar.tsx:155-157`(现有「插入」tab 按钮):

```tsx
      <button className={`ribbon-tab ${activeTab === "insert" ? "active" : ""}`} onClick={() => onTabChange("insert")}>
        插入
      </button>
```

在它之后插入:

```tsx
      <button
        className={`ribbon-tab ${activeTab === "design" ? "active" : ""}`}
        onClick={() => onTabChange("design")}
        disabled={mode === "source"}
        title={mode === "source" ? "请切换到编辑视图" : "文档设计(8 套预设 + 默认)"}
      >
        设计
      </button>
```

**Step 2.3: 修改 `Ribbon.tsx` 增加 design 分支**

定位 `src/components/Ribbon.tsx`(整个文件,从 `src/components/RibbonDesign.tsx` 引入和原 props 透传要改)。

完整新文件内容:

```tsx
// v0.2.0:Ribbon 接收 iframeRef,无 preview 入口(编辑器视图 = WYSIWYG = 浏览器视图,无需预览)
// - 字体/段落/样式/链接由 RibbonHome 用 iframe.contentDocument.execCommand 实现
// - 表格/插图/水平线/目录由 RibbonInsert 用 iframe DOM + execCommand 实现
// v2.2.0:增加 activeTab === "design" 分支,渲染 DesignStrip(9 张缩略图横排)

import type { RefObject } from "react";
import { RibbonHome } from "./RibbonHome";
import { RibbonInsert } from "./RibbonInsert";
import { DesignStrip } from "./DesignStrip";
import type { RibbonTab } from "./MenuBar";

export type ViewMode = "page" | "wide";
export type ThemeMode = "system" | "light" | "dark";

interface RibbonProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  disabled: boolean; // 源码视图时禁用
  activeTab: RibbonTab;
  collapsed: boolean;
  onInsertImage: () => void;
  onLink: () => void;
  // 最近颜色(RibbonHome 用),App 层记录用色
  recentTextColors: string[];
  recentHighlightColors: string[];
  onColorUsed: (kind: "text" | "highlight", color: string) => void;
  // RibbonHome 段落组行距 / 段前后 回调(由 App.tsx 实现)
  onSpacingChange: (spacing: { lineHeight?: number; marginTop?: number; marginBottom?: number }) => void;
  // RibbonHome 页面背景色回调(由 App.tsx 写到 shell.headCss)
  onPageBgChange: (hex: string) => void;
  tocEnabled: boolean;
  onToggleToc: () => void;
  tocDisabled: boolean;
  // v2.2.0:设计顶级 tab(从 RibbonHome 移过来)
  currentDesignId: string | null;
  onApplyDesign: (id: string | null) => void;
  designDisabled: boolean;
}

export function Ribbon(props: RibbonProps) {
  return (
    <div className="ribbon">
      <div className={`ribbon-body ${props.collapsed ? "collapsed" : ""}`}>
        <div className={`ribbon-tab-content ${props.disabled ? "disabled" : ""}`}>
          {props.activeTab === "edit" && (
            <RibbonHome
              iframeRef={props.iframeRef}
              onLink={props.onLink}
              recentTextColors={props.recentTextColors}
              recentHighlightColors={props.recentHighlightColors}
              onColorUsed={props.onColorUsed}
              onSpacingChange={props.onSpacingChange}
              onPageBgChange={props.onPageBgChange}
            />
          )}
          {props.activeTab === "insert" && (
            <RibbonInsert
              iframeRef={props.iframeRef}
              onInsertImage={props.onInsertImage}
              tocEnabled={props.tocEnabled}
              onToggleToc={props.onToggleToc}
              tocDisabled={props.tocDisabled}
            />
          )}
          {props.activeTab === "design" && (
            <DesignStrip
              currentDesignId={props.currentDesignId}
              onApply={props.onApplyDesign}
              disabled={props.designDisabled}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

**注意**:
- `RibbonHome` 不再接收 `currentDesignId` / `onApplyDesign` / `designDisabled`(Task 3 会清理 RibbonHome 的 props 定义)
- `RibbonInsert` 不变
- 三个分支用 `{props.activeTab === "X" && ...}` 替代三元,可读性更好

**Step 2.4: 验证 TypeScript 编译**

Run:
```bash
cd /f/soft/00selfmade/tiptap_app
pnpm tsc --noEmit
```

Expected: **会有 2-3 个 error**:
- `src/components/RibbonHome.tsx` 的 props 仍接收 `currentDesignId` 等(但没人传了)
- 可能 `RibbonHome` 的内部 `RibbonDesign` 引用未删

这些是 Task 3 要清理的。当前预期是 error 数量 **比 Task 1 完成时少** 即可(即:之前没传 prop 就报缺的 error 应该消失,反而出现「RibbonHome props 多余」的 error)。

如确实有 error 且能明确归类为 Task 3 的清理工作,记录下来继续;若 error 是 Task 2 引入的(比如 Ribbon 编译失败),停下修。

**Step 2.5: 验证 MenuBar 编译 + 简单冒烟**

Run:
```bash
cd /f/soft/00selfmade/tiptap_app
pnpm tsc --noEmit 2>&1 | head -50
```

确认报错都是预期的("RibbonHome 接收多余 prop"或"RibbonHome 内部 RibbonDesign 引用未删"),不是 MenuBar/Ribbon/App.tsx 的错误。

**Step 2.6: Commit(暂存,Task 3 清理后整体验证再 amend 或新 commit)**

**选项 A(推荐)**:**不 commit**,等 Task 3 清理完一并 commit。这样 commit 历史清晰。

**选项 B**:如果想保留每个 task 的独立 commit,可现在 commit,Task 3 再 commit:

```bash
cd /f/soft/00selfmade/tiptap_app
git add src/components/MenuBar.tsx src/components/Ribbon.tsx
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(menubar): add 设计 tab + wire DesignStrip into Ribbon

RibbonTab type: 加 'design'
MenuBar: 在「插入」后、「视图」菜单前新增「设计」tab 按钮(source 视图 disabled)
Ribbon: 增加 activeTab === 'design' 分支,渲染 DesignStrip
RibbonHome: 不再接收 currentDesignId/onApplyDesign/designDisabled(下个 task 清理)"
```

本 plan **采用选项 B**(每个 task 一个 commit,符合项目 v2.1.0 历史模式)。

---

## Task 3: 清理 RibbonHome(移除 RibbonDesign 引用) + 删除 RibbonDesign.tsx

**Files:**
- Modify: `src/components/RibbonHome.tsx`(删除 RibbonDesign import + props + render)
- Delete: `src/components/RibbonDesign.tsx`

**Interfaces:**
- Consumes: Task 2 后的 Ribbon.tsx 不再传 `currentDesignId` / `onApplyDesign` / `designDisabled` 给 RibbonHome
- Produces: RibbonHome props 减少 3 个;`RibbonDesign` 组件文件不存在

**Step 3.1: 修改 `RibbonHome.tsx` props 类型**

定位 `src/components/RibbonHome.tsx:23-39`,找到:

```tsx
interface RibbonHomeProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  // 链接
  onLink: () => void;
  // 最近颜色(RibbonHome 用),App 层记录用色
  recentTextColors: string[];
  recentHighlightColors: string[];
  onColorUsed: (kind: "text" | "highlight", color: string) => void;
  // 段落组行距 / 段前后 — 直接改 iframe 内选区块的 inline style
  onSpacingChange: (spacing: { lineHeight?: number; marginTop?: number; marginBottom?: number }) => void;
  // 页面背景色回调(由 App.tsx 写到 shell.headCss)
  onPageBgChange: (hex: string) => void;
  // v2.1.0:设计子菜单
  currentDesignId: string | null;
  onApplyDesign: (id: string | null) => void;
  designDisabled: boolean;
}
```

改为:

```tsx
interface RibbonHomeProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  // 链接
  onLink: () => void;
  // 最近颜色(RibbonHome 用),App 层记录用色
  recentTextColors: string[];
  recentHighlightColors: string[];
  onColorUsed: (kind: "text" | "highlight", color: string) => void;
  // 段落组行距 / 段前后 — 直接改 iframe 内选区块的 inline style
  onSpacingChange: (spacing: { lineHeight?: number; marginTop?: number; marginBottom?: number }) => void;
  // 页面背景色回调(由 App.tsx 写到 shell.headCss)
  onPageBgChange: (hex: string) => void;
}
```

**Step 3.2: 修改 `RibbonHome.tsx` 函数签名**

定位 `src/components/RibbonHome.tsx:41-52`,找到:

```tsx
export function RibbonHome({
  iframeRef,
  onLink,
  recentTextColors,
  recentHighlightColors,
  onColorUsed,
  onSpacingChange,
  onPageBgChange,
  currentDesignId,
  onApplyDesign,
  designDisabled,
}: RibbonHomeProps) {
```

改为:

```tsx
export function RibbonHome({
  iframeRef,
  onLink,
  recentTextColors,
  recentHighlightColors,
  onColorUsed,
  onSpacingChange,
  onPageBgChange,
}: RibbonHomeProps) {
```

**Step 3.3: 删除 RibbonHome 顶部的 RibbonDesign import**

定位 `src/components/RibbonHome.tsx:10`:

```tsx
import { RibbonDesign } from "./RibbonDesign";
```

删除整行。

**Step 3.4: 删除 RibbonHome 末尾的 RibbonDesign 渲染**

定位 `src/components/RibbonHome.tsx:364-370`,找到:

```tsx
      {/* 设计组 */}
      <RibbonDesign
        currentDesignId={currentDesignId}
        onApply={onApplyDesign}
        disabled={designDisabled}
      />
    </>
```

改为:

```tsx
    </>
```

(保留 `<>` 闭合;删掉 RibbonDesign 的 render block)

**Step 3.5: 删除 `src/components/RibbonDesign.tsx`**

Run:
```bash
cd /f/soft/00selfmade/tiptap_app
git rm src/components/RibbonDesign.tsx
```

Expected: 文件被 git 标记删除。下一步 tsc 验证。

**Step 3.6: 验证 TypeScript 编译**

Run:
```bash
cd /f/soft/00selfmade/tiptap_app
pnpm tsc --noEmit
```

Expected: **0 errors**。RibbonHome props 减少、import 删了、render 删了,完全干净。

**Step 3.7: 验证全局无 RibbonDesign 残留**

Run:
```bash
cd /f/soft/00selfmade/tiptap_app
grep -r "RibbonDesign" src/ --include="*.tsx" --include="*.ts"
```

Expected: 无输出。所有 RibbonDesign 引用已清理。

**Step 3.8: Commit**

```bash
cd /f/soft/00selfmade/tiptap_app
git add src/components/RibbonHome.tsx src/components/RibbonDesign.tsx
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "refactor(design): remove legacy RibbonDesign (replaced by DesignStrip)

RibbonHome props 移除 currentDesignId/onApplyDesign/designDisabled(已移到 Ribbon)
RibbonHome 末尾的 RibbonDesign render 删除
RibbonDesign.tsx 整体删除(200 行 portal+anchor 浮层逻辑全部作废)

RibbonDesign 的拆分产物:
- DesignThumb → src/components/DesignThumb.tsx(独立可复用)
- DesignStrip → src/components/DesignStrip.tsx(横向 scrollable 容器)"
```

---

## Task 4: 真机验证 + fixup(按 spec §11.2 全部用例)

**Files:**
- 仅 build,不修改源码;若发现 bug → 修 → 独立 commit

**测试基线**:本任务必须在真机(sandbox-verify / 直接安装 exe)上完成,**不通过不 commit**。这是项目硬规则(`memory/feedback_no_commit_without_real_test.md`)。

**Step 4.1: 重新构建 Tauri debug build 用于开发态真机验证**

Run:
```bash
cd /f/soft/00selfmade/tiptap_app
pnpm tauri build --debug
```

Expected: 构建成功(可能有 warning,但无 error)。产物路径 `src-tauri/target/debug/bundle/...`

**Step 4.2: 启动 sandbox-verify 真机环境**

按 `memory/reference_sandbox_verify_weavepage.md` 描述:
- Wrapper: `F:\soft\00selfmade\sandbox-verify\weavepage\`
- .wsb 配置文件在 wrapper 目录内
- 进入 sandbox → 装 debug build → 启动应用

**Step 4.3: 执行 spec §11.2 全部 12 项真机用例**

逐项执行并记录结果:

| # | 用例 | 通过条件 |
|---|---|---|
| 1 | 打开空白文档,点「设计」tab | ribbon 区显示 9 张缩略图横排(默认 + 8 套预设) |
| 2 | 点「文艺书卷」缩略图 | 编辑视图立即变米黄色衬线风 + docHtml 出现 `<style data-weavepage-design="literary-scroll">` |
| 3 | 再点「科技感」 | 编辑视图换深色 monospace + 旧 design style 被替换(非叠加) |
| 4 | 点「默认」 | 所有 design style 移除,回到浏览器默认 |
| 5 | 切回「编辑」tab | 缩略图消失,显示 normal toolbar(RibbonHome) |
| 6 | 切到「插入」tab | 缩略图消失,显示 RibbonInsert |
| 7 | 切到「源码视图」 | 「设计」tab disabled + tooltip「请切换到编辑视图」 |
| 8 | 切回「编辑」模式 | 「设计」tab 重新 enabled |
| 9 | 保存文档(带 design style),关闭 → 重开文件 | 编辑视图自动恢复 design style + 当前 tab 是「编辑」(不是「设计」) |
| 10 | 9 张缩略图在窄屏(<1024px) | 横向 scroll 正常 + scrollbar 美化 |
| 11 | ribbon 折叠状态下点「设计」tab | 缩略图在折叠 ribbon 区域显示或折叠自动展开(行为合理即可) |
| 12 | 设计功能回归测试 | 沿用 v2.1.0 所有用例,确认未回归 |

**Step 4.4: 缩略图视觉抽样**

挑 3 个 design(经典学术 / 科技感 / 文艺书卷)目测缩略图是否清晰可辨(90×60px 内仍能看出风格差异)。

如果缩略图太小 / 字号看不清,**记录问题** → 进入 Step 4.5 修。

**Step 4.5: Fixup(若有 bug)**

若发现 bug:
1. 在 sandbox 内复现并截图
2. 退出 sandbox
3. 修源码
4. 重新 `pnpm tauri build --debug`
5. 重进 sandbox 重测
6. fixup commit:

```bash
cd /f/soft/00selfmade/tiptap_app
git add src/...
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "fix(design-menu): [简述修复]

[详细描述问题 + 修复方案]"
```

**Step 4.6: TypeScript 编译 + 单测最终验证**

Run:
```bash
cd /f/soft/00selfmade/tiptap_app
pnpm tsc --noEmit
pnpm tsx src/utils/designs.test.ts
```

Expected: tsc 0 error;designs.test.ts 全过(沿用 v2.1.0,本次未改 designs.ts)。

**Step 4.7: 若 Step 4.5 有 fixup,最终 commit;否则无需 commit**

如果 Task 4 没改源码,**无 commit**;若有 fixup,fixup commit 已在 Step 4.5 完成。

---

## Task 5: Release 准备 — 版本号 2.1.0 → 2.2.0 + 构建产物

**Files:**
- Modify: `package.json` (version: "2.1.0" → "2.2.0")
- Modify: `src-tauri/tauri.conf.json` (version: "2.1.0" → "2.2.0")
- Modify: `src-tauri/Cargo.toml` (version: "2.1.0" → "2.2.0")
- Modify: `README.md` (添加 v2.2.0 变更日志 + SHA256 占位,Task 完成后填)
- Modify: `_upload_weavepage.py` (FILES_TO_UPLOAD 路径同步到 v2.2.0)

**Step 5.1: 同步版本号到 3 个 manifest 文件**

Run:
```bash
cd /f/soft/00selfmade/tiptap_app
grep -n '"version"' package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
```

把 3 处 `"version": "2.1.0"` 全部改为 `"2.1.0"` → `"2.2.0"`(也检查 Cargo.toml 是 `version = "2.1.0"` 格式)。

**Step 5.2: 同步 `_upload_weavepage.py`**

打开 `F:\soft\00selfmade\tiptap_app\_upload_weavepage.py`,找到 `FILES_TO_UPLOAD` 字典,把:
- `WeavePage_2.1.0_x64-setup.exe` → `WeavePage_2.2.0_x64-setup.exe`
- `WeavePage_2.1.0_x64-update.exe` → `WeavePage_2.2.0_x64-update.exe`

**Step 5.3: 构建 release 产物**

Run:
```bash
cd /f/soft/00selfmade/tiptap_app
pnpm release
```

Expected: 构建成功,产出:
- `release/WeavePage_2.2.0_x64-setup.exe` (full, ~219M)
- `release/WeavePage_2.2.0_x64-update.exe` (update, ~5.6M)

如果 `pnpm release` 不存在,fallback:`pnpm tauri build`。

**Step 5.4: 计算产物 SHA256**

Run:
```bash
cd /f/soft/00selfmade/tiptap_app
certutil -hashfile release\WeavePage_2.2.0_x64-setup.exe SHA256
certutil -hashfile release\WeavePage_2.2.0_x64-update.exe SHA256
```

记录两个 SHA256 字符串,用于 README。

**Step 5.5: 更新 README.md 变更日志**

定位 README 顶部的变更日志(按 v2.1.0 的格式),在 v2.1.0 条目之前插入 v2.2.0 条目:

```markdown
## v2.2.0 — 文档设计入口提升为顶级 Ribbon Tab (2026-08-26)

**新增**:
- 「设计」从 ribbon「编辑」tab 内的 dropdown 浮层按钮,提升为顶级 ribbon tab(与「编辑」「插入」平级)
- 缩略图(9 张 = 默认 + 8 套预设)改为 ribbon 区域内的横向 scrollable 一条
- 菜单栏顺序:文件 / 编辑 / 插入 / 设计 / 视图 / 帮助

**改进**:
- 设计功能入口更显眼,与 Word/Office 设计 tab 一致
- 缩略图渲染去掉 portal/anchor 浮层,直接渲染在 ribbon 区域,代码更简洁(净 -50 行)

**下载**:
- 完整安装:`WeavePage_2.2.0_x64-setup.exe` (SHA256: <填>)
- 升级安装:`WeavePage_2.2.0_x64-update.exe` (SHA256: <填>)

---

(原 v2.1.0 条目保留)
```

**Step 5.6: 同步 `version.json` schema(发版前,本任务暂不实际改服务器 version.json)**

**说明**:`_upload_weavepage.py` 上传时会自动生成新 `version.json`(包含 v2.2.0 channels + full/update URL)。本 task 不手动改 `version.json`,等 Task 6 上传时自动生成。

**Step 5.7: Commit 版本号更新**

```bash
cd /f/soft/00selfmade/tiptap_app
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml _upload_weavepage.py README.md
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "chore(release): v2.2.0 — 设计顶级 ribbon tab

version: 2.1.0 → 2.2.0(package.json + tauri.conf.json + Cargo.toml)
_upload_weavepage.py: FILES_TO_UPLOAD 同步 v2.2.0
README.md: 变更日志 + SHA256

构建产物:
- release/WeavePage_2.2.0_x64-setup.exe (~219M)
- release/WeavePage_2.2.0_x64-update.exe (~5.6M)"
```

---

## Task 6: 上传 aiec.fun + version.json 切换(可选,需用户 opt-in)

**前置**:**等用户确认**是否上传(项目偏好:`memory/feedback_no_commit_without_real_test.md` + 用户历史偏好"不上传前不 commit",实际是"commit 后等用户说才上传")。

**Files:**
- Run: `_upload_weavepage.py`(修改文件路径在 Task 5 已同步)

**Step 6.1: 询问用户上传决策**

按 CLAUDE.md §4 撞墙征兆检查 + handoff §4 惯例:发布动作需用户授权。

向用户报告:
> v2.2.0 构建产物已就绪:
> - `release/WeavePage_2.2.0_x64-setup.exe` (SHA256: <填>)
> - `release/WeavePage_2.2.0_x64-update.exe` (SHA256: <填>)
> 
> 是否上传到 aiec.fun?需要切换 `version.json` 到 v2.2.0 channels。

**Step 6.2: 若用户批准上传**

Run:
```bash
cd /f/soft/00selfmade/tiptap_app
python _upload_weavepage.py
```

按 handoff §4 验证清单确认 md5:
- 完整安装包 md5 匹配
- 升级安装包 md5 匹配
- `version.json` 切换到 v2.2.0
- `common.php` / `download.php` / `counter.php` / `.htaccess` 服务器侧 md5 匹配

**Step 6.3: Commit version.json(若脚本自动生成且本地 track)**

```bash
cd /f/soft/00selfmade/tiptap_app
git status
# 若 version.json 是 tracked 文件,add + commit;若 untracked,询问用户是否 track
```

**Step 6.4: 不 push(项目硬规则:用户偏好"do not push",等用户 opt-in)**

**STOP**:不 `git push`,等用户明确说"push"。

---

## Self-Review Checklist

实施前过一遍这个 checklist(自我 review,确保 plan 无 gap):

1. **Spec coverage**:
   - [x] Q1 顶级 ribbon tab → Task 2 Step 2.1-2.2
   - [x] Q2 横向 scrollable 一条 → Task 1 Step 1.1-1.3 + Task 2 Step 2.3
   - [x] Q3 删除原 RibbonDesign 按钮 → Task 3 Step 3.4-3.5
   - [x] Q4 不删原有 5 项 → 全程不修改文件 / 编辑 / 插入 / 视图 / 帮助 任何逻辑
   - [x] Q5 缩略图尺寸 90×60 → Task 1 Step 1.3 + Step 1.1 THUMB_BODY_CSS 字号压缩
   - [x] Q6 点击保持在「设计」tab → DesignStrip 不切 tab(只在 onApply 时调 App.applyDesign,不调 setActiveTab)
   - [x] Q7 source 视图禁用 → Task 2 Step 2.2 disabled + tooltip
   - [x] Q8 沿用 v2.1.0 设计功能 → 全程不动 designs.ts / applyDesign / parseDesignId
2. **Placeholder scan**:无 TBD/TODO
4. **Type consistency**:`RibbonTab` 在 MenuBar.tsx 定义,Ribbon.tsx 和 App.tsx 都 `import type`,修改 type 后所有引用同步;`currentDesignId` / `onApplyDesign` / `designDisabled` 在 Ribbon.tsx 接收,转发给 DesignStrip
5. **File structure 边界**:DesignThumb(纯展示)+ DesignStrip(容器,无业务逻辑)+ Ribbon(分支路由)+ MenuBar(tab 按钮)+ RibbonHome(去除设计相关 props)+ App.css(布局)

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-26-design-menu-implementation.md`.**

下一步两个执行选项:
1. **Subagent-Driven (推荐)** — 我每个 task dispatch 一个 fresh subagent,task 之间 review
2. **Inline Execution** — 在当前会话内执行,带 checkpoint

需要选哪个?(或直接说"go inline"开始)