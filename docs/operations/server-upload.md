# 2. 上传到 aiec.fun/weavepage/

把本地 `release/` 和 `E:\办公文件\L1网站\weavepage\` 的变更推到服务器。

---

## 路径映射

| 本地 | 远程 |
|---|---|
| `F:\soft\00selfmade\tiptap_app\release\WeavePage_X.Y.Z_x64-setup.exe` | `/var/www/wordpress/weavepage/WeavePage_X.Y.Z_x64-setup.exe` |
| `E:\办公文件\L1网站\weavepage\*.php` | `/var/www/wordpress/weavepage/` |

**镜像原则**：本地 L1网站 weavepage 目录是远程的真实镜像。新版本 exe 不要放别处，统一放在 `E:\办公文件\L1网站\weavepage\`。

---

## 工具

两个 Python 脚本在 `F:\soft\00selfmade\tiptap_app\`：

| 脚本 | 用途 |
|---|---|
| `_upload_weavepage.py` | 单文件上传（**仅 exe**，含 mkdir + md5 verify） |
| `_upload_weavepage_files.py` | 批量上传（5 个 PHP/JSON/.htaccess，含 md5 verify） |

**安全要点**（与 rime `_sftp_v058.py` 同源）：

- 密码从 `E:\办公文件\L1网站\.vscode\sftp.json` 运行时读，**不硬编码**
- `paramiko.WarningPolicy()` 而非 AutoAddPolicy（防 silent TOFU）
- 上传后跑 server-side `md5sum` 与本地 md5 比对（cross-source verify）
- host key 不在 `~/.ssh/known_hosts` 时拒绝连接 + 提示用户

---

## 上传 exe（发布新版本）

```bash
cd "F:/soft/00selfmade/tiptap_app"

# 1. 复制新 exe 到本地镜像目录（确保两边文件名一致）
cp release/WeavePage_X.Y.Z_x64-setup.exe "E:/办公文件/L1网站/weavepage/"

# 2. 改 _upload_weavepage.py 里的 LOCAL_FILE 常量
#    LOCAL_FILE = "WeavePage_X.Y.Z_x64-setup.exe"

# 3. 运行上传
python _upload_weavepage.py
```

脚本自动完成：

1. 读 sftp.json 凭据
2. SFTP mkdir（远程目录不存在时）
3. 上传 .exe
4. server-side md5sum + size verify

预期输出（节选）：

```
=== [4/5] Server-side md5 verify (cross-source) ===
  server md5:    XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
  local  md5:    XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
  match:         OK (md5 cross-source verified)
  size  check:   OK (NNNNNNNNN == NNNNNNNNN)
```

---

## 上传 PHP/JSON 页面（修改页面时）

只在改了 `E:\办公文件\L1网站\weavepage\download.php` 等页面文件时才跑：

```bash
cd "F:/soft/00selfmade/tiptap_app"
python _upload_weavepage_files.py
```

脚本常量 `FILES` 列出 5 个固定文件：

```python
FILES = ["common.php", "version.json", "download.php", "counter.php", ".htaccess"]
```

> 如果新增/删除了页面文件，**先改 `FILES` 列表**，再跑脚本。

---

## 服务器侧验证

每次上传完，跑 4 个 curl 验证（cache bypass）：

```bash
TS=$(date +%s)

# 1. exe URL (nginx 静态 serve)
curl -sI "https://www.aiec.fun/weavepage/WeavePage_X.Y.Z_x64-setup.exe" \
  | grep -E "^HTTP|Content-Length"

# 2. landing
curl -sI "https://www.aiec.fun/weavepage/download.php?_=$TS" \
  | grep "^HTTP"

# 3. counter (验证计数还在累积)
curl -s "https://www.aiec.fun/weavepage/counter.php?_=$TS" \
  | grep -oE "value\">[0-9]+"

# 4. version.json
curl -s "https://www.aiec.fun/weavepage/version.json?_=$TS"
```

> Cloudflare 缓存旧版本（默认 max-age=7200）。带 `?_=$TS` query string 是项目既定绕过策略。详见 [server-architecture.md](./server-architecture.md#缓存链路)。

---

## 下一步

上传完，进入 [version-info.md](./version-info.md) 更新 `version.json`，让 app 启动时能检测到新版本。
