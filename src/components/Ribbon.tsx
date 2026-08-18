import type { Editor } from "@tiptap/react";
import { RibbonButton } from "./controls";
import { RibbonHome } from "./RibbonHome";
import { RibbonInsert } from "./RibbonInsert";
import type { RibbonTab } from "./MenuBar";

export type ViewMode = "page" | "wide";
export type ThemeMode = "system" | "light" | "dark";

interface RibbonProps {
  editor: Editor;
  disabled: boolean; // 源码视图时禁用
  activeTab: RibbonTab;
  collapsed: boolean;
  previewActive: boolean;
  onPreview: () => void;
  onInsertImage: () => void;
  onInsertTable: (rows: number, cols: number) => void;
  onDeleteTable: () => void;
  onLink: () => void;
  // 最近颜色(RibbonHome 用),App 层记录用色
  recentTextColors: string[];
  recentHighlightColors: string[];
  onColorUsed: (kind: "text" | "highlight", color: string) => void;
  // RibbonHome 段落组行距 / 段前后 回调(由 App.tsx 实现,直接改 Tiptap 节点的 inline style)
  onSpacingChange: (spacing: { lineHeight?: number; marginTop?: number; marginBottom?: number }) => void;
}

export function Ribbon(props: RibbonProps) {
  return (
    <div className="ribbon">
      <div className={`ribbon-body ${props.collapsed ? "collapsed" : ""}`}>
        <RibbonButton
          icon="👁"
          label="网页预览"
          onClick={props.onPreview}
          active={props.previewActive}
          title={props.previewActive ? "退出网页预览" : "打开网页预览 (F5)"}
        />
        <div className={`ribbon-tab-content ${props.disabled ? "disabled" : ""}`}>
          {props.activeTab === "edit" ? (
            <RibbonHome
              editor={props.editor}
              onLink={props.onLink}
              recentTextColors={props.recentTextColors}
              recentHighlightColors={props.recentHighlightColors}
              onColorUsed={props.onColorUsed}
              onSpacingChange={props.onSpacingChange}
            />
          ) : (
            <RibbonInsert
              editor={props.editor}
              onInsertImage={props.onInsertImage}
              onInsertTable={props.onInsertTable}
              onDeleteTable={props.onDeleteTable}
            />
          )}
        </div>
      </div>
    </div>
  );
}
