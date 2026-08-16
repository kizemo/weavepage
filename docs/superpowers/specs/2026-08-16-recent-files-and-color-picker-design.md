# 最近文件 + 文字颜色选择器增强 设计

> 日期：2026-08-16
> 状态：已获用户确认
> 项目：`F:\soft\00selfmade\tiptap_app`（Tauri v2 + React 19 + Tiptap 3.30）

## 背景

用户提出两项功能增强：
1. **文件菜单** 增加「打开最近」子菜单，默认保存最近 10 个工作文档；子菜单尾部添加「清除」按钮。
2. **文字颜色 / 高亮按钮** 弹出色板中增加「更多颜色」（弹出系统色盘）与「最近使用过」色组。

澄清会上用户确认了 4 个决策点：
- 存储位置：**Tauri 应用数据目录**（`%APPDATA%\fun.aiec.weavepage\`），与已废弃的 localStorage 风格保持差异
- 触发时机：**只记录成功打开**（成功的 save 暂不挤入）
- 自定义颜色：原生 `<input type="color">` + 最近色区
- 最近颜色数量：**每种 8 个**（与 Word 接近）

## 架构

新增三个独立模块，每个职责单一：

| 模块 | 路径 | 职责 |
|---|---|---|
| `recentFilesStore` | `src/utils/recentFiles.ts` | 读写 `recent.json`，LRU 去重 + 10 条上限，提供 `load / push / clear` |
| `recentColorsStore` | `src/utils/recentColors.ts` | 读写 `recent-colors.json`，两套独立 LRU（text / highlight）各 8 条 |
| `ColorPicker` | `src/components/ColorPicker.tsx` | 替代原 `ColorControl`；整合预设色 + 最近色 + 「更多颜色」 + 「清除」 |

App.tsx 装配层三处变更：
1. `useEffect` 启动时拉取两个 store 初始化本地 state
2. openFile / openResource / doSave 成功后调用 `recentFiles.push(path)`
3. 给 MenuBar 增加 `recent`、`onOpenRecent`、`onClearRecent` props；给 Ribbon 的 ColorControl 升级为 ColorPicker

## 数据模型

`%APPDATA%\fun.aiec.weavepage\recent.json`
```json
{ "version": 1, "paths": ["C:\\Users\\xxx\\a.html", "D:\\b.css"] }
```

`%APPDATA%\fun.aiec.weavepage\recent-colors.json`
```json
{
  "version": 1,
  "text": ["#c00000", "#00b050", ...],
  "highlight": ["#ffff00", "#92d050", ...]
}
```

`version` 字段为未来迁移留口。

## 关键算法

LRU push：
```ts
function push(list: string[], item: string, limit: number) {
  return [item, ...list.filter(x => x !== item)].slice(0, limit);
}
```

## UI 设计

### 文件菜单子菜单

```
文件 ▼
├── 新建           Ctrl+N
├── 打开...        Ctrl+O
├── 打开最近 ▶     →  1. C:\...\a.html
│                    2. D:\...\b.css
│                    ──────────
│                    清除
├── 保存           Ctrl+S
├── 另存为...      Ctrl+Shift+S
├── ──────────
├── 导出网页...
└── 关闭           Ctrl+W
```

子菜单悬浮展开通过 `subMenu` 状态控制。空列表时显示灰色 `(无最近文档)` 占位项（不可点击）。

### 颜色选择器

弹出面板布局（上→下）：
```
┌───────────────────────────┐
│  [16 预设色网格 4×4]      │  ← 现有 TEXT_COLORS / HIGHLIGHT_COLORS
├───────────────────────────┤
│  最近使用                  │
│  [最多 8 个,空时显示提示]   │
├───────────────────────────┤
│  [更多颜色...] [清除]      │
└───────────────────────────┘
```

「更多颜色...」背后是隐藏 `<input type="color">`，点击触发 WebView2 系统色盘。

## 错误处理

- 文件丢失：点击最近项时 `readTextFile` 抛错 → `window.confirm("文件不存在，是否从最近列表移除？")` → 用户确认则从 list 删除并 save
- 持久化失败：`console.warn` 记录，不阻塞 UI；空列表显示 `(无最近文档)`
- 系统色盘取消：input change 不触发即不变更

## 测试策略

项目目前无前端测试框架，本次不为新增内容专门搭建，仅在以下点做手测：

1. `recentFiles.ts` 的纯函数 `push / clear` 用 Node REPL 直接验证（5 行）
2. 端到端手测清单（写进 handoff）：
   - 打开 3+ 不同文件 → 重启 app → 列表仍显示
   - 同一文件重开 → 移到首位，不重复
   - 删除某文件 → 点击该项 → 弹确认 → 从列表移除
   - 「清除」→ 列表清空，重启仍清空
   - text 与 highlight 各连续选 9 个不同色 → 第 9 个挤掉最早的
   - 「更多颜色...」调起 WebView2 系统色盘，选定色回写到最近组

## 发版

版本号 0.1.1 → 0.1.2，三处同步：

| 文件 | 字段/位置 |
|---|---|
| `package.json` | `"version": "0.1.2"` |
| `src-tauri/tauri.conf.json` | `"version": "0.1.2"` |
| `scripts/copy-release.mjs` | 硬编码 `0.1.1` 出现 4 处（NSIS 路径/文件名/MSI 路径/文件名） |
| `_upload_weavepage.py` | `LOCAL_FILE = "WeavePage_0.1.2_x64-setup.exe"` |

执行顺序：
1. 改版本号 → `pnpm build`（TS 校验）→ `pnpm release`（打包 + 复制）
2. GitHub：`gh release create v0.1.2 release/*.exe release/*.msi --title "WeavePage v0.1.2" --notes "<变更日志>"`
3. aiec.fun：`python _upload_weavepage.py`
4. README：版本徽章 + 变更日志 + SHA256 + 功能列表更新

## 关键避坑提醒

- `appDataDir()` 来自 `@tauri-apps/api/path`，Tauri fs scope `["**"]` 已允许任意路径写
- localStorage 仅存主题/视图模式，新增两套 store 不走 localStorage
- 颜色比较时大小写需 normalize（`#FFF` vs `#ffffff` 视为同一色）
- 推荐用 `props.onClear` 触发 editor 的 `unsetColor/unsetHighlight` 命令而非 `setColor('#000000')`，避免视觉色块不变但实际是黑
