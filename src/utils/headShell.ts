// shell.head / shell.headCss 的辅助函数(页面背景色)
//
// 设计:背景色用单独命名块 <style id="weavepage-body-bg"> 包住,跟默认样式
// 命名块(weavepage-default-styles)互不影响;被 App.tsx 的 <style>{scopedCss(...)}
// 包裹后 body { ... } 改名为 .editor-body,所以同时作用于编辑区与预览区

const BODY_BG_ID = "weavepage-body-bg";
const BODY_BG_RE = new RegExp(
  `<style id="${BODY_BG_ID}">[^<]*<\\/style>`,
  "g",
);
const BODY_BG_RULE_RE = /body\s*\{\s*background-color\s*:\s*[^;}]+;?\s*\}/g;

export function applyBodyBackground(
  head: string,
  headCss: string,
  hex: string,
): { head: string; headCss: string } {
  const css = `body { background-color: ${hex} }`;
  const tag = `<style id="${BODY_BG_ID}">${css}</style>`;

  // head 替换或追加命名块
  let newHead: string;
  if (BODY_BG_RE.test(head)) {
    newHead = head.replace(BODY_BG_RE, tag);
  } else if (head.includes("</head>")) {
    newHead = head.replace("</head>", `${tag}</head>`);
  } else {
    newHead = head + tag;
  }

  // headCss 替换或追加 body 规则(避免重复)
  const newHeadCss = `${headCss.replace(BODY_BG_RULE_RE, "").trim()}\n${css}`.trim();

  return { head: newHead, headCss: newHeadCss };
}

// 给 RibbonHome 当前值高亮用
export function extractBodyBackground(headCss: string): string {
  const m = headCss.match(BODY_BG_RULE_RE);
  if (!m) return "";
  const rule = m[0];
  const hex = rule.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/);
  return hex ? hex[0] : "";
}
