// 应用内直接下载 + 启动 installer(替代 openUrl(APP_DOWNLOAD_URL) 跳浏览器)
// 设计:
//   1. 用 plugin-http 拉 setup.exe 到 %USERPROFILE%\Downloads\WeavePage-X.Y.Z_x64-setup.exe
//   2. 用 plugin-opener.openPath 启动该 .exe(Windows ShellExecute,等价双击)
//   3. 全程弹 message() 让用户看得到进度 / 错误(不再静默 fallback 到浏览器)
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { writeFile } from "@tauri-apps/plugin-fs";
import { downloadDir, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { message } from "@tauri-apps/plugin-dialog";

export interface DownloadProgress {
  downloaded: number;
  total: number;
}

// 从 url 拉文件到用户 Downloads 目录,返回落盘路径
export async function downloadInstaller(
  url: string,
  filename: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<string> {
  const res = await tauriFetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`下载失败: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  onProgress?.({ downloaded: buf.byteLength, total: buf.byteLength });
  const dir = await downloadDir();
  const filepath = await join(dir, filename);
  await writeFile(filepath, buf);
  return filepath;
}

// 完整 in-app upgrade:下载 + 启动 installer
// 任何步骤失败都弹 message() 让用户看到真实错误,绝不静默 fallback 到浏览器
export async function startInAppUpgrade(
  url: string,
  filename: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<string> {
  // 非阻塞 message 弹窗(异步消息)
  void message(
    `正在下载新版安装程序 ${filename}…\n完成后会自动启动安装器。\n本应用需手动关闭后再装。`,
    { title: "WeavePage 升级中", kind: "info" },
  );
  try {
    const filepath = await downloadInstaller(url, filename, onProgress);
    await openPath(filepath);
    void message(
      `安装程序已启动:Downloads\\${filename}\n请关闭本 WeavePage 后完成安装。`,
      { title: "升级准备就绪", kind: "info" },
    );
    return filepath;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    void message(
      `自动升级失败: ${msg}\n\n请手动访问 https://www.aiec.fun/weavepage/ 下载安装。`,
      { title: "升级失败", kind: "error" },
    );
    throw e;
  }
}
