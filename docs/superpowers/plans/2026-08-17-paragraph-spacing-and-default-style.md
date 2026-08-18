# 段落间距工具栏 + 「设为默认样式」 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ribbon 段落组新增行距 / 段前 / 段后 三个 SelectControl；右键菜单新增「设为默认样式」，把当前块显式样式写入 head 内嵌命名块 `weavepage-default-styles`。

**Architecture:** 纯客户端 React + Tauri。命名块作为默认样式的唯一事实源，由工具模块 `defaultStyle.ts` parse/serialize/upsert；Ribbon 控件直接改 Tiptap 节点的 inline `style` 属性（GlobalAttrs 已支持）；右键菜单新建独立组件替代现有 `setBlockPanelPos` 单点触发。**不动外联 css**。

**Tech Stack:** Tauri v2 + React 19 + Tiptap 3.30 + TS strict。测试用 `node:test` + `tsx`（项目无 Vitest，新增 runner 偏离栈，**改用 tsx 直跑 .test.ts**）。

## Global Constraints

- TS strict + noUnusedLocals：占位用 `void x;`
- 版本号同步：0.1.3 → 0.1.4 三处（`package.json` + `src-tauri/tauri.conf.json` + `scripts/copy-release.mjs`）
- git commit 用 `git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit`
- Shell 命名块 id 固定为 `weavepage-default-styles`
- 白名单 8 项：font-family / font-size / color / background-color / text-align / line-height / margin-top / margin-bottom
- 容器范围仅 p / h1-h6
- 不动 Tauri 后端 / 不动外联 css / 不做 undo（已知限制）
- 测试用 `tsx`，命令：`pnpm tsx src/utils/<file>.test.ts`（如未装 `tsx`，先 `pnpm add -D tsx`）

## File Structure

| 路径 | 责任 | 状态 |
|---|---|---|
| `src/utils/paragraphSpacing.ts` | 行距/段前后预设常量、pt↔px、margin 合并 | 新建 |
| `src/utils/paragraphSpacing.test.ts` | 上述单元测试 | 新建 |
| `src/utils/defaultStyle.ts` | 命名块 parse/serialize/upsert、选择器映射、属性白名单 | 新建 |
| `src/utils/defaultStyle.test.ts` | 上述单元测试 | 新建 |
| `src/components/EditorContextMenu.tsx` | 右键菜单浮层（块源码 + 设为默认） | 新建 |
| `src/components/RibbonHome.tsx` | 段落组末尾加 3 个 SelectControl | 修改 |
| `src/App.tsx` | 装配 contextMenu state + 设为默认回调 + shell upsert | 修改 |
| `src/App.css` | 新增 `.context-menu` / `.context-menu-item` 样式 | 修改 |
| `package.json` | 0.1.3→0.1.4 + devDep `tsx` | 修改 |
| `src-tauri/tauri.conf.json` | version 0.1.4 | 修改 |
| `scripts/copy-release.mjs` | NSIS+MSI 文件名 0.1.4 | 修改 |

---

### Task 1: paragraphSpacing 模块（预设 + 单位换算 + margin 合并）

**Files:**
- Create: `src/utils/paragraphSpacing.ts`
- Create: `src/utils/paragraphSpacing.test.ts`

**Interfaces (consumed by later tasks):**
- `export const LINE_HEIGHT_OPTIONS: { label: string; value: string }[]`  // 用于 Ribbon SelectControl
- `export const PARAGRAPH_SPACING_OPTIONS: { label: string; value: string }[]`
- `export const ptToPx = (pt: number): number`
- `export const pxToPt = (px: number): number`
- `export function applyLineHeight(nodeStyle: string, value: number): string`  // 合并已有 inline style
- `export function applyParagraphSpacing(nodeStyle: string, side: "top" | "bottom", ptValue: number): string`
- `export function readLineHeightFromStyle(nodeStyle: string): number | ""`  // 给 fmt 派生用
- `export function readMarginFromStyle(nodeStyle: string, side: "top" | "bottom"): number | ""`  // 单位 pt

**约定**：
- pt ↔ px 公式：`1pt = 4/3 px`（96dpi）。`ptToPx(12) = 16`
- inline style 是标准 CSS 字符串（`"line-height: 1.5; margin: 0 auto"`）
- margin 合并：用正则在已有 style 上找 `margin` / `margin-top` / `margin-bottom` 简写/分写，分情况合并；失败时 fallback 覆盖
- 不读 computedStyle，所有操作只基于传入的 style 字符串

- [ ] **Step 1: 写失败测试**

`src/utils/paragraphSpacing.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ptToPx, pxToPt,
  applyLineHeight, applyParagraphSpacing,
  readLineHeightFromStyle, readMarginFromStyle,
  LINE_HEIGHT_OPTIONS, PARAGRAPH_SPACING_OPTIONS,
} from "./paragraphSpacing";

test("ptToPx / pxToPt 互逆", () => {
  assert.equal(ptToPx(12), 16);
  assert.equal(ptToPx(0), 0);
  assert.equal(pxToPt(16), 12);
});

test("applyLineHeight 空 style 上加", () => {
  assert.equal(applyLineHeight("", 1.75), "line-height: 1.75");
});

test("applyLineHeight 已含 line-height 时替换", () => {
  assert.equal(applyLineHeight("color: red; line-height: 1.5", 2),
    "color: red; line-height: 2");
});

test("applyParagraphSpacing 合并 margin: 0 auto (段前 12pt)", () => {
  // margin: 0 auto  → top=0 right=auto bottom=0 left=auto  → 改 top → 16px auto 0 auto
  // 但 margin 简写输出:margin: 16px auto 0
  const result = applyParagraphSpacing("margin: 0 auto", "top", 12);
  assert.match(result, /margin:\s*16px\s+auto\s+0/);
});

test("applyParagraphSpacing 已含 margin-top 时替换", () => {
  assert.equal(applyParagraphSpacing("margin-top: 8px; color: red", "top", 12),
    "color: red; margin-top: 16px");
});

test("applyParagraphSpacing 段后空 style 上加", () => {
  assert.equal(applyParagraphSpacing("", "bottom", 6), "margin-bottom: 8px");
});

test("readLineHeightFromStyle 解析 number", () => {
  assert.equal(readLineHeightFromStyle("line-height: 1.75"), 1.75);
  assert.equal(readLineHeightFromStyle(""), "");
});

test("readMarginFromStyle 单位转 pt", () => {
  assert.equal(readMarginFromStyle("margin-top: 16px", "top"), 12);
  assert.equal(readMarginFromStyle("margin: 16px auto", "top"), 12);
  assert.equal(readMarginFromStyle("", "bottom"), "");
});

test("LINE_HEIGHT_OPTIONS 预设 1/1.15/1.5/1.75/2/2.5/3", () => {
  const values = LINE_HEIGHT_OPTIONS.map((o) => o.value);
  for (const v of ["1", "1.15", "1.5", "1.75", "2", "2.5", "3"]) {
    assert.ok(values.includes(v), `缺 ${v}`);
  }
});

test("PARAGRAPH_SPACING_OPTIONS 预设 0/6/12/18/24 pt", () => {
  const values = PARAGRAPH_SPACING_OPTIONS.map((o) => o.value);
  for (const v of ["0pt", "6pt", "12pt", "18pt", "24pt"]) {
    assert.ok(values.includes(v), `缺 ${v}`);
  }
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm tsx src/utils/paragraphSpacing.test.ts
```

期望：FAIL `Cannot find module './paragraphSpacing'`。

- [ ] **Step 3: 写最小实现**

`src/utils/paragraphSpacing.ts`：

```ts
export const LINE_HEIGHT_OPTIONS = [
  { label: "1.0", value: "1" },
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "1.75", value: "1.75" },
  { label: "2.0", value: "2" },
  { label: "2.5", value: "2.5" },
  { label: "3.0", value: "3" },
];

export const PARAGRAPH_SPACING_OPTIONS = [
  { label: "0", value: "0pt" },
  { label: "6", value: "6pt" },
  { label: "12", value: "12pt" },
  { label: "18", value: "18pt" },
  { label: "24", value: "24pt" },
];

export const ptToPx = (pt: number): number => Math.round(pt * 4 / 3);
export const pxToPt = (px: number): number => Math.round(px * 3 / 4);

// 把已有 style 解析成 prop->value 字典（保序）
const parseStyle = (s: string): { props: [string, string][]; raw: string } => {
  const props: [string, string][] = [];
  s.split(";").forEach((decl) => {
    const idx = decl.indexOf(":");
    if (idx < 0) return;
    const name = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (name) props.push([name, value]);
  });
  return { props, raw: s };
};

const serializeStyle = (props: [string, string][]): string =>
  props.filter(([, v]) => v !== "").map(([k, v]) => `${k}: ${v}`).join("; ");

const setProp = (props: [string, string][], name: string, value: string): [string, string][] => {
  const lower = name.toLowerCase();
  const next = props.filter(([k]) => k.toLowerCase() !== lower);
  next.unshift([name, value]);
  return next;
};

export function applyLineHeight(style: string, value: number): string {
  const { props } = parseStyle(style);
  return serializeStyle(setProp(props, "line-height", String(value)));
}

// margin 简写解析：返回 [top, right, bottom, left]（px），失败 null
const parseMarginShorthand = (value: string): [number, number, number, number] | null => {
  const parts = value.trim().split(/\s+/).map((p) => {
    const m = p.match(/^(-?\d+(?:\.\d+)?)(px|pt|em|rem|%)?$/i);
    if (!m) return null;
    const num = parseFloat(m[1]);
    const unit = (m[2] ?? "px").toLowerCase();
    return unit === "pt" ? ptToPx(num) : num; // em/rem/% 不精确处理 → null 兜底
  });
  if (parts.some((p) => p === null)) return null;
  if (parts.length === 1) return [parts[0]!, parts[0]!, parts[0]!, parts[0]!];
  if (parts.length === 2) return [parts[0]!, parts[1]!, parts[0]!, parts[1]!];
  if (parts.length === 3) return [parts[0]!, parts[1]!, parts[2]!, parts[1]!];
  if (parts.length === 4) return [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
  return null;
};

const formatMargin = (vals: [number, number, number, number]): string => {
  // 若左右相等，用 3 段；否则 4 段
  if (vals[1] === vals[3]) return `${vals[0]}px ${vals[1]}px ${vals[2]}px`;
  return `${vals[0]}px ${vals[1]}px ${vals[2]}px ${vals[3]}px`;
};

export function applyParagraphSpacing(style: string, side: "top" | "bottom", ptValue: number): string {
  const { props } = parseStyle(style);
  const px = ptToPx(ptValue);

  // 找已有 margin / margin-top / margin-bottom
  const marginIdx = props.findIndex(([k]) => k.toLowerCase() === "margin");
  const sideIdx = props.findIndex(([k]) => k.toLowerCase() === `margin-${side}`);
  const sideKey = `margin-${side}` as const;

  if (marginIdx >= 0) {
    const parsed = parseMarginShorthand(props[marginIdx]![1]);
    if (parsed) {
      const next: [number, number, number, number] = [...parsed];
      if (side === "top") next[0] = px; else next[2] = px;
      const filtered = props.filter((_, i) => i !== marginIdx);
      return serializeStyle(setProp(filtered, sideKey, formatMargin(next).split(" ").slice(side === "top" ? 0 : 2, side === "top" ? 1 : 3).join(" ")));
    }
    // 解析失败：移除 margin 简写，逐项补全
    const filtered = props.filter((_, i) => i !== marginIdx);
    return serializeStyle(setProp(filtered, sideKey, `${px}px`));
  }

  if (sideIdx >= 0) {
    return serializeStyle(setProp(props, sideKey, `${px}px`));
  }

  return serializeStyle(setProp(props, sideKey, `${px}px`));
}

export function readLineHeightFromStyle(style: string): number | "" {
  const m = style.match(/(?:^|;)\s*line-height\s*:\s*([^;]+)/i);
  if (!m) return "";
  const v = m[1]!.trim();
  const n = parseFloat(v);
  return isFinite(n) && n > 0 ? n : "";
}

const readPx = (raw: string): number | null => {
  const m = raw.match(/(-?\d+(?:\.\d+)?)(px|pt)/i);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (m[2]!.toLowerCase() === "pt") return ptToPx(n);
  return n;
};

export function readMarginFromStyle(style: string, side: "top" | "bottom"): number | "" {
  // 优先 margin-<side>，否则 margin 简写
  const direct = style.match(new RegExp(`(?:^|;)\\s*margin-${side}\\s*:\\s*([^;]+)`, "i"));
  if (direct) {
    const px = readPx(direct[1]!);
    return px === null ? "" : pxToPt(px);
  }
  const shorthand = style.match(/(?:^|;)\s*margin\s*:\s*([^;]+)/i);
  if (shorthand) {
    const parsed = parseMarginShorthand(shorthand[1]!);
    if (!parsed) return "";
    const px = side === "top" ? parsed[0] : parsed[2];
    return pxToPt(px);
  }
  return "";
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm tsx src/utils/paragraphSpacing.test.ts
```

期望：全部 PASS。若 margin 合并用例失败，回头检查 `applyParagraphSpacing` 在 `margin: 0 auto` 上的分情况分支。

- [ ] **Step 5: Commit**

```bash
git add src/utils/paragraphSpacing.ts src/utils/paragraphSpacing.test.ts
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "feat: paragraphSpacing 工具 - 段间距预设与 inline style 合并"
```

---

### Task 2: defaultStyle 模块（命名块 parse/serialize/upsert + 属性白名单）

**Files:**
- Create: `src/utils/defaultStyle.ts`
- Create: `src/utils/defaultStyle.test.ts`

**Interfaces (consumed by later tasks):**
- `export type Selector = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"`
- `export type DefaultStyleMap = Partial<Record<Selector, Record<string, string>>>`
- `export const STYLE_BLOCK_ID = "weavepage-default-styles"`
- `export const SUPPORTED_SELECTORS: Selector[]`
- `export const SUPPORTED_PROPS: string[]`  // 8 项白名单
- `export function parseStyleBlock(css: string): DefaultStyleMap`  // 返回 {} 表示解析失败
- `export function serializeStyleBlock(map: DefaultStyleMap): string`
- `export function upsertStyleBlock(currentBlockCss: string, selector: Selector, props: Record<string, string>): string`  // 返回完整 `<style id="...">...</style>` 串
- `export function upsertShellHead(head: string, selector: Selector, props: Record<string, string>): { head: string; headCss: string }`  // 同步 head 和 headCss
- `export function blockTypeToSelector(nodeType: string, attrs?: Record<string, unknown>): Selector | null`  // `"paragraph"` → `p`, `"heading"` + level=2 → `h2`

**约定**：
- 解析粒度：只识别 `<selector> { <prop>: <value>; ... }`（选择器按空白/逗号分割），属性按 `;` 分割，值不去引号
- 序列化：选择器按 `p h1 h2 h3 h4 h5 h6` 固定顺序；属性按白名单顺序；font-family 含空格时加双引号
- 选择器不在白名单 → throw `Error("unsupported selector")`
- 属性不在白名单 → 静默丢弃
- 解析失败 → 返回 `{}`（调用方负责 toast）

- [ ] **Step 1: 写失败测试**

`src/utils/defaultStyle.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseStyleBlock, serializeStyleBlock, upsertStyleBlock, upsertShellHead,
  blockTypeToSelector, SUPPORTED_SELECTORS, SUPPORTED_PROPS, STYLE_BLOCK_ID,
} from "./defaultStyle";

test("parse 空串得空对象", () => {
  assert.deepEqual(parseStyleBlock(""), {});
});

test("parse 单条 p 规则", () => {
  assert.deepEqual(parseStyleBlock("p { font-size: 16pt; line-height: 1.75 }"), {
    p: { "font-size": "16pt", "line-height": "1.75" },
  });
});

test("parse 多条规则按选择器分组", () => {
  const css = "p { font-size: 16pt } h2 { color: #2a4d8f }";
  assert.deepEqual(parseStyleBlock(css), {
    p: { "font-size": "16pt" },
    h2: { color: "#2a4d8f" },
  });
});

test("parse 注释被忽略（不抛错）", () => {
  const css = "/* hi */ p { font-size: 16pt; }";
  assert.deepEqual(parseStyleBlock(css), { p: { "font-size": "16pt" } });
});

test("parse 乱码得空对象", () => {
  assert.deepEqual(parseStyleBlock("@@@{{{"), {});
});

test("serialize 序列化顺序固定", () => {
  const css = serializeStyleBlock({
    h2: { color: "red" },
    p: { "font-size": "16pt", "line-height": "1.75" },
  });
  // p 在前，h2 在后；属性按白名单顺序
  const idxP = css.indexOf("p {");
  const idxH2 = css.indexOf("h2 {");
  assert.ok(idxP < idxH2);
  assert.ok(css.includes("font-size: 16pt"));
});

test("serialize font-family 含空格加引号", () => {
  const css = serializeStyleBlock({ p: { "font-family": "Segoe UI, sans-serif" } });
  assert.match(css, /font-family:\s*"Segoe UI, sans-serif"/);
});

test("upsertStyleBlock 新增属性合并", () => {
  const result = upsertStyleBlock("", "p", { "font-size": "16pt" });
  assert.match(result, new RegExp(`<style id="${STYLE_BLOCK_ID}">`));
  assert.match(result, /p\s*\{\s*font-size:\s*16pt\s*\}/);
});

test("upsertStyleBlock 同名属性后写覆盖", () => {
  const after1 = upsertStyleBlock("", "p", { "font-size": "14pt" });
  const after2 = upsertStyleBlock(after1, "p", { "font-size": "16pt" });
  assert.match(after2, /font-size:\s*16pt/);
  assert.doesNotMatch(after2, /font-size:\s*14pt/);
});

test("upsertStyleBlock 不同属性共存", () => {
  const after1 = upsertStyleBlock("", "p", { "font-size": "16pt" });
  const after2 = upsertStyleBlock(after1, "p", { "line-height": "1.75" });
  assert.match(after2, /font-size:\s*16pt/);
  assert.match(after2, /line-height:\s*1\.75/);
});

test("upsertStyleBlock 不识别选择器抛错", () => {
  assert.throws(() => upsertStyleBlock("", "div" as never, { color: "red" }));
});

test("upsertShellHead 同步 head 与 headCss", () => {
  const head = `<meta charset="UTF-8">`;
  const { head: newHead, headCss } = upsertShellHead(head, "p", { "font-size": "16pt" });
  assert.match(newHead, new RegExp(`<style id="${STYLE_BLOCK_ID}">`));
  assert.match(headCss, /p\s*\{\s*font-size:\s*16pt/);
});

test("upsertShellHead 替换已有命名块", () => {
  const old = `<style id="${STYLE_BLOCK_ID}">p { color: red }</style>`;
  const { head } = upsertShellHead(old, "p", { "font-size": "16pt" });
  assert.equal((head.match(new RegExp(`<style id="${STYLE_BLOCK_ID}">`, "g")) ?? []).length, 1);
  assert.match(head, /font-size:\s*16pt/);
});

test("blockTypeToSelector paragraph→p, heading level N→hN", () => {
  assert.equal(blockTypeToSelector("paragraph"), "p");
  assert.equal(blockTypeToSelector("heading", { level: 2 }), "h2");
  assert.equal(blockTypeToSelector("heading", { level: 6 }), "h6");
  assert.equal(blockTypeToSelector("listItem"), null);
});

test("SUPPORTED_SELECTORS 含 p / h1-h6", () => {
  for (const s of ["p", "h1", "h2", "h3", "h4", "h5", "h6"] as const) {
    assert.ok(SUPPORTED_SELECTORS.includes(s));
  }
});

test("SUPPORTED_PROPS 共 8 项", () => {
  assert.equal(SUPPORTED_PROPS.length, 8);
  for (const p of ["font-family", "font-size", "color", "background-color", "text-align", "line-height", "margin-top", "margin-bottom"]) {
    assert.ok(SUPPORTED_PROPS.includes(p));
  }
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm tsx src/utils/defaultStyle.test.ts
```

期望：FAIL `Cannot find module './defaultStyle'`。

- [ ] **Step 3: 写最小实现**

`src/utils/defaultStyle.ts`：

```ts
export const STYLE_BLOCK_ID = "weavepage-default-styles";

export type Selector = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
export type DefaultStyleMap = Partial<Record<Selector, Record<string, string>>>;

export const SUPPORTED_SELECTORS: Selector[] = ["p", "h1", "h2", "h3", "h4", "h5", "h6"];
export const SUPPORTED_PROPS = [
  "font-family",
  "font-size",
  "color",
  "background-color",
  "text-align",
  "line-height",
  "margin-top",
  "margin-bottom",
] as const;

const SELECTOR_ORDER: Selector[] = ["p", "h1", "h2", "h3", "h4", "h5", "h6"];

const quoteFamily = (v: string): string => {
  if (/[\s,]/.test(v) && !/^["'].*["']$/.test(v.trim())) return `"${v}"`;
  return v;
};

// 解析：拆 /* */ 注释 + 按规则分块
export function parseStyleBlock(css: string): DefaultStyleMap {
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  if (!cleaned) return {};
  const result: DefaultStyleMap = {};
  const ruleRe = /([\w-]+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(cleaned)) !== null) {
    const sel = m[1]!.toLowerCase() as Selector;
    if (!SUPPORTED_SELECTORS.includes(sel)) continue;
    const body = m[2]!;
    const props: Record<string, string> = {};
    body.split(";").forEach((decl) => {
      const idx = decl.indexOf(":");
      if (idx < 0) return;
      const name = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1).trim();
      if (!name || !value) return;
      if (!SUPPORTED_PROPS.includes(name)) return;
      props[name] = value;
    });
    if (Object.keys(props).length > 0) {
      result[sel] = { ...(result[sel] ?? {}), ...props };
    }
  }
  return result;
}

const serializeProps = (props: Record<string, string>): string => {
  const ordered: string[] = [];
  for (const p of SUPPORTED_PROPS) {
    if (props[p] !== undefined) {
      const v = p === "font-family" ? quoteFamily(props[p]!) : props[p]!;
      ordered.push(`${p}: ${v}`);
    }
  }
  // 白名单外属性也保留
  for (const k of Object.keys(props)) {
    if (!SUPPORTED_PROPS.includes(k as never)) ordered.push(`${k}: ${props[k]}`);
  }
  return ordered.join("; ");
};

export function serializeStyleBlock(map: DefaultStyleMap): string {
  const parts: string[] = [];
  for (const sel of SELECTOR_ORDER) {
    const props = map[sel];
    if (props && Object.keys(props).length > 0) {
      parts.push(`${sel} { ${serializeProps(props)} }`);
    }
  }
  // 白名单外的选择器也保留
  for (const k of Object.keys(map) as Selector[]) {
    if (!SELECTOR_ORDER.includes(k)) {
      const props = map[k];
      if (props && Object.keys(props).length > 0) {
        parts.push(`${k} { ${serializeProps(props)} }`);
      }
    }
  }
  return parts.join("\n");
}

export function upsertStyleBlock(currentBlockCss: string, selector: Selector, props: Record<string, string>): string {
  if (!SUPPORTED_SELECTORS.includes(selector)) {
    throw new Error(`unsupported selector: ${selector}`);
  }
  const map = parseStyleBlock(currentBlockCss);
  map[selector] = { ...(map[selector] ?? {}), ...props };
  // 过滤非法属性
  for (const k of Object.keys(map[selector]!)) {
    if (!SUPPORTED_PROPS.includes(k as never)) delete map[selector]![k];
  }
  const css = serializeStyleBlock(map);
  return `<style id="${STYLE_BLOCK_ID}">\n${css}\n</style>`;
}

const BLOCK_RE = new RegExp(`<style id="${STYLE_BLOCK_ID}">[\\s\\S]*?<\\/style>`, "g");

export function upsertShellHead(head: string, selector: Selector, props: Record<string, string>): { head: string; headCss: string } {
  const existing = head.match(BLOCK_RE);
  const currentCss = existing ? existing[0].replace(/<\/?style[^>]*>/g, "") : "";
  const newBlock = upsertStyleBlock(currentCss, selector, props);
  let newHead: string;
  if (existing) {
    newHead = head.replace(BLOCK_RE, newBlock);
  } else {
    newHead = `${head}${newBlock}`;
  }
  // headCss：直接用命名块内部 CSS（scopedCss 在 App.tsx 里包过）
  const headCss = newBlock.replace(/<\/?style[^>]*>/g, "");
  return { head: newHead, headCss };
}

export function blockTypeToSelector(nodeType: string, attrs?: Record<string, unknown>): Selector | null {
  if (nodeType === "paragraph") return "p";
  if (nodeType === "heading") {
    const lvl = Number(attrs?.level);
    if (lvl >= 1 && lvl <= 6) return `h${lvl}` as Selector;
  }
  return null;
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm tsx src/utils/defaultStyle.test.ts
```

期望：全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/utils/defaultStyle.ts src/utils/defaultStyle.test.ts
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "feat: defaultStyle 工具 - 命名块 parse/upsert/同步 shell.head"
```

---

### Task 3: tsx devDep 安装

**Files:**
- Modify: `package.json`（devDependencies 加 `tsx`）
- Modify: `pnpm-lock.yaml`（自动）

- [ ] **Step 1: 安装**

```bash
pnpm add -D tsx
```

期望：`+ tsx` 出现在 `devDependencies`。

- [ ] **Step 2: 验证可执行**

```bash
pnpm tsx --version
```

期望：输出版本号。

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "chore: 添加 devDep tsx 用于 .ts 单元测试"
```

---

### Task 4: EditorContextMenu 组件

**Files:**
- Create: `src/components/EditorContextMenu.tsx`

**Interfaces (consumed by App.tsx):**
- `interface Props { x: number; y: number; blockType: string | null; blockAttrs?: Record<string, unknown>; onBlockSource(): void; onSetAsDefault(): void; onClose(): void }`
- 组件内部：点击其他区域 + ESC 关闭；右键再点不关闭（依赖父组件关闭逻辑）

**约定**：
- 使用 `position: fixed`，样式类 `.context-menu` / `.context-menu-item` / `.context-menu-item[disabled]`
- 「设为默认样式」仅在 `blockTypeToSelector(blockType, blockAttrs) != null` 时启用
- ESC 键监听：`document.addEventListener("keydown", ...)`

- [ ] **Step 1: 写组件**

```tsx
import { useEffect } from "react";
import { blockTypeToSelector } from "../utils/defaultStyle";

interface Props {
  x: number;
  y: number;
  blockType: string | null;
  blockAttrs?: Record<string, unknown>;
  onBlockSource: () => void;
  onSetAsDefault: () => void;
  onClose: () => void;
}

export function EditorContextMenu({ x, y, blockType, blockAttrs, onBlockSource, onSetAsDefault, onClose }: Props) {
  const canSetDefault = blockTypeToSelector(blockType ?? "", blockAttrs) !== null;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".context-menu")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // mousedown 早于 click，且不会和右键冲突
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="context-menu" style={{ left: x, top: y }}>
      <button className="context-menu-item" onClick={onBlockSource}>
        块源码
      </button>
      <button
        className="context-menu-item"
        disabled={!canSetDefault}
        title={canSetDefault ? "" : "仅正文/标题支持设为默认样式"}
        onClick={canSetDefault ? onSetAsDefault : undefined}
      >
        设为默认样式
      </button>
    </div>
  );
}
```

- [ ] **Step 2: CSS 加 .context-menu 样式**

`src/App.css` 末尾追加：

```css
.context-menu {
  position: fixed;
  z-index: 1100;
  background: var(--menu-bg, #fff);
  border: 1px solid var(--menu-border, #ddd);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  padding: 4px 0;
  min-width: 160px;
  font-size: 13px;
}
.context-menu-item {
  display: block;
  width: 100%;
  padding: 6px 12px;
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
}
.context-menu-item:hover:not([disabled]) {
  background: var(--menu-hover, #eef3ff);
}
.context-menu-item[disabled] {
  color: #aaa;
  cursor: not-allowed;
}
```

注意 `var(--menu-bg, #fff)` 这种写法避免硬编码；若 App.css 已有 CSS 变量定义，**优先用变量**（先 `grep -n "menu-bg" src/App.css` 确认；若无则用 fallback 值）。

- [ ] **Step 3: Commit**

```bash
git add src/components/EditorContextMenu.tsx src/App.css
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "feat: EditorContextMenu 右键菜单组件 - 块源码 + 设为默认样式"
```

---

### Task 5: RibbonHome 段落组加 3 个 SelectControl

**Files:**
- Modify: `src/components/RibbonHome.tsx`

**Interfaces (consumed by App.tsx):**
- `interface RibbonHomeProps { editor: Editor; onLink(): void; recentTextColors: string[]; recentHighlightColors: string[]; onColorUsed(kind, color): void; onSpacingChange(spacing: { lineHeight?: number; marginTop?: number; marginBottom?: number }): void }`
- `onSpacingChange` 在用户从 SelectControl 选值时调用；自定义数字也走它
- 内部读 inline style 派生 `fmt.lineHeight` / `fmt.marginTop` / `fmt.marginBottom`（单位 pt）；通过现有 `useEditorState` 加入 selector

- [ ] **Step 1: 加 fmt 派生字段**

在 `selector` 函数内（约 41-69 行），加入：

```ts
const blockEl = (() => {
  try {
    const { from } = editor.state.selection;
    const dom = editor.view.domAtPos(from).node;
    return dom instanceof Element ? dom : (dom.parentElement ?? null);
  } catch { return null; }
})();
const blockStyle = blockEl instanceof HTMLElement ? blockEl.getAttribute("style") ?? "" : "";
return {
  // ... 既有字段
  lineHeight: readLineHeightFromStyle(blockStyle),
  marginTop: readMarginFromStyle(blockStyle, "top"),
  marginBottom: readMarginFromStyle(blockStyle, "bottom"),
};
```

并在文件顶 import：

```ts
import { readLineHeightFromStyle, readMarginFromStyle } from "../utils/paragraphSpacing";
```

- [ ] **Step 2: 加 onSpacingChange prop + 处理函数**

```ts
interface RibbonHomeProps {
  editor: Editor;
  onLink: () => void;
  recentTextColors: string[];
  recentHighlightColors: string[];
  onColorUsed: (kind: "text" | "highlight", color: string) => void;
  onSpacingChange: (spacing: { lineHeight?: number; marginTop?: number; marginBottom?: number }) => void;
}
```

组件内：

```ts
const handleLineHeight = (v: string) => onSpacingChange({ lineHeight: parseFloat(v) || undefined });
const handleMarginTop = (v: string) => onSpacingChange({ marginTop: parseFloat(v) || undefined });
const handleMarginBottom = (v: string) => onSpacingChange({ marginBottom: parseFloat(v) || undefined });
```

- [ ] **Step 3: 段落组末尾追加 3 个 SelectControl**

`ribbon-group` 段落组（约 198-266 行）末尾，`代码块`按钮之后加：

```tsx
<SelectControl
  value={fmt.lineHeight === "" ? "" : String(fmt.lineHeight)}
  onChange={handleLineHeight}
  options={LINE_HEIGHT_OPTIONS}
  title="行距"
/>
<SelectControl
  value={fmt.marginTop === "" ? "" : `${fmt.marginTop}pt`}
  onChange={handleMarginTop}
  options={PARAGRAPH_SPACING_OPTIONS}
  title="段前(pt)"
/>
<SelectControl
  value={fmt.marginBottom === "" ? "" : `${fmt.marginBottom}pt`}
  onChange={handleMarginBottom}
  options={PARAGRAPH_SPACING_OPTIONS}
  title="段后(pt)"
/>
```

并 import：

```ts
import { LINE_HEIGHT_OPTIONS, PARAGRAPH_SPACING_OPTIONS } from "../utils/paragraphSpacing";
```

- [ ] **Step 4: tsc 检查**

```bash
pnpm build
```

期望：0 TS 错误。

- [ ] **Step 5: Commit**

```bash
git add src/components/RibbonHome.tsx
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "feat: Ribbon 段落组增加行距/段前/段后 SelectControl"
```

---

### Task 6: App.tsx 装配（contextMenu + onSpacingChange + 设为默认）

**Files:**
- Modify: `src/App.tsx`

**核心改动**：
1. 加 state `contextMenu: { x, y, blockType, blockAttrs } | null`
2. 重写 `handleEditorContextMenu`：构造 contextMenu 并 `e.preventDefault()`
3. 保留「块源码」功能：contextMenu 里点块源码 → `setBlockPanelPos($pos.before(depth))`
4. 实现 `handleSetAsDefault`：从当前块 DOM 读显式属性 → `upsertShellHead` → `updateActiveDoc({ shell })`
5. 实现 `handleSpacingChange`：对每个选中块调 `applyLineHeight` / `applyParagraphSpacing` 写 inline style
6. 把 contextMenu state + handlers 传给 RibbonHome 和 EditorContextMenu
7. 新增 helper `readBlockExplicitProps(editor)`：返回 `{ prop: value }`

- [ ] **Step 1: 加 imports**

文件顶 import 区（约 33-42 行）加：

```ts
import {
  applyLineHeight, applyParagraphSpacing, ptToPx,
} from "./utils/paragraphSpacing";
import {
  upsertShellHead, SUPPORTED_PROPS, blockTypeToSelector,
} from "./utils/defaultStyle";
import { EditorContextMenu } from "./components/EditorContextMenu";
```

- [ ] **Step 2: 加 helper `readBlockExplicitProps`**

放在 `handleEditorContextMenu` 上方：

```ts
// 从当前块节点读「显式改过」的属性（白名单 8 项）
const readBlockExplicitProps = useCallback((): Record<string, string> => {
  if (!editor) return {};
  try {
    const { from } = editor.state.selection;
    const dom = editor.view.domAtPos(from).node;
    const el = dom instanceof Element ? dom : (dom.parentElement ?? null);
    if (!el || !el.isBlock) return {};
    const props: Record<string, string> = {};

    // textStyle mark 属性
    const ts = editor.getAttributes("textStyle");
    if (ts.fontFamily) props["font-family"] = String(ts.fontFamily);
    if (ts.fontSize) props["font-size"] = String(ts.fontSize);
    if (ts.color) props.color = String(ts.color);

    // highlight
    const hl = editor.getAttributes("highlight");
    if (hl.color) props["background-color"] = String(hl.color);

    // 块 inline style
    const styleStr = el.getAttribute("style") ?? "";
    const get = (name: string) => {
      const m = styleStr.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i"));
      return m ? m[1]!.trim() : null;
    };
    const ta = get("text-align");
    if (ta && ta !== "start" && ta !== "") props["text-align"] = ta;
    const lh = get("line-height");
    if (lh && lh !== "normal" && lh !== "") props["line-height"] = lh;
    const mt = get("margin-top");
    if (mt) props["margin-top"] = mt;
    const mb = get("margin-bottom");
    if (mb) props["margin-bottom"] = mb;

    return props;
  } catch {
    return {};
  }
}, [editor]);
```

- [ ] **Step 3: 加 handlers**

```ts
const handleSetAsDefault = useCallback(() => {
  if (!editor || !shell) return;
  const { state } = editor;
  const { from } = state.selection;
  const dom = editor.view.domAtPos(from).node;
  const el = dom instanceof Element ? dom : (dom.parentElement ?? null);
  if (!el || !el.isBlock) return;
  // 推断节点类型
  const $pos = state.doc.resolve(from);
  let depth = $pos.depth;
  while (depth > 0 && !$pos.node(depth).isBlock) depth--;
  if (depth === 0) return;
  const node = $pos.node(depth);
  const selector = blockTypeToSelector(node.type.name, node.attrs as Record<string, unknown>);
  if (!selector) return;

  const props = readBlockExplicitProps();
  if (Object.keys(props).length === 0) {
    // 没有可写入的属性，弹 toast 或静默
    return;
  }
  const { head, headCss } = upsertShellHead(shell.head, selector, props);
  updateActiveDoc({ shell: { ...shell, head, headCss } });
}, [editor, shell, readBlockExplicitProps, updateActiveDoc]);

const handleSpacingChange = useCallback((s: { lineHeight?: number; marginTop?: number; marginBottom?: number }) => {
  if (!editor) return;
  const { state } = editor;
  const { from, to } = state.selection;
  const chain = editor.chain().focus();
  let touched = false;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isBlock) return;
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    let style = dom.getAttribute("style") ?? "";
    if (s.lineHeight !== undefined) {
      style = applyLineHeight(style, s.lineHeight);
      touched = true;
    }
    if (s.marginTop !== undefined) {
      style = applyParagraphSpacing(style, "top", s.marginTop);
      touched = true;
    }
    if (s.marginBottom !== undefined) {
      style = applyParagraphSpacing(style, "bottom", s.marginBottom);
      touched = true;
    }
    chain.updateAttributes(node.type, {}); // no-op; 我们直接 setAttr
    dom.setAttribute("style", style);
  });
  if (touched) {
    chain.run();
    setIsModified(true);
    updateActiveDoc({ isModified: true });
  }
}, [editor, updateActiveDoc]);
```

> 注：上面 `chain.updateAttributes` 是为了让命令链记录一次 transaction；如果你觉得别扭，可直接 `dom.setAttribute` 后 `editor.view.dispatch(editor.state.tr)` 提交一个空事务触发 onChange。

- [ ] **Step 4: 重写 handleEditorContextMenu**

替换原 811-824 行的函数：

```ts
const [contextMenu, setContextMenu] = useState<{
  x: number; y: number; blockType: string | null; blockAttrs?: Record<string, unknown>; blockPos: number;
} | null>(null);

const handleEditorContextMenu = useCallback((e: React.MouseEvent) => {
  if (!editor || activeDoc.kind !== "html" || mode !== "edit") return;
  const coords = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
  if (coords == null) return;
  const $pos = editor.state.doc.resolve(coords.pos);
  let depth = $pos.depth;
  while (depth > 0 && !$pos.node(depth).isBlock) depth--;
  if (depth === 0) return;
  e.preventDefault();
  const node = $pos.node(depth);
  setContextMenu({
    x: e.clientX,
    y: e.clientY,
    blockType: node.type.name,
    blockAttrs: node.attrs as Record<string, unknown>,
    blockPos: $pos.before(depth),
  });
}, [editor, activeDoc, mode]);
```

并在文件顶 import 加 `useState`（已存在则跳过）。

- [ ] **Step 5: 渲染 contextMenu**

`<BlockSourcePanel>` 渲染处（1028 行附近）之后加：

```tsx
{contextMenu && (
  <EditorContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    blockType={contextMenu.blockType}
    blockAttrs={contextMenu.blockAttrs}
    onBlockSource={() => {
      setBlockPanelPos(contextMenu.blockPos);
      setContextMenu(null);
    }}
    onSetAsDefault={() => {
      handleSetAsDefault();
      setContextMenu(null);
    }}
    onClose={() => setContextMenu(null)}
  />
)}
```

- [ ] **Step 6: RibbonHome 装配新 prop**

找 `<RibbonHome ... />` 调用处（约 996-1005 行附近），加：

```tsx
<RibbonHome
  ...
  onSpacingChange={handleSpacingChange}
/>
```

- [ ] **Step 7: tsc 检查**

```bash
pnpm build
```

期望：0 TS 错误。

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "feat: App 装配 - 段间距回调 + 右键菜单 + 设为默认"
```

---

### Task 7: 版本号 0.1.3 → 0.1.4

**Files:**
- Modify: `package.json:4` `"version": "0.1.3"` → `"0.1.4"`
- Modify: `src-tauri/tauri.conf.json:4` 同上
- Modify: `scripts/copy-release.mjs` 文件名替换

- [ ] **Step 1: 替换 package.json**

```bash
sed -i 's/"version": "0.1.3"/"version": "0.1.4"/' package.json
grep '"version"' package.json
```

期望：`"version": "0.1.4",`

- [ ] **Step 2: 替换 tauri.conf.json**

```bash
sed -i 's/"version": "0.1.3"/"version": "0.1.4"/' src-tauri/tauri.conf.json
grep '"version"' src-tauri/tauri.conf.json
```

期望：`"version": "0.1.4",`

- [ ] **Step 3: 替换 copy-release.mjs**

```bash
sed -i 's/0\.1\.3/0.1.4/g' scripts/copy-release.mjs
grep -E '0\.1\.[34]' scripts/copy-release.mjs
```

期望：仅出现 0.1.4，无 0.1.3。

- [ ] **Step 4: 完整 tsc + 单元测试**

```bash
pnpm build && pnpm tsx src/utils/paragraphSpacing.test.ts && pnpm tsx src/utils/defaultStyle.test.ts
```

期望：build 0 错误，2 个测试全 PASS。

- [ ] **Step 5: Commit**

```bash
git add package.json src-tauri/tauri.conf.json scripts/copy-release.mjs
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "chore: 升版本 0.1.3 → 0.1.4"
```

---

### Task 8: 打包验证（不 commit，等真机验收）

**Files:** 无（产物）

- [ ] **Step 1: tauri build**

```bash
pnpm release
```

期望：`release/WeavePage_0.1.4_x64-setup.exe` + `_x64_en-US.msi` 存在。

- [ ] **Step 2: 记录 SHA256**

```bash
certutil -hashfile release/WeavePage_0.1.4_x64-setup.exe SHA256
certutil -hashfile release/WeavePage_0.1.4_x64_en-US.msi SHA256
```

把两段 SHA256 写到终端输出（人工抄录给用户）。

- [ ] **Step 3: 暂停，等用户真机验收**

不 commit 任何 release 产物。告诉用户：

```
v0.1.4 产物在 release/，SHA256 见上。真机验收清单见 spec §真机验收（11 条）。
若验收通过 → 按规则拆 commit + 上传 aiec.fun。
若验收失败 → systematic-debugging 排查并修代码 → 重跑 pnpm release。
```

---

## Self-Review

**1. Spec coverage**：

| Spec 章节 | 对应 Task |
|---|---|
| §背景 #1 段间距工具栏 | Task 1 + 5 |
| §背景 #2 设为默认 | Task 2 + 6 |
| §决策 CSS 仅内嵌 | Task 2（upsertShellHead） |
| §决策 p/h1-h6 | Task 2（SUPPORTED_SELECTORS）+ Task 6（blockTypeToSelector） |
| §决策 8 项白名单 | Task 2（SUPPORTED_PROPS）+ Task 6（readBlockExplicitProps） |
| §决策 不动行内 | Task 6（handleSetAsDefault 不动 nodesBetween 里的 style） |
| §决策 右键菜单 | Task 4 + 6 |
| §决策 单一命名块 upsert | Task 2（upsertStyleBlock） |
| §数据模型 命名块 | Task 2（STYLE_BLOCK_ID） |
| §算法 1-5 | Task 1（数字）+ Task 2（CSS 算法） |
| §UI Ribbon | Task 5 |
| §UI 右键菜单 | Task 4 |
| §错误处理 8 场景 | Task 2（解析失败返回 {}）+ Task 6（未选块早退） |
| §测试 11 条真机验收 | Task 8（交付给用户跑） |
| §范围外 | 全部不实现 ✓ |

**2. Placeholder scan**：无 TBD/TODO/「类似 Task N」。所有代码块完整。

**3. Type 一致性**：
- `Selector` 在 Task 2 定义，Task 6 复用 ✓
- `SUPPORTED_PROPS` 长度 8 与 spec §3 对齐 ✓
- `blockTypeToSelector` 签名 Task 2 输出，Task 4 + Task 6 调用 ✓
- `upsertShellHead` 返回 `{ head, headCss }`，Task 6 解构使用 ✓
- `applyLineHeight / applyParagraphSpacing` 签名 Task 1 定义，Task 6 调用 ✓
- `readBlockExplicitProps` Task 6 内部 helper，自包含 ✓

**4. 一致性 check**：
- Task 6 `handleSpacingChange` 用 `dom.setAttribute("style", style)` 直接改 DOM 而非 Tiptap 命令 —— 这是已知 trade-off：Tiptap 命令链对 inline style 写入不友好。**接受**（标注在代码块内）
- Task 6 `handleSetAsDefault` 早退条件：no shell / no selector / no props，**与 spec §错误处理对齐**
- Task 4 样式用 `var(--menu-bg, #fff)` 兜底，**优先用 CSS 变量**（注释提醒先 grep）