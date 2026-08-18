// 单元测试:验证 paragraphSpacing 的预设/单位换算/inline style 合并行为
// 跑法:pnpm tsx src/utils/paragraphSpacing.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ptToPx, pxToPt,
  applyLineHeight, applyParagraphSpacing,
  readLineHeightFromStyle, readMarginFromStyle,
  LINE_HEIGHT_OPTIONS, PARAGRAPH_SPACING_OPTIONS,
} from "./paragraphSpacing";

test("ptToPx / pxToPt 互逆", () => {
  assert.equal(ptToPx(12), 16);
  assert.equal(ptToPx(0), 0);
  assert.equal(pxToPt(16), 12);
});

test("applyLineHeight 空 style 上加", () => {
  assert.equal(applyLineHeight("", 1.75), "line-height: 1.75");
});

test("applyLineHeight 已含 line-height 时替换", () => {
  assert.equal(applyLineHeight("color: red; line-height: 1.5", 2),
    "color: red; line-height: 2");
});

test("applyParagraphSpacing 合并 margin: 0 auto (段前 12pt)", () => {
  // margin: 0 auto  → top=0 right=auto bottom=0 left=auto  → 改 top → 16px auto 0 auto
  // 但 margin 简写输出:margin: 16px auto 0
  const result = applyParagraphSpacing("margin: 0 auto", "top", 12);
  assert.match(result, /margin:\s*16px\s+auto\s+0/);
});

test("applyParagraphSpacing 已含 margin-top 时替换", () => {
  assert.equal(applyParagraphSpacing("margin-top: 8px; color: red", "top", 12),
    "color: red; margin-top: 16px");
});

test("applyParagraphSpacing 段后空 style 上加", () => {
  assert.equal(applyParagraphSpacing("", "bottom", 6), "margin-bottom: 8px");
});

test("readLineHeightFromStyle 解析 number", () => {
  assert.equal(readLineHeightFromStyle("line-height: 1.75"), 1.75);
  assert.equal(readLineHeightFromStyle(""), "");
});

test("readMarginFromStyle 单位转 pt", () => {
  assert.equal(readMarginFromStyle("margin-top: 16px", "top"), 12);
  assert.equal(readMarginFromStyle("margin: 16px auto", "top"), 12);
  assert.equal(readMarginFromStyle("", "bottom"), "");
});

test("LINE_HEIGHT_OPTIONS 预设 1/1.15/1.5/1.75/2/2.5/3", () => {
  const values = LINE_HEIGHT_OPTIONS.map((o) => o.value);
  for (const v of ["1", "1.15", "1.5", "1.75", "2", "2.5", "3"]) {
    assert.ok(values.includes(v), `缺 ${v}`);
  }
});

test("PARAGRAPH_SPACING_OPTIONS 预设 0/6/12/18/24 pt", () => {
  const values = PARAGRAPH_SPACING_OPTIONS.map((o) => o.value);
  for (const v of ["0pt", "6pt", "12pt", "18pt", "24pt"]) {
    assert.ok(values.includes(v), `缺 ${v}`);
  }
});
