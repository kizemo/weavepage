import { useState, useEffect, useRef } from "react";

type MenuId = "file" | "view" | "recent" | null;
type ThemeMode = "system" | "light" | "dark";
type ViewMode = "page" | "wide";
export type RibbonTab = "edit" | "insert";
export type EditMode = "edit" | "source" | "preview";

interface MenuBarProps {
  isModified: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExportPage: () => void;
  onClose: () => void;
  // 最近文件子菜单
  recent: string[];
  onOpenRecent: (path: string) => void;
  onClearRecent: () => void;
  // 视图与模式
  mode: EditMode;
  onModeChange: (m: EditMode) => void;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  theme: ThemeMode;
  onThemeChange: (t: ThemeMode) => void;
  ribbonCollapsed: boolean;
  onToggleRibbon: () => void;
  activeTab: RibbonTab;
  onTabChange: (t: RibbonTab) => void;
}

export function MenuBar(props: MenuBarProps) {
  const {
    isModified, onNew, onOpen, onSave, onSaveAs, onExportPage, onClose,
    recent, onOpenRecent, onClearRecent,
    mode, onModeChange,
    viewMode, onViewMode, theme, onThemeChange,
    ribbonCollapsed, onToggleRibbon,
    activeTab, onTabChange,
  } = props;
  const [activeMenu, setActiveMenu] = useState<MenuId>(null);
  // 二级子菜单(目前只有「打开最近」用);hover 打开,mouseleave 关闭
  const [recentSubOpen, setRecentSubOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const recentItemRef = useRef<HTMLDivElement>(null);
  const recentSubRef = useRef<HTMLDivElement>(null);
  let closeTimer = useRef<number | null>(null);

  // 点击 menu-bar 外关闭菜单
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
        setRecentSubOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (id: MenuId) => setActiveMenu((cur) => (cur === id ? null : id));
  const close = () => {
    setActiveMenu(null);
    setRecentSubOpen(false);
  };

  // 鼠标 hover 打开最近子菜单(hover-leave 给一个 delay,允许鼠标滑向子菜单)
  const openRecentSub = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setRecentSubOpen(true);
  };
  const scheduleCloseRecentSub = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setRecentSubOpen(false), 120);
  };

  return (
    <div className="menu-bar" ref={barRef}>
      <div className="menu-item">
        <button className={`menu-title ${activeMenu === "file" ? "menu-open" : ""}`} onClick={() => toggle("file")}>
          {isModified ? "文件 •" : "文件"}
        </button>
        {activeMenu === "file" && (
          <div className="menu-dropdown">
            <button onClick={() => { onNew(); close(); }}>新建 <span className="shortcut">Ctrl+N</span></button>
            <button onClick={() => { onOpen(); close(); }}>打开... <span className="shortcut">Ctrl+O</span></button>

            {/* 「打开最近」二级菜单 */}
            <div
              ref={recentItemRef}
              className="menu-item-sub"
              onMouseEnter={openRecentSub}
              onMouseLeave={scheduleCloseRecentSub}
            >
              <button
                className={`menu-sub-trigger ${recentSubOpen ? "menu-sub-open" : ""}`}
                onClick={() => setRecentSubOpen((v) => !v)}
              >
                打开最近 ▶
              </button>
              {recentSubOpen && (
                <div
                  ref={recentSubRef}
                  className="menu-dropdown menu-dropdown-right"
                  onMouseEnter={openRecentSub}
                  onMouseLeave={scheduleCloseRecentSub}
                >
                  {recent.length === 0 ? (
                    <button className="menu-disabled" disabled>(无最近文档)</button>
                  ) : (
                    <>
                      {recent.map((p, i) => {
                        const name = p.split(/[\\/]/).pop() ?? p;
                        return (
                          <button
                            key={p}
                            title={p}
                            onClick={() => { onOpenRecent(p); close(); }}
                          >
                            {i + 1}. {name}
                          </button>
                        );
                      })}
                      <div className="menu-sep" />
                      <button onClick={() => { onClearRecent(); close(); }}>
                        清除
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="menu-sep" />
            <button onClick={() => { onSave(); close(); }}>保存 <span className="shortcut">Ctrl+S</span></button>
            <button onClick={() => { onSaveAs(); close(); }}>另存为... <span className="shortcut">Ctrl+Shift+S</span></button>
            <div className="menu-sep" />
            <button onClick={() => { onExportPage(); close(); }}>导出网页...</button>
            <button onClick={() => { onClose(); close(); }}>关闭 <span className="shortcut">Ctrl+W</span></button>
          </div>
        )}
      </div>

      <button className={`ribbon-tab ${activeTab === "edit" ? "active" : ""}`} onClick={() => onTabChange("edit")}>
        编辑
      </button>
      <button className={`ribbon-tab ${activeTab === "insert" ? "active" : ""}`} onClick={() => onTabChange("insert")}>
        插入
      </button>

      <div className="menu-item">
        <button className={`menu-title ${activeMenu === "view" ? "menu-open" : ""}`} onClick={() => toggle("view")}>
          视图
        </button>
        {activeMenu === "view" && (
          <div className="menu-dropdown">
            <button onClick={() => { onViewMode("page"); close(); }}>
              页式视图 {viewMode === "page" ? "✓" : ""}
            </button>
            <button onClick={() => { onViewMode("wide"); close(); }}>
              全宽视图 {viewMode === "wide" ? "✓" : ""}
            </button>
            <div className="menu-sep" />
            <button onClick={() => { onModeChange("edit"); close(); }}>
              编辑模式 {mode === "edit" ? "✓" : ""}
            </button>
            <button onClick={() => { onModeChange("source"); close(); }}>
              源码视图 {mode === "source" ? "✓" : ""}
            </button>
            <button onClick={() => { onModeChange("preview"); close(); }}>
              网页预览 {mode === "preview" ? "✓" : ""}
            </button>
            <div className="menu-sep" />
            <button onClick={() => { onThemeChange("system"); close(); }}>
              主题：跟随系统 {theme === "system" ? "✓" : ""}
            </button>
            <button onClick={() => { onThemeChange("light"); close(); }}>
              主题：浅色 {theme === "light" ? "✓" : ""}
            </button>
            <button onClick={() => { onThemeChange("dark"); close(); }}>
              主题：深色 {theme === "dark" ? "✓" : ""}
            </button>
            <div className="menu-sep" />
            <button onClick={() => { onToggleRibbon(); close(); }}>
              {ribbonCollapsed ? "展开功能区" : "折叠功能区"}
            </button>
          </div>
        )}
      </div>

      <button
        className="ribbon-collapse-btn"
        title={ribbonCollapsed ? "展开功能区" : "折叠功能区"}
        onClick={onToggleRibbon}
      >
        {ribbonCollapsed ? "▼" : "▲"}
      </button>
    </div>
  );
}
