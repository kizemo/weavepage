// 颜色选择器:Word 风格色板 = 预设色 + 最近使用色 + 更多颜色(系统色盘) + 清除
// Portal 渲染到 body 顶层,避免被功能区 overflow 裁剪/遮挡
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  onClear: () => void;
  colors: readonly string[];
  recents: string[];
  title: string;
}

export function ColorPicker({
  value, onChange, onClear, colors, recents, title,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 点击弹窗外关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) setPos({ left: rect.left, top: rect.bottom + 4 });
    setOpen(true);
  };

  const pop = open && pos && (
    <div
      ref={popRef}
      className="color-picker-pop"
      style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 1000 }}
      role="dialog"
      aria-label={title}
    >
      <div className="color-grid">
        {colors.map((c) => (
          <button
            key={c}
            className="color-cell"
            style={{ background: c }}
            onClick={() => { onChange(c); setOpen(false); }}
            aria-label={`选择颜色 ${c}`}
          />
        ))}
      </div>

      <div className="color-recent-label">最近使用</div>
      <div className="color-recent-row">
        {recents.length === 0 ? (
          <span className="color-recent-empty">(尚无最近用色)</span>
        ) : (
          recents.map((c) => (
            <button
              key={c}
              className="color-cell"
              style={{ background: c }}
              onClick={() => { onChange(c); setOpen(false); }}
              aria-label={`最近颜色 ${c}`}
            />
          ))
        )}
      </div>

      <div className="color-actions">
        <button
          className="color-custom-btn"
          onClick={(e) => {
            // 阻止冒泡,避免被外层 mousedown handler 误关
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          更多颜色...
        </button>
        <input
          ref={inputRef}
          type="color"
          className="color-native-input"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(false);
          }}
        />
        <button
          className="color-clear-btn"
          onClick={() => { onClear(); setOpen(false); }}
        >
          清除
        </button>
      </div>
    </div>
  );

  return (
    <div className="ribbon-color-wrap" ref={wrapRef}>
      <button
        className="color-swatch"
        style={{ background: value || "#000" }}
        title={title}
        onClick={toggle}
        aria-label={title}
      />
      {createPortal(pop, document.body)}
    </div>
  );
}
