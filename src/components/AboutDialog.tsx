import { useEffect, useState } from "react";
import {
  fetchRemoteVersion,
  compareVersions,
  APP_TAGLINE,
  type RemoteVersion,
} from "../utils/updateCheck";
import { startInAppUpgrade } from "../utils/inAppUpdater";

interface AboutDialogProps {
  currentVersion: string;
  onClose: () => void;
}

type Status =
  | { kind: "loading" }
  | { kind: "uptodate" }
  | { kind: "newversion"; remote: RemoteVersion }
  | { kind: "offline"; error: string };

export function AboutDialog({ currentVersion, onClose }: AboutDialogProps) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const remote = await fetchRemoteVersion();
      if (!mounted) return;
      if (!remote || !remote.version) {
        setStatus({ kind: "offline", error: remote === null ? "无法连接到更新服务器" : "服务器返回无效版本号" });
        return;
      }
      if (compareVersions(remote.version, currentVersion) > 0) {
        setStatus({ kind: "newversion", remote });
      } else {
        setStatus({ kind: "uptodate" });
      }
    })();
    return () => {
      mounted = false;
    };
  }, [currentVersion]);

  // ESC 关闭 + 阻止背景滚动
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onDownload = async () => {
    // 与启动弹窗一致:走 in-app streaming 下载 + 启动 installer + 关窗,
    // 不再 openUrl 跳浏览器
    if (status.kind !== "newversion") return;
    const remote = status.remote;
    const downloadUrl = remote.url;
    if (!downloadUrl) return;
    // 从 URL 末段拿文件名,失败回退恒定
    const filename = (() => {
      try {
        const u = new URL(downloadUrl);
        const fromPath = u.pathname.split("/").pop() || "";
        if (fromPath.endsWith(".exe")) return fromPath;
        const fromQuery = u.searchParams.get("file") || "";
        if (fromQuery.endsWith(".exe")) return fromQuery;
      } catch {
        /* 不致命 */
      }
      return `WeavePage-${remote.version}_x64-setup.exe`;
    })();
    try {
      await startInAppUpgrade(downloadUrl, filename);
    } catch (e) {
      console.warn("AboutDialog in-app upgrade 失败:", e);
      // 错误已由 startInAppUpgrade 内部 message() 弹给用户,此 catch 仅防未捕获
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="about-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="about-header">
          <div className="about-logo">W</div>
          <div className="about-titles">
            <h2>WeavePage 织页</h2>
            <p className="about-tagline">{APP_TAGLINE}</p>
          </div>
        </div>

        <div className="about-info">
          <div className="about-row">
            <span className="about-label">当前版本</span>
            <span className="about-value">v{currentVersion}</span>
          </div>
          <div className="about-row">
            <span className="about-label">更新状态</span>
            <span className="about-value">
              {status.kind === "loading" && "正在检查…"}
              {status.kind === "uptodate" && (
                <span className="about-status-ok">已是最新版本</span>
              )}
              {status.kind === "newversion" && (
                <span className="about-status-new">
                  发现新版本 v{status.remote.version}
                </span>
              )}
              {status.kind === "offline" && (
                <span className="about-status-err">无法检查更新 · {status.error}</span>
              )}
            </span>
          </div>

          {status.kind === "newversion" && status.remote.notes && (
            <div className="about-notes">{status.remote.notes}</div>
          )}
        </div>

        <div className="about-actions">
          {status.kind === "newversion" && (
            <button className="about-btn-primary" onClick={onDownload}>
              立即更新
            </button>
          )}
          <button className="about-btn-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}