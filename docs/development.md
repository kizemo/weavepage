# WeavePage 开发指南

> 读 [PROJECT.md](./PROJECT.md) + [code-map.md](./code-map.md) + [architecture.md](./architecture.md) 后看这边。

## 1. 环境准备

| 依赖 | 要求 |
|---|---|
| OS | Windows 10+ / 11(用户运行),开发可在 macOS / Linux 跨编译 |
| Node | 18+ |
| Rust | 1.7x stable + Tauri CLI |
| 包管理器 | pnpm(项目用 pnpm-lock) |
| 编辑器 | VS Code 或 Cursor 都行(无 IDE 推荐配置) |
| 浏览器/WebView2 | Win10+ 自带;开发从 microsoft.com/edge 下载 Edge WebView2 Runtime |

一次性 setup:
```bash
pnpm install
# 验证 tauri CLI 可用
pnpm tauri --version
```

## 2. 必装 devDep(项目已有的)

- `tsx`:直接跑 `src/utils/*.test.ts`(无 Vitest,node:test 套 tsx)
- `vite`:dev server + 构建
- `@tauri-apps/cli`:tauri build/dev

## 3. 工作流:加一个新功能

按 spec → plan → TDD → commit → build → 验收 → 发布 顺序:

```
1. 写 docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
   (用 brainstorming skill;澄清决策表 + 架构 + 错误处理 + 真机验收清单)
2. 写 docs/superpowers/plans/YYYY-MM-DD-<topic>.md
   (用 writing-plans skill;每个 task 含失败测试 + 验证步骤 + commit 命令)
3. 按 task 顺序执行,失败测试 → 实现 → 通过 → commit
   每个 commit 用 git -c user.name="aiec.fun" -c user.email="dev@aiec.fun" commit
4. pnpm build 验证 0 TS 错
5. pnpm release 验证 0 TS 错 + NSIS/MSI 产物
6. 真机装机验收(这是 hard gate,不许走 form 跳过)
7. 发布(见 §6)
```

文档位置约定:
- `docs/superpowers/specs/` — 提案
- `docs/superpowers/plans/` — 计划
- `handoff-<topic>-<date>.md` 与 `prompt-<topic>-<date>.md` — 跨会话接力(放项目根)

## 4. 版本号规则

4 处必须同步:

| 文件 | 字段 |
|---|---|
| `package.json` | `"version": "X.Y.Z"` |
| `src-tauri/tauri.conf.json` | `"version": "X.Y.Z"` |
| `scripts/copy-release.mjs` | 5 个文件名字符串(包括 namespace + MSI)|
| `README.md` | 变更日志 + SHA256(由 dirty 状态,本轮不动) |

release 工具链(`_upload_weavepage.py`)还有第 5 个文件名 `LOCAL_FILE`。三个文件 read-then-edit 不要忘了。

升级语义:
- **MAJOR**(0.2.0) — 不兼容 schema、用户操作流程大变
- **MINOR**(0.1.4 → 0.1.5) — 新功能(feature)
- **PATCH**(hotfix 0.1.5 → 0.1.6) — bug fix、不加新功能

热修(PATCH):
- 例:`fix: in-app 升级 streaming 下载 + 进度 overlay + 自动关窗` 就是 PATCH
- 通常会绕过 dirty workspace(用户显式要"立刻修"时)
- 在 commit message 中说明越界原因

## 5. 测试

```bash
pnpm tsx src/utils/paragraphSpacing.test.ts   # 10 用例
pnpm tsx src/utils/defaultStyle.test.ts      # 16 用例
```

单元测试规约:
- 用 `node:test`,不引 Vitest(保持 deps 简单)
- 测试覆盖边界情况:空字符串 / margin: 0 auto / px → pt 换算 / auto 关键字
- TODO:加新 utils 时**必须**同步写 .test.ts,不写不算完成

## 6. 发布流程

```bash
# 1. 升版本号(4 文件 + upload script LOCAL_FILE)
# 2. pnpm release(会跑 tsc + tauri build + copy-release.mjs)
pnpm release

# 3. 算 SHA256,把 .exe 复制到 aiec working copy
certutil -hashfile release/WeavePage_X.Y.Z_x64-setup.exe SHA256
cp release/WeavePage_X.Y.Z_x64-setup.exe "E:/办公文件/L1网站/weavepage/"

# 4. 更新 E:/办公文件/L1网站/weavepage/version.json(vX.Y.Z + notes + url)
# 5. 上传 setup.exe + site files
python _upload_weavepage.py           # setup.exe
python _upload_weavepage_files.py     # common.php / version.json / download.php / counter.php / .htaccess

# 6. (可选)git tag + push + gh release
git tag vX.Y.Z && git push origin master vX.Y.Z
gh release create vX.Y.Z release/*.exe release/*.msi \
    --notes-file release-notes-vX.Y.Z.md --draft=false

# 7. (可选)清理旧版本(只留当前 + 上一版本回退备份)
python _cleanup_old_versions.py
```

详细参考 `docs/operations/release-workflow.md` + `docs/operations/server-upload.md`。

## 7. 调试技巧

| 现象 | 排查路径 |
|---|---|
| 启动后空白 | Webview console → 看 console 错误(在 tauri 窗口右键 → Inspect Element)|
| ACL 错误 | `Command plugin:X|Y not allowed by ACL` 提示 → 查 `src-tauri/capabilities/default.json` 是否 declare 该命令 |
| 升级失败 | webview console 看 `console.warn` + 弹窗 message;server-side 见 `download.php` 的 200/octet-stream 与 cache-bust query |
| file 路径错 | 检查 `%APPDATA%\fun.aiec.weavepage\` 目录;`pushRecent` 写失败会被 `console.warn` 吃掉 |
| Tauri build 失败 os error 32 | 重试 `pnpm release`;NSIS/Defender 临时占用文件 |
| Cloudflare 还 serve 旧内容 | 用 `?_<timestamp>` cache-bust query 验证;2h 后自然 reset |
| `Failed to fetch` 大文件 | 升级用 streaming `getReader()`,不要 `arrayBuffer()` 一次性读 |

## 8. 已知陷阱 / 约束

(常踩坑,从 v0.1.5~v0.1.10 hot-fix history 总结)

1. **nginx 不认 `.htaccess`**:`/weavepage/` 目录请求 → 403。workaround 在 weavepage 目录放 `index.html` 做 meta refresh
2. **Cloudflare cache 2h**:server 改动了要先 cache-bust query 验证
3. **`kizemo` 没 sudo**:改 nginx config 走不通,只能在 weavepage/file 范围
4. **大文件 Failed to fetch**:用 streaming reader(`getReader()`)+ 进度 overlay,不要 `arrayBuffer()`
5. **`plugin:X|Y` ACL**:每个新命令都得在 capabilities/default.json 加对应 `allow-X`
6. **Tauri bundle 文件锁**:偶发,重试即可
7. **NSIS install 锁现有**:下载完等 1-2s 再 openPath
8. **Remember Checkpoint**:clean working tree 永远是 hotfix 的前提(不,然后越界是常态,见下条)
9. **越界 dirty workspace**:用户明说"立刻修"时,可以临时越过 dirty 列表(README/Cargo 等)在 commit message 里写明
10. **post-tool hook 噪音**(本仓库 project hook):`bash -c 'python F:/soft/00selfmade/media-to-doc/scripts/sync_long_doc_skill.py'` 报 ENOENT,**永远忽略**

## 9. 跨会话接续指引(给 AI 看)

```
1. 读 docs/PROJECT.md       ← 5 分钟知项目
2. 读 docs/code-map.md       ← 15 分钟知代码在哪
3. 读 docs/architecture.md   ← 30 分钟知数据流 + ACL + 服务端约束
4. 按需 翻 docs/development.md
5. 读 ~/.claude/projects/.../memory/MEMORY.md
   ├── feedback_no_commit_without_real_test.md     ← hard gate
   ├── feedback_git_identity_per_cmd.md             ← commit 身份
   ├── project_weavepage_release_flow.md            ← 4 字符串 + 2 installer + SFTP
   ├── project_weavepage_brand.md                   ← brand + slogan + aiec.fun 域名
   ├── reference_aiec_ops_paths.md                  ← SFTP 凭证 + ops 路径(不泄露密码)
   └── project_aiec_nginx_quirks.md                 ← nginx 不认 .htaccess + Cloudflare cache 2h
6. 读最近的 handoff-*.md + prompt-*.md(项目根目录)
   内容接力上下文 + 下一步必交付 + 禁止事项
```

## 10. 已知 dirty workspace(已知未 commit 工作)

| 文件 | 来源 | 处理方式 |
|---|---|---|
| `README.md` | 早期 dirty | 等用户单独决定(变更日志 + SHA256) |
| `src-tauri/{Cargo.toml, Cargo.lock, capabilities/default.json, src/lib.rs}` | 早版本升级残留 | 等用户单独决定 |
| `src/components/MenuBar.tsx` | 早版本升级残留 | 等用户单独决定 |
| `src/components/AboutDialog.tsx` | 早版本升级残留(被 v0.1.8 越过改 in-app 升级)| 用户已显式要求 |
| `src/utils/updateCheck.ts` | 早版本升级残留 | 已 v0.1.10 内部调整过(回退原 URL)|
| `assets/poster.jpg` `src/components/AboutDialog.tsx` 等 3 个 ?? 文件 | 早版本 | 同上,等用户验收 |
