// 段落行距 / 段前 / 段后 的预设与 inline style 合并工具
// 设计:操作只基于传入的 style 字符串(不读 computedStyle / 不触 DOM),
//      返回新串供调用方决定是否写回 DOM
export const LINE_HEIGHT_OPTIONS = [
  { label: "1.0", value: "1" },
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "1.75", value: "1.75" },
  { label: "2.0", value: "2" },
  { label: "2.5", value: "2.5" },
  { label: "3.0", value: "3" },
];

export const PARAGRAPH_SPACING_OPTIONS = [
  { label: "0", value: "0pt" },
  { label: "6", value: "6pt" },
  { label: "12", value: "12pt" },
  { label: "18", value: "18pt" },
  { label: "24", value: "24pt" },
];

// 1pt = 4/3 px(96dpi)。toFixed 在边缘会被 Math.round 修正
export const ptToPx = (pt: number): number => Math.round((pt * 4) / 3);
export const pxToPt = (px: number): number => Math.round((px * 3) / 4);

// 把已有 style 解析成 prop->value 字典(保序)
const parseStyle = (s: string): { props: [string, string][] } => {
  const props: [string, string][] = [];
  s.split(";").forEach((decl) => {
    const idx = decl.indexOf(":");
    if (idx < 0) return;
    const name = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (name) props.push([name, value]);
  });
  return { props };
};

const serializeStyle = (props: [string, string][]): string =>
  props.filter(([, v]) => v !== "").map(([k, v]) => `${k}: ${v}`).join("; ");

// 移除同名(大小写不敏感)后追加到末尾 → 新值永远出现在所有原有声明之后
const setProp = (
  props: [string, string][],
  name: string,
  value: string,
): [string, string][] => {
  const lower = name.toLowerCase();
  const filtered = props.filter(([k]) => k.toLowerCase() !== lower);
  return [...filtered, [name, value]];
};

export function applyLineHeight(style: string, value: number): string {
  const { props } = parseStyle(style);
  return serializeStyle(setProp(props, "line-height", String(value)));
}

// margin token:数字段或关键字 auto
type MarginToken = number | "auto";

// margin 简写解析:auto 用关键字保留,em/rem/% 视为 null 兜底
const parseMarginShorthand = (
  value: string,
): [MarginToken, MarginToken, MarginToken, MarginToken] | null => {
  const parseToken = (p: string): MarginToken | null => {
    if (p === "auto") return "auto";
    const m = p.match(/^(-?\d+(?:\.\d+)?)(px|pt|em|rem|%)?$/i);
    if (!m) return null;
    const num = parseFloat(m[1]!);
    const unit = (m[2] ?? "px").toLowerCase();
    if (unit === "em" || unit === "rem" || unit === "%") return null;
    return unit === "pt" ? ptToPx(num) : num;
  };
  const parts = value.trim().split(/\s+/).map(parseToken);
  if (parts.some((p) => p === null)) return null;
  const safe = parts as MarginToken[];
  if (safe.length === 1) return [safe[0]!, safe[0]!, safe[0]!, safe[0]!];
  if (safe.length === 2) return [safe[0]!, safe[1]!, safe[0]!, safe[1]!];
  if (safe.length === 3) return [safe[0]!, safe[1]!, safe[2]!, safe[1]!];
  if (safe.length === 4) return [safe[0]!, safe[1]!, safe[2]!, safe[3]!];
  return null;
};

const fmtMarginToken = (v: MarginToken): string =>
  v === "auto" ? "auto" : `${v}px`;

// 把 margin 四值序列化为最短的简写(left=right 用 3 段,否则 4 段)
const formatMargin = (vals: [MarginToken, MarginToken, MarginToken, MarginToken]): string => {
  if (vals[1] === vals[3]) {
    return `${fmtMarginToken(vals[0])} ${fmtMarginToken(vals[1])} ${fmtMarginToken(vals[2])}`;
  }
  return `${fmtMarginToken(vals[0])} ${fmtMarginToken(vals[1])} ${fmtMarginToken(vals[2])} ${fmtMarginToken(vals[3])}`;
};

export function applyParagraphSpacing(style: string, side: "top" | "bottom", ptValue: number): string {
  const { props } = parseStyle(style);
  const px = ptToPx(ptValue);
  const sideKey = `margin-${side}` as const;

  // 找已有 margin / margin-<side>
  const marginIdx = props.findIndex(([k]) => k.toLowerCase() === "margin");

  // 已有 margin 简写 → 解析合并后回写为简写形式(优先)
  if (marginIdx >= 0) {
    const parsed = parseMarginShorthand(props[marginIdx]![1]);
    if (parsed) {
      const next: [MarginToken, MarginToken, MarginToken, MarginToken] = [...parsed];
      if (side === "top") next[0] = px;
      else next[2] = px;
      const filtered = props.filter((_, i) => i !== marginIdx);
      // 直接 push 新 margin 简写到末尾(避免 sideKey 单写吞并简写语义)
      return serializeStyle([...filtered, ["margin", formatMargin(next)]]);
    }
    // 解析失败:移除 margin 简写,逐项补全(只用 sideKey 单项)
    const filtered = props.filter((_, i) => i !== marginIdx);
    return serializeStyle([...filtered, [sideKey, `${px}px`]]);
  }

  // 普通情况:filter + push sideKey
  return serializeStyle(setProp(props, sideKey, `${px}px`));
}

export function readLineHeightFromStyle(style: string): number | "" {
  const m = style.match(/(?:^|;)\s*line-height\s*:\s*([^;]+)/i);
  if (!m) return "";
  const v = m[1]!.trim();
  const n = parseFloat(v);
  return isFinite(n) && n > 0 ? n : "";
}

const readPx = (raw: string): number | null => {
  const m = raw.match(/(-?\d+(?:\.\d+)?)\s*(px|pt)/i);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  if (m[2]!.toLowerCase() === "pt") return ptToPx(n);
  return n;
};

export function readMarginFromStyle(style: string, side: "top" | "bottom"): number | "" {
  // 优先 margin-<side>
  const direct = style.match(new RegExp(`(?:^|;)\\s*margin-${side}\\s*:\\s*([^;]+)`, "i"));
  if (direct) {
    const px = readPx(direct[1]!);
    return px === null ? "" : pxToPt(px);
  }
  // 退回 margin 简写
  const shorthand = style.match(/(?:^|;)\s*margin\s*:\s*([^;]+)/i);
  if (shorthand) {
    const parsed = parseMarginShorthand(shorthand[1]!);
    if (!parsed) return "";
    const px = side === "top" ? parsed[0] : parsed[2];
    return typeof px === "number" ? pxToPt(px) : "";
  }
  return "";
}
