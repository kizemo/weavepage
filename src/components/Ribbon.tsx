// v0.2.0:Ribbon 接收 iframeRef,无 preview 入口(编辑器视图 = WYSIWYG = 浏览器视图,无需预览)
// - 字体/段落/样式/链接由 RibbonHome 用 iframe.contentDocument.execCommand 实现
// - 表格/插图/水平线/目录由 RibbonInsert 用 iframe DOM + execCommand 实现
// v2.2.0:增加 activeTab === "design" 分支,渲染 DesignStrip(9 张缩略图横排)
// v2.3.0:Goal 2 — 编辑 tab 末尾追加 ContainerStyleGroup(容器样式 + ⭐ 提升)

import type { RefObject } from "react";
import { RibbonHome } from "./RibbonHome";
import { RibbonInsert } from "./RibbonInsert";
import { DesignStrip } from "./DesignStrip";
import { ContainerStyleGroup } from "./ContainerStyleGroup";
import type { RibbonTab } from "./MenuBar";
import type { ContainerProp, ContainerForm, BlockIdentity } from "../utils/blockStyle";

export type ViewMode = "page" | "wide";
export type ThemeMode = "system" | "light" | "dark";

interface RibbonProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  disabled: boolean; // 源码视图时禁用
  activeTab: RibbonTab;
  collapsed: boolean;
  onInsertImage: () => void;
  onLink: () => void;
  // 最近颜色(RibbonHome 用),App 层记录用色
  recentTextColors: string[];
  recentHighlightColors: string[];
  onColorUsed: (kind: "text" | "highlight", color: string) => void;
  // RibbonHome 段落组行距 / 段前后 回调(由 App.tsx 实现)
  onSpacingChange: (spacing: { lineHeight?: number; marginTop?: number; marginBottom?: number }) => void;
  // RibbonHome 页面背景色回调(由 App.tsx 写到 shell.headCss)
  onPageBgChange: (hex: string) => void;
  tocEnabled: boolean;
  onToggleToc: () => void;
  tocDisabled: boolean;
  // v2.2.0:设计顶级 tab(从 RibbonHome 移过来)
  currentDesignId: string | null;
  onApplyDesign: (id: string | null) => void;
  designDisabled: boolean;
  // v2.3.0:Goal 2 — 容器样式编辑
  selectedBlock: BlockIdentity | null;
  containerForm: ContainerForm;
  onBlockStyleChange: (prop: ContainerProp, value: string) => void;
  onPromoteBlock: () => void;
}

export function Ribbon(props: RibbonProps) {
  return (
    <div className="ribbon">
      <div className={`ribbon-body ${props.collapsed ? "collapsed" : ""}`}>
        <div className={`ribbon-tab-content ${props.disabled ? "disabled" : ""}`}>
          {props.activeTab === "edit" && (
            <>
              <RibbonHome
                iframeRef={props.iframeRef}
                onLink={props.onLink}
                recentTextColors={props.recentTextColors}
                recentHighlightColors={props.recentHighlightColors}
                onColorUsed={props.onColorUsed}
                onSpacingChange={props.onSpacingChange}
                onPageBgChange={props.onPageBgChange}
              />
              <ContainerStyleGroup
                selectedBlock={props.selectedBlock}
                containerForm={props.containerForm}
                onChange={props.onBlockStyleChange}
                onPromote={props.onPromoteBlock}
              />
            </>
          )}
          {props.activeTab === "insert" && (
            <RibbonInsert
              iframeRef={props.iframeRef}
              onInsertImage={props.onInsertImage}
              tocEnabled={props.tocEnabled}
              onToggleToc={props.onToggleToc}
              tocDisabled={props.tocDisabled}
            />
          )}
          {props.activeTab === "design" && (
            <DesignStrip
              currentDesignId={props.currentDesignId}
              onApply={props.onApplyDesign}
              disabled={props.designDisabled}
            />
          )}
        </div>
      </div>
    </div>
  );
}