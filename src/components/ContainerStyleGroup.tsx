// Goal 2 — 容器样式编辑 + ⭐ 提升按钮
// 编辑 tab 末尾追加,7 个控件(背景/边框色/宽/样式/圆角/内边距) + ⭐ 提升
// 无选中块时整组 disabled
import { useCallback } from "react";
import type {
  ContainerForm,
  ContainerProp,
  BlockIdentity,
} from "../utils/blockStyle";
import { SelectControl, RibbonButton, GroupTitle } from "./controls";
import { ColorPicker } from "./ColorPicker";
import { PAGE_BG_COLORS } from "../utils/fonts";

interface ContainerStyleGroupProps {
  selectedBlock: BlockIdentity | null;
  containerForm: ContainerForm;
  onChange: (prop: ContainerProp, value: string) => void;
  onPromote: () => void;
}

const BORDER_WIDTHS = ["0", "1px", "2px", "4px", "8px"];
const BORDER_STYLES = ["none", "solid", "dashed", "dotted"];
const BORDER_RADIUS = ["0", "4px", "8px", "16px"];
const PADDINGS = ["0", "8px", "16px", "24px", "32px"];

export function ContainerStyleGroup({
  selectedBlock,
  containerForm,
  onChange,
  onPromote,
}: ContainerStyleGroupProps) {
  const disabled = !selectedBlock;

  const setProp = useCallback(
    (prop: ContainerProp) => (value: string) => {
      onChange(prop, value);
    },
    [onChange]
  );

  return (
    <div className="ribbon-group container-style-group" data-disabled={disabled}>
      <GroupTitle>容器</GroupTitle>
      <ColorPicker
        value={containerForm.bgColor ?? ""}
        onChange={(c) => setProp("bgColor")(c)}
        onClear={() => setProp("bgColor")("")}
        colors={PAGE_BG_COLORS}
        recents={[]}
        title="背景色"
        label="背景"
      />
      <ColorPicker
        value={containerForm.borderColor ?? ""}
        onChange={(c) => setProp("borderColor")(c)}
        onClear={() => setProp("borderColor")("")}
        colors={PAGE_BG_COLORS}
        recents={[]}
        title="边框色"
        label="边框"
      />
      <SelectControl
        value={containerForm.borderWidth ?? ""}
        onChange={(v) => setProp("borderWidth")(v)}
        options={BORDER_WIDTHS.map((w) => ({ label: w || "宽度", value: w }))}
        title="边框宽度"
      />
      <SelectControl
        value={containerForm.borderStyle ?? ""}
        onChange={(v) => setProp("borderStyle")(v)}
        options={BORDER_STYLES.map((s) => ({ label: s || "样式", value: s }))}
        title="边框样式"
      />
      <SelectControl
        value={containerForm.borderRadius ?? ""}
        onChange={(v) => setProp("borderRadius")(v)}
        options={BORDER_RADIUS.map((r) => ({ label: r || "圆角", value: r }))}
        title="圆角"
      />
      <SelectControl
        value={containerForm.padding ?? ""}
        onChange={(v) => setProp("padding")(v)}
        options={PADDINGS.map((p) => ({ label: p || "内边距", value: p }))}
        title="内边距"
      />
      <RibbonButton
        icon="⭐"
        label="提升"
        onClick={onPromote}
        disabled={disabled}
        title={disabled ? "先选中块" : "把当前块的样式提升为 head CSS 规则"}
      />
    </div>
  );
}