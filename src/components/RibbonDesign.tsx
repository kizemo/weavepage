import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { DESIGNS, DEFAULT_DESIGN_ID, type DesignMeta } from "../utils/designs";

// 缩略图内部通用样例 HTML(每个 design 共用,只换 design CSS)
const SAMPLE_HTML = `
<h1>一级标题</h1>
<h2>二级标题</h2>
<p>正文示例,展示<strong>粗体</strong>与<em>斜体</em>与<a href="#">链接</a>。</p>
<blockquote>引用块示例,展示左侧边线与背景。</blockquote>
<pre><code>const x = 'code';</code></pre>
<table><tr><th>表头</th><th>表头</th></tr><tr><td>单元格</td><td>单元格</td></tr></table>
<ul><li>列表项 1</li><li>列表项 2</li></ul>
<hr>
<p>行内 <code>code</code> 与 <kbd>Ctrl</kbd> 演示。</p>
`;

interface DesignThumbProps {
  design: DesignMeta | null; // null = "默认"卡
  selected: boolean;
  onClick: () => void;
}

function DesignThumb({ design, selected, onClick }: DesignThumbProps) {
  // 缩略图内部样式:用 design.css(默认卡不注入)
  const innerStyle = design ? (
    <style dangerouslySetInnerHTML={{ __html: design.css }} />
  ) : null;
  return (
    <button
      type="button"
      className={`design-thumb-card ${selected ? "is-selected" : ""}`}
      onClick={onClick}
      title={design ? design.name : "默认(无设计样式)"}
    >
      <div className="design-thumb-frame">
        {innerStyle}
        <div
          className="design-thumb-body"
          style={{ fontFamily: design?.fontFamily ?? "serif" }}
          dangerouslySetInnerHTML={{ __html: SAMPLE_HTML }}
        />
      </div>
      <span className="design-thumb-name">{design ? design.name : "默认"}</span>
    </button>
  );
}

interface DesignPickerPanelProps {
  currentDesignId: string | null;
  onApply: (id: string | null) => void;
  anchorRect: DOMRect;
  onClose: () => void;
}

function DesignPickerPanel({
  currentDesignId,
  onApply,
  anchorRect,
  onClose,
}: DesignPickerPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // 点击 panel 外关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      // 排除按钮本身(按钮触发 toggle)
      const target = e.target as HTMLElement;
      if (target.closest(".ribbon-design-btn")) return;
      onClose();
    };
    // 用 mousedown 比 click 早触发,避免误触
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // 定位:按钮正下方,左右不超视窗
  const left = Math.max(8, Math.min(window.innerWidth - 520, anchorRect.left));
  const top = anchorRect.bottom + 4;

  return createPortal(
    <div
      ref={panelRef}
      className="ribbon-design-picker"
      style={{ position: "fixed", left, top, zIndex: 1000 }}
      role="dialog"
      aria-label="文档设计"
    >
      <div className="ribbon-design-picker-header">文档设计</div>
      <div className="ribbon-design-picker-grid">
        {/* 第一格:默认 */}
        <DesignThumb
          design={null}
          selected={currentDesignId === DEFAULT_DESIGN_ID}
          onClick={() => {
            onApply(null);
            onClose();
          }}
        />
        {/* 8 个预设 */}
        {DESIGNS.map((d) => (
          <DesignThumb
            key={d.id}
            design={d}
            selected={currentDesignId === d.id}
            onClick={() => {
              onApply(d.id);
              onClose();
            }}
          />
        ))}
      </div>
    </div>,
    document.body
  );
}

interface RibbonDesignProps {
  currentDesignId: string | null;
  onApply: (id: string | null) => void;
  disabled: boolean;
}

export function RibbonDesign({
  currentDesignId,
  onApply,
  disabled,
}: RibbonDesignProps) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const togglePanel = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
    } else {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) setAnchorRect(rect);
      setOpen(true);
    }
  };

  return (
    <div className="ribbon-group ribbon-design-wrap">
      <button
        ref={btnRef}
        className={`ribbon-btn ribbon-design-btn ${open ? "is-active" : ""}`}
        onClick={togglePanel}
        disabled={disabled}
        title={disabled ? "请切换到编辑视图" : "文档设计(8 套预设 + 默认)"}
      >
        <span className="btn-icon">🎨</span>
        <span>设计</span>
      </button>
      {open && anchorRect && (
        <DesignPickerPanel
          currentDesignId={currentDesignId}
          onApply={onApply}
          anchorRect={anchorRect}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
