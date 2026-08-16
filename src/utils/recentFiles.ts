// 最近文件存储:写 %APPDATA%\fun.aiec.weavepage\recent.json
// 设计:LRU + 路径归一化(forward slash),上限 10。失败不阻塞 UI。
import { appDataDir } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const FILE_NAME = "recent.json";
const LIMIT = 10;
const VERSION = 1;

type RecentFile = { version: number; paths: string[] };

function storagePath(dir: string): string {
  return `${dir.replace(/[/\\]+$/, "")}/${FILE_NAME}`;
}

// Tauri 在 Windows 上返回反斜杠路径,统一 forward slash 便于跨平台比对
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

// LRU:已存在的项移到首位,新项 push 到首位,超长截断
function pushLru(list: string[], item: string, limit: number): string[] {
  const norm = normalizePath(item);
  return [norm, ...list.filter((x) => normalizePath(x) !== norm)].slice(0, limit);
}

async function readAll(dir: string): Promise<RecentFile> {
  try {
    const p = storagePath(dir);
    if (!(await exists(p))) return { version: VERSION, paths: [] };
    const raw = await readTextFile(p);
    const data = JSON.parse(raw) as RecentFile;
    if (data.version !== VERSION || !Array.isArray(data.paths)) {
      return { version: VERSION, paths: [] };
    }
    return { version: VERSION, paths: data.paths.slice(0, LIMIT) };
  } catch (e) {
    console.warn("recentFiles.readAll 失败,返回空列表:", e);
    return { version: VERSION, paths: [] };
  }
}

async function writeAll(dir: string, data: RecentFile): Promise<void> {
  try {
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    await writeTextFile(storagePath(dir), JSON.stringify(data));
  } catch (e) {
    console.warn("recentFiles.writeAll 失败:", e);
  }
}

export async function loadRecent(): Promise<string[]> {
  const dir = await appDataDir();
  return (await readAll(dir)).paths;
}

export async function pushRecent(path: string): Promise<string[]> {
  const dir = await appDataDir();
  const cur = await readAll(dir);
  const next = pushLru(cur.paths, path, LIMIT);
  await writeAll(dir, { version: VERSION, paths: next });
  return next;
}

export async function clearRecent(): Promise<string[]> {
  const dir = await appDataDir();
  await writeAll(dir, { version: VERSION, paths: [] });
  return [];
}
