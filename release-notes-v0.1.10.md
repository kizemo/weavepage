# WeavePage v0.1.10

## 修复 in-app 升级 ACL 错误

v0.1.9 升级弹窗「升级失败:Command plugin:opener|open_path not allowed by ACL」修复。

`src-tauri/capabilities/default.json` 加上 `opener:allow-open-path`(原 `opener:default` 不包含 `open_path` 这条单独权限)。现在 streaming 下载完成后能用 `openPath()` 启动 NSIS 安装器,后续关闭主窗口。

## 清理 aiec server 旧版本

之前 server 累计 9 个 setup.exe 版本(每 220MB),占用 **~1.5GB**。

策略:**保留当前 + 上一版本(回退备份)**,其余删除。

| 状态 | 版本 |
|---|---|
| KEEP(回退备份 + 当前)| v0.1.10, v0.1.9 |
| DELETE | v0.1.1, v0.1.2, v0.1.4, v0.1.5, v0.1.6, v0.1.7, v0.1.8 |

释放 ~1.3 GB。`_cleanup_old_versions.py` 脚本保留在项目根,可复用(改 `KEEP` 集合)。

## 下载与校验

- **NSIS 安装包**:`WeavePage_0.1.10_x64-setup.exe`
- **SHA256**:`9729d0a71c53a1879e56878822cbf9948631ad6cb306c4ff6d25298fb99c61f3`
- **server md5**:`BEF0C8C85EA206751EF2634C7827FB3E`

## 注意事项

**Cloudflare 缓存**:旧的 `WeavePage_0.1.X_x64-setup.exe` URL 在 Cloudflare 边缘有 2h 缓存,实际文件已删;用 `?_<timestamp>` cache-bust query 可立刻验证新行为。
