# WeavePage 「设计」顶级 Ribbon Tab 设计 spec

> **日期**:2026-08-26
> **状态**:已获用户批准(澄清会结论:顶级菜单顺序 = 文件 / 编辑 / 插入 / 设计 / 视图 / 帮助;设计作为 ribbon tab 加入,缩略图横排一条;不沿用 dropdown 浮层)
> **项目**:`F:\soft\00selfmade\tiptap_app`(Tauri 2 + React + Vite,Windows 桌面 WYSIWYG HTML 编辑器)
> **依赖前置**:v2.1.0 已发版,设计功能已落地,`currentDesignId` / `onApplyDesign` / `RibbonDesign` 已存在
> **相关 spec**:`docs/superpowers/specs/2026-08-26-design-styles-design.md`(v2.1.0 设计功能设计,8 套预设 CSS + 持久化 + WYSIWYG)
> **目标版本**:v2.2.0(下一个 minor 发版)

---

## 1. 背景与目标

### 1.1 当前状态(v2.1.0 已发版)

- 设计按钮位于 ribbon「编辑」tab 内(最右侧),点击展开 `DesignPickerPanel`(react-dom portal 到 body,固定定位到按钮下方)
- 9 张缩略图(默认 + 8 套预设)在 520×280 的浮层面板中以 3×3 grid 排版
- 用户反馈(2026-08 v2.1.0 #3):「在主菜单加『设计』入口」

### 1.2 目标

把现有的「设计」按钮从 ribbon 内**提升到顶级 ribbon tab**,与「编辑」「插入」平级。同时把缩略图从 dropdown 浮层改为 ribbon 区域内的横向 scrollable 条。

### 1.3 非目标(YAGNI)

- ❌ 不做 dropdown 浮层(已删除,缩略图直接放 ribbon 内)
- ❌ 不加快捷键(其他顶级菜单也都没快捷键)
- ❌ 不做 panel 独立 modal(已删除)
- ❌ 不改 8 套设计的视觉/交互(沿用 v2.1.0 设计)
- ❌ 不改持久化逻辑(沿用 v2.1.0,docHtml 内 `<style data-weavepage-design>`)
- ❌ 不改 `<head>` 注入逻辑(沿用 v2.1.0,applyDesign 已实现)

---

## 2. 菜单栏最终顺序

```
[文件 ▼]  [编辑]  [插入]  [设计]  [视图 ▼]  [帮助 ▼]  ▲/▼
```

| 菜单项 | 类型 | 现有 / 新增 |
|---|---|---|
| 文件 | dropdown menu | 现有(v2.0+) |
| 编辑 | **ribbon tab** | 现有(v2.0+) |
| 插入 | **ribbon tab** | 现有(v2.0+) |
| 设计 | **ribbon tab** | **新增**(本 spec) |
| 视图 | dropdown menu | 现有(v2.0+) |
| 帮助 | dropdown menu | 现有(v2.0+) |

- 「文件 / 视图 / 帮助」沿用现有 dropdown 行为(`.menu-title` + `.menu-dropdown`)
- 「编辑 / 插入 / 设计」沿用现有 ribbon tab 行为(`.ribbon-tab`,激活态高亮)
- 「设计」tab 内容 = 9 张缩略图横排(本 spec 新增)

---

## 3. 设计决定(澄清会产出)

| # | 问题 | 决定 |
|---|---|---|
| Q1 | 「设计」放哪里? | **顶级 ribbon tab**(与编辑/插入平级),位于插入之后、视图菜单之前 |
| Q2 | 点「设计」tab 后,缩略图怎么显示? | **横向 scrollable 一条**,9 张并排,放在 ribbon 区域(不再是 dropdown 浮层) |
| Q3 | 原 ribbon 上的「设计」按钮去留? | **删除**(已被顶级 tab 取代,避免重复入口) |
| Q4 | 编辑/插入/视图/帮助 是否删除? | **不删**(用户硬约束:保持原有 5 项,只新增第 6 项) |
| Q5 | 缩略图尺寸? | 缩小到 ~90×60px(适配 ribbon 高度,共 9 张 = 1 默认 + 8 预设) |
| Q6 | 缩略图点击行为? | 点击 → apply → 保持在「设计」tab(像 Word Design tab,不自动切走) |
| Q7 | source 视图禁用? | **是**(沿用 v2.1.0 行为,disabled + tooltip) |
| Q8 | 与 v2.1.0 设计功能的关系? | **沿用**,只重新组织入口(数据流、CSS 注入、持久化全部不动) |

---

## 4. 整体架构

### 4.1 组件树(改动后)

```
App.tsx
├─ MenuBar
│   ├─ [文件 ▼] (existing dropdown menu)
│   ├─ [编辑] ribbon tab (existing)
│   ├─ [插入] ribbon tab (existing)
│   ├─ [设计] ribbon tab (NEW)
│   ├─ [视图 ▼] (existing dropdown menu)
│   └─ [帮助 ▼] (existing dropdown menu)
│
└─ Ribbon
    ├─ if activeTab === "edit"  → <RibbonHome /> (existing)
    ├─ if activeTab === "insert" → <RibbonInsert /> (existing)
    └─ if activeTab === "design" → <DesignStrip /> (NEW)
                                     ├─ 9 × <DesignThumb /> (从 RibbonDesign 拆出)
                                     └─ 横向 scroll 容器
```

### 4.2 数据流

```
App.tsx
├─ state: activeTab: "edit" | "insert" | "design"   (新增 "design")
├─ state: currentDesignId: string | null             (v2.1.0 已存在)
├─ state: mode: "edit" | "source"                    (v2.1.0 已存在)
│
└─ MenuBar (activeTab, onTabChange) + MenuBar 受 source 模式禁用「设计」tab
   ↓
   Ribbon (activeTab)
   ├─ edit  → RibbonHome
   ├─ insert → RibbonInsert
   └─ design → DesignStrip (currentDesignId, onApply, disabled)
                └─ DesignThumb × 9 (从 RibbonDesign.tsx 拆出)
                    ↓ click
                    onApply(id | null) → App.applyDesign → 沿用 v2.1.0 链路
```

---

## 5. 文件改动清单

| 文件 | 动作 | 行数估计 |
|---|---|---|
| `src/components/MenuBar.tsx` | RibbonTab type 加 `"design"`;新增「设计」tab 按钮 | +8 / -0 |
| `src/components/Ribbon.tsx` | 新增 `activeTab === "design"` 分支渲染 `<DesignStrip />` | +6 / -3 |
| `src/components/DesignStrip.tsx` | **新增** — 横向 scrollable 9 张缩略图条 | +60 |
| `src/components/DesignThumb.tsx` | **新增** — 从 `RibbonDesign.tsx` 拆出,简化(无 portal / 无 anchor) | +45(从 RibbonDesign.tsx 抽出) |
| `src/components/RibbonDesign.tsx` | **删除**(无人调用) | 全部删除(~200 行) |
| `src/App.tsx` | `RibbonTab` type 同步更新;Ribbon 接收 activeTab | +3 / -2 |
| `src/App.css` | 新增 `.ribbon-design-strip` 样式 + `.ribbon-tab-design-thumb` 缩略图变体 | +30 |

**预计总改动**:+150 行 / -200 行(净 -50 行)

---

## 6. 核心模块

### 6.1 `src/components/MenuBar.tsx`(改动)

```tsx
export type RibbonTab = "edit" | "insert" | "design";  // 加 "design"

// 在「插入」tab 按钮后、「视图」menu 前插入:
<button
  className={`ribbon-tab ${activeTab === "design" ? "active" : ""}`}
  onClick={() => onTabChange("design")}
  disabled={mode === "source"}  // source 视图禁用
  title={mode === "source" ? "请切换到编辑视图" : "文档设计(8 套预设 + 默认)"}
>
  设计
</button>
```

**注意**:
- `disabled` 属性需要 MenuBar 接收 `mode` prop(已有)
- 当前 MenuBar 接收 `mode` 和 `onModeChange` 但 tab 按钮没用到 `mode`(只视图菜单内的「编辑模式/源码视图」用)。本次给设计 tab 加 `mode === "source"` 禁用

### 6.2 `src/components/Ribbon.tsx`(改动)

```tsx
interface RibbonProps {
  // ... 现有 props
  activeTab: RibbonTab;
  currentDesignId: string | null;
  onApplyDesign: (id: string | null) => void;
}

// 在 return 内:
{activeTab === "edit" && <RibbonHome {...} />}
{activeTab === "insert" && <RibbonInsert {...} />}
{activeTab === "design" && (
  <DesignStrip
    currentDesignId={currentDesignId}
    onApply={onApplyDesign}
    disabled={mode === "source"}  // 沿用 v2.1.0
  />
)}
```

**RibbonHome 内删除对 RibbonDesign 的引用**(v2.1.0 引入的,现在被顶级 tab 取代)

### 6.3 `src/components/DesignStrip.tsx`(新增)

```tsx
import { useRef } from "react";
import { DESIGNS, DEFAULT_DESIGN_ID, type DesignMeta } from "../utils/designs";
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
      <div ref={stripRef} className="ribbon-design-strip" role="toolbar" aria-label="文档设计">
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

**关键差异 vs RibbonDesign**:
- ❌ 无 `open` / `setOpen` state(不再 toggle)
- ❌ 无 `createPortal`(直接渲染在 ribbon 区域)
- ❌ 无 `anchorRect` / `useEffect` 关闭逻辑
- ✅ 简化为受控:直接接收 `currentDesignId` / `onApply` / `disabled`,渲染一次

### 6.4 `src/components/DesignThumb.tsx`(新增,从 RibbonDesign 拆出)

```tsx
import { type DesignMeta } from "../utils/designs";

// 缩略图内部通用样例 HTML(每个 design 共用,只换 design CSS)
const SAMPLE_HTML = `
<h1>一级标题</h1>
<h2>二级标题</h2>
<p>正文示例...</p>
<blockquote>引用块示例...</blockquote>
<pre><code>const x = 'code';</code></pre>
<table>...</table>
<ul>...</ul>
<hr>
`;

// 缩略图内部小字体规则(适配 ~90×60px 缩略图)
const THUMB_BODY_CSS = `
body { margin: 0; }
.design-thumb-body { font-size: 5px; line-height: 1.4; padding: 4px 6px; }
.design-thumb-body h1 { font-size: 8px; margin: 1px 0; }
.design-thumb-body h2 { font-size: 7px; margin: 1px 0; }
.design-thumb-body p { margin: 1px 0; }
... (缩到 ~5-8px 字号,适配小尺寸)
`;

interface DesignThumbProps {
  design: DesignMeta | null;  // null = "默认"
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

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
        style={{ background: design?.preview.bg ?? "#ffffff" }}
      >
        {design ? (
          <iframe
            className="design-thumb-iframe"
            title={design.name}
            sandbox=""
            srcDoc={buildThumbSrcDoc(design)}
          />
        ) : (
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

**注意**:
- 缩略图样式从原 `RibbonDesign.tsx` 的 ~160×80 缩到 ~90×60
- 字号从 6px 降到 5px,heading 从 10/9/8 降到 8/7(让小尺寸仍能展示层级)
- sandbox="" 不变(安全)

### 6.5 `src/components/RibbonDesign.tsx`(删除)

整个文件删除(200 行)。DesignThumb 已拆到独立文件,DesignPickerPanel 逻辑被 DesignStrip 取代(简化版),RibbonDesign 顶层组件无人调用。

---

## 7. CSS 改动

### 7.1 新增 `.ribbon-design-strip-wrap` / `.ribbon-design-strip`

```css
.ribbon-design-strip-wrap {
  flex: 1;
  overflow: hidden;  /* 外层不滚动,只内层滚 */
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
```

### 7.2 新增 `.ribbon-thumb-mini`(缩略图小尺寸变体)

```css
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
  pointer-events: none;  /* 缩略图只显示,不接收点击 */
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

**缩略图渲染策略**:iframe 直接渲染在 84×48 视窗;DesignThumb 内的样例 HTML 通过 `THUMB_BODY_CSS` 把所有字号压缩到 5-8px(原 v2.1.0 是 6-10px)。这样 design.css 不用改,只是在缩略图容器内额外叠一层小字号规则把元素尺寸压下来,确保 9 张缩略图在 ribbon 横排时仍清晰可辨。

---

## 8. 与 v2.1.0 设计功能的协同

### 8.1 完全复用,不重复造轮子

| 模块 | v2.1.0 现状 | 本 spec 改动 |
|---|---|---|
| `src/utils/designs.ts` | 8 套 CSS + 元数据 | **不动** |
| `App.applyDesign` | 注入 `<style data-weavepage-design>` | **不动** |
| `App.parseDesignId` | 从 docHtml 解析 design id | **不动** |
| `currentDesignId` state | App 层 useState | **不动** |
| `<style data-weavepage-design>` 注入策略 | toc CSS 之后 | **不动** |
| 持久化(HTML 自身) | docHtml 字符串 | **不动** |
| 跨文档恢复 | parseDesignId 自动 | **不动** |

### 8.2 spec 边界

- 本 spec **只重新组织设计入口的位置和展示形态**
- 8 套设计的视觉、CSS、WYSIWYG、持久化全部沿用 v2.1.0
- 改动集中在 `MenuBar.tsx` / `Ribbon.tsx` / 新增 `DesignStrip.tsx` + `DesignThumb.tsx` / 删除 `RibbonDesign.tsx`

---

## 9. UX 细节

### 9.1 「设计」tab 激活态

- 与「编辑」「插入」tab 完全一致(`.ribbon-tab.active` 样式)
- 激活时显示对应 ribbon 内容(9 张缩略图)
- 切换到其他 tab → 缩略图消失,显示对应 toolbar

### 9.2 缩略图点击行为

- 点击 → 调 `onApply(id)` → `applyDesign` 注入 CSS → 编辑视图生效
- 点击后**保持在「设计」tab**(不切回「编辑」tab,像 Word Design tab)
- 用户可继续点其他缩略图切换风格
- 用户主动点「编辑」/「插入」tab 才离开

### 9.3 横向 scroll

- 共 9 张缩略图(1 默认 + 8 预设)× 90px + 8 × 6px gap = 858px
- 一般 ribbon 区宽度 1024px+ 装得下;窄屏(<1024px)出现横向 scroll
- scroll 容器是 `.ribbon-design-strip`(内层),`.ribbon-design-strip-wrap` 不滚

### 9.4 source 模式禁用

- 「设计」tab 按钮:`disabled={mode === "source"}` + tooltip "请切换到编辑视图"
- 沿用 v2.1.0 行为,与原 RibbonDesign 按钮一致
- `DesignThumb` 按钮也 `disabled`,防止意外触发

---

## 10. 错误处理 / 边界

| 场景 | 行为 |
|---|---|
| iframe 缩略图加载失败 | 浏览器显示空白 + 卡片白底,可点击 → 仍 apply CSS(失败不影响 apply) |
| 设计 CSS 注入失败(applyDesign 异常) | 沿用 v2.1.0 兜底:toast 提示 + currentDesignId 不更新 |
| 打开旧 HTML,design id 已废弃 | 沿用 v2.1.0:parseDesignId 返回 null,显示「默认」卡选中 |
| source 视图 | 「设计」tab + 缩略图全部 disabled |
| 文本 doc(kind === 'text') | 沿用 v2.1.0:disabled + tooltip「纯文本文档不支持设计样式」 |

---

## 11. 测试要点(真机验证 + 单测)

### 11.1 单测

- `pnpm tsc --noEmit` → 0 error
- `pnpm tsx src/utils/designs.test.ts` → 全过(沿用 v2.1.0,本次不改 designs.ts)

### 11.2 真机手测(按 handoff §4 惯例:不上传前不 commit)

| # | 用例 | 期望 |
|---|---|---|
| 1 | 打开空白文档,点「设计」tab | ribbon 区显示 9 张缩略图横排(默认 + 8 套预设) |
| 2 | 点「文艺书卷」缩略图 | 编辑视图立即变米黄色衬线风 + docHtml 出现 `<style data-weavepage-design="literary-scroll">` |
| 3 | 再点「科技感」 | 编辑视图换深色 monospace + 旧 design style 被替换(非叠加) |
| 4 | 点「默认」 | 所有 design style 移除,回到浏览器默认 |
| 5 | 切回「编辑」tab | 缩略图消失,显示 normal toolbar(RibbonHome) |
| 6 | 切到「插入」tab | 缩略图消失,显示 RibbonInsert |
| 7 | 切到「源码视图」| 「设计」tab disabled + tooltip 「请切换到编辑视图」 |
| 8 | 切换到 source 模式后切回「编辑」tab | 「设计」tab 重新 enabled |
| 9 | 保存文档(带 design style),关闭 → 重开文件 | 编辑视图自动恢复 design style + 当前 tab 是「编辑」(不是「设计」) |
| 10 | 9 张缩略图在窄屏(<1024px) | 横向 scroll 正常 + scrollbar 美化 |
| 11 | ribbon 折叠状态下点「设计」tab | 缩略图在折叠 ribbon 区域显示(如果高度够)或折叠自动展开 |
| 12 | 设计功能回归测试 | 沿用 v2.1.0 所有用例(已发版,本次确认未回归) |

### 11.3 缩略图视觉抽样验证

挑 3 个 design(经典学术 / 科技感 / 文艺书卷)目测缩略图是否清晰可辨(90×60px 内仍能看出风格差异)

---

## 12. 避坑提示(下一会话 plan/实施)

1. **不要在 MenuBar 给「设计」加 `.menu-title` + `.menu-dropdown`** — 它是 ribbon tab,不是 dropdown menu
2. **不要在 DesignStrip 内加 portal/anchor 逻辑** — 设计稿明确:直接渲染在 ribbon 区域
3. **不要在 DesignThumb 内复用 RibbonDesign 的缩略图尺寸** — 已缩小到 90×60
4. **不要给「设计」tab 加高亮态(类似 menu-open)** — 它沿用 `.ribbon-tab.active`,不是菜单
5. **不要在删 RibbonDesign.tsx 前 grep 整个项目** — 确认无外部 import(`RibbonDesign` 仅在 `App.tsx` / `RibbonHome.tsx` 引用,本次都改)
6. **不要把 `DESIGNS` import 加回 App.tsx** — DesignStrip 引用,App.tsx 不需要
7. **不要把 `void` shim 加回任何文件** — 上次 v2.1.0 临时加,后续已删
8. **不要在 source 视图保留「设计」tab 可点击** — 必须 disabled + tooltip
9. **不要把 `applyDesign` 的 `disabled` 漏传** — DesignStrip 接收 `disabled={mode === "source"}`,沿用 v2.1.0 行为

---

## 13. 发布路径

1. 实施完成后 `pnpm tauri build`(双渠道:full / update)
2. sandbox-verify weavepage 真机手测(按 11.2 全部用例)
3. 上传 `_upload_weavepage.py` → 升级 minor 版本号 v2.1.0 → v2.2.0
4. README 同步变更日志:「新增:文档设计入口提升为顶级 Ribbon Tab(与编辑/插入平级)」
5. version.json 切到 v2.2.0 channels

---

## 14. 关联文件路径

- 项目根:`F:\soft\00selfmade\tiptap_app`
- 本 spec 同目录:`docs/superpowers/specs/2026-08-26-design-menu-design.md`
- 前置 spec:`docs/superpowers/specs/2026-08-26-design-styles-design.md`
- 下一阶段 plan(待写):`docs/superpowers/plans/2026-08-26-design-menu-implementation.md`
- v2.1.0 实施 plan(参考):`docs/superpowers/plans/2026-08-26-design-styles-implementation.md`
- 现状代码:
  - `src/components/RibbonDesign.tsx`(本次删除)
  - `src/components/MenuBar.tsx`(本次改)
  - `src/components/Ribbon.tsx`(本次改)
  - `src/App.tsx`(本次小改)
  - `src/utils/designs.ts`(本次不动)

---

## 15. 总结

**改动一句话总结**:把「设计」从 ribbon「编辑」tab 内的 dropdown 浮层按钮,提升为顶级 ribbon tab,缩略图改为横排条;v2.1.0 设计功能(8 套 CSS + 持久化 + WYSIWYG)完全复用,不动。

**预期改动**:+150 行 / -200 行(净 -50 行);影响 7 个文件,其中 1 个新增(DesignStrip)、1 个新增(DesignThumb)、1 个删除(RibbonDesign)、4 个改动。