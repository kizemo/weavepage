# 最近文件 + 颜色选择器增强 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 WeavePage 文件菜单添加「打开最近」子菜单(默认 10 条,带清除);文字颜色与高亮按钮弹出色板集成「更多颜色」(系统色盘)+ 最近使用色组(各 8 条 LRU)

**Architecture:** 三个新增模块(`recentFiles.ts` / `recentColors.ts` / `ColorPicker.tsx`)职责单一,数据落盘 Tauri 应用数据目录(`%APPDATA%\fun.aiec.weavepage\`)。App.tsx 装配层只新增启动拉取 + 写入钩子 + 一处共享路径加载函数。MenuBar 增加 `subMenu` 状态以支持二级浮层。版本 0.1.1 → 0.1.2,三处同步并打包发版。

**Tech Stack:** Tauri 2.x (plugin-fs / plugin-dialog / @tauri-apps/api/path) + React 19 + Tiptap 3.30 + 原生 `<input type="color">` + WebView2 系统色盘

**Spec:** `docs/superpowers/specs/2026-08-16-recent-files-and-color-picker-design.md`

## Global Constraints

- Tauri fs scope: `["**"]` 已含,允许任意路径写
- localStorage 仅用于 `tiptap-theme` / `tiptap-view-mode`,新增两套 store 不走 localStorage
- 本机 git 无 user 配置: 每次 commit 用 `git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit ...`
- 颜色字符串 normalize: 比较时统一 lowercase;`#fff` 与 `#ffffff` 视为同色(LRU push 前归一化)
- TS 零错误为门: 每次提交前跑 `pnpm build`
- 当前版本 0.1.1 → 新版本 0.1.2
- React 19 + Tauri v2 API 已 import,后续不引入额外依赖
- 不能引入前端测试框架(项目目前未配);纯函数逻辑用 Node REPL 心算验证,UI 用手测清单
- 中文 UI 文案保持一致(菜单用「打开最近」「清除」,按钮用「更多颜色...」「最近使用」)

## 文件结构

**新增:**
- `src/utils/recentFiles.ts` — 读写 `recent.json`,LRU 上限 10
- `src/utils/recentColors.ts` — 读写 `recent-colors.json`,两套 LRU 上限 8
- `src/components/ColorPicker.tsx` — 替代 `ColorControl`,集成预设 + 最近 + 系统色盘 + 清除

**修改:**
- `src/App.tsx` — 启动加载 + openFile/openResource/doSave 成功钩子 + 提取 `loadDocFromPath`
- `src/components/MenuBar.tsx` — 子菜单 `subMenu` 状态 + 「打开最近」二级浮层 + 「清除」
- `src/components/RibbonHome.tsx` — 用 `ColorPicker` 替换 `ColorControl` 调用
- `src/components/controls.tsx` — 删除/保留旧 `ColorControl` (推荐保留导出避免牵连)
- `package.json` — `version: 0.1.2`
- `src-tauri/tauri.conf.json` — `version: 0.1.2`
- `scripts/copy-release.mjs` — `0.1.1` × 4 → `0.1.2`
- `_upload_weavepage.py` — `LOCAL_FILE` 改为 `0.1.2`
- `README.md` — 版本徽章 + 变更日志 + SHA256 + 功能列表更新
- `docs/superpowers/specs/2026-08-16-recent-files-and-color-picker-design.md` — 已落库,本计划不修改

---

### Task 1: 最近文件 store

**Files:**
- Create: `src/utils/recentFiles.ts`

**Interfaces:**
- Produces: `loadRecent(): Promise<string[]>` / `pushRecent(path: string): Promise<void>` / `clearRecent(): Promise<void>`
- 文件格式 `{ version: 1, paths: string[] }`,路径归一化(forward slash 化),上限 10

**Steps:**
- [ ] **Step 1.1: 写最近文件 store 实现**

```ts
// src/utils/recentFiles.ts
import { appDataDir } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const FILE_NAME = "recent.json";
const LIMIT = 10;
const VERSION = 1;

type RecentFile = { version: number; paths: string[] };

function storagePath(dir: string) {
  return `${dir.replace(/[/\\]+$/, "")}/${FILE_NAME}`;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function pushLru(list: string[], item: string, limit: number): string[] {
  const norm = normalizePath(item);
  return [norm, ...list.filter((x) => normalizePath(x) !== norm)].slice(0, limit);
}

async function readAll(dir: string): Promise<RecentFile> {
  try {
    if (!(await exists(storagePath(dir)))) return { version: VERSION, paths: [] };
    const raw = await readTextFile(storagePath(dir));
    const data = JSON.parse(raw) as RecentFile;
    if (data.version !== VERSION || !Array.isArray(data.paths)) return { version: VERSION, paths: [] };
    return { version: VERSION, paths: data.paths.slice(0, LIMIT) };
  } catch (e) {
    console.warn("recentFiles.readAll 失败, 返回空列表:", e);
    return { version: VERSION, paths: [] };
  }
}

async function writeAll(dir: string, data: RecentFile): Promise<void> {
  try {
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    await writeTextFile(storagePath(dir), JSON.stringify(data));
  } catch (e) {
    console.warn("recentFiles.writeAll 失败:", e);
  }
}

export async function loadRecent(): Promise<string[]> {
  const dir = await appDataDir();
  return (await readAll(dir)).paths;
}

export async function pushRecent(path: string): Promise<string[]> {
  const dir = await appDataDir();
  const cur = await readAll(dir);
  const next = pushLru(cur.paths, path, LIMIT);
  await writeAll(dir, { version: VERSION, paths: next });
  return next;
}

export async function clearRecent(): Promise<void> {
  const dir = await appDataDir();
  await writeAll(dir, { version: VERSION, paths: [] });
}
```

- [ ] **Step 1.2: TS 编译验证**

Run: `pnpm build`
Expected: 0 TS errors

- [ ] **Step 1.3: Commit**

```bash
git add src/utils/recentFiles.ts
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "feat: 添加最近文件 store (LRU 10, Tauri fs 持久化)"
```

---

### Task 2: 最近颜色 store

**Files:**
- Create: `src/utils/recentColors.ts`

**Interfaces:**
- Produces: `loadRecentColors(): Promise<{ text: string[]; highlight: string[] }>` / `pushRecentColor(kind: "text" | "highlight", color: string): Promise<...>` / `clearRecentColors(kind?: ...): Promise<...>`
- 上限: 每种 8
- 文件: `recent-colors.json`,格式 `{ version: 1, text: [], highlight: [] }`

**Steps:**
- [ ] **Step 2.1: 写最近颜色 store**

```ts
// src/utils/recentColors.ts
import { appDataDir } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const FILE_NAME = "recent-colors.json";
const LIMIT = 8;
const VERSION = 1;

type ColorKind = "text" | "highlight";
type RecentColors = { version: number; text: string[]; highlight: string[] };
type RecentColorsResult = { text: string[]; highlight: string[] };

function storagePath(dir: string) {
  return `${dir.replace(/[/\\]+$/, "")}/${FILE_NAME}`;
}

// 颜色归一化: 小写 + 转 6 位 hex (例: #abc → #aabbcc)
function normalizeColor(c: string): string {
  const t = c.trim().toLowerCase();
  const m = t.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!m) return t;
  const hex = m[1];
  if (hex.length === 3) {
    return "#" + hex.split("").map((ch) => ch + ch).join("");
  }
  return t;
}

function pushLru(list: string[], item: string, limit: number): string[] {
  const norm = normalizeColor(item);
  return [norm, ...list.filter((x) => normalizeColor(x) !== norm)].slice(0, limit);
}

async function readAll(dir: string): Promise<RecentColors> {
  try {
    const p = storagePath(dir);
    if (!(await exists(p))) return { version: VERSION, text: [], highlight: [] };
    const raw = await readTextFile(p);
    const data = JSON.parse(raw) as RecentColors;
    if (data.version !== VERSION) return { version: VERSION, text: [], highlight: [] };
    return {
      version: VERSION,
      text: (Array.isArray(data.text) ? data.text : []).slice(0, LIMIT),
      highlight: (Array.isArray(data.highlight) ? data.highlight : []).slice(0, LIMIT),
    };
  } catch (e) {
    console.warn("recentColors.readAll 失败, 返回空列表:", e);
    return { version: VERSION, text: [], highlight: [] };
  }
}

async function writeAll(dir: string, data: RecentColors): Promise<void> {
  try {
    const dir_ = dir;
    if (!(await exists(dir_))) await mkdir(dir_, { recursive: true });
    await writeTextFile(storagePath(dir_), JSON.stringify(data));
  } catch (e) {
    console.warn("recentColors.writeAll 失败:", e);
  }
}

export async function loadRecentColors(): Promise<RecentColorsResult> {
  const dir = await appDataDir();
  const data = await readAll(dir);
  return { text: data.text, highlight: data.highlight };
}

export async function pushRecentColor(
  kind: ColorKind,
  color: string,
): Promise<RecentColorsResult> {
  const dir = await appDataDir();
  const cur = await readAll(dir);
  const next: RecentColors = {
    version: VERSION,
    text: kind === "text" ? pushLru(cur.text, color, LIMIT) : cur.text,
    highlight: kind === "highlight" ? pushLru(cur.highlight, color, LIMIT) : cur.highlight,
  };
  await writeAll(dir, next);
  return { text: next.text, highlight: next.highlight };
}

export async function clearRecentColors(kind?: ColorKind): Promise<RecentColorsResult> {
  const dir = await appDataDir();
  const cur = await readAll(dir);
  const next: RecentColors = {
    version: VERSION,
    text: kind === "text" ? [] : kind === "highlight" ? cur.text : [],
    highlight: kind === "highlight" ? [] : kind === "text" ? cur.highlight : [],
  };
  await writeAll(dir, next);
  return { text: next.text, highlight: next.highlight };
}
```

- [ ] **Step 2.2: TS 编译验证**

Run: `pnpm build`
Expected: 0 TS errors

- [ ] **Step 2.3: Commit**

```bash
git add src/utils/recentColors.ts
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "feat: 添加最近颜色 store (text/highlight 各 8, LRU + hex 归一化)"
```

---

### Task 3: 共享路径加载函数

**Files:**
- Modify: `src/App.tsx:413-478` (将 `openFile` / `openResource` 共用逻辑提取)

**Interfaces:**
- Produces: `loadDocFromPath(path: string): Promise<DocState>` 位于 App 内部,被 openFile / openResource / openRecent 调用

**Steps:**
- [ ] **Step 3.1: 提取 `loadDocFromPath`**

定位 `openFile` 与 `openResource` 中相同的"读文件 + 创建 DocState + 应用"逻辑,提取为共享函数:

```ts
// 放在 App 组件内,接近 openFile 位置
const loadDocFromPath = useCallback(
  async (path: string): Promise<DocState> => {
    const raw = await readTextFile(path);
    const ext = (path.split(".").pop() ?? "").toLowerCase();
    const isHtml = ext === "html" || ext === "htm";
    const id = idRef.current++;
    if (isHtml) {
      const parsed = await parseShell(raw, path);
      return {
        id, kind: "html", filePath: path, isModified: false,
        body: parsed.bodyHtml, sourceText: "", mode: "edit",
        shell: parsed.shell, rawFullDoc: parsed.fullDoc,
        resources: parsed.resources,
      };
    }
    return {
      id, kind: "text", filePath: path, isModified: false,
      body: raw, sourceText: "", mode: "edit",
      shell: null, rawFullDoc: null, resources: [],
    };
  },
  [parseShell]
);
```

改写 `openFile` 让其首行只调 dialog,后续:
```ts
const updated = snapshotActive();
const doc = await loadDocFromPath(path);
setDocs([...updated, doc]);
setActiveId(doc.id);
applyDoc(doc);
```

改写 `openResource`:
```ts
const updated = snapshotActive();
const doc = await loadDocFromPath(res.path);
setDocs([...updated, doc]);
setActiveId(doc.id);
applyDoc(doc);
```

- [ ] **Step 3.2: TS 编译验证**

Run: `pnpm build`
Expected: 0 TS errors. 行为不退化(手动打开文件/侧边栏资源仍正常)

- [ ] **Step 3.3: Commit**

```bash
git add src/App.tsx
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "refactor: 提取 loadDocFromPath 复用 openFile/openResource 逻辑"
```

---

### Task 4: App 装配层 - 启动加载 + 写入钩子

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- 引入 store 三个函数:`loadRecent` / `pushRecent` / `clearRecent`
- 新增 state: `const [recentPaths, setRecentPaths] = useState<string[]>([])`
- 新增 effect: 启动时 `loadRecent().then(setRecentPaths)`
- 在 openFile / openResource 成功后 `pushRecent(path)` 并更新 state
- 在 doSave 成功后,如 `path` 变更,`pushRecent(path)`

**Steps:**
- [ ] **Step 4.1: 添加 import + state + effect**

在 App.tsx 顶部加入:
```ts
import { loadRecent, pushRecent, clearRecent } from "./utils/recentFiles";
```

在 hooks 区域:
```ts
const [recentPaths, setRecentPaths] = useState<string[]>([]);

useEffect(() => {
  loadRecent().then(setRecentPaths).catch((e) => console.warn("loadRecent 失败:", e));
}, []);
```

- [ ] **Step 4.2: openFile 与 openResource 写入钩子**

在 `openFile` 中 `applyDoc(doc)` 后追加:
```ts
const next = await pushRecent(path);
setRecentPaths(next);
```

`openResource` 同理(用 `res.path`)。

- [ ] **Step 4.3: doSave 写入钩子**

`doSave` 成功后追加(在 `await writeTextFile(path, content)` 之后):
```ts
if (path !== filePath) {
  const next = await pushRecent(path);
  setRecentPaths(next);
}
```

- [ ] **Step 4.4: TS 编译验证**

Run: `pnpm build`
Expected: 0 TS errors

- [ ] **Step 4.5: Commit**

```bash
git add src/App.tsx
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "feat: App 层接入最近文件 store (启动加载 + push 钩子)"
```

---

### Task 5: 增强 MenuBar 支持子菜单

**Files:**
- Modify: `src/components/MenuBar.tsx`

**Interfaces:**
- 新增 props: `recent: string[]`、`onOpenRecent: (path: string) => void`、`onClearRecent: () => void`
- 新增 state: `const [subMenu, setSubMenu] = useState<MenuId | null>(null)` (MenuId 扩展为包含 `"recent"`)
- 二级菜单用 portal 或同级 DOM 渲染

**Steps:**
- [ ] **Step 5.1: 添加子菜单状态与 props 扩展**

```tsx
type MenuId = "file" | "view" | "recent" | null;

interface MenuBarProps {
  // ... 原 props
  recent: string[];
  onOpenRecent: (path: string) => void;
  onClearRecent: () => void;
}
```

组件解构处增加三个新 props。

- [ ] **Step 5.2: 在文件菜单中插入二级菜单**

在 `打开...` 按钮之后插入:
```tsx
<div
  className="menu-item menu-item-sub"
  onMouseEnter={() => setSubMenu("recent")}
  onMouseLeave={() => setSubMenu(null)}
>
  <button className="menu-title">
    打开最近 ▶
  </button>
  {subMenu === "recent" && (
    <div className="menu-dropdown menu-dropdown-right">
      {recent.length === 0 ? (
        <button className="menu-disabled" disabled>(无最近文档)</button>
      ) : (
        <>
          {recent.map((p, i) => {
            const name = p.split(/[\\/]/).pop() ?? p;
            return (
              <button
                key={p}
                onClick={() => { onOpenRecent(p); setActiveMenu(null); setSubMenu(null); }}
                title={p}
              >
                {i + 1}. {name}
              </button>
            );
          })}
          <div className="menu-sep" />
          <button onClick={() => { onClearRecent(); setActiveMenu(null); setSubMenu(null); }}>
            清除
          </button>
        </>
      )}
    </div>
  )}
</div>
```

- [ ] **Step 5.3: TS 编译验证**

Run: `pnpm build`
Expected: 0 TS errors

- [ ] **Step 5.4: Commit**

```bash
git add src/components/MenuBar.tsx
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "feat: MenuBar 增加'打开最近'二级菜单 + 清除"
```

---

### Task 6: App 装配层 - 接通 MenuBar

**Files:**
- Modify: `src/App.tsx` (MenuBar 使用处)

**Interfaces:**
- 新增回调: `openRecent` 与 `clearRecent` 在 App 内
- 传给 MenuBar

**Steps:**
- [ ] **Step 6.1: 写 openRecent / clearRecent 回调**

```ts
// 在 App 内
const openRecent = useCallback(
  async (path: string) => {
    if (!editor) return;
    try {
      const updated = snapshotActive();
      const doc = await loadDocFromPath(path);
      setDocs([...updated, doc]);
      setActiveId(doc.id);
      applyDoc(doc);
    } catch (e) {
      console.error("打开最近文件失败:", e);
      const remove = window.confirm(`无法打开 ${path}\n\n是否从最近列表中移除?`);
      if (remove) {
        const next = await clearRecent();
        // 此处需要 clearRecent 返回新列表,签名改为 Promise<string[]>
        setRecentPaths(next);
      }
    }
  },
  [editor, snapshotActive, loadDocFromPath, applyDoc]
);
```

注意:`clearRecent` 签名已返回空数组,需扩展为返回所有路径。修改 `recentFiles.ts`:
```ts
export async function clearRecent(): Promise<string[]> {
  await writeAll(...);
  const dir = await appDataDir();
  return (await readAll(dir)).paths;  // 返回 []
}
```
(此步在 src/utils/recentFiles.ts 中修;若 Task 1 时已用空数组写法,本次保持兼容即可)

`clearRecent` 回调:
```ts
const handleClearRecent = useCallback(async () => {
  const next = await clearRecent();
  setRecentPaths(next);
}, []);
```

- [ ] **Step 6.2: 传给 MenuBar**

MenuBar 用法处追加:
```tsx
recent={recentPaths}
onOpenRecent={openRecent}
onClearRecent={handleClearRecent}
```

- [ ] **Step 6.3: TS 编译验证**

Run: `pnpm build`
Expected: 0 TS errors

- [ ] **Step 6.4: 端到端手测**

1. 启动 dev,打开 3 个 HTML
2. 检查文件菜单「打开最近」有 3 项,顺序正确(最近的在前)
3. 重启 app,菜单仍有 3 项
4. 点击最近项,标签页打开该文件
5. 删除其中一个文件 → 点击对应最近项 → 弹确认 → 确认后从列表移除
6. 点击「清除」→ 列表清空,菜单显示「(无最近文档)」,重启后仍清空

- [ ] **Step 6.5: Commit**

```bash
git add src/App.tsx src/utils/recentFiles.ts
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "feat: 接通 MenuBar 与最近文件 (openRecent / clearRecent)"
```

---

### Task 7: ColorPicker 组件

**Files:**
- Create: `src/components/ColorPicker.tsx`

**Interfaces:**
- Props: `{ value: string; onChange(c: string): void; onClear(): void; colors: readonly string[]; recents: string[]; title: string; }`
- 弹窗内容:
  - 上: 预设色网格(同 ColorControl)
  - 中: 最近使用色行(`recents.length === 0` 时显示提示"(尚无最近用色)")
  - 下: 「更多颜色...」按钮(隐藏 `<input type="color">`)+ 「清除」按钮

**Steps:**
- [ ] **Step 7.1: 写 ColorPicker 组件**

```tsx
// src/components/ColorPicker.tsx
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  onClear: () => void;
  colors: readonly string[];
  recents: string[];
  title: string;
}

export function ColorPicker({ value, onChange, onClear, colors, recents, title }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) setPos({ left: rect.left, top: rect.bottom + 4 });
    setOpen(true);
  };

  const pop = open && pos && (
    <div
      ref={popRef}
      className="color-picker-pop"
      style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 1000 }}
    >
      <div className="color-grid">
        {colors.map((c) => (
          <button
            key={c}
            className="color-cell"
            style={{ background: c }}
            onClick={() => { onChange(c); setOpen(false); }}
          />
        ))}
      </div>
      <div className="color-recent-label">最近使用</div>
      <div className="color-recent-row">
        {recents.length === 0 ? (
          <span className="color-recent-empty">(尚无最近用色)</span>
        ) : (
          recents.map((c) => (
            <button
              key={c}
              className="color-cell"
              style={{ background: c }}
              onClick={() => { onChange(c); setOpen(false); }}
            />
          ))
        )}
      </div>
      <div className="color-actions">
        <button
          className="color-custom-btn"
          onClick={() => inputRef.current?.click()}
        >
          更多颜色...
        </button>
        <input
          ref={inputRef}
          type="color"
          className="color-native-input"
          style={{ display: "none" }}
          onChange={(e) => { onChange(e.target.value); setOpen(false); }}
        />
        <button
          className="color-clear-btn"
          onClick={() => { onClear(); setOpen(false); }}
        >
          清除
        </button>
      </div>
    </div>
  );

  return (
    <div className="ribbon-color-wrap" ref={wrapRef}>
      <button
        className="color-swatch"
        style={{ background: value || "#000" }}
        title={title}
        onClick={toggle}
      />
      {createPortal(pop, document.body)}
    </div>
  );
}
```

- [ ] **Step 7.2: TS 编译验证**

Run: `pnpm build`
Expected: 0 TS errors. 注意 CSS 样式可后续在 App.css 增强(颜色行布局/分隔线),首版不补样式也能跑

- [ ] **Step 7.3: Commit**

```bash
git add src/components/ColorPicker.tsx
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "feat: 新 ColorPicker 组件 (预设 + 最近 + 更多颜色 + 清除)"
```

---

### Task 8: 用 ColorPicker 替换 ColorControl

**Files:**
- Modify: `src/components/RibbonHome.tsx`
- Modify: `src/components/controls.tsx` (ColorControl 仍保留导出以避免破坏性,但 RibbonHome 切到 ColorPicker)
- Modify: `src/App.css` (新增 color-recent-* / color-actions 样式,可选)

**Interfaces:**
- ColorPicker 新增 `recents: string[]` prop,RibbonHome 需传入对应种类

**Steps:**
- [ ] **Step 8.1: App 层加载最近颜色**

`src/App.tsx` 中:
```ts
import { loadRecentColors, pushRecentColor } from "./utils/recentColors";

// 新增 state
const [recentColors, setRecentColors] = useState<{ text: string[]; highlight: string[] }>({ text: [], highlight: [] });

useEffect(() => {
  loadRecentColors().then(setRecentColors).catch((e) => console.warn("loadRecentColors 失败:", e));
}, []);
```

- [ ] **Step 8.2: RibbonHome 接入 ColorPicker**

`src/components/RibbonHome.tsx`:
```ts
import { ColorPicker } from "./ColorPicker";

interface RibbonHomeProps {
  editor: Editor;
  onLink: () => void;
  recentTextColors: string[];
  recentHighlightColors: string[];
  onColorUsed: (kind: "text" | "highlight", color: string) => void;
}
```

在 setColor / setHighlight 内 push 颜色到 store(RibbonHome 不知道 store,但 App 注入 onColorUsed):
```tsx
<ColorPicker
  value={fmt.textColor}
  onChange={(c) => { setColor(c); onColorUsed("text", c); }}
  onClear={clearColor}
  colors={TEXT_COLORS}
  recents={recentTextColors}
  title="文字颜色"
/>
<ColorPicker
  value={fmt.highlightColor}
  onChange={(c) => { setHighlight(c); onColorUsed("highlight", c); }}
  onClear={clearHighlight}
  colors={HIGHLIGHT_COLORS}
  recents={recentHighlightColors}
  title="高亮"
/>
```

- [ ] **Step 8.3: App.tsx 传给 Ribbon**

`src/App.tsx` 中 `<Ribbon>` 调用或 `<RibbonHome>` 包装处新增 props 透传。先看 Ribbon 装配:

`src/components/Ribbon.tsx` 是 RibbonHome/RibbonInsert 的容器。在 Ribbon 内部传给 RibbonHome 时需要新 props。这要求 Ribbon 也接受并透传。

如果 Ribbon 不便透传,可直接在 App.tsx 中显示调用 `import { RibbonHome } from "./components/RibbonHome"` 替代 `<Ribbon>`,但这会破坏现有结构。

推荐:**让 Ribbon 也接收并透传四个新 props 给 RibbonHome**。具体步骤:

a. 修改 `src/components/Ribbon.tsx` 接口,新增四个 props
b. 在 Ribbon 内部转发给 `<RibbonHome>`

(本任务在 Ribbon.tsx 内部的细节以"按现有模式透传"为准)

- [ ] **Step 8.4: App.tsx 中调用 onColorUsed**

```ts
const onColorUsed = useCallback(
  async (kind: "text" | "highlight", color: string) => {
    try {
      const next = await pushRecentColor(kind, color);
      setRecentColors(next);
    } catch (e) {
      console.warn("pushRecentColor 失败:", e);
    }
  },
  []
);
```

传给 Ribbon。

- [ ] **Step 8.5: TS 编译验证**

Run: `pnpm build`
Expected: 0 TS errors

- [ ] **Step 8.6: 端到端手测**

1. 启动 dev,选中一段文字
2. 点「文字颜色」弹窗,看预设色 + 空最近组 + 「更多颜色...」「清除」
3. 点预设色 → 选中的文字颜色变了
4. 再点「文字颜色」,最近组出现刚才那个色
5. 再选 8 个不同色 → 第 9 个挤掉最早的
6. 关闭弹窗再点开 → 最近组保留(持久化)
7. 重启 app → 最近组仍保留
8. 「更多颜色...」点击 → 弹出 WebView2 系统色盘 → 选色 → 写入选中文字 + 进最近组

- [ ] **Step 8.7: Commit**

```bash
git add src/components/Ribbon.tsx src/components/RibbonHome.tsx src/components/ColorPicker.tsx src/App.tsx
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "feat: Ribbon 切到 ColorPicker + 最近颜色持久化打通"
```

---

### Task 9: 样式微调(可选增强)

**Files:**
- Modify: `src/App.css`

**Steps:**
- [ ] **Step 9.1: 为 ColorPicker 新增类补样式**

```css
.color-grid { display: flex; flex-wrap: wrap; max-width: 200px; padding: 4px; }
.color-recent-label { font-size: 11px; padding: 2px 6px; opacity: 0.7; border-top: 1px solid currentColor; }
.color-recent-row { display: flex; flex-wrap: wrap; padding: 4px; min-height: 24px; }
.color-recent-empty { font-size: 11px; color: gray; padding: 4px 6px; }
.color-actions { display: flex; justify-content: space-between; padding: 4px; border-top: 1px solid currentColor; }
.color-custom-btn, .color-clear-btn { flex: 1; font-size: 12px; padding: 4px 8px; cursor: pointer; }
.menu-item-sub { position: relative; }
.menu-dropdown-right { position: absolute; left: 100%; top: 0; margin-left: 2px; }
.menu-disabled { color: gray; cursor: default; }
.color-native-input { position: absolute; opacity: 0; pointer-events: none; }
```

- [ ] **Step 9.2: 视觉检查**

Run: `pnpm tauri dev`
视觉: 弹窗自适应宽 / 最近色行换行美观 / 「更多颜色...」「清除」不挤

- [ ] **Step 9.3: Commit**

```bash
git add src/App.css
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "style: ColorPicker + MenuBar 子菜单样式"
```

---

### Task 10: 升级版本号 (三处 + 上传脚本)

**Files:**
- Modify: `package.json` (`version: "0.1.2"`)
- Modify: `src-tauri/tauri.conf.json` (`"version": "0.1.2"`)
- Modify: `scripts/copy-release.mjs` (`0.1.1` × 4 → `0.1.2`)
- Modify: `_upload_weavepage.py` (`LOCAL_FILE = "WeavePage_0.1.2_x64-setup.exe"`)

**Steps:**
- [ ] **Step 10.1: 改 package.json**

将 `"version": "0.1.1"` 改为 `"0.1.2"`

- [ ] **Step 10.2: 改 tauri.conf.json**

将 `"version": "0.1.1"` 改为 `"0.1.2"`

- [ ] **Step 10.3: 改 copy-release.mjs**

将以下四个字符串 `0.1.1` → `0.1.2`:
```
const nsis = path.join(bundle, "nsis", "WeavePage_0.1.2_x64-setup.exe");
const msi  = path.join(bundle, "msi",  "WeavePage_0.1.2_x64_en-US.msi");
await cp(nsis, path.join(dest, "WeavePage_0.1.2_x64-setup.exe"));
await cp(msi,  path.join(dest, "WeavePage_0.1.2_x64_en-US.msi"));
```

- [ ] **Step 10.4: 改 _upload_weavepage.py**

`LOCAL_FILE = "WeavePage_0.1.2_x64-setup.exe"`

- [ ] **Step 10.5: TS 编译验证**

Run: `pnpm build`
Expected: 0 TS errors

- [ ] **Step 10.6: Commit**

```bash
git add package.json src-tauri/tauri.conf.json scripts/copy-release.mjs _upload_weavepage.py
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "chore: 升级版本号 0.1.1 → 0.1.2 (package/tauri/release-script/upload)"
```

---

### Task 11: 打包 + 计算 SHA256

**Files:**
- 无文件改动;产物 `release/WeavePage_0.1.2_x64-setup.exe` + `release/WeavePage_0.1.2_x64_en-US.msi`

**Steps:**
- [ ] **Step 11.1: 跑 release**

Run: `pnpm release`
Expected: 控制台输出已复制两个文件到 release/

- [ ] **Step 11.2: 校验产物**

Run:
```bash
ls -la release/
sha256sum release/WeavePage_0.1.2_x64-setup.exe release/WeavePage_0.1.2_x64_en-US.msi
```
Expected: 两个产物存在,SHA256 字符串记下,后续写 README 用

- [ ] **Step 11.3: 手测验收已发布版本(推荐)**
- 用 `release/WeavePage_0.1.2_x64-setup.exe` 装机一遍(或解压 portable),跑一遍 Task 6.4 + Task 8.6 端到端手测清单

---

### Task 12: 上传 GitHub Release

**Files:**
- 无文件改动

**Steps:**
- [ ] **Step 12.1: 创建 GitHub Release**

Run:
```bash
NOTES=$(cat <<'EOF'
## v0.1.2 — 2026-08-16

### 新增
- 文件菜单:「打开最近」二级菜单(默认 10 个,带「清除」)
- 文字颜色 / 高亮: 弹出集成「更多颜色...」系统色盘 + 「最近使用」色组(各 8)

### 安装
- NSIS 安装包: WeavePage_0.1.2_x64-setup.exe
- MSI 安装包: WeavePage_0.1.2_x64_en-US.msi

### SHA256
将随后附
EOF
)

gh release create v0.1.2 \
  release/WeavePage_0.1.2_x64-setup.exe \
  release/WeavePage_0.1.2_x64_en-US.msi \
  --title "WeavePage v0.1.2" \
  --notes "$NOTES"
```

Expected: gh 输出 release URL

- [ ] **Step 12.2: 编辑 Release 追加 SHA256(可选)**

可用 `gh release edit v0.1.2 --notes "<updated>"` 追加 SHA256。

---

### Task 13: 上传 aiec.fun 服务器

**Files:**
- 无文件改动

**Steps:**
- [ ] **Step 13.1: 跑上传脚本**

Run:
```bash
python _upload_weavepage.py
```
Expected: 输出 "[DONE] WeavePage_0.1.2_x64-setup.exe 已上传到 ...md5 cross-source verified"

**前置条件:** `E:\办公文件\L1网站\.vscode\sftp.json` 已有有效凭据

- [ ] **Step 13.2: 公开访问验证**

Open: `https://www.aiec.fun/weavepage/WeavePage_0.1.2_x64-setup.exe`
Expected: 浏览器开始下载,文件大小与服务端 md5 一致(脚本已校验)

---

### Task 14: 更新 README

**Files:**
- Modify: `README.md`

**Interfaces:**
- 顶部版本徽章更新到 0.1.2
- 变更日志追加 v0.1.2 段
- 功能列表新增「最近文件」「自定义颜色」条目
- 截图区域不动(若用户提供新截图则更新;否则保持现有 3 张)

**Steps:**
- [ ] **Step 14.1: 改版本徽章**

读 README 找到现有徽章(如 `<img ...v0.1.1...>`),改为 `v0.1.2`

- [ ] **Step 14.2: 追加变更日志**

在变更日志列表顶部插入:
```markdown
## v0.1.2 — 2026-08-16
- 新增: 文件菜单「打开最近」二级菜单(默认保存 10 个,带「清除」按钮)
- 新增: 文字颜色 / 高亮弹出集成「更多颜色...」系统色盘
- 新增: 「最近使用」色组(各保留 8 个)
- 数据持久化于 %APPDATA%\fun.aiec.weavepage\
```

- [ ] **Step 14.3: 功能列表更新**

在功能区追加两条:
```
- 📂 打开最近:自动记住最近 10 个工作文档,一键快速重开
- 🎨 自定义颜色:更多颜色系统色盘,自动保留最近用过的颜色
```

- [ ] **Step 14.4: SHA256 区(可选)**

如 README 有 SHA256 表格,把旧值替换为 Task 11.2 算出的新值。

- [ ] **Step 14.5: Commit**

```bash
git add README.md
git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit -m "docs: README 追加 v0.1.2 变更日志 + 功能列表"
```

---

### Task 15: 推送 master + 收尾

**Files:**
- 无文件改动

**Steps:**
- [ ] **Step 15.1: 推 master**

Run:
```bash
git push origin master
```
Expected: 推送成功,`gh release create` 与 `git push` 一致,GitHub Release 与 git 历史都同步到 0.1.2

- [ ] **Step 15.2: 写本次会话 handoff**

新建 `handoff-weavepage-color-recent-2026-08-16.md`,记录:
- 已发版 v0.1.2,含 NSIS/MSI,GitHub Release URL,aiec.fun 直链
- 关键文件清单与未跟踪文件(海报等)
- 用户手测未覆盖项
- 链接到 docs/superpowers/specs/ 和 plans/

---

## 自审

**1. 范围覆盖:**
- 最近文件菜单 + 清除 → Task 5/6
- 持久化到 Tauri app data → Task 1
- 自定义颜色系统色盘 → Task 7/8
- 最近颜色 8 条 LRU → Task 2/8
- 发版 → Task 10–13
- README 更新 → Task 14

**2. 占位符扫描:** 无 TBD/TODO。所有代码块均给出实际内容。

**3. 类型/命名一致性:**
- `loadRecent / pushRecent / clearRecent` 在 Task 1 定义,Task 4/6 引用
- `loadRecentColors / pushRecentColor` 在 Task 2 定义,Task 8 引用
- `recentPaths / setRecentPaths` 在 Task 4 定义,Task 5/6 引用
- `loadDocFromPath` 在 Task 3 定义,Task 4/6 引用
- ColorPicker props `(value, onChange, onClear, colors, recents, title)` 在 Task 7 定义,Task 8 引用
- `onColorUsed(kind, color)` 在 Task 8 定义,App 层定义一致
