// WeavePage 设计子菜单 — 单元测试
// 覆盖:DESIGNS 数据完整性 + getDesignById + applyDesignToShellHead + parseDesignId
// 跑法:pnpm tsx src/utils/designs.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DESIGNS,
  DEFAULT_DESIGN_ID,
  getDesignById,
  applyDesignToShellHead,
  parseDesignId,
} from "./designs";

test("DESIGNS 长度 = 8", () => {
  assert.equal(DESIGNS.length, 8);
});

test("DESIGNS id 唯一", () => {
  const ids = DESIGNS.map((d) => d.id);
  assert.equal(new Set(ids).size, 8);
});

test("DEFAULT_DESIGN_ID = null", () => {
  assert.equal(DEFAULT_DESIGN_ID, null);
});

test("getDesignById(null) 返 null", () => {
  assert.equal(getDesignById(null), null);
});

test("getDesignById 有效 id 返对象", () => {
  const d = getDesignById("modern-minimalist");
  assert.ok(d);
  assert.equal(d!.name, "现代简约");
});

test("getDesignById 无效 id 返 null", () => {
  assert.equal(getDesignById("not-a-design"), null);
});

test("applyDesignToShellHead id=null 移除所有 design style", () => {
  const head = `<head><style data-weavepage-design="foo">x</style><style data-weavepage-design="bar">y</style></head>`;
  const out = applyDesignToShellHead(head, null, null);
  assert.ok(!out.includes("data-weavepage-design"));
});

test("applyDesignToShellHead 有 toc style 时插在它之后", () => {
  const head = `<head><style id="wp-toc-style" data-weavepage-toc>TOC</style></head>`;
  const out = applyDesignToShellHead(head, "modern-minimalist", "BODY{}");
  // 顺序:toc style 在前,design style 在后
  const tocIdx = out.indexOf("wp-toc-style");
  const designIdx = out.indexOf("data-weavepage-design");
  assert.ok(tocIdx > -1 && designIdx > -1);
  assert.ok(designIdx > tocIdx, "design 必须在 toc 之后");
  // 注入的 style 包含 css
  assert.ok(out.includes("BODY{}"));
  assert.ok(out.includes('data-weavepage-design="modern-minimalist"'));
});

test("applyDesignToShellHead 无 toc style 时插到 </head> 之前", () => {
  const head = `<head><meta charset="utf-8"></head>`;
  const out = applyDesignToShellHead(head, "tech-dark", "BODY{}");
  const headClose = out.indexOf("</head>");
  const designIdx = out.indexOf("data-weavepage-design");
  assert.ok(designIdx > -1);
  assert.ok(designIdx < headClose, "design 必须在 </head> 之前");
});

test("applyDesignToShellHead 替换旧 design(不叠加)", () => {
  const head = `<head><style id="wp-toc-style">TOC</style><style data-weavepage-design="old">OLD</style></head>`;
  const out = applyDesignToShellHead(head, "new", "NEW_CSS");
  // 只剩一个 design style
  const matches = out.match(/data-weavepage-design="/g);
  assert.equal(matches?.length, 1);
  // 是新 id
  assert.ok(out.includes('data-weavepage-design="new"'));
  assert.ok(!out.includes('data-weavepage-design="old"'));
  assert.ok(!out.includes("OLD"));
});

test("parseDesignId 无 design 返 null", () => {
  assert.equal(parseDesignId("<head><style id=\"wp-toc-style\">X</style></head>"), null);
});

test("parseDesignId 取第一个", () => {
  const head = `<head><style data-weavepage-design="first">X</style><style data-weavepage-design="second">Y</style></head>`;
  assert.equal(parseDesignId(head), "first");
});

test("parseDesignId 有效 id", () => {
  const head = `<head><style data-weavepage-design="literary-scroll">X</style></head>`;
  assert.equal(parseDesignId(head), "literary-scroll");
});