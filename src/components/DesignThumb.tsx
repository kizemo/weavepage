import { type DesignMeta } from "../utils/designs";

// 缩略图内部通用样例 HTML(每个 design 共用,只换 design CSS)
const SAMPLE_HTML = `
<h1>一级标题</h1>
<h2>二级标题</h2>
<p>正文示例,展示<strong>粗体</strong>与<em>斜体</em>与<a href="#">链接</a>。</p>
<blockquote>引用块示例,展示左侧边线与背景。</blockquote>
<pre><code>const x = 'code';</code></pre>
<table><tr><th>表头</th><th>表头</th></tr><tr><td>单元格</td><td>单元格</td></tr></table>
<ul><li>列表项 1</li><li>列表项 2</li></ul>
<hr>
<p>行内 <code>code</code> 与 <kbd>Ctrl</kbd> 演示。</p>
`;

// 缩略图内部小字体规则(适配 90×60px 缩略图,字号压缩到 5-8px)
const THUMB_BODY_CSS = `
body { margin: 0; }
.design-thumb-body { font-size: 5px; line-height: 1.4; padding: 4px 6px; }
.design-thumb-body h1 { font-size: 8px; margin: 1px 0; }
.design-thumb-body h2 { font-size: 7px; margin: 1px 0; }
.design-thumb-body h3 { font-size: 6px; margin: 1px 0; }
.design-thumb-body p { margin: 1px 0; }
.design-thumb-body blockquote { margin: 1px 0; padding: 1px 4px; }
.design-thumb-body pre { margin: 1px 0; padding: 2px 3px; font-size: 4px; }
.design-thumb-body table { font-size: 4px; }
.design-thumb-body td, .design-thumb-body th { padding: 0px 2px; }
.design-thumb-body ul { padding-left: 8px; margin: 1px 0; }
.design-thumb-body hr { margin: 1px 0; }
.design-thumb-body img { max-width: 100%; height: auto; }
`;

interface DesignThumbProps {
  design: DesignMeta | null; // null = "默认"卡
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

// 构造缩略图 iframe srcdoc(iframe 自带 CSS 隔离,9 个 design 各自独立 CSS 域,不会冲突)
function buildThumbSrcDoc(design: DesignMeta): string {
  return `<!DOCTYPE html><html><head><style>${THUMB_BODY_CSS}\n${design.css}</style></head><body class="design-thumb-body">${SAMPLE_HTML}</body></html>`;
}

export function DesignThumb({ design, selected, onClick, disabled }: DesignThumbProps) {
  return (
    <button
      type="button"
      className={`design-thumb-card ribbon-thumb-mini ${selected ? "is-selected" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={design ? design.name : "默认(无设计样式)"}
    >
      <div
        className="design-thumb-frame"
        style={{
          background: design?.preview.bg ?? "#ffffff",
        }}
      >
        {design ? (
          <iframe
            className="design-thumb-iframe"
            title={design.name}
            sandbox=""
            srcDoc={buildThumbSrcDoc(design)}
          />
        ) : (
          // 默认卡:不嵌 iframe,直接渲染样例 HTML(浏览器默认样式 + serif)
          <div
            className="design-thumb-body default"
            style={{ fontFamily: "serif" }}
            dangerouslySetInnerHTML={{ __html: SAMPLE_HTML }}
          />
        )}
      </div>
      <span className="design-thumb-name">{design ? design.name : "默认"}</span>
    </button>
  );
}