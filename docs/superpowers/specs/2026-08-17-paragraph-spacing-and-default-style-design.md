# 段落间距工具栏 + 「设为默认样式」 设计

> 日期：2026-08-17
> 状态：已获用户确认（澄清会 5 题全部锁定）
> 项目：`F:\soft\00selfmade\tiptap_app`（Tauri v2 + React 19 + Tiptap 3.30）
> 目标版本：v0.1.4（继 v0.1.3 之后）

## 背景

用户提出两项功能增强：

1. **工具栏增加段间距控件**：行间距 / 段前 / 段后 三个 SelectControl，预设值 + 自定义输入
2. **「设为默认样式」**：把当前光标所在块的显式样式写入 head 内嵌 CSS，使同类块全部跟随；通过右键菜单触发

澄清会用户确认的 5 个决策点：

| 维度 | 决策 |
|---|---|
| CSS 写哪里 | 仅 head 内嵌 style（`<style id="weavepage-default-styles">`），外联 css 写回留到下一版 |
| 容器范围 | p / h1 / h2 / h3 / h4 / h5 / h6（共 7 个选择器） |
| 属性粒度 | 仅「显式改过」的属性（不读 computedStyle 全量），白名单 8 项 |
| 已存在行内样式处理 | 不动，只加 CSS 规则（已有行内的段落优先级更高，保留特例） |
| 触发入口 | 右键菜单第 2 项「设为默认样式」（已有第 1 项「块源码」） |
| CSS 写入机制 | 单一命名块 upsert（不直接 append，避免同选择器重复） |

## 架构

新增一个工具模块 + Ribbon 段落组扩展 + 右键菜单扩展，每个职责单一：

| 模块 | 路径 | 职责 |
|---|---|---|
| `defaultStyle` | `src/utils/defaultStyle.ts` | 默认样式命名块的解析 / 序列化 / upsert；选择器映射；属性白名单与「显式改过」判定 |
| `paragraphSpacing` | `src/utils/paragraphSpacing.ts` | 行间距 / 段前 / 段后 预设值、pt↔px 换算、规范化（合并已有 style 中的 margin） |
| `RibbonHome` | `src/components/RibbonHome.tsx` | 段落组末尾新增 3 个 SelectControl（行距 / 段前 / 段后），复用 `SelectControl` |
| `ContextMenu` | `src/components/EditorContextMenu.tsx` | 新建独立的右键菜单组件，替代现有 `setBlockPanelPos` 单点触发 |

App.tsx 装配层两处变更：
1. 新增右键菜单状态：`contextMenu: { x, y, blockPos, blockType } | null`
2. 「设为默认」执行 → 调用 `defaultStyle.upsert(shell, blockType, props)` → `updateActiveDoc({ shell })`

## 数据模型

### `shell.head` 末尾的命名块

```html
<style id="weavepage-default-styles">
p { font-size: 16pt; line-height: 1.75; }
h2 { color: #2a4d8f; }
</style>
```

### 内存中的解析形态

```ts
type DefaultStyleMap = Record<'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', Record<string, string>>;
```

### 选择器映射

| Tiptap 节点 | 选择器 |
|---|---|
| `paragraph` | `p` |
| `heading` level 1–6 | `h1`–`h6` |

## 关键算法

### 1. 行间距预设（单位：number，与 CSS `line-height` 一致）

```
[1, 1.15, 1.5, 1.75, 2, 2.5, 3]
```

+ 「自定义…」输入框：纯数字，范围 0.5–5，0.01 步进

### 2. 段前 / 段后预设（单位：pt）

```
[0, 6, 12, 18, 24]
```

+ 「自定义…」输入框：pt，范围 0–120，整数

应用时 `pt → px × 4/3`，写入节点的 `style="margin-top: <px>px"`。

### 3. 属性白名单（最多写入 8 项）

| 来源 | 属性 | 何时算「显式」 |
|---|---|---|
| Tiptap `textStyle` mark | `font-family` | mark 上有该属性 |
| Tiptap `textStyle` mark | `font-size` | mark 上有该属性 |
| Tiptap `textStyle` mark | `color` | mark 上有该属性 |
| Tiptap `highlight` mark | `background-color` | mark 上有 color |
| 块的 inline style | `text-align` | 值非 `start` 且非空 |
| 块的 inline style | `line-height` | 值非 `normal` 且非空 |
| 块的 inline style | `margin-top` / `margin-bottom` | 同上 |

CSS 序列化格式：`font-family: "Segoe UI"`（含空格的字体加引号）；其他原值原样写。

**已有 margin 合并规则**：节点当前 `style` 含 `margin` 简写（如 `margin: 0 auto`）时：
- 设段前 → 解析为 `top / right / bottom / left` → 改写 `top`（其余保留）
- 设段后 → 解析为 `top / right / bottom / left` → 改写 `bottom`（其余保留）
- 解析失败（用户写了非常规 margin 简写）→ 仅覆盖 `margin-top` / `margin-bottom`，其他自动失效；弹 toast「margin 简写解析失败」

### 4. 命名块 upsert

```
parse(s) -> DefaultStyleMap
upsert(map, selector, props):
  map[selector] = { ...map[selector], ...props }
serialize(map) -> s
```

- 选择器不在白名单 → throw `UnsupportedSelectorError`
- 属性不在白名单 → 静默丢弃
- 解析失败（用户手动改坏了命名块）→ 返回 `{}`，触发 toast「默认样式块已重置」

### 5. 写入流程

1. 光标所在块 DOM 元素 → 节点类型 → 选择器
2. 从节点读「显式属性」→ `{ prop: value }[]`
3. `upsert` 到命名块的解析对象
4. 序列化写回 `<style id="weavepage-default-styles">`
5. 同步重写 `shell.head`（替换原块或追加新块）
6. 同步重写 `shell.headCss`（同上）
7. `updateActiveDoc({ shell: newShell })`

## UI 细节

### Ribbon 段落组新增控件

```
段落组
  ├ 左对齐 / 居中 / 右对齐 / 两端
  ├ 项目符号 / 编号 / 任务清单
  ├ 减少缩进 / 增加缩进
  ├ 引用 / 代码块
  ├ 行距 ▼          ← 新增 SelectControl
  ├ 段前 ▼          ← 新增 SelectControl
  └ 段后 ▼          ← 新增 SelectControl
```

`SelectControl` 已存在（`src/components/controls.tsx`），直接复用；新增预设常量到 `paragraphSpacing.ts`。

### 右键菜单

```
┌─────────────────┐
│ 块源码          │ ← 已有
│ 设为默认样式 ✓  │ ← 新增：仅 p/h1-h6 可用，否则置灰
└─────────────────┘
```

菜单浮层使用 `position: fixed`，点击其他区域关闭，ESC 关闭，鼠标右键默认不关闭（再点一次会重新打开）。

样式：复用 `.modal-mask` 半透明遮罩？**不**——右键菜单不需要遮罩，独立浮层即可。新增 `.context-menu` 类。

## 错误处理与边界

| 场景 | 行为 |
|---|---|
| 当前文档无 shell（空白新文档） | 写入时自动创建完整 `<style id="weavepage-default-styles">` 块 |
| 命名块不存在 | 同上，首次写入时创建 |
| 用户对同一选择器设 N 次不同字号 | 后写覆盖前写，命名块内只有最新值 |
| 命名块 CSS 解析失败 | 用空对象重建块，弹 toast「默认样式块已重置」 |
| 撤销（Ctrl+Z） | 本版**不做 undo**，已知限制；文档中提示用户 |
| 非 p/h1-h6 类型（li / blockquote） | 右键菜单「设为默认样式」置灰 |
| 选区跨越多种块类型 | 仅按首个块类型处理，弹 toast「仅应用于首个块类型」 |
| 命名块属性不在白名单 | 静默丢弃，不报错 |
| 用户保存到原始外联 css 文件 | 本版不动，留到下一版（已确认） |

## 测试

### 单元测试（手工）

| 用例 | 期望 |
|---|---|
| 空白文档点「设为默认」 | head 末尾出现命名块，内容正确 |
| 已含命名块 + 新增属性 | 命名块内属性合并，原属性保留 |
| 已含命名块 + 同名属性 | 后写覆盖前写 |
| 命名块被人为破坏 | 弹 toast「已重置」，块重建 |
| 行距下拉选 1.75 → 节点 style | `style="line-height: 1.75"` |
| 段前选 12pt → 节点 style | `style="margin-top: 16px"`（12 × 4/3） |
| 段前 + 已有 `margin: 0 auto` | 合并为 `margin: 16px auto 0` |
| 自定义输入 0.01 步进 | 接受；范围外拒绝 |
| 光标在 li 内点右键 | 「设为默认样式」置灰 |
| 选区跨段落+标题 | toast「仅应用于首个块类型」，按段落处理 |

### 真机验收（用户跑）

启动 `release/WeavePage_0.1.4_x64-setup.exe` 后：

| # | 操作 | 预期 |
|---|---|---|
| 1 | 编辑正文 + 改字号 | Ribbon 字号下拉反映当前值 |
| 2 | 编辑正文 + 改字号 + 行距下拉选 1.75 | 当前段 style 出现 `line-height: 1.75` |
| 3 | 同段段前选 12pt | 当前段 style 出现 `margin-top: 16px` |
| 4 | 同段右键 → 设为默认样式 | toast「已保存为默认样式」；head 出现命名块 |
| 5 | 文档中另一段正文 | 自动应用新字号 + 行距 + 段前 |
| 6 | 保存 → 用记事本打开 .html | head 内含命名块规则 |
| 7 | 重启应用 + 打开同一文件 | 编辑区预览显示新规则生效 |
| 8 | 段落块右键「设为默认」 | 命名块 `p {...}` 出现 |
| 9 | H2 块右键「设为默认」 | 命名块 `h2 {...}` 出现 |
| 10 | Li 块右键「设为默认」 | 菜单项置灰 |
| 11 | Ctrl+Z | 仅撤销正文改动，head 块改动未撤销（已知限制） |

## 范围外（不做）

- 外联 css 文件写回（用户确认留到下一版）
- undo / redo head 块改动
- 表格 / 引用 / 列表项设为默认
- 行内样式的清除（用户确认不动）
- 自定义主题 / 全局样式市场

## 发布流程

实现完成后：

1. `pnpm build`（tsc + vite）
2. `pnpm release`（tauri build + copy-release）→ `release/WeavePage_0.1.4_x64-setup.exe` + `.msi`
3. 真机验收（按上表）
4. `git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit`（按逻辑拆 2-3 个 commit）
5. aiec.fun 同步：`E:\办公文件\L1网站\weavepage\version.json` → 0.1.4，`python _upload_weavepage.py` + `python _upload_weavepage_files.py`
6. （可选）GitHub Release：`gh release create v0.1.4 release/*.exe release/*.msi`

## 必读顺序（实现会话接力）

1. 本 spec
2. `docs/superpowers/specs/2026-08-13-word-ribbon-ui-design.md`（Ribbon 控件复用）
3. `src/extensions/HtmlCompat.ts`（GlobalAttrs 支持 style）
4. `src/components/RibbonHome.tsx:198-266`（段落组当前结构）
5. `src/App.tsx:330-482`（parseShell / buildFullDoc / shell 形态）
6. `src/components/controls.tsx`（SelectControl API）