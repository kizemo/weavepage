// Goal 1 — 可视块选择 overlay
// 渲染两个跨 iframe 的浮层:1) hover 虚线 + tag;2) selected 实线 + breadcrumb badge
// 坐标从 iframe.contentDocument 节点的 getBoundingClientRect 换算到外层视口坐标
// iframe 重建 / 滚动 / 缩放时通过 useEffect 同步位置
import { useEffect, useState } from "react";
import type { BlockIdentity } from "../utils/blockStyle";
import { locateBlock } from "../utils/blockStyle";

interface SelectionOverlayProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  hoveredBlock: { tagName: string; nthOfType: number } | null;
  selectedBlock: BlockIdentity | null;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function getBlockRect(
  iframe: HTMLIFrameElement,
  tagName: string,
  nthOfType: number
): Rect | null {
  const doc = iframe.contentDocument;
  if (!doc) return null;
  const el = doc.querySelectorAll(tagName)[nthOfType] as HTMLElement | undefined;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const fr = iframe.getBoundingClientRect();
  return {
    left: r.left + fr.left,
    top: r.top + fr.top,
    width: r.width,
    height: r.height,
  };
}

function breadcrumbFor(el: HTMLElement): string {
  const path: string[] = [];
  let cur: HTMLElement | null = el;
  while (cur && cur.tagName !== "BODY" && cur.tagName !== "HTML") {
    path.unshift(cur.tagName.toLowerCase());
    cur = cur.parentElement;
  }
  return path.join(" > ") || el.tagName.toLowerCase();
}

export function SelectionOverlay({
  iframeRef,
  hoveredBlock,
  selectedBlock,
}: SelectionOverlayProps) {
  const [hoveredRect, setHoveredRect] = useState<Rect | null>(null);
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<string>("");

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const updateHover = () => {
      if (!hoveredBlock) {
        setHoveredRect(null);
        return;
      }
      setHoveredRect(
        getBlockRect(iframe, hoveredBlock.tagName, hoveredBlock.nthOfType)
      );
    };

    const updateSelected = () => {
      if (!selectedBlock) {
        setSelectedRect(null);
        setBreadcrumb("");
        return;
      }
      const doc = iframe.contentDocument;
      if (!doc) {
        setSelectedRect(null);
        setBreadcrumb("");
        return;
      }
      const el = locateBlock(doc, selectedBlock);
      if (!el) {
        setSelectedRect(null);
        setBreadcrumb("");
        return;
      }
      const r = el.getBoundingClientRect();
      const fr = iframe.getBoundingClientRect();
      setSelectedRect({
        left: r.left + fr.left,
        top: r.top + fr.top,
        width: r.width,
        height: r.height,
      });
      setBreadcrumb(breadcrumbFor(el));
    };

    updateHover();
    updateSelected();

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    doc?.addEventListener("scroll", updateHover);
    doc?.addEventListener("scroll", updateSelected);
    win?.addEventListener("resize", updateHover);
    win?.addEventListener("resize", updateSelected);
    return () => {
      doc?.removeEventListener("scroll", updateHover);
      doc?.removeEventListener("scroll", updateSelected);
      win?.removeEventListener("resize", updateHover);
      win?.removeEventListener("resize", updateSelected);
    };
  }, [iframeRef, hoveredBlock, selectedBlock]);

  return (
    <>
      {hoveredRect && (
        <div
          className="selection-overlay selection-overlay--hover"
          style={{
            position: "fixed",
            left: hoveredRect.left,
            top: hoveredRect.top,
            width: hoveredRect.width,
            height: hoveredRect.height,
            pointerEvents: "none",
            zIndex: 9999,
            border: "1px dashed #94a3b8",
            boxSizing: "border-box",
          }}
        >
          <span
            className="selection-overlay__tag"
            style={{
              position: "absolute",
              top: -18,
              left: 0,
              background: "#94a3b8",
              color: "white",
              fontSize: "11px",
              padding: "1px 4px",
              borderRadius: "2px",
            }}
          >
            {hoveredBlock?.tagName}
          </span>
        </div>
      )}
      {selectedRect && (
        <div
          className="selection-overlay selection-overlay--selected"
          style={{
            position: "fixed",
            left: selectedRect.left,
            top: selectedRect.top,
            width: selectedRect.width,
            height: selectedRect.height,
            pointerEvents: "none",
            zIndex: 10000,
            border: "2px solid #2563eb",
            boxSizing: "border-box",
          }}
        >
          <span
            className="selection-overlay__badge"
            style={{
              position: "absolute",
              top: -20,
              right: 0,
              background: "#2563eb",
              color: "white",
              fontSize: "11px",
              padding: "1px 6px",
              borderRadius: "2px",
              whiteSpace: "nowrap",
            }}
          >
            {breadcrumb}
          </span>
        </div>
      )}
    </>
  );
}