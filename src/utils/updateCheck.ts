// 在线版本检查工具 —— 通过 tauri-plugin-http 绕过浏览器 CORS 限制
// 注意：URL 加 cache-busting 查询参数绕过 Cloudflare 2h 缓存（线上 version.json 默认 max-age=7200）

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export interface RemoteVersion {
  version: string;
  notes: string;
  pub_date: string;
  /** full 渠道 URL — 落地页 / GitHub release 主链接,嵌 WebView2 离线包 (~209MB) */
  url: string;
  /** update 渠道 URL — 应用内升级专用,无 WebView2 离线包 (~25MB)。没有就 fallback 到 url */
  update_url?: string;
}

// aiec.fun/version.json 公开地址。带 cache-busting 强制 Cloudflare 回源
const VERSION_URL = "https://www.aiec.fun/weavepage/version.json";

export async function fetchRemoteVersion(): Promise<RemoteVersion | null> {
  try {
    const cacheBust = `?_=${Date.now()}`;
    const res = await tauriFetch(VERSION_URL + cacheBust, {
      method: "GET",
      // 防止 Cloudflare 在某些边界条件下对 JSON 也上压缩,触发 plugin-http 的
      // "error decoding response body"。version.json < 1KB,体积不是问题。
      headers: { "Accept-Encoding": "identity" },
    });
    if (!res.ok) {
      console.warn(`fetchRemoteVersion HTTP ${res.status}`);
      return null;
    }
    const data: unknown = await res.json();
    if (!data || typeof data !== "object") return null;
    const obj = data as Record<string, unknown>;
    const platforms = obj["platforms"];
    const win =
      platforms && typeof platforms === "object"
        ? (platforms as Record<string, unknown>)["windows-x86_64"]
        : null;
    const winObj = win && typeof win === "object" ? (win as Record<string, unknown>) : null;
    const url =
      winObj && typeof winObj["url"] === "string"
        ? (winObj["url"] as string)
        : "https://www.aiec.fun/weavepage/";
    const updateUrl =
      winObj && typeof winObj["update_url"] === "string"
        ? (winObj["update_url"] as string)
        : undefined;
    return {
      version: typeof obj["version"] === "string" ? (obj["version"] as string) : "",
      notes: typeof obj["notes"] === "string" ? (obj["notes"] as string) : "",
      pub_date: typeof obj["pub_date"] === "string" ? (obj["pub_date"] as string) : "",
      url,
      update_url: updateUrl,
    };
  } catch (e) {
    console.warn("fetchRemoteVersion failed:", e);
    return null;
  }
}

// 简单 semver 对比（点分三段）。a > b 返回正数，a < b 返回负数，相等返回 0
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/i, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

// 一句话简介
export const APP_TAGLINE =
  "用使用 Word 的方式，编辑 html，轻量、使用简单。—— aiec.fun";

// 应用下载/项目主页（用于「更新」跳转）
export const APP_DOWNLOAD_URL = "https://www.aiec.fun/weavepage/";