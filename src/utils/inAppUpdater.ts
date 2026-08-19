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
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
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

// 下载阶段错误,携带 URL + 已下载字节/总字节 + 阶段标识
// 用于在用户弹窗里展示 "下载 47MB / 209MB (22%) 时中断" 这种可定位信息,
// 而不是裸抛 "error decoding response body"(reqwest 内部字符串,无上下文)
export class DownloadError extends Error {
  readonly url: string;
  readonly downloaded: number;
  readonly total: number;
  readonly phase: "connect" | "stream" | "write";
  readonly status: number | null;

  constructor(
    message: string,
    opts: {
      url: string;
      downloaded: number;
      total: number;
      phase: "connect" | "stream" | "write";
      status?: number | null;
    },
  ) {
    super(message);
    this.name = "DownloadError";
    this.url = opts.url;
    this.downloaded = opts.downloaded;
    this.total = opts.total;
    this.phase = opts.phase;
    this.status = opts.status ?? null;
  }

  formatDetail(): string {
    const phaseZh: Record<typeof this.phase, string> = {
      connect: "连接阶段",
      stream: "下载阶段",
      write: "写入阶段",
    };
    const sizeInfo =
      this.total > 0
        ? `${fmtBytes(this.downloaded)} / ${fmtBytes(this.total)} (${Math.floor((this.downloaded / this.total) * 100)}%)`
        : fmtBytes(this.downloaded);
    const lines = [
      `阶段: ${phaseZh[this.phase]}`,
      `进度: ${sizeInfo}`,
    ];
    if (this.status !== null) lines.push(`HTTP: ${this.status}`);
    lines.push(`URL: ${this.url}`);
    return lines.join("\n");
  }
}

// 把任意 caught 错误归一化为 DownloadError + 元信息,便于 catch 块格式化
function asDownloadError(
  e: unknown,
  url: string,
  downloaded: number,
  total: number,
  phase: "connect" | "stream" | "write",
  status: number | null = null,
): DownloadError {
  if (e instanceof DownloadError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new DownloadError(msg, { url, downloaded, total, phase, status });
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
// 关键头:Accept-Encoding: identity —— 告诉上游"我不接压缩响应",绕开 plugin-http +
// reqwest 在 stream 模式下偶发的 "error decoding response body"(Cloudflare 对大文件
// 仍可能切 chunked / 部分压缩,显式拒绝可省去解压路径上的不稳定因素)
export async function downloadInstaller(
  url: string,
  filename: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<string> {
  let res: Response;
  try {
    res = await tauriFetch(url, {
      method: "GET",
      headers: { "Accept-Encoding": "identity" },
    });
  } catch (e) {
    throw asDownloadError(e, url, 0, 0, "connect");
  }
  if (!res.ok) {
    throw new DownloadError(`下载失败: HTTP ${res.status}`, {
      url,
      downloaded: 0,
      total: 0,
      phase: "connect",
      status: res.status,
    });
  }
  if (!res.body) {
    throw new DownloadError("无法获取下载流", {
      url,
      downloaded: 0,
      total: 0,
      phase: "connect",
      status: res.status,
    });
  }

  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        onProgress?.({ downloaded: received, total });
      }
    }
  } catch (e) {
    // 关键点:reqwest stream chunk 失败时抛 "error decoding response body",
    // 用 DownloadError 包住,让上层能展示 "下载 X MB / Y MB (N%) 时中断"
    throw asDownloadError(e, url, received, total, "stream", res.status);
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
  try {
    await writeFile(filepath, buf);
  } catch (e) {
    throw asDownloadError(e, url, buf.length, total, "write", res.status);
  }
  return filepath;
}

// 完整 in-app upgrade:streaming 下载 + 进度 overlay + 启动 installer + 自动关窗
//
// stream 中断重试:reqwest 在大文件 stream 模式偶发 "error decoding response body"
// (CF chunked / 半途连接重置 / 解压路径异常),本地重试 3 次,清空 buffer 重下。
// connect / write 阶段错误不重试(网络根本不通 / 磁盘问题重试也无效)。
const MAX_RETRY = 3;
const RETRY_BASE_DELAY_MS = 2000;

export async function startInAppUpgrade(
  url: string,
  filename: string,
): Promise<void> {
  const overlay = createProgressOverlay(filename);
  let filepath: string | undefined;
  try {
    // 重试循环:仅 retry stream 阶段中断
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      try {
        filepath = await downloadInstaller(url, filename, (p) => {
          overlay.update(p.downloaded, p.total);
        });
        break; // 成功,落到 openPath
      } catch (e) {
        const retryable = e instanceof DownloadError && e.phase === "stream";
        if (!retryable || attempt >= MAX_RETRY) throw e;
        const delay = RETRY_BASE_DELAY_MS * attempt;
        overlay.setMessage(
          `下载中断,${delay / 1000}s 后重试 (${attempt}/${MAX_RETRY})…`,
        );
        // 让 overlay 的 pct 重置(新的 downloadInstaller 会从 0 开始累计,
        // 但 overlay.lastRendered 还是上次的高 pct,显式推一个 0% 进去)
        overlay.update(0, 0);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    if (!filepath) throw new Error("download loop exited without filepath");

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
    // ACL 兜底:旧版本未声明 opener:allow-open-path 时(openPath 报 ACL 拒绝),
    // 改用 opener:default 自带的 openUrl 打开下载页,浏览器下载即可
    const isAclError = /not allowed by ACL|open_path/i.test(msg);
    if (isAclError) {
      overlay.setMessage("当前版本不支持应用内启动安装器,正在打开浏览器下载页…");
      try {
        await openUrl("https://www.aiec.fun/weavepage/");
        overlay.remove();
        await new Promise((r) => setTimeout(r, 800));
        try {
          await getCurrentWindow().close();
        } catch (closeErr) {
          console.warn("getCurrentWindow().close() 失败:", closeErr);
        }
        return;
      } catch (fallbackErr) {
        console.warn("openUrl 兜底失败:", fallbackErr);
        // 兜底也失败,继续走原来的错误弹窗
      }
    }
    overlay.remove();
    // DownloadError 带 URL + 进度 + 阶段,展示出来方便定位
    // (reqwest stream 中断时裸字符串是 "error decoding response body",无上下文)
    const detail = e instanceof DownloadError ? `\n\n${e.formatDetail()}` : "";
    // console 留一份详细 trace,便于用户在 DevTools / 日志里反馈
    console.error("[startInAppUpgrade] 失败:", e);
    void message(
      `自动升级失败: ${msg}${detail}\n\n请手动访问 https://www.aiec.fun/weavepage/ 下载安装。`,
      { title: "升级失败", kind: "error" },
    );
    throw e;
  }
}
