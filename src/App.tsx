import { useState, useCallback, useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import FontFamily from "@tiptap/extension-font-family";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { open, save, ask } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, readFile } from "@tauri-apps/plugin-fs";
import { getVersion } from "@tauri-apps/api/app";
import { FontSize } from "./extensions/FontSize";
import { GlobalAttrs, DivNode, SpanNode } from "./extensions/HtmlCompat";
import { MenuBar } from "./components/MenuBar";
import type { RibbonTab, EditMode } from "./components/MenuBar";
import { Ribbon } from "./components/Ribbon";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import type { DocState } from "./components/TabBar";
import { Sidebar } from "./components/Sidebar";
import { BlockSourcePanel } from "./components/BlockSourcePanel";
import type { ResourceRef } from "./components/Sidebar";
import type { ViewMode, ThemeMode } from "./components/Ribbon";
import { AboutDialog } from "./components/AboutDialog";
import { EditorContextMenu } from "./components/EditorContextMenu";
import { formatHtml } from "./utils/formatHtml";
import { loadRecent, pushRecent, clearRecent } from "./utils/recentFiles";
import { loadRecentColors, pushRecentColor } from "./utils/recentColors";
import type { ColorKind, RecentColorsResult } from "./utils/recentColors";
import {
  fetchRemoteVersion,
  compareVersions,
  APP_DOWNLOAD_URL,
} from "./utils/updateCheck";
import { startInAppUpgrade } from "./utils/inAppUpdater";
import {
  applyLineHeight,
  applyParagraphSpacing,
} from "./utils/paragraphSpacing";
import {
  upsertShellHead,
  blockTypeToSelector,
} from "./utils/defaultStyle";
import "./App.css";

const THEME_KEY = "tiptap-theme";
const VIEW_KEY = "tiptap-view-mode";

type ThemeState = ThemeMode;

interface DocShell {
  doctype: string;
  head: string;
  headCss: string;
  bodyAttrs: string;
  scripts: string;
  styles: string;
  baseHref: string;
}

// 文档 CSS 作用域限定到编辑区：html→.editor-scroll，body→.editor-body，避免污染应用界面
// 固定定位（fixed）转为绝对定位（absolute），以编辑窗口为定位边界，不超出编辑区
const scopedCss = (css: string): string =>
  css
    .replace(
      /(^|[\s}])(html|body)(?=[\s{])/g,
      (_m, pre, tag) => pre + (tag === "html" ? ".editor-scroll" : ".editor-body")
    )
    .replace(/position:\s*fixed/gi, "position: absolute");

// 把编辑内容注入原始 HTML 的 body 区域（保留 head/style/script，刷新预览时用）
const injectBody = (raw: string, bodyHtml: string): string =>
  raw.replace(/(<body[^>]*>)[\s\S]*?(<\/body>)/i, `$1${bodyHtml}$2`);

// 预览注入脚本：body 可编辑（contenteditable），编辑内容经 postMessage 同步回编辑器
// 发送前克隆 body 并移除 script/style，避免脚本内容混入编辑文档
const PREVIEW_EDIT_SCRIPT = `<script id="tiptap-preview-edit">(function(){if(window.parent===window)return;document.body.setAttribute("contenteditable","true");var t=null;document.addEventListener("input",function(){clearTimeout(t);t=setTimeout(function(){try{var c=document.body.cloneNode(true);c.querySelectorAll("script,style").forEach(function(n){n.remove()});window.parent.postMessage({type:"tiptap-preview-edit",html:c.innerHTML},"*")}catch(e){}},400)})})();<\/script>`;

const emptyDoc = (id: number): DocState => ({
  id,
  kind: "html",
  filePath: null,
  isModified: false,
  body: "<p></p>",
  sourceText: "",
  mode: "edit",
  shell: null,
  rawFullDoc: null,
  resources: [],
});

function App() {
  const [docs, setDocs] = useState<DocState[]>([emptyDoc(1)]);
  const [activeId, setActiveId] = useState(1);
  const idRef = useRef(2);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_KEY) as ViewMode) || "page"
  );
  const [theme, setTheme] = useState<ThemeState>(
    () => (localStorage.getItem(THEME_KEY) as ThemeState) || "system"
  );
  const [mode, setMode] = useState<EditMode>("edit");
  const [previewKey, setPreviewKey] = useState(0);
  const [rawFullDoc, setRawFullDoc] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isModified, setIsModified] = useState(false);
  const [shell, setShell] = useState<DocShell | null>(null);
  const [blockPanelPos, setBlockPanelPos] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    blockType: string | null;
    blockAttrs?: Record<string, unknown>;
    blockPos: number;
  } | null>(null);
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<RibbonTab>("edit");
  const [wordCount, setWordCount] = useState(0);
  const [showSidebar, setShowSidebar] = useState(true);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [recentColors, setRecentColors] = useState<RecentColorsResult>({ text: [], highlight: [] });
  const [appVersion, setAppVersion] = useState("");
  const [showAbout, setShowAbout] = useState(false);
  const [startupPromptShown, setStartupPromptShown] = useState(false);

  // ---- 启动加载最近文件 / 最近颜色 ----
  useEffect(() => {
    loadRecent().then(setRecentPaths).catch((e) => console.warn("loadRecent 失败:", e));
    loadRecentColors()
      .then(setRecentColors)
      .catch((e) => console.warn("loadRecentColors 失败:", e));
  }, []);

  // ---- 启动：读取当前版本 + 检查在线更新 ----
  useEffect(() => {
    let mounted = true;
    (async () => {
      let current = "";
      try {
        current = await getVersion();
      } catch (e) {
        console.warn("getVersion 失败:", e);
        return;
      }
      if (!mounted) return;
      setAppVersion(current);

      const remote = await fetchRemoteVersion();
      if (!mounted) return;
      const newer = !!(remote && remote.version && compareVersions(remote.version, current) > 0);

      // 启动弹窗（仅一次）：发现新版本时询问用户
      if (newer && remote && !startupPromptShown) {
        setStartupPromptShown(true);
        try {
          const yes = await ask(
            `发现新版本 v${remote.version}（当前 v${current}）\n\n${remote.notes ?? ""}\n\n点「立即升级」会下载到本地 Downloads 并启动安装程序,本应用需手动关闭后再装。`,
            {
              title: "WeavePage 有新版本",
              kind: "info",
              okLabel: "立即升级",
              cancelLabel: "稍后",
            }
          );
          if (yes && mounted) {
            // 优先用 version.json 里精确指向的 installer URL(走 ?file= 直接 serve)
            // 兜底用 APP_DOWNLOAD_URL(它也直接 serve 了,见 v0.1.5 hotfix)
            const downloadUrl = remote.url || APP_DOWNLOAD_URL;
            // 从 URL 末段拿文件名,失败回退恒定
            const filename = (() => {
              try {
                const u = new URL(downloadUrl);
                const fromPath = u.pathname.split("/").pop() || "";
                if (fromPath.endsWith(".exe")) return fromPath;
                const fromQuery = u.searchParams.get("file") || "";
                if (fromQuery.endsWith(".exe")) return fromQuery;
              } catch {
                /* 不致命 */
              }
              return `WeavePage-${remote.version}_x64-setup.exe`;
            })();
            // in-app 升级失败时不再 fallback 到打开浏览器;
            // startInAppUpgrade 内部已经 message() 报真实错误给用户
            await startInAppUpgrade(downloadUrl, filename).catch((e) => {
              console.warn("启动时 in-app upgrade 失败:", e);
            });
          }
        } catch (e) {
          console.warn("启动更新弹窗失败:", e);
        }
      } else {
        setStartupPromptShown(true);
      }
    })();
    return () => {
      mounted = false;
    };
    // startupPromptShown 在闭包里访问 — 启动弹窗只触发一次即可,变更后 effect 不再重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeDoc = docs.find((d) => d.id === activeId) ?? docs[0];

  // ---- 主题应用 ----
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // ---- 视图模式持久化 ----
  useEffect(() => {
    localStorage.setItem(VIEW_KEY, viewMode);
  }, [viewMode]);

  // ---- 文档状态更新助手 ----
  const updateActiveDoc = useCallback(
    (patch: Partial<DocState>) => {
      setDocs((prev) => prev.map((d) => (d.id === activeId ? { ...d, ...patch } : d)));
    },
    [activeId]
  );

  // ---- 编辑器（单实例，随活动标签切换内容） ----
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: { openOnClick: false, HTMLAttributes: { target: "_blank" } },
      }),
      GlobalAttrs,
      DivNode,
      SpanNode,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "开始写作..." }),
    ],
    content: "<p></p>",
    editorProps: { attributes: { class: "editor-body" } },
    onUpdate: ({ editor }) => {
      setIsModified(true);
      updateActiveDoc({ isModified: true });
      setWordCount(editor.getText().replace(/\s+/g, "").length);
    },
  });

  // ---- 初始字数 ----
  useEffect(() => {
    if (editor) setWordCount(editor.getText().replace(/\s+/g, "").length);
  }, [editor]);

  // ---- 把当前编辑状态写回活动文档 ----
  const snapshotActive = useCallback((): DocState[] => {
    const cur = docs.find((d) => d.id === activeId);
    if (!cur || !editor) return docs;
    return docs.map((d) => {
      if (d.id !== activeId) return d;
      if (d.kind === "html") {
        return { ...d, body: editor.getHTML(), sourceText, mode, shell, rawFullDoc, filePath, isModified };
      }
      return { ...d, filePath, isModified };
    });
  }, [docs, activeId, editor, sourceText, mode, shell, rawFullDoc, filePath, isModified]);

  // ---- 应用某个文档到界面 ----
  const applyDoc = useCallback(
    (doc: DocState) => {
      setBlockPanelPos(null);
      setFilePath(doc.filePath);
      setIsModified(doc.isModified);
      if (doc.kind === "html") {
        editor?.commands.setContent(doc.body || "<p></p>");
        setMode(doc.mode);
        setSourceText(doc.sourceText);
        setShell(doc.shell);
        setRawFullDoc(doc.rawFullDoc);
        setWordCount(editor ? editor.getText().replace(/\s+/g, "").length : 0);
      } else {
        setMode("edit");
        setSourceText("");
        setShell(null);
        setRawFullDoc(null);
      }
    },
    [editor]
  );

  // ---- 切换标签 ----
  const switchDoc = useCallback(
    (id: number) => {
      if (id === activeId || !editor) return;
      const updated = snapshotActive();
      setDocs(updated);
      const target = updated.find((d) => d.id === id);
      if (!target) return;
      setActiveId(id);
      applyDoc(target);
    },
    [activeId, editor, snapshotActive, applyDoc]
  );

  // ---- 关闭标签 ----
  const closeDoc = useCallback(
    (id: number) => {
      if (!editor) return;
      if (docs.length <= 1) {
        // 最后一个标签：重置为空白文档
        const doc = emptyDoc(id);
        setDocs([doc]);
        setActiveId(id);
        applyDoc(doc);
        return;
      }
      const remaining = docs.filter((d) => d.id !== id);
      if (id === activeId) {
        const next = remaining[Math.max(0, docs.findIndex((d) => d.id === id) - 1)] ?? remaining[0];
        setDocs(remaining);
        setActiveId(next.id);
        applyDoc(next);
      } else {
        setDocs(remaining);
      }
    },
    [docs, activeId, editor, applyDoc]
  );

  // ---- 新建标签 ----
  const newDoc = useCallback(() => {
    if (!editor) return;
    const updated = snapshotActive();
    const id = idRef.current++;
    const doc = emptyDoc(id);
    setDocs([...updated, doc]);
    setActiveId(id);
    editor.commands.setContent("<p></p>");
    setMode("edit");
    setSourceText("");
    setShell(null);
    setRawFullDoc(null);
    setFilePath(null);
    setIsModified(false);
    setWordCount(0);
  }, [editor, snapshotActive]);

  // ---- 解析原始 HTML：内联外部资源，提取外壳与完整文档 ----
  const parseShell = useCallback(
    async (
      raw: string,
      path: string
    ): Promise<{ shell: DocShell; bodyHtml: string; fullDoc: string; resources: ResourceRef[] }> => {
      const doc = new DOMParser().parseFromString(raw, "text/html");
      const baseDir = path.replace(/\\/g, "/").replace(/\/[^/]*$/, "/");
      const baseUrl = "file:///" + baseDir;
      const isRelative = (p: string) => p && !/^(https?:|data:|file:|#|\/)/i.test(p.trim());
      const resolveRel = (rel: string): string | null => {
        try {
          const u = new URL(rel, baseUrl);
          if (u.protocol !== "file:") return null;
          let p = decodeURIComponent(u.pathname);
          if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
          return p;
        } catch {
          return null;
        }
      };
      const toBase64 = (data: Uint8Array | ArrayBuffer): string => {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
      };

      const resources: ResourceRef[] = [];

      // 收集并内联外部 CSS
      const links = Array.from(doc.head?.querySelectorAll('link[rel="stylesheet"][href]') ?? []);
      await Promise.all(links.map(async (link) => {
        const href = link.getAttribute("href") ?? "";
        if (!isRelative(href)) return;
        const abs = resolveRel(href);
        if (!abs) return;
        resources.push({ path: abs, name: href.split("/").pop() ?? abs, kind: "css" });
        try {
          const css = await readTextFile(abs);
          const style = doc.createElement("style");
          style.textContent = css;
          link.replaceWith(style);
        } catch { /* 读取失败保留原标签 */ }
      }));

      // 收集并内联外部 JS
      const scripts = Array.from(doc.querySelectorAll("script[src]"));
      await Promise.all(scripts.map(async (s) => {
        const src = s.getAttribute("src") ?? "";
        if (!isRelative(src)) return;
        const abs = resolveRel(src);
        if (!abs) return;
        resources.push({ path: abs, name: src.split("/").pop() ?? abs, kind: "js" });
        try {
          const js = await readTextFile(abs);
          s.removeAttribute("src");
          s.textContent = js;
        } catch { /* 读取失败保留原标签 */ }
      }));

      // 内联相对路径图片
      const imgs = Array.from(doc.body.querySelectorAll("img[src]"));
      await Promise.all(imgs.map(async (img) => {
        const src = img.getAttribute("src") ?? "";
        if (!isRelative(src)) return;
        const abs = resolveRel(src);
        if (!abs) {
          console.warn("图片路径解析失败:", src);
          return;
        }
        try {
          const data = await readFile(abs);
          const ext = (src.split(".").pop() ?? "").toLowerCase();
          const mime =
            ext === "jpg" || ext === "jpeg" ? "image/jpeg"
            : ext === "svg" ? "image/svg+xml"
            : ext === "webp" ? "image/webp"
            : ext === "gif" ? "image/gif"
            : ext === "bmp" ? "image/bmp"
            : "image/png";
          img.setAttribute("src", `data:${mime};base64,${toBase64(data)}`);
        } catch (err) {
          console.warn("图片内联失败(将保持相对路径,可能无法显示):", src, String(err));
        }
      }));

      const doctype = raw.match(/<!DOCTYPE[^>]*>/i)?.[0] ?? "<!DOCTYPE html>";
      const head = doc.head?.innerHTML ?? "";
      const headCss = Array.from(doc.head?.querySelectorAll("style") ?? [])
        .map((s) => s.textContent ?? "")
        .join("\n");
      const bodyAttrs = Array.from(doc.body.attributes)
        .map((a) => ` ${a.name}="${a.value}"`)
        .join("");
      const collect = (tag: string) =>
        Array.from(doc.body.querySelectorAll(tag))
          .map((el) => el.outerHTML)
          .join("\n");
      const bodyScripts = collect("script");
      const bodyStyles = collect("style");
      doc.body.querySelectorAll("script, style").forEach((el) => el.remove());
      const fullDoc = `${doctype}
<html>
<head>${head}</head>
<body${bodyAttrs}>
${doc.body.innerHTML}
${bodyScripts}
${bodyStyles}
</body>
</html>`;
      return {
        shell: { doctype, head, headCss, bodyAttrs, scripts: bodyScripts, styles: bodyStyles, baseHref: baseUrl },
        bodyHtml: doc.body.innerHTML || raw,
        fullDoc,
        resources,
      };
    },
    []
  );

  // ---- 用内容 + 外壳重建完整 HTML ----
  const buildFullDoc = useCallback(
    (bodyHtml: string, sh: DocShell | null): string => {
      if (sh) {
        const base = sh.baseHref ? `<base href="${encodeURI(sh.baseHref)}">` : "";
        return `${sh.doctype}
<html>
<head>${base}${sh.head}</head>
<body${sh.bodyAttrs}>
${bodyHtml}
${sh.scripts}
${sh.styles}
</body>
</html>`;
      }
      const title = (filePath?.split("\\").pop() ?? "文档").replace(/\.html?$/, "");
      return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>body{font-family:'Segoe UI','Microsoft YaHei',sans-serif;line-height:1.7;max-width:794px;margin:0 auto;padding:32px;color:#222}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 10px}blockquote{border-left:3px solid #ccc;margin:0.5em 0;padding-left:1em;color:#666}pre{background:#f0f0f0;padding:1em;border-radius:6px;overflow-x:auto}code{background:#f0f0f0;padding:0.2em 0.4em;border-radius:3px}img{max-width:100%;height:auto}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
    },
    [filePath]
  );

  // ---- 按路径读文件并构造 DocState(openFile/openResource/openRecent 共用) ----
  const loadDocFromPath = useCallback(
    async (path: string): Promise<DocState> => {
      const raw = await readTextFile(path);
      const ext = (path.split(".").pop() ?? "").toLowerCase();
      const isHtml = ext === "html" || ext === "htm";
      const id = idRef.current++;
      if (isHtml) {
        const parsed = await parseShell(raw, path);
        return {
          id, kind: "html", filePath: path, isModified: false,
          body: parsed.bodyHtml, sourceText: "", mode: "edit",
          shell: parsed.shell, rawFullDoc: parsed.fullDoc,
          resources: parsed.resources,
        };
      }
      return {
        id, kind: "text", filePath: path, isModified: false,
        body: raw, sourceText: "", mode: "edit",
        shell: null, rawFullDoc: null, resources: [],
      };
    },
    [parseShell]
  );

  // ---- 打开文件（新标签） ----
  const openFile = useCallback(async () => {
    if (!editor) return;
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: "HTML 文件", extensions: ["html", "htm"] },
          { name: "样式/脚本/文本", extensions: ["css", "js", "txt", "md", "json"] },
          { name: "所有文件", extensions: ["*"] },
        ],
      });
      if (!selected) return;
      const path = selected as string;
      const updated = snapshotActive();
      const doc = await loadDocFromPath(path);
      setDocs([...updated, doc]);
      setActiveId(doc.id);
      applyDoc(doc);
      pushRecent(path).then(setRecentPaths).catch((e) => console.warn("pushRecent 失败:", e));
    } catch (e) {
      console.error("打开文件失败:", e);
      window.alert("打开文件失败：" + String(e));
    }
  }, [editor, snapshotActive, loadDocFromPath, applyDoc]);

  // ---- 打开外联资源（侧边栏点击，新标签） ----
  const openResource = useCallback(
    async (res: ResourceRef) => {
      if (!editor) return;
      try {
        const updated = snapshotActive();
        const doc = await loadDocFromPath(res.path);
        setDocs([...updated, doc]);
        setActiveId(doc.id);
        applyDoc(doc);
        pushRecent(res.path)
          .then(setRecentPaths)
          .catch((e) => console.warn("pushRecent 失败:", e));
      } catch (e) {
        console.error("打开资源失败:", e);
        window.alert("打开资源失败：" + String(e));
      }
    },
    [editor, snapshotActive, loadDocFromPath, applyDoc]
  );

  // ---- 打开最近文件（菜单子项）,文件丢失时询问是否从列表移除 ----
  const openRecent = useCallback(
    async (path: string) => {
      if (!editor) return;
      try {
        const updated = snapshotActive();
        const doc = await loadDocFromPath(path);
        setDocs([...updated, doc]);
        setActiveId(doc.id);
        applyDoc(doc);
        const next = await pushRecent(path);
        setRecentPaths(next);
      } catch (e) {
        console.error("打开最近文件失败:", e);
        const remove = window.confirm(`无法打开 ${path}\n\n是否从最近列表中移除?`);
        if (remove) {
          try {
            const next = await clearRecent();
            setRecentPaths(next);
          } catch (err) {
            console.warn("clearRecent 失败:", err);
          }
        }
      }
    },
    [editor, snapshotActive, loadDocFromPath, applyDoc]
  );

  // ---- 清除最近文件列表 ----
  const handleClearRecent = useCallback(async () => {
    try {
      const next = await clearRecent();
      setRecentPaths(next);
    } catch (e) {
      console.warn("clearRecent 失败:", e);
    }
  }, []);

  // ---- 记录用户用色(text/highlight)到最近颜色 store ----
  const onColorUsed = useCallback(
    async (kind: ColorKind, color: string) => {
      try {
        const next = await pushRecentColor(kind, color);
        setRecentColors(next);
      } catch (e) {
        console.warn("pushRecentColor 失败:", e);
      }
    },
    []
  );

  // ---- 从源码（完整文档）解析：同步编辑器内容与外壳 ----
  const syncFromSource = useCallback(
    (fullHtml: string, markModified: boolean) => {
      if (!editor) return;
      const doc = new DOMParser().parseFromString(fullHtml, "text/html");
      const doctype = fullHtml.match(/<!DOCTYPE[^>]*>/i)?.[0] ?? "<!DOCTYPE html>";
      const head = doc.head?.innerHTML ?? "";
      const headCss = Array.from(doc.head?.querySelectorAll("style") ?? [])
        .map((s) => s.textContent ?? "")
        .join("\n");
      const bodyAttrs = Array.from(doc.body.attributes)
        .map((a) => ` ${a.name}="${a.value}"`)
        .join("");
      const collect = (tag: string) =>
        Array.from(doc.body.querySelectorAll(tag))
          .map((el) => el.outerHTML)
          .join("\n");
      const bodyScripts = collect("script");
      const bodyStyles = collect("style");
      doc.body.querySelectorAll("script, style").forEach((el) => el.remove());
      const newShell: DocShell = {
        doctype, head, headCss, bodyAttrs,
        scripts: bodyScripts, styles: bodyStyles,
        baseHref: shell?.baseHref ?? "",
      };
      editor.commands.setContent(doc.body.innerHTML || "<p></p>");
      setShell(newShell);
      setRawFullDoc(fullHtml);
      // setContent 触发的 onUpdate 会把 isModified 置 true，这里按场景覆盖回正确状态
      setIsModified(markModified);
      updateActiveDoc({ isModified: markModified });
    },
    [editor, shell, updateActiveDoc]
  );

  // ---- 保存 ----
  const doSave = useCallback(
    async (path: string) => {
      const doc = docs.find((d) => d.id === activeId);
      if (!doc || !editor) return;
      let content: string;
      if (doc.kind === "text") {
        content = doc.body;
      } else if (mode === "source") {
        content = sourceText; // 源码编辑的是完整文档
      } else {
        content = buildFullDoc(editor.getHTML(), shell);
      }
      await writeTextFile(path, content);
      setFilePath(path);
      setIsModified(false);
      updateActiveDoc({ filePath: path, isModified: false });
      // 保存到新路径时记入最近列表(同路径不重 push)
      if (path !== filePath) {
        pushRecent(path)
          .then(setRecentPaths)
          .catch((e) => console.warn("pushRecent 失败:", e));
      }
      // 源码模式保存后：解析源码同步编辑器内容与外壳（失败不影响已完成的保存）
      if (doc.kind === "html" && mode === "source") {
        try {
          syncFromSource(sourceText, false);
        } catch (e) {
          console.error("源码同步失败:", e);
        }
      }
    },
    [docs, activeId, editor, mode, sourceText, buildFullDoc, shell, updateActiveDoc, syncFromSource]
  );

  const saveFile = useCallback(async () => {
    if (!editor) return;
    try {
      if (filePath) {
        await doSave(filePath);
      } else {
        const selected = await save({
          filters: [{ name: "HTML 文件", extensions: ["html"] }],
        });
        if (!selected) return;
        const path = selected.endsWith(".html") ? selected : selected + ".html";
        await doSave(path);
      }
    } catch (e) {
      console.error("保存失败:", e);
      window.alert(
        `保存失败：${String(e)}\n\n目标文件：${filePath ?? "(未选择)"}\n\n提示：若文件正被其他程序（如浏览器）打开占用，请先关闭后重试。`
      );
    }
  }, [editor, filePath, doSave]);

  const saveAsFile = useCallback(async () => {
    if (!editor) return;
    try {
      const selected = await save({
        filters: [{ name: "HTML 文件", extensions: ["html"] }],
      });
      if (!selected) return;
      const path = selected.endsWith(".html") ? selected : selected + ".html";
      await doSave(path);
    } catch (e) {
      console.error("另存为失败:", e);
      window.alert("另存为失败：" + String(e));
    }
  }, [editor, doSave]);

  const exportPage = useCallback(async () => {
    if (!editor) return;
    try {
      const selected = await save({
        filters: [{ name: "HTML 文件", extensions: ["html"] }],
        defaultPath: "untitled.html",
      });
      if (!selected) return;
      const path = selected.endsWith(".html") ? selected : selected + ".html";
      await writeTextFile(path, buildFullDoc(editor.getHTML(), shell));
    } catch (e) {
      console.error("导出失败:", e);
      window.alert("导出失败：" + String(e));
    }
  }, [editor, buildFullDoc, shell]);

  // ---- 图片插入 ----
  const insertImage = useCallback(async () => {
    if (!editor) return;
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] },
        ],
      });
      if (!selected) return;
      const path = selected as string;
      const data = await readFile(path);
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const ext = (path.split(".").pop() ?? "png").toLowerCase();
      const mime =
        ext === "jpg" || ext === "jpeg" ? "image/jpeg"
        : ext === "svg" ? "image/svg+xml"
        : ext === "webp" ? "image/webp"
        : ext === "gif" ? "image/gif"
        : ext === "bmp" ? "image/bmp"
        : "image/png";
      const base64 = btoa(binary);
      editor.chain().focus().setImage({ src: `data:${mime};base64,${base64}` }).run();
    } catch (e) {
      console.error("插入图片失败:", e);
      window.alert("插入图片失败：" + String(e));
    }
  }, [editor]);

  // ---- 表格 ----
  const insertTable = useCallback(
    (rows: number, cols: number) => {
      editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    },
    [editor]
  );

  const deleteTable = useCallback(() => {
    editor?.chain().focus().deleteTable().run();
  }, [editor]);

  // ---- 链接 ----
  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href;
    const url = window.prompt("输入链接 URL", prev || "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  // ---- 模式切换（编辑 / 源码 / 预览） ----
  const changeMode = useCallback(
    (next: EditMode) => {
      if (!editor) return;
      if (activeDoc.kind === "text") return; // 文本标签只有文本编辑
      if (next === mode) return;
      if (mode === "source") {
        try {
          syncFromSource(sourceText, true);
        } catch (e) {
          console.error("源码解析失败:", e);
          window.alert("源码解析失败，请检查 HTML 语法");
          return;
        }
      }
      if (next === "source") {
        // 源码视图显示完整页面（head 部分、CSS、JS 全部可见可编辑）
        setSourceText(formatHtml(buildFullDoc(editor.getHTML(), shell)));
      }
      setMode(next);
    },
    [editor, activeDoc, mode, sourceText, syncFromSource, buildFullDoc, shell]
  );

  // ---- 右键：弹出 EditorContextMenu(块源码 / 设为默认样式) ----
  const handleEditorContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!editor || activeDoc.kind !== "html" || mode !== "edit") return;
      const coords = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (coords == null) return;
      const $pos = editor.state.doc.resolve(coords.pos);
      let depth = $pos.depth;
      while (depth > 0 && !$pos.node(depth).isBlock) depth--;
      if (depth === 0) return;
      e.preventDefault();
      const node = $pos.node(depth);
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        blockType: node.type.name,
        blockAttrs: node.attrs as Record<string, unknown>,
        blockPos: $pos.before(depth),
      });
    },
    [editor, activeDoc, mode]
  );

  // ---- 段间距:对每个选中块直接写 inline style(Tiptap 命令链对 inline style 不友好)----
  const handleSpacingChange = useCallback(
    (s: { lineHeight?: number; marginTop?: number; marginBottom?: number }) => {
      if (!editor) return;
      const { state } = editor;
      const { from, to } = state.selection;
      let touched = false;
      state.doc.nodesBetween(from, to, (_node, pos) => {
        const dom = editor.view.nodeDOM(pos);
        if (!(dom instanceof HTMLElement)) return;
        // 跳过 inline / text 节点;只对块级元素改 inline style
        const display = window.getComputedStyle(dom).display;
        if (display.startsWith("inline")) return;
        let style = dom.getAttribute("style") ?? "";
        if (s.lineHeight !== undefined) {
          style = applyLineHeight(style, s.lineHeight);
          touched = true;
        }
        if (s.marginTop !== undefined) {
          style = applyParagraphSpacing(style, "top", s.marginTop);
          touched = true;
        }
        if (s.marginBottom !== undefined) {
          style = applyParagraphSpacing(style, "bottom", s.marginBottom);
          touched = true;
        }
        dom.setAttribute("style", style);
      });
      if (touched) {
        // 触发编辑器 onChange(空事务即可拿到 body 新 html)
        editor.view.dispatch(editor.state.tr);
        setIsModified(true);
        updateActiveDoc({ isModified: true });
      }
    },
    [editor, updateActiveDoc]
  );

  // ---- 读取当前块的「显式改过」的 8 项属性(白名单)----
  const readBlockExplicitProps = useCallback((): Record<string, string> => {
    if (!editor) return {};
    try {
      const { from } = editor.state.selection;
      const dom = editor.view.domAtPos(from).node;
      const el = dom instanceof Element ? dom : (dom.parentElement ?? null);
      if (!(el instanceof HTMLElement)) return {};
      // inline 节点(光标在 span 内)跳过;只对块级元素读 inline style
      const display = window.getComputedStyle(el).display;
      if (display.startsWith("inline")) return {};
      const props: Record<string, string> = {};

      // textStyle mark 属性
      const ts = editor.getAttributes("textStyle");
      if (ts.fontFamily) props["font-family"] = String(ts.fontFamily);
      if (ts.fontSize) props["font-size"] = String(ts.fontSize);
      if (ts.color) props.color = String(ts.color);

      // highlight mark → background-color
      const hl = editor.getAttributes("highlight");
      if (hl.color) props["background-color"] = String(hl.color);

      // 块 inline style:取 text-align / line-height / margin-top / margin-bottom
      const styleStr = el.getAttribute("style") ?? "";
      const get = (name: string) => {
        const m = styleStr.match(
          new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i"),
        );
        return m ? m[1]!.trim() : null;
      };
      const ta = get("text-align");
      if (ta && ta !== "start" && ta !== "") props["text-align"] = ta;
      const lh = get("line-height");
      if (lh && lh !== "normal" && lh !== "") props["line-height"] = lh;
      const mt = get("margin-top");
      if (mt) props["margin-top"] = mt;
      const mb = get("margin-bottom");
      if (mb) props["margin-bottom"] = mb;

      return props;
    } catch {
      return {};
    }
  }, [editor]);

  // ---- 「设为默认样式」:把当前块显式属性 upsert 进 head 内嵌命名块 ----
  const handleSetAsDefault = useCallback(() => {
    if (!editor || !shell) return;
    const { state } = editor;
    const { from } = state.selection;
    const $pos = state.doc.resolve(from);
    let depth = $pos.depth;
    while (depth > 0 && !$pos.node(depth).isBlock) depth--;
    if (depth === 0) return;
    const node = $pos.node(depth);
    const selector = blockTypeToSelector(
      node.type.name,
      node.attrs as Record<string, unknown>,
    );
    if (!selector) return;
    const props = readBlockExplicitProps();
    if (Object.keys(props).length === 0) return;
    const { head, headCss } = upsertShellHead(shell.head, selector, props);
    updateActiveDoc({ shell: { ...shell, head, headCss } });
    setShell({ ...shell, head, headCss });
  }, [editor, shell, readBlockExplicitProps, updateActiveDoc]);

  // ---- 快捷键 ----
  const refs = useRef({
    save: async () => {},
    saveAs: async () => {},
    open: async () => {},
    new: () => {},
    close: () => {},
    togglePreview: () => {},
  });
  refs.current.save = saveFile;
  refs.current.saveAs = saveAsFile;
  refs.current.open = openFile;
  refs.current.new = newDoc;
  refs.current.close = () => closeDoc(activeId);
  refs.current.togglePreview = () => {
    if (activeDoc.kind === "html") changeMode(mode === "preview" ? "edit" : "preview");
  };

  // 刷新预览：把当前编辑器内容注入原始 HTML 的 body 替换，重载 iframe
  const refreshPreview = useCallback(() => {
    if (!editor || activeDoc.kind === "text") return;
    setRawFullDoc((prev) => (prev ? injectBody(prev, editor.getHTML()) : prev));
    setMode("preview");
    setPreviewKey((k) => k + 1);
  }, [editor, activeDoc]);

  // 预览中直接编辑：接收 iframe postMessage，同步回编辑器
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const data = e.data as { type?: string; html?: string } | null;
      if (!data || data.type !== "tiptap-preview-edit" || typeof data.html !== "string") return;
      if (mode !== "preview" || !editor) return;
      editor.commands.setContent(data.html);
      setIsModified(true);
      updateActiveDoc({ isModified: true });
      // 同步到预览文档，切走再切回预览时内容一致
      setRawFullDoc((prev) => (prev ? injectBody(prev, data.html!) : prev));
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [mode, editor, updateActiveDoc]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) refs.current.saveAs();
        else refs.current.save();
      }
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        refs.current.open();
      }
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        refs.current.new();
      }
      if (mod && e.key.toLowerCase() === "w") {
        e.preventDefault();
        refs.current.close();
      }
      if (e.key === "F5") {
        e.preventDefault();
        refreshPreview();
      }
      if (e.key === "F9") {
        e.preventDefault();
        refs.current.togglePreview();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [refreshPreview]);

  if (!editor) return null;

  const viewClass = viewMode === "page" ? "editor-page" : "editor-wide";
  const previewDoc =
    (rawFullDoc ?? buildFullDoc(editor.getHTML(), shell)).replace(
      /<\/body>/i,
      PREVIEW_EDIT_SCRIPT + "</body>"
    );
  const isTextDoc = activeDoc.kind === "text";
  const shownWordCount = isTextDoc ? activeDoc.body.length : wordCount;

  return (
    <div className="editor-container">
      {/* 标题栏 */}
      <div className="title-bar">
        <span className="title-bar-text">
          {filePath
            ? (isTextDoc ? (filePath.split("\\").pop() ?? "未命名") : (filePath.split("\\").pop() ?? "未命名").replace(/\.html?$/, ""))
            : "未命名"}
          {isModified ? " *" : ""}
        </span>
        <span className="title-bar-app">- WeavePage</span>
      </div>

      {/* 菜单栏 + 选项卡（单行） */}
      <MenuBar
        isModified={isModified}
        onNew={newDoc}
        onOpen={openFile}
        onSave={saveFile}
        onSaveAs={saveAsFile}
        onExportPage={exportPage}
        onClose={() => closeDoc(activeId)}
        recent={recentPaths}
        onOpenRecent={openRecent}
        onClearRecent={handleClearRecent}
        mode={mode}
        onModeChange={changeMode}
        viewMode={viewMode}
        onViewMode={setViewMode}
        theme={theme}
        onThemeChange={setTheme}
        ribbonCollapsed={ribbonCollapsed}
        onToggleRibbon={() => setRibbonCollapsed((v) => !v)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onAbout={() => setShowAbout(true)}
      />

      {/* 文档标签栏 */}
      <TabBar docs={docs} activeId={activeId} onSwitch={switchDoc} onClose={closeDoc} />

      {/* 功能区按钮行 */}
      <Ribbon
        editor={editor}
        disabled={mode !== "edit" || isTextDoc}
        activeTab={activeTab}
        collapsed={ribbonCollapsed}
        previewActive={mode === "preview"}
        onPreview={() => changeMode(mode === "preview" ? "edit" : "preview")}
        onInsertImage={insertImage}
        onInsertTable={insertTable}
        onDeleteTable={deleteTable}
        onLink={setLink}
        recentTextColors={recentColors.text}
        recentHighlightColors={recentColors.highlight}
        onColorUsed={onColorUsed}
        onSpacingChange={handleSpacingChange}
      />

      {/* 主区域：侧边栏 + 内容 */}
      <div className="main-area">
        {!isTextDoc && showSidebar && activeDoc.resources.length > 0 && (
          <Sidebar
            resources={activeDoc.resources}
            onOpenResource={openResource}
            onClose={() => setShowSidebar(false)}
          />
        )}
        <div className="content-area">
          {isTextDoc ? (
            <textarea
              className="source-view"
              value={activeDoc.body}
              onChange={(e) => updateActiveDoc({ body: e.target.value, isModified: true })}
              spellCheck={false}
              wrap="soft"
            />
          ) : mode === "preview" ? (
            <>
              <div className="preview-bar">
                <span className="preview-bar-title">网页预览 · 可直接编辑</span>
                <button onClick={refreshPreview} title="将编辑器内容同步到预览 (F5)">
                  刷新
                </button>
                <button onClick={() => changeMode("edit")} title="返回编辑模式">
                  关闭
                </button>
              </div>
              <iframe
                key={previewKey}
                className="preview-frame"
                srcDoc={previewDoc}
                title="网页预览"
                sandbox="allow-scripts"
              />
            </>
          ) : mode === "source" ? (
            <textarea
              className="source-view"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              spellCheck={false}
              wrap="soft"
            />
          ) : (
            <div className={`editor-scroll ${viewClass}`} onContextMenu={handleEditorContextMenu}>
              {/* 文档 CSS 注入编辑区：所见即所得（作用域限定到编辑区，不污染应用界面） */}
              {activeDoc.kind === "html" && shell?.headCss && (
                <style>{scopedCss(shell.headCss)}</style>
              )}
              <EditorContent editor={editor} />
            </div>
          )}
        </div>

        {/* 块源代码面板（右键块打开，右侧边栏） */}
        {blockPanelPos != null && !isTextDoc && mode === "edit" && (
          <BlockSourcePanel
            editor={editor}
            initialPos={blockPanelPos}
            onClose={() => setBlockPanelPos(null)}
          />
        )}

        {/* 右键菜单（块源码 / 设为默认样式） */}
        {contextMenu && !isTextDoc && mode === "edit" && (
          <EditorContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            blockType={contextMenu.blockType}
            blockAttrs={contextMenu.blockAttrs}
            onBlockSource={() => {
              setBlockPanelPos(contextMenu.blockPos);
              setContextMenu(null);
            }}
            onSetAsDefault={() => {
              handleSetAsDefault();
              setContextMenu(null);
            }}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>

      {/* 状态栏 */}
      <StatusBar
        editor={editor}
        wordCount={shownWordCount}
        viewMode={viewMode}
        onViewMode={setViewMode}
        theme={theme}
        onThemeChange={setTheme}
        mode={mode}
      />

      {/* 关于弹窗 */}
      {showAbout && <AboutDialog currentVersion={appVersion || "0.0.0"} onClose={() => setShowAbout(false)} />}
    </div>
  );
}

export default App;
