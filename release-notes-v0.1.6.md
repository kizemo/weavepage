# WeavePage v0.1.6

## 帮助菜单文字不再被裁切

「帮助 → 关于 WeavePage...」在窗口右边时,dropdown 文字被窗口边缘裁掉,显示成「关于 Weave」后被切。

**修复**:`.menu-item.menu-item-right > .menu-dropdown` 改用 `right: 0`(原来是 `left: 0`),让 dropdown 从父容器右缘向左扩展,完整显示在窗口内。

## in-app upgrade 失败时弹真实错误

之前:
- 下载/写入/启动 installer 任何步骤失败 → catch 内**静默 fallback** 到 `openUrl(APP_DOWNLOAD_URL)` 打开浏览器
- 用户看不到失败原因,体验像"还在用老逻辑"

现在:
- 失败时 `message()`(kind=error)弹「自动升级失败: <原因> + 请手动访问 aiec.fun 下载」
- 任何时候都弹 `message()` 提示「正在下载」「已启动安装」,全程可见
- App.tsx 启动 useEffect 的 catch 只保留 `console.warn` 但不 fallback 浏览器

## 下载与校验

- **NSIS 安装包**:`WeavePage_0.1.6_x64-setup.exe`
- **SHA256**:`eb4b80232d50ce270de8132cc30fd99d94cc40ffaa50c977963361ad50aa5048`

```
certutil -hashfile WeavePage_0.1.6_x64-setup.exe SHA256
```

## v0.1.5 升级历史(未全面发布安装)

如果你已装 v0.1.5 但仍有"点开浏览器"的问题,可能是:
1. **仍在 v0.1.4** —— v0.1.4 启动弹窗走 `openUrl` 逻辑,未含 in-app upgrade。装 v0.1.6 修复。
2. **已装 v0.1.5 但 in-app 实际失败被静默 catch** —— 装 v0.1.6 看真实错误信息。
3. **点 AboutDialog 「立即更新」** —— 那个按钮现在仍走 `openUrl`,**不在本次修复范围**(在 v0.1.3 dirty `AboutDialog.tsx` 中,需用户真机验收后单独发版处理)。

## 升级流程已发布版本

- v0.1.3 段落间距功能 + 设为默认样式 (8 task plan)
- v0.1.4 hotfix 仅为 release 链条(实质相同)
- v0.1.5 in-app upgrade + server download.php 直链
- **v0.1.6 帮助菜单 + in-app 错误提示**
