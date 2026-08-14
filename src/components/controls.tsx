import { useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function GroupTitle({ children }: { children: ReactNode }) {
  return <div className="ribbon-group-title">{children}</div>;
}

interface RibbonButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}

export function RibbonButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  title,
}: RibbonButtonProps) {
  return (
    <button
      className={`ribbon-btn ${active ? "is-active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
    >
      <span className="btn-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

interface SelectControlProps {
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  title?: string;
}

export function SelectControl({ value, onChange, options, title }: SelectControlProps) {
  return (
    <div className="ribbon-select-wrap">
      <select
        className="ribbon-select"
        value={value}
        title={title}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface ColorControlProps {
  value: string;
  onChange: (color: string) => void;
  onClear: () => void;
  colors: readonly string[];
  title: string;
}

export function ColorControl({ value, onChange, onClear, colors, title }: ColorControlProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

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

  // Portal 渲染到 body 顶层，避免被功能区 overflow 裁剪/遮挡
  const pop = open && pos && (
    <div
      ref={popRef}
      className="color-picker-pop"
      style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 1000 }}
    >
      {colors.map((c) => (
        <button
          key={c}
          className="color-cell"
          style={{ background: c }}
          onClick={() => {
            onChange(c);
            setOpen(false);
          }}
        />
      ))}
      <button className="color-clear-btn" onClick={() => { onClear(); setOpen(false); }}>
        清除
      </button>
    </div>
  );

  return (
    <div className="ribbon-color-wrap" ref={wrapRef}>
      <button
        className="color-swatch"
        style={{ background: value || "#000" }}
        title={title}
        onClick={toggle}
      />
      {createPortal(pop, document.body)}
    </div>
  );
}
