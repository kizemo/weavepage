// 源码视图 HTML 美化：只调整空白字符（缩进 + 换行），不修改任何标签 / 属性 / 文本字符
//
// 设计原则(v2.0.1,用户要求):
//   - 块级容器标签换行 + 缩进(只加空白字符)
//   - inline 元素 / 文本节点原字符保留(不 singleLine 折叠)
//   - script / style / pre 内容原样保留(已支持)
//   - 属性值 escAttr 必要的序列化转义(" / &)— 不算修改代码,语法所需
//
// 取消 singleLine / script-style split("\n") / text node collapse — 都是会改字符的"伪修改"。

const BLOCK_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "ul", "ol", "li", "blockquote",
  "table", "thead", "tbody", "tr", "th", "td", "div", "pre",
]);

const VOID_TAGS = new Set(["hr", "img", "br", "input"]);

// 属性值转义:DOMParser 已经把 &quot; 解码成原始 ",直接拼接会把属性边界打穿
//(例:data-h3-ids="[&quot;11-AI内容进入平权时代&quot;]" 解码后值含 ",
// 输出 [再嵌裸 "]会让下游 HTML 解析把属性截断到第一个 ")。
// 也导出供 App.tsx 的 bodyAttrs 等场景复用 — 同样的解码 → 拼接问题。
export const escAttr = (s: string): string =>
  s.replace(/[&"]/g, (c) => ({ "&": "&amp;", '"': "&quot;" }[c] || c));

const renderAttrs = (el: Element): string =>
  Array.from(el.attributes)
    .map((a) => ` ${a.name}="${escAttr(a.value)}"`)
    .join("");

export function formatHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const lines: string[] = [];

  // DOCTYPE 提取(从原始字符串,保留 publicId / systemId)
  const doctypeMatch = html.match(/<!DOCTYPE[^>]*>/i);
  const doctypeLine = doctypeMatch ? doctypeMatch[0] : "<!DOCTYPE html>";

  lines.push(doctypeLine);

  // <html> 包装 + 属性
  const htmlAttrs = doc.documentElement
    ? renderAttrs(doc.documentElement)
    : "";
  lines.push(`<html${htmlAttrs}>`);

  const walk = (node: Node, depth: number): void => {
    const indent = "  ".repeat(depth);
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      const attrs = renderAttrs(el);

      if (tag === "br") {
        lines.push(`${indent}<br>`);
        return;
      }

      // script / style / pre:内容原样保留,只加外层标签(可能含 inner 里的 \n → 跨行)
      if (tag === "script" || tag === "style" || tag === "pre") {
        const inner = el.innerHTML;
        if (inner.trim() === "") {
          lines.push(`${indent}<${tag}${attrs}></${tag}>`);
        } else {
          lines.push(`${indent}<${tag}${attrs}>${inner}</${tag}>`);
        }
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

      // inline 元素:innerHTML 原字符保留(可能含 \n → 跨行,但不折叠)
      const inner = el.innerHTML;
      if (inner.trim() === "") {
        lines.push(`${indent}<${tag}${attrs}></${tag}>`);
      } else {
        lines.push(`${indent}<${tag}${attrs}>${inner}</${tag}>`);
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      // 文本节点原样(不折叠空白)— 字符级无修改
      // 例外:仅空白(insignificant whitespace between block elements)的文本节点跳过,
      // 否则 linkedom 把第一遍格式化输出的缩进 parse 成文本节点,第二轮格式化会输出多余空行
      //(不影响真实 HTML 渲染,真实浏览器也会忽略元素间空白)
      const text = node.textContent ?? "";
      if (text && text.trim() !== "") lines.push(indent + text);
    } else if (node.nodeType === Node.COMMENT_NODE) {
      // v2.0.3:保留 HTML 注释(TOC 的 CSS / 结构 / script 标记依赖注释识别)
      const data = (node as Comment).nodeValue ?? "";
      if (data) lines.push(indent + `<!--${data}-->`);
    }
  };

  // head 部分:各标签 outerHTML 原样,只加缩进
  if (doc.head) {
    lines.push("  <head>");
    for (const c of Array.from(doc.head.childNodes)) {
      if (c.nodeType === Node.ELEMENT_NODE) {
        lines.push("    " + (c as Element).outerHTML);
      } else if (c.nodeType === Node.TEXT_NODE) {
        const t = c.textContent ?? "";
        if (t.trim()) lines.push("    " + t);
      } else if (c.nodeType === Node.COMMENT_NODE) {
        // v2.0.3:TOC 样式表注释标记必须保留
        lines.push("    <!--" + ((c as Comment).nodeValue ?? "") + "-->");
      }
    }
    lines.push("  </head>");
  }

  lines.push("  <body>");
  if (doc.body) {
    doc.body.childNodes.forEach((c) => walk(c, 3));
  }
  lines.push("  </body>");

  lines.push("</html>");
  return lines.join("\n");
}
