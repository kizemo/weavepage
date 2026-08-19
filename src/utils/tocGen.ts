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
