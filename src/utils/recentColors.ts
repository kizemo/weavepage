// 最近颜色存储:写 %APPDATA%\fun.aiec.weavepage\recent-colors.json
// 设计:text/highlight 两套独立 LRU,各上限 8。hex 归一化(#abc → #aabbcc),失败不阻塞 UI。
import { appDataDir } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const FILE_NAME = "recent-colors.json";
const LIMIT = 8;
const VERSION = 1;

export type ColorKind = "text" | "highlight";
type RecentColors = { version: number; text: string[]; highlight: string[] };
export type RecentColorsResult = { text: string[]; highlight: string[] };

function storagePath(dir: string): string {
  return `${dir.replace(/[/\\]+$/, "")}/${FILE_NAME}`;
}

// 颜色归一化:小写,3 位 hex 展开成 6 位
function normalizeColor(c: string): string {
  const t = c.trim().toLowerCase();
  const m = t.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!m) return t;
  const hex = m[1];
  if (hex.length === 3) {
    return "#" + hex.split("").map((ch) => ch + ch).join("");
  }
  return t;
}

// LRU:已存在的项移到首位,新项 push 到首位,超长截断
function pushLru(list: string[], item: string, limit: number): string[] {
  const norm = normalizeColor(item);
  return [norm, ...list.filter((x) => normalizeColor(x) !== norm)].slice(0, limit);
}

async function readAll(dir: string): Promise<RecentColors> {
  try {
    const p = storagePath(dir);
    if (!(await exists(p))) return { version: VERSION, text: [], highlight: [] };
    const raw = await readTextFile(p);
    const data = JSON.parse(raw) as RecentColors;
    if (data.version !== VERSION) return { version: VERSION, text: [], highlight: [] };
    return {
      version: VERSION,
      text: (Array.isArray(data.text) ? data.text : []).slice(0, LIMIT),
      highlight: (Array.isArray(data.highlight) ? data.highlight : []).slice(0, LIMIT),
    };
  } catch (e) {
    console.warn("recentColors.readAll 失败,返回空列表:", e);
    return { version: VERSION, text: [], highlight: [] };
  }
}

async function writeAll(dir: string, data: RecentColors): Promise<void> {
  try {
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    await writeTextFile(storagePath(dir), JSON.stringify(data));
  } catch (e) {
    console.warn("recentColors.writeAll 失败:", e);
  }
}

export async function loadRecentColors(): Promise<RecentColorsResult> {
  const dir = await appDataDir();
  const data = await readAll(dir);
  return { text: data.text, highlight: data.highlight };
}

export async function pushRecentColor(
  kind: ColorKind,
  color: string,
): Promise<RecentColorsResult> {
  const dir = await appDataDir();
  const cur = await readAll(dir);
  const next: RecentColors = {
    version: VERSION,
    text: kind === "text" ? pushLru(cur.text, color, LIMIT) : cur.text,
    highlight: kind === "highlight" ? pushLru(cur.highlight, color, LIMIT) : cur.highlight,
  };
  await writeAll(dir, next);
  return { text: next.text, highlight: next.highlight };
}

// 不传 kind:两套都清;传 kind:只清其中一套
export async function clearRecentColors(kind?: ColorKind): Promise<RecentColorsResult> {
  const dir = await appDataDir();
  const cur = await readAll(dir);
  const next: RecentColors = {
    version: VERSION,
    text: kind === "text" ? [] : kind === "highlight" ? cur.text : [],
    highlight: kind === "highlight" ? [] : kind === "text" ? cur.highlight : [],
  };
  await writeAll(dir, next);
  return { text: next.text, highlight: next.highlight };
}
