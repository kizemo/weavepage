// Goal 3 — 应用关闭未保存弹窗
// dirty tabs checkbox 列表(默认全选) + 三按钮:保存选中 / 不保存 / 取消
// 复用 AboutDialog 的 modal-mask 风格(modal-mask + modal-dialog CSS 已在 App.css)
import { useState } from "react";

export interface DirtyTab {
  id: number;
  filePath: string | null;
  title: string;
}

interface UnsavedCloseDialogProps {
  dirtyTabs: DirtyTab[];
  onSaveSelected: (selectedIds: number[]) => Promise<boolean>;
  onDontSave: () => void;
  onCancel: () => void;
}

export function UnsavedCloseDialog({
  dirtyTabs,
  onSaveSelected,
  onDontSave,
  onCancel,
}: UnsavedCloseDialogProps) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(dirtyTabs.map((t) => t.id))
  );

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    await onSaveSelected(Array.from(selected));
    // 成功由调用方关闭,失败也由调用方决定(留 dialog)
  };

  return (
    <div className="modal-mask" onClick={onCancel}>
      <div
        className="modal-dialog unsaved-close-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>未保存的文档</h3>
        <p>以下文档有未保存的修改:</p>
        <ul className="dirty-tabs-list">
          {dirtyTabs.map((tab) => (
            <li key={tab.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(tab.id)}
                  onChange={() => toggle(tab.id)}
                />
                <span>
                  {tab.filePath ?? "(未命名)"} — {tab.title}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button
            onClick={handleSave}
            disabled={selected.size === 0}
            className="modal-btn-primary"
          >
            保存选中
          </button>
          <button onClick={onDontSave}>不保存</button>
          <button onClick={onCancel}>取消</button>
        </div>
      </div>
    </div>
  );
}