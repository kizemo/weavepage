# WeavePage v0.1.13

## 修复(v0.1.12 装机测试反馈)

### 1. 目录(TOC)在编辑界面位置/宽度异常
- **症状**:插入 TOC 后,`<nav class="doc-toc">` 在 ProseMirror 中被解析为多个段落,导致 CSS `.doc-toc { display: inline-block }` 失效,目录全宽溢出 HTML 页面
- **根因**:ProseMirror schema 不识别 `<nav>`,children 被拆解成段落堆叠
- **修复**:新增 PM 原子节点 `docToc`(src/extensions/DocToc.ts),用 `<div class="doc-toc" data-wp-doc-toc>` 取代 `<nav>`,PM 把它当作不可拆解的整体,innerHTML 作为 attr 存储往返,不再被 schema 拆解

### 2. 悬浮按钮只显示图标不显示文字
- **症状**:右上角悬浮按钮仅显示 `📑`,识别度不够
- **修复**:改为「📑 目录」圆角胶囊样式(emoji + 文字),信息传达更明确

### 3. 悬停悬浮按钮无响应
- **症状**:未打开过预览视图时,hover 按钮无展开反应;打开预览后再 hover 才生效
- **根因**:v0.1.12 用 JS `mouseenter`/`mouseleave` 切 `is-open` class 触发面板显隐,useEffect 时机不稳导致首次挂载未挂上
- **修复**:完全改成 CSS `.wp-toc-floating-wrap:hover .wp-toc-floating-panel { display: block }`,无 JS 时序问题

### 4. 编辑界面的目录面板只显示标题不显示 h2/h3 列表
- **症状**:hover 悬浮按钮展开后,面板只有「目录 ▾」标题,下方的章节列表为空
- **根因**:同问题 #1 — 因为目录堆叠为段落,`<a>` 链接被解析为段落文本而非 nav,导致 `scanHeadings` 误读 DOM 结构
- **修复**:DocToc 原子节点保证结构稳定,TocFloating 面板 entries 直接从 scanHeadings 读取真实 h2/h3,稳定显示

### 5. 插入目录后,在页面顶部堆叠多个「目录」+ Backspace 反而增加
- **症状**:每次 regenDocToc / onUpdate 都在文档首插入新的目录堆叠,Backspace 触发 onTransaction → scheduleRegen → 再次插入
- **根因**:`removeDocToc` 通过 `querySelector('nav.doc-toc')` 在 DOM 中找旧 nav,因 PM 把 nav 拆成段落,DOM 里根本没有 `nav.doc-toc` 元素,remove 静默 noop,insert 继续堆叠
- **修复**:`removeDocToc` / `setOrInsertDocToc` 改走 PM state(`state.doc.descendants` 找 `node.type.name === "docToc"`),原子事务 `tr.setNodeMarkup` / `tr.delete` / `tr.insert`,不再依赖 DOM 查询,无堆栈风险

### 6. 历史文档里的「目录」段落堆栈迁移
- **症状**:v0.1.12 保存过的文档,其 HTML 里残留多组「目录 ▾」+ 章节段落,加载后视觉异常
- **修复**:加载时 `migrateLegacyTocParagraphs` 一次性合并连续「目录」段落为一个 docToc 原子节点,然后 regenDocToc 用真实 heading 列表覆盖,自动 `isModified=true` 提醒用户保存

## 技术变更

- 新增扩展: `src/extensions/DocToc.ts`(PM 原子节点 + `data-wp-doc-toc` 序列化)
- 新增 utils: `migrateLegacyTocParagraphs` / `setOrInsertDocToc`(基于 PM state 而非 DOM)
- TocFloating 简化为纯 CSS hover + 静态文本
- App.css 移除重复 TOC 规则、按钮升级为「emoji + 文字」胶囊样式、CSS 变量收敛
- 测试:25 个单元测试全部 PASS,新增 2 个新 wrapper / data-attr 序列化断言
