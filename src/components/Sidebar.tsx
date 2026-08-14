export interface ResourceRef {
  path: string;
  name: string;
  kind: "css" | "js";
}

interface SidebarProps {
  resources: ResourceRef[];
  onOpenResource: (r: ResourceRef) => void;
  onClose: () => void;
}

export function Sidebar({ resources, onOpenResource, onClose }: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <span>外联资源</span>
        <button onClick={onClose} title="关闭侧边栏">×</button>
      </div>
      {resources.map((r) => (
        <button
          key={r.path}
          className="sidebar-item"
          onClick={() => onOpenResource(r)}
          title={r.path}
        >
          <span className="sidebar-icon">{r.kind === "css" ? "🎨" : "⚙"}</span>
          <span className="sidebar-name">{r.name}</span>
        </button>
      ))}
    </div>
  );
}
