# Tiptap 桌面编辑器 Word 功能区 UI 设计

> 日期：2026-08-13
> 状态：已获用户确认
> 项目：`F:\soft\00selfmade\tiptap_app`（Tauri v2 + React 19 + Tiptap 3.29）

## 背景

用户要求：对 UI 进行头脑风暴规划，保证 HTML 编辑主要功能方便调用，界面美观。用户已选定：
- 功能范围：排版增强 + 表格 + 图片 + 源码视图（全套）
- 视觉风格：Word 功能区风格（白底、蓝色强调色、图标+文字标签、分组功能区）
- 编辑区布局：页式视图 / 全宽视图 两者可切换

## 整体结构（自上而下）

```
标题栏：文档名* - Tiptap Editor          （保留）
菜单栏：文件 | 编辑 | 视图               （保留并扩展）
功能区： [开始] [插入] [视图] ＋折叠按钮  （新增，核心改造）
编辑区：页式（灰底白纸）⇄ 全宽（直铺）   （可切换，持久化到 localStorage）
状态栏：字数 N ｜ 视图模式 ｜ 主题         （新增）
```

## 选项卡设计

### 开始（默认）
- **撤销/重做组**：撤销、重做
- **字体组**：字体下拉、字号下拉、B I U S（粗/斜/下划/删除线）、文字颜色、高亮
- **段落组**：对齐（左/中/右/两端）、无序/有序/任务清单、减少/增加缩进、引用、代码块
- **样式组**：正文、标题1、标题2、标题3
- **链接组**：插入链接

### 插入
- **表格**：4×4 网格下拉选择器（拖选行列数）；选中表格后出现行/列增删按钮
- **图片**：系统文件对话框 → 读取为 base64 data URL 嵌入（避免 asset 协议配置，图片随 HTML 保存）
- **水平线**、**链接**

### 视图
- 页式/全宽切换（状态持久化）
- 源码视图切换：编辑区变等宽字体 textarea 显示原始 HTML，退出时解析回编辑器（不引入 CodeMirror）
- 主题：跟随系统 / 浅色 / 深色

## 菜单栏扩展

- **文件**：新建、打开、保存、另存为、**导出网页**（保存=内容片段；导出=带 DOCTYPE/head 的完整 .html）
- **编辑**：撤销、重做、剪切/复制/粘贴、全选。**查找替换 v1 不做**（依赖浏览器 Ctrl+F），留待后续
- **视图**：页式/全宽、源码视图、主题、折叠功能区

## 状态栏

左侧实时字数统计；右侧视图模式 + 主题快捷切换。

## 技术要点

### 新增 Tiptap 扩展（npm 包）
- `@tiptap/extension-underline`
- `@tiptap/extension-text-style`（字体/颜色依赖的基座）
- `@tiptap/extension-color`
- `@tiptap/extension-highlight`
- `@tiptap/extension-text-align`
- `@tiptap/extension-font-family`
- `@tiptap/extension-image`
- `@tiptap/extension-table` + `extension-table-row` + `extension-table-header` + `extension-table-cell`
- `@tiptap/extension-task-list` + `extension-task-item`
- `@tiptap/extension-placeholder`
- `@tiptap/extension-subscript` + `@tiptap/extension-superscript`（可选，若做上/下标）

### 关键实现决策
- 图片走 `plugin-fs` 读文件 → base64 data URL（优点：零协议配置；代价：大图增大 HTML 体积，本地编辑器合理取舍）
- 源码视图：`editor.getHTML()` → textarea；退出 `editor.commands.setContent(textarea.value)`；解析失败提示并保持源码模式
- 表格行列操作：光标在表格内时激活「插入」选项卡行列按钮；网格选择器为自研 4×4 小组件
- 字体列表：宋体/微软雅黑/黑体/楷体/Arial/Georgia/Consolas 等系统常见字体
- 字号：9pt–36pt 常用档位（10, 12, 14, 16, 18, 24, 36）

### 代码结构（组件拆分，避免 App.tsx 膨胀）
```
src/
├── App.tsx            # 装配：编辑器实例 + 布局
├── components/
│   ├── MenuBar.tsx    # 文件/编辑/视图菜单
│   ├── Ribbon.tsx     # 选项卡外壳 + 折叠
│   ├── RibbonHome.tsx # 开始选项卡
│   ├── RibbonInsert.tsx
│   ├── RibbonView.tsx
│   ├── TableGridPicker.tsx  # 4×4 网格选择器
│   ├── FontSelect.tsx       # 字体/字号下拉
│   └── StatusBar.tsx
├── hooks/useEditorFile.ts   # 文件操作逻辑（新/开/存/另存/导出）
└── utils/fonts.ts           # 字体与字号常量表
```

### 错误处理
- 打开/保存/导出失败：界面提示（轻量 toast 或 alert 兜底）
- 图片读取失败：提示且不中断编辑
- 源码视图解析失败：提示并停留在源码模式（内容不丢失）

## 明确不做（v1 范围外）

- 查找/替换面板（用浏览器 Ctrl+F）
- 原生 OS 菜单栏（tauri menu API）
- CodeMirror 源码编辑器
- 协同编辑、云同步
- 打印/PDF 导出

## 成功标准

- 打开长 HTML 文档滚动条正常（已修复）
- 三个选项卡功能区完整可用，按钮带图标+文字、hover/active 状态、浅深主题适配
- 页式/全宽切换即时生效并持久化
- 表格/图片/源码视图/导出网页均可实际操作
- `pnpm build` + `cargo check` 通过，打包产物正常
