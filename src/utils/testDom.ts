// 测试专用 DOM helper — 包装 linkedom 的 parseHTML
// Node 24 不带 WHATWG DOMParser,这里用 linkedom 作 devDep
// linkedom 0.18 parseHTML 返回 Window-like 对象,需要完整 HTML 结构
// 才能正确把内容放进 body
import { parseHTML } from "linkedom";

export function makeDom(html: string): HTMLElement {
  const { document } = parseHTML(
    `<!DOCTYPE html><html><body><div>${html}</div></body></html>`
  );
  return document.body.firstElementChild as HTMLElement;
}