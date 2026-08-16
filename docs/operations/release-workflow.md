# 1. 发布流程：从源码到 NSIS 安装包

把当前 `tiptap_app/` 代码构建成可分发的 `.exe`。

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

### 1.2 同步更新复制脚本

`scripts/copy-release.mjs` 内文件名硬编码：

```js
const nsis = path.join(bundle, "nsis", `WeavePage_${VERSION}_x64-setup.exe`);
```

把 `${VERSION}` 改为新版本号（如 `0.2.0`），NSIS 和 MSI 两处都要改。

### 1.3 构建

```bash
pnpm build           # tsc + vite，~2s（前置 TS 校验）
cargo check          # Rust 编译校验，~23s
pnpm tauri build     # 完整构建 NSIS + MSI，~1.5 min
```

构建产物路径（固定）：

| 产物 | 路径 |
|---|---|
| NSIS 安装包 | `src-tauri/target/release/bundle/nsis/WeavePage_X.Y.Z_x64-setup.exe` |
| MSI 安装包 | `src-tauri/target/release/bundle/msi/WeavePage_X.Y.Z_x64_en-US.msi` |

### 1.4 复制到 `release/`（项目根）

```bash
node scripts/copy-release.mjs
# 输出：
# 已复制 NSIS 安装包 -> release/WeavePage_X.Y.Z_x64-setup.exe
# 已复制 MSI 安装包 -> release/WeavePage_X.Y.Z_x64_en-US.msi
```

`release/` 是本地分发目录，构建完就在这里。

### 1.5 真机验证

> **不可省**。打包错误（图标缺、文件路径错）只能在真机安装时暴露。

```bash
pnpm tauri dev      # 开发模式快速试
# 或直接双击 release/WeavePage_X.Y.Z_x64-setup.exe 在真机跑
```

---

## 验收清单

- [ ] `tauri.conf.json` 版本号已改
- [ ] `scripts/copy-release.mjs` 版本号已改（两处）
- [ ] `pnpm build` 无 TS 错误
- [ ] `cargo check` 无错误
- [ ] `pnpm tauri build` 产出 NSIS + MSI
- [ ] `release/` 下两个新文件 mtime 最新
- [ ] 真机双击安装能跑通

---

## 下一步

构建完成后，进入 [server-upload.md](./server-upload.md) 上传到服务器。
