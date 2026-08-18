// 应用内直接下载 + 启动 installer(替代 openUrl(APP_DOWNLOAD_URL) 跳浏览器)
// 设计:
//   1. 用 plugin-http 拉 setup.exe 到 %USERPROFILE%\Downloads\WeavePage-X.Y.Z_x64-setup.exe
//   2. 用 plugin-opener.openPath 启动该 .exe(Windows ShellExecute,等价双击)
//   3. 失败 throw 给上层 UI 提示
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { writeFile } from "@tauri-apps/plugin-fs";
import { downloadDir, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";

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
export async function startInAppUpgrade(
  url: string,
  filename: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<string> {
  const filepath = await downloadInstaller(url, filename, onProgress);
  // openPath 走 Windows ShellExecute,双击 .exe 启动 NSIS 安装器
  await openPath(filepath);
  return filepath;
}
