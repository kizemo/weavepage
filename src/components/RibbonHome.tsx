import { useCallback } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import "@tiptap/extension-highlight";
import "@tiptap/extension-text-align";
import { GroupTitle, RibbonButton, SelectControl } from "./controls";
import { ColorPicker } from "./ColorPicker";
import { FONT_FAMILIES, FONT_SIZES, TEXT_COLORS, HIGHLIGHT_COLORS, PAGE_BG_COLORS } from "../utils/fonts";
import {
  readLineHeightFromStyle,
  readMarginFromStyle,
  LINE_HEIGHT_OPTIONS,
  PARAGRAPH_SPACING_OPTIONS,
} from "../utils/paragraphSpacing";

interface RibbonHomeProps {
  editor: Editor;
  onLink: () => void;
  recentTextColors: string[];
  recentHighlightColors: string[];
  onColorUsed: (kind: "text" | "highlight", color: string) => void;
  onSpacingChange: (spacing: { lineHeight?: number; marginTop?: number; marginBottom?: number }) => void;
  onPageBgChange: (hex: string) => void;
}

// px 转 pt（1pt = 4/3px），用于把计算样式字号映射到字号下拉的 pt 体系
const pxToPt = (px: string): string => {
  const v = parseFloat(px);
  if (!isFinite(v) || v <= 0) return "";
  return `${Math.round(v * 0.75 * 2) / 2}pt`;
};

export function RibbonHome({
  editor,
  onLink,
  recentTextColors,
  recentHighlightColors,
  onColorUsed,
  onSpacingChange,
  onPageBgChange,
}: RibbonHomeProps) {
  // 选区/文档每次变化都重新派生格式状态，选中文字时功能区实时显示其格式
  const fmt = useEditorState({
    editor,
    selector: ({ editor }) => {
      const mark = editor.getAttributes("textStyle");
      // 选中文字时读取实际渲染样式（文档 CSS 生效的场景），光标状态只看显式标记
      let cs: CSSStyleDeclaration | null = null;
      // 当前光标/选区的最近 DOM 节点的内联 style（blockEl)→给段落组行距 / 段前后用
      let blockStyle = "";
      try {
        const { from } = editor.state.selection;
        const dom = editor.view.domAtPos(from).node;
        const el = dom instanceof Element ? dom : (dom.parentElement ?? null);
        if (el) {
          blockStyle = el.getAttribute("style") ?? "";
          if (!editor.state.selection.empty) cs = window.getComputedStyle(el);
        }
      } catch {
        cs = null;
      }
      return {
        fontFamily: (mark.fontFamily as string) || (cs?.fontFamily ?? ""),
        fontSize: (mark.fontSize as string) || (cs ? pxToPt(cs.fontSize) : ""),
        textColor: (mark.color as string) || (cs?.color ?? ""),
        highlightColor: editor.getAttributes("highlight").color ?? "",
        canUndo: editor.can().undo(),
        canRedo: editor.can().redo(),
        bold: editor.isActive("bold"),
        italic: editor.isActive("italic"),
        underline: editor.isActive("underline"),
        strike: editor.isActive("strike"),
        alignLeft: editor.isActive({ textAlign: "left" }),
        alignCenter: editor.isActive({ textAlign: "center" }),
        alignRight: editor.isActive({ textAlign: "right" }),
        alignJustify: editor.isActive({ textAlign: "justify" }),
        bulletList: editor.isActive("bulletList"),
        orderedList: editor.isActive("orderedList"),
        taskList: editor.isActive("taskList"),
        blockquote: editor.isActive("blockquote"),
        codeBlock: editor.isActive("codeBlock"),
        paragraph: editor.isActive("paragraph"),
        h1: editor.isActive("heading", { level: 1 }),
        h2: editor.isActive("heading", { level: 2 }),
        h3: editor.isActive("heading", { level: 3 }),
        h4: editor.isActive("heading", { level: 4 }),
        link: editor.isActive("link"),
        canLift: editor.can().liftListItem("listItem"),
        canSink: editor.can().sinkListItem("listItem"),
        // 段距派生
        lineHeight: readLineHeightFromStyle(blockStyle),
        marginTop: readMarginFromStyle(blockStyle, "top"),
        marginBottom: readMarginFromStyle(blockStyle, "bottom"),
      };
    },
  });

  const setFontFamily = useCallback(
    (value: string) => {
      if (value === "") editor.chain().focus().unsetFontFamily().run();
      else editor.chain().focus().setFontFamily(value).run();
    },
    [editor]
  );

  const setFontSize = useCallback(
    (value: string) => {
      if (value === "") editor.chain().focus().unsetFontSize().run();
      else editor.chain().focus().setFontSize(value).run();
    },
    [editor]
  );

  // 当前值不在预设列表时（如文档 CSS 计算出的字号/字体），动态追加显示实际值
  const familyOptions: { label: string; value: string }[] = [...FONT_FAMILIES];
  if (fmt.fontFamily && !familyOptions.some((o) => o.value === fmt.fontFamily)) {
    familyOptions.push({ label: fmt.fontFamily, value: fmt.fontFamily });
  }
  const sizeOptions: { label: string; value: string }[] = [...FONT_SIZES];
  if (fmt.fontSize && !sizeOptions.some((o) => o.value === fmt.fontSize)) {
    sizeOptions.push({ label: fmt.fontSize, value: fmt.fontSize });
  }

  const setColor = useCallback(
    (value: string) => editor.chain().focus().setColor(value).run(),
    [editor]
  );

  const clearColor = useCallback(
    () => editor.chain().focus().unsetColor().run(),
    [editor]
  );

  const setHighlight = useCallback(
    (value: string) => editor.chain().focus().toggleHighlight({ color: value }).run(),
    [editor]
  );

  const clearHighlight = useCallback(
    () => editor.chain().focus().unsetHighlight().run(),
    [editor]
  );

  // 段间距回调:包一层把 SelectControl 的 string 转 number(undefined 表示「没选有效值」)
  const handleLineHeight = (v: string) =>
    onSpacingChange({ lineHeight: parseFloat(v) || undefined });
  const handleMarginTop = (v: string) =>
    onSpacingChange({ marginTop: parseFloat(v) || undefined });
  const handleMarginBottom = (v: string) =>
    onSpacingChange({ marginBottom: parseFloat(v) || undefined });

  return (
    <>
      {/* 字体组 */}
      <div className="ribbon-group">
        <GroupTitle>字体</GroupTitle>
        <SelectControl
          value={fmt.fontFamily}
          onChange={setFontFamily}
          options={familyOptions}
          title="字体"
        />
        <SelectControl
          value={fmt.fontSize}
          onChange={setFontSize}
          options={sizeOptions}
          title="字号"
        />
        <RibbonButton
          icon={<strong>B</strong>}
          label="粗体"
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={fmt.bold}
        />
        <RibbonButton
          icon={<em>I</em>}
          label="斜体"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={fmt.italic}
        />
        <RibbonButton
          icon={<u>U</u>}
          label="下划线"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={fmt.underline}
        />
        <RibbonButton
          icon={<s>S</s>}
          label="删除线"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={fmt.strike}
        />
        <ColorPicker
          value={fmt.textColor}
          onChange={(c) => { setColor(c); onColorUsed("text", c); }}
          onClear={clearColor}
          colors={TEXT_COLORS}
          recents={recentTextColors}
          title="文字颜色"
        />
        <ColorPicker
          value={fmt.highlightColor}
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
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={fmt.alignLeft}
        />
        <RibbonButton
          icon="☰"
          label="居中"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={fmt.alignCenter}
        />
        <RibbonButton
          icon="≣"
          label="右对齐"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={fmt.alignRight}
        />
        <RibbonButton
          icon="▭"
          label="两端"
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          active={fmt.alignJustify}
        />
        <RibbonButton
          icon="•"
          label="项目符号"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={fmt.bulletList}
        />
        <RibbonButton
          icon="1."
          label="编号"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={fmt.orderedList}
        />
        <RibbonButton
          icon="☑"
          label="任务清单"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={fmt.taskList}
        />
        <RibbonButton
          icon="⇤"
          label="减少缩进"
          onClick={() => editor.chain().focus().liftListItem("listItem").run()}
          disabled={!fmt.canLift}
        />
        <RibbonButton
          icon="⇥"
          label="增加缩进"
          onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
          disabled={!fmt.canSink}
        />
        <RibbonButton
          icon="❝"
          label="引用"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={fmt.blockquote}
        />
        <RibbonButton
          icon="{}"
          label="代码块"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={fmt.codeBlock}
        />
        <span className="ribbon-select-with-hint" title="行间距(行高倍数)">
          <SelectControl
            value={fmt.lineHeight === "" ? "" : String(fmt.lineHeight)}
            onChange={handleLineHeight}
            options={LINE_HEIGHT_OPTIONS}
            title="行距"
          />
          <span className="ribbon-hint">行距</span>
        </span>
        <span className="ribbon-select-with-hint" title="段前空白(pt 单位)">
          <SelectControl
            value={fmt.marginTop === "" ? "" : `${fmt.marginTop}pt`}
            onChange={handleMarginTop}
            options={PARAGRAPH_SPACING_OPTIONS}
            title="段前(pt)"
          />
          <span className="ribbon-hint">段前</span>
        </span>
        <span className="ribbon-select-with-hint" title="段后空白(pt 单位)">
          <SelectControl
            value={fmt.marginBottom === "" ? "" : `${fmt.marginBottom}pt`}
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
          onClick={() => editor.chain().focus().setParagraph().run()}
          active={fmt.paragraph}
        />
        <RibbonButton
          icon="H1"
          label="标题1"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={fmt.h1}
        />
        <RibbonButton
          icon="H2"
          label="标题2"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={fmt.h2}
        />
        <RibbonButton
          icon="H3"
          label="标题3"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={fmt.h3}
        />
        <RibbonButton
          icon="H4"
          label="标题4"
          onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
          active={fmt.h4}
        />
      </div>

      {/* 链接组 */}
      <div className="ribbon-group">
        <GroupTitle>链接</GroupTitle>
        <RibbonButton
          icon="🔗"
          label="链接"
          onClick={onLink}
          active={fmt.link}
        />
      </div>
    </>
  );
}
