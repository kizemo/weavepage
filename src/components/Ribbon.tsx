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
            <RibbonHome editor={props.editor} onLink={props.onLink} />
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
