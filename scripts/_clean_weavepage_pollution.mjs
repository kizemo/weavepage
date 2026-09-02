// v2.3.3:清理 WeavePage 编辑器污染的 HTML 文件
//   - 移除所有 blockSelectorScript 副本(每次 save 都被累积,直到 v2.3.1 修复)
//   - 移除 wp-hover-overlay / wp-selected-overlay div(被 input 事件捕获到 body 的 overlay)
//   - 去重 <base href> tag(保留第一个)
//   - 不会动用户的 <script> 内容 / 业务代码 / CSS
//
// 用法:node scripts/_clean_weavepage_pollution.mjs <file.html>

import { readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";

if (process.argv.length < 3) {
  console.error("用法: node scripts/_clean_weavepage_pollution.mjs <file.html>");
  process.exit(2);
}
const target = process.argv[2];
const backup = target + ".pre-clean.bak";

const raw = await readFile(target, "utf8");
const beforeBytes = raw.length;
const beforeLines = raw.split("\n").length;
await copyFile(target, backup);
console.log(`[backup] ${backup}`);

let cleaned = raw;

// 1. 移除所有 wp-overlay div(可能含嵌套 span badges,贪婪匹配到最近的 </div>)
const overlayRegex = /[ \t]*<div id="wp-(?:hover|selected)-overlay"[\s\S]*?<\/div>\s*\n?/g;
const overlayMatches = cleaned.match(overlayRegex) || [];
console.log(`[1] 移除 overlay div: ${overlayMatches.length} 个`);
cleaned = cleaned.replace(overlayRegex, "");

// 2. 移除所有 blockSelectorScript 副本
//    特征:script 内容含 "window.__wp_block_selector_installed"
const pollutedScriptRegex = /<script>\s*\(function\s*\(\)\s*\{[\s\S]*?window\.__wp_block_selector_installed[\s\S]*?\}\)\(\);\s*<\/script>\s*\n?/g;
const pollutedScripts = cleaned.match(pollutedScriptRegex) || [];
console.log(`[2] 移除 polluted script: ${pollutedScripts.length} 个`);
cleaned = cleaned.replace(pollutedScriptRegex, "");

// 3. 去重 <base href="...">(保留第一个)
//    也包括连续多个 base,以及 base 与 head 末尾的混合
const baseRegex = /<base\s+href="[^"]*">/g;
const allBases = cleaned.match(baseRegex) || [];
if (allBases.length > 1) {
  let firstReplaced = false;
  cleaned = cleaned.replace(baseRegex, () => {
    if (!firstReplaced) {
      firstReplaced = true;
      return allBases[0];
    }
    return ""; // 删掉后续
  });
  console.log(`[3] 去重 base tag: ${allBases.length} → 1`);
}

// 4. 清理连续多个空行(>2 个连续 → 2 个)
cleaned = cleaned.replace(/\n{4,}/g, "\n\n\n");

await writeFile(target, cleaned, "utf8");

const afterBytes = cleaned.length;
const afterLines = cleaned.split("\n").length;
console.log(`\n=== 总结 ===`);
console.log(`文件: ${target}`);
console.log(`大小: ${(beforeBytes/1024).toFixed(1)} KB → ${(afterBytes/1024).toFixed(1)} KB (减 ${((1 - afterBytes/beforeBytes)*100).toFixed(1)}%)`);
console.log(`行数: ${beforeLines} → ${afterLines} (减 ${beforeLines - afterLines} 行)`);
console.log(`备份: ${backup}`);
