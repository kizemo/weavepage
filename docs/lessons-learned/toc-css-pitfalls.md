# TOC 调试 lessons learned (v0.1.13 25 轮总结)

> 写于 v0.1.13 第 25 轮。承接 `handoff-toc-v0.1.13-2026-08-22.md`(24 轮失败的复盘)。

## 1. Tiptap atom 渲染的硬规则

### 1.1 `div.innerHTML = "<script>..."` 不会执行
- W3C 标准:`innerHTML` 创建 DOM 时,`<script>` 标签**只 parse,不执行**
- Tiptap atom 节点用 `renderHTML` 输出 div,然后 PM 在 `div.innerHTML = tocHtml` 时**不会执行** tocHtml 内的 `<script>`
- 后果:在 atom 节点里嵌 `<script>` 想"自带交互" → 编辑视图永远不执行(预览 iframe 才会执行)
- 修法:把交互逻辑移到**编辑器外的注入脚本**(预览 iframe doc 注入)或**React 端的事件委托**

### 1.2 `div.innerHTML = "<style>..."` 在 contenteditable 内可能被忽略
- 浏览器会把 `<style>` 创建并 append,但 style element 在 contenteditable=true 的祖先里**可能被某种规则过滤**
- handoff §2.1 #1 提到"Tiptap 不解析 atom 内 `<style>`" —— 这条规则**不严谨**但实践中确实不可靠
- 修法:把 CSS 放**全局样式表**(如 App.css),靠稳定类名匹配;不要依赖 atom 内的 `<style>`

### 1.3 atom 重新渲染时,内联 `style` 属性保留,内联 `<style>` 标签丢弃
- PM 重新渲染 atom → `div.innerHTML = node.attrs.tocHtml` → 新的 style element 被创建,但旧 style element 引用丢失
- inline `style="position: fixed; ..."` 是 attribute,DOM 元素重建时 attribute 保留
- **所以 inline style 属性可靠,inline `<style>` 不可靠**

## 2. 点击 / 跳转的事件链

### 2.1 click 委托 ID 必须匹配
- 委托代码:`target.closest('[id^="toc-floating-btn-"]')` 找按钮
- 如果 button 没有 `id` 属性,closest 返回 null,委托死代码
- **24 轮失败的关键 bug**:App.tsx click 委托假设 button 有 `id="toc-floating-btn-${uid}"`,但 tocGen.ts 没输出这个 id
- 修法:tocGen 输出 btn/panel 都带 `id="toc-floating-btn-${uid}"` / `id="toc-floating-panel-${uid}"`

### 2.2 iframe sandbox 不让 click 冒泡到主 window
- `sandbox="allow-scripts"` 不含 `allow-same-origin` → iframe 是不同源
- 主 window 的 document click 委托**收不到** iframe 内的事件
- 后果:编辑视图 click 委托 work,预览视图(在 iframe 内)click 委托**不 work**
- 修法:iframe 内交互逻辑必须在 iframe 自己的 document 里(注入 script),不能靠主 window 委托

## 3. heading id 必须写到 PM node.attrs,不能只 setAttribute

### 3.1 setAttribute 不会同步到 node.attrs
- handoff §3 提到 Task 12 review 发现:`el.setAttribute("id", "...")` 不会反映到 PM 节点 attrs
- `editor.getHTML()` 序列化时**只读 node.attrs,不读 DOM attribute**
- 后果:DOM 上 heading 有 id,但 `editor.getHTML()` 输出的 HTML 没 id → saved file / 预览 / export HTML 都没 id → anchor 跳转失败

### 3.2 唯一可靠的修法:走 PM transaction.setNodeMarkup
- `tr.setNodeMarkup(pos, undefined, newAttrs)` 写入 node.attrs
- `editor.getHTML()` 才会输出 id
- 必须 `posAtDOM` 拿到正确位置,`nodeAt(pos)` 拿到正确节点

## 4. `position: fixed` 的限制

### 4.1 浏览器对 fixed 的 containing block 规则
- W3C:`position: fixed` 应相对 viewport 定位
- 但如果祖先有 `transform`、`will-change: transform`、`perspective`、`filter`、`contain: paint/strict/content` → fixed 元素被这些祖先 contain
- Tauri webview(Chromium 内核)严格遵循 W3C
- 实测:WeavePage `.editor-scroll { overflow-y: auto; position: relative }` 不影响 fixed(`offsetParent: null`)
- handoff §4.1 怀疑"wrap 在视窗顶但超出页面"是错的 — 实测 `position: fixed` 真生效

## 5. 跨视图 CSS / JS 策略

### 5.1 编辑视图(主 window)
- 共享主 React App 的 CSS(`App.css`):hover 等规则直接生效
- 用 React 端的事件委托(`document.addEventListener('click', ...)`)

### 5.2 预览 iframe
- iframe 是独立 document,**不继承**主 window 的 CSS
- 必须在 `previewDoc` 里**注入**必要的 CSS / JS
- 注入位置:`basePreview.replace(/<\/body>/i, injectScript + "</body>")`

## 6. 测试通过 ≠ 用户实机工作

### 6.1 单元测试用 mock editor
- mock 只验证函数调用模式,不验证 PM transaction 真的 dispatch 到 DOM
- 单元测试通过 ≠ 端到端 work
- 修法:**真机 devtools 验证**(读 element.style / outerHTML / getComputedStyle)

### 6.2 集成测试在 linkedom 下不完整
- Tiptap 的 view 渲染依赖真实浏览器 DOM API,linkedom 解析 heading 不完整
- `editor.view.dom.innerHTML` 在 linkedom 下只显示 `<p><BR>`,h2/h3 缺失
- 集成测试在 linkedom 下无法验证 heading id 序列化
- 修法:**用真浏览器或 jsdom**(jsdom 在 Node 24 上需要 polyfill)

## 7. 24+ 轮失败的核心模式

### 7.1 改参数解决不了架构问题
- 24 轮里大部分在调 `top/right`、`display`、`z-index`、`overflow` 等参数
- 这些调整对架构性 bug(click 委托 ID 不匹配 / inline `<script>` 不执行)**完全无效**
- **看到参数怎么调都无效时,立即停止并质疑架构**

### 7.2 没看实际渲染就改源码
- 24 轮没人在 devtools 里看 wrap 元素的 `outerHTML` 或 `getComputedStyle().position`
- 所有"修复"基于猜 → 全部错
- 修法:**先 devtools,再改源码**

## 8. 已修 / 未修清单(2026-08-22 第 25 轮)

| Bug | 状态 | 修法 |
|---|---|---|
| Bug A:click 委托 ID 不匹配 | ✓ 已修 | tocGen 给 btn/panel 加 `id="...-${uid}"` |
| Bug B:编辑视图 inline `<script>` 不执行 | ✓ 已修 | 移除 inline `<script>`,编辑视图靠 App.css `:hover`,预览视图靠 previewDoc 注入 |
| Bug D:wrap position:fixed 不生效 | ✓ 已验证 work | 用户真机测 `offsetParent: null`,fixed 真生效 |
| Bug C:点击 anchor 不跳转 | � 待验证 | **h2 没 id 是真正根因** — 待真机验证 assignHeadingIds 是否真写到 node.attrs |
| Bug 2:预览 h3 不展开 | ✓ 已修 | previewDoc 注入 `PREVIEW_TOC_HOVER_SCRIPT` |

## 9. 待验证(等用户 build 新代码后真机测)

1. `pnpm release:both` build 新代码
2. 装新版本(用户偏好真机测试)
3. 启用 TOC → export HTML → Chrome 打开 → 跑验证脚本
4. 重点看:
   - `btn id` / `panel id` 形如 `toc-floating-btn-xxx` / `toc-floating-panel-xxx`?
   - `h2 first id` 是否非空(`wp-toc-xxx`)?
   - 点击条目是否跳转?
   - 预览视图 hover / 点击 work?
5. 如果 h2 id 仍空:调查 assignHeadingIds 端到端是否真生效(可能 linkedom 集成测试不够,需要真机验证)
