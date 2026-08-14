// 源码视图 HTML 美化：完整文档（含 head/style/script 原样），块级标签各占一行并按嵌套缩进

const BLOCK_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "ul", "ol", "li", "blockquote",
  "table", "thead", "tbody", "tr", "th", "td", "div", "pre",
]);

const VOID_TAGS = new Set(["hr", "img", "br", "input"]);

const singleLine = (s: string): string => s.replace(/\s+/g, " ").trim();

const renderAttrs = (el: Element): string =>
  Array.from(el.attributes)
    .map((a) => ` ${a.name}="${a.value}"`)
    .join("");

export function formatHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const lines: string[] = [];

  const walk = (node: Node, depth: number): void => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === "br") return;
      const indent = "  ".repeat(depth);
      const attrs = renderAttrs(el);

      // script/style 内容原样保留（不压缩、不缩进内部）
      if (tag === "script" || tag === "style") {
        lines.push(`${indent}<${tag}${attrs}>`);
        const inner = el.innerHTML;
        if (inner.trim() !== "") {
          for (const line of inner.split("\n")) lines.push(line);
        }
        lines.push(`${indent}</${tag}>`);
        return;
      }

      if (VOID_TAGS.has(tag)) {
        lines.push(`${indent}<${tag}${attrs}>`);
        return;
      }

      const children = Array.from(el.childNodes);
      const hasBlockChildren = children.some(
        (c) =>
          c.nodeType === Node.ELEMENT_NODE &&
          BLOCK_TAGS.has((c as Element).tagName.toLowerCase())
      );

      if (hasBlockChildren) {
        lines.push(`${indent}<${tag}${attrs}>`);
        for (const c of children) walk(c, depth + 1);
        lines.push(`${indent}</${tag}>`);
        return;
      }

      // 无块子节点：整体保持一行
      const inner = tag === "pre" ? el.innerHTML : singleLine(el.innerHTML);
      if (inner.trim() === "") {
        lines.push(`${indent}<${tag}${attrs}></${tag}>`);
      } else {
        lines.push(`${indent}<${tag}${attrs}>${inner}</${tag}>`);
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = singleLine(node.textContent ?? "");
      if (text) lines.push("  ".repeat(depth) + text);
    }
  };

  // head 部分：各标签原样输出（meta/title/link/style/script 完整保留）
  if (doc.head) {
    lines.push("<head>");
    for (const c of Array.from(doc.head.childNodes)) {
      if (c.nodeType === Node.ELEMENT_NODE) {
        const el = c as Element;
        const tag = el.tagName.toLowerCase();
        if (tag === "style" || tag === "script") {
          lines.push(el.outerHTML);
        } else {
          lines.push(el.outerHTML);
        }
      }
    }
    lines.push("</head>");
  }

  lines.push("<body>");
  doc.body.childNodes.forEach((c) => walk(c, 0));
  lines.push("</body>");
  return lines.join("\n");
}
