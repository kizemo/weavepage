// 注入到预览 iframe 末尾的 <style> 块
// CSS 类名前缀:.doc-toc / .wp-toc-floating,避免污染用户文档
export const TOC_STYLES = `<style id="wp-toc-styles">
.doc-toc {
  margin: 0 0 1.5em;
  padding: 0;
  background: #f5f5f5;
  border-radius: 6px;
  display: inline-block;
  min-width: 80px;
  position: relative;
  font-size: 14px;
}
.doc-toc-title {
  font-weight: 600;
  color: #444;
  padding: .5em .9em;
  cursor: pointer;
  user-select: none;
}
.doc-toc-title::after {
  content: "▾";
  margin-left: .4em;
  display: inline-block;
  transition: transform .15s ease;
}
.doc-toc.is-open .doc-toc-title::after { transform: rotate(180deg); }
.doc-toc-list-wrap {
  max-height: 0;
  overflow: hidden;
  transition: max-height .2s ease;
}
.doc-toc:hover .doc-toc-list-wrap,
.doc-toc.is-open .doc-toc-list-wrap {
  max-height: 60vh;
  overflow-y: auto;
}
.doc-toc-list, .doc-toc-list ul { list-style: none; padding-left: 0; margin: 0; }
.doc-toc-list { padding: 0 .9em .6em; }
.doc-toc-list ul { padding-left: 1.2em; margin-top: .2em; }
.doc-toc-h2 {
  display: block; padding: .15em 0;
  color: #1976d2; text-decoration: none;
}
.doc-toc-h3 {
  display: block; padding: .1em 0;
  color: #555; font-size: .92em; text-decoration: none;
}
.doc-toc-h2:hover, .doc-toc-h3:hover { text-decoration: underline; }
.doc-toc-empty-msg {
  padding: .5em .9em; color: #999; font-size: .9em;
}

.wp-toc-floating {
  position: fixed;
  top: 80px;
  right: 24px;
  z-index: 900;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #ddd;
  box-shadow: 0 2px 8px rgba(0,0,0,.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  cursor: pointer;
}
.wp-toc-floating:hover { background: #f5f5f5; }
.wp-toc-floating-panel {
  position: fixed;
  top: 80px;
  right: 72px;
  z-index: 901;
  min-width: 220px;
  max-width: 320px;
  max-height: 60vh;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: .6em .8em;
  box-shadow: 0 4px 16px rgba(0,0,0,.18);
  display: none;
}
.wp-toc-floating.is-open + .wp-toc-floating-panel,
.wp-toc-floating-panel:hover { display: block; }
.wp-toc-floating-panel .doc-toc-list { padding: 0; }
.wp-toc-floating-panel .doc-toc-list ul { padding-left: 1em; }
.wp-toc-floating-item { position: relative; }
.wp-toc-floating-submenu {
  position: absolute;
  top: 0;
  right: 100%;
  margin-right: 8px;
  min-width: 180px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: .4em .6em;
  box-shadow: 0 4px 12px rgba(0,0,0,.15);
  display: none;
  z-index: 902;
}
.wp-toc-floating-item:hover > .wp-toc-floating-submenu { display: block; }
.wp-toc-floating-item.is-current > a { font-weight: 700; color: #d23; }
</style>`;