// 单元测试:slug 生成 / 去重 / 边界
// 跑法:pnpm tsx src/utils/tocGen.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, uniqueSlug } from "./tocGen";

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
