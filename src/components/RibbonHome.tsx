// v0.1.13 第三十轮:iframe-based RibbonHome
// - 接收 iframeRef 替代 editor prop
// - 用 iframe.contentDocument.execCommand 实现所有格式化命令
// - 用 useIframeFormatState 实时获取选区格式状态(替代 useEditorState)
// - block 元素样式(lineHeight/marginTop/marginBottom)通过 inline style 设置(直接 DOM 操作)

import { useCallback, type RefObject } from "react";
import { GroupTitle, RibbonButton, SelectControl } from "./controls";
import { ColorPicker } from "./ColorPicker";
import { RibbonDesign } from "./RibbonDesign";
import { FONT_FAMILIES, FONT_SIZES, TEXT_COLORS, HIGHLIGHT_COLORS, PAGE_BG_COLORS } from "../utils/fonts";
import {
  LINE_HEIGHT_OPTIONS,
  PARAGRAPH_SPACING_OPTIONS,
} from "../utils/paragraphSpacing";
import {
  iframeExec,
  useIframeFormatState,
  pxToFontSize,
  FORMAT_BLOCK_MAP,
} from "../utils/iframeExec";

interface RibbonHomeProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  // 链接
  onLink: () => void;
  // 最近颜色(RibbonHome 用),App 层记录用色
  recentTextColors: string[];
  recentHighlightColors: string[];
  onColorUsed: (kind: "text" | "highlight", color: string) => void;
  // 段落组行距 / 段前后 — 直接改 iframe 内选区块的 inline style
  onSpacingChange: (spacing: { lineHeight?: number; marginTop?: number; marginBottom?: number }) => void;
  // 页面背景色回调(由 App.tsx 写到 shell.headCss)
  onPageBgChange: (hex: string) => void;
  // v2.1.0:设计子菜单
  currentDesignId: string | null;
  onApplyDesign: (id: string | null) => void;
  designDisabled: boolean;
}

export function RibbonHome({
  iframeRef,
  onLink,
  recentTextColors,
  recentHighlightColors,
  onColorUsed,
  onSpacingChange,
  onPageBgChange,
  currentDesignId,
  onApplyDesign,
  designDisabled,
}: RibbonHomeProps) {
  // 选区/光标变化都重新派生格式状态(Ribbon 实时高亮按钮)
  const fmt = useIframeFormatState(iframeRef);
  const iframe = iframeRef.current;

  const setFontFamily = useCallback(
    (value: string) => {
      if (!iframe) return;
      if (value === "") {
        iframeExec(iframe, "removeFormat");
      } else {
        iframeExec(iframe, "fontName", value);
      }
    },
    [iframe]
  );

  // fontSize:execCommand 只接受 1-7 的字符串(Ribbon 用 pt 但 execCommand 用 idx)
  // Ribbon 显示 fmt.fontSize(从 computed style 读取 px → pt);写入用 execCommand 1-7
  // 这里把 pt 转回 px 再映射到 1-7
  const setFontSize = useCallback(
    (value: string) => {
      if (!iframe) return;
      if (value === "") {
        iframeExec(iframe, "removeFormat");
      } else {
        // value 是 pt 字符串(从 fmt.fontSize),转 px: 1pt = 4/3 px
        const pt = parseFloat(value);
        if (!isFinite(pt)) return;
        const px = pt * (4 / 3);
        const size = pxToFontSize(`${px}px`);
        iframeExec(iframe, "fontSize", size);
      }
    },
    [iframe]
  );

  // 当前值不在预设列表时(如 iframe 计算样式),动态追加
  const familyOptions: { label: string; value: string }[] = [...FONT_FAMILIES];
  if (fmt.fontName && !familyOptions.some((o) => o.value === fmt.fontName)) {
    familyOptions.push({ label: fmt.fontName, value: fmt.fontName });
  }
  const sizeOptions: { label: string; value: string }[] = [...FONT_SIZES];
  // execCommand fontSize 返回 1-7,转 px 再转 pt 显示
  if (fmt.fontSize) {
    const sizeToPx: Record<string, number> = {
      "1": 10, "2": 13, "3": 16, "4": 18, "5": 24, "6": 32, "7": 48,
    };
    const px = sizeToPx[fmt.fontSize];
    if (px) {
      const pt = px * 0.75;
      const ptLabel = `${Math.round(pt * 2) / 2}pt`;
      if (!sizeOptions.some((o) => o.value === ptLabel)) {
        sizeOptions.push({ label: ptLabel, value: ptLabel });
      }
    }
  }

  const setColor = useCallback(
    (value: string) => {
      if (!iframe) return;
      iframeExec(iframe, "foreColor", value);
    },
    [iframe]
  );

  const clearColor = useCallback(() => {
    if (!iframe) return;
    iframeExec(iframe, "removeFormat");
  }, [iframe]);

  const setHighlight = useCallback(
    (value: string) => {
      if (!iframe) return;
      iframeExec(iframe, "hiliteColor", value);
    },
    [iframe]
  );

  const clearHighlight = useCallback(() => {
    if (!iframe) return;
    iframeExec(iframe, "removeFormat");
  }, [iframe]);

  // 段间距回调:在选区块上直接改 inline style(如果未来要 iframe-原生,这里改 iframe DOM)
  // 当前实现保留 App.tsx 的逻辑(由 onSpacingChange 处理)
  const handleLineHeight = (v: string) =>
    onSpacingChange({ lineHeight: parseFloat(v) || undefined });
  const handleMarginTop = (v: string) =>
    onSpacingChange({ marginTop: parseFloat(v) || undefined });
  const handleMarginBottom = (v: string) =>
    onSpacingChange({ marginBottom: parseFloat(v) || undefined });

  // 检测段落是否在某个块里 — 用 iframe document.queryCommandValue("formatBlock")
  // execCommand 选区光标处会返回该块的 tag
  const currentBlock = fmt.formatBlock;
  const isHeading = (level: number) => currentBlock === `h${level}`;
  const isParagraph = currentBlock === "p" || currentBlock === "";

  return (
    <>
      {/* 字体组 */}
      <div className="ribbon-group">
        <GroupTitle>字体</GroupTitle>
        <SelectControl
          value={fmt.fontName}
          onChange={setFontFamily}
          options={familyOptions}
          title="字体"
        />
        <SelectControl
          value={
            fmt.fontSize
              ? (() => {
                  const sizeToPx: Record<string, number> = {
                    "1": 10, "2": 13, "3": 16, "4": 18, "5": 24, "6": 32, "7": 48,
                  };
                  const px = sizeToPx[fmt.fontSize];
                  return px ? `${Math.round(px * 0.75 * 2) / 2}pt` : "";
                })()
              : ""
          }
          onChange={setFontSize}
          options={sizeOptions}
          title="字号"
        />
        <RibbonButton
          icon={<strong>B</strong>}
          label="粗体"
          onClick={() => iframeExec(iframe, "bold")}
          active={fmt.bold}
        />
        <RibbonButton
          icon={<em>I</em>}
          label="斜体"
          onClick={() => iframeExec(iframe, "italic")}
          active={fmt.italic}
        />
        <RibbonButton
          icon={<u>U</u>}
          label="下划线"
          onClick={() => iframeExec(iframe, "underline")}
          active={fmt.underline}
        />
        <RibbonButton
          icon={<s>S</s>}
          label="删除线"
          onClick={() => iframeExec(iframe, "strikeThrough")}
          active={fmt.strikeThrough}
        />
        <ColorPicker
          value={fmt.foreColor}
          onChange={(c) => { setColor(c); onColorUsed("text", c); }}
          onClear={clearColor}
          colors={TEXT_COLORS}
          recents={recentTextColors}
          title="文字颜色"
        />
        <ColorPicker
          value={fmt.hiliteColor}
          onChange={(c) => { setHighlight(c); onColorUsed("highlight", c); }}
          onClear={clearHighlight}
          colors={HIGHLIGHT_COLORS}
          recents={recentHighlightColors}
          title="高亮"
        />
        <ColorPicker
          value=""
          onChange={(c) => onPageBgChange(c)}
          onClear={() => onPageBgChange("#ffffff")}
          colors={PAGE_BG_COLORS}
          recents={[]}
          title="页面背景"
          label="背景"
        />
      </div>

      {/* 段落组 */}
      <div className="ribbon-group">
        <GroupTitle>段落</GroupTitle>
        <RibbonButton
          icon="≡"
          label="左对齐"
          onClick={() => iframeExec(iframe, "justifyLeft")}
          active={fmt.justifyLeft}
        />
        <RibbonButton
          icon="☰"
          label="居中"
          onClick={() => iframeExec(iframe, "justifyCenter")}
          active={fmt.justifyCenter}
        />
        <RibbonButton
          icon="≣"
          label="右对齐"
          onClick={() => iframeExec(iframe, "justifyRight")}
          active={fmt.justifyRight}
        />
        <RibbonButton
          icon="▭"
          label="两端"
          onClick={() => iframeExec(iframe, "justifyFull")}
          active={fmt.justifyFull}
        />
        <RibbonButton
          icon="•"
          label="项目符号"
          onClick={() => iframeExec(iframe, "insertUnorderedList")}
          active={fmt.insertUnorderedList}
        />
        <RibbonButton
          icon="1."
          label="编号"
          onClick={() => iframeExec(iframe, "insertOrderedList")}
          active={fmt.insertOrderedList}
        />
        <RibbonButton
          icon="❝"
          label="引用"
          onClick={() => iframeExec(iframe, "formatBlock", FORMAT_BLOCK_MAP.blockquote)}
          active={currentBlock === "blockquote"}
        />
        <RibbonButton
          icon="⇤"
          label="减少缩进"
          onClick={() => iframeExec(iframe, "outdent")}
        />
        <RibbonButton
          icon="⇥"
          label="增加缩进"
          onClick={() => iframeExec(iframe, "indent")}
        />
        <RibbonButton
          icon="{}"
          label="代码块"
          onClick={() => iframeExec(iframe, "formatBlock", FORMAT_BLOCK_MAP.pre)}
          active={currentBlock === "pre"}
        />
        <span className="ribbon-select-with-hint" title="行间距(行高倍数)">
          <SelectControl
            value={fmt.fontSize ? "" : ""}
            onChange={handleLineHeight}
            options={LINE_HEIGHT_OPTIONS}
            title="行距"
          />
          <span className="ribbon-hint">行距</span>
        </span>
        <span className="ribbon-select-with-hint" title="段前空白(pt 单位)">
          <SelectControl
            value=""
            onChange={handleMarginTop}
            options={PARAGRAPH_SPACING_OPTIONS}
            title="段前(pt)"
          />
          <span className="ribbon-hint">段前</span>
        </span>
        <span className="ribbon-select-with-hint" title="段后空白(pt 单位)">
          <SelectControl
            value=""
            onChange={handleMarginBottom}
            options={PARAGRAPH_SPACING_OPTIONS}
            title="段后(pt)"
          />
          <span className="ribbon-hint">段后</span>
        </span>
      </div>

      {/* 样式组 */}
      <div className="ribbon-group">
        <GroupTitle>样式</GroupTitle>
        <RibbonButton
          icon="T"
          label="正文"
          onClick={() => iframeExec(iframe, "formatBlock", FORMAT_BLOCK_MAP.p)}
          active={isParagraph}
        />
        <RibbonButton
          icon="H1"
          label="标题1"
          onClick={() => iframeExec(iframe, "formatBlock", FORMAT_BLOCK_MAP.h1)}
          active={isHeading(1)}
        />
        <RibbonButton
          icon="H2"
          label="标题2"
          onClick={() => iframeExec(iframe, "formatBlock", FORMAT_BLOCK_MAP.h2)}
          active={isHeading(2)}
        />
        <RibbonButton
          icon="H3"
          label="标题3"
          onClick={() => iframeExec(iframe, "formatBlock", FORMAT_BLOCK_MAP.h3)}
          active={isHeading(3)}
        />
        <RibbonButton
          icon="H4"
          label="标题4"
          onClick={() => iframeExec(iframe, "formatBlock", FORMAT_BLOCK_MAP.h4)}
          active={isHeading(4)}
        />
      </div>

      {/* 链接组 */}
      <div className="ribbon-group">
        <GroupTitle>链接</GroupTitle>
        <RibbonButton
          icon="🔗"
          label="链接"
          onClick={onLink}
        />
      </div>

      {/* 设计组 */}
      <RibbonDesign
        currentDesignId={currentDesignId}
        onApply={onApplyDesign}
        disabled={designDisabled}
      />
    </>
  );
}