// 单元测试:formatHtml 源代码视图 HTML 美化
// 跑法:pnpm tsx src/utils/formatHtml.test.ts
//
// 关键回归测试:renderAttrs 必须转义属性值中的 " 和 &,
// 否则 DOC-TOC 的 data-h3-ids/data-h3-texts(JSON 数组)经过源代码视图往返后
// 属性值会被截断到第一个 " — h3 子菜单标题丢失(bug v2.0.0,2026-08-24)。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";

// 在 linkedom 上挂一个 DOMParser 全局(formatHtml 内部用 new DOMParser())
const { document: _bootDoc, DOMParser } = parseHTML(
  "<!DOCTYPE html><html><body></body></html>",
);
(globalThis as { DOMParser?: typeof DOMParser }).DOMParser = DOMParser;

// linkedom 不暴露 Node / NodeList 全局,formatHtml 内部用 Node.ELEMENT_NODE
// (1) / Node.TEXT_NODE (3) 做节点类型判断,这里 polyfill 一下。
(globalThis as { Node?: unknown }).Node = {
  ELEMENT_NODE: 1,
  TEXT_NODE: 3,
  COMMENT_NODE: 8,
  DOCUMENT_NODE: 9,
};

const { formatHtml } = await import("./formatHtml");

// linkedom 0.18 的 parseFromString('text/html') 不像真浏览器自动把内容塞进 body;
// 这里套一层完整文档结构让它行为正确。
function parseFragment(html: string) {
  const wrapped =
    "<!DOCTYPE html><html><head></head><body>" + html + "</body></html>";
  return new DOMParser().parseFromString(wrapped, "text/html");
}

// 模拟 tocGen.buildTocHtml 输出的真实场景:data-h3-ids / data-h3-texts 是 JSON 数组
// (双引号在 attr 里被 &quot; 转义,DOMParser 解码后是原始 ")
const tocSubmenuHtml =
  '<div class="doc-toc"><div class="wp-toc-floating-wrap">' +
  '<div class="wp-toc-h3-submenu" data-for="x" ' +
  'data-h3-ids="[&quot;11-AI内容进入平权时代&quot;,&quot;12-测试&quot;]" ' +
  'data-h3-texts="[&quot;1.1 AI内容进入平权时代&quot;,&quot;1.2 测试&quot;]">' +
  '<ul></ul></div></div></div>';

test("formatHtml 转义属性值中的 \" 和 & — h3 子菜单往返不丢", () => {
  const out = formatHtml(
    "<!DOCTYPE html><html><head></head><body>" + tocSubmenuHtml + "</body></html>",
  );
  // 输出必须含 &quot; 而不是裸 " — 否则下游解析会截断属性
  assert.ok(
    out.includes("&quot;11-AI内容进入平权时代&quot;"),
    "data-h3-ids 的 JSON 数组必须用 &quot; 转义,不能有裸 \"\n实际输出:\n" + out,
  );
  assert.ok(
    out.includes("&quot;1.1 AI内容进入平权时代&quot;"),
    "data-h3-texts 的 JSON 数组必须用 &quot; 转义,不能有裸 \"\n实际输出:\n" + out,
  );

  // 模拟下游:再 parse 一遍看属性是否完整
  const reparsed = parseFragment(out);
  const sub = reparsed.querySelector(".wp-toc-h3-submenu");
  assert.ok(sub, "submenu 元素必须存在");
  const ids = sub.getAttribute("data-h3-ids");
  const texts = sub.getAttribute("data-h3-texts");
  assert.equal(
    ids,
    '["11-AI内容进入平权时代","12-测试"]',
    "data-h3-ids 必须保持完整 JSON,实际: " + JSON.stringify(ids),
  );
  assert.equal(
    texts,
    '["1.1 AI内容进入平权时代","1.2 测试"]',
    "data-h3-texts 必须保持完整 JSON,实际: " + JSON.stringify(texts),
  );
});

test("formatHtml 普通属性值不变", () => {
  // 非 block 单行分支在 linkedom 里靠 el.innerHTML(linkedom 不转义属性),
  // 真浏览器 innerHTML 会正确转义。只需要 class / id 这类无特殊字符的属性保持原样。
  const html = '<div class="a b" id="c">x</div>';
  const out = formatHtml(
    "<!DOCTYPE html><html><head></head><body>" + html + "</body></html>",
  );
  assert.ok(out.includes('class="a b"'), "class 必须保持\n输出:\n" + out);
  assert.ok(out.includes('id="c"'), "id 必须保持\n输出:\n" + out);
});

test("formatHtml 块级元素属性 — 直接走 renderAttrs 路径", () => {
  // 模拟 tocGen.buildTocHtml 风格的 h2-item 列表(都是 block)
  const html =
    '<ul><li class="wp-toc-h2-item" data-target="x" data-x="v&amp;w">' +
    '<a href="#x" class="wp-toc-h2-link">1 标题</a></li></ul>';
  const out = formatHtml(
    "<!DOCTYPE html><html><head></head><body>" + html + "</body></html>",
  );
  // <li> 是 block tag,会走 renderAttrs 路径
  assert.ok(
    out.includes("data-x=\"v&amp;w\""),
    "li 的 data-x 属性中 & 必须被 escAttr 转义\n输出:\n" + out,
  );
});

// ====== v2.0.1:无损格式化测试(用户要求:源代码视图格式化但不能修改代码) ======

test("formatHtml 不折叠 inline 元素的文本空白", () => {
  // 原文 <p>foo\nbar baz</p> 含 \n 和连续空格 — 之前 singleLine 会改成单空格,
  // 现在必须原样保留(可能跨行,这就是显示原文)
  const html = "<!DOCTYPE html><html><body><p>foo\nbar baz</p></body></html>";
  const out = formatHtml(html);
  // 必须含原始 "foo\nbar baz"(不是 "foo bar baz")
  assert.ok(
    out.includes("foo\nbar baz"),
    "inline 文本节点的 \\n 和连续空格必须原字符保留\n输出:\n" + out,
  );
  // 不能是折叠后的单空格
  assert.ok(
    !/foo bar baz/.test(out),
    "不能折叠成 'foo bar baz'(丢 \\n)\n输出:\n" + out,
  );
});

test("formatHtml 不修改 <script> 内容字符", () => {
  // script 内的换行 / 缩进 / 字符必须原样保留 — 不能 split + 重新 push
  const innerJs = "var x = 1;\n  var y = 2;\nvar z = 3;";
  const html = `<!DOCTYPE html><html><body><script>${innerJs}</script></body></html>`;
  const out = formatHtml(html);
  assert.ok(
    out.includes(innerJs),
    "script 内的 JS 必须字符级原样保留\n输出:\n" + out,
  );
});

test("formatHtml 不修改 <style> 内容字符", () => {
  const innerCss = "body { color: red;\n  margin: 0;\n  padding: 0; }";
  const html = `<!DOCTYPE html><html><head><style>${innerCss}</style></head><body><p>x</p></body></html>`;
  const out = formatHtml(html);
  assert.ok(
    out.includes(innerCss),
    "style 内的 CSS 必须字符级原样保留\n输出:\n" + out,
  );
});

test("formatHtml 不修改 <pre> 内容字符", () => {
  const innerPre = "line1\n  indented\n    more indent";
  const html = `<!DOCTYPE html><html><body><pre>${innerPre}</pre></body></html>`;
  const out = formatHtml(html);
  assert.ok(
    out.includes(innerPre),
    "pre 内容必须字符级原样保留\n输出:\n" + out,
  );
});

test("formatHtml 文本节点原字符保留(块容器内文本)", () => {
  // 块级容器直接包含文本节点(无 block 子元素),文本原样保留
  const html = "<!DOCTYPE html><html><body><div>line1\nline2</div></body></html>";
  const out = formatHtml(html);
  assert.ok(
    out.includes("line1\nline2"),
    "块级容器直接文本节点必须原字符\n输出:\n" + out,
  );
});

test("formatHtml idempotent — 再格式化一次结果不变", () => {
  // 第一遍格式化输出 → 第二遍格式化应该不变(说明格式化是稳定的"不动点")
  const html =
    "<!DOCTYPE html><html><head><title>x</title></head>" +
    "<body><div class=\"a\"><p>hello <b>world</b></p><ul><li>1</li><li>2</li></ul></div></body></html>";
  const out1 = formatHtml(html);
  const out2 = formatHtml(out1);
  assert.equal(
    out1,
    out2,
    "formatHtml 必须幂等 — 第二次格式化不能改变结果\n" +
      "--- out1 ---\n" +
      out1 +
      "\n--- out2 ---\n" +
      out2,
  );
});

test("formatHtml 输出除空白外不增不减字符(字符级 round-trip)", () => {
  // 验证 formatHtml 是"只调空白" — 去掉所有空白后,输出和原文字符必须相等
  const stripWs = (s: string) => s.replace(/\s+/g, "");
  const html =
    "<!DOCTYPE html><html><head><title>T</title></head>" +
    '<body><div class="a"><p>hello <b>world</b></p></div></body></html>';
  const out = formatHtml(html);
  // 字符级对比 — 去除所有空白字符后,两者应严格相等
  // (这里容忍一些 HTML 序列化的差异:title text "T" 等)
  assert.equal(
    stripWs(html),
    stripWs(out),
    "formatHtml 输出除去空白后必须与原文严格相等(字符级无损)\n" +
      "原文(stripped): " +
      stripWs(html) +
      "\n" +
      "输出(stripped): " +
      stripWs(out),
  );
});

// ====== v2.0.3:注释保留(TOC 标识依赖 HTML 注释) ======

test("formatHtml 保留 body 内 HTML 注释", () => {
  const html =
    "<!DOCTYPE html><html><body>" +
    "<!-- TOC start -->\n<div class=\"x\"><p>hi</p></div>\n<!-- TOC end -->" +
    "</body></html>";
  const out = formatHtml(html);
  assert.ok(
    out.includes("<!-- TOC start -->"),
    "body 注释必须保留\n输出:\n" + out,
  );
  assert.ok(
    out.includes("<!-- TOC end -->"),
    "body 注释必须保留\n输出:\n" + out,
  );
});

test("formatHtml 保留 head 内 HTML 注释(TOC 样式标记)", () => {
  const html =
    "<!DOCTYPE html><html><head>" +
    "<!-- WeavePage TOC: 样式 -->\n<style id=\"wp-toc-style\">.x{}</style>\n<!-- /WeavePage TOC -->" +
    "</head><body><p>x</p></body></html>";
  const out = formatHtml(html);
  assert.ok(
    out.includes("<!-- WeavePage TOC: 样式 -->"),
    "head 注释必须保留(TOC 样式标识)\n输出:\n" + out,
  );
  assert.ok(
    out.includes("<!-- /WeavePage TOC -->"),
    "head 闭合注释必须保留\n输出:\n" + out,
  );
});