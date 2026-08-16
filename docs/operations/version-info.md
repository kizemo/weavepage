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
    "version": "0.1.1",
    "notes": "v0.1.1 — WeavePage 织页：Word 风格功能区 + ...",
    "pub_date": "2026-08-14T17:30:00Z",
    "platforms": {
        "windows-x86_64": {
            "url": "https://www.aiec.fun/weavepage/download.php?file=WeavePage_0.1.1_x64-setup.exe",
            "signature": ""
        }
    }
}
```

字段说明（Tauri v2 官方字段）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `version` | string | 新版本号（semver），与 `tauri.conf.json` 一致 |
| `notes` | string | 更新说明（app 内显示给用户） |
| `pub_date` | string | RFC3339 UTC 时间 |
| `platforms.<key>.url` | string | 二进制下载地址 |
| `platforms.<key>.signature` | string | base64 签名（**见下**） |

平台 key 当前仅 `windows-x86_64`（NSIS 安装包）。后续如需 macOS/Linux，复制 key 即可。

---

## 更新流程

### 3.1 编辑本地 version.json

打开 `E:\办公文件\L1网站\weavepage\version.json`：

- `version` → 新版本号
- `notes` → 新版本更新说明（一段中文）
- `pub_date` → 当前 UTC 时间（ISO 8601 格式）
- `platforms.windows-x86_64.url` → 新版本 exe URL（含 `?file=WeavePage_X.Y.Z_x64-setup.exe`）
- `platforms.windows-x86_64.signature` → **见 § 3.2**

> JSON 不允许注释；`notes` 里写 changelog 即可。

### 3.2 签名（生产必须）

Tauri v2 updater **默认拒绝未签名二进制**。`signature: ""` 时 app 报 "UpdaterError(Crypto)"。

签名流程（minisign）：

```bash
# 一次性: 生成 key pair (保留 privkey.key, 绝不提交)
minisign -G -p pubkey.pub -s privkey.key

# 每次发布: 签名 exe
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
# 检查 version / pub_date / url / signature 都已更新
```

---

## 验收清单

- [ ] `version` 字段与 `tauri.conf.json` 一致
- [ ] `notes` 写明本版 changelog
- [ ] `pub_date` 是 UTC ISO 8601
- [ ] `platforms.windows-x86_64.url` 指向新版本 exe（且 exe 已先上传）
- [ ] `signature` 已签名（生产必填）
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
