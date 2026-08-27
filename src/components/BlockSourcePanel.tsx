// v0.1.13 第三十轮:iframe-based BlockSourcePanel
// - 接收 element(来自 iframe.contentDocument)替代 editor + initialPos
// - 显示 element.outerHTML,可编辑
// - 应用:parse 编辑后 HTML,替换 element 在 DOM 树中的位置
// - onApplied:App.tsx 触发 iframe input 事件同步 docHtml

import { useEffect, useState } from "react";

interface BlockSourcePanelProps {
  element: HTMLElement;
  onClose: () => void;
  onApplied: () => void;
}

const isBlockElement = (el: HTMLElement): boolean => {
  const display = window.getComputedStyle(el).display;
  return !display.startsWith("inline");
};

const getParentBlock = (el: HTMLElement): HTMLElement | null => {
  let n: HTMLElement | null = el.parentElement;
  while (n) {
    if (isBlockElement(n)) return n;
    n = n.parentElement;
  }
  return null;
};

const getFirstChildBlock = (el: HTMLElement): HTMLElement | null => {
  // 找直接子级中第一个 block 元素
  for (const child of Array.from(el.children)) {
    if (child instanceof HTMLElement && isBlockElement(child)) return child;
  }
  return null;
};

const getSiblingBlock = (el: HTMLElement, dir: -1 | 1): HTMLElement | null => {
  const sibling = dir === -1 ? el.previousElementSibling : el.nextElementSibling;
  if (sibling instanceof HTMLElement && isBlockElement(sibling)) return sibling;
  return null;
};

const serializeElement = (el: HTMLElement): string => {
  return el.outerHTML;
};

export function BlockSourcePanel({ element: initialElement, onClose, onApplied }: BlockSourcePanelProps) {
  const [current, setCurrent] = useState<HTMLElement>(initialElement);
  const [text, setText] = useState<string>(() => serializeElement(initialElement));

  // 当 current 改变(用户导航),重新序列化
  useEffect(() => {
    setText(serializeElement(current));
  }, [current]);

  const nav = (next: HTMLElement | null) => {
    if (next) setCurrent(next);
  };

  const apply = () => {
    const doc = current.ownerDocument;
    if (!doc) return;
    // 解析编辑后的 HTML
    const tmpl = doc.createElement("template");
    tmpl.innerHTML = text;
    const newEl = tmpl.content.firstElementChild;
    if (!(newEl instanceof HTMLElement)) {
      window.alert("无法解析 HTML,请检查语法");
      return;
    }
    if (current.parentNode) {
      current.parentNode.replaceChild(newEl, current);
      setCurrent(newEl);
      onApplied();
    }
  };

  return (
    <div className="block-panel">
      <div className="block-panel-head">
        <span>块源代码 · {current.tagName.toLowerCase()}</span>
        <button onClick={onClose} title="关闭">×</button>
      </div>
      <div className="block-panel-nav">
        <button onClick={() => nav(getParentBlock(current))} title="选择父块">
          ⬆ 父块
        </button>
        <button onClick={() => nav(getFirstChildBlock(current))} title="选择第一个子块">
          ⬇ 子块
        </button>
        <button onClick={() => nav(getSiblingBlock(current, -1))} title="上一个兄弟块">
          ←
        </button>
        <button onClick={() => nav(getSiblingBlock(current, 1))} title="下一个兄弟块">
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