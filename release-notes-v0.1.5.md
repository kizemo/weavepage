# WeavePage v0.1.5

## 在线升级不再跳浏览器

启动弹窗发现新版本时点「立即升级」,**应用内直接下载**新版安装包到 `%USERPROFILE%\Downloads`,然后**自动启动 NSIS 安装器**,不再 `openUrl` 跳系统浏览器。

行为变更:
- 弹窗文案:`立即升级`(替代 `去下载`)+ 提示「下载完成后需手动关闭本应用再装」
- 下载来源:version.json 里的精确 installer URL(`?file=WeavePage_X.Y.Z_x64-setup.exe`)
- 失败兜底:仍开浏览器到落地页

依赖:`plugin-http` (fetch) + `plugin-fs` (writeFile) + `plugin-opener` (openPath 启动 .exe) + `path.downloadDir`

## download.php 默认行为变更(server-side)

`https://www.aiec.fun/weavepage/download.php` **不再展示落地页**,直接 serve 最新版的 setup.exe(220MB,`Content-Disposition: attachment`)。
有 `?file=X` 时仍按指定文件 serve;有 `?action=count` 时仍只计数 204。

> **注意**:Cloudflare 缓存 2h 内可能仍返回旧 HTML。如需立刻验证新行为,用 `?_<timestamp>` cache-bust query。

## v0.1.4 → v0.1.5(无功能差异,仅为热修载体)

- 工具栏段落组 `行距 / 段前 / 段后`
- 右键菜单 `设为默认样式` (命名块 `weavepage-default-styles`)

## 下载与校验

- **NSIS 安装包**:`WeavePage_0.1.5_x64-setup.exe`
- **SHA256**:`5f789f1893ba7a306c418050e8f06dd420f0ba086607aeb57a1581ecf23dc143`

```
certutil -hashfile WeavePage_0.1.5_x64-setup.exe SHA256
```

## 已知外部依赖

- `install/index.html` 服务器端 `meta refresh` 跳 `download.php`,workaround nginx 不认 `.htaccess` 的 `DirectoryIndex`。Cloudflare 缓存上同样命中。
