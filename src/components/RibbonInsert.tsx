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
}

export function RibbonInsert({
  editor,
  onInsertImage,
  onInsertTable,
  onDeleteTable,
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
    </>
  );
}
