// TOC:纯函数层(slug / scan / assign heading id)
//
// 不依赖 ProseMirror transaction 之外的副作用,所有 Tiptap 集成都用纯函数调用。
//
// v0.1.13 起,TOC UI 由 src/components/TocFloating.tsx(React Portal)负责:
// - wrap 挂到 document.body,绕开 PM contenteditable 上下文,Tauri webview 兼容
// - hover/click 由 React onMouseEnter/Leave/onClick 处理,不靠内联 <script>
// - 子菜单(Portal)用 React state 管理,跨浏览器一致
//
// 本文件提供:
//   slugify(text, index)             — 把 heading 文本转成 id 候选
//   uniqueSlug(base, taken)          — 去重
//   scanHeadings(root)               — 读 DOM 上的 h2/h3 → TocEntry[]
//   scanTocEntries(editor)           — 从 Tiptap editor.view.dom 读 entries
//   assignHeadingIds(editor, dom, entries) — 写 heading.id 到 PM node.attrs
//   clearHeadingIds(root)            — 清空带 wp-toc- 前缀的 heading id

export function slugify(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || `n${index}`;
}

export function uniqueSlug(base: string, taken: Set<string>): string {
  let s = base;
  let n = 2;
  while (taken.has(s)) {
    s = `${base}-${n++}`;
  }
  taken.add(s);
  return s;
}

export interface TocEntry {
  level: 2 | 3;
  text: string;
  id: string;
}

// 扫描 root 下的 h2 / h3;空 textContent 跳过;返回顺序 = DOM 顺序
export function scanHeadings(root: HTMLElement): TocEntry[] {
  const out: TocEntry[] = [];
  const taken = new Set<string>();
  const nodes = root.querySelectorAll("h2, h3");
  nodes.forEach((el, idx) => {
    const tag = el.tagName.toLowerCase();
    if (tag !== "h2" && tag !== "h3") return;
    const level = (tag === "h2" ? 2 : 3) as 2 | 3;
    const text = (el.textContent ?? "").trim();
    if (!text) return;
    let id = el.id || "";
    if (!id) {
      const base = slugify(text, idx + 1);
      id = `wp-toc-${uniqueSlug(base, taken)}`;
    } else {
      taken.add(id);
    }
    out.push({ level, text, id });
  });
  return out;
}

// 通过 PM transaction 把 entry.id 写回 node.attrs — 必须用 transaction,
// 因为 PM 的 DOMObserver 不会反向同步 DOM 属性变更到 node state;
//
// 第二十六轮:用 state.doc.descendants 遍历找 heading,contentPos = pos + 1。
// 之前用 editor.view.posAtDOM + tr.doc.nodeAt 对 doc 第一个 heading 会失败:
// posAtDOM 可能返回 0(node start position),nodeAt(0) 返回 doc 根节点,
// setNodeMarkup(0, ...) 会替换整个 doc → schema validation 失败 → 静默失败
// → doc 第一个 heading 永远写不到 id(Bug C 真正根因)。
export function assignHeadingIds(editor: Editor, root: HTMLElement, entries: TocEntry[]): void {
  // 必须与 scanHeadings 同步过滤空 textContent 标题(否则 index 错位)
  const nodes = Array.from(root.querySelectorAll("h2, h3")).filter(
    (el) => (el.textContent ?? "").trim() !== ""
  );
  editor.chain().focus(undefined, { scrollIntoView: false }).command(({ tr, state }) => {
    entries.forEach((e, i) => {
      const el = nodes[i];
      if (!el) return;
      try {
        // 用 state.doc.descendants 找 heading,contentPos = pos + 1
        // (heading 是 block,content position 是 start + 1)
        let contentPos = -1;
        state.doc.descendants((node, pos) => {
          if (contentPos !== -1) return false;
          if (node.type.name !== "heading") return true;
          const dom = editor.view.nodeDOM(pos);
          if (dom === el) {
            contentPos = pos + 1;
            return false;
          }
          return true;
        });
        if (contentPos === -1) return;
        const node = state.doc.nodeAt(contentPos);
        if (!node) return;
        if (node.attrs.id !== e.id) {
          const newAttrs = { ...node.attrs, id: e.id || null };
          tr.setNodeMarkup(contentPos, undefined, newAttrs);
        }
      } catch {
        // nodeDOM 或 setNodeMarkup 异常时跳过(罕见:detached DOM / schema 不匹配)
      }
    });
    return true;
  }).run();
}

export function clearHeadingIds(root: HTMLElement): void {
  root.querySelectorAll("h2, h3").forEach((el) => {
    if (el.id.startsWith("wp-toc-")) el.removeAttribute("id");
  });
}

// import Editor 类型(避免循环依赖)
import type { Editor } from "@tiptap/core";

export function scanTocEntries(editor: Editor): TocEntry[] {
  const dom = editor.view.dom as HTMLElement;
  return scanHeadings(dom);
}

// ============================================================================
// v0.1.13 第二十七轮:inline doc-toc 插入/删除
// ============================================================================
//
// 设计要点:
// - doc-toc 是 atom 节点(tocHtml attr 存完整 HTML 字符串)
// - 插入到 doc body 开头(便于源代码编辑查看)
// - 用 PM transaction 走 undo/redo(Tiptap 原生支持)
// - toggle 按钮根据 doc 内是否含 docToc atom 自动切换状态
//
// 第二十八轮:完全去掉 <style> 块,所有 CSS 用 inline style attribute。
// 原因:Tiptap PM parseHTML 对 atom innerHTML 的 <style> 元素处理不可靠
// (可能被 strip 或不应用),导致 wrap 在 WeavePage 编辑器 + Chrome 浏览器
// 都渲染成 inline 块状。inline style 是 attribute,PM serialize 一定保留,
//浏览器 parse 后一定生效。

const TOC_SCRIPT = `
(function(){
  var wrap = document.getElementById('wp-toc-floating-wrap');
  if (!wrap) return;
  var btn = document.getElementById('wp-toc-floating-btn');
  var panel = document.getElementById('wp-toc-floating-panel');
  var submenu = document.getElementById('wp-toc-h3-submenu');
  var submenuUl = submenu ? submenu.querySelector('.wp-toc-h3-submenu-list') : null;
  var h2Items = wrap.querySelectorAll('.wp-toc-h2-item');

  function showPanel() { if (panel) panel.style.display = 'block'; }
  function hidePanel() { if (panel) panel.style.display = 'none'; }
  function showSubmenu() { if (submenu) submenu.style.display = 'block'; }
  function hideSubmenu() { if (submenu) submenu.style.display = 'none'; if (submenuUl) submenuUl.innerHTML = ''; }

  var closeTimer = null;
  function scheduleHide() {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(function() {
      hidePanel();
      hideSubmenu();
      closeTimer = null;
    }, 300);
  }
  function cancelHide() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  }

  wrap.addEventListener('mouseenter', function() {
    cancelHide();
    showPanel();
  });
  wrap.addEventListener('mouseleave', function() {
    scheduleHide();
  });

  Array.prototype.forEach.call(h2Items, function(h2Item) {
    h2Item.addEventListener('mouseenter', function() {
      cancelHide();
      showPanel();
      var h3Ids, h3Texts;
      try {
        h3Ids = JSON.parse(h2Item.getAttribute('data-h3-ids') || '[]');
        h3Texts = JSON.parse(h2Item.getAttribute('data-h3-texts') || '[]');
      } catch (e) { return; }
      if (!h3Ids.length) { hideSubmenu(); return; }
      if (submenuUl) {
        submenuUl.innerHTML = '';
        for (var i = 0; i < h3Ids.length; i++) {
          var li = document.createElement('li');
          var a = document.createElement('a');
          a.href = '#' + h3Ids[i];
          a.className = 'wp-toc-h3-link';
          a.textContent = h3Texts[i] || h3Ids[i];
          a.setAttribute('data-target', h3Ids[i]);
          li.appendChild(a);
          submenuUl.appendChild(li);
        }
        var h2Rect = h2Item.getBoundingClientRect();
        var wrapRect = wrap.getBoundingClientRect();
        submenu.style.top = (h2Rect.top - wrapRect.top) + 'px';
        showSubmenu();
      }
    });
    h2Item.addEventListener('mouseleave', function(e) {
      if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
      scheduleHide();
    });
    var a = h2Item.querySelector('a.wp-toc-h2-link');
    if (a) {
      a.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var id = h2Item.getAttribute('data-target');
        var tgt = document.getElementById(id);
        if (tgt) {
          tgt.scrollIntoView({ behavior: 'smooth', block: 'start' });
          hideSubmenu();
          hidePanel();
        }
      });
    }
  });

  if (submenu) {
    submenu.addEventListener('mouseenter', cancelHide);
    submenu.addEventListener('click', function(e) {
      var a = e.target.closest && e.target.closest('a[data-target]');
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      var id = a.getAttribute('data-target');
      var tgt = document.getElementById(id);
      if (tgt) {
        tgt.scrollIntoView({ behavior: 'smooth', block: 'start' });
        hideSubmenu();
        hidePanel();
      }
    });
  }
})();
`;

// 生成 doc-toc atom 的 tocHtml 字符串(完整 inline-style HTML 模板)
// 所有 CSS 用 inline style 属性,不用 <style> 块,确保 PM serialize + 浏览器 parse 都生效
export function buildTocHtml(entries: TocEntry[]): string {
  // 构造 h2 list(每个 h2-item 含 h3-ids/texts JSON,供 submenu 渲染用)
  const h2ListItems: string[] = [];
  let i = 0;
  while (i < entries.length) {
    const e = entries[i]!;
    if (e.level !== 2) {
      i++;
      continue;
    }
    const h3Children: TocEntry[] = [];
    let j = i + 1;
    while (j < entries.length && entries[j]!.level === 3) {
      h3Children.push(entries[j]!);
      j++;
    }
    const h3Ids = h3Children.map((h3) => h3.id);
    const h3Texts = h3Children.map((h3) => h3.text);
    const target = e.id;
    h2ListItems.push(
      `<li class="wp-toc-h2-item" style="list-style: none; margin: 0; padding: 0; transition: background-color 0.12s ease;" data-h3-ids='${JSON.stringify(h3Ids)}' data-h3-texts='${JSON.stringify(h3Texts)}' data-target="${target}" onmouseenter="this.style.background='#f0f4f8'" onmouseleave="this.style.background=''"><a href="#${target}" class="wp-toc-h2-link" style="display: block; padding: 9px 16px; color: #1f2328; text-decoration: none; font-size: 13px; line-height: 1.5; border-left: 3px solid transparent; transition: all 0.12s ease; box-sizing: border-box;">${escHtml(e.text)}</a></li>`,
    );
    i = j;
  }

  // 所有 CSS 用 inline style(确保 PM serialize + 浏览器 parse 都生效)
  return (
    `<div id="wp-toc-floating-wrap" class="wp-toc-floating-wrap" style="position: fixed; top: 24px; right: 24px; z-index: 9999; display: block; width: 280px; background: transparent; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif; font-size: 14px; line-height: 1.5;">` +
    `<button id="wp-toc-floating-btn" class="wp-toc-floating-btn" type="button" style="position: relative; display: flex; width: 100%; align-items: center; gap: 6px; background: #ffffff; border: 1px solid #d0d8e0; border-radius: 22px; padding: 8px 16px; box-shadow: 0 2px 12px rgba(0, 48, 112, 0.15); color: #003070; font-weight: 600; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s ease; box-sizing: border-box;" onmouseenter="this.style.background='#f0f4f8'; this.style.borderColor='#003070'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 16px rgba(0, 48, 112, 0.2)';" onmouseleave="this.style.background='#ffffff'; this.style.borderColor='#d0d8e0'; this.style.transform=''; this.style.boxShadow='0 2px 12px rgba(0, 48, 112, 0.15)';">` +
    `<span aria-hidden="true">📑</span><span>目录</span><span aria-hidden="true">▾</span>` +
    `</button>` +
    `<div id="wp-toc-floating-panel" class="wp-toc-floating-panel" role="region" aria-label="文档目录" style="display: none; position: absolute; top: 42px; right: 0; width: 280px; max-height: 60vh; overflow-y: auto; background: #ffffff; border: 1px solid #d0d8e0; border-radius: 10px; box-shadow: 0 8px 28px rgba(0, 48, 112, 0.18); z-index: 1; box-sizing: border-box;">` +
    `<h3 style="padding: 10px 16px; margin: 0; font-size: 13px; font-weight: 600; color: #ffffff; background: linear-gradient(135deg, #003070 0%, #1a4480 100%); border-bottom: none; border-radius: 10px 10px 0 0; letter-spacing: 0.5px;">文档大纲</h3>` +
    `<ul class="wp-toc-h2-list" style="list-style: none; padding: 4px 0; margin: 0;">${h2ListItems.join("")}</ul>` +
    `</div>` +
    `<div id="wp-toc-h3-submenu" class="wp-toc-h3-submenu" role="region" aria-label="h3 子菜单" style="display: none; position: absolute; top: 42px; right: 288px; width: 320px; max-height: 60vh; overflow-y: auto; background: #ffffff; border: 1px solid #d0d8e0; border-radius: 10px; box-shadow: 0 8px 28px rgba(0, 48, 112, 0.18); z-index: 2; box-sizing: border-box;">` +
    `<ul class="wp-toc-h3-submenu-list" style="list-style: none; padding: 4px 0; margin: 0;"></ul>` +
    `</div>` +
    `</div>` +
    `<script>${TOC_SCRIPT}</script>`
  );
}

const escHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));

// 检查 doc 是否已含 doc-toc atom
export function hasTocInDoc(editor: Editor): boolean {
  if (!editor || !editor.schema.nodes.docToc) return false;
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === "docToc") {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

// 切换 doc-toc:不存在则插入,存在则删除
// 返回新状态(after toggle):true = 已插入, false = 未插入
export function toggleToc(editor: Editor): boolean {
  if (!editor || !editor.schema.nodes.docToc) return false;
  const has = hasTocInDoc(editor);
  if (has) {
    removeToc(editor);
    return false;
  } else {
    insertToc(editor);
    return true;
  }
}

// 插入 doc-toc 到 doc body 开头(便于源代码编辑查看)
// 已有 doc-toc 则更新 tocHtml(刷新扫描)
export function insertToc(editor: Editor): void {
  if (!editor || !editor.schema.nodes.docToc) return;
  // 同步 heading id:扫一遍,确保 tocHtml 里的 href 对应的 id 都在 DOM 上
  const dom = editor.view.dom as HTMLElement;
  const entries = scanTocEntries(editor);
  assignHeadingIds(editor, dom, entries);
  // 即使无 h2/h3 也插入空 TOC(让按钮状态正确)
  const tocHtml = buildTocHtml(entries);

  editor.chain().command(({ tr, state, dispatch }) => {
    const docTocType = state.schema.nodes.docToc;
    if (!docTocType) return false;

    // 找已有 doc-toc atom
    let existingPos: number | null = null;
    state.doc.descendants((node, pos) => {
      if (node.type.name === "docToc") {
        existingPos = pos + 1; // content position
        return false;
      }
      return true;
    });

    if (existingPos !== null) {
      // 已有:更新 tocHtml(用 setNodeMarkup at content position)
      tr.setNodeMarkup(existingPos, undefined, { tocHtml });
    } else {
      // 无:插入 doc-toc atom 到 doc 开头
      const newNode = docTocType.create({ tocHtml });
      tr.insert(0, newNode);
    }
    dispatch && dispatch(tr);
    return true;
  }).run();
}

// 从 doc 中删除 doc-toc atom
export function removeToc(editor: Editor): void {
  if (!editor || !editor.schema.nodes.docToc) return;
  editor.chain().command(({ tr, state, dispatch }) => {
    let pos: number | null = null;
    let size = 0;
    state.doc.descendants((node, p) => {
      if (node.type.name === "docToc") {
        pos = p;
        size = node.nodeSize;
        return false;
      }
      return true;
    });
    if (pos !== null) {
      tr.delete(pos, pos + size);
    }
    dispatch && dispatch(tr);
    return true;
  }).run();
}

// v0.1.13 第二十八轮:刷新 doc-toc atom 的 tocHtml 为最新版本
// 用途:加载旧版 doc 时,tocHtml 可能是 `<style>` 块版本(Tiptap PM atom 内 `<style>` 不生效),
// 自动 rebuild 为 inline style 版本,确保编辑器 + 浏览器显示一致。
export function refreshTocHtml(editor: Editor): void {
  if (!editor || !editor.schema.nodes.docToc) return;
  editor.chain().command(({ tr, state, dispatch }) => {
    let existingPos: number | null = null;
    state.doc.descendants((node, pos) => {
      if (node.type.name === "docToc") {
        existingPos = pos + 1; // content position
        return false;
      }
      return true;
    });
    if (existingPos === null) return false;
    const dom = editor.view.dom as HTMLElement;
    const entries = scanTocEntries(editor);
    assignHeadingIds(editor, dom, entries);
    const tocHtml = buildTocHtml(entries);
    tr.setNodeMarkup(existingPos, undefined, { tocHtml });
    dispatch && dispatch(tr);
    return true;
  }).run();
}

// ============================================================================
// v0.1.13 第三十轮:iframe-based 编辑器的 docHtml 字符串层 TOC helpers
//
// 不依赖 Tiptap PM,直接对 HTML 字符串做 parse → 修改 → 输出。
// 主要用于:
//   - TocFloating 扫描 iframe.contentDocument.body 的 h2/h3
//   - onToggleToc 直接在 docHtml 字符串里插入/删除 doc-toc atom
//   - hasTocEnabled 检测 docHtml 是否含 doc-toc 节点
// ============================================================================

/** 用 DOMParser 解析 HTML 字符串,返回 Document(主线程 DOMParser) */
function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** docHtml 是否含 doc-toc 节点(<div class="doc-toc" ...>) */
export function hasDocTocInHtml(html: string): boolean {
  if (!html) return false;
  const doc = parseHtml(html);
  return !!doc.querySelector(".doc-toc, [data-type='doc-toc'], doc-toc, .wp-toc-floating-wrap");
}

/** 从 HTML 字符串扫描 h2/h3 标题,返回 TocEntry[] */
export function scanHeadingsFromHtml(html: string): TocEntry[] {
  if (!html) return [];
  const doc = parseHtml(html);
  return scanHeadings(doc.body);
}

/** 切换 doc-toc atom:返回新 docHtml + 是否启用 */
export function toggleDocTocInHtml(html: string): { html: string; enabled: boolean } {
  if (hasDocTocInHtml(html)) {
    return { html: removeDocTocInHtml(html), enabled: false };
  } else {
    const entries = scanHeadingsFromHtml(html);
    const tocHtml = buildTocHtml(entries);
    return { html: insertDocTocInHtml(html, tocHtml), enabled: true };
  }
}

/** 在 docHtml 字符串开头插入 doc-toc atom(完整 HTML 形式,不依赖 Tiptap) */
export function insertDocTocInHtml(html: string, tocHtml: string): string {
  // 构造 doc-toc 节点(参考 DocToc extension renderHTML):
  // <div class="doc-toc" data-toc="1"><div class="wp-toc-floating-wrap">...</div></div>
  // 内层 wrap 由 buildTocHtml 提供;DocToc atom 自身只承担 schema 占位角色
  const tocNode = `<div class="doc-toc" data-toc="1" data-doc-toc="1">${tocHtml}</div>`;
  // 插到 body 最前(若有 <body> 标签则在 body 开头;否则 prepend)
  // parseHtml 用 text/html 总是有 body
  const doc = parseHtml(html);
  const body = doc.body;
  if (!body) return tocNode + html;
  body.insertAdjacentHTML("afterbegin", tocNode);
  return doc.body.innerHTML;
}

/** 从 docHtml 字符串里删除 doc-toc 节点 */
export function removeDocTocInHtml(html: string): string {
  if (!html) return html;
  const doc = parseHtml(html);
  const tocs = doc.body.querySelectorAll(".doc-toc, doc-toc, [data-doc-toc='1']");
  tocs.forEach((el) => el.parentNode?.removeChild(el));
  return doc.body.innerHTML;
}

/** 把 entries 中的 id 同步写入 docHtml 里的 h2/h3(修改 HTML 字符串) */
export function assignHeadingIdsInHtml(html: string, entries: TocEntry[]): string {
  if (!html) return html;
  const doc = parseHtml(html);
  const nodes = Array.from(doc.body.querySelectorAll("h2, h3")).filter(
    (el) => (el.textContent ?? "").trim() !== ""
  );
  nodes.forEach((el, i) => {
    const e = entries[i];
    if (e) el.id = e.id;
  });
  return doc.body.innerHTML;
}