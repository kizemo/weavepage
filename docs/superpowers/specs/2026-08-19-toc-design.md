# WeavePage TOC(目录)功能 设计 spec

> **日期**:2026-08-19
> **状态**:已获用户批准(澄清会 4 决定已锁定:写入文档 / 离焦重生成 / 悬浮独立 / iframe 内独立渲染)
> **项目**:`F:\soft\00selfmade\tiptap_app`(Tauri 2 + React + Vite,Windows 桌面 WYSIWYG HTML 编辑器)
> **目标版本**:v0.1.12(下一发版;本次实现后即纳入)

## 1. 目标

让 WeavePage 用户能:
1. 在「插入」功能区点一次「📑 目录」,自动扫描当前文档中所有 `<h2>` / `<h3>` 标题
2. 自动给每个标题写一个 `id="wp-toc-<slug>"` 锚点
3. 在文档开头插入一个 `<nav class="doc-toc">`,列出所有 h2/h3 层级
4. 在页面右上角常驻一个「📑」悬浮按钮,hover 展开导航面板
5. 鼠标悬停某个 h2 时,若有 h3 子标题,向左弹出 h3 子菜单
6. 点击任一目录项 → 平滑滚动到对应标题位置
7. 编辑模式下 + 网页预览(iframe)模式下都要可见可用
8. 用户编辑/删除/重命名标题后,**离开光标**时自动重生成目录

## 2. 设计决定(澄清会产出)

| # | 问题 | 决定 |
|---|---|---|
| Q1 | 目录按钮生命周期 | **写入文档 + 右上角常驻悬浮**(点「📑 目录」即同时启用:文档首插入 TOC + 启用悬浮按钮) |
| Q2 | 标题变化后目录刷新 | **离开光标后自动重生成**(400ms debounce + selection 离开标题节点立即 flush) |
| Q3 | 目录在文档中的位置 | **插入文档开头 + 悬浮独立导航按钮**(两者内容实时一致;文档首目录 visible,悬浮按钮 quick-nav) |
| Q4 | 预览 iframe 内悬浮目录实现 | **iframe 内独立渲染**(扫描 iframe 内 DOM,样式注入 `<head>`,与编辑模式独立) |

## 3. 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│  App.tsx                                                          │
│  state: tocEnabled(per-doc) / tocVersion / tocEntries            │
│                                                                  │
│  ├─ RibbonInsert  ──+ 「📑 目录」按钮(启用/禁用切换)              │
│  │                   │ (文本 doc + source 模式禁用)              │
│  │                   ▼                                           │
│  │             insertDocToc(editor) 一次性                         │
│  │             setAttrs.id 写锚点                                │
│  │             setState(tocEnabled = true)                       │
│  │                   │                                           │
│  │  on editor transaction ──► scheduleRegen(editor) 离焦 debounce │
│  │                   │                                           │
│  ├─ 编辑模式 editor-scroll 容器                                     │
│  │    ├─ <nav class="doc-toc" contenteditable="false">           │
│  │    ├─ <h2 id="wp-toc-..."> / <h3 id="wp-toc-..."> 正文       │
│  │    └─ portal → body 顶层 <TocFloating/> 悬浮组件              │
│  │                                                                  │
│  └─ 预览模式 iframe srcDoc                                        │
│       ├─ <head> 注入 wp-toc.css(类名前缀 doc-toc / wp-toc-)       │
│       ├─ <body> 已有 <nav class="doc-toc">(由 buildFullDoc 写入)   │
│       ├─ <body> 注入 <script id="wp-toc-floating">…</script>     │
│       └─ 悬浮 DOM 由脚本自渲染,锚点跳转原生生效                     │
└──────────────────────────────────────────────────────────────────┘
```

**新文件清单**:
- `src/utils/tocGen.ts` — slug 生成 + DOM 扫描 + 重生成核心
- `src/components/TocFloating.tsx` — 编辑模式悬浮 React 组件
- `src/utils/tocStyles.ts` — 注入到 iframe 的 CSS 字符串常量
- `src/utils/tocFloatingScript.ts` — 注入到 iframe 的悬浮 JS 字符串

**修改文件清单**:
- `src/components/RibbonInsert.tsx` — 新增「📑 目录」按钮组 + 状态
- `src/App.tsx` — DocState 扩展 + 调度 regen + 预览 srcDoc 注入
- `src/components/TabBar.tsx` — DocState 字段兼容
- `src/App.css` — `.doc-toc*` / `.wp-toc-floating*` 样式

## 4. 数据模型

```ts
// DocState 扩展(tocEnabled 持久化)
interface DocState {
  // ... 现有字段
  tocEnabled: boolean;  // 默认 false;点「📑 目录」后 true
}

// TocEntry:用于渲染面板(悬浮组件) + 文档内 nav
interface TocEntry {
  level: 2 | 3;        // 只支持 h2 / h3
  text: string;         // textContent(trim)
  id: string;           // "wp-toc-<slug>"(已经写入 heading 节点的 id)
}

// 内存缓存(App 层)
const tocEntriesCache = useRef<Map<number /* docId */, TocEntry[]>>(new Map());
```

## 5. 核心模块:src/utils/tocGen.ts

### 5.1 slug 生成

```ts
// 标题 → slug
// 规则:转小写 → 去非 Unicode 字母/数字/空白/- 的字符 → 空白转 - → 去首尾 - → 截断 60 字符
// 若最终为空字符串,fallback 到 `n{index}`
// 重复时加后缀 -2 / -3…
function slugify(text: string, index: number): string { … }
function uniqueSlug(base: string, existing: Set<string>): string { … }
```

### 5.2 DOM 扫描

```ts
// 扫描编辑器 DOM 中的 h2 / h3(以 .editor-body 为根)
// 返回 TocEntry[],顺序 = 文档顺序
function scanHeadings(editor: Editor): TocEntry[]
```

**实现**:遍历 `editor.view.dom.querySelectorAll('h2, h3')`,过滤:
- `level` 仅 2 / 3
- `textContent.trim() !== ''`(空标题不计入)
- 取 `el.id`(若已分配则使用,否则在写入时分配)

### 5.3 锚点写入

```ts
// 给每个标题节点的 attrs 写 id(若无变化则不动,避免 transaction 噪声)
function assignHeadingIds(editor: Editor, entries: TocEntry[]): void
```

**实现**:用 `editor.commands.command(({tr}) => {...})`,遍历 heading 节点,根据其 textContent 计算 slug(并 dedup),设 `tr.setNodeMarkup(pos, undefined, {...attrs, id})`。

### 5.4 文档内 nav HTML 生成

```ts
function buildDocTocHtml(entries: TocEntry[]): string
// 返回 <nav class="doc-toc" contenteditable="false">…</nav>
// 内部为嵌套 <ul>,h2 直接子 <li>,h3 嵌套在 h2 的 <ul>
// 文本 <a href="#{id}" class="doc-toc-h2|doc-toc-h3">{text}</a>
```

**特别注意**:`contenteditable="false"` 让 ProseMirror 不接管目录节点(避免光标停在里面或用户误编辑)。

### 5.5 重生成

```ts
// 全流程:扫描 → 写锚点 → 重建文档内 nav(替换旧的,位置=正文第一个块之前)
function regenDocToc(editor: Editor): TocEntry[]

// 仅扫描 + 返回(用于悬浮组件实时跟随,不写文档,避免重写 nav 引起光标跳动)
function scanTocEntries(editor: Editor): TocEntry[]
```

**`scanTocEntries` 的使用**:悬浮组件用 `useEditorState` 监听 editor.onUpdate/onSelectionUpdate,每 400ms 内最后一次调用,直接 scan DOM,渲染面板。**不写文档**。
**`regenDocToc` 的使用**:用于"离焦重生成"——保存时/切换文档时/关闭文档前。

### 5.6 一次性启用

```ts
// 用户点「📑 目录」:扫描 → 写锚点 → 插入 nav → 启用悬浮
function enableDocToc(editor: Editor): void
```

## 6. App.tsx 调度

### 6.1 状态

```ts
// 现有:mode / editor / docs / activeId
// 新增:
const tocEnabledRef = useRef<Map<number, boolean>>(new Map());  // docId → enabled
// 也可在 DocState 加 tocEnabled 字段(更持久)
const [tocEntries, setTocEntries] = useState<TocEntry[]>([]);   // 当前 doc 的条目
```

**决策**:`tocEnabled` 加到 DocState(更直接),`tocEntries` 留在 App 状态。

### 6.2 调度 regen

```ts
// editor.on('transaction', ({editor, transaction}) => {
//   if (transaction.docChanged && transaction.getMeta('tocRegenPending')) {
//     scheduleRegen();  // debounce 400ms
//   }
// });
//
// editor.on('selectionUpdate', () => {
//   flushRegen();  // 立即执行 pending 的 regen
// });
```

**触发条件**:
- `transaction.docChanged` → 设 `tocRegenPending` meta
- `selectionUpdate` → 立即 flush
- 计时器 400ms 内无新 transaction → flush
- `onBlur` → 立即 flush
- `mode === 'preview'` → 立即 flush(让 iframe 看到最新)

### 6.3 RibbonInsert 「📑 目录」按钮

```tsx
<RibbonButton
  icon="📑"
  label={tocEnabled ? "移除目录" : "目录"}
  active={tocEnabled}
  onClick={tocEnabled ? disableDocToc : enableDocToc}
  disabled={isTextDoc || mode !== 'edit'}  // 文本 doc 完全禁用;source 模式禁用
  title={tocEnabled
    ? "点击移除文档首插入的目录和锚点"
    : "扫描 h2/h3 标题,生成目录并添加锚点"}
/>
```

**`disableDocToc`**:删除 `<nav class="doc-toc">` + 清空所有 heading 的 `id` 属性。

### 6.4 预览 srcDoc 注入

`buildFullDoc` 后,在 `</body>` 前注入:

```ts
const TOC_PREVIEW_INJECT = `
${tocStyles}              /* <style> with .doc-toc / .wp-toc-floating 前缀 */
<script id="wp-toc-floating">${tocFloatingScript}</script>
`;
```

注入位置:`{sh.scripts}` 之前(避免被用户的脚本提前清掉)。

### 6.5 预览 iframe 中的悬浮 JS

`src/utils/tocFloatingScript.ts` 导出字符串,内容大致:

```js
(function(){
  if (window.__wpTocInited) return; window.__wpTocInited = true;
  // 1. 创建 <button class="wp-toc-floating">📑</button>
  // 2. 创建 <div class="wp-toc-floating-panel">…</div>
  // 3. 扫描 document.querySelectorAll('h2, h3'),渲染嵌套 ul
  // 4. hover 按钮 200ms 展开面板;hover 项 → 左弹 h3 子菜单
  // 5. 点击项 → document.getElementById(id).scrollIntoView({behavior:'smooth'})
  // 6. IntersectionObserver 监听当前可见 h2/h3,加 .is-current 类
})();
```

**关键**:脚本自包含,不依赖外部 React/react-dom;用纯 DOM API。

## 7. TocFloating 组件(编辑模式)

```tsx
interface TocFloatingProps {
  editor: Editor;
  entries: TocEntry[];      // 由 App.tsx 传入(由 scanTocEntries 实时算)
  enabled: boolean;
}

// 行为:
// - enabled=false:返回 null
// - enabled=true:portal 到 body
//   ├─ button.wp-toc-floating(右上角 fixed)
//   └─ div.wp-toc-floating-panel(展开)
//     ├─ ul/li(嵌套),h2 项若含 h3 子 → hover 弹子菜单
//     └─ click → editor.commands.focus() + 原生 scrollIntoView
```

**滚动到目标**:不通过 ProseMirror 命令(避免重排),直接用 `el.scrollIntoView({behavior:'smooth', block:'start'})` + `setTimeout(()=>editor.commands.focus(), 200)`。

**当前标题高亮**:用 IntersectionObserver 监听所有 h2/h3,根 = `.editor-scroll`,阈值 [0, 1]。

## 8. CSS 样式

```css
/* 文档内目录(可见,默认展开) */
.doc-toc { margin: 0 0 1.5em; padding: 1em 1.2em; background: var(--bg-soft); border-radius: 6px; }
.doc-toc-title { font-weight: 600; margin-bottom: .6em; color: var(--text-2); }
.doc-toc-list, .doc-toc-list ul { list-style: none; padding-left: 0; margin: 0; }
.doc-toc-list ul { padding-left: 1.2em; margin-top: .2em; }
.doc-toc-h2 { display:block; padding: .15em 0; color: var(--link); text-decoration:none; }
.doc-toc-h3 { display:block; padding: .1em 0; color: var(--text-2); font-size:.92em; text-decoration:none; }
.doc-toc-h2:hover, .doc-toc-h3:hover { text-decoration: underline; }

/* 编辑模式悬浮按钮 */
.wp-toc-floating {
  position: fixed; top: 80px; right: 24px; z-index: 900;
  width: 40px; height: 40px; border-radius: 50%;
  background: var(--bg-2); box-shadow: 0 2px 8px rgba(0,0,0,.15);
  border: 1px solid var(--border);
  display:flex; align-items:center; justify-content:center;
  font-size: 18px; cursor: pointer;
}
.wp-toc-floating-panel {
  position: fixed; top: 80px; right: 72px; z-index: 901;
  min-width: 220px; max-width: 320px; max-height: 60vh; overflow-y: auto;
  background: var(--bg-1); border: 1px solid var(--border); border-radius: 6px;
  padding: .6em .8em; box-shadow: 0 4px 16px rgba(0,0,0,.18);
}
.wp-toc-floating-panel .doc-toc-list ul { padding-left: 1em; }
.wp-toc-floating-item { position: relative; }
.wp-toc-floating-submenu {
  position: absolute; top: 0; right: 100%; margin-right: 8px;
  min-width: 180px; background: var(--bg-1); border: 1px solid var(--border);
  border-radius: 6px; padding: .4em .6em; box-shadow: 0 4px 12px rgba(0,0,0,.15);
}
```

**变量约定**:`var(--bg-2)` 等使用项目已有 CSS 变量,与现有 App.css 风格一致。

## 9. 锚点 slug 算法

```ts
function slugify(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')   // 去标点,保留 Unicode 字母数字
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || `n${index}`;
}

function uniqueSlug(base: string, taken: Set<string>): string {
  let s = base;
  let n = 2;
  while (taken.has(s)) { s = `${base}-${n++}`; }
  taken.add(s);
  return s;
}

// id 前缀:wp-toc-<slug>
```

**dedup 范围**:一次 regen 内的所有标题(textContent 完全相同的标题会有不同 slug,通过 -2/-3 区分)。

## 10. 错误处理 + 边界

| 场景 | 行为 |
|---|---|
| 文档无任何 h2/h3 | 提示「未找到任何标题」,RibbonInsert 按钮 tooltip 提示,且**不**插入空 nav(避免空白) |
| 标题 textContent 全空(只剩 markup) | 跳过,不计入目录 |
| 标题 slug 全为空字符 | fallback `wp-toc-n1` |
| 重复标题文本 | 自动加 -2/-3 后缀 |
| 用户在 `<nav class="doc-toc">` 内尝试编辑 | `contenteditable=false` 阻止光标进入(ProseMirror 自动跳过) |
| 删除标题 | regen 时扫描 DOM,旧锚点自动消失 |
| 切换文档 | 当前 doc 状态写入 DocState(含 tocEnabled/tocVersion);新 doc 重新挂载 TocFloating |
| 文本 doc(`kind==='text'`) | 完全禁用 TOC 功能(RibbonInsert 按钮 disabled,tooltip "纯文本文档不支持目录") |
| 源码 mode | RibbonInsert 按钮 disabled;不展示悬浮按钮 |
| 预览模式 | 不渲染 React 悬浮按钮;iframe 内由注入脚本渲染 |
| 用户清空文档(全删) | regen 检测到 0 个标题 → 删除 `<nav class="doc-toc">` |
| 标题节点被嵌套(如 h2 内含 h3 mark) | 扫描时只取 block-level heading,不会被嵌套 |

## 11. DocState 字段变更

```ts
// 当前(摘录):
interface DocState {
  id: number; kind: "html" | "text"; filePath: string | null;
  isModified: boolean;
  body: string; sourceText: string; mode: EditMode;
  shell: DocShell | null; rawFullDoc: string | null;
  resources: ResourceRef[];
}

// 新增:
interface DocState {
  // ... 现有字段
  tocEnabled?: boolean;   // 默认 undefined(视为 false);持久化到内存,不写盘(打开文档时按 body 中是否有 .doc-toc 决定)
}
```

**打开已有 HTML 时的 tocEnabled 推断**:解析 body 时检测是否已有 `<nav class="doc-toc">`,若有则 `tocEnabled=true`(用户曾经点过「📑 目录」)。

## 12. 测试要点(手测 / E2E)

手测用例(开发自测):
1. **新建空白文档** → 点「📑 目录」→ ribbon 按钮变 active → 文档首插入空 nav(因无标题)→ 浮动按钮出现但面板显示「无标题」
2. **新建空白文档** → 输入 h2「第一节」+ h3「1.1 子节」+ h2「第二节」+ h3「2.1 子节」+ h3「2.2 子节」 → 点「📑 目录」 → 文档首插入 nav(2 个 h2,3 个 h3,1.1 嵌在第一节下)
3. **每个标题 DOM 上有 `id="wp-toc-..."`** → 点击 nav 中「第一节」→ 滚动到「第一节」标题位置
4. **悬浮按钮 hover** → 展开面板;hover「第二节」→ 左侧弹出子菜单(2.1/2.2)
5. **修改「第一节」→「第一节改」** → 光标离开标题 → 目录 nav 内「第一节」自动更新为「第一节改」(验证 regen)
6. **删除 h2「第一节」** → regen → 文档首 nav 中移除该项 + 标题节点 `id` 被清空
7. **添加重复标题「第一节」「第一节」** → 两条都有 `id`,一个 `-1` 一个 `-2`
8. **切换到源码模式** → ribbon「📑 目录」按钮 disabled
9. **切换到网页预览(F5)** → iframe 内可见文档首 nav + iframe 右上角可见浮动按钮(由注入脚本渲染) → 在 iframe 内点击 nav 项跳转
10. **切换 tab/文档** → 当前 doc 的 tocEnabled 保留
11. **保存后重开文件** → 已存在的 `<nav class="doc-toc">` → tocEnabled 自动推断为 true → 浮动按钮自动出现
12. **「移除目录」** → 文档首 nav 删除 + 所有 heading `id` 清空 + 浮动按钮消失

## 13. 不在本次范围

- 目录的拖拽排序、用户自定义
- 多级目录(h4/h5/h6)
- 目录导出 / 复制
- 目录样式的用户定制
- 自动滚动跟随(只在点击时跳)

## 14. 发布路径

1. 实现完成后 `pnpm tauri build`(两个渠道)
2. 内部冒烟:打开示例 HTML → 启 TOC → 跳各项 → 离焦 regen → 保存 → 重开 → TOC 自动启用 → 上传 _upload_weavepage.py → 升级 patch 版本号到 v0.1.12 → release notes 写「新增:文档目录(TOC)」
3. 真机验证(sandbox-verify weavepage;按用户偏好:不上传前不 commit)