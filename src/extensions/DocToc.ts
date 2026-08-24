import { Node, mergeAttributes } from "@tiptap/core";

// DocToc:block-level 容器节点,doc 内嵌的目录导航块。
//
// 设计:
// - atom 节点(不可拆解,children 走 attr)
// - content 完整 v3 HTML(包含 <style> + <script> + 子结构)作为 tocHtml attr
// - parseHTML 识别 <div class="doc-toc" data-wp-doc-toc="1">,
//   getAttrs 把 el.innerHTML 作为 tocHtml(完整保存)
// - renderHTML 用 div.innerHTML = tocHtml 重建(包含 <style> 和 <script>)
//
// 这保证:
// - doc 内 TOC 完整保存(铁律:编辑可保存,export 在浏览器可见)
// - PM serialize 输出完整 HTML,<style> 解析生效,<script> 执行
// - 应用不主动 insert,只在 toggle 时由 App.tsx 插入
export interface DocTocAttrs {
  tocHtml: string;
}

export const DocToc = Node.create({
  name: "docToc",
  group: "block",
  atom: true,
  content: "",
  selectable: true,
  draggable: false,
  defining: true,

  addAttributes() {
    return {
      tocHtml: {
        default: "",
        parseHTML: (el: HTMLElement) => el.innerHTML || "",
        // 不输出 tocHtml attr,innerHTML 由 renderHTML 直接写
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div.doc-toc[data-wp-doc-toc='1']",
        // 完整保存 el.innerHTML
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          return { tocHtml: el.innerHTML };
        },
      },
      {
        tag: "div.doc-toc[contenteditable='false']",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          return { tocHtml: el.innerHTML };
        },
      },
      {
        tag: "nav.doc-toc",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          return { tocHtml: el.innerHTML };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = mergeAttributes(HTMLAttributes, {
      class: "doc-toc",
      contenteditable: "false",
      "data-wp-doc-toc": "1",
    });
    const div = document.createElement("div");
    for (const [k, v] of Object.entries(attrs)) {
      if (v != null && v !== "") div.setAttribute(k, String(v));
    }
    // 把 tocHtml 写入 div.innerHTML(包含 <style> 和 <script>)
    div.innerHTML = (node.attrs as DocTocAttrs).tocHtml || "";
    return div;
  },
});