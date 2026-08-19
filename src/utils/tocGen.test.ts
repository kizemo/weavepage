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

import { assignHeadingIds, clearHeadingIds } from "./tocGen";
import type { Editor } from "@tiptap/core";

// Mock Editor — 模拟 PM transaction 写入路径
// assignHeadingIds 现在通过 editor.chain().focus().command(({ tr }) => ...).run()
// 走 PM transaction,所以测试必须用 mock editor 记录 setNodeMarkup 调用
function makeMockEditor(root: HTMLElement): {
  editor: Editor;
  ops: Array<{ pos: number; attrs: Record<string, unknown> }>;
  getAttrsAt: (pos: number) => Record<string, unknown> | undefined;
} {
  const ops: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
  // 与 assignHeadingIds 同步过滤空 textContent 标题(否则 index 错位)
  const nodes = Array.from(root.querySelectorAll("h2, h3")).filter(
    (el) => (el.textContent ?? "").trim() !== ""
  );
  // 给每个非空 heading 分配唯一 pos;同时预填当前 attrs(从 DOM id 读)
  const elToPos = new Map<HTMLElement, number>();
  const attrsAtPos = new Map<number, Record<string, unknown>>();
  nodes.forEach((el, i) => {
    elToPos.set(el, i);
    attrsAtPos.set(i, { id: el.id || null });
  });

  const mock = {
    chain: () => ({
      focus: () => ({
        command: (cb: (args: { tr: unknown }) => void) => ({
          run: () => {
            const tr = {
              doc: {
                nodeAt: (pos: number) => {
                  const attrs = attrsAtPos.get(pos);
                  if (!attrs) return null;
                  return { attrs: { ...attrs } };
                },
              },
              setNodeMarkup: (pos: number, _type: unknown, attrs: Record<string, unknown>) => {
                attrsAtPos.set(pos, { ...attrs });
                ops.push({ pos, attrs: { ...attrs } });
              },
            };
            cb({ tr });
          },
        }),
      }),
    }),
    view: {
      posAtDOM: (el: HTMLElement, _offset: number) => {
        const pos = elToPos.get(el);
        if (pos === undefined) {
          // 模拟真实 PM 的行为 — detached / 找不到就抛错,让 try/catch 兜住
          throw new Error("MockEditor.posAtDOM: element not registered");
        }
        return pos;
      },
    },
  };

  return {
    editor: mock as unknown as Editor,
    ops,
    getAttrsAt: (pos) => {
      const a = attrsAtPos.get(pos);
      return a ? { ...a } : undefined;
    },
  };
}

test("assignHeadingIds 把 entry.id 通过 PM transaction 写到对应 h2", () => {
  const root = makeDom("<h2>A</h2><h2>B</h2>");
  const { editor, ops } = makeMockEditor(root);
  assignHeadingIds(editor, root, [
    { level: 2, text: "A", id: "wp-toc-a" },
    { level: 2, text: "B", id: "wp-toc-b" },
  ]);
  assert.equal(ops.length, 2);
  assert.equal(ops[0]!.attrs.id, "wp-toc-a");
  assert.equal(ops[1]!.attrs.id, "wp-toc-b");
});

test("assignHeadingIds 已有同 id 时跳过 (不发 transaction)", () => {
  const root = makeDom('<h2 id="wp-toc-a">A</h2>');
  const { editor, ops } = makeMockEditor(root);
  assignHeadingIds(editor, root, [{ level: 2, text: "A", id: "wp-toc-a" }]);
  // 关键断言:当 node.attrs.id === entry.id 时不应再 setNodeMarkup
  assert.equal(ops.length, 0);
});

test("assignHeadingIds id 变化时覆盖 (PM transaction 写新 attrs)", () => {
  const root = makeDom('<h2 id="wp-toc-old">A</h2>');
  const { editor, ops, getAttrsAt } = makeMockEditor(root);
  assignHeadingIds(editor, root, [{ level: 2, text: "A", id: "wp-toc-new" }]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0]!.attrs.id, "wp-toc-new");
  // 关键断言:PM 节点 attrs 现在是新 id
  assert.equal(getAttrsAt(0)?.id, "wp-toc-new");
});

test("clearHeadingIds 只清 wp-toc- 前缀", () => {
  const root = makeDom('<h2 id="wp-toc-a">A</h2><h2 id="custom-id">B</h2>');
  clearHeadingIds(root);
  assert.equal(root.querySelectorAll("h2")[0]!.id, "");
  assert.equal(root.querySelectorAll("h2")[1]!.id, "custom-id");
});

test("assignHeadingIds 与 scanHeadings index 对齐(空标题不偏移)", () => {
  const root = makeDom("<h2></h2><h2>Real</h2><h3>Sub</h3><h2></h2><h2>Last</h2>");
  const { editor, ops } = makeMockEditor(root);
  const entries = scanHeadings(root);
  assignHeadingIds(editor, root, entries);
  assert.equal(entries.length, 3);
  // 3 个非空标题对应 3 次 setNodeMarkup,顺序与 scanHeadings 一致
  assert.equal(ops.length, 3);
  assert.equal(ops[0]!.attrs.id, "wp-toc-real");
  assert.equal(ops[1]!.attrs.id, "wp-toc-sub");
  assert.equal(ops[2]!.attrs.id, "wp-toc-last");
});

// 回归保护 — Task 12 review 发现的 load-bearing bug:
// 直接 el.setAttribute("id", ...) 不会同步到 PM node.attrs,
// 导致 editor.getHTML() 输出旧 id,saved HTML / 预览锚点失效。
// 现在 assignHeadingIds 走 PM transaction.setNodeMarkup,
// editor.getHTML() 拿到的就是新 id(等价于 mock 中 getAttrsAt(pos).id)。
test("assignHeadingIds 修复回归:PM 节点 attrs 同步为新 id(等价于 getHTML 输出)", () => {
  const root = makeDom('<h2 id="wp-toc-old">A</h2>');
  const { editor, ops, getAttrsAt } = makeMockEditor(root);
  // 模拟:scanHeadings 重新算 id(因为用户改了标题文本),
  // 现在分配新 id "wp-toc-new",但 DOM 上的 id 仍是旧的
  const newEntries = [{ level: 2 as const, text: "A updated", id: "wp-toc-new" }];
  assignHeadingIds(editor, root, newEntries);
  // 断言 1:发起了 PM transaction(关键路径)
  assert.equal(ops.length, 1);
  // 断言 2:PM node.attrs 现在是新 id — 这就是 editor.getHTML() 会序列化的内容
  assert.equal(getAttrsAt(0)?.id, "wp-toc-new");
  // 断言 3:与旧的 DOM-only 路径不同(el.setAttribute 不会反映到 node.attrs)
  // — 这个测试如果回退到 setAttribute,getAttrsAt(0).id 仍是 "wp-toc-old"
  assert.notEqual(getAttrsAt(0)?.id, "wp-toc-old");
});
