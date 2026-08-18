// 应用内直接下载 + 启动 installer(替代 openUrl(APP_DOWNLOAD_URL) 跳浏览器)
//
// 设计:
//   1. streaming download:plugin-http fetch + Web ReadableStream.getReader() 累积字节
//      (避免一次性 220MB arrayBuffer 在 webview 内存炸)
//   2. 固定位置 progress overlay:右下角 <div> 显示百分比,实时更新
//   3. 下载完用 plugin-opener.openPath() 启动 NSIS 安装器
//   4. 完成后 getCurrentWindow().close() 关掉本应用,让 NSIS 安裝不受占位影响
//   5. 任何步骤失败都弹 message() 让用户看真实错误,绝不静默
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { writeFile } from "@tauri-apps/plugin-fs";
import { downloadDir, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { message } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface DownloadProgress {
  downloaded: number;
  total: number;
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// 创建一个 floating overlay,实时更新百分比(不靠 React 状态机)
function createProgressOverlay(filename: string) {
  const root = document.createElement("div");
  root.id = "weavepage-upgrade-progress";
  root.innerHTML = `
    <div style="position:fixed;bottom:24px;right:24px;z-index:9999;
                background:var(--surface,#fff);border:1px solid var(--border,#ddd);
                border-radius:8px;padding:14px 18px;
                box-shadow:0 6px 24px rgba(0,0,0,.18);
                font-size:13px;min-width:280px;font-family:inherit;color:inherit">
      <div style="font-weight:600;margin-bottom:6px;">WeavePage 升级中…</div>
      <div id="wp-upgrade-filename" style="color:var(--text-dim,#666);
              font-family:monospace;font-size:11px;margin-bottom:8px;
              word-break:break-all;">${filename}</div>
      <div id="wp-upgrade-pct" style="color:var(--accent,#0b3d91);
              font-size:22px;font-weight:700;line-height:1;">0%</div>
      <div style="height:6px;background:var(--bg-soft,#eee);border-radius:3px;
                  margin-top:8px;overflow:hidden;">
        <div id="wp-upgrade-bar" style="height:100%;background:var(--accent,#0b3d91);
                    width:0%;transition:width .25s ease;"></div>
      </div>
      <div id="wp-upgrade-bytes" style="color:var(--text-dim,#999);
              font-size:11px;margin-top:6px;">准备下载…</div>
    </div>
  `;
  document.body.appendChild(root);
  const pctEl = root.querySelector("#wp-upgrade-pct") as HTMLElement;
  const barEl = root.querySelector("#wp-upgrade-bar") as HTMLElement;
  const bytesEl = root.querySelector("#wp-upgrade-bytes") as HTMLElement;
  let lastRendered = -1;
  return {
    update(downloaded: number, total: number) {
      const pct = total > 0 ? Math.floor((downloaded / total) * 100) : 0;
      // 节流:相同 pct 不重复渲染
      if (pct === lastRendered) return;
      lastRendered = pct;
      pctEl.textContent = `${pct}%`;
      barEl.style.width = `${pct}%`;
      bytesEl.textContent = `${fmtBytes(downloaded)} / ${fmtBytes(total)}`;
    },
    setMessage(msg: string) {
      bytesEl.textContent = msg;
    },
    remove() {
      root.remove();
    },
  };
}

// streaming download:用 ReadableStream.getReader 累积字节(避免一次性 arrayBuffer OOM)
export async function downloadInstaller(
  url: string,
  filename: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<string> {
  const res = await tauriFetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`下载失败: HTTP ${res.status}`);
  if (!res.body) throw new Error("无法获取下载流");

  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      onProgress?.({ downloaded: received, total });
    }
  }

  // 拼接一次性 arrayBuffer(220MB — 一次性 heap 足够)
  let totalSize = 0;
  for (const c of chunks) totalSize += c.byteLength;
  const buf = new Uint8Array(totalSize);
  let pos = 0;
  for (const c of chunks) {
    buf.set(c, pos);
    pos += c.byteLength;
  }

  const dir = await downloadDir();
  const filepath = await join(dir, filename);
  await writeFile(filepath, buf);
  return filepath;
}

// 完整 in-app upgrade:streaming 下载 + 进度 overlay + 启动 installer + 自动关窗
export async function startInAppUpgrade(
  url: string,
  filename: string,
): Promise<void> {
  const overlay = createProgressOverlay(filename);
  try {
    const filepath = await downloadInstaller(url, filename, (p) => {
      overlay.update(p.downloaded, p.total);
    });

    overlay.setMessage("下载完成,启动安装器…");
    await openPath(filepath);

    overlay.setMessage("安装器已启动,关闭 WeavePage…");
    // 给 installer 启动时间(避免 NSIS 锁竞争)
    await new Promise((r) => setTimeout(r, 1500));
    try {
      await getCurrentWindow().close();
    } catch (e) {
      console.warn("getCurrentWindow().close() 失败:", e);
      void message(
        `安装器已启动:Downloads\\${filename}\n请手动关闭 WeavePage 后完成安装。`,
        { title: "升级准备就绪", kind: "info" },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    overlay.remove();
    void message(
      `自动升级失败: ${msg}\n\n请手动访问 https://www.aiec.fun/weavepage/ 下载安装。`,
      { title: "升级失败", kind: "error" },
    );
    throw e;
  }
}
