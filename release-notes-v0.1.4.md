# WeavePage v0.1.4

## 段落间距工具栏

Ribbon「段落」组末尾新增三个 SelectControl:

- **行距**:1.0 / 1.15 / 1.5 / 1.75 / 2.0 / 2.5 / 3.0
- **段前(pt)**:0 / 6 / 12 / 18 / 24
- **段后(pt)**:0 / 6 / 12 / 18 / 24

默认 pt 体系(1pt = 4/3 px)。值直接写入块 `inline style`,在编辑器内实时反查光标所在块的当前值显示在 SelectControl 上。

## 「设为默认样式」

编辑器右键菜单新增第二项「设为默认样式」(列表第一项保留「块源码」)。

**行为**:
- 把当前光标所在块的**显式属性**(白名单 8 项)写入 head 内嵌的命名块 `<style id="weavepage-default-styles">`
- 同类(p / h1-h6)后续新块跟随
- 已存在 inline style 的段优先(白名单规则不会覆盖特例)
- 单一命名块 upsert,避免同选择器重复定义

**白名单属性(8 项)**:
`font-family` / `font-size` / `color` / `background-color` / `text-align` / `line-height` / `margin-top` / `margin-bottom`

**适用**:仅 p / h1 / h2 / h3 / h4 / h5 / h6,其它块类型(列表项 / 代码块 / 引用等)的右键菜单项置灰禁用。

## 技术变更

- 新增 utils 模块:`src/utils/paragraphSpacing.ts` 和 `src/utils/defaultStyle.ts`(均含 .test.ts 单元测试,共 26 用例通过)
- 新增组件:`src/components/EditorContextMenu.tsx`
- 修改:`src/components/RibbonHome.tsx` / `src/components/Ribbon.tsx` / `src/App.tsx` / `src/App.css`
- devDep:`tsx` 4.23.12(单元测试用,直接 `pnpm tsx <file>.test.ts`)

## 下载与校验

- **NSIS 安装包**:`WeavePage_0.1.4_x64-setup.exe`
- **MSI 安装包**:`WeavePage_0.1.4_x64_en-US.msi`
- **SHA256**(校验):
  - NSIS:`6feebf4b76977df17979170513ca9c02f3e389651570ec029175b054f821dda8`
  - MSI:`86fed36164356e71e7bbb7f9b8c5eb1f40ad242bbcb1ab7db500ac0b8a6e629e`

```
certutil -hashfile WeavePage_0.1.4_x64-setup.exe SHA256
certutil -hashfile WeavePage_0.1.4_x64_en-US.msi SHA256
```
