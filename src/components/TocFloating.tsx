import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import type { TocEntry } from "../utils/tocGen";

interface TocFloatingProps {
  editor: Editor;
  entries: TocEntry[];
  enabled: boolean;
}

export function TocFloating({ editor, entries, enabled }: TocFloatingProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const open = () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      wrap.classList.add("is-open");
    };
    const scheduleClose = () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => {
        wrap.classList.remove("is-open");
      }, 250);
    };
    wrap.addEventListener("mouseenter", open);
    wrap.addEventListener("mouseleave", scheduleClose);
    return () => {
      wrap.removeEventListener("mouseenter", open);
      wrap.removeEventListener("mouseleave", scheduleClose);
    };
  }, []);

  const handleClick = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const dom = editor.view.dom as HTMLElement;
    const tgt = dom.querySelector(`#${CSS.escape(id)}`);
    if (tgt) {
      tgt.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => editor.commands.focus(), 200);
    }
  };

  if (!enabled) return null;

  // 渲染嵌套 ul:h3 嵌在最近 h2 的子 ul
  const renderEntries = (): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    let openLi = false;
    let inSub = false;
    entries.forEach((e, i) => {
      if (e.level === 2) {
        if (openLi) {
          out.push(inSub ? (
            <ul key={"sub-close-" + i}>{/* 闭合占位 — 实际由 React fragment 处理 */}</ul>
          ) : null);
        }
        // 简化:用 flat array + key,React 自动闭合 ul
      }
    });
    return out;
  };
  // 上面是占位逻辑,实际用更干净的递归渲染:
  const renderTree = (level: 2 | 3, startIdx: number): { nodes: React.ReactNode[]; nextIdx: number } => {
    const nodes: React.ReactNode[] = [];
    let i = startIdx;
    while (i < entries.length) {
      const e = entries[i]!;
      if (e.level === level) {
        const children = level === 2
          ? (() => {
              const next = entries[i + 1];
              if (next && next.level === 3) {
                const sub = renderTree(3, i + 1);
                i = sub.nextIdx;
                return sub.nodes;
              }
              return null;
            })()
          : null;
        nodes.push(
          <li key={e.id} className="wp-toc-floating-item">
            <a className={`doc-toc-h${e.level}`} href={`#${e.id}`} onClick={handleClick(e.id)}>
              {e.text}
            </a>
            {children && <ul className="wp-toc-floating-submenu">{children}</ul>}
          </li>
        );
        i++;
      } else if (level === 2 && e.level === 3) {
        // 已在 h2 子节点里处理;此处跳过
        i++;
      } else {
        break;
      }
    }
    return { nodes, nextIdx: i };
  };
  const { nodes } = renderTree(2, 0);
  void renderEntries;

  return createPortal(
    <div id="wp-toc-floating-wrap" className="wp-toc-floating-wrap" ref={wrapRef}>
      <button className="wp-toc-floating" title="目录">📑</button>
      <div className="wp-toc-floating-panel">
        <div className="doc-toc-title">目录 ▾</div>
        <div className="doc-toc-list-wrap">
          <ul className="doc-toc-list">{nodes}</ul>
        </div>
      </div>
    </div>,
    document.body
  );
}
