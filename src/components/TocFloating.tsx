import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type { RefObject } from "react";
import {
  scanHeadings,
  type TocEntry,
} from "../utils/tocGen";

interface TocFloatingProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  docHtml: string; // 用于 wrap 右边位置计算(避免读 iframe)
  enabled: boolean;
}

// 浮动目录 React Portal — v0.1.13 第三十轮:iframe-based 编辑器
//
// 关键设计:
// - 整段 wrap 用 createPortal 挂到 document.body(完全避开 iframe + contenteditable)
// - preview iframe 是独立 document,iframe 内 React 不会自动渲染,所以预览界面
//   仍由 doc-toc atom 自身的 inline style 渲染(浏览器标准 fixed work)
// - 编辑器视图 = React Portal UI(扫描 iframe.contentDocument.body 的 h2/h3)
// - 视觉一致:两个视图都看到 wrap 浮动右上角 + panel hover 展开 + 子菜单

export function TocFloating({ iframeRef, docHtml, enabled }: TocFloatingProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  // wrap 右边位置:对齐 iframe 内 body 元素右缘
  const [right, setRight] = useState(12);

  // 当前 hover 的 h2(用于子菜单位置 + 内容)
  interface H2HoverState {
    id: string;
    rect: DOMRect;
    h3Children: TocEntry[];
  }
  const [hoveredH2, setHoveredH2] = useState<H2HoverState | null>(null);
  const closeSubmenuTimerRef = useRef<number | null>(null);

  // 扫描 iframe.contentDocument.body 的 h2/h3(替代 editor.getHTML 扫描)
  useEffect(() => {
    if (!enabled) return;
    let debounceTimer: number | null = null;
    const refresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;
        const fresh = scanHeadings(doc.body);
        const h2h3 = Array.from(doc.body.querySelectorAll("h2, h3")).filter(
          (el) => (el.textContent ?? "").trim() !== ""
        );
        // 给 DOM 元素设 id(让 scrollIntoView 跳转用)
        h2h3.forEach((el, i) => {
          const e = fresh[i];
          if (e) el.id = e.id;
        });
        setEntries(fresh);
      }, 400);
    };
    refresh();
    // 监听 iframe 内 DOM 变化(用户编辑 heading 文本时触发)
    const doc = iframeRef.current?.contentDocument;
    const mo = doc ? new MutationObserver(refresh) : null;
    if (mo && doc && doc.body) mo.observe(doc.body, { childList: true, subtree: true, characterData: true });
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      mo?.disconnect();
    };
  }, [iframeRef, enabled, docHtml]);

  // wrap 右边位置:对齐 iframe 内 page 元素右缘
  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      const pageEl = doc.body as HTMLElement;
      const rect = pageEl.getBoundingClientRect();
      const cs = window.getComputedStyle(pageEl);
      const paddingRight = parseFloat(cs.paddingRight) || 0;
      setRight(Math.max(12, Math.round(window.innerWidth - rect.right + paddingRight + 12)));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const doc = iframeRef.current?.contentDocument;
    const ro = doc ? new ResizeObserver(update) : null;
    if (ro && doc?.body) ro.observe(doc.body);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      ro?.disconnect();
    };
  }, [iframeRef, enabled, docHtml]);

  const handleEnter = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpen(true);
  }, []);

  const handleLeave = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 250);
  }, []);

  const handleClick = useCallback((id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const tgt = doc.querySelector(`#${CSS.escape(id)}`);
    if (tgt) {
      tgt.scrollIntoView({ behavior: "smooth", block: "start" });
      setOpen(false);
      setHoveredH2(null);
    }
  }, [iframeRef]);

  useEffect(() => () => {
    if (closeSubmenuTimerRef.current) {
      clearTimeout(closeSubmenuTimerRef.current);
      closeSubmenuTimerRef.current = null;
    }
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  if (!enabled) return null;

  // 收集紧跟 h2 的 h3 子项
  const collectH3 = (startIdx: number): { children: TocEntry[]; nextIdx: number } => {
    const children: TocEntry[] = [];
    let j = startIdx + 1;
    while (j < entries.length && entries[j]!.level === 3) {
      children.push(entries[j]!);
      j++;
    }
    return { children, nextIdx: j };
  };

  // 主列表 h2 节点
  const h2Nodes: React.ReactNode[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (e.level !== 2) continue;
    const { children: h3Children, nextIdx } = collectH3(i);
    h2Nodes.push(
      <li
        key={e.id}
        className="wp-toc-floating-item wp-toc-floating-item-h2"
        onMouseEnter={(ev) => {
          if (closeSubmenuTimerRef.current) {
            clearTimeout(closeSubmenuTimerRef.current);
            closeSubmenuTimerRef.current = null;
          }
          const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
          setHoveredH2({ id: e.id, rect, h3Children });
        }}
        onMouseLeave={() => {
          if (closeSubmenuTimerRef.current) clearTimeout(closeSubmenuTimerRef.current);
          closeSubmenuTimerRef.current = window.setTimeout(() => {
            setHoveredH2((cur) => (cur?.id === e.id ? null : cur));
            closeSubmenuTimerRef.current = null;
          }, 250);
        }}
      >
        <a className="doc-toc-h2" href={`#${e.id}`} onClick={handleClick(e.id)}>
          {e.text}
        </a>
      </li>,
    );
    i = nextIdx - 1;
  }

  // 子菜单 —Portal,position: fixed,viewport 坐标
  // 关键:top 直接用 h2Rect.top(viewport),不要减 wrapRect.top(否则在 wrap 内 panel 内)
  const submenuNode: React.ReactNode = hoveredH2 ? createPortal(
    <div
      className="wp-toc-floating-submenu"
      style={{
        position: "fixed",
        top: `${hoveredH2.rect.top}px`,
        left: `${Math.max(8, Math.round(hoveredH2.rect.left - 320 - 8))}px`,
        width: "320px",
        maxHeight: "60vh",
        overflowY: "auto",
        zIndex: 10000,
        border: "1px solid #d0d8e0",
        borderRadius: "10px",
        background: "#ffffff",
        boxShadow: "0 8px 28px rgba(0, 48, 112, 0.18)",
      }}
      onMouseEnter={() => {
        if (closeSubmenuTimerRef.current) {
          clearTimeout(closeSubmenuTimerRef.current);
          closeSubmenuTimerRef.current = null;
        }
      }}
      onMouseLeave={() => {
        if (closeSubmenuTimerRef.current) clearTimeout(closeSubmenuTimerRef.current);
        closeSubmenuTimerRef.current = window.setTimeout(() => {
          setHoveredH2(null);
          closeSubmenuTimerRef.current = null;
        }, 150);
      }}
    >
      <ul className="wp-toc-floating-submenu-list">
        {hoveredH2.h3Children.map((h3) => (
          <li key={h3.id} className="wp-toc-floating-item wp-toc-floating-item-h3">
            <a className="doc-toc-h3" href={`#${h3.id}`} onClick={handleClick(h3.id)}>
              {h3.text}
            </a>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  ) : null;

  // 整段 wrap 用 createPortal 挂到 document.body,完全避开 .editor-body / .ProseMirror
  // / .editor-scroll 等祖先的 contenteditable + overflow: auto + position: relative
  // 这些祖先会让 fixed 元素 contain 在内部(viewport 锁不到)
  // 挂到 document.body 后,wrap 的 fixed 锁到 Tauri webview viewport ✓
  return createPortal(
    <div
      ref={wrapRef}
      className={`wp-toc-floating-wrap ${open ? "is-expanded" : "is-collapsed"}`}
      style={{
        position: "fixed",
        top: "24px",
        right: `${right}px`,
        zIndex: 9999,
        width: "280px",
        background: "transparent",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif",
        fontSize: "14px",
        lineHeight: 1.5,
      }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        className="wp-toc-floating-btn"
        title={open ? "悬停收起" : "悬停展开"}
        onClick={() => {
          // toggle 也走 hover 行为
          if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
          setOpen((v) => !v);
        }}
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          alignItems: "center",
          gap: "6px",
          background: "#ffffff",
          border: "1px solid #d0d8e0",
          borderRadius: "22px",
          padding: "8px 16px",
          boxShadow: "0 2px 12px rgba(0, 48, 112, 0.15)",
          color: "#003070",
          fontWeight: 600,
          fontSize: "13px",
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "all 0.15s ease",
          boxSizing: "border-box",
        }}
      >
        <span className="wp-toc-floating-icon" aria-hidden>📑</span>
        <span className="wp-toc-floating-label">目录</span>
      </button>
      <div
        className="wp-toc-floating-body"
        role="region"
        aria-label="文档目录"
        style={{
          display: open ? "block" : "none",
          position: "absolute",
          top: "42px",
          right: 0,
          width: "280px",
          maxHeight: "60vh",
          overflowY: "auto",
          background: "#ffffff",
          border: "1px solid #d0d8e0",
          borderRadius: "10px",
          boxShadow: "0 8px 28px rgba(0, 48, 112, 0.18)",
          zIndex: 1,
          boxSizing: "border-box",
        }}
      >
        <div className="wp-toc-floating-body-header">
          <span
            className="doc-toc-title"
            style={{
              display: "block",
              padding: "10px 16px",
              margin: 0,
              fontSize: "13px",
              fontWeight: 600,
              color: "#ffffff",
              background: "linear-gradient(135deg, #003070 0%, #1a4480 100%)",
              borderRadius: "10px 10px 0 0",
              letterSpacing: "0.5px",
            }}
          >
            文档大纲
          </span>
        </div>
        <div className="wp-toc-floating-list-wrap">
          {entries.length > 0 ? (
            <ul
              className="doc-toc-list wp-toc-floating-root-list"
              style={{ listStyle: "none", padding: "4px 0", margin: 0 }}
            >
              {h2Nodes}
            </ul>
          ) : (
            <div
              className="doc-toc-empty-msg"
              style={{ padding: "0.5em 0.9em", color: "#6b7280", fontSize: "0.9em" }}
            >
              未找到任何标题(h2/h3)
            </div>
          )}
        </div>
      </div>
      {submenuNode}
    </div>,
    document.body,
  );
}