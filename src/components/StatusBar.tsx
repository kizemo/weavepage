import type { Editor } from "@tiptap/react";
import type { ViewMode, ThemeMode } from "./Ribbon";
import type { EditMode } from "./MenuBar";

interface StatusBarProps {
  editor: Editor;
  wordCount: number;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  theme: ThemeMode;
  onThemeChange: (t: ThemeMode) => void;
  mode: EditMode;
}

export function StatusBar({
  wordCount,
  viewMode,
  onViewMode,
  theme,
  onThemeChange,
  mode,
}: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="status-item">字数：{wordCount}</span>
        {mode === "source" && <span className="status-item" style={{ color: "var(--accent)" }}>源码模式</span>}
        {mode === "preview" && <span className="status-item" style={{ color: "var(--accent)" }}>预览模式</span>}
      </div>
      <div className="status-right">
        <button
          className={`status-btn ${viewMode === "page" ? "active" : ""}`}
          onClick={() => onViewMode("page")}
          title="页式视图"
        >
          页式
        </button>
        <button
          className={`status-btn ${viewMode === "wide" ? "active" : ""}`}
          onClick={() => onViewMode("wide")}
          title="全宽视图"
        >
          全宽
        </button>
        <button
          className="status-btn"
          onClick={() => onThemeChange(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
          title={`主题：${theme === "dark" ? "深色" : theme === "light" ? "浅色" : "跟随系统"}`}
        >
          {theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"} {theme === "dark" ? "深色" : theme === "light" ? "浅色" : "跟随系统"}
        </button>
      </div>
    </div>
  );
}
