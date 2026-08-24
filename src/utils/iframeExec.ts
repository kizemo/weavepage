// v0.1.13 第三十轮:iframe-based 编辑器 execCommand 封装
// 用浏览器原生 document.execCommand(虽然 deprecated 但跨浏览器稳定支持)
// 提供 Ribbon 用的命令接口 — 替换 Tiptap editor.chain() 体系
//
// 用法:
//   import { iframeExec, getIframeFormatState, useIframeFormatState } from "../utils/iframeExec";
//   iframeExec(iframeRef.current, "bold");
//   const fmt = useIframeFormatState(iframeRef);

import { useEffect, useState, type RefObject } from "react";

// execCommand 命令名(覆盖 RibbonHome/RibbonInsert 大部分按钮)
export type ExecCommand =
  | "bold"
  | "italic"
  | "underline"
  | "strikeThrough"
  | "superscript"
  | "subscript"
  | "justifyLeft"
  | "justifyCenter"
  | "justifyRight"
  | "justifyFull"
  | "insertUnorderedList"
  | "insertOrderedList"
  | "formatBlock" // value: 'h1'|'h2'|...|'h6'|'p'|'blockquote'|'pre'
  | "foreColor" // value: '#xxx'
  | "hiliteColor" // value: '#xxx'
  | "fontSize" // value: '1'..'7'
  | "fontName" // value: 'Arial'
  | "insertHTML" // value: HTML 字符串
  | "createLink" // value: URL
  | "unlink"
  | "undo"
  | "redo"
  | "removeFormat"
  | "insertHorizontalRule"
  | "indent"
  | "outdent"
  | "delete";

/** 在 iframe 内执行 execCommand(自动 focus iframe.body 确保作用于当前选区) */
export function iframeExec(
  iframe: HTMLIFrameElement | null | undefined,
  cmd: ExecCommand,
  value?: string
): void {
  if (!iframe) return;
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) return;
  // 必须先 focus,否则 execCommand 会作用于主文档而非 iframe
  win.focus();
  // body 必须 contenteditable=true 才会接收命令
  try {
    doc.body.focus();
  } catch {
    /* noop */
  }
  // execCommand 第三个参数值(boolean 表示是否显示 UI;string 是值)
  doc.execCommand(cmd, false, value);
}

/** 查询 iframe 当前选区的命令状态(用于 Ribbon 按钮高亮) */
export function iframeQueryState(
  iframe: HTMLIFrameElement | null | undefined,
  cmd: string
): boolean {
  if (!iframe) return false;
  const doc = iframe.contentDocument;
  if (!doc) return false;
  try {
    return doc.queryCommandState(cmd);
  } catch {
    return false;
  }
}

/** 查询 iframe 当前选区的命令值(如 fontName/fontSize/formatBlock) */
export function iframeQueryValue(
  iframe: HTMLIFrameElement | null | undefined,
  cmd: string
): string {
  if (!iframe) return "";
  const doc = iframe.contentDocument;
  if (!doc) return "";
  try {
    return doc.queryCommandValue(cmd);
  } catch {
    return "";
  }
}

/** Ribbon 实时显示的格式状态 */
export interface IframeFormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  superscript: boolean;
  subscript: boolean;
  justifyLeft: boolean;
  justifyCenter: boolean;
  justifyRight: boolean;
  justifyFull: boolean;
  insertUnorderedList: boolean;
  insertOrderedList: boolean;
  fontName: string;
  fontSize: string;
  foreColor: string;
  hiliteColor: string;
  formatBlock: string; // 当前块元素 tag(小写,如 'h2' / 'p' / 'blockquote')
  canUndo: boolean;
  canRedo: boolean;
}

const DEFAULT_FMT: IframeFormatState = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  superscript: false,
  subscript: false,
  justifyLeft: false,
  justifyCenter: false,
  justifyRight: false,
  justifyFull: false,
  insertUnorderedList: false,
  insertOrderedList: false,
  fontName: "",
  fontSize: "",
  foreColor: "",
  hiliteColor: "",
  formatBlock: "",
  canUndo: false,
  canRedo: false,
};

/** 同步获取 iframe 当前选区格式状态(非 hook,可在 onClick 内即时调用) */
export function getIframeFormatState(
  iframe: HTMLIFrameElement | null | undefined
): IframeFormatState {
  if (!iframe) return { ...DEFAULT_FMT };
  const doc = iframe.contentDocument;
  if (!doc) return { ...DEFAULT_FMT };
  return {
    bold: doc.queryCommandState("bold"),
    italic: doc.queryCommandState("italic"),
    underline: doc.queryCommandState("underline"),
    strikeThrough: doc.queryCommandState("strikeThrough"),
    superscript: doc.queryCommandState("superscript"),
    subscript: doc.queryCommandState("subscript"),
    justifyLeft: doc.queryCommandState("justifyLeft"),
    justifyCenter: doc.queryCommandState("justifyCenter"),
    justifyRight: doc.queryCommandState("justifyRight"),
    justifyFull: doc.queryCommandState("justifyFull"),
    insertUnorderedList: doc.queryCommandState("insertUnorderedList"),
    insertOrderedList: doc.queryCommandState("insertOrderedList"),
    fontName: doc.queryCommandValue("fontName") || "",
    fontSize: doc.queryCommandValue("fontSize") || "",
    foreColor: doc.queryCommandValue("foreColor") || "",
    hiliteColor: doc.queryCommandValue("hiliteColor") || "",
    formatBlock: (doc.queryCommandValue("formatBlock") || "").toLowerCase(),
    canUndo: doc.queryCommandEnabled("undo"),
    canRedo: doc.queryCommandEnabled("redo"),
  };
}

/**
 * 监听 iframe 选区变化,实时返回格式状态(用于 Ribbon 按钮 active 高亮)。
 * 监听事件:selectionchange / input / keyup / mouseup / focus。
 * iframe.contentDocument 必须已加载(iframe.onLoad 之后)。
 */
export function useIframeFormatState(
  iframeRef: RefObject<HTMLIFrameElement | null>
): IframeFormatState {
  const [state, setState] = useState<IframeFormatState>(DEFAULT_FMT);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (cancelled) return;
      setState(getIframeFormatState(iframeRef.current));
    };
    const attach = () => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      doc.addEventListener("selectionchange", refresh);
      doc.addEventListener("input", refresh);
      doc.addEventListener("keyup", refresh);
      doc.addEventListener("mouseup", refresh);
      doc.addEventListener("focus", refresh);
      refresh();
    };
    const iframe = iframeRef.current;
    if (iframe) {
      // 如果 iframe 已加载,直接挂载;否则等 onLoad
      if (iframe.contentDocument && iframe.contentDocument.readyState === "complete") {
        attach();
      } else {
        iframe.addEventListener("load", attach, { once: true });
      }
    }
    return () => {
      cancelled = true;
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        doc.removeEventListener("selectionchange", refresh);
        doc.removeEventListener("input", refresh);
        doc.removeEventListener("keyup", refresh);
        doc.removeEventListener("mouseup", refresh);
        doc.removeEventListener("focus", refresh);
      }
    };
  }, [iframeRef]);

  return state;
}

/** 把 px 字号映射到 execCommand fontSize 1-7 */
export function pxToFontSize(px: string): string {
  const v = parseFloat(px);
  if (!isFinite(v) || v <= 0) return "";
  // 浏览器 fontSize 1-7 映射:
  // 1=10px 2=13px 3=16px 4=18px 5=24px 6=32px 7=48px
  if (v <= 11) return "1";
  if (v <= 14) return "2";
  if (v <= 17) return "3";
  if (v <= 21) return "4";
  if (v <= 28) return "5";
  if (v <= 40) return "6";
  return "7";
}

/** 块级元素 → formatBlock value */
export const FORMAT_BLOCK_MAP: Record<string, string> = {
  p: "p",
  paragraph: "p",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
  blockquote: "blockquote",
  pre: "pre",
};