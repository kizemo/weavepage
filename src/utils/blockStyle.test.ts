// 单元测试:验证 blockStyle helper — applyContainerStyle / parseContainerStyle /
// extractContainerStyle / upsertBlockStyleRule / locateBlock
// 跑法:pnpm tsx src/utils/blockStyle.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyContainerStyle,
  parseContainerStyle,
  extractContainerStyle,
  upsertBlockStyleRule,
  locateBlock,
  BLOCK_STYLE_ID,
  PROP_TO_CSS,
  type ContainerProp,
  type ContainerForm,
  type BlockIdentity,
} from "./blockStyle";
import { makeDom } from "./testDom";

test("applyContainerStyle — 空 style 加 bgColor", () => {
  assert.equal(applyContainerStyle("", "bgColor", "red"), "background: red");
});

test("applyContainerStyle — 替换已有 bgColor", () => {
  assert.equal(
    applyContainerStyle("background: blue", "bgColor", "red"),
    "background: red"
  );
});

test("applyContainerStyle — 保留无关属性", () => {
  assert.equal(
    applyContainerStyle("color: black; padding: 10px", "bgColor", "red"),
    "color: black; padding: 10px; background: red"
  );
});

test("applyContainerStyle — value 为空字符串时移除属性", () => {
  assert.equal(
    applyContainerStyle("background: red; color: black", "bgColor", ""),
    "color: black"
  );
});

test("applyContainerStyle — value 为空字符串时纯空 style 也合法", () => {
  assert.equal(applyContainerStyle("", "bgColor", ""), "");
});

test("PROP_TO_CSS — 6 项映射正确", () => {
  assert.equal(PROP_TO_CSS.bgColor, "background");
  assert.equal(PROP_TO_CSS.borderColor, "border-color");
  assert.equal(PROP_TO_CSS.borderWidth, "border-width");
  assert.equal(PROP_TO_CSS.borderStyle, "border-style");
  assert.equal(PROP_TO_CSS.borderRadius, "border-radius");
  assert.equal(PROP_TO_CSS.padding, "padding");
});

test("parseContainerStyle — 空 style 得空对象", () => {
  assert.deepEqual(parseContainerStyle(""), {});
});

test("parseContainerStyle — 从 background 简写反读 bgColor", () => {
  assert.deepEqual(parseContainerStyle("background: red"), { bgColor: "red" });
});

test("parseContainerStyle — 6 项全反读", () => {
  const style =
    "background: red; border-color: blue; border-width: 2px; border-style: solid; border-radius: 4px; padding: 8px";
  assert.deepEqual(parseContainerStyle(style), {
    bgColor: "red",
    borderColor: "blue",
    borderWidth: "2px",
    borderStyle: "solid",
    borderRadius: "4px",
    padding: "8px",
  });
});

test("parseContainerStyle — 跟 applyContainerStyle roundtrip", () => {
  const original: ContainerForm = {
    bgColor: "red",
    borderColor: "blue",
    padding: "8px",
  };
  let style = "";
  for (const [k, v] of Object.entries(original)) {
    style = applyContainerStyle(style, k as ContainerProp, v!);
  }
  assert.deepEqual(parseContainerStyle(style), original);
});

test("parseContainerStyle — 忽略非 ContainerProp 属性", () => {
  assert.deepEqual(parseContainerStyle("color: black; background: red"), {
    bgColor: "red",
  });
});

test("extractContainerStyle — 空 style 得空对象", () => {
  assert.deepEqual(extractContainerStyle(""), {});
});

test("extractContainerStyle — 用 CSS 属性名而非 ContainerProp", () => {
  assert.deepEqual(extractContainerStyle("background: red"), {
    background: "red",
  });
  assert.deepEqual(extractContainerStyle("border-color: blue"), {
    "border-color": "blue",
  });
});

test("extractContainerStyle — 忽略非 ContainerProp 属性", () => {
  assert.deepEqual(
    extractContainerStyle("color: black; background: red"),
    { background: "red" }
  );
});

test("upsertBlockStyleRule — 无 style block 时新建", () => {
  const result = upsertBlockStyleRule("", "p", { background: "red" });
  assert.match(result, new RegExp(`<style id="${BLOCK_STYLE_ID}">`));
  assert.match(result, /p\s*\{\s*background:\s*red\s*\}/);
});

test("upsertBlockStyleRule — 更新已有 style block", () => {
  const head = `<style id="${BLOCK_STYLE_ID}">p { color: black }</style>`;
  const result = upsertBlockStyleRule(head, "p", { background: "red" });
  assert.match(result, /p\s*\{\s*color:\s*black;\s*background:\s*red\s*\}/);
});

test("upsertBlockStyleRule — 不同 tagName 新建 selector", () => {
  const head = `<style id="${BLOCK_STYLE_ID}">p { color: black }</style>`;
  const result = upsertBlockStyleRule(head, "h1", { background: "red" });
  assert.match(result, /p\s*\{\s*color:\s*black\s*\}/);
  assert.match(result, /h1\s*\{\s*background:\s*red\s*\}/);
});

test("upsertBlockStyleRule — 同 selector 合并属性", () => {
  const head = `<style id="${BLOCK_STYLE_ID}">p { color: black; padding: 8px }</style>`;
  const result = upsertBlockStyleRule(head, "p", { background: "red" });
  assert.match(
    result,
    /p\s*\{\s*color:\s*black;\s*padding:\s*8px;\s*background:\s*red\s*\}/
  );
});

test("locateBlock — 按 tagName + nthOfType 命中", () => {
  const root = makeDom('<p>a</p><p>b</p>');
  const doc = root.ownerDocument!;
  const identity: BlockIdentity = {
    tagName: "p",
    nthOfType: 1,
    textSample: "b",
  };
  const el = locateBlock(doc, identity);
  assert.equal(el?.textContent, "b");
});

test("locateBlock — nthOfType 越界返回 null", () => {
  const root = makeDom("<p>a</p>");
  const doc = root.ownerDocument!;
  const identity: BlockIdentity = {
    tagName: "p",
    nthOfType: 5,
    textSample: "x",
  };
  assert.equal(locateBlock(doc, identity), null);
});

test("locateBlock — nthOfType 失效时 fallback textSample", () => {
  const root = makeDom("<p>hello world</p><p>foo bar</p>");
  const doc = root.ownerDocument!;
  const identity: BlockIdentity = {
    tagName: "p",
    nthOfType: 99,
    textSample: "foo",
  };
  const el = locateBlock(doc, identity);
  assert.equal(el?.textContent, "foo bar");
});

test("locateBlock — 双失败返回 null", () => {
  const root = makeDom("<p>hello</p>");
  const doc = root.ownerDocument!;
  const identity: BlockIdentity = {
    tagName: "p",
    nthOfType: 99,
    textSample: "missing",
  };
  assert.equal(locateBlock(doc, identity), null);
});