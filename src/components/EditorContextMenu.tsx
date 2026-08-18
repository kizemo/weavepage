// 右键菜单:块源码 + 设为默认样式
// 设计:
//   - position: fixed 浮层,跟随鼠标位置
//   - 点菜单外 / ESC 关闭
//   - 「设为默认样式」仅在 blockTypeToSelector 命中(正文/标题)时启用
//   - 调用方负责构造坐标 + blockType/blockAttrs + 三个回调 + onClose
import { useEffect } from "react";
import { blockTypeToSelector } from "../utils/defaultStyle";

interface Props {
  x: number;
  y: number;
  blockType: string | null;
  blockAttrs?: Record<string, unknown>;
  onBlockSource: () => void;
  onSetAsDefault: () => void;
  onClose: () => void;
}

export function EditorContextMenu({
  x,
  y,
  blockType,
  blockAttrs,
  onBlockSource,
  onSetAsDefault,
  onClose,
}: Props) {
  const canSetDefault = blockTypeToSelector(blockType ?? "", blockAttrs) !== null;

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".context-menu")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // mousedown 早于 click,且不会和右键事件冲突
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="context-menu" style={{ left: x, top: y }}>
      <button className="context-menu-item" onClick={onBlockSource}>
        块源码
      </button>
      <button
        className="context-menu-item"
        disabled={!canSetDefault}
        title={canSetDefault ? "" : "仅正文/标题支持设为默认样式"}
        onClick={canSetDefault ? onSetAsDefault : undefined}
      >
        设为默认样式
      </button>
    </div>
  );
}
