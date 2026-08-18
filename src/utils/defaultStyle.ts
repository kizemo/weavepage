// 默认样式:head 内嵌命名块的 parse / serialize / upsert
// 设计:单一命名块 id "weavepage-default-styles" 作为默认样式的唯一事实源;
//      选择器仅支持 p/h1-h6;属性仅支持白名单 8 项
export const STYLE_BLOCK_ID = "weavepage-default-styles";

export type Selector = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
export type DefaultStyleMap = Partial<Record<Selector, Record<string, string>>>;

export const SUPPORTED_SELECTORS: Selector[] = ["p", "h1", "h2", "h3", "h4", "h5", "h6"];
export const SUPPORTED_PROPS = [
  "font-family",
  "font-size",
  "color",
  "background-color",
  "text-align",
  "line-height",
  "margin-top",
  "margin-bottom",
] as const;

const SELECTOR_ORDER: Selector[] = ["p", "h1", "h2", "h3", "h4", "h5", "h6"];

// font-family 含空格/逗号且未自带引号时,自动加双引号(避免被解析成多条 family)
const quoteFamily = (v: string): string => {
  if (/[\s,]/.test(v) && !/^["'].*["']$/.test(v.trim())) return `"${v}"`;
  return v;
};

// 解析:拆 /* */ 注释 + 按规则分块
export function parseStyleBlock(css: string): DefaultStyleMap {
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  if (!cleaned) return {};
  const result: DefaultStyleMap = {};
  const ruleRe = /([\w-]+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(cleaned)) !== null) {
    const sel = m[1]!.toLowerCase() as Selector;
    if (!SUPPORTED_SELECTORS.includes(sel)) continue;
    const body = m[2]!;
    const props: Record<string, string> = {};
    body.split(";").forEach((decl) => {
      const idx = decl.indexOf(":");
      if (idx < 0) return;
      const name = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1).trim();
      if (!name || !value) return;
      if (!SUPPORTED_PROPS.includes(name)) return;
      props[name] = value;
    });
    if (Object.keys(props).length > 0) {
      result[sel] = { ...(result[sel] ?? {}), ...props };
    }
  }
  return result;
}

// 按白名单顺序输出属性(白名单外的属性追加到末尾保留)
const serializeProps = (props: Record<string, string>): string => {
  const ordered: string[] = [];
  for (const p of SUPPORTED_PROPS) {
    if (props[p] !== undefined) {
      const v = p === "font-family" ? quoteFamily(props[p]!) : props[p]!;
      ordered.push(`${p}: ${v}`);
    }
  }
  for (const k of Object.keys(props)) {
    if (!SUPPORTED_PROPS.includes(k as never)) ordered.push(`${k}: ${props[k]}`);
  }
  return ordered.join("; ");
};

export function serializeStyleBlock(map: DefaultStyleMap): string {
  const parts: string[] = [];
  for (const sel of SELECTOR_ORDER) {
    const props = map[sel];
    if (props && Object.keys(props).length > 0) {
      parts.push(`${sel} { ${serializeProps(props)} }`);
    }
  }
  return parts.join("\n");
}

// upsert:解析已有 css → 合并 selector 的 props → 重新序列化为完整 <style> 标签
export function upsertStyleBlock(
  currentBlockCss: string,
  selector: Selector,
  props: Record<string, string>,
): string {
  if (!SUPPORTED_SELECTORS.includes(selector)) {
    throw new Error(`unsupported selector: ${selector}`);
  }
  const map = parseStyleBlock(currentBlockCss);
  map[selector] = { ...(map[selector] ?? {}), ...props };
  // 过滤非白名单属性(白名单防御,防止调用方传脏数据)
  for (const k of Object.keys(map[selector]!)) {
    if (!SUPPORTED_PROPS.includes(k as never)) delete map[selector]![k];
  }
  const css = serializeStyleBlock(map);
  return `<style id="${STYLE_BLOCK_ID}">\n${css}\n</style>`;
}

const BLOCK_RE = new RegExp(`<style id="${STYLE_BLOCK_ID}">[\\s\\S]*?<\\/style>`, "g");

// 把命名块 upsert 到 shell.head 上,同时返回内部 CSS 给 headCss 用
export function upsertShellHead(
  head: string,
  selector: Selector,
  props: Record<string, string>,
): { head: string; headCss: string } {
  const existing = head.match(BLOCK_RE);
  const currentCss = existing ? existing[0].replace(/<\/?style[^>]*>/g, "") : "";
  const newBlock = upsertStyleBlock(currentCss, selector, props);
  let newHead: string;
  if (existing) {
    newHead = head.replace(BLOCK_RE, newBlock);
  } else {
    newHead = `${head}${newBlock}`;
  }
  // headCss:取出命名块内部 CSS(由 App.tsx 外面再包一层 <style>)
  const headCss = newBlock.replace(/<\/?style[^>]*>/g, "");
  return { head: newHead, headCss };
}

// Tiptap node.type.name → CSS selector
export function blockTypeToSelector(
  nodeType: string,
  attrs?: Record<string, unknown>,
): Selector | null {
  if (nodeType === "paragraph") return "p";
  if (nodeType === "heading") {
    const lvl = Number(attrs?.level);
    if (lvl >= 1 && lvl <= 6) return `h${lvl}` as Selector;
  }
  return null;
}
