import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useEditor } from "@tiptap/react";
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
import { GlobalAttrs, DivNode, SpanNode, DocToc } from "./extensions/HtmlCompat";
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
// Goal 1 — 可视块选择浮层(hover 虚线 + selected 实线 + breadcrumb)
import { SelectionOverlay } from "./components/SelectionOverlay";
// Goal 3 — 关闭未保存弹窗(多 tab dirty 列表)
import { UnsavedCloseDialog } from "./components/UnsavedCloseDialog";
// v0.1.13 第三十轮:TOC 改为在 iframe 内部渲染(由 shell.head 的 TOC_CSS + doc-toc atom 的 TOC_SCRIPT 驱动)
// 编辑器视图 / 预览视图 / 浏览器打开 三者完全 WYSIWYG 一致
// 旧 React Portal TocFloating.tsx 已不再使用
// toggle 通过 Ribbon「插入/删除目录」按钮
import {
  hasDocTocInHtml,
  toggleDocTocInHtml,
  scanHeadingsFromHtml,
  assignHeadingIdsInHtml,
  buildTocStyleTag,
  removeTocStyleTag,
} from "./utils/tocGen";
import { formatHtml, escAttr } from "./utils/formatHtml";
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
// Goal 1+2:块容器样式 helper — locateBlock / parseContainerStyle 用于反读 inline style
import {
  locateBlock,
  parseContainerStyle,
  applyContainerStyle,
  extractContainerStyle,
  upsertBlockStyleRule,
  type ContainerProp,
  type BlockIdentity,
  type ContainerForm,
} from "./utils/blockStyle";
import {
  upsertShellHead,
  blockTypeToSelector,
} from "./utils/defaultStyle";
import { applyBodyBackground } from "./utils/headShell";
// v2.1.0:文档设计 — 8 套预设样式 + 默认(纯内存,不持久化)
import {
  getDesignById,
  applyDesignToShellHead,
  parseDesignId,
} from "./utils/designs";
// v0.1.13 第十五轮:TOC_STYLES / TOC_FLOATING_SCRIPT 已不再使用 — inline docToc atom 自包含 <style> + <script>
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

// 文档 CSS 作用域限定到编辑区：html→.editor-scroll，body→.editor-scroll .editor-body，避免污染应用界面
// body 选择器带 .editor-scroll 前缀,使其与 App.css 的 .editor-page .editor-body / .editor-wide .editor-body
// 同为 (0,2,0) 优先级,而注入的 <style> 在 DOM 中位于 App.css 之后,平局靠后胜出,可正确覆盖页式视图的「白纸」背景
// 固定定位（fixed）转为绝对定位（absolute），以编辑窗口为定位边界，不超出编辑区
const scopedCss = (css: string): string =>
  css
    .replace(
      /(^|[\s}])(html|body)(?=[\s{])/g,
      (_m, pre, tag) => pre + (tag === "html" ? ".editor-scroll" : ".editor-scroll .editor-body")
    )
    .replace(/position:\s*fixed/gi, "position: absolute");

// v0.2.0:injectBody 已不再使用(preview 视图移除)— 保留供将来 use case
// const injectBody = (raw: string, bodyHtml: string): string =>
//   raw.replace(/(<body[^>]*>)[\s\S]*?(<\/body>)/i, `$1${bodyHtml}$2`);

// v0.2.0:preview 视图已移除 — 编辑器视图 = 浏览器视图(WYSIWYG,完全一致),
// 不再需要 preview 注入脚本 / previewFrame / previewKey。

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
  const [rawFullDoc, setRawFullDoc] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState("");
  // v2.0.1:进入源代码视图时保存一份 buildFullDoc 产物,退出时对比;
  // 如果用户没编辑 sourceText(原样切换),就完全不动 docHtml / shell / isModified,
  // 实现"切换视图不修改任何代码"。否则 formatHtml 即便 escAttr 修好也还会改空白/缩进。
  const [sourceTextSnapshot, setSourceTextSnapshot] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isModified, setIsModified] = useState(false);
  const [shell, setShell] = useState<DocShell | null>(null);
  const [blockPanelElement, setBlockPanelElement] = useState<HTMLElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    blockType: string | null;
    blockAttrs?: Record<string, unknown>;
    blockElement: HTMLElement;
  } | null>(null);
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<RibbonTab>("edit");
  const [wordCount, setWordCount] = useState(0);
  // v0.1.13 第二十七轮:inline doc-toc 状态(从 doc content 推算,doc body 是否含 doc-toc atom)
  const [tocEnabled, setTocEnabled] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [recentColors, setRecentColors] = useState<RecentColorsResult>({ text: [], highlight: [] });
  const [appVersion, setAppVersion] = useState("");
  const [showAbout, setShowAbout] = useState(false);
  const [startupPromptShown, setStartupPromptShown] = useState(false);

  // v0.1.13 第三十轮:iframe-based 编辑器的 source of truth —
  // docHtml 保留浏览器原生 HTML 解析结果(<script>/<style>/<button> 全部 WYSIWYG)。
  // Tiptap state 仅作为 schema 容器供 TocFloating/tocGen 使用,save/preview/export 全部走 docHtml。
  // 必须在 useEditor 之前声明 — snapshotActive/applyDoc 都要读它。
  const [docHtml, setDocHtml] = useState<string>("<p></p>");
  // v2.1.0:文档设计 — 纯内存 state,不持久化到 localStorage / DocState
  // 设计 CSS 注入 shell.head(由 buildFullDoc 自动包含在保存的 HTML)
  const [currentDesignId, setCurrentDesignId] = useState<string | null>(null);
  // Goal 1 — 可视块选择 state(selectedBlock 用于 iframe 重建后重定位,hoveredBlock 仅渲染浮层)
  const [selectedBlock, setSelectedBlock] = useState<BlockIdentity | null>(null);
  const [hoveredBlock, setHoveredBlock] = useState<{ tagName: string; nthOfType: number } | null>(null);
  // Goal 2 — 容器组控件当前值(块选变化时反读 inline style 回填)
  const [containerForm, setContainerForm] = useState<ContainerForm>({});
  // Goal 2 — ⭐ 提升确认弹窗(原文 inline → head CSS tagName 规则)
  const [promoteConfirmOpen, setPromoteConfirmOpen] = useState<{ tagName: string; count: number } | null>(null);
  // Goal 3 — 应用关闭未保存弹窗
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  // iframe ref:让 Ribbon 等组件能直接访问 iframe.contentDocument 执行 execCommand
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
            // 应用内升级优先用 update_url(轻量渠道,无 WebView2 离线包);
            // 兜底 full url,再兜底落地页
            const downloadUrl = remote.update_url || remote.url || APP_DOWNLOAD_URL;
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
      // DocToc:仅作 schema 占位,TocFloating.tsx 是真正的 TOC UI
      DocToc,
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

  // v0.1.13 第三十轮:tocEnabled 由 docHtml 推算(字符串层检测 doc-toc 节点)
  // 不依赖 Tiptap PM(editor 状态在 iframe-based 编辑下不再实时反映 docHtml)
  useEffect(() => {
    setTocEnabled(hasDocTocInHtml(docHtml));
  }, [docHtml]);

  // Goal 1 — iframe.contentDocument 事件: hover / click / dblclick / keydown
  // 处理可视块选择 + 块选变化时反读 inline style 到 containerForm
  // 注意:此 effect 只在 iframe 引用变化时挂载;iframe 重建时(切 activeDoc/改 shell)iframe.contentDocument 全换,
  // 旧监听器会自然失效,新 effect 不需要 deps 中包含 selectedBlock 等。
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    let lastMousedownTime = 0;

    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!(target instanceof HTMLElement)) return;
      const block = findBlockAtClientPoint(iframe, e.clientX, e.clientY);
      if (!block) {
        setHoveredBlock(null);
        return;
      }
      const parent = block.parentElement;
      let nthOfType = 0;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === block.tagName
        );
        nthOfType = siblings.indexOf(block);
      }
      setHoveredBlock({ tagName: block.tagName.toLowerCase(), nthOfType });
    };
    const onMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && doc.contains(related)) return; // 还在 iframe 内,转 hover 新块
      setHoveredBlock(null);
    };

    const onMouseDown = () => {
      lastMousedownTime = Date.now();
    };

    // click vs dblclick (200ms 窗口)
    const onClick = (e: MouseEvent) => {
      const elapsed = Date.now() - lastMousedownTime;
      if (elapsed > 200) return; // 不是单击(可能是双击第二下或文本拖选)
      const target = e.target as Element | null;
      if (!(target instanceof HTMLElement)) return;
      const block = findBlockAtClientPoint(iframe, e.clientX, e.clientY);
      if (!block) return;
      const parent = block.parentElement;
      let nthOfType = 0;
      const textSample = (block.textContent ?? "").slice(0, 30);
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === block.tagName
        );
        nthOfType = siblings.indexOf(block);
      }
      setSelectedBlock({
        tagName: block.tagName.toLowerCase(),
        nthOfType,
        textSample,
      });
      // 反读 inline style → containerForm(块选变化时回填)
      const inlineStyle = block.getAttribute("style") ?? "";
      setContainerForm(parseContainerStyle(inlineStyle));
      // iframe.blur 让 Ribbon 接管 focus
      iframe.contentWindow?.blur();
    };

    // dblclick 不拦,文本编辑正常进行
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedBlock(null);
        setContainerForm({});
        return;
      }
      if (e.key === "ArrowUp" && e.ctrlKey) {
        e.preventDefault();
        setSelectedBlock((prev) => {
          if (!prev) return prev;
          const el = locateBlock(doc, prev);
          if (!el || !el.parentElement) return prev;
          const parent = el.parentElement;
          // 跳出同级同 tag:父元素的 nthOfType 在其同级内
          const grand = parent.parentElement;
          let nthOfType = 0;
          if (grand) {
            const siblings = Array.from(grand.children).filter(
              (c) => c.tagName === parent.tagName
            );
            nthOfType = siblings.indexOf(parent);
          }
          return {
            tagName: parent.tagName.toLowerCase(),
            nthOfType: nthOfType >= 0 ? nthOfType : 0,
            textSample: (parent.textContent ?? "").slice(0, 30),
          };
        });
        return;
      }
      if (e.key === "ArrowDown" && e.ctrlKey) {
        e.preventDefault();
        setSelectedBlock((prev) => {
          if (!prev) return prev;
          const el = locateBlock(doc, prev);
          if (!el) return prev;
          const firstChild = Array.from(el.children).find(
            (c) => c.tagName !== "BR"
          ) as HTMLElement | undefined;
          if (!firstChild || !firstChild.parentElement) return prev;
          const siblings = Array.from(firstChild.parentElement.children).filter(
            (c) => c.tagName === firstChild.tagName
          );
          return {
            tagName: firstChild.tagName.toLowerCase(),
            nthOfType: siblings.indexOf(firstChild),
            textSample: (firstChild.textContent ?? "").slice(0, 30),
          };
        });
        return;
      }
    };

    doc.addEventListener("mouseover", onMouseOver);
    doc.addEventListener("mouseout", onMouseOut);
    doc.addEventListener("mousedown", onMouseDown);
    doc.addEventListener("click", onClick);
    doc.addEventListener("keydown", onKeyDown);
    return () => {
      doc.removeEventListener("mouseover", onMouseOver);
      doc.removeEventListener("mouseout", onMouseOut);
      doc.removeEventListener("mousedown", onMouseDown);
      doc.removeEventListener("click", onClick);
      doc.removeEventListener("keydown", onKeyDown);
    };
  }, [iframeRef]);

  // toggle:插入/删除 doc-toc atom,同时同步 shell.head 中的 TOC CSS
  // 第三十轮:CSS 集中在 <head>(便于 saved file 浏览器查看 + 编辑器 iframe WYSIWYG 一致)
  const onToggleToc = useCallback(() => {
    const { html, enabled } = toggleDocTocInHtml(docHtml);
    setDocHtml(html);
    setTocEnabled(enabled);
    updateActiveDoc({ tocEnabled: enabled });
    // 同步 shell.head — 插入/移除 <style id="wp-toc-style">
    // shell 改变 → useMemo [activeDoc.id, shell] 重算 → iframe.srcDoc 更新 → iframe 重新加载
    // (用户不在 toggle 期间打字,可接受;TOC toggle 是低频操作)
    const baseShell: DocShell = shell ?? {
      doctype: "<!DOCTYPE html>",
      head: "",
      headCss: "",
      bodyAttrs: "",
      scripts: "",
      styles: "",
      baseHref: "",
    };
    const newHead = enabled
      ? (baseShell.head.includes("wp-toc-style")
          // v2.0.3:已有 wp-toc-style 但可能缺注释 — 强制 refresh 确保样式 tag 带标记
          ? removeTocStyleTag(baseShell.head) + "\n" + buildTocStyleTag()
          : baseShell.head + buildTocStyleTag())
      : removeTocStyleTag(baseShell.head);
    if (newHead !== baseShell.head) {
      const newShell = { ...baseShell, head: newHead };
      setShell(newShell);
      updateActiveDoc({ shell: newShell });
    }
  }, [docHtml, shell, updateActiveDoc]);

  // v2.1.0:applyDesign — 注入/清除设计 CSS 到 shell.head
  // - id 为 null:移除所有 [data-weavepage-design] style
  // - id 非 null:在 <style id="wp-toc-style"> 之后插入新 style
  // shell 变化 → useMemo [activeDoc.id, shell] 重算 → iframe.srcDoc 重渲 → WYSIWYG 立即生效
  const applyDesign = useCallback(
    (id: string | null) => {
      const design = getDesignById(id);
      const css = design?.css ?? null;
      const baseShell: DocShell = shell ?? {
        doctype: "<!DOCTYPE html>",
        head: "",
        headCss: "",
        bodyAttrs: "",
        scripts: "",
        styles: "",
        baseHref: "",
      };
      const newHead = applyDesignToShellHead(baseShell.head, id, css);
      const newShell = { ...baseShell, head: newHead };
      setShell(newShell);
      setCurrentDesignId(id);
      setIsModified(true);
      updateActiveDoc({ shell: newShell });
    },
    [shell, updateActiveDoc]
  );

  // Goal 2 — 容器组控件改 inline style:跟 handleSpacingChange 同模式
  // locateBlock → 应用 applyContainerStyle → el.setAttribute("style", ...)
  // setDocHtml(body.innerHTML) → editorSrcDoc useMemo 重建 iframe
  const setBlockStyle = useCallback(
    (prop: ContainerProp, value: string) => {
      if (!selectedBlock) return;
      const iframe = iframeRef.current;
      if (!iframe?.contentDocument) return;
      const el = locateBlock(iframe.contentDocument, selectedBlock);
      if (!el) return;
      setContainerForm((prev) => ({ ...prev, [prop]: value }));
      const style = applyContainerStyle(
        el.getAttribute("style") ?? "",
        prop,
        value
      );
      el.setAttribute("style", style);
      setIsModified(true);
      updateActiveDoc({ isModified: true });
      setDocHtml(iframe.contentDocument.body.innerHTML);
    },
    [selectedBlock, updateActiveDoc]
  );

  // Goal 2 — ⭐ 提升:把选中块的 inline style 抽成 head CSS tagName 规则,清原 inline
  // N=1 → toast "无需提升";N>1 → 弹确认 modal
  // 关键:清原 inline 后 head CSS 才会生效(inline CSS 优先级 > head tagName 规则)
  const handlePromote = useCallback(() => {
    if (!selectedBlock) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const el = locateBlock(iframe.contentDocument, selectedBlock);
    if (!el) return;
    const tagName = el.tagName.toLowerCase();
    const props = extractContainerStyle(el.getAttribute("style") ?? "");
    if (Object.keys(props).length === 0) {
      window.alert("该块没有可提升的样式");
      return;
    }
    const count = iframe.contentDocument.body.querySelectorAll(tagName).length;
    if (count <= 1) {
      window.alert(`只有一个 ${tagName},无需提升`);
      return;
    }
    setPromoteConfirmOpen({ tagName, count });
  }, [selectedBlock]);

  const confirmPromote = useCallback(() => {
    if (!promoteConfirmOpen || !selectedBlock) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const el = locateBlock(iframe.contentDocument, selectedBlock);
    if (!el) return;
    const tagName = el.tagName.toLowerCase();
    const props = extractContainerStyle(el.getAttribute("style") ?? "");
    if (Object.keys(props).length === 0) {
      setPromoteConfirmOpen(null);
      return;
    }
    const baseShell: DocShell = shell ?? {
      doctype: "<!DOCTYPE html>",
      head: "",
      headCss: "",
      bodyAttrs: "",
      scripts: "",
      styles: "",
      baseHref: "",
    };
    const newHead = upsertBlockStyleRule(baseShell.head, tagName, props);
    const newShell = { ...baseShell, head: newHead };
    setShell(newShell);
    // 关键:清原 inline,否则 head tagName 规则永远输
    el.setAttribute("style", "");
    setIsModified(true);
    updateActiveDoc({ shell: newShell, isModified: true });
    setDocHtml(iframe.contentDocument.body.innerHTML);
    setPromoteConfirmOpen(null);
  }, [promoteConfirmOpen, selectedBlock, shell, updateActiveDoc]);

  // v0.1.13 第二十六轮:TOC 由 TocFloating.tsx(React Portal)渲染,
  // 内部监听 editor.on("update") 自动重算 heading id + 写入 PM state。
  // 这里不再需要 regen scheduling / tocEnabled state / onToggleToc。
  //
  // flushBeforeSwitch 也已废弃 — save/applyDoc 不再依赖 inline doc-toc atom,
  // TocFloating 用 editor.getHTML() 输出 heading id(由 assignHeadingIds 写入)。

  // ---- 把当前编辑状态写回活动文档 ----
  const snapshotActive = useCallback((): DocState[] => {
    const cur = docs.find((d) => d.id === activeId);
    if (!cur || !editor) return docs;
    return docs.map((d) => {
      if (d.id !== activeId) return d;
      if (d.kind === "html") {
        // 包含当前 tocEnabled 状态(从 doc content 推算的 cache)
        const tocOn = d.tocEnabled ?? false;
        // 第三十轮:用 docHtml 而非 editor.getHTML() 持久化 —
        // iframe WYSIWYG 编辑不会触发 editor.onUpdate,docHtml 才是 source of truth
        return { ...d, body: docHtml, sourceText, mode, shell, rawFullDoc, filePath, isModified, tocEnabled: tocOn };
      }
      return { ...d, filePath, isModified };
    });
  }, [docs, activeId, docHtml, sourceText, mode, shell, rawFullDoc, filePath, isModified]);

  // ---- 应用某个文档到界面 ----
  const applyDoc = useCallback(
    (doc: DocState) => {
      setBlockPanelElement(null);
      setFilePath(doc.filePath);
      setIsModified(doc.isModified);
      if (doc.kind === "html") {
        // 第三十轮:用原始 doc.body 同步 docHtml(保留 <script>/<style>/<button> 等 WYSIWYG 元素)
        // 不要用 editor.getHTML() — Tiptap schema 会 strip 未知元素,破坏 WYSIWYG
        setDocHtml(doc.body || "<p></p>");
        // 第三十轮:tocEnabled 由 docHtml 字符串检测(useEffect 自动响应 docHtml 变化)
        // 旧版 HTML(<style> 块 tocHtml)需要 rebuild 为 inline style:
        // 扫描 docHtml h2/h3 → 写 id 到 heading → 重生成 doc-toc atom
        if (hasDocTocInHtml(doc.body || "")) {
          const entries = scanHeadingsFromHtml(doc.body);
          const newHtml = assignHeadingIdsInHtml(doc.body, entries);
          // v2.0.3:重生成 tocHtml 结构,确保注释标记 / 最新 buildTocHtml 输出
          // 应用到旧文件(老版本 WeavePage 保存的 TOC 没有注释)
          const refreshed = toggleDocTocInHtml(newHtml); // off
          const final = toggleDocTocInHtml(refreshed.html); // on
          setDocHtml(final.html);
          // v2.0.3:同样刷新 shell.head 里的 style tag(老版本没注释),
          // 否则源代码视图 <head> 区域不会看到 <!-- WeavePage TOC: 样式 -->
          const baseShell: DocShell = {
            doctype: doc.shell?.doctype ?? "<!DOCTYPE html>",
            head: doc.shell?.head ?? "",
            headCss: doc.shell?.headCss ?? "",
            bodyAttrs: doc.shell?.bodyAttrs ?? "",
            scripts: doc.shell?.scripts ?? "",
            styles: doc.shell?.styles ?? "",
            baseHref: doc.shell?.baseHref ?? "",
          };
          const refreshedHead = removeTocStyleTag(baseShell.head) + "\n" + buildTocStyleTag();
          setShell({ ...baseShell, head: refreshedHead });
        } else {
          setShell(doc.shell ?? null);
        }
        // v2.1.0:解析当前设计 id,用于面板高亮
        setCurrentDesignId(parseDesignId(doc.shell?.head ?? ""));
        // editor 仍 setContent(保留给将来 stage 5 切换,但不影响 docHtml)
        editor?.commands.setContent(doc.body || "<p></p>");
        setMode(doc.mode);
        setSourceText(doc.sourceText);
        setRawFullDoc(doc.rawFullDoc);
        setWordCount(editor ? editor.getText().replace(/\s+/g, "").length : 0);
      } else {
        setMode("edit");
        setSourceText("");
        setShell(null);
        setRawFullDoc(null);
      }
    },
    [editor, updateActiveDoc]
  );

  // ---- 切换标签 ----
  const switchDoc = useCallback(
    (id: number) => {
      if (id === activeId || !editor) return;
      // Goal 1 — 切 activeDoc 时清选中(iframe 重建,selectedBlock 不再有效)
      setSelectedBlock(null);
      setHoveredBlock(null);
      setContainerForm({});
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
    // 第三十轮:同步 docHtml(让 iframe 显示空白)
    setDocHtml("<p></p>");
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
        .map((a) => ` ${a.name}="${escAttr(a.value)}"`)
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
    (bodyHtml: string, sh: DocShell | null, editable: boolean = false): string => {
      if (sh) {
        const base = sh.baseHref ? `<base href="${encodeURI(sh.baseHref)}">` : "";
        // v0.1.13 第三十轮:editable 模式下 body 加 contenteditable=true,iframe 内可直接编辑
        const bodyEditable = editable ? ' contenteditable="true"' : "";
        return `${sh.doctype}
<html>
<head>${base}${sh.head}</head>
<body${sh.bodyAttrs}${bodyEditable}>
${bodyHtml}
${sh.scripts}
${sh.styles}
</body>
</html>`;
      }
      const title = (filePath?.split("\\").pop() ?? "文档").replace(/\.html?$/, "");
      const bodyEditable = editable ? ' contenteditable="true"' : "";
      return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>body{font-family:'Segoe UI','Microsoft YaHei',sans-serif;line-height:1.7;max-width:794px;margin:0 auto;padding:32px;color:#222}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 10px}blockquote{border-left:3px solid #ccc;margin:0.5em 0;padding-left:1em;color:#666}pre{background:#f0f0f0;padding:1em;border-radius:6px;overflow-x:auto}code{background:#f0f0f0;padding:0.2em 0.4em;border-radius:3px}img{max-width:100%;height:auto}</style>
</head>
<body${bodyEditable}>${bodyHtml}</body>
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
        .map((a) => ` ${a.name}="${escAttr(a.value)}"`)
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
      // 第三十轮:用原始 bodyHtml 同步 docHtml(保留 WYSIWYG 元素,不经过 Tiptap schema strip)
      setDocHtml(doc.body.innerHTML || "<p></p>");
      setShell(newShell);
      // P2 — spec §10.5:源码视图修改 <style data-weavepage-design="...">
      // 后,DesignStrip 高亮应跟随新 ID(若 id 改了);若用户删了 style tag,高亮回到"默认"
      setCurrentDesignId(parseDesignId(newShell.head));
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
        // v0.1.13 第三十轮:用 docHtml 而非 editor.getHTML() —
        // editor 状态不会随 iframe 内 WYSIWYG 编辑更新;docHtml 才是 source of truth
        content = buildFullDoc(docHtml, shell);
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

  // Goal 3 — saveDocById:按 id 保存指定 doc(不依赖 activeId)
  // doSave 强依赖 activeId,关闭弹窗里要保存多个 dirty tab,必须独立函数
  const saveDocById = useCallback(
    async (id: number, path: string) => {
      const doc = docs.find((d) => d.id === id);
      if (!doc || !editor) return;
      let content: string;
      if (doc.kind === "text") {
        content = doc.body;
      } else if (doc.mode === "source") {
        content = doc.sourceText;
      } else {
        content = buildFullDoc(doc.body, doc.shell);
      }
      await writeTextFile(path, content);
      // 更新 docs 数组
      setDocs((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, filePath: path, isModified: false } : d
        )
      );
      // 同步当前显示(id === activeId 时)
      if (id === activeId) {
        setFilePath(path);
        setIsModified(false);
      }
      // 保存到新路径时记入最近列表
      if (path !== doc.filePath) {
        pushRecent(path)
          .then(setRecentPaths)
          .catch((e) => console.warn("pushRecent 失败:", e));
      }
    },
    [docs, activeId, editor, buildFullDoc]
  );

  // Goal 3 — handleSaveSelected:串行保存勾选的 dirty tabs
  // 任一失败 → 留 dialog + 错误;全部成功 → 关闭应用
  const handleSaveSelected = useCallback(
    async (selectedIds: number[]): Promise<boolean> => {
      for (const id of selectedIds) {
        const doc = docs.find((d) => d.id === id);
        if (!doc) continue;
        let path = doc.filePath;
        if (!path) {
          // 无 filePath → 弹 save dialog
          try {
            const { save } = await import("@tauri-apps/plugin-dialog");
            const ext = doc.kind === "text" ? "txt" : "html";
            const selected = await save({
              filters: [
                {
                  name: doc.kind === "text" ? "文本文件" : "HTML 文件",
                  extensions: [ext],
                },
              ],
            });
            if (!selected) return false; // 用户取消 → 留在 dialog
            path = selected.endsWith(`.${ext}`) ? selected : selected + `.${ext}`;
          } catch (e) {
            window.alert(`打开保存对话框失败: ${e}`);
            return false;
          }
        }
        try {
          await saveDocById(id, path);
        } catch (e) {
          window.alert(`保存失败: ${e}\n文件: ${path}`);
          return false;
        }
      }
      // 全部成功 → 关闭应用
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().close();
      } catch (e) {
        console.error("关闭应用失败:", e);
      }
      return true;
    },
    [docs, saveDocById]
  );

  // Goal 3 — handleDontSave:所有 tab isModified=false(防重弹) + 关闭
  // 关键:必须先清 isModified 再 close,否则 onCloseRequested 重触发又弹
  const handleDontSave = useCallback(() => {
    setDocs((prev) => prev.map((d) => ({ ...d, isModified: false })));
    setCloseDialogOpen(false);
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().close();
      } catch (e) {
        console.error("关闭应用失败:", e);
      }
    })();
  }, []);

  const handleCancelClose = useCallback(() => {
    setCloseDialogOpen(false);
  }, []);

  // Goal 3 — onCloseRequested:dirty 时弹 dialog,不 dirty 直接放行
  // Tauri 2 的 onCloseRequested handler 必须 event.preventDefault() 才能阻止关闭
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      unlisten = await win.onCloseRequested(async (event) => {
        const dirtyTabs = docs.filter((d) => d.isModified);
        if (dirtyTabs.length === 0) return; // 不 prevent,允许关闭
        event.preventDefault();
        setCloseDialogOpen(true);
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [docs]);

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
      // v0.1.13 第三十轮:用 docHtml 保留 iframe WYSIWYG 内容
      await writeTextFile(path, buildFullDoc(docHtml, shell));
    } catch (e) {
      console.error("导出失败:", e);
      window.alert("导出失败：" + String(e));
    }
  }, [editor, buildFullDoc, shell]);

  // ---- 图片插入(第三十轮:用 iframeExec 插入 base64 img)----
  const insertImage = useCallback(async () => {
    if (!iframeRef.current) return;
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
      // 用 iframeExec 插入 img 标签(浏览器原生,无需 Tiptap schema)
      const win = iframeRef.current.contentWindow;
      const doc = iframeRef.current.contentDocument;
      if (win && doc) {
        win.focus();
        doc.body.focus();
        const imgTag = `<img src="data:${mime};base64,${base64}" style="max-width:100%"><p><br></p>`;
        doc.execCommand("insertHTML", false, imgTag);
      }
    } catch (e) {
      console.error("插入图片失败:", e);
      window.alert("插入图片失败：" + String(e));
    }
  }, []);

  // ---- 链接(第三十轮:用 iframeExec createLink/unlink)----
  const setLink = useCallback(() => {
    if (!iframeRef.current) return;
    const win = iframeRef.current.contentWindow;
    const doc = iframeRef.current.contentDocument;
    if (!win || !doc) return;
    win.focus();
    doc.body.focus();
    // 取当前选区第一个链接(若已选中)
    const sel = doc.getSelection();
    const existingHref = (() => {
      if (!sel || !sel.anchorNode) return "";
      let n: Node | null = sel.anchorNode;
      while (n && n.nodeType === 1) {
        if ((n as Element).tagName === "A") return (n as HTMLAnchorElement).href || "";
        n = n.parentNode;
      }
      return "";
    })();
    const url = window.prompt("输入链接 URL(留空移除)", existingHref || "https://");
    if (url === null) return;
    if (url === "") {
      doc.execCommand("unlink", false);
    } else {
      doc.execCommand("createLink", false, url);
    }
  }, []);

  // ---- 模式切换（编辑 / 源码 / 预览） ----
  const changeMode = useCallback(
    (next: EditMode) => {
      if (!editor) return;
      if (activeDoc.kind === "text") return; // 文本标签只有文本编辑
      if (next === mode) return;
      // 源码 → 编辑:只有 sourceText 真正变化才 syncFromSource,否则跳过一切修改
      //(保证"打开源代码视图看一眼,关掉"完全不修改 docHtml / shell / isModified)
      if (mode === "source") {
        if (sourceText !== sourceTextSnapshot) {
          try {
            syncFromSource(sourceText, true);
          } catch (e) {
            console.error("源码解析失败:", e);
            window.alert("源码解析失败，请检查 HTML 语法");
            return;
          }
        } else {
          // 未编辑:还原 isModified 标记(进入源码视图前可能是 modified,这里不能改 docHtml)
          // 不动 docHtml / shell — 这就是"零修改"路径
        }
      }
      if (next === "source") {
        // Goal 1 — 切到源码视图时清选中(可视化工具不适用源码视图)
        setSelectedBlock(null);
        setHoveredBlock(null);
        setContainerForm({});
        // 源码视图显示完整页面（head 部分、CSS、JS 全部可见可编辑）
        // v2.0.1:formatHtml 只调整空白(块级缩进/换行),不修改任何字符。
        // 配合 sourceTextSnapshot,未编辑切回时直接跳过 syncFromSource,实现
        // "切换视图不修改任何代码"。
        const newSourceText = formatHtml(buildFullDoc(docHtml, shell));
        setSourceText(newSourceText);
        setSourceTextSnapshot(newSourceText);
      }
      setMode(next);
    },
    [editor, activeDoc, mode, sourceText, sourceTextSnapshot, syncFromSource, buildFullDoc, shell]
  );

  // ---- 右键：弹出 EditorContextMenu(块源码 / 设为默认样式) ----
// 第三十轮:iframe-based — 用 iframe.contentDocument.elementFromPoint 找块元素
const findBlockAtClientPoint = (
  iframe: HTMLIFrameElement,
  clientX: number,
  clientY: number
): HTMLElement | null => {
  const doc = iframe.contentDocument;
  if (!doc) return null;
  const rect = iframe.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  let el: Element | null = doc.elementFromPoint(x, y);
  if (!(el instanceof HTMLElement)) return null;
  // 向上找到最近的 block 元素
  let cur: HTMLElement | null = el;
  while (cur && cur !== doc.body) {
    const display = window.getComputedStyle(cur).display;
    if (!display.startsWith("inline")) return cur;
    cur = cur.parentElement;
  }
  return el;
};
const handleEditorContextMenu = useCallback(
  (e: React.MouseEvent) => {
    if (activeDoc.kind !== "html" || mode !== "edit") return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    // 判断事件是不是来自 iframe
    const tgt = e.target as Element | null;
    if (tgt && tgt.tagName !== "IFRAME") {
      // 事件来自 .editor-scroll 自身(罕见)
      return;
    }
    const blockEl = findBlockAtClientPoint(iframe, e.clientX, e.clientY);
    if (!blockEl) return;
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      blockType: blockEl.tagName.toLowerCase(),
      blockAttrs: {} as Record<string, unknown>,
      blockElement: blockEl,
    });
  },
  [activeDoc, mode]
);

  // ---- 页面背景色:写到 shell.head + shell.headCss(body 规则,被 scopedCss 改名为 .editor-scroll .editor-body)----
  // 空文档(shell=null):用最小 DocShell 兜底,使背景能立刻生效,保存时也能带上 body bg
  const handlePageBg = useCallback(
    (hex: string) => {
      const baseShell: DocShell = shell ?? {
        doctype: "<!DOCTYPE html>",
        head: "",
        headCss: "",
        bodyAttrs: "",
        scripts: "",
        styles: "",
        baseHref: "",
      };
      const next = applyBodyBackground(baseShell.head, baseShell.headCss, hex);
      const newShell = { ...baseShell, head: next.head, headCss: next.headCss };
      setShell(newShell);
      updateActiveDoc({ shell: newShell });
      setIsModified(true);
    },
    [shell, updateActiveDoc]
  );

// ---- 段间距:对选区所在块(及祖先 block 元素)直接写 inline style ----
// 第三十轮:iframe-based — 找 iframe.contentDocument 中选区所在的块级元素
const isBlockLike = (el: Element): boolean => {
  const display = window.getComputedStyle(el).display;
  return !display.startsWith("inline");
};
const handleSpacingChange = useCallback(
  (s: { lineHeight?: number; marginTop?: number; marginBottom?: number }) => {
    if (!iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    const sel = doc.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    // 收集 range 内所有块级祖先元素(每个独立段落)
    const blocks = new Set<HTMLElement>();
    const collect = (node: Node | null) => {
      let n: Node | null = node;
      while (n) {
        if (n.nodeType === 1 && isBlockLike(n as Element)) {
          blocks.add(n as HTMLElement);
          break;
        }
        n = n.parentNode;
      }
    };
    collect(range.startContainer);
    collect(range.endContainer);
    // range 中间扫一遍 DOM 找 block 元素
    const root = range.commonAncestorContainer;
    const walker = doc.createTreeWalker(
      root.nodeType === 1 ? (root as Element) : (root.parentNode as Element),
      NodeFilter.SHOW_ELEMENT,
      null
    );
    let walkNode: Node | null = walker.nextNode();
    while (walkNode) {
      if (isBlockLike(walkNode as Element)) {
        // 看是否在 range 内
        const r: Range | null = doc.createRange();
        if (r) {
          r.selectNode(walkNode);
          if (
            r.compareBoundaryPoints(Range.START_TO_END, range) >= 0 &&
            r.compareBoundaryPoints(Range.END_TO_START, range) <= 0
          ) {
            blocks.add(walkNode as HTMLElement);
          }
        }
      }
      walkNode = walker.nextNode();
    }
    if (blocks.size === 0) return;
    let touched = false;
    blocks.forEach((dom) => {
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
      // 触发 input 事件 → App.tsx 的 iframe onLoad handler 会 setDocHtml(body.innerHTML)
      doc.body.dispatchEvent(new Event("input", { bubbles: true }));
      setIsModified(true);
      updateActiveDoc({ isModified: true });
    }
  },
  [updateActiveDoc]
);

  // ---- 读取当前块的「显式改过」的 8 项属性(白名单)----
  // 第三十轮:iframe-based — 直接读 blockEl 的 inline style + 选区内 inline mark
  const readBlockExplicitProps = useCallback((el: HTMLElement | null): Record<string, string> => {
    if (!el) return {};
    try {
      if (!(el instanceof HTMLElement)) return {};
      // inline 节点(光标在 span 内)跳过;只对块级元素读 inline style
      const display = window.getComputedStyle(el).display;
      if (display.startsWith("inline")) return {};
      const props: Record<string, string> = {};

      // textStyle / highlight 通过 inline style / font tag 读(iframe 内 Tiptap mark 不存在)
      // font-family / font-size / color:用选区 range 的 computedStyle
      const doc = el.ownerDocument;
      if (doc) {
        const sel = doc.getSelection();
        if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const inlineEl = range.startContainer.parentElement;
          if (inlineEl instanceof HTMLElement) {
            const cs = window.getComputedStyle(inlineEl);
            if (cs.fontFamily) props["font-family"] = cs.fontFamily;
            if (cs.fontSize && cs.fontSize !== "16px") {
              // px → pt
              const px = parseFloat(cs.fontSize);
              if (isFinite(px) && px > 0) {
                props["font-size"] = `${Math.round(px * 0.75 * 2) / 2}pt`;
              }
            }
            if (cs.color && cs.color !== "rgb(0, 0, 0)") props.color = cs.color;
            // highlight:从 inline style background-color 读
            const styleBg = inlineEl.style.backgroundColor || cs.backgroundColor;
            if (styleBg && styleBg !== "rgba(0, 0, 0, 0)" && styleBg !== "transparent") {
              props["background-color"] = styleBg;
            }
          }
        }
      }

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
  }, []);

  // ---- 「设为默认样式」:把当前块显式属性 upsert 进 head 内嵌命名块 ----
  // 第三十轮:用 contextMenu.blockElement 而非 editor.selection
  const handleSetAsDefault = useCallback((el: HTMLElement | null) => {
    if (!el || !shell) return;
    const selector = blockTypeToSelector(el.tagName.toLowerCase(), {});
    if (!selector) return;
    const props = readBlockExplicitProps(el);
    if (Object.keys(props).length === 0) return;
    const { head, headCss } = upsertShellHead(shell.head, selector, props);
    updateActiveDoc({ shell: { ...shell, head, headCss } });
    setShell({ ...shell, head, headCss });
  }, [shell, readBlockExplicitProps, updateActiveDoc]);

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

  // v0.2.0:refreshPreview / togglePreview / preview postMessage handler 已移除
  // (preview 视图不再存在,编辑器视图 = 浏览器视图)

  // v0.1.13 第二十六轮:TocFloating.tsx 用 React onMouseEnter/Leave/onClick
// 处理交互(hover 展开 / 鼠标移开收起 / click 跳转),不再需要 document click 委托
// (之前 24 轮用的 click 委托假设 tocGen 输出 btn/panel id,但 React Portal 方案
// 直接用 React 事件绑定更可靠)

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
      // v0.2.0:F5/F9 预览快捷键已移除(预览视图不再存在)
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // 第三十轮:不再 early return `if (!editor) return null` —
  // editor 在第一渲染时是 null(react useEditor 异步初始化),
  // 下面的 useMemo 必须在条件 return 之前调用,否则 hooks 数量不一致
  // 会触发 React "Invalid hook call" → 整个 App 渲染失败 → 界面空白。
  // editor 现在已 vestigial(数据层 schema 占位),UI 全部走 iframeRef/docHtml。

  const viewClass = viewMode === "page" ? "editor-page" : "editor-wide";

  // v0.1.13 第三十轮:iframe-based 编辑器(MVP)
  // docHtml / iframeRef 已在组件顶部声明(snapshotActive/applyDoc 需要先读 docHtml)

  // 第三十轮:docHtml 是 source of truth(保留 iframe WYSIWYG 原始 HTML)
  // 不再从 editor.getHTML() 同步 — Tiptap schema 会过滤掉 <script>/<style>/<button> 等,
  // iframe 内 WYSIWYG 编辑也不会触发 editor.onUpdate。
  // docHtml 只通过以下途径更新:
  //   1. applyDoc(doc): 显式 setDocHtml(doc.body) — 加载文件/切换 doc
  //   2. newDoc(): 显式 setDocHtml("<p></p>")
  //   3. iframe onLoad → body.addEventListener("input") → setDocHtml(body.innerHTML)

  // 第三十轮关键修复:srcDoc 用 useMemo 缓存,只在 activeDoc.id 或 shell 变化时重建。
  // 用户在 iframe 内编辑时 setDocHtml → React 不重新设 srcDoc → 浏览器不重新加载 iframe → 光标保留。
  // (如果直接传 srcDoc={buildFullDoc(docHtml, shell, true)},每次 docHtml 变化 iframe 都重载,光标必丢)
  const editorSrcDoc = useMemo(
    () => buildFullDoc(docHtml, shell, /* editable */ true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeDoc.id, shell]
  );

  // v0.2.0:basePreview / previewDoc 已移除(预览视图不存在,编辑器 = 浏览器)
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
        iframeRef={iframeRef}
        disabled={mode !== "edit" || isTextDoc}
        activeTab={activeTab}
        collapsed={ribbonCollapsed}
        onInsertImage={insertImage}
        onLink={setLink}
        recentTextColors={recentColors.text}
        recentHighlightColors={recentColors.highlight}
        onColorUsed={onColorUsed}
        onSpacingChange={handleSpacingChange}
        onPageBgChange={handlePageBg}
        tocEnabled={tocEnabled}
        onToggleToc={onToggleToc}
        tocDisabled={mode !== "edit" || isTextDoc}
        currentDesignId={currentDesignId}
        onApplyDesign={applyDesign}
        designDisabled={mode !== "edit" || isTextDoc}
        selectedBlock={selectedBlock}
        containerForm={containerForm}
        onBlockStyleChange={setBlockStyle}
        onPromoteBlock={handlePromote}
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
              {/* v0.1.13 第三十轮:iframe-based 编辑器(MVP)
                  - <EditorContent>(Tiptap PM view)替换为 <iframe srcDoc=docHtml contentEditable>
                  - 浏览器原生 HTML 解析,所有 <style> <script> <button> 等都 WYSIWYG
                  - iframe onInput → setDocHtml(用户编辑反馈,无需重建 iframe)
                  - Tiptap 仍 work(setContent 用于 save + toolbar),但 view 层用 iframe
                  - srcDoc 用 useMemo(editorSrcDoc)缓存 → 只在 activeDoc.id/shell 变化时重建,
                    用户编辑期间不重新加载 iframe → 光标保留
              */}
              <iframe
                key={activeDoc.id}
                ref={iframeRef}
                title="editor"
                className="editor-iframe"
                srcDoc={editorSrcDoc}
                sandbox="allow-same-origin allow-scripts allow-forms"
                onLoad={(e) => {
                  // iframe load 完后绑定 onInput 监听(避免重建 iframe 丢失 focus)
                  const iframe = e.currentTarget as HTMLIFrameElement;
                  const doc = iframe.contentDocument;
                  if (!doc) return;
                  // Goal 1 — iframe 重建后重定位 selectedBlock(⭐ 提升 / 改 shell 会触发重建)
                  // closure 捕获的是上一次 state,即使后面 setSelectedBlock 已清,这里读到的还是原值
                  if (selectedBlock) {
                    const el = locateBlock(doc, selectedBlock);
                    if (!el) {
                      // 重建后原块不在了 → 清选中(罕见,用户重选)
                      setSelectedBlock(null);
                      setContainerForm({});
                    } else if (
                      containerForm &&
                      Object.keys(containerForm).length === 0
                    ) {
                      // 重建后 containerForm 空 → 反读新 DOM 的 inline style
                      const inlineStyle = el.getAttribute("style") ?? "";
                      setContainerForm(parseContainerStyle(inlineStyle));
                    }
                  }
                  // 标记 isModified + 同步字数 + docHtml(用户编辑反馈)
                  doc.body.addEventListener("input", () => {
                    const html = doc.body.innerHTML;
                    setDocHtml(html);
                    setIsModified(true);
                    updateActiveDoc({ isModified: true });
                    // 字数统计:用 doc.body.innerText(更准确,跳过 style/script)
                    setWordCount((doc.body.innerText || "").replace(/\s+/g, "").length);
                  });
                }}
              />
              {/* Goal 1 — 可视块选择浮层(iframe 同级,fixed 定位) */}
              <SelectionOverlay
                iframeRef={iframeRef}
                hoveredBlock={hoveredBlock}
                selectedBlock={selectedBlock}
              />
              {/* v0.1.13 第三十轮:编辑器视图只显示 iframe 内 doc-toc atom(由 shell.head 中 TOC CSS 渲染),
                  不再额外渲染 TocFloating React Portal — 编辑器视图与浏览器打开完全一致(WYSIWYG)
                  doc-toc atom 在 iframe 内由 TOC_SCRIPT 处理 hover/click,与 preview iframe 一致 */}
              {/* v0.1.13 第三十轮:编辑器视图只显示 iframe 内 doc-toc atom(由 shell.head 中 TOC CSS 渲染),
                  不再额外渲染 TocFloating React Portal — 编辑器视图与浏览器打开完全一致(WYSIWYG)
                  doc-toc atom 在 iframe 内由 TOC_SCRIPT 处理 hover/click,与 preview iframe 一致 */}
            </div>
          )}
        </div>

        {/* 块源代码面板（右键块打开，右侧边栏） */}
        {blockPanelElement != null && !isTextDoc && mode === "edit" && (
          <BlockSourcePanel
            element={blockPanelElement}
            onClose={() => setBlockPanelElement(null)}
            onApplied={() => {
              // 应用 HTML 后 iframe DOM 已变,但 docHtml state 未更新;
              // 手动同步:触发 iframe body 的 input 事件 → setDocHtml
              const doc = iframeRef.current?.contentDocument;
              doc?.body.dispatchEvent(new Event("input", { bubbles: true }));
            }}
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
              setBlockPanelElement(contextMenu.blockElement);
              setContextMenu(null);
            }}
            onSetAsDefault={() => {
              handleSetAsDefault(contextMenu.blockElement);
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

      {/* Goal 2 — ⭐ 提升确认 modal */}
      {promoteConfirmOpen && (
        <div className="modal-mask" onClick={() => setPromoteConfirmOpen(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>提升为默认</h3>
            <p>
              将把样式提升为本文档所有 <code>{promoteConfirmOpen.tagName}</code>{" "}
              的默认(共 {promoteConfirmOpen.count} 个)。原 inline 会被清除。
            </p>
            <div className="modal-actions">
              <button onClick={confirmPromote} className="modal-btn-primary">
                确定
              </button>
              <button onClick={() => setPromoteConfirmOpen(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Goal 3 — 应用关闭未保存弹窗 */}
      {closeDialogOpen && (
        <UnsavedCloseDialog
          dirtyTabs={docs
            .filter((d) => d.isModified)
            .map((d) => ({
              id: d.id,
              filePath: d.filePath,
              title: d.filePath ? d.filePath.split("\\").pop() ?? "(未命名)" : `(未命名 ${d.id})`,
            }))}
          onSaveSelected={handleSaveSelected}
          onDontSave={handleDontSave}
          onCancel={handleCancelClose}
        />
      )}
    </div>
  );
}

export default App;
