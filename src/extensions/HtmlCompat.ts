import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { DOMParser, Fragment } from "@tiptap/pm/model";
import type { Node as PMNode } from "@tiptap/pm/model";

// 打开外部 HTML 时的保真扩展：
// 1. GlobalAttrs：为所有常见节点/标记保留 class/style/id 属性（否则预览时 CSS 选择器全部失效）
// 2. DivNode/SpanNode：保留 div/span 容器（Tiptap 默认会将其丢弃）

const GLOBAL_TYPES = [
  "paragraph", "heading", "bulletList", "orderedList", "listItem",
  "taskList", "taskItem", "blockquote", "codeBlock",
  "table", "tableRow", "tableHeader", "tableCell",
  "image", "horizontalRule", "div", "span",
  "bold", "italic", "strike", "underline", "code", "link", "highlight", "textStyle",
];

const attr = (name: string) => ({
  [name]: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute(name),
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes[name] ? { [name]: attributes[name] } : {},
  },
});

export const GlobalAttrs = Extension.create({
  name: "globalAttrs",
  addGlobalAttributes() {
    return [
      {
        types: GLOBAL_TYPES,
        attributes: {
          ...attr("class"),
          ...attr("style"),
          ...attr("id"),
        },
      },
    ];
  },
});

export const DivNode = Node.create({
  name: "div",
  group: "block",
  content: "block*",
  parseHTML() {
    return [
      {
        tag: "div",
        // div 内裸露的行内内容（如 <div><strong>标题</strong><ul>...</ul></div>）
        // 自动包进 paragraph，避免文本丢失导致文档 JS 找不到目标元素
        getContent: (element, schema) => {
          const parser = DOMParser.fromSchema(schema);
          const blocks: PMNode[] = [];
          let inlineBuffer: PMNode[] = [];
          const flush = () => {
            if (inlineBuffer.length) {
              blocks.push(schema.nodes.paragraph.create(null, inlineBuffer));
              inlineBuffer = [];
            }
          };
          for (const child of Array.from(element.childNodes)) {
            if (child.nodeType === 3) {
              const text = child.textContent ?? "";
              if (text.trim()) inlineBuffer.push(schema.text(text));
              continue;
            }
            if (child.nodeType !== 1) continue;
            const content = parser.parse(child as HTMLElement).content;
            if (content.childCount === 0) continue;
            const isBlock = content.firstChild?.isBlock ?? false;
            if (isBlock) {
              flush();
              content.forEach((n) => blocks.push(n));
            } else {
              content.forEach((n) => inlineBuffer.push(n));
            }
          }
          flush();
          return Fragment.fromArray(blocks);
        },
      },
    ];
  },
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes), 0],
});

export const SpanNode = Node.create({
  name: "span",
  group: "inline",
  inline: true,
  content: "inline*",
  parseHTML() {
    return [{ tag: "span" }];
  },
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes), 0],
});
