export interface DocState {
  id: number;
  kind: "html" | "text";
  filePath: string | null;
  isModified: boolean;
  body: string; // html: 编辑器 body 内容;text: 文件全文
  sourceText: string; // html 源码模式编辑文本
  mode: "edit" | "source" | "preview";
  shell: {
    doctype: string;
    head: string;
    headCss: string;
    bodyAttrs: string;
    scripts: string;
    styles: string;
    baseHref: string;
  } | null;
  rawFullDoc: string | null;
  resources: { path: string; name: string; kind: "css" | "js" }[];
}

interface TabBarProps {
  docs: DocState[];
  activeId: number;
  onSwitch: (id: number) => void;
  onClose: (id: number) => void;
}

const tabName = (d: DocState): string => {
  if (!d.filePath) return "未命名";
  const base = d.filePath.split("\\").pop() ?? "未命名";
  if (d.kind === "html") return base.replace(/\.html?$/i, "");
  return base;
};

export function TabBar({ docs, activeId, onSwitch, onClose }: TabBarProps) {
  return (
    <div className="tab-bar">
      {docs.map((d) => (
        <div
          key={d.id}
          className={`doc-tab ${d.id === activeId ? "active" : ""}`}
          onClick={() => onSwitch(d.id)}
          title={d.filePath ?? "未命名"}
        >
          <span className="doc-tab-name">
            {tabName(d)}
            {d.isModified ? " *" : ""}
          </span>
          <span
            className="doc-tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose(d.id);
            }}
          >
            ×
          </span>
        </div>
      ))}
    </div>
  );
}
