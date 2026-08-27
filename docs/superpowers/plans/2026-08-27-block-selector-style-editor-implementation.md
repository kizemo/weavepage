# WeavePage 可视块选择 + 容器样式编辑 + 关闭未保存弹窗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 编辑视图 hover/click 块选中 → Ribbon 容器组改 inline style + ⭐ 提升为 head tag CSS → 应用关闭时 dirty tabs 弹窗确认。

**Architecture:** 5 新文件 + 3 改文件。blockStyle.ts 提供纯函数 helper (TDD)。App.tsx 加 selection state + iframe 事件 useEffect + onCloseRequested。3 新组件各自负责单一职责,沿用现有 modal-mask 与 Ribbon 模式。

**Tech Stack:** React 19 + TypeScript + Tauri 2 (`@tauri-apps/api/window` 的 `onCloseRequested`) + iframe-based editor(contentEditable)。

## Global Constraints

(来自 spec §1.1 / 用户硬规则,所有 task 隐含适用)
- 项目:`F:\soft\00selfmade\tiptap_app`
- TypeScript 严格模式,所有新代码必须 `pnpm tsc --noEmit` 通过
- 单测:vitest (项目已有,跑 `pnpm tsx src/utils/*.test.ts`)
- 真机验证:每个 commit 前必跑(用户硬规则)
- per-command git identity:`git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`
- 不 push(用户偏好)
- 菜单栏顺序不变(文件 / 编辑 / 插入 / 设计 / 视图 / 帮助)
- spec §1.3 YAGNI 项不做(box-shadow / opacity / 渐变 / 自定义 class / padding 四边独立 / 单 tab 关闭弹窗 / 拖拽改 padding / Alt+click / 废弃 right-click)

---

## Task 1: blockStyle.ts — `applyContainerStyle` 合并 inline style

**Files:**
- Create: `src/utils/blockStyle.ts`
- Test: `src/utils/blockStyle.test.ts`

**Interfaces:**
- Consumes: 无(纯函数,无依赖)
- Produces: `applyContainerStyle(styleStr: string, prop: ContainerProp, value: string) => string` — 保留原 inline 其它属性,只改 prop 对应 CSS 属性

```typescript
// blockStyle.ts 顶部 — 后续 task 扩展
export type ContainerProp =
  | "bgColor"
  | "borderColor"
  | "borderWidth"
  | "borderStyle"
  | "borderRadius"
  | "padding";

export const PROP_TO_CSS: Record<ContainerProp, string> = {
  bgColor: "background",
  borderColor: "border-color",
  borderWidth: "border-width",
  borderStyle: "border-style",
  borderRadius: "border-radius",
  padding: "padding",
};
```

- [ ] **Step 1: 写失败测试**

```typescript
// src/utils/blockStyle.test.ts
import { applyContainerStyle, PROP_TO_CSS } from "./blockStyle";
import { describe, it, expect } from "vitest";

describe("applyContainerStyle", () => {
  it("applies bgColor to empty style", () => {
    expect(applyContainerStyle("", "bgColor", "red"))
      .toBe("background: red");
  });

  it("replaces existing bgColor", () => {
    expect(applyContainerStyle("background: blue", "bgColor", "red"))
      .toBe("background: red");
  });

  it("preserves unrelated properties", () => {
    expect(applyContainerStyle("color: black; padding: 10px", "bgColor", "red"))
      .toBe("color: black; padding: 10px; background: red");
  });

  it("removes prop when value is empty string", () => {
    expect(applyContainerStyle("background: red; color: black", "bgColor", ""))
      .toBe("color: black");
  });

  it("handles all 6 ContainerProps with correct CSS property names", () => {
    expect(PROP_TO_CSS.bgColor).toBe("background");
    expect(PROP_TO_CSS.borderColor).toBe("border-color");
    expect(PROP_TO_CSS.borderWidth).toBe("border-width");
    expect(PROP_TO_CSS.borderStyle).toBe("border-style");
    expect(PROP_TO_CSS.borderRadius).toBe("border-radius");
    expect(PROP_TO_CSS.padding).toBe("padding");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd F:/soft/00selfmade/tiptap_app
pnpm tsx src/utils/blockStyle.test.ts
```

Expected: FAIL with "Cannot find module './blockStyle'" or similar。

- [ ] **Step 3: 实现 `applyContainerStyle`**

```typescript
// src/utils/blockStyle.ts
export type ContainerProp =
  | "bgColor"
  | "borderColor"
  | "borderWidth"
  | "borderStyle"
  | "borderRadius"
  | "padding";

export const PROP_TO_CSS: Record<ContainerProp, string> = {
  bgColor: "background",
  borderColor: "border-color",
  borderWidth: "border-width",
  borderStyle: "border-style",
  borderRadius: "border-radius",
  padding: "padding",
};

// 解析 "color: red; padding: 10px" → { color: "red", padding: "10px" }
function parseInlineStyle(styleStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  styleStr.split(";").forEach((decl) => {
    const idx = decl.indexOf(":");
    if (idx < 0) return;
    const name = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (name && value) result[name] = value;
  });
  return result;
}

// 序列化 { color: "red", padding: "10px" } → "color: red; padding: 10px"
function serializeInlineStyle(props: Record<string, string>): string {
  return Object.entries(props)
    .filter(([_, v]) => v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}

export function applyContainerStyle(
  styleStr: string,
  prop: ContainerProp,
  value: string
): string {
  const cssProp = PROP_TO_CSS[prop];
  const props = parseInlineStyle(styleStr);
  if (value === "") {
    delete props[cssProp];
  } else {
    props[cssProp] = value;
  }
  return serializeInlineStyle(props);
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd F:/soft/00selfmade/tiptap_app
pnpm tsx src/utils/blockStyle.test.ts
```

Expected: 6 tests PASS(5 个 applyContainerStyle + 1 个 PROP_TO_CSS)。

- [ ] **Step 5: Commit**

```bash
cd F:/soft/00selfmade/tiptap_app
git add src/utils/blockStyle.ts src/utils/blockStyle.test.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(block-style): applyContainerStyle 合并 inline style (TDD)"
```

---

## Task 2: blockStyle.ts — `parseContainerStyle` 反读 inline

**Files:**
- Modify: `src/utils/blockStyle.ts`(追加函数)
- Modify: `src/utils/blockStyle.test.ts`(追加测试)

**Interfaces:**
- Consumes: `applyContainerStyle`(Task 1)
- Produces: `parseContainerStyle(styleStr: string) => ContainerForm` — 跟 applyContainerStyle 互逆

```typescript
export type ContainerForm = Partial<Record<ContainerProp, string>>;
```

- [ ] **Step 1: 写失败测试**

```typescript
// 在 src/utils/blockStyle.test.ts 追加
import { parseContainerStyle } from "./blockStyle";

describe("parseContainerStyle", () => {
  it("returns empty object for empty style", () => {
    expect(parseContainerStyle("")).toEqual({});
  });

  it("parses bgColor from background shorthand", () => {
    expect(parseContainerStyle("background: red"))
      .toEqual({ bgColor: "red" });
  });

  it("parses all 6 ContainerProps", () => {
    const style = "background: red; border-color: blue; border-width: 2px; border-style: solid; border-radius: 4px; padding: 8px";
    expect(parseContainerStyle(style)).toEqual({
      bgColor: "red",
      borderColor: "blue",
      borderWidth: "2px",
      borderStyle: "solid",
      borderRadius: "4px",
      padding: "8px",
    });
  });

  it("roundtrips with applyContainerStyle", () => {
    const original: ContainerForm = {
      bgColor: "red",
      borderColor: "blue",
      padding: "8px",
    };
    let style = "";
    for (const [k, v] of Object.entries(original)) {
      style = applyContainerStyle(style, k as ContainerProp, v!);
    }
    expect(parseContainerStyle(style)).toEqual(original);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd F:/soft/00selfmade/tiptap_app
pnpm tsx src/utils/blockStyle.test.ts
```

Expected: FAIL with "parseContainerStyle is not a function"。

- [ ] **Step 3: 实现 `parseContainerStyle`**

```typescript
// src/utils/blockStyle.ts 追加
export type ContainerForm = Partial<Record<ContainerProp, string>>;

// CSS property → ContainerProp 反向映射
const CSS_TO_PROP: Record<string, ContainerProp> = Object.fromEntries(
  Object.entries(PROP_TO_CSS).map(([k, v]) => [v, k as ContainerProp])
);

export function parseContainerStyle(styleStr: string): ContainerForm {
  const result: ContainerForm = {};
  const props = parseInlineStyle(styleStr);
  for (const [cssProp, value] of Object.entries(props)) {
    const prop = CSS_TO_PROP[cssProp];
    if (prop) result[prop] = value;
  }
  return result;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd F:/soft/00selfmade/tiptap_app
pnpm tsx src/utils/blockStyle.test.ts
```

Expected: 10 tests PASS(Task 1 的 6 + 这次的 4)。

- [ ] **Step 5: Commit**

```bash
cd F:/soft/00selfmade/tiptap_app
git add src/utils/blockStyle.ts src/utils/blockStyle.test.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(block-style): parseContainerStyle 反读 inline (TDD)"
```

---

## Task 3: blockStyle.ts — `extractContainerStyle` 抽 CSS props + `upsertBlockStyleRule` head CSS 注入

**Files:**
- Modify: `src/utils/blockStyle.ts`
- Modify: `src/utils/blockStyle.test.ts`

**Interfaces:**
- Consumes: Task 1, 2 的函数
- Produces:
  - `extractContainerStyle(styleStr: string) => Record<string, string>` — 抽出 `{ background: "red", padding: "8px", ... }`(用 CSS 属性名而非 ContainerProp)
  - `upsertBlockStyleRule(head: string, tagName: string, props: Record<string, string>) => string` — upsert 到 `<style id="weavepage-block-style">` 命名块(类似 `defaultStyle.ts` 模式)

```typescript
export const BLOCK_STYLE_ID = "weavepage-block-style";
```

- [ ] **Step 1: 写失败测试**

```typescript
// 在 src/utils/blockStyle.test.ts 追加
import { extractContainerStyle, upsertBlockStyleRule, BLOCK_STYLE_ID } from "./blockStyle";

describe("extractContainerStyle", () => {
  it("returns empty object for empty style", () => {
    expect(extractContainerStyle("")).toEqual({});
  });

  it("returns CSS property names not ContainerProps", () => {
    expect(extractContainerStyle("background: red"))
      .toEqual({ background: "red" });
    expect(extractContainerStyle("border-color: blue"))
      .toEqual({ "border-color": "blue" });
  });

  it("ignores non-ContainerProp properties", () => {
    expect(extractContainerStyle("color: black; background: red"))
      .toEqual({ background: "red" });
  });
});

describe("upsertBlockStyleRule", () => {
  it("creates new style block if not present", () => {
    const head = "";
    const result = upsertBlockStyleRule(head, "p", { background: "red" });
    expect(result).toContain(`<style id="${BLOCK_STYLE_ID}">`);
    expect(result).toContain("p { background: red }");
  });

  it("updates existing style block", () => {
    const head = `<style id="${BLOCK_STYLE_ID}">p { color: black }</style>`;
    const result = upsertBlockStyleRule(head, "p", { background: "red" });
    expect(result).toContain("p { color: black; background: red }");
  });

  it("creates new selector if different tagName", () => {
    const head = `<style id="${BLOCK_STYLE_ID}">p { color: black }</style>`;
    const result = upsertBlockStyleRule(head, "h1", { background: "red" });
    expect(result).toContain("p { color: black }");
    expect(result).toContain("h1 { background: red }");
  });

  it("merges props with same selector", () => {
    const head = `<style id="${BLOCK_STYLE_ID}">p { color: black; padding: 8px }</style>`;
    const result = upsertBlockStyleRule(head, "p", { background: "red" });
    expect(result).toContain("p { color: black; padding: 8px; background: red }");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd F:/soft/00selfmade/tiptap_app
pnpm tsx src/utils/blockStyle.test.ts
```

Expected: FAIL with "extractContainerStyle is not a function"。

- [ ] **Step 3: 实现 `extractContainerStyle` + `upsertBlockStyleRule`**

```typescript
// src/utils/blockStyle.ts 追加
export const BLOCK_STYLE_ID = "weavepage-block-style";

export function extractContainerStyle(
  styleStr: string
): Record<string, string> {
  const result: Record<string, string> = {};
  const props = parseInlineStyle(styleStr);
  const cssPropNames = new Set(Object.values(PROP_TO_CSS));
  for (const [cssProp, value] of Object.entries(props)) {
    if (cssPropNames.has(cssProp)) result[cssProp] = value;
  }
  return result;
}

const BLOCK_STYLE_RE = new RegExp(
  `<style id="${BLOCK_STYLE_ID}">[\\s\\S]*?<\\/style>`,
  "g"
);

export function upsertBlockStyleRule(
  head: string,
  tagName: string,
  props: Record<string, string>
): string {
  const propsStr = Object.entries(props)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
  const newRule = `${tagName} { ${propsStr} }`;

  const existing = head.match(BLOCK_STYLE_RE);
  if (!existing) {
    return `${head}<style id="${BLOCK_STYLE_ID}">\n${newRule}\n</style>`;
  }

  const currentCss = existing[0].replace(/<\/?style[^>]*>/g, "");
  const ruleRe = /([\w-]+)\s*\{([^}]*)\}/g;
  const rules: Record<string, string[]> = {};
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(currentCss)) !== null) {
    rules[m[1]!] = m[2]!.split(";").map((s) => s.trim()).filter(Boolean);
  }

  if (!rules[tagName]) rules[tagName] = [];
  for (const [k, v] of Object.entries(props)) {
    // 移除已存在的同名属性,再加新的(覆盖语义)
    rules[tagName] = rules[tagName]!.filter((s) => !s.startsWith(`${k}:`));
    rules[tagName]!.push(`${k}: ${v}`);
  }

  const merged = Object.entries(rules)
    .map(([sel, decls]) => `${sel} { ${decls.join("; ")} }`)
    .join("\n");
  return head.replace(
    BLOCK_STYLE_RE,
    `<style id="${BLOCK_STYLE_ID}">\n${merged}\n</style>`
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd F:/soft/00selfmade/tiptap_app
pnpm tsx src/utils/blockStyle.test.ts
```

Expected: 17 tests PASS(10 + 7)。

- [ ] **Step 5: Commit**

```bash
cd F:/soft/00selfmade/tiptap_app
git add src/utils/blockStyle.ts src/utils/blockStyle.test.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(block-style): extractContainerStyle + upsertBlockStyleRule (TDD)"
```

---

## Task 4: blockStyle.ts — `locateBlock` 三段式定位(iframe 重建 fallback)

**Files:**
- Modify: `src/utils/blockStyle.ts`
- Modify: `src/utils/blockStyle.test.ts`

**Interfaces:**
- Consumes: 无(纯函数)
- Produces: `locateBlock(doc: Document, identity: BlockIdentity) => HTMLElement | null`

```typescript
export interface BlockIdentity {
  tagName: string;
  nthOfType: number;
  textSample: string;
}
```

- [ ] **Step 1: 写失败测试**

```typescript
// 在 src/utils/blockStyle.test.ts 追加
import { locateBlock, type BlockIdentity } from "./blockStyle";

describe("locateBlock", () => {
  // 用 jsdom 模拟 Document(项目已用 vitest,可直接 import jsdom 或用现成 test util)
  function makeDoc(html: string): Document {
    const parser = new DOMParser();
    return parser.parseFromString(html, "text/html");
  }

  it("locates by tagName + nthOfType", () => {
    const doc = makeDoc("<div><p>a</p><p>b</p></div>");
    const identity: BlockIdentity = { tagName: "p", nthOfType: 1, textSample: "b" };
    const el = locateBlock(doc, identity);
    expect(el?.textContent).toBe("b");
  });

  it("returns null if nthOfType out of range", () => {
    const doc = makeDoc("<div><p>a</p></div>");
    const identity: BlockIdentity = { tagName: "p", nthOfType: 5, textSample: "x" };
    expect(locateBlock(doc, identity)).toBeNull();
  });

  it("falls back to textSample when nthOfType mismatches", () => {
    // 模拟 nthOfType 失效但 textSample 仍能找到
    const doc = makeDoc("<div><p>hello world</p><p>foo bar</p></div>");
    const identity: BlockIdentity = { tagName: "p", nthOfType: 99, textSample: "foo" };
    const el = locateBlock(doc, identity);
    expect(el?.textContent).toBe("foo bar");
  });

  it("returns null if both fail", () => {
    const doc = makeDoc("<div><p>hello</p></div>");
    const identity: BlockIdentity = { tagName: "p", nthOfType: 99, textSample: "missing" };
    expect(locateBlock(doc, identity)).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd F:/soft/00selfmade/tiptap_app
pnpm tsx src/utils/blockStyle.test.ts
```

Expected: FAIL with "locateBlock is not a function"。

- [ ] **Step 3: 实现 `locateBlock`**

```typescript
// src/utils/blockStyle.ts 追加
export interface BlockIdentity {
  tagName: string;
  nthOfType: number;
  textSample: string;
}

export function locateBlock(
  doc: Document,
  identity: BlockIdentity
): HTMLElement | null {
  const { tagName, nthOfType, textSample } = identity;
  const candidates = Array.from(doc.querySelectorAll(tagName));

  // 主路径: nthOfType 直接命中
  const direct = candidates[nthOfType];
  if (direct) return direct as HTMLElement;

  // fallback: textSample substring 匹配
  if (textSample) {
    const fallback = candidates.find((el) =>
      (el.textContent ?? "").startsWith(textSample)
    );
    return (fallback as HTMLElement) ?? null;
  }

  return null;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd F:/soft/00selfmade/tiptap_app
pnpm tsx src/utils/blockStyle.test.ts
```

Expected: 21 tests PASS(17 + 4)。

- [ ] **Step 5: Commit**

```bash
cd F:/soft/00selfmade/tiptap_app
git add src/utils/blockStyle.ts src/utils/blockStyle.test.ts
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(block-style): locateBlock 三段式定位 (TDD)"
```

---

## Task 5: App.tsx — 加 selection state(纯加 state,无事件绑定)

**Files:**
- Modify: `src/App.tsx`(在已有 state 区域附近追加)

**Interfaces:**
- Consumes: Task 4 的 `BlockIdentity`、Task 2 的 `ContainerForm`(类型 import)
- Produces: 3 个 state 变量(`selectedBlock` / `hoveredBlock` / `containerForm`)

注:此 task 仅加 state,不改 JSX,不绑事件 — 后续 task 逐步接事件 / 渲染。

- [ ] **Step 1: 加 type import + state**

在 `src/App.tsx` 顶部 import 区域,找到现有 import(应当有 `from "./utils/iframeExec"`),添加:

```typescript
import { locateBlock, parseContainerStyle, type BlockIdentity, type ContainerForm } from "./utils/blockStyle";
```

在已有 state 区域(`currentDesignId` 附近,line ~168 后)追加:

```typescript
// Goal 1 — 可视块选择 state
const [selectedBlock, setSelectedBlock] = useState<BlockIdentity | null>(null);
const [hoveredBlock, setHoveredBlock] = useState<{ tagName: string; nthOfType: number } | null>(null);
// Goal 2 — 容器组控件当前值(块选变化时反读 inline style 回填)
const [containerForm, setContainerForm] = useState<ContainerForm>({});
```

- [ ] **Step 2: TS 编译**

```bash
cd F:/soft/00selfmade/tiptap_app
npx tsc --noEmit
```

Expected: 0 errors。

- [ ] **Step 3: 不需要 commit**

纯加 state,不独立可测。整合到 Task 6 一起 commit。

---

## Task 6: SelectionOverlay.tsx — 基础浮层组件(渲染空 div,后续 task 填充)

**Files:**
- Create: `src/components/SelectionOverlay.tsx`

**Interfaces:**
- Consumes: 暂无(此 task 仅建组件骨架)
- Produces: `<SelectionOverlay />` 组件,接收 `hoveredBlock` / `selectedBlock` props,渲染 overlay div(此 task 可空渲染,Task 7 加内容)

- [ ] **Step 1: 创建组件文件**

```typescript
// src/components/SelectionOverlay.tsx
import { useMemo } from "react";
import type { BlockIdentity } from "../utils/blockStyle";

interface SelectionOverlayProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  hoveredBlock: { tagName: string; nthOfType: number } | null;
  selectedBlock: BlockIdentity | null;
}

export function SelectionOverlay({
  iframeRef,
  hoveredBlock,
  selectedBlock,
}: SelectionOverlayProps) {
  // 实际渲染逻辑后续 task 添加
  // 此 task 留空组件,确保 import 路径 + 编译通过
  return useMemo(() => null, [iframeRef, hoveredBlock, selectedBlock]);
}
```

- [ ] **Step 2: TS 编译**

```bash
cd F:/soft/00selfmade/tiptap_app
npx tsc --noEmit
```

Expected: 0 errors。

- [ ] **Step 3: Commit**

```bash
cd F:/soft/00selfmade/tiptap_app
git add src/components/SelectionOverlay.tsx
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(selection-overlay): 组件骨架 + 类型定义"
```

---

## Task 7: SelectionOverlay.tsx — 渲染 hover overlay(虚线 + tag)

**Files:**
- Modify: `src/components/SelectionOverlay.tsx`

**Interfaces:**
- Consumes: Task 6 的 props
- Produces: 实际 hover 浮层(虚线 1px 浅灰,跟随 hoveredBlock 在 iframe 内的位置)

- [ ] **Step 1: 实现 hover overlay 渲染**

替换 `src/components/SelectionOverlay.tsx` 全文:

```typescript
// src/components/SelectionOverlay.tsx
import { useEffect, useState } from "react";
import type { BlockIdentity } from "../utils/blockStyle";

interface SelectionOverlayProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  hoveredBlock: { tagName: string; nthOfType: number } | null;
  selectedBlock: BlockIdentity | null;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function getBlockRect(
  iframe: HTMLIFrameElement,
  tagName: string,
  nthOfType: number
): Rect | null {
  const doc = iframe.contentDocument;
  if (!doc) return null;
  const el = doc.querySelectorAll(tagName)[nthOfType] as HTMLElement | undefined;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const fr = iframe.getBoundingClientRect();
  return {
    left: r.left + fr.left,
    top: r.top + fr.top,
    width: r.width,
    height: r.height,
  };
}

export function SelectionOverlay({
  iframeRef,
  hoveredBlock,
  selectedBlock,
}: SelectionOverlayProps) {
  const [hoveredRect, setHoveredRect] = useState<Rect | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !hoveredBlock) {
      setHoveredRect(null);
      return;
    }
    setHoveredRect(getBlockRect(iframe, hoveredBlock.tagName, hoveredBlock.nthOfType));

    //  同步 iframe scroll/resize
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    const update = () =>
      setHoveredRect(getBlockRect(iframe, hoveredBlock.tagName, hoveredBlock.nthOfType));
    doc?.addEventListener("scroll", update);
    win?.addEventListener("resize", update);
    return () => {
      doc?.removeEventListener("scroll", update);
      win?.removeEventListener("resize", update);
    };
  }, [iframeRef, hoveredBlock]);

  if (!hoveredRect) return null;

  return (
    <div
      className="selection-overlay selection-overlay--hover"
      style={{
        position: "fixed",
        left: hoveredRect.left,
        top: hoveredRect.top,
        width: hoveredRect.width,
        height: hoveredRect.height,
        pointerEvents: "none",
        zIndex: 9999,
        border: "1px dashed #94a3b8",
        boxSizing: "border-box",
      }}
    >
      <span
        className="selection-overlay__tag"
        style={{
          position: "absolute",
          top: -18,
          left: 0,
          background: "#94a3b8",
          color: "white",
          fontSize: "11px",
          padding: "1px 4px",
          borderRadius: "2px",
        }}
      >
        {hoveredBlock?.tagName}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: TS 编译**

```bash
cd F:/soft/00selfmade/tiptap_app
npx tsc --noEmit
```

Expected: 0 errors。

- [ ] **Step 3: Commit**

```bash
cd F:/soft/00selfmade/tiptap_app
git add src/components/SelectionOverlay.tsx
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(selection-overlay): hover 浮层渲染(虚线 + tag)"
```

---

## Task 8: SelectionOverlay.tsx — 渲染 selected overlay(实线 + breadcrumb badge)

**Files:**
- Modify: `src/components/SelectionOverlay.tsx`

**Interfaces:**
- Consumes: Task 7 的 hover overlay;Task 4 的 `locateBlock`
- Produces: 选中态浮层(实线 2px 蓝,右上 breadcrumb)

- [ ] **Step 1: 加 selectedRect + selected 渲染**

修改 `src/components/SelectionOverlay.tsx`:

在已有 `const [hoveredRect, setHoveredRect] = useState(...)` 后追加:

```typescript
const [selectedRect, setSelectedRect] = useState<Rect | null>(null);
const [breadcrumb, setBreadcrumb] = useState<string>("");
```

修改 `useEffect` deps,加 `[iframeRef, hoveredBlock, selectedBlock]`。在 effect 内:

```typescript
useEffect(() => {
  const iframe = iframeRef.current;
  if (!iframe) return;

  // hovered 渲染(已有逻辑保留)
  if (hoveredBlock) {
    setHoveredRect(getBlockRect(iframe, hoveredBlock.tagName, hoveredBlock.nthOfType));
  } else {
    setHoveredRect(null);
  }

  // selected 渲染
  if (selectedBlock && iframe.contentDocument) {
    const el = locateBlock(iframe.contentDocument, selectedBlock);
    if (el) {
      const r = el.getBoundingClientRect();
      const fr = iframe.getBoundingClientRect();
      setSelectedRect({
        left: r.left + fr.left,
        top: r.top + fr.top,
        width: r.width,
        height: r.height,
      });
      // breadcrumb: 沿 parentElement 走到 body 收集 tagName
      const path: string[] = [];
      let cur: HTMLElement | null = el;
      while (cur && cur.tagName !== "BODY" && cur.tagName !== "HTML") {
        path.unshift(cur.tagName.toLowerCase());
        cur = cur.parentElement;
      }
      setBreadcrumb(path.join(" > ") || el.tagName.toLowerCase());
    } else {
      setSelectedRect(null);
      setBreadcrumb("");
    }
  } else {
    setSelectedRect(null);
    setBreadcrumb("");
  }

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  const update = () => {
    if (hoveredBlock) {
      setHoveredRect(getBlockRect(iframe, hoveredBlock.tagName, hoveredBlock.nthOfType));
    }
    if (selectedBlock && iframe.contentDocument) {
      const el = locateBlock(iframe.contentDocument, selectedBlock);
      if (el) {
        const r = el.getBoundingClientRect();
        const fr = iframe.getBoundingClientRect();
        setSelectedRect({
          left: r.left + fr.left,
          top: r.top + fr.top,
          width: r.width,
          height: r.height,
        });
      }
    }
  };
  doc?.addEventListener("scroll", update);
  win?.addEventListener("resize", update);
  return () => {
    doc?.removeEventListener("scroll", update);
    win?.removeEventListener("resize", update);
  };
}, [iframeRef, hoveredBlock, selectedBlock]);
```

修改 return JSX,在 hover div 后追加 selected div:

```typescript
return (
  <>
    {hoveredRect && (
      <div
        className="selection-overlay selection-overlay--hover"
        style={{
          position: "fixed",
          left: hoveredRect.left,
          top: hoveredRect.top,
          width: hoveredRect.width,
          height: hoveredRect.height,
          pointerEvents: "none",
          zIndex: 9999,
          border: "1px dashed #94a3b8",
          boxSizing: "border-box",
        }}
      >
        <span className="selection-overlay__tag" style={{
          position: "absolute", top: -18, left: 0,
          background: "#94a3b8", color: "white",
          fontSize: "11px", padding: "1px 4px", borderRadius: "2px",
        }}>{hoveredBlock?.tagName}</span>
      </div>
    )}
    {selectedRect && (
      <div
        className="selection-overlay selection-overlay--selected"
        style={{
          position: "fixed",
          left: selectedRect.left,
          top: selectedRect.top,
          width: selectedRect.width,
          height: selectedRect.height,
          pointerEvents: "none",
          zIndex: 10000,
          border: "2px solid #2563eb",
          boxSizing: "border-box",
        }}
      >
        <span className="selection-overlay__badge" style={{
          position: "absolute", top: -20, right: 0,
          background: "#2563eb", color: "white",
          fontSize: "11px", padding: "1px 6px", borderRadius: "2px",
        }}>{breadcrumb}</span>
      </div>
    )}
  </>
);
```

加 import(文件顶部):

```typescript
import { locateBlock } from "../utils/blockStyle";
```

- [ ] **Step 2: TS 编译**

```bash
cd F:/soft/00selfmade/tiptap_app
npx tsc --noEmit
```

Expected: 0 errors。

- [ ] **Step 3: Commit**

```bash
cd F:/soft/00selfmade/tiptap_app
git add src/components/SelectionOverlay.tsx
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(selection-overlay): 选中浮层渲染(实线 + breadcrumb)"
```

---

## Task 9: App.tsx — iframe.contentDocument 事件 useEffect(hover + click + keydown)

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 5 的 state、Task 4 的 `BlockIdentity` 类型、Task 1 的 `parseContainerStyle`
- Produces: 事件绑定 useEffect;`setHoveredBlock` / `setSelectedBlock` / 反读 `setContainerForm` 调用

- [ ] **Step 1: 在 App.tsx 加事件 useEffect**

在已有 useEffect 区域附近(如 `useIframeFormatState` 之后),追加:

```typescript
// Goal 1 — iframe 事件: hover / click / dblclick / keydown
useEffect(() => {
  const iframe = iframeRef.current;
  if (!iframe) return;
  const doc = iframe.contentDocument;
  if (!doc) return;

  let lastMousedownTime = 0;

  // hover
  const onMouseOver = (e: MouseEvent) => {
    const target = e.target as Element;
    if (!(target instanceof HTMLElement)) return;
    const block = findBlockAtClientPoint(iframe, e.clientX, e.clientY);
    if (!block) {
      setHoveredBlock(null);
      return;
    }
    // nthOfType: 父内同 tag 的索引
    const parent = block.parentElement;
    let nthOfType = 0;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === block.tagName
      );
      nthOfType = siblings.indexOf(block);
    }
    setHoveredBlock({ tagName: block.tagName.toLowerCase(), nthOfType });
  };
  const onMouseOut = (e: MouseEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && doc.contains(related)) return; // 还在 iframe 内
    setHoveredBlock(null);
  };

  // click vs dblclick (200ms 窗口)
  const onMouseDown = (e: MouseEvent) => {
    lastMousedownTime = Date.now();
  };
  const onClick = (e: MouseEvent) => {
    const elapsed = Date.now() - lastMousedownTime;
    if (elapsed > 200) return; // 不是单击
    const target = e.target as Element;
    if (!(target instanceof HTMLElement)) return;
    const block = findBlockAtClientPoint(iframe, e.clientX, e.clientY);
    if (!block) return;
    const parent = block.parentElement;
    let nthOfType = 0;
    let textSample = (block.textContent ?? "").slice(0, 30);
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === block.tagName
      );
      nthOfType = siblings.indexOf(block);
    }
    setSelectedBlock({
      tagName: block.tagName.toLowerCase(),
      nthOfType,
      textSample,
    });
    // 反读 inline style → containerForm
    const inlineStyle = block.getAttribute("style") ?? "";
    setContainerForm(parseContainerStyle(inlineStyle));
    // iframe.blur 让 Ribbon 接管 focus
    iframe.contentWindow?.blur();
  };

  // dblclick 不拦,让文本编辑正常进行
  // keydown: Esc / Ctrl+↑ / Ctrl+↓
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setSelectedBlock(null);
      setContainerForm({});
      return;
    }
    if (e.key === "ArrowUp" && e.ctrlKey) {
      e.preventDefault();
      setSelectedBlock((prev) => {
        if (!prev || !doc) return prev;
        const el = locateBlock(doc, prev);
        if (!el || !el.parentElement) return prev;
        const parent = el.parentElement;
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === el.tagName
        );
        const nth = siblings.indexOf(el);
        return {
          tagName: el.parentElement.tagName.toLowerCase(),
          nthOfType: nth >= 0 ? nth : 0,
          textSample: (el.parentElement.textContent ?? "").slice(0, 30),
        };
      });
      return;
    }
    if (e.key === "ArrowDown" && e.ctrlKey) {
      e.preventDefault();
      setSelectedBlock((prev) => {
        if (!prev || !doc) return prev;
        const el = locateBlock(doc, prev);
        if (!el) return prev;
        const firstChild = Array.from(el.children).find(
          (c) => c.tagName !== "BR"
        ) as HTMLElement | undefined;
        if (!firstChild) return prev;
        const siblings = Array.from(firstChild.parentElement!.children).filter(
          (c) => c.tagName === firstChild.tagName
        );
        return {
          tagName: firstChild.tagName.toLowerCase(),
          nthOfType: siblings.indexOf(firstChild),
          textSample: (firstChild.textContent ?? "").slice(0, 30),
        };
      });
      return;
    }
  };

  doc.addEventListener("mouseover", onMouseOver);
  doc.addEventListener("mouseout", onMouseOut);
  doc.addEventListener("mousedown", onMouseDown);
  doc.addEventListener("click", onClick);
  doc.addEventListener("keydown", onKeyDown);
  return () => {
    doc.removeEventListener("mouseover", onMouseOver);
    doc.removeEventListener("mouseout", onMouseOut);
    doc.removeEventListener("mousedown", onMouseDown);
    doc.removeEventListener("click", onClick);
    doc.removeEventListener("keydown", onKeyDown);
  };
}, [iframeRef]);
```

加 import(在已有 `from "./utils/iframeExec"` 附近):

```typescript
import {
  findBlockAtClientPoint,
} from "./App"; // 该函数已在 App.tsx 内定义,无需 import;此处为占位,实际不需加
```

(注: `findBlockAtClientPoint` 已在 App.tsx 同文件内定义 — 不需要 import)

- [ ] **Step 2: TS 编译**

```bash
cd F:/soft/00selfmade/tiptap_app
npx tsc --noEmit
```

Expected: 0 errors。

- [ ] **Step 3: Commit**

```bash
cd F:/soft/00selfmade/tiptap_app
git add src/App.tsx
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(goal-1): iframe 事件 useEffect — hover/click/keydown + 反读 inline"
```

---

## Task 10: App.tsx — iframe onLoad 重定位 selectedBlock + deselection triggers

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 4 `locateBlock`、Task 5 state
- Produces: iframe onLoad 时重定位;`switchDoc` / `changeMode` 时清 selection

- [ ] **Step 1: 修改 iframe onLoad**

找到 `iframe` JSX(line ~1437 附近 `<iframe key={activeDoc.id} ref={iframeRef}` 的 `onLoad` prop),追加:

```typescript
onLoad={(e) => {
  // 已有 onLoad 逻辑保留(标记 isModified + 同步字数 + docHtml)
  // 新增:重定位 selectedBlock
  const iframe = iframeRef.current;
  if (iframe?.contentDocument && selectedBlock) {
    const el = locateBlock(iframe.contentDocument, selectedBlock);
    if (!el) {
      // 重定位失败 → 清空
      setSelectedBlock(null);
      setContainerForm({});
    } else if (containerForm && Object.keys(containerForm).length === 0) {
      // 重定位成功且 containerForm 空 → 反读 inline
      const inlineStyle = el.getAttribute("style") ?? "";
      setContainerForm(parseContainerStyle(inlineStyle));
    }
  }
}}
```

(注: 实际修改时,需保留原有 onLoad 内的所有代码,只在末尾追加重定位逻辑)

- [ ] **Step 2: deselection triggers**

在 `switchDoc` 函数内(line ~457 附近),开头追加:

```typescript
setSelectedBlock(null);
setHoveredBlock(null);
setContainerForm({});
```

在 `changeMode` 函数内(line ~994 附近),开头追加:

```typescript
if (next === "source") {
  setSelectedBlock(null);
  setHoveredBlock(null);
  setContainerForm({});
}
```

- [ ] **Step 3: TS 编译**

```bash
cd F:/soft/00selfmade/tiptap_app
npx tsc --noEmit
```

Expected: 0 errors。

- [ ] **Step 4: Commit**

```bash
cd F:/soft/00selfmade/tiptap_app
git add src/App.tsx
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(goal-1): iframe onLoad 重定位 + switchDoc/changeMode 清选中"
```

---

## Task 11: App.tsx — 挂载 `<SelectionOverlay />`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 5 state、Task 8 SelectionOverlay
- Produces: 渲染 `<SelectionOverlay>` 在 iframe 旁边

- [ ] **Step 1: 挂载 SelectionOverlay**

找到 `<iframe ref={iframeRef} ...>` JSX,在其后追加:

```typescript
<SelectionOverlay
  iframeRef={iframeRef}
  hoveredBlock={hoveredBlock}
  selectedBlock={selectedBlock}
/>
```

加 import(在已有 component import 区域):

```typescript
import { SelectionOverlay } from "./components/SelectionOverlay";
```

- [ ] **Step 2: TS 编译 + chrome headless 渲染验证**

```bash
cd F:/soft/00selfmade/tiptap_app
pnpm build 2>&1 | tail -5
cd dist && python -m http.server 8732 > /tmp/preview2.log 2>&1 &
sleep 2
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --no-sandbox --virtual-time-budget=10000 --screenshot="F:/soft/00selfmade/tiptap_app/_goal1_verify.png" --window-size=1280,800 "http://localhost:8732/"
cmd.exe //c "taskkill /F /PID $(netstat -ano | grep 8732 | head -1 | awk '{print $NF}')" 2>&1 | tail -1
```

Expected: chrome 截图生成,无 JS 错误(_goal1_verify.png ~20KB)。

- [ ] **Step 3: Commit**

```bash
cd F:/soft/00selfmade/tiptap_app
git add src/App.tsx
rm -f _goal1_verify.png
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(goal-1): 挂载 SelectionOverlay 到 iframe 旁"
```

---

## Task 12: ContainerStyleGroup.tsx — 基础布局 + 控件(7 个 + ⭐)

**Files:**
- Create: `src/components/ContainerStyleGroup.tsx`

**Interfaces:**
- Consumes: Task 2 `ContainerForm`、`PROP_TO_CSS`(从 blockStyle)
- Produces: `<ContainerStyleGroup>` 组件,接收 `selectedBlock` / `containerForm` / `onChange` / `onPromote` props

- [ ] **Step 1: 创建组件**

```typescript
// src/components/ContainerStyleGroup.tsx
import { useCallback } from "react";
import type { ContainerForm, ContainerProp, BlockIdentity } from "../utils/blockStyle";
import { SelectControl, RibbonButton, GroupTitle } from "./controls";
import { ColorPicker } from "./ColorPicker";
import { PAGE_BG_COLORS } from "../utils/fonts";

interface ContainerStyleGroupProps {
  selectedBlock: BlockIdentity | null;
  containerForm: ContainerForm;
  onChange: (prop: ContainerProp, value: string) => void;
  onPromote: () => void;
}

const BORDER_WIDTHS = ["4", "1px", "2px", "4px", "8px"];
const BORDER_STYLES = ["solid", "dashed", "dotted", "none"];
const BORDER_RADIUS = ["4", "0", "4px", "8px", "16px"];
const PADDINGS = ["8", "0", "8px", "16px", "24px", "32px"];

export function ContainerStyleGroup({
  selectedBlock,
  containerForm,
  onChange,
  onPromote,
}: ContainerStyleGroupProps) {
  const disabled = !selectedBlock;

  const setProp = useCallback(
    (prop: ContainerProp) => (value: string) => {
      onChange(prop, value === "" ? "" : value);
    },
    [onChange]
  );

  return (
    <div className="ribbon-group container-style-group" data-disabled={disabled}>
      <GroupTitle>容器</GroupTitle>
      <ColorPicker
        value={containerForm.bgColor ?? ""}
        onChange={(c) => setProp("bgColor")(c)}
        onClear={() => setProp("bgColor")("")}
        colors={PAGE_BG_COLORS}
        recents={[]}
        title="背景色"
        label="背景"
      />
      <ColorPicker
        value={containerForm.borderColor ?? ""}
        onChange={(c) => setProp("borderColor")(c)}
        onClear={() => setProp("borderColor")("")}
        colors={PAGE_BG_COLORS}
        recents={[]}
        title="边框色"
        label="边框"
      />
      <SelectControl
        value={containerForm.borderWidth ?? ""}
        onChange={(v) => setProp("borderWidth")(v)}
        options={BORDER_WIDTHS.map((w) => ({ label: w, value: w }))}
        title="边框宽度"
      />
      <SelectControl
        value={containerForm.borderStyle ?? ""}
        onChange={(v) => setProp("borderStyle")(v)}
        options={BORDER_STYLES.map((s) => ({ label: s, value: s }))}
        title="边框样式"
      />
      <SelectControl
        value={containerForm.borderRadius ?? ""}
        onChange={(v) => setProp("borderRadius")(v)}
        options={BORDER_RADIUS.map((r) => ({ label: r, value: r }))}
        title="圆角"
      />
      <SelectControl
        value={containerForm.padding ?? ""}
        onChange={(v) => setProp("padding")(v)}
        options={PADDINGS.map((p) => ({ label: p, value: p }))}
        title="内边距"
      />
      <RibbonButton
        icon="⭐"
        label="提升为默认"
        onClick={onPromote}
        disabled={disabled}
        title={disabled ? "先选中块" : "把当前块的样式提升为 head CSS 规则"}
      />
    </div>
  );
}
```

- [ ] **Step 2: TS 编译**

```bash
cd F:/soft/00selfmade/tiptap_app
npx tsc --noEmit
```

Expected: 0 errors(注意:`controls` 和 `ColorPicker` 需已存在 — 确认下,如果不存在的 import 错误,临时调通即可)。

- [ ] **Step 3: Commit**

```bash
cd F:/soft/00selfmade/tiptap_app
git add src/components/ContainerStyleGroup.tsx
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(container-style-group): 7 控件 + ⭐ 提升按钮 UI"
```

---

## Task 13: App.tsx — `setBlockStyle` callback + 挂载 `<ContainerStyleGroup>`

**Files:**
- Modify: `src/App.tsx`、`src/components/Ribbon.tsx`

**Interfaces:**
- Consumes: Task 1 `applyContainerStyle`、Task 4 `locateBlock`、Task 5 state
- Produces: `setBlockStyle` callback;`<ContainerStyleGroup>` 挂到 Ribbon 编辑 tab 末尾

- [ ] **Step 1: App.tsx 加 `setBlockStyle` callback**

在已有 callback 区域(如 `applyDesign` 附近,line ~354 之后)追加:

```typescript
const setBlockStyle = useCallback(
  (prop: ContainerProp, value: string) => {
    if (!selectedBlock) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const el = locateBlock(iframe.contentDocument, selectedBlock);
    if (!el) return;
    setContainerForm((prev) => ({ ...prev, [prop]: value }));
    const style = applyContainerStyle(el.getAttribute("style") ?? "", prop, value);
    el.setAttribute("style", style);
    setIsModified(true);
    setDocHtml(iframe.contentDocument.body.innerHTML);
  },
  [selectedBlock]
);
```

加 import(在已有 `blockStyle` import 附近,Task 5 加过的):

```typescript
import {
  locateBlock,
  parseContainerStyle,
  applyContainerStyle,
  type ContainerProp,
  type BlockIdentity,
  type ContainerForm,
} from "./utils/blockStyle";
```

- [ ] **Step 2: 挂到 Ribbon**

修改 `src/components/Ribbon.tsx`:

找到 `activeTab === "edit"` 分支,在 `<RibbonHome ... />` 后追加 `<ContainerStyleGroup ... />`:

```typescript
{activeTab === "edit" && (
  <>
    <RibbonHome ... />
    <ContainerStyleGroup
      selectedBlock={selectedBlock}
      containerForm={containerForm}
      onChange={setBlockStyle}
      onPromote={() => { /* Task 14 实现 */ }}
    />
  </>
)}
```

加 import:

```typescript
import { ContainerStyleGroup } from "./ContainerStyleGroup";
```

在 Ribbon.tsx props 接口里追加所需 props(或用 useAppState 取 — 看现有 Ribbon 是否直接从 useAppState 拿,如果是,改用 useAppState)。

(注:如果 Ribbon 之前没接收 selectedBlock 等,需要新增 props 透传。最小改动:在 Ribbon.tsx 顶层通过 useAppState() 读 — 但项目可能没用 useAppState 模式,所以最简方案是 App.tsx 把 props 传下去。需根据实际情况调整 — 保持最小改动。)

- [ ] **Step 3: TS 编译**

```bash
cd F:/soft/00selfmade/tiptap_app
npx tsc --noEmit
```

Expected: 0 errors。

- [ ] **Step 4: Commit**

```bash
cd F:/soft/00selfmade/tiptap_app
git add src/App.tsx src/components/Ribbon.tsx
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(goal-2): setBlockStyle callback + ContainerStyleGroup 挂载到 Ribbon"
```

---

## Task 14: App.tsx — `handlePromote` ⭐ 提升流程 + 确认 modal

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 3 `extractContainerStyle` / `upsertBlockStyleRule`、Task 4 `locateBlock`
- Produces: `handlePromote` callback;`promoteConfirmOpen` state;inline modal 复用 AboutDialog 风格

- [ ] **Step 1: 加 state + callback**

加 state(在 `closeDialogOpen` 之前):

```typescript
const [promoteConfirmOpen, setPromoteConfirmOpen] = useState<{
  tagName: string;
  count: number;
} | null>(null);
```

加 callback:

```typescript
const handlePromote = useCallback(() => {
  if (!selectedBlock) return;
  const iframe = iframeRef.current;
  if (!iframe?.contentDocument) return;
  const el = locateBlock(iframe.contentDocument, selectedBlock);
  if (!el) return;
  const tagName = el.tagName.toLowerCase();
  const props = extractContainerStyle(el.getAttribute("style") ?? "");
  if (Object.keys(props).length === 0) {
    window.alert("该块没有可提升的样式");
    return;
  }
  const doc = iframe.contentDocument;
  const count = doc.body.querySelectorAll(tagName).length;
  if (count <= 1) {
    window.alert(`只有一个 ${tagName},无需提升`);
    return;
  }
  setPromoteConfirmOpen({ tagName, count });
}, [selectedBlock]);

const confirmPromote = useCallback(() => {
  if (!promoteConfirmOpen || !selectedBlock) return;
  const iframe = iframeRef.current;
  if (!iframe?.contentDocument) return;
  const el = locateBlock(iframe.contentDocument, selectedBlock);
  if (!el) return;
  const tagName = el.tagName.toLowerCase();
  const props = extractContainerStyle(el.getAttribute("style") ?? "");
  if (Object.keys(props).length === 0) return;
  const baseShell = shell ?? {
    doctype: "<!DOCTYPE html>",
    head: "",
    headCss: "",
    bodyAttrs: "",
    scripts: "",
    styles: "",
    baseHref: "",
  };
  const newHead = upsertBlockStyleRule(baseShell.head, tagName, props);
  const newShell = { ...baseShell, head: newHead };
  setShell(newShell);
  el.setAttribute("style", "");
  setIsModified(true);
  setDocHtml(iframe.contentDocument.body.innerHTML);
  updateActiveDoc({ shell: newShell });
  setPromoteConfirmOpen(null);
}, [promoteConfirmOpen, selectedBlock, shell, updateActiveDoc]);
```

- [ ] **Step 2: 在 JSX 渲染确认 modal**

在 `<UnsavedCloseDialog>` 之前追加:

```typescript
{promoteConfirmOpen && (
  <div className="modal-mask" onClick={() => setPromoteConfirmOpen(null)}>
    <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
      <h3>提升为默认</h3>
      <p>将把样式提升为本文档所有 <code>{promoteConfirmOpen.tagName}</code> 的默认(共 {promoteConfirmOpen.count} 个)。原 inline 会被清除。</p>
      <div className="modal-actions">
        <button onClick={confirmPromote}>确定</button>
        <button onClick={() => setPromoteConfirmOpen(null)}>取消</button>
      </div>
    </div>
  </div>
)}
```

加 import:

```typescript
import { extractContainerStyle, upsertBlockStyleRule } from "./utils/blockStyle";
```

- [ ] **Step 3: 关联 onPromote**

修改 Task 13 里 `<ContainerStyleGroup onPromote={() => {}}>` 为 `onPromote={handlePromote}`。

- [ ] **Step 4: TS 编译**

```bash
cd F:/soft/00selfmade/tiptap_app
npx tsc --noEmit
```

Expected: 0 errors。

- [ ] **Step 5: Commit**

```bash
cd F:/soft/00selfmade/tiptap_app
git add src/App.tsx
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(goal-2): handlePromote ⭐ 提升 + 确认 modal"
```

---

## Task 15: UnsavedCloseDialog.tsx — 关闭弹窗组件

**Files:**
- Create: `src/components/UnsavedCloseDialog.tsx`

**Interfaces:**
- Consumes: `DocState` 类型(从 `../types` 或 `App.tsx`)
- Produces: `<UnsavedCloseDialog>` 组件,接收 `dirtyTabs` / `onSaveSelected` / `onDontSave` / `onCancel` props

- [ ] **Step 1: 创建组件**

```typescript
// src/components/UnsavedCloseDialog.tsx
import { useState } from "react";

interface TabInfo {
  id: number;
  filePath: string | null;
  title: string;
}

interface UnsavedCloseDialogProps {
  dirtyTabs: TabInfo[];
  onSaveSelected: (selectedIds: number[]) => Promise<boolean>;
  onDontSave: () => void;
  onCancel: () => void;
}

export function UnsavedCloseDialog({
  dirtyTabs,
  onSaveSelected,
  onDontSave,
  onCancel,
}: UnsavedCloseDialogProps) {
  const [selected, setSelected] = useState<Set<number>>(
    new Set(dirtyTabs.map((t) => t.id))
  );

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    const ok = await onSaveSelected(Array.from(selected));
    if (ok) {
      // 成功由调用方关闭
    }
  };

  return (
    <div className="modal-mask" onClick={onCancel}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>未保存的文档</h3>
        <p>以下文档有未保存的修改:</p>
        <ul className="dirty-tabs-list">
          {dirtyTabs.map((tab) => (
            <li key={tab.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(tab.id)}
                  onChange={() => toggle(tab.id)}
                />
                <span>{tab.filePath ?? "(新建文档)"} — {tab.title}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button onClick={handleSave} disabled={selected.size === 0}>保存选中</button>
          <button onClick={onDontSave}>不保存</button>
          <button onClick={onCancel}>取消</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TS 编译**

```bash
cd F:/soft/00selfmade/tiptap_app
npx tsc --noEmit
```

Expected: 0 errors。

- [ ] **Step 3: Commit**

```bash
cd F:/soft/00selfmade/tiptap_app
git add src/components/UnsavedCloseDialog.tsx
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(unsaved-close-dialog): 组件 + dirty tab checkbox 列表"
```

---

## Task 16: App.tsx — `onCloseRequested` useEffect + 挂载 UnsavedCloseDialog

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 15 UnsavedCloseDialog、Task 5 已有 state
- Produces: `closeDialogOpen` state + handlers;挂载 `<UnsavedCloseDialog>`;`onCloseRequested` useEffect

- [ ] **Step 1: 加 state + handlers + useEffect**

加 state(在 `promoteConfirmOpen` 之后):

```typescript
const [closeDialogOpen, setCloseDialogOpen] = useState(false);
```

加 useEffect(顶层,跟其他 effect 并列):

```typescript
useEffect(() => {
  let unlisten: (() => void) | undefined;
  (async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    unlisten = await win.onCloseRequested(async (event) => {
      const dirtyTabs = docs.filter((d) => d.isModified);
      if (dirtyTabs.length === 0) return; // 不 prevent,允许关闭
      event.preventDefault();
      setCloseDialogOpen(true);
    });
  })();
  return () => unlisten?.();
}, [docs]);
```

加 handlers:

```typescript
const handleSaveSelected = useCallback(async (selectedIds: number[]): Promise<boolean> => {
  for (const id of selectedIds) {
    const doc = docs.find((d) => d.id === id);
    if (!doc) continue;
    if (doc.filePath) {
      try {
        await doSave(doc.filePath);
      } catch (e) {
        window.alert(`保存失败: ${e}\n文件: ${doc.filePath}`);
        return false;
      }
    } else {
      // 无 filePath,弹 save dialog
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const selected = await save({
          filters: [{ name: "HTML 文件", extensions: ["html", "txt"] }],
        });
        if (!selected) return false;
        const path = selected.endsWith(".html") || selected.endsWith(".txt") ? selected : selected + ".html";
        await doSave(path);
      } catch (e) {
        window.alert(`保存失败: ${e}`);
        return false;
      }
    }
  }
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().close();
  return true;
}, [docs, doSave]);

const handleDontSave = useCallback(() => {
  setDocs((prev) => prev.map((d) => ({ ...d, isModified: false })));
  setCloseDialogOpen(false);
  (async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  })();
}, []);

const handleCancelClose = useCallback(() => {
  setCloseDialogOpen(false);
}, []);
```

- [ ] **Step 2: 挂载 `<UnsavedCloseDialog>`**

在 JSX 末尾追加:

```typescript
{closeDialogOpen && (
  <UnsavedCloseDialog
    dirtyTabs={docs.filter((d) => d.isModified).map((d) => ({
      id: d.id,
      filePath: d.filePath,
      title: d.title ?? d.id.toString(),
    }))}
    onSaveSelected={handleSaveSelected}
    onDontSave={handleDontSave}
    onCancel={handleCancelClose}
  />
)}
```

加 import:

```typescript
import { UnsavedCloseDialog } from "./components/UnsavedCloseDialog";
```

(注: `DocState` 的 `title` 字段需确认是否存在 — 如不存在,把 `d.title ?? d.id.toString()` 改为 `d.filePath ?? \`(未命名 ${d.id})\``)

- [ ] **Step 3: TS 编译**

```bash
cd F:/soft/00selfmade/tiptap_app
npx tsc --noEmit
```

Expected: 0 errors。

- [ ] **Step 4: Commit**

```bash
cd F:/soft/00selfmade/tiptap_app
git add src/App.tsx
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(goal-3): onCloseRequested useEffect + UnsavedCloseDialog 挂载"
```

---

## Task 17: App.css — 3 套样式 + 真机手测 20 项

**Files:**
- Modify: `src/App.css`

**Interfaces:**
- Produces: `.selection-overlay` / `--hover` / `--selected` / `__badge` / `__tag` / `.container-style-group` / `.container-style-group[data-disabled="true"]` / `.unsaved-close-dialog` / `.dirty-tabs-list` / `.modal-dialog` 样式

- [ ] **Step 1: 在 `src/App.css` 末尾追加**

```css
/* Goal 1 — SelectionOverlay */
.selection-overlay {
  box-sizing: border-box;
}
.selection-overlay--hover {
  border: 1px dashed #94a3b8;
}
.selection-overlay--selected {
  border: 2px solid #2563eb;
}
.selection-overlay__tag {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 11px;
  line-height: 14px;
}
.selection-overlay__badge {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 11px;
  line-height: 14px;
  white-space: nowrap;
}

/* Goal 2 — ContainerStyleGroup */
.container-style-group {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
}
.container-style-group[data-disabled="true"] {
  opacity: 0.4;
  pointer-events: none;
}

/* Goal 3 — UnsavedCloseDialog + 通用 modal-dialog */
.modal-dialog {
  background: var(--bg, white);
  border-radius: 6px;
  padding: 20px 24px;
  min-width: 360px;
  max-width: 480px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.modal-dialog h3 {
  margin: 0 0 12px;
  font-size: 16px;
}
.modal-dialog p {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--fg-muted, #555);
}
.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}
.modal-actions button {
  padding: 4px 12px;
  border: 1px solid var(--border, #ccc);
  background: var(--bg, white);
  border-radius: 3px;
  cursor: pointer;
}
.modal-actions button:hover:not(:disabled) {
  background: var(--bg-hover, #f5f5f5);
}
.modal-actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.dirty-tabs-list {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
  max-height: 200px;
  overflow-y: auto;
}
.dirty-tabs-list li label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 13px;
  cursor: pointer;
}
.dirty-tabs-list input[type="checkbox"] {
  margin: 0;
}
```

- [ ] **Step 2: build + chrome headless 渲染**

```bash
cd F:/soft/00selfmade/tiptap_app
pnpm build 2>&1 | tail -3
cd dist && python -m http.server 8733 > /tmp/preview3.log 2>&1 &
sleep 2
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --no-sandbox --virtual-time-budget=10000 --screenshot="F:/soft/00selfmade/tiptap_app/_all_goals_verify.png" --window-size=1280,800 "http://localhost:8733/"
cmd.exe //c "taskkill /F /PID $(netstat -ano | grep 8733 | head -1 | awk '{print $NF}')" 2>&1 | tail -1
```

Expected: 截图生成,_all_goals_verify.png ~25KB(菜单 + 设计 tab 可见 + 编辑区 iframe),无 JS 报错。

- [ ] **Step 3: 真机完整验证 20 项 checklist(用户硬规则:必须)**

```bash
cd F:/soft/00selfmade/tiptap_app
git -c user.name="Claude" -c user.email="noreply@anthropic.com" add src/App.css
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "feat(css): SelectionOverlay + ContainerStyleGroup + modal-dialog 样式"
```

然后在用户机器上跑以下手测清单(每项必须 ✓ 才算 P0 完成):

| # | 用例 | 结果 |
|---|---|---|
| 1 | hover 不同块 → 浅虚线 + tag,移出消失 | ☐ |
| 2 | 单击 `<p>` → 选中态,蓝实线 2px,右上 badge `p` | ☐ |
| 3 | 双击 `<p>` 文字 → 文本选词,无选中态出现 | ☐ |
| 4 | 选中 `<p>` 后 Ctrl+↑ → 选中父 `<div>`,breadcrumb | ☐ |
| 5 | 选中 `<div>` 后 Ctrl+↓ → 选中第一个子 `<p>` | ☐ |
| 6 | Esc → 脱选,overlay 消失 | ☐ |
| 7 | 容器组改背景色 → inline style 立即生效 | ☐ |
| 8 | 容器组改 边框色 / 宽 / 样式 / 圆角 / padding → 全生效 | ☐ |
| 9 | ⭐ 提升:N=1 提示"无需提升";N>1 弹确认 → head CSS 出现 `p { ... }`,inline 被清 | ☐ |
| 10 | iframe 重建后(改 shell)→ selectedBlock 重定位成功 | ☐ |
| 11 | 关闭 app,有 1 个未保存 → 弹 dialog,Save 成功 → 关闭 | ☐ |
| 12 | 关闭 app,save dialog 里 Cancel → 留 dialog,checkbox 不变 | ☐ |
| 13 | 关闭 app,Don't Save → 直接关,`isModified` 已清 | ☐ |
| 14 | 关闭 app,Cancel → 不关,继续编辑 | ☐ |
| 15 | 关闭 app,无未保存 → 不弹,直接关 | ☐ |
| 16 | 关闭 app,多个未保存 → 单 dialog 列所有 dirty tabs | ☐ |
| 17 | 切 activeDoc → 选中态清空 | ☐ |
| 18 | 切到 source view → 选中态清空 | ☐ |
| 19 | 选 `<table>` / `<img>` → 容器组改 bg/border | ☐ |
| 20 | 右键菜单"设为默认样式" 仍可用 | ☐ |

20 项全 ✓ 后,在本 task 内 `commit` 最终 merge commit + 写 handoff-p2-p3.md。

- [ ] **Step 4: 写最终 handoff + 收尾**

```bash
cd F:/soft/00selfmade/tiptap_app
# 清理临时截图
rm -f _all_goals_verify.png
# 写 handoff(按 CLAUDE.md §9 格式,参考 handoff-v2.1.0-final.md)
# 内容:完成摘要 + 改动文件清单 + 测试证据 + 下一步必交付 + 避坑提示
# 文件名:handoff-goal12-2026-08-27.md
git add handoff-goal12-2026-08-27.md
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "docs(handoff): Goal 1+2+3 完成 — v2.3.0 候选"
```

---

## Self-Review Checklist(写 plan 后自审)

**1. Spec coverage**(spec §1-§11 → task):

| Spec 节 | Task 覆盖 |
|---|---|
| §1.2 Goal 1 可视块选择 | T9, T10, T11 |
| §1.2 Goal 2 容器样式编辑 | T12, T13, T14 |
| §1.2 Goal 3 关闭弹窗 | T15, T16 |
| §4 可视块选择状态机 | T9 (click) + T10 (deselect) |
| §4.3 事件处理 | T9 |
| §4.5 Deselection 触发 | T10 |
| §5.1 ContainerStyleGroup 布局 | T12 |
| §5.2 Inline style 写入 | T13 (setBlockStyle) |
| §5.4 ⭐ 提升流程 | T14 |
| §6.1 触发 | T16 (onCloseRequested) |
| §6.3 Dialog 形态 | T15 |
| §6.6 实现骨架 | T16 |
| §7.1 新增文件 | T1-T4 (blockStyle) + T6-T8 (SelectionOverlay) + T12 (ContainerStyleGroup) + T15 (UnsavedCloseDialog) |
| §7.2 改动文件 | T5, T9-T11, T13, T14, T16 (App.tsx) + T13 (Ribbon.tsx) + T17 (App.css) |
| §8.1 单测 | T1-T4 |
| §8.2 20 项真机手测 | T17 |

全部覆盖。

**2. Placeholder scan**:无 TBD / TODO / "fill in details"。Ribbon.tsx 的 useAppState 提示是真实风险(T13 Step 2 注),不是占位符。

**3. Type consistency**:
- `BlockIdentity`(Task 4)→ App.tsx state(T5)→ `locateBlock` 调用(T9/T10/T13/T14)— 一致
- `ContainerForm`(Task 2)→ App.tsx state(T5)→ ContainerStyleGroup props(T12)→ setBlockStyle(T13)— 一致
- `ContainerProp`(Task 1)→ setBlockStyle 参数(T13)→ ContainerStyleGroup prop 回调(T12)— 一致
- `BLOCK_STYLE_ID`(Task 3)→ ⭐ 提升使用(T14)— 一致
- `applyContainerStyle` / `parseContainerStyle` / `extractContainerStyle` / `upsertBlockStyleRule` / `locateBlock` — 命名一致

---

## 备注

- 实施期间所有 commit 用 per-command identity(用户硬规则)
- 每 task TS 编译通过后才 commit
- 真机手测(T17)前不 ship,per 用户硬规则
- 单测脚本用 vitest 的 `pnpm tsx`,项目已有此模式