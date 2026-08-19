# 1. 发布流程：从源码到双渠道 NSIS 安装包

把当前 `tiptap_app/` 代码构建成可分发的两个 `.exe`(完整包 + 升级包)。

> **v0.1.11+ 强制规则**:`release/` 目录下必须**同时**产出 `*_x64-setup.exe`(完整包, ~210 MB)和 `*_x64-update.exe`(升级包, ~5.5 MB)。详见 [dual-channel-release.md](./dual-channel-release.md)。

---

## 前置条件

- Node ≥ 20、Rust ≥ 1.77、pnpm（详见根 `README.md`）
- 当前工作目录：`F:\soft\00selfmade\tiptap_app`

---

## 步骤

### 1.1 升级版本号

编辑 `src-tauri/tauri.conf.json`：

```jsonc
{
  "version": "X.Y.Z"   // ← 改这一行
}
```

> Tauri v2 用 **语义化版本** (`MAJOR.MINOR.PATCH`)。版本号既是 `version.json` 的 source of truth，也是安装包文件名的一部分。
> 
> `package.json` 的 `version` 字段也同步改(`scripts/copy-release.mjs` 会读这里)。
> `src-tauri/tauri.conf.update.json` 不需要改 `version`(Tauri v2 的 `--config` 是 partial merge,主 config 的 `version` 自动跟随)。

### 1.2 构建

```bash
pnpm build           # tsc + vite，~2s（前置 TS 校验）
cargo check          # Rust 编译校验，~23s
pnpm release:both    # 一把打两个:full setup.exe + update.exe，~1.5 min × 2
```

`pnpm release:both` 等价于先后跑 `pnpm release`(打 full)和 `pnpm release:update`(打 update)。两个渠道用不同的 config override:

| 渠道 | config | 命令 |
|---|---|---|
| 完整包 | `src-tauri/tauri.conf.json`(默认,`offlineInstaller`) | `pnpm release` |
| 升级包 | `src-tauri/tauri.conf.update.json`(`embedBootstrapper` 覆盖) | `pnpm release:update` |

构建产物路径（固定）：

| 产物 | 路径 |
|---|---|
| NSIS 完整包 | `src-tauri/target/release/bundle/nsis/WeavePage_X.Y.Z_x64-setup.exe` |
| NSIS 升级包 | `src-tauri/target/release/bundle/nsis/WeavePage_X.Y.Z_x64-update.exe` |
| MSI 安装包 | `src-tauri/target/release/bundle/msi/WeavePage_X.Y.Z_x64_en-US.msi` |

### 1.3 复制到 `release/`（项目根）

`pnpm release:both` 内部已调用 `scripts/copy-release.mjs` 把产物拷到 `release/`。**不需要手动再跑**。

```bash
# 单独跑也行（用于单渠道调试）
node scripts/copy-release.mjs full    # 默认
node scripts/copy-release.mjs update
```

> `copy-release.mjs` 自动从 `src-tauri/tauri.conf.json` 读 `productName` + `version`,**v0.1.11 之后不需要改 copy-release 里的硬编码**(老版本需要手动改,已移除)。

### 1.4 真机验证

> **不可省**。打包错误（图标缺、文件路径错）只能在真机安装时暴露。

两个场景必测：

- **场景 A — 升级链**:干净 sandbox 装 v0.1.10 → 装 `*_x64-update.exe` 升级到 v0.1.11(覆盖二进制,不该卸载)
- **场景 B — 全新机装**:干净 sandbox 直接装 `*_x64-setup.exe`(WebView2 离线包自动装,不需联网)

详见 [dual-channel-release.md § 验收清单](./dual-channel-release.md#验收清单每次发版必过)。

---

## 验收清单

- [ ] `tauri.conf.json` 版本号已改
- [ ] `package.json` 版本号已同步
- [ ] `pnpm build` 无 TS 错误
- [ ] `cargo check` 无错误
- [ ] `pnpm release:both` 产出两个 exe(setup + update)+ msi
- [ ] `release/` 下三个新文件 mtime 最新:`*_x64-setup.exe` / `*_x64-update.exe` / `*_x64_en-US.msi`
- [ ] 真机双击安装能跑通(场景 A + B)

---

## 下一步

构建完成后，进入 [server-upload.md](./server-upload.md) 把两个 exe 一起推到 aiec.fun/weavepage/。
