// 单元测试:slug / scan / assignHeadingIds / DOM heading id
// 跑法:pnpm tsx src/utils/tocGen.test.ts
//
// buildDocTocHtml / enableDocToc / regenDocToc / migrateLegacyTocParagraphs
// 已在 v0.1.13 第二十六轮删除(TOC UI 改为 React Portal TocFloating.tsx),
// 所以这里不再测 inline TOC 输出。
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

import { assignHeadingIds, clearHeadingIds, buildTocHtml } from "./tocGen";
import type { Editor } from "@tiptap/core";

// Mock Editor — 模拟 PM transaction 写入路径
// 第二十六轮:assignHeadingIds 改用 state.doc.descendants + editor.view.nodeDOM 找 heading
// 不用 posAtDOM(对 doc 第一个 heading 会失败)
function makeMockEditor(root: HTMLElement): {
  editor: Editor;
  ops: Array<{ pos: number; attrs: Record<string, unknown> }>;
  getAttrsAt: (pos: number) => Record<string, unknown> | undefined;
} {
  const ops: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
  const nodes = Array.from(root.querySelectorAll("h2, h3")).filter(
    (el) => (el.textContent ?? "").trim() !== ""
  );
  // 用 content position(i+1)作 key,对应 setNodeMarkup(pos+1)
  const elToPos = new Map<HTMLElement, number>();
  const attrsAtPos = new Map<number, Record<string, unknown>>();
  nodes.forEach((el, i) => {
    elToPos.set(el, i);
    attrsAtPos.set(i + 1, { id: el.id || null });
  });

  const mock = {
    chain: () => ({
      focus: () => ({
        command: (cb: (args: { tr: unknown; state: unknown }) => void) => ({
          run: () => {
            const tr = {
              doc: {
                nodeAt: (pos: number) => {
                  const attrs = attrsAtPos.get(pos);
                  if (!attrs) return null;
                  return { attrs: { ...attrs } };
                },
                descendants: (callback: (node: { type: { name: string } }, pos: number) => boolean | void) => {
                  for (let i = 0; i < nodes.length; i++) {
                    const el = nodes[i]!;
                    const result = callback(
                      { type: { name: "heading" } },
                      i,
                    );
                    if (result === false) break;
                  }
                },
              },
              setNodeMarkup: (pos: number, _type: unknown, attrs: Record<string, unknown>) => {
                attrsAtPos.set(pos, { ...attrs });
                ops.push({ pos, attrs: { ...attrs } });
              },
            };
            // state.doc 跟 tr.doc 共用同一份
            const state = { doc: tr.doc };
            cb({ tr, state });
          },
        }),
      }),
    }),
    view: {
      // 返回 heading 索引 i 对应的 DOM 元素(elToPos key 是 i)
      nodeDOM: (pos: number) => {
        // mock 里 descendants 给的是 heading index,nodeDOM 反向
        const i = pos; // pos = heading index
        return nodes[i] as HTMLElement | undefined;
      },
    },
  };

  return {
    editor: mock as unknown as Editor,
    ops,
    getAttrsAt: (headingIdx) => {
      const a = attrsAtPos.get(headingIdx + 1);
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
  assert.equal(ops.length, 3);
  assert.equal(ops[0]!.attrs.id, "wp-toc-real");
  assert.equal(ops[1]!.attrs.id, "wp-toc-sub");
  assert.equal(ops[2]!.attrs.id, "wp-toc-last");
});

// 回归保护 — Task 12 review 发现的 load-bearing bug:
// 直接 el.setAttribute("id", ...) 不会同步到 PM node.attrs,
// 导致 editor.getHTML() 输出旧 id,saved HTML / 预览锚点失效。
// 现在 assignHeadingIds 走 PM transaction.setNodeMarkup + content position(pos+1),
// 即使对 doc 第一个 heading(之前 posAtDOM(0) → nodeAt(0)=doc → 失败)也 work。
test("assignHeadingIds 修复回归:PM 节点 attrs 同步为新 id(doc 第一个 heading)", () => {
  // doc 第一个 heading(模拟 posAtDOM 返回 0 的真实场景)
  const root = makeDom('<h2 id="wp-toc-old">First</h2>');
  const { editor, ops, getAttrsAt } = makeMockEditor(root);
  assignHeadingIds(editor, root, [{ level: 2, text: "First", id: "wp-toc-new" }]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0]!.attrs.id, "wp-toc-new");
  assert.equal(getAttrsAt(0)?.id, "wp-toc-new");
  assert.notEqual(getAttrsAt(0)?.id, "wp-toc-old");
});

// ============================================================================
// v0.1.13 第三十轮:buildTocHtml(只输出 class 结构,无 inline style)
// CSS 全部由 buildTocStyleTag() 注入到 <head> 中
test("buildTocHtml 含 wrap + button + panel + h2-item + h3-submenu(作为 wrap 直接子节点) + script", () => {
  const html = buildTocHtml([
    { level: 2, text: "第一章", id: "wp-toc-a" },
    { level: 3, text: "1.1 节", id: "wp-toc-a-2" },
    { level: 2, text: "第二章", id: "wp-toc-b" },
  ]);
  // 第三十轮:无 inline style 元素 (style 属性)
  assert.doesNotMatch(html, /style="/);
  // wrap div + class
  assert.match(html, /<div class="wp-toc-floating-wrap">/);
  assert.match(html, /<button class="wp-toc-floating-btn" type="button">/);
  // panel
  assert.match(html, /<div class="wp-toc-floating-panel"/);
  assert.match(html, /<h3 class="wp-toc-panel-header">/);
  // h2-item 含 data-target(无内嵌 submenu,submenu 移到 wrap 下)
  assert.match(html, /<li class="wp-toc-h2-item" data-target="wp-toc-a"/);
  assert.match(html, /<a href="#wp-toc-a" class="wp-toc-h2-link">/);
  // 第二章没有 h3,所以没有对应 submenu
  assert.match(html, /<li class="wp-toc-h2-item" data-target="wp-toc-b">/);
  // h3-submenu 是 wrap 的直接子节点(panel 之后),用 data-for 关联
  assert.match(html, /<\/div><div class="wp-toc-h3-submenu" data-for="wp-toc-a" data-h3-ids='\["wp-toc-a-2"\]'/);
  assert.match(html, /<ul class="wp-toc-h3-submenu-list"><\/ul>/);
  // script 包含 hover/click 处理
  assert.match(html, /<script>[\s\S]*wrap\.addEventListener\('click'/);
  // script 内不再有 style.display 修改(全部走 class)
  assert.doesNotMatch(html, /\.style\.display/);
});

test("buildTocHtml 空 entries 也生成有效 HTML(无 h2 list 但 wrap 结构存在)", () => {
  const html = buildTocHtml([]);
  // wrap 结构
  assert.match(html, /<div class="wp-toc-floating-wrap">/);
  assert.match(html, /<div class="wp-toc-floating-panel"/);
  // h2-list 为空
  assert.match(html, /<ul class="wp-toc-h2-list"><\/ul>/);
  // 没有 submenu
  assert.doesNotMatch(html, /class="wp-toc-h3-submenu"/);
  assert.match(html, /<script>/);
});

// buildTocStyleTag / removeTocStyleTag / hasTocStyleTag
import { buildTocStyleTag, removeTocStyleTag, hasTocStyleTag } from "./tocGen";
test("buildTocStyleTag 生成 <style id=\"wp-toc-style\"> 标签", () => {
  const tag = buildTocStyleTag();
  assert.match(tag, /<style id="wp-toc-style">/);
  assert.match(tag, /wp-toc-floating-wrap/);
  assert.match(tag, /<\/style>$/);
});
test("removeTocStyleTag 从 head 字符串里移除 wp-toc-style 块", () => {
  const head = "<meta><style id='wp-toc-style'>body{}</style><title>t</title>";
  const out = removeTocStyleTag(head);
  assert.doesNotMatch(out, /wp-toc-style/);
  assert.match(out, /<meta>/);
  assert.match(out, /<title>t<\/title>/);
});
test("hasTocStyleTag 检测 head 是否含 wp-toc-style", () => {
  assert.equal(hasTocStyleTag("<style id='wp-toc-style'>x</style>"), true);
  assert.equal(hasTocStyleTag("<style>x</style>"), false);
  assert.equal(hasTocStyleTag(""), false);
});