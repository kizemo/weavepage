import { useRef } from "react";
import { DESIGNS, DEFAULT_DESIGN_ID } from "../utils/designs";
import { DesignThumb } from "./DesignThumb";

interface DesignStripProps {
  currentDesignId: string | null;
  onApply: (id: string | null) => void;
  disabled: boolean;
}

export function DesignStrip({ currentDesignId, onApply, disabled }: DesignStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);

  return (
    <div className="ribbon-design-strip-wrap">
      <div
        ref={stripRef}
        className="ribbon-design-strip"
        role="toolbar"
        aria-label="文档设计"
      >
        {/* 默认卡(第一格) */}
        <DesignThumb
          design={null}
          selected={currentDesignId === DEFAULT_DESIGN_ID}
          onClick={() => { if (!disabled) onApply(null); }}
          disabled={disabled}
        />
        {/* 8 个预设 */}
        {DESIGNS.map((d) => (
          <DesignThumb
            key={d.id}
            design={d}
            selected={currentDesignId === d.id}
            onClick={() => { if (!disabled) onApply(d.id); }}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}