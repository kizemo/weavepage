import type { Editor } from "@tiptap/core";

// slug 生成 + 去重 — 纯函数,不依赖 DOM/Tiptap
export function slugify(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || `n${index}`;
}

export function uniqueSlug(base: string, taken: Set<string>): string {
  let s = base;
  let n = 2;
  while (taken.has(s)) {
    s = `${base}-${n++}`;
  }
  taken.add(s);
  return s;
}

export interface TocEntry {
  level: 2 | 3;
  text: string;
  id: string;
}

// 扫描 root 下的 h2 / h3;空 textContent 跳过;返回顺序 = DOM 顺序
export function scanHeadings(root: HTMLElement): TocEntry[] {
  const out: TocEntry[] = [];
  const taken = new Set<string>();
  const nodes = root.querySelectorAll("h2, h3");
  nodes.forEach((el, idx) => {
    const tag = el.tagName.toLowerCase();
    if (tag !== "h2" && tag !== "h3") return;
    const level = (tag === "h2" ? 2 : 3) as 2 | 3;
    const text = (el.textContent ?? "").trim();
    if (!text) return;
    let id = el.id || "";
    if (!id) {
      const base = slugify(text, idx + 1);
      id = `wp-toc-${uniqueSlug(base, taken)}`;
    } else {
      taken.add(id);
    }
    out.push({ level, text, id });
  });
  return out;
}

const HTML_ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};
const escHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => HTML_ESC[c] ?? c);

export function buildDocTocHtml(entries: TocEntry[]): string {
  if (entries.length === 0) {
    return `<nav class="doc-toc-empty" contenteditable="false">`
      + `<div class="doc-toc-title">目录 ▾</div>`
      + `<div class="doc-toc-list-wrap"><div class="doc-toc-empty-msg">未找到任何标题</div></div>`
      + `</nav>`;
  }
  // 嵌套:h2 直接子 <li>,h3 嵌在最近 h2 的子 <ul>
  const openLis: string[] = [];
  const closeLis: string[] = [];
  let inner = "";
  let liOpen = false;
  let inSub = false;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (e.level === 2) {
      if (liOpen) {
        // 关闭上一个 h2
        inner += inSub ? "</ul></li>" : "</li>";
        inSub = false;
      }
      inner += `<li><a class="doc-toc-h2" href="#${escHtml(e.id)}">${escHtml(e.text)}</a>`;
      liOpen = true;
      // 检查下一个是否 h3
      const next = entries[i + 1];
      if (next && next.level === 3) {
        inner += "<ul>";
        inSub = true;
      } else {
        inner += "</li>";
        liOpen = false;
      }
    } else {
      // h3 — 必须有 liOpen
      if (!liOpen) continue;
      inner += `<li><a class="doc-toc-h3" href="#${escHtml(e.id)}">${escHtml(e.text)}</a></li>`;
      // 若下一个不是 h3,关闭 sub
      const next = entries[i + 1];
      if (!next || next.level !== 3) {
        if (inSub) {
          inner += "</ul></li>";
          inSub = false;
          liOpen = false;
        }
      }
    }
  }
  // 处理尾部未关闭
  if (liOpen) {
    inner += inSub ? "</ul></li>" : "</li>";
  }
  void openLis; void closeLis; // 占位防 lint
  return (
    `<nav class="doc-toc" contenteditable="false">` +
    `<div class="doc-toc-title">目录 ▾</div>` +
    `<div class="doc-toc-list-wrap"><ul class="doc-toc-list">${inner}</ul></div>` +
    `</nav>`
  );
}

export function assignHeadingIds(root: HTMLElement, entries: TocEntry[]): void {
  // 必须与 scanHeadings 同步过滤空 textContent 标题(否则 index 错位)
  const nodes = Array.from(root.querySelectorAll("h2, h3")).filter(
    (el) => (el.textContent ?? "").trim() !== ""
  );
  entries.forEach((e, i) => {
    const el = nodes[i];
    if (!el) return;
    if (el.id !== e.id) {
      if (e.id) el.setAttribute("id", e.id);
      else el.removeAttribute("id");
    }
  });
}

export function clearHeadingIds(root: HTMLElement): void {
  root.querySelectorAll("h2, h3").forEach((el) => {
    if (el.id.startsWith("wp-toc-")) el.removeAttribute("id");
  });
}

// ============================================================================
// Tiptap 集成层(scanTocEntries / regenDocToc / enableDocToc / disableDocToc)
// ============================================================================

// 通过 ProseMirror 视图 DOM 找到 nav.doc-toc 节点;返回其 PM pos(若没有返回 null)
const findDocTocPos = (editor: Editor): number | null => {
  const dom = editor.view.dom as HTMLElement;
  const navEl = dom.querySelector("nav.doc-toc");
  if (!navEl) return null;
  const pmView = editor.view;
  try {
    const pos = pmView.posAtDOM(navEl, 0);
    return pos;
  } catch {
    return null;
  }
};

// 删除 nav.doc-toc 节点(含其内容)
const removeDocToc = (editor: Editor): boolean => {
  const pos = findDocTocPos(editor);
  if (pos == null) return false;
  const $pos = editor.state.doc.resolve(pos);
  // 找到包含 nav.doc-toc 的最高节点
  let depth = $pos.depth;
  let node = $pos.node(depth);
  while (depth > 0) {
    const el = editor.view.nodeDOM($pos.before(depth));
    if (el === null || !(el instanceof HTMLElement)) break;
    if (!el.classList.contains("doc-toc")) {
      depth--;
      node = $pos.node(depth);
      continue;
    }
    break;
  }
  const from = $pos.before(depth);
  const to = from + node.nodeSize;
  editor.chain().focus().deleteRange({ from, to }).run();
  return true;
};

const insertDocToc = (editor: Editor, html: string): void => {
  editor.chain().focus().insertContentAt(0, html).run();
};

export function scanTocEntries(editor: Editor): TocEntry[] {
  const dom = editor.view.dom as HTMLElement;
  return scanHeadings(dom);
}

export function regenDocToc(editor: Editor): TocEntry[] {
  const entries = scanTocEntries(editor);
  // 写锚点
  const dom = editor.view.dom as HTMLElement;
  assignHeadingIds(dom, entries);
  // 替换 nav
  const html = buildDocTocHtml(entries);
  removeDocToc(editor);
  if (entries.length > 0) {
    insertDocToc(editor, html);
  } else {
    // 空 nav 也不插入(只保留按钮提示),但仍然要 clear existing nav(removeDocToc 已做)
  }
  return entries;
}

export function enableDocToc(editor: Editor): TocEntry[] {
  const entries = scanTocEntries(editor);
  const dom = editor.view.dom as HTMLElement;
  assignHeadingIds(dom, entries);
  // 幂等:无论 entries 是否为空,先 removeDocToc 再 insert — 防止重复调用 enableDocToc 时 nav 堆叠
  removeDocToc(editor);
  insertDocToc(editor, buildDocTocHtml(entries));
  return entries;
}

export function disableDocToc(editor: Editor): void {
  removeDocToc(editor);
  const dom = editor.view.dom as HTMLElement;
  clearHeadingIds(dom);
}
