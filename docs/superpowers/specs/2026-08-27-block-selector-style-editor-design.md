# WeavePage 可视块选择 + 容器样式编辑 + 关闭未保存弹窗 设计 spec

> **日期**:2026-08-27
> **状态**:已获用户批准(澄清会结论 — 见 §3)
> **项目**:`F:\soft\00selfmade\tiptap_app`(Tauri 2 + React + Vite,Windows 桌面 WYSIWYG HTML 编辑器)
> **依赖前置**:v2.2.0 已发版,P2(源码视图修改 design 同步)已 commit
> **相关 spec**:`docs/superpowers/specs/2026-08-26-design-styles-design.md`(v2.1.0 设计功能)、`docs/superpowers/specs/2026-08-26-design-menu-design.md`(v2.2.0 设计顶级 tab)
> **目标版本**:v2.3.0 或下个 minor(单独 feature branch `feature/goal12-block-selector-and-style-editor`)
> **用户硬规则**(不变):提交前必须真机验证 / per-command git identity / 不 push / 菜单栏顺序不变

---

## 1. 背景与目标

### 1.1 当前状态(v2.2.0 已发版)

- 编辑视图用 `<iframe srcDoc=docHtml contentEditable>`,浏览器原生 HTML 解析,WYSIWYG
- 现有块定位:`findBlockAtClientPoint`(App.tsx line 1031)— 已被右键菜单复用
- 现有块样式修改:`handleSpacingChange`(App.tsx line 1108+)— 直接改选中块 inline style
- 现有 head CSS 注入:`applyBodyBackground` / `applyDesign` 模式
- 现有默认样式:`defaultStyle.ts` + 右键菜单"设为默认样式"(8 属性白名单,仅 p/h1-h6)
- 现有 `isModified` 跟踪:per-tab,App.tsx line 139
- 现有 RibbonHome:4 组(字体 / 段落 / 样式 / 链接),文本编辑期为主
- 现有 Tauri:无 `onCloseRequested` 处理

### 1.2 目标(用户 2026-08-27 给出)

1. **可视块选择**:hover 浅边框 + tag 提示;单击块选中(蓝实线 + breadcrumb badge);Esc 脱选;Ctrl+↑/↓ 在层级间 drill
2. **容器样式编辑**:选中块后,Ribbon 新组"容器"(背景 / 边框色 / 边框宽 / 边框样式 / 圆角 / 内边距)改 inline style;⭐ 按钮把 inline 提升为 head CSS 的 `tagName { ... }` 规则
3. **关闭未保存弹窗**:应用关闭时若有 dirty tab → 自定义 React 模态(三按钮 + dirty tab checkbox 列表)

### 1.3 非目标(YAGNI)

- ❌ 不做 inline CSS 之外的高级 box-model 控制(`box-shadow` / `opacity` / 渐变)
- ❌ 不做 inline 转 head CSS 之外的"反向"(head CSS → inline)
- ❌ 不做自定义 class 自动注入(只走 tag 选择器)
- ❌ 不做 padding 四边独立(单一值,四边一致;四边独立留给源码视图手改)
- ❌ 不做 keyboard-only flow(Esc + Ctrl+↑/↓ 已够;无 Tab 导航)
- ❌ 不做关闭弹窗的"记住选择"(每次关都弹)
- ❌ 不做单 tab 关闭的 dirty 弹窗(只应用关闭时统一弹)
- ❌ 不做拖拽改 padding(只有 dropdown 选择)
- ❌ 不改菜单栏顺序(用户硬规则)
- ❌ 不废弃现有右键菜单"设为默认样式"(向后兼容)

---

## 2. 设计决定(澄清会产出)

| # | 问题 | 决定 |
|---|---|---|
| Q1 | click 默认选哪一层? | **C. 双策略**:hover 永远显最深 + tag 提示,click 默认选块(per `findBlockAtClientPoint` 现有行为),Alt+click 选最深(预留,本 spec 不实现 Alt+click),breadcrumb 可点任意祖先 |
| Q2 | drill 快捷键? | **Ctrl+↑/↓ + breadcrumb**(替代 Ctrl+←/→,避免 contentEditable 词级跳选冲突)+ Esc 脱选 |
| Q3 | "应用到默认" 怎么触发? | **C. ⭐ 单按钮**:选中块后启用,点了把 inline 提取成 head `tagName { ... }` 规则 + 清原 inline |
| Q4 | ⭐ 提升的选择器? | **A. tag 总是**(`tagName { ... }`),N>1 时弹确认,N=1 提示"无需提升" |
| Q5 | 容器按钮放哪儿? | **A. 编辑 tab 加新组"容器"**(顺序不变,只追加) |
| Q6 | 单击 vs 双击? | **B. 单击选 block + 双击文编**(200ms 窗口区分,iframe.contentWindow 单击后 blur 让 Ribbon 接管 focus) |
| Q7 | 关闭弹窗形态? | **B. 自定义 React 模态**(复用 AboutDialog 的 modal-mask)+ 单 dialog 列 dirty tabs |
| Q8 | 容器组具体样式项? | **B. 标准集 7 控件**:背景 / 边框色 / 边框宽(0/1/2/4/8) / 边框样式(solid/dashed/dotted/none) / 圆角(0/4/8/16) / 内边距(0/8/16/24/32 单一值)+ ⭐ 提升 |

---

## 3. 整体架构

### 3.1 组件树(改动后)

```
App.tsx
├─ MenuBar (existing)
├─ Ribbon
│   └─ if activeTab === "edit"
│       ├─ <RibbonHome /> (existing, 不动)
│       └─ <ContainerStyleGroup /> (NEW, 末尾追加)
│   └─ if activeTab === "insert" → <RibbonInsert /> (existing)
│   └─ if activeTab === "design" → <DesignStrip /> (existing, v2.2.0)
│
├─ <SelectionOverlay /> (NEW, 与 iframe 同级, pointer-events:none)
├─ <iframe ref={iframeRef} ... /> (existing)
├─ <BlockSourcePanel /> (existing, 右键菜单用)
├─ <EditorContextMenu /> (existing, 向后兼容)
├─ <UnsavedCloseDialog /> (NEW, dirty 时挂)
└─ <AboutDialog /> (existing)
```

### 3.2 数据流

```
┌────────────────────────────────────────────────────┐
│ App.tsx state: │
│ ├─ selectedBlock: {tagName, nthOfType, textSample} │
│ │   └ null │
│ ├─ hoveredBlock: {tagName, nthOfType} │ null │
│ ├─ containerForm: {bgColor?, borderColor?, ...} │
│ ├─ closeDialogOpen: boolean │
│ └─ (existing) docHtml, isModified, sourceText, ... │
└────────────────────────────────────────────────────┘
 ▲ │
 │ iframe.contentDocument 事件 │
 │ (mouseover/mouseout/mousedown/ │
 │ click/dblclick/keydown/scroll) │
 │ │
 ┌──────────────────────┴────────────────────────┐
 │ iframe.contentDocument │
 │ (浏览器原生 HTML 解析 + contentEditable) │
 └──────────────────────────────────────────────────────┘

⭐ 提升流向:
selectedBlock inline style
 │ extractContainerStyle
 ▼
CSS props object
 │ upsertBlockStyleRule(head, tagName, props)
 ▼
<head> 新增 <style id="weavepage-block-style">p { ... }</style>
+ 清原块 inline style
+ setDocHtml → editorSrcDoc useMemo rebuild
```

---

## 4. Goal 1:可视块选择

### 4.1 状态机

```
[none]
 ▲ │ 切 activeDoc / 切 source view / Esc / Ctrl+↑↓(顶层边界)
 │ │
 │ mouseover │ mouseout
 │ ▼ │
 │ [hovered] │
 │ │
 │ click(200ms 内无 dblclick) │
 │ ▼
[selected] ───── click 另一块 ───► [selected'](新身份)
 │
 │ Ctrl+↑/↓
 │ ▼
 │ [selected'](drilled 父/子)
```

- `hovered` 与 `selected` 可同时存在:overlay 同时画两个边框(选中实线 2px 蓝、hover 虚线 1px 浅灰)
- 状态变化触发 React re-render → overlay 重画

### 4.2 块身份元数据(iframe 重建失效的解决方案)

```typescript
interface BlockIdentity {
  tagName: string;       // 'p' / 'div' / 'h1' ...
  nthOfType: number;     // 父内同 tag 的第几个兄弟(0-indexed)
  textSample: string;    // 前 30 字符(fallback 定位)
}
```

- iframe `onLoad` 时重定位:
  1. `doc.querySelectorAll(tagName)[nthOfType]`
  2. 失败 → `Array.from(querySelectorAll(tagName)).find(el => el.textContent?.startsWith(textSample))`
  3. 仍失败 → 清空 selectedBlock(罕见)

### 4.3 事件处理(iframe.contentDocument)

| 事件 | 处理 |
|---|---|
| `mouseover` | `findBlockAtClientPoint(e.target)` → 算 rect → `setHoveredBlock` |
| `mouseout` | 检查 `relatedTarget` 是否仍在 iframe:在内则更新(转 hover 新块);不在则清 |
| `mousedown` | 记 timestamp;e.target 在 iframe 内 → 准备 click |
| `click` | 若< 200ms 距 mousedown 且无 dblclick → 单击:`setSelectedBlock(locateBlock)` + 反读 inline style → `setContainerForm`;触发 `iframe.contentWindow.blur()` |
| `dblclick` | 不拦,文本编辑正常进行 |
| `keydown` | Esc / Ctrl+↑(取 parentElement) / Ctrl+↓(取第一个 element child 跳 `<br>`)/ Ctrl+↑↓ 在 body / 叶子 → no-op |
| `scroll` | 更新 overlay transform 同步 |

### 4.4 SelectionOverlay 渲染

- 挂在 App.tsx,与 iframe 同级,`position: absolute; z-index: 1000; pointer-events: none;`
- 选中:`position: absolute; border: 2px solid #2563eb;`
- hover:`border: 1px dashed #94a3b8;`
- 选中 badge:右上角,黑底白字,显示 `p > div.wrapper`(从 selectedBlock 沿 parentElement 走到 body 收集 tagName)
- 坐标:`transform: translate(${rect.left + iframeRect.left}, ${rect.top + iframeRect.top}); width: ${rect.width}; height: ${rect.height};`

### 4.5 Deselection 触发

- Esc(全局 keydown handler)
- 切 activeDoc(`switchDoc`)
- 切到 source view(`changeMode === 'source'`)
- iframe 重建后重定位失败

---

## 5. Goal 2:容器样式编辑 + ⭐ 提升

### 5.1 ContainerStyleGroup 布局(编辑 tab 末尾)

```
┌─ 容器 ──────────────────────────────────┐
│ [🎨 背景] [▢ 边框色] [宽▼] [样式▼] │
│ [圆角▼] [内边距▼]            [⭐ 提升] │
└─────────────────────────────────────────┘
```

- 背景 / 边框色:复用 `ColorPicker`(新增 `CONTAINER_BG_COLORS` 子集,跟 `PAGE_BG_COLORS` 平行)
- 边框宽:`SelectControl` 0/1/2/4/8 px
- 边框样式:solid / dashed / dotted / none
- 圆角:0 / 4 / 8 / 16 px
- 内边距:0 / 8 / 16 / 24 / 32 px(单一值,四边一致)
- ⭐:组末,无 selectedBlock 时 disabled

### 5.2 Inline style 写入流程

```typescript
function setBlockStyle(prop: keyof ContainerForm, value: string) {
  if (!selectedBlock) return;
  const iframe = iframeRef.current;
  if (!iframe?.contentDocument) return;
  const el = locateBlock(iframe.contentDocument, selectedBlock);
  if (!el) return;
  setContainerForm(prev => ({ ...prev, [prop]: value }));
  el.setAttribute('style', applyContainerStyle(el.getAttribute('style'), prop, value));
  setIsModified(true);
  setDocHtml(iframe.contentDocument.body.innerHTML); // 触发 editorSrcDoc rebuild
}
```

### 5.3 `blockStyle.ts` helper

| 函数 | 职责 |
|---|---|
| `applyContainerStyle(styleStr, prop, value) → newStr` | 合并 inline(像 `applyLineHeight`,保留其它属性);prop ∈ {bgColor, borderColor, borderWidth, borderStyle, borderRadius, padding} → 对应 CSS 属性 background / border-color / border-width / border-style / border-radius / padding |
| `parseContainerStyle(styleStr) → ContainerForm` | 反读,块选变化时回填控件 |
| `extractContainerStyle(styleStr) → Record<string, string>` | ⭐ 提升用:抽 CSS 属性对象 |
| `upsertBlockStyleRule(head, tagName, props) → newHead` | upsert 到 `<style id="weavepage-block-style">` 命名块(类似 `STYLE_BLOCK_ID` 模式) |
| `locateBlock(doc, identity) → HTMLElement \| null` | 用 tagName + nthOfType + textSample 三段式定位 |

### 5.4 ⭐ 提升流程

1. `locateBlock(doc, selectedBlock)` 拿 DOM
2. `extractContainerStyle(el.getAttribute('style'))` 拿 CSS props
3. `doc.body.querySelectorAll(tagName).length` 计 N
4. **N = 1** → toast "只有一个 `<p>`,无需提升"(不操作)
5. **N > 1** → 弹确认对话框(类似 AboutDialog 风格)
   - 文案:`将把样式提升为本文档所有 <p> 的默认(共 5 个)。原 inline 会被清除。` [确定] [取消]
   - 确定 → `upsertBlockStyleRule(head, tagName, props)` + `el.setAttribute('style', '')` + `setDocHtml(...)`
   - 取消 → 不操作
6. **props 为空** → toast "该块没有可提升的样式"

### 5.5 ⭐ 优先级关键

- inline style 在 CSS 层级 > head `tagName` 规则
- 提升后**必须**清原块 inline,否则它一直赢(其它同 tag 块看不到新样式)
- 验证:清除后,`p { background: ...; }` 赢

### 5.6 与现有"设为默认样式"的关系

- 现有 right-click 菜单项走 `defaultStyle.ts`(8 属性白名单 + 仅 p/h1-h6)
- 新 ⭐ 走 `blockStyle.ts`(全 tagName + 全属性 bg/border/padding)
- **保留** right-click 菜单(向后兼容 + 肌肉记忆)
- 长期可废弃,v1 不动

### 5.7 容器按钮 vs 文本按钮并存

- 块选 + 双击 → 文本选区出现,iframeExec 路径继续生效
- Ribbon 文本按钮(B / I / U / 字体 / 颜色)仍按文本选区走
- 容器按钮只对 selectedBlock 生效
- 两者正交不冲突

---

## 6. Goal 3:关闭未保存弹窗

### 6.1 触发

- 用户点 X / Alt+F4 / Cmd+Q / 菜单"退出" → Tauri `onCloseRequested`
- `@tauri-apps/api/window` 的 `getCurrentWindow().onCloseRequested(handler)`
- handler `event.preventDefault()` 阻止关闭,直到用户决策

### 6.2 isModified 检测(per-tab)

- 现有 `docs[i].isModified` 已逐 tab 跟踪(看 App.tsx line 395 `snapshotActive`)
- 关闭时:`const dirtyTabs = docs.filter(d => d.isModified)`
- `dirtyTabs.length === 0` → handler **不 preventDefault** → Tauri 正常关闭,不弹窗

### 6.3 UnsavedCloseDialog 形态

```
┌────────────────────────────────────────┐
│ 未保存的文档 │
│ │
│ 以下文档有未保存的修改: │
│ ☑ tab1.html (新建文档)            │
│ ☑ design.html                         │
│ ☑ notes.txt                           │
│ │
│ [保存选中]    [不保存] [取消]    │
└────────────────────────────────────────┘
```

- checkbox 默认全选(用户可单独取消勾选某 tab = 视为"不保存")
- 三按钮:**Save Selected**(只保存勾选)/ **Don't Save All**(全丢)/ **Cancel**
- 文本 tab 同样列出(`kind === 'text'`,走 doSave 路径)

### 6.4 用户操作流

| 操作 | 行为 |
|---|---|
| **Save Selected** | 对每个勾选 tab 串行 `doSave(filePath ?? Tauri save dialog)`;全部成功 → `getCurrentWindow().close()`;任一失败 → 留 dialog + 错误 |
| **Don't Save All** | 所有 tab `isModified = false`(防重弹)→ `getCurrentWindow().close()` |
| **Cancel** | `setCloseDialogOpen(false)`,用户继续编辑 |

### 6.5 多 tab vs 单 tab 关闭

- 单 tab 关闭(`closeDoc`)**不**走这个 dialog(避免连弹 N 次)
- v1 简化:单 tab 关闭若有未保存 → 直接丢(不弹);后续可加 per-tab 弹窗
- 只在**应用关闭**时统一弹

### 6.6 实现骨架

```typescript
// App.tsx 顶层 useEffect
useEffect(() => {
  let unlisten: UnlistenFn | undefined;
  const win = getCurrentWindow();
  (async () => {
    unlisten = await win.onCloseRequested(async (event) => {
      const dirtyTabs = docs.filter(d => d.isModified);
      if (dirtyTabs.length === 0) return; // 不 prevent,允许关闭
      event.preventDefault();
      setCloseDialogOpen(true);
    });
  })();
  return () => unlisten?.();
}, [docs]); // docs 变化重挂,确保 isModified 最新

// UnsavedCloseDialog 内
async function handleSaveSelected(selectedIds: number[]) {
  const ok = await saveTabs(selectedIds); // 串行 save
  if (ok) getCurrentWindow().close();
}
function handleDontSave() {
  docs.forEach(d => updateDoc(d.id, { isModified: false }));
  getCurrentWindow().close();
}
function handleCancel() { setCloseDialogOpen(false); }
```

### 6.7 Save 流程 edge cases

- save dialog 里用户选 Cancel → 该 tab 不保存,checkbox 仍勾着(用户可改成"不保存")
- filePath 被锁 / 磁盘不可用 → `try/catch`,留 dialog + 错误提示
- 文本 tab 无 filePath → 弹 save dialog 让用户选

### 6.8 Don't Save 防死循环

- Don't Save 路径**必须**先置所有 tab `isModified = false`,再 `close()`,否则重触发 `onCloseRequested` 又弹

---

## 7. 文件清单

### 7.1 新增

| 文件 | 职责 | ~行数 |
|---|---|---|
| `src/components/SelectionOverlay.tsx` | 跨 iframe 浮层 + breadcrumb badge + 选中/hover overlay | ~150 |
| `src/components/ContainerStyleGroup.tsx` | 编辑 tab 新组(7 控件 + ⭐) | ~180 |
| `src/components/UnsavedCloseDialog.tsx` | 多 tab 关闭弹窗 | ~140 |
| `src/utils/blockStyle.ts` | `applyContainerStyle` / `parseContainerStyle` / `extractContainerStyle` / `upsertBlockStyleRule` / `locateBlock` | ~120 |
| `src/utils/blockStyle.test.ts` | TDD 单测 | ~80 |

### 7.2 改动

| 文件 | 改动 |
|---|---|
| `src/App.tsx` | + `selectedBlock` / `hoveredBlock` / `containerForm` / `closeDialogOpen` state;<br>+ iframe.contentDocument 事件 useEffect(`mouseover`/`mouseout`/`mousedown`/`click`/`dblclick`/`keydown`/`scroll`);+ `onCloseRequested` useEffect;<br>+ `<SelectionOverlay>` + `<UnsavedCloseDialog>` 渲染;<br>+ `setBlockStyle` / `handlePromote` / `saveTabs` callbacks;<br>+ iframe `onLoad` 重定位 selectedBlock |
| `src/components/Ribbon.tsx` | + `activeTab === 'edit'` 分支末尾挂载 `<ContainerStyleGroup>`(顺序不变,只追加) |
| `src/components/RibbonHome.tsx` | 无需改(容器组独立成组件) |
| `src/App.css` | + `.selection-overlay` / `.selection-overlay--hover` / `.selection-overlay__badge` / `.container-style-group` / `.unsaved-close-dialog` + disabled 态 |
| `package.json` | 确认 `@tauri-apps/plugin-dialog` 已用(若未用需加) |

### 7.3 复用现有(不动)

- `findBlockAtClientPoint`(App.tsx line 1031)— hover/click 都调
- `useIframeFormatState` / `iframeExec`(文本编辑路径不变)
- `applyBodyBackground` 模式(⭐ 借鉴)
- `AboutDialog` 的 modal-mask CSS 复用
- 右键菜单 `EditorContextMenu` + `BlockSourcePanel`(向后兼容,保留)
- `defaultStyle.ts`(right-click "设为默认样式" 仍用)

---

## 8. 测试计划

### 8.1 单测(`blockStyle.test.ts`)

- `applyContainerStyle` 合并 / 覆盖 / 保留其它属性
- `parseContainerStyle` 反读各种 inline 格式(`background: red` / `background-color: #fff` / 多空格)
- `extractContainerStyle` 抽 CSS 属性
- `upsertBlockStyleRule` 命名块 upsert(已有 / 无 / 合并同名 selector)
- `locateBlock` 用 tagName + nthOfType + textSample fallback

### 8.2 真机手测 checklist(20 项,每项 ✓ 才算 P0 完成)

| # | 验证项 |
|---|---|
| 1 | hover 不同块 → 浅虚线 + tag 提示,移出消失 |
| 2 | 单击 `<p>` → 选中态,蓝色实线 2px,右上 badge 显示 `p` |
| 3 | 双击 `<p>` 文字 → 文本选词,无选中态出现 |
| 4 | 选中 `<p>` 后 Ctrl+↑ → 选中父 `<div>`,breadcrumb 显示 |
| 5 | 选中 `<div>` 后 Ctrl+↓ → 选中第一个子 `<p>` |
| 6 | Esc → 脱选,overlay 消失 |
| 7 | 容器组改背景色 → inline style 立即生效 |
| 8 | 容器组改 边框色 / 宽 / 样式 / 圆角 / padding → 全生效 |
| 9 | ⭐ 提升:N=1 提示"无需提升";N>1 弹确认 → 确定后 head CSS 出现 `p { ... }`,该块 inline 被清 |
| 10 | iframe 重建后 → selectedBlock 重定位成功 |
| 11 | 关闭 app,有 1 个未保存 tab → 弹 dialog,Save 成功 → 关闭 |
| 12 | 关闭 app,save dialog 里用户 Cancel → 留在 dialog,checkbox 不变 |
| 13 | 关闭 app,Don't Save → 直接关,`isModified` 已清 |
| 14 | 关闭 app,Cancel → 不关,继续编辑 |
| 15 | 关闭 app,无未保存 → 不弹,直接关 |
| 16 | 关闭 app,多个未保存 → 单 dialog 列所有 dirty tabs |
| 17 | 切 activeDoc → 选中态清空 |
| 18 | 切到 source view → 选中态清空 |
| 19 | 选 `<table>` / `<img>` → 容器组改 bg/border(padding 概念无) |
| 20 | 右键菜单"设为默认样式" 仍可用 |

---

## 9. 发版路线

- 单独 feature branch:`feature/goal12-block-selector-and-style-editor`(基于 master 4d9e074)
- 不强行合并 v2.2.0;v2.3.0 或下个 minor 单独 ship
- 提交前真机验证(per 项目硬规则)
- P2 已 commit 在 `feature/p2-source-design-sync`(64bc70e),可一并合到 master 基线再开新分支,或保持两分支并存

---

## 10. 估计工作量

- Goal 1: ~300 行新 + 100 行改
- Goal 2: ~300 行新 + 50 行改
- Goal 3: ~150 行新 + 50 行 useEffect
- 单测: ~80 行
- CSS: ~100 行

**总计 ~1100 行。**

---

## 11. 关键边界 / 已知限制

1. **iframe 重建失焦**:`editorSrcDoc` useMemo deps 变化触发 iframe reload,DOM 全换 → selectedBlock 失效。`BlockIdentity` 三元组 fallback 解决;若仍失败 → 清空(罕见,用户重选)
2. **inline > head 优先级**:⭐ 提升后不清原 inline 会让规则失效 — `extractContainerStyle` 严格 + `setAttribute('style', '')` 强制清
3. **Don't Save 死循环**:`isModified = false` 后再 `close()`,否则 `onCloseRequested` 再触发又弹
4. **跨帧坐标精度**:iframe 嵌套缩放 / 父容器滚动 → overlay 位置可能 1-2px 偏差;`transform` 同步已覆盖大部分场景
5. **`Alt+click` 选最深**(Q1 预留):本 spec 不实现,留给后续;Alt+click 当前是浏览器默认行为
6. **`@tauri-apps/plugin-dialog`** 需确认是否已在 package.json(看 `recentFiles.ts` 已用 `@tauri-apps/plugin-fs`,dialog 可能未引入)