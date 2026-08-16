# 5. 服务器架构参考

aiec.fun/weavepage 所在服务器架构概览，含已知限制与排障要点。

---

## 链路

```
[用户浏览器 / Tauri client]
        ↓ HTTPS
[Cloudflare CDN]                  ← 静态缓存层（max-age=7200）
        ↓
[Nginx 1.18 (Ubuntu)]             ← 反向代理 + fastcgi cache
        ↓
[PHP-FPM 8.3]                     ← 直接处理 PHP（无 Apache）
        ↓
[/var/www/wordpress/...]          ← docroot
```

> **关键**：服务器是 **Nginx + PHP-FPM 直连**，**无 Apache 中转**。

---

## 已知限制

### 1. `.htaccess` 不生效

**症状**：

- `/weavepage/.htaccess` 文件上传了，访问 `common.php` 仍是 200（`Require all denied` 不生效）
- `/weavepage/download` 不重写到 `download.php`（`RewriteRule` 不生效）

**根因**：PHP-FPM 不解析 `.htaccess`，那是 Apache 专有。Nginx 的 rewrite 在 `/etc/nginx/sites-available/www.aiec.fun`，**SFTP 上传不了**。

**对策**：

| 需求 | 当前做法 |
|---|---|
| 防 `common.php` 直访 | PHP 自防护：`WEAVEPAGE_BOOTSTRAP` 常量 guard（`403 Forbidden`） |
| 防 `downloads.json` 直访 | 当前 nginx 直发（0644 可读）。**生产敏感数据不要放这里**，或 SSH 改 nginx config 加 `location` 屏蔽 |
| `/download` 重写到 `download.php` | 当前未做。直接访问 `/weavepage/download.php` 即可 |
| 目录列表防 403 → 落地页 | 当前 nginx 返回 403；用户需手输 `download.php` |

**SSH 真修**（需用户操作，不在 SFTP 范围）：

```nginx
# /etc/nginx/sites-available/www.aiec.fun 内加 location 块
location /weavepage/ {
    # 目录列表默认 403 (已生效)
    index download.php;
    try_files $uri $uri/ /weavepage/download.php;
}
location = /weavepage/downloads.json { deny all; }
location = /weavepage/common.php { deny all; }
```

然后 `sudo nginx -t && sudo systemctl reload nginx`。

### 2. Cloudflare 缓存

**症状**：上传新版 `download.php`，浏览器访问 `/weavepage/download.php` 仍是旧版（HTML 渲染旧按钮文本）。

**根因**：CF 默认 `max-age=7200`（2 小时）。

**对策**（项目既定策略，详见 L1网站 `CACHE-BYPASS-NGINX.md`）：

| 方法 | 适用 |
|---|---|
| URL 加 `?_=<timestamp>` query string | 临时验证（CF 自动 bypass 带 query 的请求） |
| DevTools Network 勾 "Disable cache" + Ctrl+F5 | 本地调试 |
| Cloudflare API `purge_everything` | 一次性清全站（CF zone id + key 在 sftp.json 之外另存） |

### 3. nginx fastcgi cache + WP-Optimize cache

L1网站整体站（不是 weavepage）有这三层缓存。weavepage 子目录**不在 WP 路由内**，所以 WP-Optimize 不缓存；fastcgi cache 大概率也不缓存（PHP-FPM 直接 serve 不走 fastcgi）。

> 如果改了 weavepage 内的文件**没看到变化**，99% 是 Cloudflare 缓存，不是 nginx/WP-Optimize。

---

## 远程目录结构（当前）

```
/var/www/wordpress/weavepage/
├── .htaccess                   334 B   (装饰性, 不生效)
├── common.php                8,908 B   (含 WEAVEPAGE_BOOTSTRAP guard)
├── counter.php               6,813 B
├── download.php             13,072 B   (含 ?action=count + sendBeacon JS)
├── downloads.json              ~150 B  (自动生成, total=N)
├── version.json                432 B   (Tauri v2 updater 格式)
└── WeavePage_X.Y.Z_x64-setup.exe  ~200 MB
```

权限：

- PHP/JSON 文件：`kizemo:www-data 0664`（PHP-FPM 可读）
- exe：`kizemo:www-data 0664`
- `downloads.json`（首次创建后）：`www-data:www-data 0644`

---

## 远程调试命令速查

通过 `paramiko`（无 SSH shell 时）或 SSH 跑：

```python
import os, paramiko
cfg = json.load(open(r'E:\办公文件\L1网站\.vscode\sftp.json', encoding='utf-8'))
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.WarningPolicy())
known = os.path.expanduser('~/.ssh/known_hosts')
if os.path.exists(known): c.load_host_keys(known)
c.connect(cfg['host'], cfg['port'], cfg['username'], cfg['password'], timeout=30)

# 列目录
_, stdout, _ = c.exec_command('ls -la /var/www/wordpress/weavepage/')
print(stdout.read().decode('utf-8'))

# 读 JSON
_, stdout, _ = c.exec_command('cat /var/www/wordpress/weavepage/downloads.json')
print(stdout.read().decode('utf-8'))

# PHP -l (语法检查)
_, stdout, _ = c.exec_command('php -l /var/www/wordpress/weavepage/download.php')
print(stdout.read().decode('utf-8'))

c.close()
```

---

## 与 pinyin 的关系

aiec.fun 服务器还有 `/var/www/wordpress/pinyin/`（火流猩输入法，相同架构）。两份代码可以互参，但**不要混用脚本**：

| 项 | pinyin | weavepage |
|---|---|---|
| 自动更新协议 | Sparkle XML (appcast.xml) | Tauri JSON (version.json) |
| 计数器存储 | WordPress DB | JSON 文件 |
| 防 common.php 直访 | `.htaccess Require all denied`（不生效） | PHP `WEAVEPAGE_BOOTSTRAP` guard |
| 上传脚本 | `rime_claude/_sftp_v058.py` | `tiptap_app/_upload_weavepage*.py` |
