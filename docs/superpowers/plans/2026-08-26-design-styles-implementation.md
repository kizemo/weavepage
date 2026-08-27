# WeavePage 设计子菜单(文档设计) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 WeavePage Ribbon 加「设计」按钮组,点击弹出 8 套预设样式 + 1 个「默认」共 9 张 16:9 缩略图面板;选中的设计 CSS 注入到当前文档 `<head>` 的 `<style data-weavepage-design="X">` 中,持久化到 HTML 文件本身;打开旧 HTML 自动识别当前设计,面板对应卡高亮。

**Architecture:**
- **数据层** — 新增 `src/utils/designs.ts`(8 套 CSS + 元数据);新增 `applyDesignToShellHead()` / `parseDesignId()` 两个纯函数(操作 `shell.head` 字符串,不触碰 docHtml)
- **UI 层** — 新增 `src/components/RibbonDesign.tsx`(RibbonButton + DesignPickerPanel,Panel 用 React Portal 浮在按钮下方)
- **缩略图** — 方案 β:每个 `<DesignThumb>` 渲染迷你样例 HTML(`<h1>/<h2>/<p>/<blockquote>/<pre>/<table>` 等),把 design CSS 通过 `<style>` 标签内联进 thumb 容器,真实 CSS 渲染,**不引入 html2canvas 依赖**
- **状态层** — App.tsx 加 `currentDesignId: string | null`(纯内存 useState,不持久化到 localStorage / DocState),apply / parse 在 App.tsx 完成
- **持久化** — 设计 CSS 写入 `shell.head`,`buildFullDoc` 自动包含在保存的 HTML;打开时 `parseDesignId(shell.head)` 还原 currentDesignId

**Tech Stack:** React 19 + Tauri 2 + Vite 7 + TypeScript 5.8 + Tiptap 3.30(本特性不直接用 Tiptap schema — 走 iframe HTML 字符串层,与现有 tocGen 同一架构)

## Global Constraints

- **目标版本**:v2.1.0(从 v2.0.6 升级,minor bump)
- **不引入新依赖**:禁止 `pnpm add` — 缩略图用 React 渲染真实 CSS,不引入 `html2canvas` / `dom-to-image` 等
- **不持久化到 localStorage / DocState**:`currentDesignId` 只在 App useState 内存;设计 CSS 通过 `shell.head` 字符串自动写入 HTML
- **TOC class 前缀是 `wp-toc-*`**(不是 `doc-toc-*`):设计 CSS 覆写目录样式时用 `wp-toc-floating-wrap` / `wp-toc-h2-link` / `wp-toc-h3-submenu` 等
- **注入锚点**:设计 CSS 注入到 `<style id="wp-toc-style">` 之后(若存在),否则注入到 `</head>` 之前 — 借助 `applyDesignToShellHead` 实现
- **tocGen 兼容性**:`buildTocStyleTag()` 新增 `data-weavepage-toc` 属性,**保留** `id="wp-toc-style"` 不动(避免 `removeTocStyleTag` 失效)
- **Ribbon 放置**:本特性新增 `<RibbonDesign>` 接入 edit tab 末位(在颜色/段距/背景之后),用 `ribbon-group` 容器 + 现有 border-left 分隔
- **未操作不注入**:打开文件 / 新建空白文档时,`parseDesignId` 仅作为面板高亮判断,**不**自动修改 shell.head / docHtml
- **disabled 场景**:`mode !== "edit"` 或 `isTextDoc` 时,设计按钮 `disabled`,鼠标悬停 tooltip 提示(沿用现有 `RibbonButton.disabled` 行为)

## File Structure

**新增文件:**
- `src/utils/designs.ts` — 8 个 DesignMeta + 8 套 CSS 字符串 + `getDesignById()` 查询函数
- `src/components/RibbonDesign.tsx` — RibbonButton "设计 ▼" + DesignPickerPanel 浮层(Portal)+ 9 张 `<DesignThumb>` 缩略图
- `src/utils/designs.test.ts` — `applyDesignToShellHead` / `parseDesignId` 纯函数单元测试(node:test + tsx)

**修改文件:**
- `src/utils/tocGen.ts` — `buildTocStyleTag()` 输出加 `data-weavepage-toc` 属性(在 `id="wp-toc-style"` 之后)
- `src/components/Ribbon.tsx` — 接收 `currentDesignId` + `onApplyDesign` + `designDisabled` props,传给 `<RibbonHome>`
- `src/components/RibbonHome.tsx` — 接收同样 props,渲染 `<RibbonDesign>` 在最末 ribbon-group
- `src/App.tsx` — 加 `currentDesignId` state + `applyDesign` / `parseDesignId` 函数;把 props 透传给 Ribbon
- `src/App.css` — 新增 `.ribbon-design-picker` 面板 + `.design-thumb` 缩略图卡 + `.design-thumb-card` 选中态样式
- `package.json` — 改 `"version": "2.0.6"` → `"2.1.0"`

**不在本计划范围(留给未来):**
- 用户自定义主色 / 字体 / 行距(spec §12 显式 YAGNI)
- 上传 / 导入自定义 CSS
- 源代码视图编辑 design style 自动同步编辑视图(spec §10.5 标记为下一阶段)

---

## Task 1: 在 `buildTocStyleTag()` 输出加 `data-weavepage-toc` 属性

**Files:**
- Modify: `src/utils/tocGen.ts:410-416`
- Test: `src/utils/tocGen.test.ts`(追加 1 个 test case)

**Interfaces:**
- 无新增 export
- `buildTocStyleTag(): string` 输出形如 `<!-- WeavePage TOC: 样式(可编辑) -->\n<style id="wp-toc-style" data-weavepage-toc>\n${TOC_CSS}\n</style>\n<!-- /WeavePage TOC: 样式 -->`

- [ ] **Step 1: 写失败测试**

在 `src/utils/tocGen.test.ts` 追加(在最后一个 test 后):

```ts
import { buildTocStyleTag } from "./tocGen";

test("buildTocStyleTag 输出含 data-weavepage-toc 属性", () => {
  const out = buildTocStyleTag();
  // 新增:data-weavepage-toc 属性(便于 design CSS 注入锚点)
  assert.match(out, /<style\s+id="wp-toc-style"\s+data-weavepage-toc>/);
  // 保留:id 仍存在(不破坏 removeTocStyleTag / hasTocStyleTag)
  assert.match(out, /<style\s+id="wp-toc-style"/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm tsx src/utils/tocGen.test.ts`
Expected: FAIL `AssertionError: expected '<style id="wp-toc-style">' to match /<style\s+id="wp-toc-style"\s+data-weavepage-toc>/`

- [ ] **Step 3: 改 `buildTocStyleTag`**

Edit `src/utils/tocGen.ts:411-415`:

```ts
export function buildTocStyleTag(): string {
  return (
    `<!-- WeavePage TOC: 样式(可编辑) -->\n` +
    `<style id="wp-toc-style" data-weavepage-toc>\n${TOC_CSS}\n</style>\n` +
    `<!-- /WeavePage TOC: 样式 -->`
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm tsx src/utils/tocGen.test.ts`
Expected: PASS(所有 tocGen 测试通过,包括新加的)

- [ ] **Step 5: Commit**

```bash
git add src/utils/tocGen.ts src/utils/tocGen.test.ts
git -c user.name="WeavePage" -c user.email="dev@aiec.fun" commit -m "feat(toc): buildTocStyleTag 输出加 data-weavepage-toc 属性(便于设计 CSS 注入锚点)"
```

---

## Task 2: 创建 `src/utils/designs.ts`(8 套 CSS + 元数据 + getDesignById)

**Files:**
- Create: `src/utils/designs.ts`

**Interfaces:**
- `export interface DesignMeta { id: string; name: string; css: string; fontFamily: string; preview: { bg: string; fg: string; accent: string } }`
- `export const DESIGNS: DesignMeta[]` — 长度 8,顺序 = 索引,索引 = 面板第 N 个卡(0=默认预留,1-8=8 套)
- `export const DEFAULT_DESIGN_ID = null` — 特殊值(面板第一格"默认")
- `export function getDesignById(id: string | null): DesignMeta | null` — null 返 null,未找到返 null
- `export function applyDesignToShellHead(head: string, id: string | null, css: string | null): string` — 移除所有 `<style data-weavepage-design>...</style>`,若 id 非 null 在 `<style id="wp-toc-style">` 之后插入新 style
- `export function parseDesignId(head: string): string | null` — 提取 `<style[^>]*data-weavepage-design="X">` 的 X(取第一个)

- [ ] **Step 1: 创建文件骨架(类型 + 函数签名 + 一个空 design 占位)**

Create `src/utils/designs.ts`:

```ts
// WeavePage 设计子菜单 — 8 套预设文档样式 + 默认
// 设计 CSS 注入到 shell.head 的 <style data-weavepage-design="X"> 位置
// 用户硬约束:不引入新依赖;不持久化到 localStorage;打开文件时不自动注入
// 8 套 CSS 完整定义在 spec §6.1-6.8(本文件直接复用 spec 文案)

export interface DesignMeta {
  id: string;             // 'classic-academic' / 'modern-minimalist' / ...
  name: string;           // '经典学术' / '现代简约' / ...
  css: string;            // 完整 CSS 字符串(注入到 <head>)
  fontFamily: string;     // 主字体栈(给缩略图渲染用)
  preview: {              // 缩略图卡片调色板(无 CSS 依赖的视觉提示)
    bg: string;
    fg: string;
    accent: string;
  };
}

export const DEFAULT_DESIGN_ID = null;  // "默认"按钮 = null,无 DesignMeta

export const DESIGNS: DesignMeta[] = [
  // 占位:在后续 Step 2 替换为 8 套完整 CSS
  {
    id: "classic-academic",
    name: "经典学术",
    css: "",
    fontFamily: "'Source Serif Pro', 'Noto Serif SC', serif",
    preview: { bg: "#ffffff", fg: "#1a1a1a", accent: "#000000" },
  },
];

export function getDesignById(id: string | null): DesignMeta | null {
  if (id === null) return null;
  return DESIGNS.find((d) => d.id === id) ?? null;
}

// 移除 shell.head 中所有 <style data-weavepage-design>...</style>
// 注入位置:若 <style id="wp-toc-style"> 存在 → 插在它后面
//          否则 → 插在 </head> 之前
export function applyDesignToShellHead(
  head: string,
  id: string | null,
  css: string | null
): string {
  let next = head.replace(
    /<style[^>]*data-weavepage-design[^>]*>[\s\S]*?<\/style>/g,
    ""
  );
  if (id === null || css === null) return next;
  const styleTag = `<style data-weavepage-design="${id}">\n${css}\n</style>`;
  const tocMatch = next.match(
    /(<style\s+id="wp-toc-style"[^>]*>[\s\S]*?<\/style>)/
  );
  if (tocMatch) {
    return next.replace(tocMatch[1], `${tocMatch[1]}\n${styleTag}`);
  }
  // 兜底:没找到 toc style → 插到 </head> 之前
  return next.replace("</head>", `${styleTag}\n</head>`);
}

// 从 shell.head 解析当前设计 id(取第一个 data-weavepage-design 的 value)
export function parseDesignId(head: string): string | null {
  const m = head.match(/<style[^>]*data-weavepage-design="([^"]+)"/);
  return m ? m[1] : null;
}
```

- [ ] **Step 2: 填充 8 套完整 CSS(spec §6.1-6.8 复制)**

Edit `src/utils/designs.ts` — 把 8 个 design 对象的 `css` 字段从 `""` 替换为 spec §6.1-§6.8 的完整 CSS 字符串。**直接读 spec 文件复制,不要手写**(spec 已经审过)。

参考:每个 `css` 字段长 ~30 行,8 套合计 ~240 行。spec 路径:
```
F:\soft\00selfmade\tiptap_app\docs\superpowers\specs\2026-08-26-design-styles-design.md
```
§6.1 起始行号 273,§6.8 结束行号 615。

完整 8 套 `DESIGNS` 数组(占位骨架,8 个 id 顺序固定):

```ts
export const DESIGNS: DesignMeta[] = [
  { id: "classic-academic",   name: "经典学术",  css: /* 来自 spec §6.1 */ "",
    fontFamily: "'Source Serif Pro', 'Noto Serif SC', serif",
    preview: { bg: "#ffffff", fg: "#1a1a1a", accent: "#000000" } },
  { id: "modern-minimalist",  name: "现代简约",  css: /* 来自 spec §6.2 */ "",
    fontFamily: "Inter, 'Noto Sans SC', -apple-system, sans-serif",
    preview: { bg: "#ffffff", fg: "#1f2328", accent: "#2563eb" } },
  { id: "literary-scroll",    name: "文艺书卷",  css: /* 来自 spec §6.3 */ "",
    fontFamily: "'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', serif",
    preview: { bg: "#f5efe0", fg: "#3b2f1e", accent: "#b48a4a" } },
  { id: "tech-dark",          name: "科技感",    css: /* 来自 spec §6.4 */ "",
    fontFamily: "'JetBrains Mono', Inter, -apple-system, sans-serif",
    preview: { bg: "#0d1117", fg: "#c9d1d9", accent: "#58a6ff" } },
  { id: "business-formal",    name: "商务正式",  css: /* 来自 spec §6.5 */ "",
    fontFamily: "Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    preview: { bg: "#f4f6fa", fg: "#1a2540", accent: "#1f3a68" } },
  { id: "soft-elegant",       name: "柔雅",      css: /* 来自 spec §6.6 */ "",
    fontFamily: "'Cormorant Garamond', 'Noto Serif SC', 'Songti SC', serif",
    preview: { bg: "#faf3ee", fg: "#5c3a2e", accent: "#b06a5c" } },
  { id: "mint-fresh",         name: "薄荷清新",  css: /* 来自 spec §6.7 */ "",
    fontFamily: "'Nunito', 'Noto Sans SC', -apple-system, sans-serif",
    preview: { bg: "#eaf6ef", fg: "#1f3d2c", accent: "#2c8a6b" } },
  { id: "vintage-print",      name: "复古印刷",  css: /* 来自 spec §6.8 */ "",
    fontFamily: "'Old Standard TT', 'Noto Serif SC', 'Songti SC', serif",
    preview: { bg: "#d9c9a8", fg: "#3a2f1d", accent: "#3a2f1d" } },
];
```

每个 `css: /* 来自 spec §6.X */ "",` 用模板字符串替换为 spec §6.X 的 CSS 内容(去掉外层 `css` 变量包装,保留 `body { ... }` 等内部所有规则)。

- [ ] **Step 3: 验证 8 套 CSS 长度 + 关键类名存在**

Run:
```bash
pnpm tsx -e "import('./src/utils/designs.ts').then(m => { m.DESIGNS.forEach(d => console.log(d.id, d.css.length, d.css.includes('.wp-toc-floating-wrap'), d.css.includes('img { max-width: 100%'))); })"
```

Expected: 8 行,每行 `css.length > 500` 且两个 includes 都为 `true`(`.wp-toc-floating-wrap` 覆写 + `img max-width` 通用护栏)。

- [ ] **Step 4: 跑 lint 确认无错**

Run: `pnpm exec tsc --noEmit`
Expected: 无 TS 错误(可能有未使用 import 警告,忽略)

- [ ] **Step 5: Commit**

```bash
git add src/utils/designs.ts
git -c user.name="WeavePage" -c user.email="dev@aiec.fun" commit -m "feat(designs): 新增 designs.ts — 8 套预设 CSS + getDesignById + applyDesignToShellHead + parseDesignId"
```

---

## Task 3: 写 `applyDesignToShellHead` / `parseDesignId` 单元测试

**Files:**
- Create: `src/utils/designs.test.ts`

**Interfaces:**
- 无新增
- 测试覆盖:移除/添加/替换 design style、锚点定位(`<style id="wp-toc-style">` 之后 vs `</head>` 之前)、`parseDesignId` 取第一个/找不到返 null

- [ ] **Step 1: 写测试**

Create `src/utils/designs.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DESIGNS,
  DEFAULT_DESIGN_ID,
  getDesignById,
  applyDesignToShellHead,
  parseDesignId,
} from "./designs";

test("DESIGNS 长度 = 8", () => {
  assert.equal(DESIGNS.length, 8);
});

test("DESIGNS id 唯一", () => {
  const ids = DESIGNS.map((d) => d.id);
  assert.equal(new Set(ids).size, 8);
});

test("DEFAULT_DESIGN_ID = null", () => {
  assert.equal(DEFAULT_DESIGN_ID, null);
});

test("getDesignById(null) 返 null", () => {
  assert.equal(getDesignById(null), null);
});

test("getDesignById 有效 id 返对象", () => {
  const d = getDesignById("modern-minimalist");
  assert.ok(d);
  assert.equal(d!.name, "现代简约");
});

test("getDesignById 无效 id 返 null", () => {
  assert.equal(getDesignById("not-a-design"), null);
});

test("applyDesignToShellHead id=null 移除所有 design style", () => {
  const head = `<head><style data-weavepage-design="foo">x</style><style data-weavepage-design="bar">y</style></head>`;
  const out = applyDesignToShellHead(head, null, null);
  assert.ok(!out.includes("data-weavepage-design"));
});

test("applyDesignToShellHead 有 toc style 时插在它之后", () => {
  const head = `<head><style id="wp-toc-style" data-weavepage-toc>TOC</style></head>`;
  const out = applyDesignToShellHead(head, "modern-minimalist", "BODY{}");
  // 顺序:toc style 在前,design style 在后
  const tocIdx = out.indexOf("wp-toc-style");
  const designIdx = out.indexOf("data-weavepage-design");
  assert.ok(tocIdx > -1 && designIdx > -1);
  assert.ok(designIdx > tocIdx, "design 必须在 toc 之后");
  // 注入的 style 包含 css
  assert.ok(out.includes("BODY{}"));
  assert.ok(out.includes('data-weavepage-design="modern-minimalist"'));
});

test("applyDesignToShellHead 无 toc style 时插到 </head> 之前", () => {
  const head = `<head><meta charset="utf-8"></head>`;
  const out = applyDesignToShellHead(head, "tech-dark", "BODY{}");
  const headClose = out.indexOf("</head>");
  const designIdx = out.indexOf("data-weavepage-design");
  assert.ok(designIdx > -1);
  assert.ok(designIdx < headClose, "design 必须在 </head> 之前");
});

test("applyDesignToShellHead 替换旧 design(不叠加)", () => {
  const head = `<head><style id="wp-toc-style">TOC</style><style data-weavepage-design="old">OLD</style></head>`;
  const out = applyDesignToShellHead(head, "new", "NEW_CSS");
  // 只剩一个 design style
  const matches = out.match(/data-weavepage-design="/g);
  assert.equal(matches?.length, 1);
  // 是新 id
  assert.ok(out.includes('data-weavepage-design="new"'));
  assert.ok(!out.includes('data-weavepage-design="old"'));
  assert.ok(!out.includes("OLD"));
});

test("parseDesignId 无 design 返 null", () => {
  assert.equal(parseDesignId("<head><style id=\"wp-toc-style\">X</style></head>"), null);
});

test("parseDesignId 取第一个", () => {
  const head = `<head><style data-weavepage-design="first">X</style><style data-weavepage-design="second">Y</style></head>`;
  assert.equal(parseDesignId(head), "first");
});

test("parseDesignId 有效 id", () => {
  const head = `<head><style data-weavepage-design="literary-scroll">X</style></head>`;
  assert.equal(parseDesignId(head), "literary-scroll");
});
```

- [ ] **Step 2: 跑测试**

Run: `pnpm tsx src/utils/designs.test.ts`
Expected: 13 个 test 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add src/utils/designs.test.ts
git -c user.name="WeavePage" -c user.email="dev@aiec.fun" commit -m "test(designs): applyDesignToShellHead / parseDesignId 单元测试(13 用例)"
```

---

## Task 4: 创建 `src/components/RibbonDesign.tsx`(按钮 + 面板 + 缩略图)

**Files:**
- Create: `src/components/RibbonDesign.tsx`

**Interfaces:**
- `interface RibbonDesignProps { currentDesignId: string | null; onApply: (id: string | null) => void; disabled: boolean }`
- 渲染:`<div className="ribbon-design-wrap">` + `<RibbonButton icon="🎨" label="设计" onClick={togglePanel} active={open} disabled={disabled} title={disabled ? "请切换到编辑视图" : "文档设计"} />` + `{open && <DesignPickerPanel currentDesignId onApply onClose />}`
- `DesignPickerPanel` 用 `createPortal` 挂到 `document.body`,`position: fixed` 定位到按钮下方(用 `getBoundingClientRect()` 算位置)
- `DesignThumb` 渲染 16:9 卡片,内部 `<style>` 注入 design.css,迷你样例 HTML:`<h1>一级标题</h1><h2>二级标题</h2><p>正文示例,展示<strong>粗体</strong>与<a href="#">链接</a>。</p><blockquote>引用块示例</blockquote><pre><code>code sample</code></pre><table>...</table>`

- [ ] **Step 1: 写缩略图卡组件**

Create `src/components/RibbonDesign.tsx`,先只放缩略图卡(后续 Step 2 拼面板):

```tsx
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RibbonButton } from "./controls";
import { DESIGNS, DEFAULT_DESIGN_ID, getDesignById, type DesignMeta } from "../utils/designs";

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

interface DesignThumbProps {
  design: DesignMeta | null;  // null = "默认"卡
  selected: boolean;
  onClick: () => void;
}

function DesignThumb({ design, selected, onClick }: DesignThumbProps) {
  // 缩略图内部样式:用 design.css(默认卡不注入)
  const innerStyle = design
    ? <style dangerouslySetInnerHTML={{ __html: design.css }} />
    : null;
  return (
    <button
      type="button"
      className={`design-thumb-card ${selected ? "is-selected" : ""}`}
      onClick={onClick}
      title={design ? design.name : "默认(无设计样式)"}
    >
      <div className="design-thumb-frame">
        {innerStyle}
        <div
          className="design-thumb-body"
          style={{ fontFamily: design?.fontFamily ?? "serif" }}
          dangerouslySetInnerHTML={{ __html: SAMPLE_HTML }}
        />
      </div>
      <span className="design-thumb-name">{design ? design.name : "默认"}</span>
    </button>
  );
}
```

- [ ] **Step 2: 加 DesignPickerPanel(用 Portal 浮层)**

Append to `src/components/RibbonDesign.tsx`:

```tsx
interface DesignPickerPanelProps {
  currentDesignId: string | null;
  onApply: (id: string | null) => void;
  anchorRect: DOMRect;
  onClose: () => void;
}

function DesignPickerPanel({
  currentDesignId,
  onApply,
  anchorRect,
  onClose,
}: DesignPickerPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // 点击 panel 外关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      // 排除按钮本身(按钮触发 toggle)
      const target = e.target as HTMLElement;
      if (target.closest(".ribbon-design-btn")) return;
      onClose();
    };
    // 用 mousedown 比 click 早触发,避免误触
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // 定位:按钮正下方,左右不超视窗
  const left = Math.max(
    8,
    Math.min(window.innerWidth - 520, anchorRect.left)
  );
  const top = anchorRect.bottom + 4;

  return createPortal(
    <div
      ref={panelRef}
      className="ribbon-design-picker"
      style={{ position: "fixed", left, top, zIndex: 1000 }}
      role="dialog"
      aria-label="文档设计"
    >
      <div className="ribbon-design-picker-header">文档设计</div>
      <div className="ribbon-design-picker-grid">
        {/* 第一格:默认 */}
        <DesignThumb
          design={null}
          selected={currentDesignId === DEFAULT_DESIGN_ID}
          onClick={() => { onApply(null); onClose(); }}
        />
        {/* 8 个预设 */}
        {DESIGNS.map((d) => (
          <DesignThumb
            key={d.id}
            design={d}
            selected={currentDesignId === d.id}
            onClick={() => { onApply(d.id); onClose(); }}
          />
        ))}
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 3: 加 RibbonDesign 包装(按钮 + 面板开关)**

Append to `src/components/RibbonDesign.tsx`:

```tsx
interface RibbonDesignProps {
  currentDesignId: string | null;
  onApply: (id: string | null) => void;
  disabled: boolean;
}

export function RibbonDesign({ currentDesignId, onApply, disabled }: RibbonDesignProps) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const togglePanel = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
    } else {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) setAnchorRect(rect);
      setOpen(true);
    }
  };

  return (
    <div className="ribbon-group ribbon-design-wrap">
      <button
        ref={btnRef}
        className={`ribbon-btn ribbon-design-btn ${open ? "is-active" : ""}`}
        onClick={togglePanel}
        disabled={disabled}
        title={disabled ? "请切换到编辑视图" : "文档设计(8 套预设 + 默认)"}
      >
        <span className="btn-icon">🎨</span>
        <span>设计</span>
      </button>
      {open && anchorRect && (
        <DesignPickerPanel
          currentDesignId={currentDesignId}
          onApply={onApply}
          anchorRect={anchorRect}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: 跑 TS 编译确认无错**

Run: `pnpm exec tsc --noEmit`
Expected: 无 TS 错误

- [ ] **Step 5: Commit**

```bash
git add src/components/RibbonDesign.tsx
git -c user.name="WeavePage" -c user.email="dev@aiec.fun" commit -m "feat(ribbon): 新增 RibbonDesign 组件(Ribbon 按钮 + 16:9 缩略图面板 + 9 张缩略图卡)"
```

---

## Task 5: 在 App.css 加 `.ribbon-design-picker` / `.design-thumb-card` 样式

**Files:**
- Modify: `src/App.css`(末尾追加,找到 `/* ============ TOC 目录 ============ */` 之前的最后一行)

**Interfaces:**
- 无新增,纯 CSS

- [ ] **Step 1: 追加设计面板 CSS**

Append to `src/App.css`(在文件末尾,`/* ============ TOC 目录 ============ */` 之前 — 但如果它已经是文件末尾,直接 append 在最末):

```css
/* ============ 设计子菜单 ============ */
/* 缩略图卡:16:9 比例,圆角,选中态高亮 */
.design-thumb-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 4px;
  border: 2px solid transparent;
  border-radius: 6px;
  background: var(--surface);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: all 0.12s ease;
  width: 156px;
}
.design-thumb-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.design-thumb-card.is-selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
/* 缩略图 frame:16:9 容器,overflow:hidden 避免迷你样例溢出 */
.design-thumb-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 4px;
  background: #ffffff;
  border: 1px solid var(--border);
}
.design-thumb-body {
  /* 缩略图内样例 HTML 的样式约束:缩小字体避免溢出 */
  font-size: 6px;
  line-height: 1.4;
  padding: 8px 10px;
  transform-origin: top left;
}
.design-thumb-body h1 { font-size: 10px; margin: 2px 0; }
.design-thumb-body h2 { font-size: 9px; margin: 2px 0; }
.design-thumb-body p { margin: 2px 0; }
.design-thumb-body blockquote { margin: 2px 0; padding: 2px 6px; }
.design-thumb-body pre { margin: 2px 0; padding: 3px 4px; font-size: 5px; }
.design-thumb-body table { font-size: 5px; }
.design-thumb-body td, .design-thumb-body th { padding: 1px 3px; }
.design-thumb-body ul { padding-left: 12px; margin: 1px 0; }
.design-thumb-body hr { margin: 2px 0; }
.design-thumb-name {
  font-size: 12px;
  color: var(--text);
  text-align: center;
  padding: 2px 0;
  user-select: none;
}

/* 面板容器 */
.ribbon-design-picker {
  width: 520px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  padding: 8px;
  user-select: none;
}
.ribbon-design-picker-header {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  padding: 6px 8px 10px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
}
.ribbon-design-picker-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  justify-items: center;
}
```

- [ ] **Step 2: 跑 build 确认无错**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build`
Expected: 编译通过(可能有 warning,无 error)

- [ ] **Step 3: 跑 dev server 视觉确认(可选,后面 Task 8 走真机)**

Run: `pnpm dev` (启动 vite dev server)
Expected: 打开 http://localhost:1420 — 暂未挂载,需 Task 6 完成后才有按钮

- [ ] **Step 4: Commit**

```bash
git add src/App.css
git -c user.name="WeavePage" -c user.email="dev@aiec.fun" commit -m "feat(css): 设计子菜单面板 + 缩略图卡样式(16:9 + 选中态高亮)"
```

---

## Task 6: App.tsx 加 `currentDesignId` state + `applyDesign` / `parseDesignId` 函数

**Files:**
- Modify: `src/App.tsx`(多处)
- Test: `src/utils/designs.test.ts`(已覆盖;App.tsx 的 applyDesign 是 useState + 函数组合,纯逻辑由 applyDesignToShellHead 覆盖)

**Interfaces:**
- `const [currentDesignId, setCurrentDesignId] = useState<string | null>(null);`
- `function applyDesign(id: string | null): void` — 读 `shell`,用 `applyDesignToShellHead` 算新 head → `setShell({...shell, head: newHead})` + `setCurrentDesignId(id)`;`shell === null` 时用空 head 兜底再 setShell
- `parseDesignId` 在 `applyDoc` 末尾读 `doc.shell?.head` 同步 `setCurrentDesignId`
- 新 props 透传给 `<Ribbon>`:`currentDesignId` / `onApplyDesign` / `designDisabled`

- [ ] **Step 1: 加 import + state**

Edit `src/App.tsx` 在 import 区域(约 30-66 行)追加:

```ts
import {
  DESIGNS,
  getDesignById,
  applyDesignToShellHead,
  parseDesignId,
} from "./utils/designs";
```

Edit `src/App.tsx` 在 `const [docHtml, setDocHtml] = useState<string>("<p></p>");` 之后追加:

```ts
// v2.1.0:文档设计 — 纯内存 state,不持久化到 localStorage / DocState
// 设计 CSS 注入 shell.head(由 buildFullDoc 自动包含在保存的 HTML)
const [currentDesignId, setCurrentDesignId] = useState<string | null>(null);
```

- [ ] **Step 2: 加 `applyDesign` 函数**

Edit `src/App.tsx` 在 `onToggleToc` 之后(约 340 行)追加:

```ts
// v2.1.0:applyDesign — 注入/清除设计 CSS 到 shell.head
// - id 为 null:移除所有 [data-weavepage-design] style
// - id 非 null:在 <style id="wp-toc-style"> 之后插入新 style
// shell 变化 → useMemo [activeDoc.id, shell] 重算 → iframe.srcDoc 重渲 → WYSIWYG 立即生效
const applyDesign = useCallback(
  (id: string | null) => {
    const design = getDesignById(id);
    const css = design?.css ?? null;
    const baseShell: DocShell = shell ?? {
      doctype: "<!DOCTYPE html>",
      head: "",
      headCss: "",
      bodyAttrs: "",
      scripts: "",
      styles: "",
      baseHref: "",
    };
    const newHead = applyDesignToShellHead(baseShell.head, id, css);
    const newShell = { ...baseShell, head: newHead };
    setShell(newShell);
    setCurrentDesignId(id);
    setIsModified(true);
    updateActiveDoc({ shell: newShell });
  },
  [shell, updateActiveDoc]
);
```

- [ ] **Step 3: 在 `applyDoc` 末尾解析当前设计 id**

Edit `src/App.tsx` 的 `applyDoc` 函数,在 `} else { setMode("edit"); ... }` 块前(约 408 行)插入:

```ts
} else if (doc.kind === "html") {
  // ... 现有逻辑 ...
  // v2.1.0:打开文件时解析当前设计 id(只读,不动 shell.head)
  // 用 doc.shell.head 而非最终 shell.head — 避免被 applyDoc 中的 toc 刷新覆盖
  const initialHead = doc.shell?.head ?? "";
  setCurrentDesignId(parseDesignId(initialHead));
} else {
```

实际上 applyDoc 已有 `if (doc.kind === "html") { ... } else { ... }` 结构。修正确切位置:在 `setShell(doc.shell ?? null);` 之后(约 400 行)追加:

```ts
// v2.1.0:解析当前设计 id,用于面板高亮
setCurrentDesignId(parseDesignId(doc.shell?.head ?? ""));
```

- [ ] **Step 4: 跑 TS 编译确认无错**

Run: `pnpm exec tsc --noEmit`
Expected: 无 TS 错误

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git -c user.name="WeavePage" -c user.email="dev@aiec.fun" commit -m "feat(app): applyDesign / parseDesignId + currentDesignId state(纯内存)"
```

---

## Task 7: 透传 props + 接入 `<RibbonDesign>` 到 Ribbon edit tab

**Files:**
- Modify: `src/components/Ribbon.tsx`(加 3 个 props,透传给 RibbonHome)
- Modify: `src/components/RibbonHome.tsx`(加 3 个 props,在最末 ribbon-group 渲染 `<RibbonDesign>`)
- Modify: `src/App.tsx`(在 `<Ribbon>` JSX 传 3 个 props)

**Interfaces:**
- `RibbonProps` 加:`currentDesignId: string | null; onApplyDesign: (id: string | null) => void; designDisabled: boolean`
- `RibbonHomeProps` 加同上
- `<RibbonDesign currentDesignId={...} onApply={onApplyDesign} disabled={designDisabled} />` 渲染在 `<RibbonHome>` JSX 末尾

- [ ] **Step 1: 改 `src/components/Ribbon.tsx`**

Edit `src/components/Ribbon.tsx`,在 `RibbonProps` interface 末尾追加:

```ts
  tocEnabled: boolean;
  onToggleToc: () => void;
  tocDisabled: boolean;
  // v2.1.0:设计子菜单
  currentDesignId: string | null;
  onApplyDesign: (id: string | null) => void;
  designDisabled: boolean;
}
```

修改 `RibbonHome` JSX 调用,在 `<RibbonHome ... />` 的 props 末尾追加:

```tsx
<RibbonHome
  iframeRef={props.iframeRef}
  onLink={props.onLink}
  recentTextColors={props.recentTextColors}
  recentHighlightColors={props.recentHighlightColors}
  onColorUsed={props.onColorUsed}
  onSpacingChange={props.onSpacingChange}
  onPageBgChange={props.onPageBgChange}
  currentDesignId={props.currentDesignId}
  onApplyDesign={props.onApplyDesign}
  designDisabled={props.designDisabled}
/>
```

- [ ] **Step 2: 改 `src/components/RibbonHome.tsx`**

Edit `src/components/RibbonHome.tsx`,在 `RibbonHomeProps` interface 末尾追加:

```ts
  onPageBgChange: (hex: string) => void;
  // v2.1.0:设计子菜单
  currentDesignId: string | null;
  onApplyDesign: (id: string | null) => void;
  designDisabled: boolean;
}
```

修改函数解构:

```ts
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

在 import 区追加:

```ts
import { RibbonDesign } from "./RibbonDesign";
```

找到 `<RibbonHome>` JSX return 的最末一个 `</div>` 前(在 `onPageBgChange` 相关按钮之后),追加:

```tsx
<RibbonDesign
  currentDesignId={currentDesignId}
  onApply={onApplyDesign}
  disabled={designDisabled}
/>
```

- [ ] **Step 3: 改 `src/App.tsx` 的 `<Ribbon>` 调用**

Edit `src/App.tsx` 的 `<Ribbon>` JSX(约 1339-1354 行),在 props 末尾追加:

```tsx
<Ribbon
  iframeRef={iframeRef}
  disabled={mode !== "edit" || isTextDoc}
  activeTab={activeTab}
  collapsed={ribbonCollapsed}
  onInsertImage={insertImage}
  onLink={setLink}
  recentTextColors={recentColors.text}
  recentHighlightColors={recentColors.highlight}
  onColorUsed={onColorUsed}
  onSpacingChange={handleSpacingChange}
  onPageBgChange={handlePageBg}
  tocEnabled={tocEnabled}
  onToggleToc={onToggleToc}
  tocDisabled={mode !== "edit" || isTextDoc}
  currentDesignId={currentDesignId}
  onApplyDesign={applyDesign}
  designDisabled={mode !== "edit" || isTextDoc}
/>
```

- [ ] **Step 4: 跑 build 确认无错**

Run: `pnpm exec tsc --noEmit && pnpm exec vite build`
Expected: 编译通过

- [ ] **Step 5: Commit**

```bash
git add src/components/Ribbon.tsx src/components/RibbonHome.tsx src/App.tsx
git -c user.name="WeavePage" -c user.email="dev@aiec.fun" commit -m "feat(ribbon): 透传 currentDesignId/onApplyDesign/designDisabled + 接入 RibbonDesign 到 edit tab 末位"
```

---

## Task 8: 真机验证 + 升级 v2.0.6 → v2.1.0 + 上传 aiec.fun

**Files:**
- Modify: `package.json`(version bump)
- Modify: `src-tauri/tauri.conf.json`(若有 version 字段,同步)
- New release artifacts(由 `pnpm release:both` 生成)

**Test cases(手测 13 项,与 spec §11 对应):**

- [ ] **Step 1: 跑现有所有测试**

Run: `pnpm tsx src/utils/tocGen.test.ts && pnpm tsx src/utils/designs.test.ts && pnpm tsx src/utils/paragraphSpacing.test.ts && pnpm tsx src/utils/formatHtml.test.ts && pnpm tsx src/utils/defaultStyle.test.ts`
Expected: 所有 test PASS

- [ ] **Step 2: 升级版本号**

Edit `package.json` 第 4 行:

```json
  "version": "2.1.0",
```

Edit `src-tauri/tauri.conf.json`(若 version 字段独立):

```json
  "version": "2.1.0",
```

如 `src-tauri/tauri.conf.update.json` 也存在,同步到 2.1.0。

- [ ] **Step 3: 跑 Tauri 构建(双渠道)**

Run: `pnpm release:both`
Expected: 
- `release/WeavePage-2.1.0_x64-setup.exe`
- `release/update/WeavePage-2.1.0_x64-setup.exe`(轻量渠道)

- [ ] **Step 4: 真机验证(sandbox-verify weavepage)**

按用户偏好:不上传前不 commit。先真机跑 installer。

Run: 读 `memory/reference_sandbox_verify_weavepage.md` 拿 .wsb + 脚本路径,执行沙箱装机验证(13 项手测):
1. 打开空白文档 → 点「设计」 → 面板弹出,9 张缩略图依次显示 → 点「默认」高亮 → 编辑视图 = 浏览器默认
2. 点「经典学术」 → 编辑视图立即变白底衬线严谨风 → 文档 `<head>` 出现 `<style data-weavepage-design="classic-academic">` → 保存 → 关闭 → 重开文件 → 还是这个样式
3. 点「现代简约」 → 编辑视图换风格 → 旧的 design style 被替换(不是叠加)
4. 点「科技感」 → 立刻深色 + 衬线 → 表格/code 都有相应调整
5. 在「科技感」状态下点「默认」 → 所有 design style 移除,回到浏览器默认
6. 打开外部 HTML 文件(包含 design style)→ 自动识别 → 面板对应卡高亮
7. 打开外部 HTML 文件(无 design style)→ 「默认」卡高亮
8. 打开旧 HTML,design style id 已废弃 → 「默认」卡高亮,不报错
9. 文本 doc → Ribbon 设计按钮 disabled,tooltip 提示正确
10. source 模式 → Ribbon 设计按钮 disabled
11. 缩略图悬停 → 轻微 scale/阴影
12. 缩略图选中态 → 外环高亮
13. 多次切换不同设计 → docHtml 中始终只有 1 个 `[data-weavepage-design]` style(没有叠加)

- [ ] **Step 5: 全部通过后 commit 所有改动 + 写 release notes**

```bash
git add package.json src-tauri/tauri.conf.json
git -c user.name="WeavePage" -c user.email="dev@aiec.fun" commit -m "chore(release): v2.1.0 — 文档设计子菜单(8 套预设 + 默认 + WYSIWYG 持久化)"
```

按项目惯例(参考 `project_weavepage_release_flow.md`)写 release notes:
- 标题:v2.1.0 — 文档设计
- 内容:新增 8 套预设文档样式(经典学术 / 现代简约 / 文艺书卷 / 科技感 / 商务正式 / 柔雅 / 薄荷清新 / 复古印刷)+ 默认按钮;Ribbon 新增「设计」按钮组;设计样式持久化到 HTML 文件本身;目录样式跟随主风格

- [ ] **Step 6: 上传 aiec.fun**

Run: 参考 `project_weavepage_release_flow.md` + `reference_aiec_ops_paths.md` 跑上传脚本(用 `release/update/` 轻量渠道 + `release/` 全量):
- SFTP 上传 `WeavePage-2.1.0_x64-setup.exe` 到 `fun.aiec.weavepage` 对应路径
- 更新 `version.json`(`update_url` + `url` + `notes` + `version` = `2.1.0`)

- [ ] **Step 7: 写 handoff 接力下一阶段**

按 CLAUDE.md §8,新开会话接力下一阶段(spec §12 后续 TODO,如源代码视图同步、自定义微调)时:
- 写 `handoff-v2.1.0-final.md` 到项目根
- 写 `prompt-v2.1.0-next.md`(< 30 行)

---

## Self-Review

**1. Spec coverage:**

| spec § | 任务 |
|---|---|
| §1 目标 9 项 | Task 1-8 全覆盖 |
| §2 设计决定 12 项(Q1-Q12) | Q1:Task 7(edit tab 末位);Q2-Q3:Task 2;Q4:Task 2(每套 CSS 含 wp-toc-* 覆写);Q5:Task 4(方案 β,因 α 需要 html2canvas 依赖);Q6:Task 2(锚点 wp-toc-style);Q7:Task 2 + Task 6(只清 data-weavepage-design);Q8:Task 6(不持久化到 localStorage);Q9:Task 6(打开时只读不写);Q10:已存在(不需新代码);Q11:spec 标 TODO,本计划不实现;Q12:Task 6(无效 id 返 null) |
| §3 架构 | Task 2/4/6 对应 designs.ts / RibbonDesign / App.tsx |
| §4 数据模型 | Task 2(DesignMeta interface) |
| §5 核心模块 | Task 1 / 2 / 3 / 4 / 6 / 7 对应 §5.1-§5.5 |
| §6 8 套 CSS | Task 2(从 spec 复制) |
| §7 UI 形态 | Task 4(组件结构)+ Task 5(CSS) |
| §8 tocGen 协同 | Task 1(data-weavepage-toc 属性) |
| §9 错误处理 | Task 2(parseDesignId 找不到返 null)+ Task 6(applyDesign 兜底空 head) |
| §10 数据流 | Task 6 覆盖 §10.1-§10.4;§10.5 标 TODO |
| §11 测试 15 项 | Task 3(13 单元测试)+ Task 8(13 手测 = 实质 1+2+3+4+5+6+7+8+9+10+11+12+13+14+15,15 项) |
| §12 不在范围 | 显式不实现 |
| §13 发布路径 | Task 8 |
| §14 本阶段交付 | 上一阶段已完成,本计划为下一阶段实施 |

**2. Placeholder scan:** Task 2 Step 2 的 CSS 模板用了 `/* 来自 spec §6.X */ ""` 占位 + 注释"读 spec 文件复制"。这是合规的 placeholder(注释明确指出从哪个 spec 哪节复制),但**实现时必须替换为实际 CSS**,不能留 `""`。

**3. Type consistency:** `getDesignById` / `applyDesignToShellHead` / `parseDesignId` 在 Task 2 / 3 定义,Task 6 引用,签名一致。`RibbonDesignProps` / `RibbonProps` / `RibbonHomeProps` 三个 props 同步新增 3 个字段,Task 7 三处对齐。

**4. 一致性确认:**
- `parseDesignId` 同时被 Task 3(测试)和 Task 6(applyDoc)引用,返回类型 `string | null` 一致
- `applyDesignToShellHead(head, id, css)` 三参数,Task 3 测试 + Task 6 调用,签名一致
- 缩略图方案的偏离(β 而非 α)在 spec §7.5 已被作者预批,符合"explicit acceptable trade-off"

**结论:** plan 完整、无遗漏、无类型不一致。Task 2 Step 2 的 CSS 复制是工作量最大的一步(8 × ~30 行 = 240 行),但不属于代码逻辑,直接 spec 复制即可。
