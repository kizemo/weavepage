# WeavePage 织页

> 所见即所得的本地网页编辑器 — 像 Dreamweaver 一样"织"网页,但更轻、更简单。

WeavePage 是一款基于 **Tauri v2 + React 19 + Tiptap** 的 Windows 桌面网页编辑器。打开任意 HTML 文件,立即呈现完整的 CSS 样式与 JS 动态效果,可以直接编辑、保存,零配置上手。

**开发者**:aiec.fun

## 特性

- **所见即所得**:打开 HTML 自动注入文档 CSS,编辑界面即最终效果;支持预览模式(完整 CSS/JS 动态效果,可直接编辑)
- **完整网页支持**:打开带外部 CSS/JS/图片的网页自动内联为自包含文档;外联资源侧边栏,点击即可编辑 CSS/JS 文件
- **源码视图**:查看/编辑完整页面代码(head、CSS、JS 全部可见),保存即时生效
- **多标签页**:同时打开多个 HTML/CSS/JS 文件,标签切换(Ctrl+N/O/W)
- **Word 风格功能区**:字体/字号/颜色/高亮/对齐/列表/表格/图片/链接,按钮实时反映选中文字的实际格式
- **块级源码编辑**:右键任意块,右侧边栏直接编辑该块的 HTML 源码,可导航父块/子块/兄弟块
- **表格**:5×5 网格选择器插入,行列增删
- **图片**:本地图片以 base64 嵌入,保存重开不丢失
- **主题**:浅色/深色/跟随系统三态,重启保持
- **导出**:保存/另存为/导出完整网页
- **即装即用**:安装包含 WebView2 离线运行时,全新电脑双击安装直接使用

## 安装

下载 [Release](https://github.com/kizemo/weavepage/releases) 中的安装包:

- `WeavePage_0.1.0_x64-setup.exe` — NSIS 安装包(推荐,含 WebView2 离线运行时)
- `WeavePage_0.1.0_x64_en-US.msi` — MSI 安装包

系统要求:Windows 10/11 x64(WebView2 随安装包自动安装)。

## 开发

```bash
# 环境:Node.js ≥ 20、Rust ≥ 1.77、pnpm

pnpm install          # 安装依赖
pnpm tauri dev        # 开发模式运行
pnpm build            # 前端构建(tsc + vite)
pnpm release          # 打包安装程序到 release/ 目录
```

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Tauri v2(Windows) |
| 前端 | React 19 + TypeScript |
| 编辑器 | Tiptap 3(ProseMirror) |
| 构建 | Vite + pnpm |

## 项目结构

```
├── src/                    # React 前端
│   ├── App.tsx             # 应用装配(多标签/文件操作/模式切换/快捷键)
│   ├── App.css             # CSS 变量主题系统 + 功能区/编辑区样式
│   ├── extensions/         # 自定义扩展(字号/HTML 保真)
│   ├── utils/              # 字体常量表/HTML 格式化
│   └── components/         # 菜单栏/功能区/标签栏/侧边栏/状态栏/块源码面板
├── src-tauri/              # Tauri 壳(capabilities/图标/打包配置)
└── scripts/                # 发布脚本(构建后复制安装包到 release/)
```

## 许可

© 2026 aiec.fun
