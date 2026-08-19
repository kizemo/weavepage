# WeavePage v0.1.12

## 新增

- **文档目录(TOC)功能**:Ribbon 插入组新增「📑 目录」按钮,扫描 h2/h3 标题生成可折叠目录与锚点
  - 文档文档首插入 `<nav class="doc-toc">` 目录块(默认只显示「目录 ▾」,hover 展开)
  - 右上角常驻悬浮按钮(hover 展开面板,250ms 后自动折叠)
  - 带 h3 子标题的 h2 悬停时向左弹出 h3 子菜单
  - 点击目录项平滑滚动到对应标题位置 + 自动 focus 编辑器
  - 离焦(blur / 离开标题节点 / 400ms debounce)后自动重生成目录
  - 切文档 / 关闭文档 / 保存文件 / 切换模式前自动 flush 重建
  - 网页预览(iframe)内独立渲染同样 UI(注入 CSS + JS)
  - 标题 ID 通过 ProseMirror transaction 同步到 node state,保证保存/预览锚点不失效
  - 文本 doc / source 模式禁用 TOC(避免对非 HTML 文档误用)
  - 已知限制:仅支持 h2 / h3(h1 / h4-h6 忽略);不支持目录拖拽 / 用户自定义样式

## 修复

- 无

## 技术变更

- 新增 devDep: `linkedom`(用于测试中模拟 DOM 树,因 Node 24 未带 WHATWG DOMParser)
- 新增 helper `src/utils/testDom.ts`(测试用 linkedom 包装)
- 测试覆盖:24 个单元测试(node:test + tsx)全部 PASS