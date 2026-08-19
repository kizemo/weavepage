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
