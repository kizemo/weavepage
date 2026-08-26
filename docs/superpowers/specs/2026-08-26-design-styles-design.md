# WeavePage 设计子菜单(文档设计 / Document Designs)功能 设计 spec

> **日期**:2026-08-26
> **状态**:已获用户批准(澄清会 8 个风格方向 + 目录跟随主风格 + HTML 自身持久化 + 16:9 缩略图方案 α + 设计 CSS 注入 `<head>` + "默认"按钮内置)
> **项目**:`F:\soft\00selfmade\tiptap_app`(Tauri 2 + React + Vite,Windows 桌面 WYSIWYG HTML 编辑器)
> **本阶段交付**:8 张效果图(用户已批准本会话出图)+ 1 份设计 spec(本文件)+ 下一阶段实施代码(spec 锁定后另写 plan)
> **目标版本**:v2.1.0(下一发版;本阶段不出代码,只出设计 + 视觉)

---

## 1. 目标

让 WeavePage 用户能:

1. 在 Ribbon 看到一个「设计」按钮(参照 Word 的"设计"选项卡样式)
2. 点击「设计」→ 弹出下拉面板,内含 8 个 16:9 缩略图卡片 + 1 个「默认」按钮,共 9 张卡
3. 每张卡片 = 该设计样式在真实 h1/p/blockquote/code 等元素上的 16:9 渲染快照(方案 α)
4. 点击任意非默认卡片 → 把对应 CSS 注入到当前文档 `<head>` 的 `<style data-weavepage-design="<id>">` 中,编辑视图立即 WYSIWYG 生效
5. 点击「默认」→ 移除所有 `[data-weavepage-design]` style 标签,回到浏览器默认渲染
6. 切换是**真正操作 HTML 字符串**:保存后,HTML 文件里就有该 `<style>` 块;重新打开就还是这个样式
7. 未操作设计时,**WeavePage 不会主动注入任何样式**——所见即所得 = HTML 文件本身内容
8. 每个设计覆盖的元素:body/p/a/h1-h6/ul/ol/blockquote/img/figure/figcaption/code/pre/kbd/table/hr,以及 `#doc-toc-*` 目录视觉覆写
9. 目录样式跟随主风格(每种设计对 `.wp-toc-floating-wrap`/`.wp-toc-h2-link`/`.wp-toc-h3-submenu`/`.wp-toc-panel-header` 都有视觉覆写)

---

## 2. 设计决定(澄清会产出)

| # | 问题 | 决定 |
|---|---|---|
| Q1 | 设计按钮放在哪个 Ribbon 分组? | **Ribbon 中部新增独立"设计"按钮组**(在格式和视图之间,符合 Word 布局) |
| Q2 | 一共几个风格? | **8 个设计 + 1 个"默认"按钮 = 共 9 卡**(主方向 4 + 补充方向 4 + 默认 1) |
| Q3 | 风格方向? | **经典学术 / 现代简约 / 文艺书卷 / 科技感 + 商务正式 / 柔雅 / 薄荷清新 / 复古印刷** |
| Q4 | 目录样式如何处理? | **跟随主风格**(每套设计 CSS 包含 `#doc-toc-*` 选择器的视觉覆写层) |
| Q5 | 缩略图是 SVG 静态图还是真实渲染? | **方案 α — 真实 HTML 渲染**:9 个隐藏 iframe 各自渲染真实文档片段,canvas 截图缓存为 PNG |
| Q6 | 注入位置? | **iframe srcdoc 的 `<head>`**,位置在 tocGen 的 TOC_CSS 之后(`<style data-weavepage-design>` 标记属性) |
| Q7 | "默认"按钮语义? | **移除所有 `[data-weavepage-design]` style 标签**;不触碰 tocGen 注入的 TOC_CSS,也不动用户在正文中手写的 `<style>` |
| Q8 | 持久化策略? | **HTML 文件自身即真所见**:切换设计 = 直接修改 docHtml 字符串的 `<head>`;保存 HTML = CSS 写入磁盘;无 localStorage、无全局默认、无 meta tag |
| Q9 | 打开已有 HTML 是否自动注入? | **不主动注入**,只解析 `[data-weavepage-design]` 提取当前设计 ID,用于面板高亮 |
| Q10 | 源代码视图是否显示设计 style? | **默认显示**(它是真实存在的 HTML 内容);用户可直接编辑该 style 内容 |
| Q11 | 源代码视图修改 → 编辑视图同步? | **下一阶段 TODO**(用户标记为可延后) |
| Q12 | 切换失败的兜底? | 解析 style ID 失败时回退"无设计"状态 + 非阻塞 toast 提示 |

---

## 3. 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│  App.tsx                                                             │
│  state: currentDesignId: string | null   // 运行时纯内存,关掉归零    │
│                                                                     │
│  ├─ RibbonDesign(新增) ───────────────────────────────────────────── │
│  │   ├─ RibbonButton "设计 ▼"                                       │
│  │   └─ 点击 → 弹出 <DesignPickerPanel>                              │
│  │        ├─ 9 张 16:9 缩略图卡(3×3 网格)                          │
│  │        ├─ 第一格 = "默认"(显示未注入样式的对照预览)                              │
│  │        └─ 当前 currentDesignId 对应的卡高亮 + 选中态标记                  │
│  │                  │                                                 │
│  │   点击某卡 → 调 applyDesign(designId | null)                       │
│  │                  │                                                 │
│  ├─ applyDesign(designId) 流程:                                      │
│  │   1. 读 designs.ts 取 CSS 字符串                                   │
│  │   2. 操作 docHtml 字符串:                                          │
│  │      - removeAll(`<style data-weavepage-design>`)                  │
│  │      - if (designId) 注入 `<style data-weavepage-design="X">${CSS}`│
│  │        位置 = tocGen 注入的 `<style data-weavepage-toc>` 之后        │
│  │   3. setDocHtml(newDocHtml) → iframe srcdoc 重渲                   │
│  │   4. setCurrentDesignId(designId)                                  │
│  │   5. (不持久化到 localStorage)                                     │
│  │                                                                     │
│  └─ 打开 HTML 时 parseDesignId(docHtml):                              │
│       - 查询 `[data-weavepage-design]` 的第一个 style 标签             │
│       - 提取其 attribute → currentDesignId                            │
│       - 若无 → currentDesignId = null(等同默认)                       │
└─────────────────────────────────────────────────────────────────────┘
```

**新文件清单**:
- `src/utils/designs.ts` — 8 个风格定义的 CSS 字符串 + 元数据(名字、id、字体栈、palette)
- `src/utils/designThumbs.tsx` — 16:9 缩略图生成(方案 α:9 个隐藏 iframe + canvas 截图缓存)
- `src/components/RibbonDesign.tsx` — Ribbon「设计」按钮 + DesignPickerPanel 下拉面板
- `src/components/DesignThumb.tsx` — 单张缩略图卡(被 DesignPickerPanel 引用)

**修改文件清单**:
- `src/App.tsx` — 新增 currentDesignId state + applyDesign/parseDesignId 函数 + iframe srcdoc 注入逻辑
- `src/components/Ribbon.tsx` — 接入 RibbonDesign(放中部)
- `src/utils/tocGen.ts` — `buildTocStyleTag()` 输出加 `data-weavepage-toc` 属性(便于设计 CSS 覆写)
- `src/App.css` — `.ribbon-design-picker` 面板样式

---

## 4. 数据模型

```ts
// 设计元数据
interface DesignMeta {
  id: string;             // 'classic-academic' / 'modern-minimalist' / 'classic-chinese' / ...
  name: string;           // '经典学术' / '现代简约' / ...
  css: string;            // 完整 CSS 字符串(注入到 <head>)
  fontFamily: string;     // 主字体栈(给缩略图渲染用)
  preview: {
    bg: string;           // 缩略图背景色
    fg: string;           // 缩略图前景色
    accent: string;       // 缩略图强调色
  };
}

// 8 个风格的元数据 + CSS(见 §6)
// "默认" 是特殊 ID = null,不存 DesignMeta,只占面板第一格

// App.tsx 状态(运行时纯内存)
const [currentDesignId, setCurrentDesignId] = useState<string | null>(null);
```

**为什么不放 DocState**:用户的硬约束"无操作 = 无注入",所以 currentDesignId 不持久化到 DocState;只在 App 层 useState,关掉 WeavePage 后归零(等同无操作)。打开旧 HTML 时,通过解析 docHtml 的 `<style data-weavepage-design>` 重新确定 currentDesignId。

---

## 5. 核心模块

### 5.1 `src/utils/designs.ts`

```ts
export interface DesignMeta {
  id: string;
  name: string;
  css: string;
  fontFamily: string;
  preview: { bg: string; fg: string; accent: string };
}

export const DESIGNS: DesignMeta[] = [
  { id: 'classic-academic', name: '经典学术', ... },
  { id: 'modern-minimalist', name: '现代简约', ... },
  { id: 'literary-scroll', name: '文艺书卷', ... },
  { id: 'tech-dark', name: '科技感', ... },
  { id: 'business-formal', name: '商务正式', ... },
  { id: 'soft-elegant', name: '柔雅', ... },
  { id: 'mint-fresh', name: '薄荷清新', ... },
  { id: 'vintage-print', name: '复古印刷', ... },
];

export const DEFAULT_DESIGN_ID = null;  // 特殊值
export function getDesignById(id: string | null): DesignMeta | null { ... }
```

### 5.2 `src/utils/designThumbs.tsx`

```tsx
// 方案 α:在隐藏 DOM 中用真实 iframe 渲染每张缩略图,canvas 截图缓存
//
// 1. 首次打开面板 → 创建 9 个 hidden iframe(<iframe style="position:absolute;left:-9999px;width:320px;height:180px">)
// 2. 每个 iframe srcdoc = 真实样例 HTML(包含 h1/p/blockquote/code 各一个)+ 该设计 CSS + tocGen CSS 模拟
// 3. iframe.onload → html2canvas 截图 → 缓存为 dataURL
// 4. <DesignThumb> 显示该 dataURL 作为背景图
//
// 性能:9 张 × 渲染 ≈ 200-400ms,可接受。后续可考虑 IntersectionObserver 懒生成。
```

**样例 HTML**(每个缩略图都用同一份,只换 design CSS):
```html
<!DOCTYPE html>
<html>
<head>
  <style>${designCSS}</style>
  <style>${tocCSS}</style>
</head>
<body>
  <h1>一级标题示例</h1>
  <h2>二级标题示例</h2>
  <p>正文段落示例,展示<strong>粗体</strong>与<em>斜体</em>与<a href="#">链接</a>。</p>
  <blockquote>引用块示例,展示左侧边线与背景。</blockquote>
  <pre><code>const code = 'block';</code></pre>
  <table><tr><th>表头</th><th>表头</th></tr><tr><td>单元格</td><td>单元格</td></tr></table>
  <ul><li>列表项 1</li><li>列表项 2</li></ul>
</body>
</html>
```

### 5.3 `src/components/RibbonDesign.tsx`

```tsx
interface RibbonDesignProps {
  currentDesignId: string | null;
  onApply: (id: string | null) => void;
}

// 渲染 <RibbonButton icon="🎨" label="设计" onClick={togglePanel} />
// 首次点击 → 渲染 <DesignPickerPanel> (portal 到 body,fixed 定位在按钮下方)
```

### 5.4 `src/components/DesignPickerPanel.tsx`

```tsx
// 面板布局:6×2 = 12 格(实际 9 张卡 + 3 空)
// 卡片网格:grid-template-columns: repeat(3, 1fr);
// 卡片:16:9 缩略图(背景图=dataURL) + 底部文字(设计名)
// 选中态:卡片外环 2px solid #1f3a68(或主色)
// 悬停:轻微 scale(1.02) + 阴影
// 第一格:「默认」特殊卡,缩略图显示"未应用任何设计"的对照效果(浏览器默认渲染)
```

### 5.5 `src/App.tsx`

```tsx
// state
const [currentDesignId, setCurrentDesignId] = useState<string | null>(null);

// 应用设计
function applyDesign(id: string | null) {
  const css = id ? getDesignById(id)?.css : null;
  let newDocHtml = docHtml;
  // 移除所有 data-weavepage-design style
  newDocHtml = newDocHtml.replace(
    /<style[^>]*data-weavepage-design[^>]*>[\s\S]*?<\/style>/g, ''
  );
  // 注入新 style(若有)
  if (css) {
    const styleTag = `<style data-weavepage-design="${id}">${css}</style>`;
    newDocHtml = injectAfterTocStyle(newDocHtml, styleTag);
  }
  setDocHtml(newDocHtml);
  setCurrentDesignId(id);
}

// 打开 HTML 时解析当前设计
function parseDesignId(html: string): string | null {
  const m = html.match(/<style[^>]*data-weavepage-design="([^"]+)"/);
  return m ? m[1] : null;
}

// 注入到 TOC_CSS 之后的辅助函数
function injectAfterTocStyle(html: string, styleTag: string): string {
  // 找到 <style data-weavepage-toc>...</style> 的结束位置,插在它后面
  const m = html.match(/(<style[^>]*data-weavepage-toc>[\s\S]*?<\/style>)/);
  if (m) return html.replace(m[1], `${m[1]}\n${styleTag}`);
  // 没找到 toc CSS,直接插到 </head> 之前
  return html.replace('</head>', `${styleTag}\n</head>`);
}
```

---

## 6. 8 个风格的 CSS 范围(草稿,出图阶段会细化)

每个设计 CSS 必须包含的元素(共 14 类 + 目录覆写):

| 类别 | 选择器 | 关键属性 |
|---|---|---|
| 文本基础 | `body`, `p`, `a` | 字体、行高、颜色、链接色 |
| 标题 | `h1`–`h6` | 字号、字重、颜色、边框、上下边距 |
| 列表 | `ul`, `ol`, `li` | 项目符号、缩进、间距 |
| 引用 | `blockquote`, `cite` | 左边界线、背景、引用源字体 |
| 代码 | `code` | 字体、背景、圆角(内联) |
| 代码块 | `pre` | 字体、背景、边框、滚动 |
| 键盘 | `kbd` | 字体、灰底、圆角、阴影 |
| 图片 | `img` | 圆角、阴影、`max-width: 100%` |
| 容器 | `figure`, `figcaption` | 居中、小字灰、对齐 |
| 表格 | `table`, `thead`, `td`, `th`, `tr:nth-child(even)` | 边框合并、背景、斑马纹可选 |
| 分割线 | `hr` | 颜色、粗细、上下边距 |
| 目录容器 | `.wp-toc-floating-wrap`, `.wp-toc-panel-header` | 字体、颜色、背景 |
| 目录项 | `.wp-toc-h2-link`, `.wp-toc-h2-item:hover > .wp-toc-h2-link` | 颜色、悬停态背景、左边线 |
| 目录子菜单 | `.wp-toc-h3-submenu` | 背景、边框、阴影 |

**通用护栏**(每个风格都包含):
```css
img { max-width: 100%; height: auto; }
pre { overflow-x: auto; }
table { border-collapse: collapse; }
```

### 6.1 经典学术

```css
body { background: #fff; color: #1a1a1a;
       font-family: 'Source Serif Pro', 'Noto Serif SC', serif;
       line-height: 1.8; font-size: 16px; }
h1 { font-size: 2em; font-weight: 700; border-bottom: 3px solid #000; padding-bottom: .2em; }
h2 { font-size: 1.6em; font-weight: 700; border-bottom: 1px solid #000; padding-bottom: .15em; }
h3 { font-size: 1.3em; font-weight: 600; }
h4-h6 { font-weight: 600; }
p { margin: 1em 0; }
a { color: #000; text-decoration: underline; text-decoration-thickness: 1px; }
blockquote { border-left: 4px solid #000; padding: .5em 1em;
             background: #f7f7f7; font-style: italic; }
code { font-family: 'Source Code Pro', monospace; background: #f0f0f0;
       padding: .1em .3em; border-radius: 3px; font-size: .9em; }
pre { font-family: 'Source Code Pro', monospace; background: #f7f7f7;
      border: 1px solid #ddd; padding: 1em; border-radius: 4px; }
kbd { font-family: monospace; background: #eee; border: 1px solid #aaa;
      border-radius: 4px; padding: .1em .4em; box-shadow: 0 1px 0 #aaa; font-size: .85em; }
img { border-radius: 0; box-shadow: none; }
figure { text-align: center; margin: 1.5em 0; }
figcaption { font-size: .85em; color: #555; font-style: italic; }
table { border: 1px solid #000; width: 100%; }
th, td { border: 1px solid #000; padding: .5em; }
thead { background: #f0f0f0; font-weight: 700; }
tr:nth-child(even) { background: #fafafa; }
hr { border: none; border-top: 1px solid #000; margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .3em 0; }
.wp-toc-floating-wrap { background: #f7f7f7; border: 1px solid #ccc; font-family: inherit; }
.wp-toc-h2-link { color: #000; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: #e8e8e8; }
.wp-toc-h3-submenu { background: #fff; border: 1px solid #ccc; }
```

### 6.2 现代简约

```css
body { background: #fff; color: #1f2328;
       font-family: 'Inter', 'Noto Sans SC', -apple-system, sans-serif;
       line-height: 1.75; font-size: 16px; }
h1 { font-size: 2.5em; font-weight: 800; letter-spacing: -0.02em; }
h2 { font-size: 1.8em; font-weight: 700; margin-top: 1.5em; }
h3 { font-size: 1.4em; font-weight: 600; color: #424b56; }
h4-h6 { font-weight: 600; color: #4a5260; }
p { margin: 1em 0; }
a { color: #2563eb; text-decoration: none; border-bottom: 1px solid transparent;
    transition: border-color .2s; }
a:hover { border-bottom-color: #2563eb; }
blockquote { border-left: 3px solid #e5e7eb; padding: .5em 1.2em;
             color: #4b5563; font-style: normal; }
code { font-family: 'JetBrains Mono', monospace; background: #f3f4f6;
       padding: .15em .35em; border-radius: 4px; font-size: .88em;
       color: #2563eb; }
pre { font-family: 'JetBrains Mono', monospace; background: #f9fafb;
      border: 1px solid #e5e7eb; padding: 1.2em; border-radius: 8px;
      font-size: .9em; }
kbd { font-family: monospace; background: #fff; border: 1px solid #d1d5db;
      border-bottom-width: 2px; border-radius: 4px;
      padding: .1em .4em; font-size: .85em; }
img { border-radius: 8px; }
figure { text-align: center; margin: 2em 0; }
figcaption { font-size: .85em; color: #6b7280; margin-top: .5em; }
table { border: none; width: 100%; }
th, td { border-bottom: 1px solid #e5e7eb; padding: .8em; text-align: left; }
thead th { font-weight: 600; color: #1f2328; }
tr:nth-child(even) { background: transparent; }
hr { border: none; border-top: 1px solid #e5e7eb; margin: 2.5em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .4em 0; }
.wp-toc-floating-wrap { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
                font-family: inherit; }
.wp-toc-h2-link { color: #1f2328; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: #f3f4f6; }
.wp-toc-h3-submenu { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
```

### 6.3 文艺书卷

```css
body { background: #f5efe0; color: #3b2f1e;
       font-family: 'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', serif;
       line-height: 1.95; font-size: 17px; }
h1 { font-size: 2.2em; font-weight: 600; color: #5c3a1e;
     text-align: center; padding: .5em 0;
     border-top: 2px solid #b48a4a; border-bottom: 2px solid #b48a4a; }
h2 { font-size: 1.6em; font-weight: 600; color: #5c3a1e;
     border-left: 6px solid #b48a4a; padding-left: 14px; margin-left: 0; }
h3 { font-size: 1.3em; font-weight: 600; color: #6e4a25; }
h4-h6 { font-weight: 600; color: #6e4a25; }
p { margin: 1.2em 0; text-align: justify; }
a { color: #8b4513; text-decoration: none; border-bottom: 1px dotted #b48a4a; }
blockquote { border-left: 3px solid #b48a4a; padding: .5em 1.2em;
             background: rgba(180, 138, 74, .08); color: #5c3a1e;
             font-style: italic; }
code { font-family: 'Source Code Pro', monospace; background: #ebe3cf;
       padding: .1em .3em; border-radius: 2px; font-size: .9em;
       color: #5c3a1e; }
pre { font-family: 'Source Code Pro', monospace; background: #ebe3cf;
      border: 1px solid #c9b88e; padding: 1em; border-radius: 4px; }
kbd { font-family: monospace; background: #ebe3cf; border: 1px solid #b48a4a;
      border-radius: 4px; padding: .1em .4em; font-size: .85em;
      color: #5c3a1e; }
img { border: 1px solid #c9b88e; border-radius: 2px; }
figure { text-align: center; margin: 1.8em 0; }
figcaption { font-size: .85em; color: #8b6a45; font-style: italic; margin-top: .5em; }
table { border: 1px solid #b48a4a; width: 100%; background: #fdf8eb; }
th, td { border: 1px solid #c9b88e; padding: .6em; }
thead { background: #ebe3cf; font-weight: 700; color: #5c3a1e; }
tr:nth-child(even) { background: #f7f1de; }
hr { border: none; border-top: 1px dashed #b48a4a; margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .4em 0; }
.wp-toc-floating-wrap { background: #fdf8eb; border: 1px solid #c9b88e; font-family: inherit; }
.wp-toc-h2-link { color: #5c3a1e; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: #ebe3cf; }
.wp-toc-h3-submenu { background: #fdf8eb; border: 1px solid #c9b88e; }
```

### 6.4 科技感

```css
body { background: #0d1117; color: #c9d1d9;
       font-family: 'JetBrains Mono', 'Inter', -apple-system, sans-serif;
       line-height: 1.7; font-size: 15px; }
h1 { font-size: 2.2em; font-weight: 700; color: #58a6ff;
     text-shadow: 0 0 12px rgba(88, 166, 255, .3); }
h2 { font-size: 1.6em; font-weight: 600; color: #79c0ff;
     border-bottom: 1px solid rgba(88, 166, 255, .3); padding-bottom: .2em; }
h3 { font-size: 1.3em; font-weight: 600; color: #a5d6ff; }
h4-h6 { font-weight: 600; color: #8b949e; }
p { margin: 1em 0; }
a { color: #58a6ff; text-decoration: none;
    border-bottom: 1px solid rgba(88, 166, 255, .4); }
a:hover { color: #79c0ff; border-bottom-color: #79c0ff; }
blockquote { border-left: 3px solid #58a6ff; padding: .5em 1.2em;
             background: rgba(88, 166, 255, .08); color: #8b949e; }
code { font-family: 'JetBrains Mono', monospace; background: rgba(110, 118, 129, .15);
       padding: .15em .4em; border-radius: 4px; font-size: .88em;
       color: #79c0ff; }
pre { font-family: 'JetBrains Mono', monospace;
      background: rgba(110, 118, 129, .1); border: 1px solid #30363d;
      padding: 1em; border-radius: 6px; font-size: .88em; }
kbd { font-family: monospace; background: rgba(110, 118, 129, .2);
      border: 1px solid #30363d; border-bottom-width: 2px;
      border-radius: 4px; padding: .1em .4em; font-size: .85em;
      color: #c9d1d9; }
img { border-radius: 6px; border: 1px solid #30363d; }
figure { text-align: center; margin: 2em 0; }
figcaption { font-size: .85em; color: #8b949e; margin-top: .5em; }
table { border: 1px solid #30363d; width: 100%; }
th, td { border: 1px solid #30363d; padding: .6em; }
thead { background: rgba(88, 166, 255, .1); color: #58a6ff; font-weight: 700; }
tr:nth-child(even) { background: rgba(110, 118, 129, .05); }
hr { border: none; border-top: 1px solid #30363d; margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .4em 0; }
.wp-toc-floating-wrap { background: rgba(110, 118, 129, .1); border: 1px solid #30363d;
                font-family: inherit; border-radius: 6px; }
.wp-toc-h2-link { color: #58a6ff; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: rgba(88, 166, 255, .15); }
.wp-toc-h3-submenu { background: #161b22; border: 1px solid #30363d; }
```

### 6.5 商务正式

```css
body { background: #f4f6fa; color: #1a2540;
       font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
       line-height: 1.75; font-size: 16px; }
h1 { font-size: 2.2em; font-weight: 700; color: #1f3a68;
     border-bottom: 3px solid #1f3a68; padding-bottom: .25em; }
h2 { font-size: 1.6em; font-weight: 700; color: #1f3a68; }
h3 { font-size: 1.3em; font-weight: 600; color: #2c5282; }
h4-h6 { font-weight: 600; color: #2d3748; }
p { margin: 1em 0; }
a { color: #1f3a68; text-decoration: underline; text-decoration-thickness: 1px; }
blockquote { border-left: 4px solid #1f3a68; padding: .5em 1.2em;
             background: #e8edf5; color: #1a2540; }
code { font-family: 'JetBrains Mono', monospace; background: #e8edf5;
       padding: .15em .35em; border-radius: 3px; font-size: .88em;
       color: #1f3a68; }
pre { font-family: 'JetBrains Mono', monospace; background: #1a2540;
      border: 1px solid #1f3a68; padding: 1em; border-radius: 4px;
      color: #c9d1d9; font-size: .88em; }
kbd { font-family: monospace; background: #fff; border: 1px solid #cbd5e0;
      border-bottom-width: 2px; border-radius: 4px;
      padding: .1em .4em; font-size: .85em; color: #1a2540; }
img { border: 1px solid #cbd5e0; border-radius: 4px; }
figure { text-align: center; margin: 1.5em 0; }
figcaption { font-size: .85em; color: #4a5568; margin-top: .5em; }
table { border: 1px solid #cbd5e0; width: 100%; background: #fff; }
th, td { border: 1px solid #cbd5e0; padding: .7em; }
thead { background: #1f3a68; color: #fff; font-weight: 700; }
tr:nth-child(even) { background: #f4f6fa; }
hr { border: none; border-top: 2px solid #cbd5e0; margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .3em 0; }
.wp-toc-floating-wrap { background: #fff; border: 1px solid #cbd5e0;
                font-family: inherit; border-radius: 4px; }
.wp-toc-h2-link { color: #1f3a68; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: #e8edf5; }
.wp-toc-h3-submenu { background: #fff; border: 1px solid #cbd5e0; }
```

### 6.6 柔雅

```css
body { background: #faf3ee; color: #5c3a2e;
       font-family: 'Cormorant Garamond', 'Noto Serif SC', 'Songti SC', serif;
       line-height: 1.85; font-size: 16px; }
h1 { font-size: 2.2em; font-weight: 600; color: #b06a5c;
     text-align: center; font-style: italic; }
h2 { font-size: 1.5em; font-weight: 600; color: #b06a5c;
     border-radius: 10px; padding: .4em 1em; margin: 1.2em 0;
     background: rgba(176, 106, 92, .08);
     border: 1px solid rgba(176, 106, 92, .2); display: inline-block; }
h3 { font-size: 1.25em; font-weight: 600; color: #c08577; font-style: italic; }
h4-h6 { font-weight: 600; color: #c08577; }
p { margin: 1em 0; }
a { color: #b06a5c; text-decoration: none; border-bottom: 1px solid #d4a39a; }
blockquote { border-left: 3px solid #d4a39a; padding: .6em 1.2em;
             background: rgba(212, 163, 154, .12); color: #5c3a2e;
             border-radius: 0 12px 12px 0; font-style: italic; }
code { font-family: monospace; background: #f3e8e2;
       padding: .15em .35em; border-radius: 6px; font-size: .88em;
       color: #b06a5c; }
pre { font-family: monospace; background: #fff; border: 1px solid #e8d4cb;
      padding: 1em; border-radius: 12px; font-size: .88em; color: #5c3a2e; }
kbd { font-family: monospace; background: #fff; border: 1px solid #d4a39a;
      border-radius: 6px; padding: .1em .4em; font-size: .85em;
      color: #5c3a2e; }
img { border-radius: 16px; }
figure { text-align: center; margin: 1.8em 0; }
figcaption { font-size: .85em; color: #b06a5c; font-style: italic; margin-top: .5em; }
table { border: none; width: 100%; background: #fff; border-radius: 12px;
        border-collapse: separate; border-spacing: 0;
        box-shadow: 0 2px 8px rgba(176, 106, 92, .1); overflow: hidden; }
th, td { padding: .8em 1em; text-align: left; }
thead { background: #f3e8e2; color: #b06a5c; font-weight: 700; }
tr:nth-child(even) { background: #faf3ee; }
hr { border: none; border-top: 1px solid #e8d4cb; margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .4em 0; }
.wp-toc-floating-wrap { background: #fff; border: 1px solid #e8d4cb;
                font-family: inherit; border-radius: 16px; }
.wp-toc-h2-link { color: #b06a5c; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: #f3e8e2; }
.wp-toc-h3-submenu { background: #fff; border: 1px solid #e8d4cb; border-radius: 12px; }
```

### 6.7 薄荷清新

```css
body { background: #eaf6ef; color: #1f3d2c;
       font-family: 'Nunito', 'Noto Sans SC', -apple-system, sans-serif;
       line-height: 1.75; font-size: 16px; }
h1 { font-size: 2.2em; font-weight: 700; color: #2c8a6b; }
h2 { font-size: 1.6em; font-weight: 700; color: #2c8a6b;
     position: relative; padding-left: 1em; }
h2::before { content: '🌿'; position: absolute; left: 0; font-size: .8em; }
h3 { font-size: 1.3em; font-weight: 600; color: #3aa17e; }
h4-h6 { font-weight: 600; color: #3aa17e; }
p { margin: 1em 0; }
a { color: #2c8a6b; text-decoration: none; border-bottom: 2px dotted #3aa17e; }
blockquote { border-left: 4px solid #3aa17e; padding: .5em 1.2em;
             background: rgba(58, 161, 126, .08); color: #1f3d2c;
             border-radius: 0 8px 8px 0; }
code { font-family: 'JetBrains Mono', monospace; background: #d8efe2;
       padding: .15em .35em; border-radius: 4px; font-size: .88em;
       color: #2c8a6b; }
pre { font-family: 'JetBrains Mono', monospace; background: #fff;
      border: 1px solid #b8e0c9; padding: 1em; border-radius: 8px;
      font-size: .88em; }
kbd { font-family: monospace; background: #fff; border: 1px solid #b8e0c9;
      border-bottom-width: 2px; border-radius: 4px;
      padding: .1em .4em; font-size: .85em; color: #1f3d2c; }
img { border-radius: 12px; }
figure { text-align: center; margin: 1.8em 0; }
figcaption { font-size: .85em; color: #3aa17e; margin-top: .5em; }
table { border: 1px solid #b8e0c9; width: 100%; background: #fff; border-radius: 8px; }
th, td { border: 1px solid #d8efe2; padding: .6em; }
thead { background: #d8efe2; color: #1f3d2c; font-weight: 700; }
tr:nth-child(even) { background: #f4fbf7; }
hr { border: none; border-top: 1px solid #b8e0c9; margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .4em 0; }
.wp-toc-floating-wrap { background: #fff; border: 1px solid #b8e0c9;
                font-family: inherit; border-radius: 12px; }
.wp-toc-h2-link { color: #2c8a6b; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: #d8efe2; }
.wp-toc-h3-submenu { background: #fff; border: 1px solid #b8e0c9; border-radius: 8px; }
```

### 6.8 复古印刷

```css
body { background: #d9c9a8; color: #3a2f1d;
       font-family: 'Old Standard TT', 'Noto Serif SC', 'Songti SC', serif;
       line-height: 1.85; font-size: 16px;
       background-image:
         repeating-linear-gradient(0deg, transparent 0, transparent 23px,
                                 rgba(58, 47, 29, .04) 23px, rgba(58, 47, 29, .04) 24px); }
h1 { font-size: 2.4em; font-weight: 700; color: #3a2f1d;
     letter-spacing: .15em; text-transform: uppercase;
     text-align: center; padding: .3em 0;
     border: 3px double #3a2f1d; border-left: none; border-right: none; }
h2 { font-size: 1.6em; font-weight: 700; color: #3a2f1d;
     border-bottom: 1px solid #3a2f1d; padding-bottom: .15em; }
h3 { font-size: 1.3em; font-weight: 600; color: #3a2f1d; font-style: italic; }
h4-h6 { font-weight: 600; color: #3a2f1d; }
p { margin: 1em 0; text-align: justify; }
a { color: #3a2f1d; text-decoration: underline; text-decoration-style: double; }
blockquote { border: 2px solid #3a2f1d; padding: .6em 1.2em;
             background: rgba(217, 201, 168, .5); color: #3a2f1d;
             font-style: italic; }
code { font-family: 'Courier Prime', monospace; background: rgba(58, 47, 29, .08);
       padding: .1em .3em; border-radius: 0; font-size: .88em; }
pre { font-family: 'Courier Prime', monospace; background: rgba(58, 47, 29, .04);
      border: 1px solid #3a2f1d; padding: 1em;
      font-size: .88em; }
kbd { font-family: monospace; background: #d9c9a8; border: 2px solid #3a2f1d;
      padding: .1em .4em; font-size: .85em; color: #3a2f1d;
      box-shadow: 2px 2px 0 #3a2f1d; }
img { border: 2px solid #3a2f1d; filter: sepia(.15) contrast(.95); }
figure { text-align: center; margin: 1.5em 0; }
figcaption { font-size: .85em; color: #3a2f1d; font-style: italic;
             letter-spacing: .05em; margin-top: .5em; }
table { border: 2px solid #3a2f1d; width: 100%; background: #d9c9a8; }
th, td { border: 1px solid #3a2f1d; padding: .5em; }
thead { background: rgba(58, 47, 29, .15); font-weight: 700; text-transform: uppercase;
       letter-spacing: .05em; }
tr:nth-child(even) { background: rgba(58, 47, 29, .06); }
hr { border: none; border-top: 3px double #3a2f1d; margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .3em 0; }
.wp-toc-floating-wrap { background: rgba(58, 47, 29, .04); border: 1px solid #3a2f1d;
                font-family: inherit; }
.wp-toc-h2-link { color: #3a2f1d; }
.wp-toc-h2-item:hover > .wp-toc-h2-link { background: rgba(58, 47, 29, .1); }
.wp-toc-h3-submenu { background: #d9c9a8; border: 1px solid #3a2f1d; }
```

---

## 7. UI 形态(Ribbon 设计按钮 + 16:9 缩略图面板)

### 7.1 Ribbon 按钮位置

```
┌────────────────────────────────────────────────────────────────────┐
│ [Ribbon]                                                            │
│  [文件] [编辑] [设计 ▼] [视图] [插入] [格式] [帮助]                  │
└────────────────────────────────────────────────────────────────────┘
```

### 7.2 面板布局(下拉)

点击「设计 ▼」→ 弹出 16:9 缩略图面板(类似 Word"设计"选项卡):

```
┌─────────────────────────────────────────────────────────────┐
│ 文档设计                                                    │
├─────────────────────────────────────────────────────────────┤
│ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ │
│ │ ▓▓▓▓▓ │ │ ░░░░░ │ │ ▒▒▒▒▒ │ │ █████ │ │ ▓▓▓▓▓ │ │ ░░░░░ │ │
│ │ ▓▓▓▓▓ │ │ ░░░░░ │ │ ▒▒▒▒▒ │ │ █████ │ │ ▓▓▓▓▓ │ │ ░░░░░ │ │
│ │       │ │       │ │       │ │       │ │       │ │       │ │
│ │ 默认 │ │经典学术│ │现代简约│ │文艺书卷│ │科技感 │ │商务正式│ │
│ └───────┘ └───────┘ └───────┘ └───────┘ └───────┘ └───────┘ │
│ ┌───────┐ ┌───────┐ ┌───────┐                              │
│ │ ▒▒▒▒▒ │ │ ▓▓▓▓▓ │ │ █████ │                              │
│ │ ▒▒▒▒▒ │ │ ▓▓▓▓▓ │ │ █████ │                              │
│ │       │ │       │ │       │                              │
│ │ 柔 雅 │ │薄荷清新│ │复古印刷│                            │
│ └───────┘ └───────┘ └───────┘                              │
└─────────────────────────────────────────────────────────────┘
```

- **6 列 × 2 行 = 12 格**(实际 9 张卡 + 3 空)
- 卡片 = 真实 16:9 渲染预览(样例 HTML 用该 CSS 渲染的截图)
- 卡片悬停:轻微阴影 + scale(1.02)
- 卡片选中:外环高亮(2px solid #1f3a68 或对应设计主色)
- 面板宽度 ~480px,固定在 Ribbon 下方

### 7.3 "默认"卡片(第一格)

缩略图 = 一份样例 HTML 在**无任何 design CSS 注入**下的渲染(浏览器默认:Times New Roman, 蓝色链接,默认行距等)。点它 → 清除所有 design style。

### 7.4 缩略图生成(方案 α 详细)

1. **触发时机**:用户首次点击「设计」按钮时启动生成(可在空闲时预生成,后续直接用缓存)
2. **实现**:
   - 创建 9 个 hidden `<iframe>`(`width: 320px; height: 180px; position: absolute; left: -9999px`)
   - 每个 iframe 的 srcdoc = 同一份样例 HTML + 各自的设计 CSS + tocGen CSS 模拟
   - 监听每个 iframe 的 `load` 事件 → 用 `html2canvas` 截图 → 存为 dataURL
   - `<DesignThumb>` 组件用 dataURL 作为 `background-image`
3. **缓存**:dataURL 缓存在 React state,不再二次生成
4. **失败回退**:html2canvas 失败 → 显示一个 fallback 静态预览(纯色背景 + 文字)

### 7.5 性能预算

- 9 张缩略图 × 渲染 + 截图 ≈ 200-400ms(实测后调整)
- 一次性生成,不阻塞面板打开
- 若想更快:首版用 β 静态 SVG 缩略图,后续升级 α

---

## 8. 与 tocGen.ts 的协同

### 8.1 tocGen.ts 改造点(最小)

- `buildTocStyleTag()` 输出加 `data-weavepage-toc` 属性:
  ```ts
  return `<style data-weavepage-toc>\n${TOC_CSS}\n</style>`;
  ```
- TOC 结构 class(`.wp-toc-h2-item` 等)命名不变,设计 CSS 通过同名选择器覆写视觉

### 8.2 注入顺序

iframe srcdoc `<head>` 中的顺序(后注入者优先级更高):
```
<style data-weavepage-toc>...</style>     ← tocGen 的 TOC_CSS
<style data-weavepage-design="X">...</style>  ← 设计 CSS(覆写 TOC 视觉)
<script data-weavepage-toc>...</script>
```

### 8.3 设计 CSS 中的目录覆写

每个设计 CSS 都包含 `.wp-toc-floating-wrap` / `.wp-toc-h2-link` / `.wp-toc-h3-submenu` 的视觉覆写(见 §6 每套 CSS 末尾)。TOC 的 hover 行为(`is-active` / `has-submenu-open` 等 JS 控制 class)不受影响,因为设计 CSS 不重写交互 class。

---

## 9. 错误处理 / 边界

| 场景 | 行为 |
|---|---|
| 打开旧 HTML,`<style data-weavepage-design>` 的 id 在新版本 designs.ts 已不存在 | 回退到 currentDesignId = null,不崩溃;面板高亮"默认"格 |
| 解析 HTML 时遇到多个 `[data-weavepage-design]` style(理论上不会出现,但用户可能复制粘贴) | 取第一个,忽略其他;下次切换时清掉多余的 |
| 缩略图生成失败(html2canvas 异常) | fallback 静态预览 + console.warn,不影响面板操作 |
| 设计 CSS 语法错误(理论上不会发生,因为是开发期写死字符串) | 浏览器忽略该 style 块;WeavePage 显示 toast"该设计样式加载失败,已回退到默认" |
| 切换过程中 docHtml 字符串被破坏(并发编辑) | applyDesign 用正则匹配,不影响其他内容;若 setDocHtml 失败 → toast 提示,currentDesignId 不更新 |
| 文本 doc(kind === 'text') | Ribbon 设计按钮 **disabled**,tooltip 提示"纯文本文档不支持设计样式" |
| source 模式 | Ribbon 设计按钮 **disabled**,tooltip 提示"请切换到编辑视图" |
| 缩略图字体加载失败(Google Fonts 不可用) | 浏览器降级到系统字体,缩略图仍能渲染(只是字体不同);真实编辑器也降级到系统字体,体验一致 |

---

## 10. 数据流(详细)

### 10.1 切换设计(用户点某卡)

```
1. 用户点 "现代简约" 卡
2. DesignPickerPanel → onApply('modern-minimalist')
3. App.applyDesign('modern-minimalist'):
   a. css = getDesignById('modern-minimalist').css
   b. newDocHtml = docHtml
        .replace(/<style[^>]*data-weavepage-design[^>]*>[\s\S]*?<\/style>/g, '')
        .replace(/(<style[^>]*data-weavepage-toc>[\s\S]*?<\/style>)/, `$1\n<style data-weavepage-design="modern-minimalist">${css}</style>`)
   c. setDocHtml(newDocHtml)   ← iframe srcdoc 重渲
   d. setCurrentDesignId('modern-minimalist')  ← 面板高亮
4. (不持久化)
5. 用户继续编辑 → 一切正常,设计 CSS 在编辑视图中持续生效
```

### 10.2 点击默认卡

```
1. 用户点 "默认" 卡
2. onApply(null)
3. App.applyDesign(null):
   a. newDocHtml = docHtml.replace(/<style[^>]*data-weavepage-design[^>]*>[\s\S]*?<\/style>/g, '')
   b. setDocHtml(newDocHtml)
   c. setCurrentDesignId(null)
4. 编辑视图回到浏览器默认渲染
```

### 10.3 打开 HTML 文档

```
1. App.applyDoc(filePath):
   a. 读取文件 → docHtml
   b. designId = parseDesignId(docHtml)  ← 解析 [data-weavepage-design] 第一个
   c. setDocHtml(docHtml)
   d. setCurrentDesignId(designId)  ← 用于显示面板选中态
   e. (不修改 docHtml,只是读)
```

### 10.4 保存

- 用户点保存 /另存为 = Tauri 标准 save流程
- docHtml 字符串已经包含(或没包含)设计 style
- 写入磁盘的 HTML 文件就**真有**那个 `<style>` 块
- 无需任何额外步骤

### 10.5 源代码视图

- 切换到 source 模式 → 用户看到 `<style data-weavepage-design="X">...</style>` 在 `<head>` 中
- 用户可编辑该 style 内容(高级用户)
- 切回 edit 模式 → iframe 重渲时使用**用户编辑后的** style 内容
- "当前设计"标记**仍**显示原名(因为 data-weavepage-design="X" 的 X 没变,只是 CSS 内容变了)
- 用户编辑源代码 → 编辑视图自动同步:**下一阶段 TODO**(用户标记为可延后)

---

## 11. 测试要点(手测 / E2E)

实施阶段手测用例(本阶段只出图,不实施):

1. **打开空白文档** → 点「设计」 → 面板弹出,9 张缩略图依次显示 → 点「默认」高亮 → 编辑视图 = 浏览器默认
2. **点「经典学术」** → 编辑视图立即变白底衬线严谨风 → 文档 `<head>` 出现 `<style data-weavepage-design="classic-academic">` → 保存 → 关闭 → 重开文件 → 还是这个样式
3. **点「现代简约」** → 编辑视图换风格 → 旧的 design style 被替换(不是叠加)
4. **点「科技感」** → 立刻深色 + 衬线 → 表格/code 都有相应调整
5. **在"科技感"状态下点「默认」** → 所有 design style 移除,回到浏览器默认
6. **打开外部 HTML 文件**(包含 design style)→ 自动识别 → 面板对应卡高亮
7. **打开外部 HTML 文件**(无 design style)→ 「默认」卡高亮
8. **打开旧 HTML,design style id 已废弃** → 「默认」卡高亮,不报错
9. **文本 doc** → Ribbon 设计按钮 disabled
10. **source 模式** → Ribbon 设计按钮 disabled
11. **缩略图悬停** → scale 1.02 + 阴影
12. **缩略图选中态** → 外环高亮
13. **保存后再打开** → 设计样式自动恢复
14. **多次切换不同设计** → docHtml 中始终只有 1 个 `[data-weavepage-design]` style(没有叠加)
15. **目录**:在每个设计下,目录颜色/字体/背景与主风格一致(文艺书卷 → 米黄;科技感 → 深色面板)

---

## 12. 不在本次范围

- 设计的用户自定义微调(主色/字体大小/行距)
- 主题 × 排版 正交组合
- 用户上传 / 导入自定义 CSS
- 缩略图的进一步个性化(如用真实文档内容预览)
- 源代码视图修改 → 编辑视图自动同步(下一阶段 TODO)
- 设计的导出 / 共享

---

## 13. 发布路径

1. 实施完成后 `pnpm tauri build`(两个渠道)
2. 内部冒烟:8 张切换 + 默认清除 + 保存重开 + 目录风格跟随
3. 真机验证(sandbox-verify weavepage;按用户偏好:不上传前不 commit)
4. 上传 `_upload_weavepage.py` → 升级 minor 版本号到 v2.1.0 → release notes 写「新增:文档设计(8 个预设样式 + 默认)」

---

## 14. 本阶段交付(只出图,不实施)

按用户要求,**本会话只交付设计 + 8 张效果图**,实施代码(spec §5)留作下一阶段。本阶段产出:

- 本 spec 文件(已 commit)
- 8 张效果图(每个风格 1 张,展示该设计在真实样例 HTML 上的渲染效果)
- 下一阶段实施路径(spec §5 + plan 文件)

**下一阶段前置**:
- 用户审阅 8 张效果图 → 批准 / 要求调整某个风格
- 批准后 → 写 plan(spec → plan → 实施 → 真机验证 → release)