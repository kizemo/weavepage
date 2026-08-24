import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import "@tiptap/extension-table";
import "@tiptap/extension-table-row";
import "@tiptap/extension-table-header";
import "@tiptap/extension-table-cell";
import { GroupTitle, RibbonButton } from "./controls";
import { TableGridPicker } from "./TableGridPicker";

interface RibbonInsertProps {
  editor: Editor;
  onInsertImage: () => void;
  onInsertTable: (rows: number, cols: number) => void;
  onDeleteTable: () => void;
  // v0.1.13 第二十七轮:inline doc-toc toggle 按钮
  tocEnabled: boolean;
  onToggleToc: () => void;
  tocDisabled: boolean; // text doc / source 模式禁用
}

export function RibbonInsert({
  editor,
  onInsertImage,
  onInsertTable,
  onDeleteTable,
  tocEnabled,
  onToggleToc,
  tocDisabled,
}: RibbonInsertProps) {
  // 光标移入/移出表格时实时刷新行列按钮可用状态
  const inTable = useEditorState({
    editor,
    selector: ({ editor }) => editor.isActive("table"),
  });

  return (
    <>
      {/* 表格组 */}
      <div className="ribbon-group">
        <GroupTitle>表格</GroupTitle>
        <TableGridPicker onPick={onInsertTable} onClear={onDeleteTable} />
        <RibbonButton
          icon="⇣"
          label="上行"
          onClick={() => editor.chain().focus().addRowBefore().run()}
          disabled={!inTable}
          title="在光标上方插入行"
        />
        <RibbonButton
          icon="⇩"
          label="下行"
          onClick={() => editor.chain().focus().addRowAfter().run()}
          disabled={!inTable}
          title="在光标下方插入行"
        />
        <RibbonButton
          icon="⇢"
          label="右列"
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          disabled={!inTable}
          title="在光标右侧插入列"
        />
        <RibbonButton
          icon="⇠"
          label="左列"
          onClick={() => editor.chain().focus().addColumnBefore().run()}
          disabled={!inTable}
          title="在光标左侧插入列"
        />
        <RibbonButton
          icon="✕"
          label="删行"
          onClick={() => editor.chain().focus().deleteRow().run()}
          disabled={!inTable}
          title="删除光标所在行"
        />
        <RibbonButton
          icon="✕"
          label="删列"
          onClick={() => editor.chain().focus().deleteColumn().run()}
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
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
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
