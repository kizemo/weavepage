// v0.1.13 第三十轮:iframe-based RibbonInsert
// - 接收 iframeRef + onInsertImage(图片由 App 层 file dialog → base64 回调)替代 editor prop
// - 表格操作:用 iframe.contentDocument DOM 操作实现(insert/delete row/column)
// - 水平线:iframeExec("insertHorizontalRule")
// - TOC 切换:在 iframe 内直接插入/删除 toc HTML(避开 Tiptap PM)

import { useCallback, useEffect, useState, type RefObject } from "react";
import { GroupTitle, RibbonButton } from "./controls";
import { TableGridPicker } from "./TableGridPicker";
import { iframeExec } from "../utils/iframeExec";

interface RibbonInsertProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onInsertImage: () => void; // App 层:file dialog → base64 → 回调
  // 表格插入由 RibbonInsert 内部用 iframe DOM 操作处理(不需要 rows/cols 回调)
  // 删除表格也由内部处理
  // v0.1.13 第二十七轮:inline doc-toc toggle 按钮
  tocEnabled: boolean;
  onToggleToc: () => void;
  tocDisabled: boolean; // text doc / source 模式禁用
}

export function RibbonInsert({
  iframeRef,
  onInsertImage,
  tocEnabled,
  onToggleToc,
  tocDisabled,
}: RibbonInsertProps) {
  // 监听 iframe 选区变化,实时判断是否在表格里
  const [inTable, setInTable] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const iframe = iframeRef.current;
      if (!iframe) return setInTable(false);
      const doc = iframe.contentDocument;
      if (!doc) return setInTable(false);
      const sel = doc.getSelection();
      if (!sel || !sel.anchorNode) return setInTable(false);
      let node: Node | null = sel.anchorNode;
      while (node) {
        if (node.nodeType === 1 && (node as Element).tagName === "TABLE") {
          return setInTable(true);
        }
        node = node.parentNode;
      }
      setInTable(false);
    };
    const doc = iframeRef.current?.contentDocument;
    if (doc) {
      doc.addEventListener("selectionchange", refresh);
      doc.addEventListener("input", refresh);
      doc.addEventListener("keyup", refresh);
      doc.addEventListener("mouseup", refresh);
      doc.addEventListener("focus", refresh);
    }
    return () => {
      const d = iframeRef.current?.contentDocument;
      if (d) {
        d.removeEventListener("selectionchange", refresh);
        d.removeEventListener("input", refresh);
        d.removeEventListener("keyup", refresh);
        d.removeEventListener("mouseup", refresh);
        d.removeEventListener("focus", refresh);
      }
    };
  }, [iframeRef]);

  // 表格插入:在 iframe 选区处插入 HTML 表格(行×列)
  const insertTable = useCallback(
    (rows: number, cols: number) => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const doc = iframe.contentDocument;
      if (!doc) return;
      // 用 insertHTML 把表格 HTML 插入到选区
      let tableHtml = "<table>";
      tableHtml += "<thead><tr>";
      for (let c = 0; c < cols; c++) tableHtml += "<th><br></th>";
      tableHtml += "</tr></thead>";
      tableHtml += "<tbody>";
      for (let r = 0; r < rows; r++) {
        tableHtml += "<tr>";
        for (let c = 0; c < cols; c++) tableHtml += "<td><br></td>";
        tableHtml += "</tr>";
      }
      tableHtml += "</tbody></table><p><br></p>";
      iframeExec(iframe, "insertHTML", tableHtml);
    },
    [iframeRef]
  );

  // 删除当前光标所在表格
  const deleteTable = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    const sel = doc.getSelection();
    if (!sel || !sel.anchorNode) return;
    let node: Node | null = sel.anchorNode;
    while (node && (node.nodeType !== 1 || (node as Element).tagName !== "TABLE")) {
      node = node.parentNode;
    }
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
      // 触发 input 事件 → 同步到 docHtml
      doc.body.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, [iframeRef]);

  // 在表格内:根据光标所在单元格定位 table/tr
  const getTableContext = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return null;
    const doc = iframe.contentDocument;
    if (!doc) return null;
    const sel = doc.getSelection();
    if (!sel || !sel.anchorNode) return null;
    let cell: HTMLTableCellElement | null = null;
    let row: HTMLTableRowElement | null = null;
    let table: HTMLTableElement | null = null;
    let node: Node | null = sel.anchorNode;
    while (node && !(cell && row && table)) {
      if (node.nodeType === 1) {
        const tag = (node as Element).tagName;
        if (!cell && (tag === "TD" || tag === "TH")) cell = node as HTMLTableCellElement;
        else if (!row && tag === "TR") row = node as HTMLTableRowElement;
        else if (!table && tag === "TABLE") table = node as HTMLTableElement;
      }
      node = node.parentNode;
    }
    return { cell, row, table };
  }, [iframeRef]);

  const addRowBefore = useCallback(() => {
    const ctx = getTableContext();
    if (!ctx?.row || !ctx.row.parentNode) return;
    const newRow = ctx.row.cloneNode(true) as HTMLTableRowElement;
    // 清空单元格内容
    newRow.querySelectorAll("td, th").forEach((c) => (c.innerHTML = "<br>"));
    ctx.row.parentNode.insertBefore(newRow, ctx.row);
    ctx.row.ownerDocument?.body.dispatchEvent(new Event("input", { bubbles: true }));
  }, [getTableContext]);

  const addRowAfter = useCallback(() => {
    const ctx = getTableContext();
    if (!ctx?.row || !ctx.row.parentNode) return;
    const newRow = ctx.row.cloneNode(true) as HTMLTableRowElement;
    newRow.querySelectorAll("td, th").forEach((c) => (c.innerHTML = "<br>"));
    if (ctx.row.nextSibling) {
      ctx.row.parentNode.insertBefore(newRow, ctx.row.nextSibling);
    } else {
      ctx.row.parentNode.appendChild(newRow);
    }
    ctx.row.ownerDocument?.body.dispatchEvent(new Event("input", { bubbles: true }));
  }, [getTableContext]);

  const addColumnBefore = useCallback(() => {
    const ctx = getTableContext();
    if (!ctx?.table || !ctx.cell) return;
    const cellIndex = ctx.cell.cellIndex;
    const rows = ctx.table.querySelectorAll("tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td, th");
      const refCell = cells[cellIndex] as HTMLElement | undefined;
      if (!refCell) return;
      const newCell = refCell.cloneNode(false) as HTMLElement;
      newCell.innerHTML = "<br>";
      row.insertBefore(newCell, refCell);
    });
    ctx.table.ownerDocument?.body.dispatchEvent(new Event("input", { bubbles: true }));
  }, [getTableContext]);

  const addColumnAfter = useCallback(() => {
    const ctx = getTableContext();
    if (!ctx?.table || !ctx.cell) return;
    const cellIndex = ctx.cell.cellIndex;
    const rows = ctx.table.querySelectorAll("tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td, th");
      const refCell = cells[cellIndex] as HTMLElement | undefined;
      if (!refCell) return;
      const newCell = refCell.cloneNode(false) as HTMLElement;
      newCell.innerHTML = "<br>";
      if (refCell.nextSibling) {
        row.insertBefore(newCell, refCell.nextSibling);
      } else {
        row.appendChild(newCell);
      }
    });
    ctx.table.ownerDocument?.body.dispatchEvent(new Event("input", { bubbles: true }));
  }, [getTableContext]);

  const deleteRow = useCallback(() => {
    const ctx = getTableContext();
    if (!ctx?.row || !ctx.row.parentNode) return;
    ctx.row.parentNode.removeChild(ctx.row);
    ctx.row.ownerDocument?.body.dispatchEvent(new Event("input", { bubbles: true }));
  }, [getTableContext]);

  const deleteColumn = useCallback(() => {
    const ctx = getTableContext();
    if (!ctx?.table || !ctx.cell) return;
    const cellIndex = ctx.cell.cellIndex;
    const rows = ctx.table.querySelectorAll("tr");
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td, th");
      const target = cells[cellIndex];
      if (target && target.parentNode) target.parentNode.removeChild(target);
    });
    // 如果表没列了,删除整个表
    if (ctx.table.querySelectorAll("tr")[0]?.querySelectorAll("td, th").length === 0) {
      ctx.table.parentNode?.removeChild(ctx.table);
    }
    ctx.table.ownerDocument?.body.dispatchEvent(new Event("input", { bubbles: true }));
  }, [getTableContext]);

  return (
    <>
      {/* 表格组 */}
      <div className="ribbon-group">
        <GroupTitle>表格</GroupTitle>
        <TableGridPicker onPick={insertTable} onClear={deleteTable} />
        <RibbonButton
          icon="⇣"
          label="上行"
          onClick={addRowBefore}
          disabled={!inTable}
          title="在光标上方插入行"
        />
        <RibbonButton
          icon="⇩"
          label="下行"
          onClick={addRowAfter}
          disabled={!inTable}
          title="在光标下方插入行"
        />
        <RibbonButton
          icon="⇢"
          label="右列"
          onClick={addColumnAfter}
          disabled={!inTable}
          title="在光标右侧插入列"
        />
        <RibbonButton
          icon="⇠"
          label="左列"
          onClick={addColumnBefore}
          disabled={!inTable}
          title="在光标左侧插入列"
        />
        <RibbonButton
          icon="✕"
          label="删行"
          onClick={deleteRow}
          disabled={!inTable}
          title="删除光标所在行"
        />
        <RibbonButton
          icon="✕"
          label="删列"
          onClick={deleteColumn}
          disabled={!inTable}
          title="删除光标所在列"
        />
      </div>

      {/* 插图组 */}
      <div className="ribbon-group">
        <GroupTitle>插图</GroupTitle>
        <RibbonButton icon="🖼" label="图片" onClick={onInsertImage} />
        <RibbonButton
          icon="—"
          label="水平线"
          onClick={() => iframeExec(iframeRef.current, "insertHorizontalRule")}
        />
      </div>

      {/* 目录组 */}
      <div className="ribbon-group">
        <GroupTitle>目录</GroupTitle>
        <RibbonButton
          icon="📑"
          label={tocEnabled ? "删除目录" : "插入目录"}
          onClick={onToggleToc}
          active={tocEnabled}
          disabled={tocDisabled}
          title={tocEnabled
            ? "从文档首删除目录节点(doc-toc)"
            : "扫描 h2/h3 标题,在文档首插入目录(可在浏览器/源码查看)"}
        />
      </div>
    </>
  );
}