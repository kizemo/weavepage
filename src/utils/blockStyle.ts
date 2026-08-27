// 块容器样式 helper — Goal 2(容器样式编辑)+ ⭐ 提升 + Goal 1 定位
// 5 个纯函数:applyContainerStyle / parseContainerStyle / extractContainerStyle /
// upsertBlockStyleRule / locateBlock
//
// 设计要点:
// - inline style 字符串解析用统一的 parseInlineStyle / serializeInlineStyle
// - upsertBlockStyleRule 写入 `<style id="weavepage-block-style">` 命名块
//   (跟 defaultStyle 的 STYLE_BLOCK_ID 模式一致,inspector / 序列化时清晰)
// - locateBlock 三段式:tagName + nthOfType 主路径,textSample 副路径

export type ContainerProp =
  | "bgColor"
  | "borderColor"
  | "borderWidth"
  | "borderStyle"
  | "borderRadius"
  | "padding";

export type ContainerForm = Partial<Record<ContainerProp, string>>;

export interface BlockIdentity {
  tagName: string;
  nthOfType: number;
  textSample: string;
}

export const PROP_TO_CSS: Record<ContainerProp, string> = {
  bgColor: "background",
  borderColor: "border-color",
  borderWidth: "border-width",
  borderStyle: "border-style",
  borderRadius: "border-radius",
  padding: "padding",
};

const CSS_TO_PROP: Record<string, ContainerProp> = Object.fromEntries(
  Object.entries(PROP_TO_CSS).map(([k, v]) => [v, k as ContainerProp])
);

export const BLOCK_STYLE_ID = "weavepage-block-style";

const BLOCK_STYLE_RE = new RegExp(
  `<style id="${BLOCK_STYLE_ID}">[\\s\\S]*?<\\/style>`,
  "g"
);

// "color: red; padding: 10px" → { color: "red", padding: "10px" }
function parseInlineStyle(styleStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!styleStr) return result;
  styleStr.split(";").forEach((decl) => {
    const idx = decl.indexOf(":");
    if (idx < 0) return;
    const name = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (name && value) result[name] = value;
  });
  return result;
}

// { color: "red", padding: "10px" } → "color: red; padding: 10px"
function serializeInlineStyle(props: Record<string, string>): string {
  return Object.entries(props)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}

// 合并 inline style:保留其它属性,只改 prop 对应 CSS 属性;value 空字符串删除
export function applyContainerStyle(
  styleStr: string,
  prop: ContainerProp,
  value: string
): string {
  const cssProp = PROP_TO_CSS[prop];
  const props = parseInlineStyle(styleStr);
  if (value === "") {
    delete props[cssProp];
  } else {
    props[cssProp] = value;
  }
  return serializeInlineStyle(props);
}

// 反读 inline style → ContainerForm(用于块选变化时回填控件)
export function parseContainerStyle(styleStr: string): ContainerForm {
  const result: ContainerForm = {};
  const props = parseInlineStyle(styleStr);
  for (const [cssProp, value] of Object.entries(props)) {
    const prop = CSS_TO_PROP[cssProp];
    if (prop) result[prop] = value;
  }
  return result;
}

// 抽 CSS 属性对象 — 只保留 PROP_TO_CSS 列出的属性,返回 CSS 属性名(非 ContainerProp)
// 用于 ⭐ 提升:head CSS 规则用 CSS 属性名
export function extractContainerStyle(
  styleStr: string
): Record<string, string> {
  const result: Record<string, string> = {};
  const props = parseInlineStyle(styleStr);
  const cssPropNames = new Set(Object.values(PROP_TO_CSS));
  for (const [cssProp, value] of Object.entries(props)) {
    if (cssPropNames.has(cssProp)) result[cssProp] = value;
  }
  return result;
}

// upsert 到 `<style id="weavepage-block-style">` 命名块
// 已有 style block → 解析出当前所有 selector,合并同 selector 属性(后写覆盖)
// 无 style block → 创建一个
export function upsertBlockStyleRule(
  head: string,
  tagName: string,
  props: Record<string, string>
): string {
  const propsStr = Object.entries(props)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
  const newRule = `${tagName} { ${propsStr} }`;

  const existing = head.match(BLOCK_STYLE_RE);
  if (!existing) {
    return `${head}<style id="${BLOCK_STYLE_ID}">\n${newRule}\n</style>`;
  }

  const currentCss = existing[0].replace(/<\/?style[^>]*>/g, "");
  const ruleRe = /([\w-]+)\s*\{([^}]*)\}/g;
  const rules: Record<string, string[]> = {};
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(currentCss)) !== null) {
    rules[m[1]!] = m[2]!
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (!rules[tagName]) rules[tagName] = [];
  for (const [k, v] of Object.entries(props)) {
    // 同名属性覆盖(先删除再追加)
    rules[tagName] = rules[tagName]!.filter(
      (s) => !s.startsWith(`${k}:`)
    );
    rules[tagName]!.push(`${k}: ${v}`);
  }

  const merged = Object.entries(rules)
    .map(([sel, decls]) => `${sel} { ${decls.join("; ")} }`)
    .join("\n");
  return head.replace(
    BLOCK_STYLE_RE,
    `<style id="${BLOCK_STYLE_ID}">\n${merged}\n</style>`
  );
}

// 三段式定位 — 用于 iframe onLoad 后 selectedBlock 重新找到 DOM 节点
// 1. 主路径:querySelectorAll(tagName)[nthOfType]
// 2. fallback:textSample substring 匹配 startsWith
// 3. 都失败 → null(调用方决定是否清选中)
export function locateBlock(
  doc: Document,
  identity: BlockIdentity
): HTMLElement | null {
  const { tagName, nthOfType, textSample } = identity;
  const candidates = Array.from(doc.querySelectorAll(tagName));

  const direct = candidates[nthOfType];
  if (direct) return direct as HTMLElement;

  if (textSample) {
    const fallback = candidates.find((el) =>
      (el.textContent ?? "").startsWith(textSample)
    );
    return (fallback as HTMLElement) ?? null;
  }

  return null;
}