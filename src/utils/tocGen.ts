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
  const nodes = Array.from(root.querySelectorAll("h2, h3"));
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
