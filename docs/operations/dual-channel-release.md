# 双渠道发布：完整包 vs 升级包

> WeavePage v0.1.11+ 起的强制规则。任何一次发版,**`release/` 目录下必须同时产出两个 `.exe` 文件**,面向不同的下载/升级场景。

---

## 为什么需要两个 exe

- **完整包(full setup.exe, ~210 MB)**:内嵌 WebView2 离线安装包,新机器首次安装 **不需联网**
- **升级包(update.exe, ~5.5 MB)**:不内嵌 WebView2(假设机器已有),只覆盖应用二进制,下载/安装体积小 40 倍

一个 exe 满足不了两边的需求:给新用户发小包 → 需要联网拉 WebView2(国内用户体验差);给老用户发大包 → 每次升级下载 ~210 MB 浪费流量。

---

## 两个渠道对比

| 维度 | 完整包 (`*_x64-setup.exe`) | 升级包 (`*_x64-update.exe`) |
|---|---|---|
| 文件名 | `WeavePage_X.Y.Z_x64-setup.exe` | `WeavePage_X.Y.Z_x64-update.exe` |
| 大小 | ~210 MB | ~5.5 MB |
| WebView2 | 内嵌离线包(`offlineInstaller`) | 仅引导下载(`embedBootstrapper`) |
| config override | `src-tauri/tauri.conf.json`(主配置) | `src-tauri/tauri.conf.update.json` |
| NSIS 行为 | 首次安装(无 GUID) | 升级安装(检测到同 GUID → 覆盖二进制,不卸载) |
| 适用场景 | **新用户从浏览器下载** | **应用内升级(老用户)** |
| 来源 | `pnpm release`(默认) | `pnpm release:update` |

---

## 打包流程:一把出两个

```bash
cd "F:/soft/00selfmade/tiptap_app"

# 1. 升版本号
#    编辑 src-tauri/tauri.conf.json: "version": "X.Y.Z"
#    (package.json / tauri.conf.update.json 不需要改 version,partial merge 会跟随主 config)

# 2. 一键打两个
pnpm release:both
# 等价于:
#   pnpm release          # 打 full setup.exe + msi
#   pnpm release:update   # 打 update.exe
```

`scripts/copy-release.mjs` 会自动从 `tauri.conf.json` 读 `productName` + `version`,所以**不需要改 copy-release 里的硬编码**(v0.1.11 之前的版本需要改,见 [release-workflow.md § 历史](./release-workflow.md))。

### 构建产物

`release/` 目录下,**完整包 + 升级包必须同时存在**:

```
release/
├── WeavePage_X.Y.Z_x64-setup.exe        # 完整包, ~210 MB
├── WeavePage_X.Y.Z_x64-update.exe       # 升级包, ~5.5 MB
└── WeavePage_X.Y.Z_x64_en-US.msi        # MSI 附属产物(完整包渠道)
```

> **顺序注意**:`pnpm release:both` 内部先跑 `pnpm release` 再跑 `pnpm release:update`。**反之手动跑**(先 update 再 full)会导致 update 渠道读取 `target/release/bundle/nsis/` 时被 full 渠道覆盖前一份,可能踩到 tmp 文件名冲突(已修,详见 v0.1.11 commit)。

---

## 分发规则:在线下载 vs 在线升级

`version.json` 决定用户在浏览器和应用内分别下载哪个:

```json
{
    "version": "0.1.11",
    "notes": "v0.1.11 — ...",
    "pub_date": "2026-08-19T...",
    "platforms": {
        "windows-x86_64": {
            "url":         "https://www.aiec.fun/weavepage/WeavePage_0.1.11_x64-setup.exe",
            "update_url":  "https://www.aiec.fun/weavepage/WeavePage_0.1.11_x64-update.exe",
            "signature":   ""
        }
    }
}
```

| 字段 | 指向 | 谁用 |
|---|---|---|
| `url` | **完整包**(`*_x64-setup.exe`,~210 MB) | 浏览器下载页 `download.php`、落地页、用户主动下载 |
| `update_url` | **升级包**(`*_x64-update.exe`,~5.5 MB) | 应用内 in-app upgrade(`src/utils/inAppUpdater.ts`) |

### 规则重申(必须遵守)

- **在线下载**(浏览器、`download.php` 链接、README 里的 Releases 链接)→ 默认指 `url`(完整包)
- **在线升级**(用户在 WeavePage 里点"检查更新"或 App 启动弹窗)→ 走 `update_url`(升级包)
- `url` 必须始终指向 `*_x64-setup.exe`(完整包),**不能**指 `*_x64-update.exe`,否则新用户装机时无法获得 WebView2
- 如果某次发版只有完整包没有升级包(老版本 app 还跑着),`update_url` 可省略,前端 fallback 到 `url`,但补打升级包仍是首选

### 关于 Tauri v2 updater 官方字段

`url` + `signature` 是 **Tauri v2 官方 updater 字段**,原生 `tauri-plugin-updater` 会读。
`update_url` 是本项目**自定义扩展字段**,因为官方 updater 只支持单 exe,本项目走 in-app 自实现下载(`src/utils/inAppUpdater.ts` 直接用 `tauri-plugin-http` 拉 JSON 自己解析)。

---

## 验收清单(每次发版必过)

- [ ] `src-tauri/tauri.conf.json` 的 `version` 已升
- [ ] `pnpm release:both` 无错误,产出 NSIS setup.exe + update.exe + msi
- [ ] `release/` 目录下 `*_x64-setup.exe` 与 `*_x64-update.exe` 同时存在(两文件 mtime 接近)
- [ ] 上传到 aiec.fun/weavepage/ 后,curl 两个 URL 都能拿到正确文件(md5 一致)
- [ ] `version.json.url` 指向 `*_x64-setup.exe`(完整包,**不能是 update.exe**)
- [ ] `version.json.update_url` 指向 `*_x64-update.exe`(升级包)
- [ ] 真机验证场景 A(装 v0.1.10 → update.exe 升 v0.1.11)+ 场景 B(新机装 setup.exe),详见 [release-workflow.md § 1.5](./release-workflow.md#15-真机验证)

---

## 相关文档

| 文档 | 内容 |
|---|---|
| [release-workflow.md](./release-workflow.md) | 构建产物流程(`pnpm release:both`) |
| [server-upload.md](./server-upload.md) | 两个 exe 一起上传到 aiec.fun/weavepage/ |
| [version-info.md](./version-info.md) | `version.json` schema(`url` + `update_url`) |

---

## 历史与变更

- **v0.1.11** (2026-08-19):首次引入双渠道,新增 `tauri.conf.update.json` + `release:update` script + `update_url` 字段
- 之前的 v0.1.10 及更早版本只发 `*_x64-setup.exe`,老用户升级依赖手动下载全量包