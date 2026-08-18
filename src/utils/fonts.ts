export const FONT_FAMILIES = [
  { label: "默认字体", value: "" },
  { label: "宋体", value: "SimSun, serif" },
  { label: "黑体", value: "SimHei, sans-serif" },
  { label: "微软雅黑", value: "Microsoft YaHei, sans-serif" },
  { label: "楷体", value: "KaiTi, serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Consolas", value: "Consolas, monospace" },
] as const;

export const FONT_SIZES = [
  { label: "默认", value: "" },
  { label: "9", value: "9pt" },
  { label: "10", value: "10pt" },
  { label: "12", value: "12pt" },
  { label: "14", value: "14pt" },
  { label: "16", value: "16pt" },
  { label: "18", value: "18pt" },
  { label: "24", value: "24pt" },
  { label: "36", value: "36pt" },
] as const;

export const TEXT_COLORS = [
  "#000000", "#444444", "#666666", "#999999",
  "#c00000", "#ff0000", "#ff6600", "#ffc000",
  "#ffff00", "#92d050", "#00b050", "#00b0f0",
  "#0070c0", "#002060", "#7030a0", "#ffffff",
] as const;

export const HIGHLIGHT_COLORS = [
  "#ffff00", "#ffe599", "#ffd966", "#f4b183",
  "#ffc000", "#c00000", "#ff0000", "#00b0f0",
  "#92d050", "#00b050", "#7030a0", "#e6e6e6",
] as const;

// 页面背景色(写到 shell.headCss 的 body 规则,被 scopedCss 改名为 .editor-body)
// 浅色为主:暖白/奶白/浅米/浅灰/粉彩/薰衣草 — 大部分是低饱和高亮度的浅色调
export const PAGE_BG_COLORS = [
  "#ffffff", "#fafafa", "#f5f5f5", "#eeeeee",
  "#fff8f0", "#fdf6e3", "#f5efe6", "#f0e9d6",
  "#fff0f5", "#fdeef4", "#f3e8ff", "#eaf3ff",
  "#e8f5e9", "#f0f4c3", "#fce4ec", "#fff8e1",
] as const;
