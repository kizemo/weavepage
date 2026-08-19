# 3. 更新 version.json（触发 app 自动更新）

`version.json` 是 **Tauri v2 updater 读取的元数据文件**。本地 app 启动时会自动拉这个 JSON，发现 `version > 当前版本` 就提示用户更新。

---

## 文件位置

| 本地 | 远程 |
|---|---|
| `E:\办公文件\L1网站\weavepage\version.json` | `/var/www/wordpress/weavepage/version.json` |

公开 URL：`https://www.aiec.fun/weavepage/version.json`

---

## 当前格式

```json
{
    "version": "0.1.11",
    "notes": "v0.1.11 — 修复 Ribbon 页面背景按钮选色无效 + ...",
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

字段说明：

| 字段 | 类型 | 来源 | 说明 |
|---|---|---|---|
| `version` | string | 必填 | 新版本号（semver），与 `tauri.conf.json` 一致 |
| `notes` | string | 必填 | 更新说明（app 内显示给用户） |
| `pub_date` | string | 必填 | RFC3339 UTC 时间 |
| `platforms.<key>.url` | string | 必填 | **完整包**(`*_x64-setup.exe`, ~210 MB)下载 URL —— 浏览器 / `download.php` 用 |
| `platforms.<key>.update_url` | string | 推荐 | **升级包**(`*_x64-update.exe`, ~5.5 MB)下载 URL —— 应用内升级用 |
| `platforms.<key>.signature` | string | 生产必填 | base64 签名（**见下**） |

平台 key 当前仅 `windows-x86_64`（NSIS 安装包）。后续如需 macOS/Linux，复制 key 即可。

### `url` vs `update_url` 分流规则

| 字段 | 指向 | 谁用 |
|---|---|---|
| `url` | 完整包 (`*_x64-setup.exe`) | **浏览器下载、`download.php` 链接、落地页、README 里的 Releases 链接** |
| `update_url` | 升级包 (`*_x64-update.exe`) | **应用内 in-app upgrade**(`src/utils/inAppUpdater.ts` 读这字段) |

**强制规则**:
- `url` 必须指向 `*_x64-setup.exe`(完整包),**不能**指 `*_x64-update.exe`
- 如果某次发版只有完整包没有升级包(老版本 app 还在跑),`update_url` 可省略,前端 fallback 到 `url`
- 详见 [dual-channel-release.md](./dual-channel-release.md)

### 字段来源

- `url` / `update_url` / `signature` —— **Tauri v2 updater 官方**:`url` + `signature` 是官方字段
- `update_url` —— **本项目自定义扩展字段**:Tauri v2 官方 updater 只支持单 exe,本项目用 in-app 自实现(`src/utils/updateCheck.ts` 解析),所以加 `update_url` 给应用内升级用

---

## 更新流程

### 3.1 编辑本地 version.json

打开 `E:\办公文件\L1网站\weavepage\version.json`：

- `version` → 新版本号
- `notes` → 新版本更新说明（一段中文）
- `pub_date` → 当前 UTC 时间（ISO 8601 格式）
- `platforms.windows-x86_64.url` → 新版本**完整包** URL（`WeavePage_X.Y.Z_x64-setup.exe`，**不能写 update.exe**）
- `platforms.windows-x86_64.update_url` → 新版本**升级包** URL（`WeavePage_X.Y.Z_x64-update.exe`，可省略则前端 fallback 到 url）
- `platforms.windows-x86_64.signature` → **见 § 3.2**(签名 update.exe 还是 setup.exe?目前签 setup.exe,因为 Tauri 官方 updater 只看 url 字段;update.exe 是 in-app 自实现下载,不强求 minisign)

> JSON 不允许注释；`notes` 里写 changelog 即可。

### 3.2 签名（生产必须）

Tauri v2 updater **默认拒绝未签名二进制**。`signature: ""` 时 app 报 "UpdaterError(Crypto)"。

签名流程（minisign）—— **签的是 `url` 指向的那个 exe（即完整包 `*_x64-setup.exe`）**：

```bash
# 一次性: 生成 key pair (保留 privkey.key, 绝不提交)
minisign -G -p pubkey.pub -s privkey.key

# 每次发布: 签名完整包
minisign -S -m WeavePage_X.Y.Z_x64-setup.exe -s privkey.key
# 输出: WeavePage_X.Y.Z_x64-setup.exe.minisig
# base64 编码（去掉 "untrusted comment" 行, 取第二行）
cat WeavePage_X.Y.Z_x64-setup.exe.minisig | grep -v "^untrusted" | base64 -d | base64
```

把输出的 base64 字符串填到 `version.json.signature`。

### 3.3 配 Tauri 端

`src-tauri/tauri.conf.json` 加 updater 块：

```jsonc
"plugins": {
  "updater": {
    "endpoints": [
      "https://www.aiec.fun/weavepage/version.json"
    ],
    "pubkey": "<pubkey.pub 的内容, 一整行 base64>"
  }
}
```

应用端 `src-tauri/src/lib.rs` 加 updater 检查代码（详见 Tauri v2 官方文档）。
**in-app 自实现部分**:`src/utils/updateCheck.ts` 读 `url` + `update_url`,`src/utils/inAppUpdater.ts` 下载 `update_url` 指向的升级包。

### 3.4 上传

```bash
cd "F:/soft/00selfmade/tiptap_app"
python _upload_weavepage_files.py
# FILES 列表里已经包含 version.json
```

上传后验证：

```bash
TS=$(date +%s)
curl -s "https://www.aiec.fun/weavepage/version.json?_=$TS"
# 检查 version / pub_date / url / update_url / signature 都已更新
```

---

## 验收清单

- [ ] `version` 字段与 `tauri.conf.json` 一致
- [ ] `notes` 写明本版 changelog
- [ ] `pub_date` 是 UTC ISO 8601
- [ ] `platforms.windows-x86_64.url` 指向**完整包** `*_x64-setup.exe`(且 exe 已先上传)
- [ ] `platforms.windows-x86_64.update_url` 指向**升级包** `*_x64-update.exe`(可省略,推荐填)
- [ ] `signature` 已签名 `url` 指向的完整包（生产必填）
- [ ] Tauri 端 `tauri.conf.json` 配置 `pubkey` 和 `endpoints`
- [ ] 上传后 curl 看到新内容

---

## 已知简化

> **本次实现的简化**（用户后续可补强）：
>
> 1. 当前 `signature: ""` —— app 自动更新被拒绝。新版本 app 启动会看到"已是最新"，但用户**不会**收到更新提示
> 2. 当前 `notes` 写在 JSON 里（每次更新手动改），后续可拆 `release-notes-X.Y.Z.html` 用 `notes` 字段链接
> 3. 当前 Tauri 端**未配 updater**（tauri.conf.json 没有 `plugins.updater` 块），app 内不会触发检查

签名补完 + Tauri 端接通后，整个更新链路就闭环了。
