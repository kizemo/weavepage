import { useState, useEffect } from "react";
import type { Editor } from "@tiptap/react";
import { DOMSerializer, Fragment } from "@tiptap/pm/model";

interface BlockSourcePanelProps {
  editor: Editor;
  initialPos: number;
  onClose: () => void;
}

// 序列化单个块节点为 HTML
const serializeBlock = (editor: Editor, pos: number): string => {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return "";
  const ser = DOMSerializer.fromSchema(editor.schema);
  const el = document.createElement("div");
  el.appendChild(ser.serializeFragment(Fragment.from(node)));
  return el.innerHTML;
};

const blockTypeName = (editor: Editor, pos: number): string => {
  const node = editor.state.doc.nodeAt(pos);
  return node ? node.type.name : "";
};

export function BlockSourcePanel({ editor, initialPos, onClose }: BlockSourcePanelProps) {
  const [pos, setPos] = useState(initialPos);
  const [text, setText] = useState(() => serializeBlock(editor, initialPos));

  // 导航改变 pos 后重新序列化
  useEffect(() => {
    setText(serializeBlock(editor, pos));
  }, [editor, pos]);

  const doc = editor.state.doc;

  const parentBlock = (p: number): number | null => {
    const $p = doc.resolve(p);
    const d = $p.depth;
    if (d <= 1) return null; // 父节点是 doc
    return $p.before(d - 1);
  };

  const firstChildBlock = (p: number): number | null => {
    const node = doc.nodeAt(p);
    if (!node) return null;
    let found: number | null = null;
    node.forEach((child, offset) => {
      if (found == null && child.isBlock) found = p + 1 + offset;
    });
    return found;
  };

  const siblingBlock = (p: number, dir: -1 | 1): number | null => {
    const $p = doc.resolve(p);
    const d = $p.depth;
    if (d <= 1) return null;
    const parent = $p.node(d - 1);
    const idx = $p.index(d - 1);
    const t = idx + dir;
    if (t < 0 || t >= parent.childCount) return null;
    let start = $p.before(d - 1) + 1;
    for (let i = 0; i < t; i++) start += parent.child(i).nodeSize;
    return start;
  };

  const nav = (next: number | null) => {
    if (next != null) setPos(next);
  };

  const apply = () => {
    const node = doc.nodeAt(pos);
    if (!node) return;
    const from = pos;
    const to = pos + node.nodeSize;
    editor.chain().focus().deleteRange({ from, to }).run();
    editor.chain().focus().insertContentAt(from, text).run();
  };

  return (
    <div className="block-panel">
      <div className="block-panel-head">
        <span>块源代码 · {blockTypeName(editor, pos)}</span>
        <button onClick={onClose} title="关闭">×</button>
      </div>
      <div className="block-panel-nav">
        <button onClick={() => nav(parentBlock(pos))} title="选择父块">
          ⬆ 父块
        </button>
        <button onClick={() => nav(firstChildBlock(pos))} title="选择第一个子块">
          ⬇ 子块
        </button>
        <button onClick={() => nav(siblingBlock(pos, -1))} title="上一个兄弟块">
          ←
        </button>
        <button onClick={() => nav(siblingBlock(pos, 1))} title="下一个兄弟块">
          →
        </button>
      </div>
      <textarea
        className="block-panel-editor"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        wrap="soft"
      />
      <div className="block-panel-actions">
        <button onClick={apply} title="把源码应用到该块">
          应用
        </button>
        <button onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
