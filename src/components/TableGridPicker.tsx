import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { RibbonButton } from "./controls";

interface TableGridPickerProps {
  onPick: (rows: number, cols: number) => void;
  onClear: () => void;
}

const MAX = 5;

export function TableGridPicker({ onPick, onClear }: TableGridPickerProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<[number, number]>([1, 1]);
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

  const [rows, cols] = hover;

  const pop = open && pos && (
    <div
      ref={popRef}
      className="grid-picker-pop"
      style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 1000 }}
    >
      <div className="grid-picker-cells">
        {Array.from({ length: MAX * MAX }).map((_, i) => {
          const r = Math.floor(i / MAX) + 1;
          const c = (i % MAX) + 1;
          const active = r <= rows && c <= cols;
          return (
            <button
              key={i}
              className={`grid-picker-cell ${active ? "active" : ""}`}
              onMouseEnter={() => setHover([r, c])}
              onClick={() => {
                onPick(r, c);
                setOpen(false);
              }}
            />
          );
        })}
      </div>
      <div className="grid-picker-hint">
        {rows} × {cols} 表格
      </div>
      <button
        className="color-clear-btn"
        style={{ width: "100%", marginTop: 6 }}
        onClick={() => { onClear(); setOpen(false); }}
      >
        删除表格
      </button>
    </div>
  );

  return (
    <div className="grid-picker-wrap" ref={wrapRef}>
      <RibbonButton
        icon="▦"
        label="表格"
        onClick={toggle}
        active={open}
      />
      {createPortal(pop, document.body)}
    </div>
  );
}
