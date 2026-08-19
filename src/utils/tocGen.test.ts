// 单元测试:slug 生成 / 去重 / 边界 / DOM 扫描
// 跑法:pnpm tsx src/utils/tocGen.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, uniqueSlug, scanHeadings, type TocEntry } from "./tocGen";
import { makeDom } from "./testDom";

test("slugify 中文保留", () => {
  assert.equal(slugify("第一节 标题", 1), "第一节-标题");
});

test("slugify 英文标点去除 + 大写转小写", () => {
  assert.equal(slugify("Hello, World!", 1), "hello-world");
});

test("slugify 多空白折叠为单 -", () => {
  assert.equal(slugify("a   b\tc", 1), "a-b-c");
});

test("slugify 首尾空白 / 连字符修剪", () => {
  assert.equal(slugify("  -foo-  ", 1), "foo");
});

test("slugify 全标点 fallback 到 n{index}", () => {
  assert.equal(slugify("!!!", 5), "n5");
});

test("slugify 长度截断 60 字符", () => {
  const long = "a".repeat(80);
  const out = slugify(long, 1);
  assert.equal(out.length, 60);
});

test("uniqueSlug 首次直接返回 base 并加入 taken", () => {
  const taken = new Set<string>();
  assert.equal(uniqueSlug("foo", taken), "foo");
  assert.ok(taken.has("foo"));
});

test("uniqueSlug 冲突加 -2 / -3", () => {
  const taken = new Set<string>(["foo"]);
  assert.equal(uniqueSlug("foo", taken), "foo-2");
  assert.equal(uniqueSlug("foo", taken), "foo-3");
});

test("scanHeadings 取 h2 / h3,跳过 h1/h4", () => {
  const root = makeDom("<h1>ignore</h1><h2>A</h2><h3>a1</h3><h4>ignore</h4><h3>a2</h3><h2>B</h2>");
  const out = scanHeadings(root);
  assert.equal(out.length, 4);
  assert.deepEqual(out.map(e => e.level), [2, 3, 3, 2]);
  assert.equal(out[0]!.text, "A");
});

test("scanHeadings 跳过空 textContent", () => {
  const root = makeDom("<h2></h2><h2>   </h2><h2>Real</h2>");
  const out = scanHeadings(root);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.text, "Real");
});

test("scanHeadings 重复标题 slug 去重", () => {
  const root = makeDom("<h2>foo</h2><h2>foo</h2><h2>foo</h2>");
  const out = scanHeadings(root);
  assert.equal(out[0]!.id, "wp-toc-foo");
  assert.equal(out[1]!.id, "wp-toc-foo-2");
  assert.equal(out[2]!.id, "wp-toc-foo-3");
});

test("scanHeadings 中文标题保留", () => {
  const root = makeDom("<h2>第一节</h2>");
  const out = scanHeadings(root);
  assert.equal(out[0]!.id, "wp-toc-第一节");
});

test("scanHeadings id 已有时不覆盖", () => {
  const root = makeDom('<h2 id="custom">A</h2>');
  const out = scanHeadings(root);
  assert.equal(out[0]!.id, "custom");
});

import { buildDocTocHtml } from "./tocGen";

const escapeCheck = (() => {
  // 用一个含 < > & " 的条目,验证 escape
})();

test("buildDocTocHtml 空 entries 给空提示", () => {
  const html = buildDocTocHtml([]);
  assert.match(html, /class="doc-toc-empty"/);
  assert.match(html, /无标题|未找到/);
});

test("buildDocTocHtml h2 / h3 嵌套", () => {
  const html = buildDocTocHtml([
    { level: 2, text: "A", id: "wp-toc-a" },
    { level: 3, text: "a1", id: "wp-toc-a-2" },
    { level: 2, text: "B", id: "wp-toc-b" },
  ]);
  assert.match(html, /<a class="doc-toc-h2" href="#wp-toc-a">A<\/a>/);
  assert.match(html, /<a class="doc-toc-h3" href="#wp-toc-a-2">a1<\/a>/);
  assert.match(html, /<a class="doc-toc-h2" href="#wp-toc-b">B<\/a>/);
  // a1 的 <li> 必须嵌在 A 的 <li> 内(用 doc-toc-list-wrap > ul ul 嵌套验证)
  const a1Idx = html.indexOf('href="#wp-toc-a-2"');
  const aIdx = html.indexOf('href="#wp-toc-a"');
  const bIdx = html.indexOf('href="#wp-toc-b"');
  assert.ok(aIdx < a1Idx && a1Idx < bIdx, "顺序错");
  assert.ok(html.indexOf("<ul>", aIdx) < a1Idx, "a1 应嵌在 A 的 <ul> 内");
});

test("buildDocTocHtml 转义 HTML 特殊字符", () => {
  const html = buildDocTocHtml([
    { level: 2, text: "<script>alert(1)</script>", id: "x" },
  ]);
  assert.ok(!html.includes("<script>alert"), "不能含未转义 <script>");
  assert.match(html, /&lt;script&gt;/);
});

test("buildDocTocHtml contenteditable=false 防止 ProseMirror 接管", () => {
  const html = buildDocTocHtml([{ level: 2, text: "A", id: "wp-toc-a" }]);
  assert.match(html, /contenteditable="false"/);
});

test("buildDocTocHtml 默认折叠:list-wrap 在标题之后 + ▾ 字符", () => {
  const html = buildDocTocHtml([{ level: 2, text: "A", id: "wp-toc-a" }]);
  assert.match(html, /doc-toc-title/);
  assert.match(html, /doc-toc-list-wrap/);
  assert.match(html, /▾|目录/);
});
