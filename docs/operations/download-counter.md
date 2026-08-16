# 4. 下载计数管理

每次用户点下载链接、或 Tauri 触发自动更新，服务器会增加一次计数。计数以 JSON 文件持久化。

---

## 文件位置

| 本地无对应（仅远程） | 远程 |
|---|---|
| — | `/var/www/wordpress/weavepage/downloads.json` |

远程自动生成于第一次下载；权限 `www-data:www-data 0644`（nginx 直发可读）。

---

## JSON 结构

```json
{
    "total": 11,
    "by_version": {
        "0.1.1": 11
    },
    "last_download": "2026-08-16T13:25:38Z",
    "last_filename": "WeavePage_0.1.1_x64-setup.exe"
}
```

字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `total` | int | 累计下载次数 |
| `by_version` | object | 各版本独立计数（key = semver 字符串） |
| `last_download` | string | 最近一次下载时间（UTC ISO 8601） |
| `last_filename` | string | 最近下载的 exe 文件名 |

---

## 触发方式

| 触发源 | URL | 是否计数 |
|---|---|---|
| 浏览器点 landing 按钮 | `<a download href="/weavepage/WeavePage_X.Y.Z_x64-setup.exe">` | ✅（JS sendBeacon） |
| 浏览器点 landing 版本列表 | 同上 | ✅ |
| curl / Tauri 直接打 `?file=...` | `/weavepage/download.php?file=WeavePage_X.Y.Z_x64-setup.exe` | ✅（PHP 内置） |
| 直接打 `.exe` URL | `/weavepage/WeavePage_X.Y.Z_x64-setup.exe` | ❌（nginx 静态 serve，不经 PHP） |
| Tauri 自动更新拉 `version.json.url` | 同上 `?file=...` 链接 | ✅ |

> **最后两种差异是有意的**：直接链 `.exe` 不走 PHP（最快下载），所以不计；Tauri 自动更新走 `?file=...`（要校验服务端响应），所以计。

---

## 查看计数

### 浏览器

直接打开 `https://www.aiec.fun/weavepage/counter.php` 看带 UI 的统计页。

### 命令行

```bash
# 通过 SSH 或 SFTP exec
cat /var/www/wordpress/weavepage/downloads.json

# 通过本项目脚本（直接读远程）
python -c "
import json, os, paramiko
cfg = json.load(open(r'E:\办公文件\L1网站\.vscode\sftp.json', encoding='utf-8'))
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.WarningPolicy())
known = os.path.expanduser('~/.ssh/known_hosts')
if os.path.exists(known): c.load_host_keys(known)
c.connect(cfg['host'], cfg['port'], cfg['username'], cfg['password'], timeout=30)
_, stdout, _ = c.exec_command('cat /var/www/wordpress/weavepage/downloads.json')
print(stdout.read().decode('utf-8'))
c.close()
"
```

---

## 导出 CSV

```bash
python -c "
import json, csv, paramiko, os
cfg = json.load(open(r'E:\办公文件\L1网站\.vscode\sftp.json', encoding='utf-8'))
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.WarningPolicy())
known = os.path.expanduser('~/.ssh/known_hosts')
if os.path.exists(known): c.load_host_keys(known)
c.connect(cfg['host'], cfg['port'], cfg['username'], cfg['password'], timeout=30)
_, stdout, _ = c.exec_command('cat /var/www/wordpress/weavepage/downloads.json')
d = json.loads(stdout.read().decode('utf-8'))
c.close()

with open('downloads.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['version', 'count'])
    for v, n in sorted(d['by_version'].items(), key=lambda x: -x[1]):
        w.writerow([v, n])
    w.writerow(['TOTAL', d['total']])
print('已写入 downloads.csv')
"
```

---

## 修正异常计数

如果被刷量（脚本狂点 `/download.php?action=count`），手动改远程 JSON：

```bash
python <<'EOF'
import json, os, paramiko
cfg = json.load(open(r'E:\办公文件\L1网站\.vscode\sftp.json', encoding='utf-8'))
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.WarningPolicy())
known = os.path.expanduser('~/.ssh/known_hosts')
if os.path.exists(known): c.load_host_keys(known)
c.connect(cfg['host'], cfg['port'], cfg['username'], cfg['password'], timeout=30)
sftp = c.open_sftp()
with sftp.open('/var/www/wordpress/weavepage/downloads.json', 'r') as f:
    d = json.load(f)

# 改成你要的值
d['total'] = 0
d['by_version'] = {}
sftp.close()

# 写回（用 cat 重定向避免 paramiko 直接写权限问题）
new_json = json.dumps(d, indent=4, ensure_ascii=False)
_, stdout, _ = c.exec_command(f"echo {json.dumps(new_json)} > /var/www/wordpress/weavepage/downloads.json.tmp && mv /var/www/wordpress/weavepage/downloads.json.tmp /var/www/wordpress/weavepage/downloads.json")
print('已重置')
c.close()
EOF
```

> ⚠ 当前 `download.php` 接受任意来源的 GET，无 IP/UA 校验。如发现刷量，可在 `common.php` 加白名单或限频。

---

## 已知限制

1. **写权限归属**：文件首次创建由 `www-data` 拥有，SFTP 用户 `kizemo` 默认**只能读**。手动重写需走 PHP 路径（让 www-data 写）或 SSH chown。
2. **并发写竞争**：当前 `file_put_contents(... LOCK_EX)` 加锁，但两个并发请求仍可能读到同一份基础 JSON 并各自 +1 后写回（last-write-wins）。低流量场景无问题，高并发场景需改 SQLite/MySQL。
3. **无去重**：同一用户连点 100 次 = 100 次计数。要做去重需引入 IP+UA hash + 时间窗。
