# WeavePage 发布与运维

本目录覆盖 **aiec.fun/weavepage** 上 WeavePage 安装包的发布流程、服务器运维、下载计数管理。

> **原则**：渐进式披露。本 README 是索引；具体步骤在子文档里，**只在需要时打开**。

---

## 发布新版本（按顺序读 3 篇）

| 顺序 | 文档 | 何时打开 |
|---|---|---|
| **1** | [release-workflow.md](./release-workflow.md) | 准备从源码构建新版本 NSIS 安装包时 |
| **2** | [server-upload.md](./server-upload.md) | 构建完、需要把 exe 推上 aiec.fun/weavepage 时 |
| **3** | [version-info.md](./version-info.md) | 上传完、需要更新 `version.json` 触发 app 自动更新时 |

按这三步走完，新版本就上线了。

---

## 维护（按需读）

| 文档 | 何时打开 |
|---|---|
| [download-counter.md](./download-counter.md) | 查看下载计数、导出 CSV、手动修正异常计数时 |
| [server-architecture.md](./server-architecture.md) | 需要排查 `.htaccess` 不生效、CF 缓存、Nginx 路径等问题时 |

---

## 关键路径速查

| 路径 | 用途 |
|---|---|
| 本地项目 | `F:\soft\00selfmade\tiptap_app\` |
| 本地镜像（L1网站 weavepage） | `E:\办公文件\L1网站\weavepage\` |
| 远程服务器 weavepage | `/var/www/wordpress/weavepage/` |
| SFTP 配置 | `E:\办公文件\L1网站\.vscode\sftp.json` |
| 上传脚本 | `F:\soft\00selfmade\tiptap_app\_upload_weavepage*.py` |
| 远程下载页 | `https://www.aiec.fun/weavepage/download.php` |
| 远程计数器 | `https://www.aiec.fun/weavepage/counter.php` |
| 远程 Tauri 升级 JSON | `https://www.aiec.fun/weavepage/version.json` |

> 详细路径与变更历史见各子文档。
