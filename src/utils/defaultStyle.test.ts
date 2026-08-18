// 单元测试:验证 defaultStyle 的命名块 parse / upsert / shell.head 同步
// 跑法:pnpm tsx src/utils/defaultStyle.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseStyleBlock, serializeStyleBlock, upsertStyleBlock, upsertShellHead,
  blockTypeToSelector, SUPPORTED_SELECTORS, SUPPORTED_PROPS, STYLE_BLOCK_ID,
} from "./defaultStyle";

test("parse 空串得空对象", () => {
  assert.deepEqual(parseStyleBlock(""), {});
});

test("parse 单条 p 规则", () => {
  assert.deepEqual(parseStyleBlock("p { font-size: 16pt; line-height: 1.75 }"), {
    p: { "font-size": "16pt", "line-height": "1.75" },
  });
});

test("parse 多条规则按选择器分组", () => {
  const css = "p { font-size: 16pt } h2 { color: #2a4d8f }";
  assert.deepEqual(parseStyleBlock(css), {
    p: { "font-size": "16pt" },
    h2: { color: "#2a4d8f" },
  });
});

test("parse 注释被忽略(不抛错)", () => {
  const css = "/* hi */ p { font-size: 16pt; }";
  assert.deepEqual(parseStyleBlock(css), { p: { "font-size": "16pt" } });
});

test("parse 乱码得空对象", () => {
  assert.deepEqual(parseStyleBlock("@@@{{{"), {});
});

test("serialize 序列化顺序固定", () => {
  const css = serializeStyleBlock({
    h2: { color: "red" },
    p: { "font-size": "16pt", "line-height": "1.75" },
  });
  // p 在前,h2 在后;属性按白名单顺序
  const idxP = css.indexOf("p {");
  const idxH2 = css.indexOf("h2 {");
  assert.ok(idxP < idxH2);
  assert.ok(css.includes("font-size: 16pt"));
});

test("serialize font-family 含空格加引号", () => {
  const css = serializeStyleBlock({ p: { "font-family": "Segoe UI, sans-serif" } });
  assert.match(css, /font-family:\s*"Segoe UI, sans-serif"/);
});

test("upsertStyleBlock 新增属性合并", () => {
  const result = upsertStyleBlock("", "p", { "font-size": "16pt" });
  assert.match(result, new RegExp(`<style id="${STYLE_BLOCK_ID}">`));
  assert.match(result, /p\s*\{\s*font-size:\s*16pt\s*\}/);
});

test("upsertStyleBlock 同名属性后写覆盖", () => {
  const after1 = upsertStyleBlock("", "p", { "font-size": "14pt" });
  const after2 = upsertStyleBlock(after1, "p", { "font-size": "16pt" });
  assert.match(after2, /font-size:\s*16pt/);
  assert.doesNotMatch(after2, /font-size:\s*14pt/);
});

test("upsertStyleBlock 不同属性共存", () => {
  const after1 = upsertStyleBlock("", "p", { "font-size": "16pt" });
  const after2 = upsertStyleBlock(after1, "p", { "line-height": "1.75" });
  assert.match(after2, /font-size:\s*16pt/);
  assert.match(after2, /line-height:\s*1\.75/);
});

test("upsertStyleBlock 不识别选择器抛错", () => {
  assert.throws(() => upsertStyleBlock("", "div" as never, { color: "red" }));
});

test("upsertShellHead 同步 head 与 headCss", () => {
  const head = `<meta charset="UTF-8">`;
  const { head: newHead, headCss } = upsertShellHead(head, "p", { "font-size": "16pt" });
  assert.match(newHead, new RegExp(`<style id="${STYLE_BLOCK_ID}">`));
  assert.match(headCss, /p\s*\{\s*font-size:\s*16pt/);
});

test("upsertShellHead 替换已有命名块", () => {
  const old = `<style id="${STYLE_BLOCK_ID}">p { color: red }</style>`;
  const { head } = upsertShellHead(old, "p", { "font-size": "16pt" });
  assert.equal((head.match(new RegExp(`<style id="${STYLE_BLOCK_ID}">`, "g")) ?? []).length, 1);
  assert.match(head, /font-size:\s*16pt/);
});

test("blockTypeToSelector paragraph→p, heading level N→hN", () => {
  assert.equal(blockTypeToSelector("paragraph"), "p");
  assert.equal(blockTypeToSelector("heading", { level: 2 }), "h2");
  assert.equal(blockTypeToSelector("heading", { level: 6 }), "h6");
  assert.equal(blockTypeToSelector("listItem"), null);
});

test("SUPPORTED_SELECTORS 含 p / h1-h6", () => {
  for (const s of ["p", "h1", "h2", "h3", "h4", "h5", "h6"] as const) {
    assert.ok(SUPPORTED_SELECTORS.includes(s));
  }
});

test("SUPPORTED_PROPS 共 8 项", () => {
  assert.equal(SUPPORTED_PROPS.length, 8);
  for (const p of ["font-family", "font-size", "color", "background-color", "text-align", "line-height", "margin-top", "margin-bottom"]) {
    assert.ok(SUPPORTED_PROPS.includes(p));
  }
});
