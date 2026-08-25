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
  var wrap = document.querySelector('.wp-toc-floating-wrap');
  if (!wrap) return;

  // h3-submenu 是 wrap 的直接子节点(wrap 是 fixed,创建 containing block,
  // submenu 用 absolute + right:100% 跳到 wrap 左侧)。
  // 通过 data-for="<target-id>" 关联到对应的 h2-item。
  var submenus = wrap.querySelectorAll('.wp-toc-h3-submenu');
  Array.prototype.forEach.call(submenus, function(submenu) {
    var list = submenu.querySelector('.wp-toc-h3-submenu-list');
    if (!list) return;
    // 初始化:把 data-h3-ids/texts JSON 解析到 list(只有首次需要)
    if (!list.children.length) {
      var h3Ids = [], h3Texts = [];
      try {
        h3Ids = JSON.parse(submenu.getAttribute('data-h3-ids') || '[]');
        h3Texts = JSON.parse(submenu.getAttribute('data-h3-texts') || '[]');
      } catch (e) {}
      for (var i = 0; i < h3Ids.length; i++) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.className = 'wp-toc-h3-link';
        a.href = '#' + h3Ids[i];
        a.textContent = h3Texts[i] || h3Ids[i];
        li.appendChild(a);
        list.appendChild(li);
      }
    }
  });

  // h2-item hover → 找到对应 submenu 并显示 + 动态对齐 top
  // v2.0.1:鼠标从 h2-item 移到 h3-submenu 时,中间有 ~8px 间隙(margin-right),
  // 原来 submenu.contains(relatedTarget) 检测会在间隙内失败,瞬间关闭子菜单。
  // v2.0.2:延长关闭延迟到 1500ms(用户反馈 350ms 反向移动 h3→h2 偶尔还消失),
  // 同时给所有 submenu 也挂 mouseenter/mouseleave(它们的 bbox 在 wrap 外,
  // wrap.mouseleave 触发时鼠标可能在 submenu 上,submenu 自己 enter 才能取消 close)。
  // v2.0.2:h2-item enter 时关闭所有其他 submenu,只显示当前一个(避免多 submenu 同时显示)。
  // v2.0.5:再延长到 2000ms + h2-item 加 is-active class — 子菜单打开时对应的 h2-item
  // 保持高亮,即使鼠标离开也不"消失"(用户:只要子菜单存在,h2 菜单就不应消失)
  // v2.0.6:加 wrap.has-submenu-open class — 子菜单打开时面板必须显示
  //(之前依赖 wrap:hover,鼠标移到 wrap 外面板就看不到,只剩按钮)
  var CLOSE_DELAY_MS = 2000;
  var closeTimer = null;

  var cancelClose = function() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  };
  // 同步 wrap 上的"是否有 submenu 打开"标记 — CSS 用 .has-submenu-open 显示面板
  var syncWrapOpenClass = function() {
    var hasOpen = wrap.querySelector('.wp-toc-h3-submenu.is-open') !== null;
    if (hasOpen) {
      wrap.classList.add('has-submenu-open');
    } else {
      wrap.classList.remove('has-submenu-open');
    }
  };
  var scheduleClose = function() {
    cancelClose();
    closeTimer = setTimeout(function() {
      // 同时清除 is-active(子菜单关掉,h2-item 也不再高亮)
      Array.prototype.forEach.call(wrap.querySelectorAll('.wp-toc-h3-submenu.is-open'), function(s) {
        s.classList.remove('is-open');
      });
      Array.prototype.forEach.call(wrap.querySelectorAll('.wp-toc-h2-item.is-active'), function(item) {
        item.classList.remove('is-active');
      });
      syncWrapOpenClass();
      closeTimer = null;
    }, CLOSE_DELAY_MS);
  };

  // wrap mouseenter/mouseleave — wrap 自身 bbox 内(按钮 + panel)
  wrap.addEventListener('mouseenter', cancelClose);
  wrap.addEventListener('mouseleave', scheduleClose);

  // 所有 submenu(在 wrap 外,但 DOM 是 wrap 子节点)— 单独监听 enter/leave
  Array.prototype.forEach.call(wrap.querySelectorAll('.wp-toc-h3-submenu'), function(submenu) {
    submenu.addEventListener('mouseenter', cancelClose);
    submenu.addEventListener('mouseleave', scheduleClose);
  });

  // h2-item hover:关闭其他 submenu + 取消其他 is-active,显示自己 + 自己激活
  var h2Items = wrap.querySelectorAll('.wp-toc-h2-item');
  Array.prototype.forEach.call(h2Items, function(h2Item) {
    var targetId = h2Item.getAttribute('data-target');
    var submenu = wrap.querySelector('.wp-toc-h3-submenu[data-for="' + targetId + '"]');
    if (!submenu) return;

    h2Item.addEventListener('mouseenter', function() {
      cancelClose();
      // 关闭其他 submenu + 取消其他 is-active
      Array.prototype.forEach.call(wrap.querySelectorAll('.wp-toc-h3-submenu.is-open'), function(s) {
        if (s !== submenu) s.classList.remove('is-open');
      });
      Array.prototype.forEach.call(wrap.querySelectorAll('.wp-toc-h2-item.is-active'), function(item) {
        if (item !== h2Item) item.classList.remove('is-active');
      });
      var wrapRect = wrap.getBoundingClientRect();
      var itemRect = h2Item.getBoundingClientRect();
      // top 相对 wrap 的容器(viewport - wrapRect.top)
      submenu.style.top = (itemRect.top - wrapRect.top) + 'px';
      submenu.classList.add('is-open');
      h2Item.classList.add('is-active');
      syncWrapOpenClass();
    });
  });

  // 点击 wrap 内任意 anchor(h2-link 或 h3-link),滚动到对应 heading
  wrap.addEventListener('click', function(e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.length < 2) return;
    var id = href.slice(1);
    var tgt = document.getElementById(id);
    if (tgt) {
      e.preventDefault();
      tgt.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
})();
`;

// v0.1.13 第三十轮:TOC 全部 CSS(集中放在 saved file 的 <head> 之间)
// wrap 固定到 viewport 右上角,panel 在 wrap 下方,
// 每个 h2-item hover 显示自己专属的 h3-submenu(从该 h2 左侧弹出)。
// 颜色主题蓝色基调,匹配 WeavePage 整体视觉。
const TOC_CSS = `
.wp-toc-floating-wrap {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 9999;
  width: 280px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #1f2328;
  user-select: none;
  -webkit-user-select: none;
}
.wp-toc-floating-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: #ffffff;
  border: 1px solid #d0d8e0;
  border-radius: 22px;
  padding: 8px 16px;
  box-shadow: 0 2px 12px rgba(0, 48, 112, 0.15);
  color: #003070;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s ease;
  box-sizing: border-box;
}
.wp-toc-floating-btn:hover {
  background: #f0f4f8;
  border-color: #003070;
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 48, 112, 0.2);
}
.wp-toc-floating-panel {
  display: none;
  width: 280px;
  max-height: 60vh;
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid #d0d8e0;
  border-radius: 10px;
  margin-top: 6px;
  box-shadow: 0 8px 28px rgba(0, 48, 112, 0.18);
  box-sizing: border-box;
}
.wp-toc-floating-wrap:hover .wp-toc-floating-panel,
.wp-toc-floating-panel.is-open,
/* v2.0.6:子菜单打开时,面板也必须显示 — 否则鼠标从子菜单返回 wrap 间隙
   会让面板消失,只剩按钮可见(h2-item 无法点击) */
.wp-toc-floating-wrap.has-submenu-open .wp-toc-floating-panel {
  display: block;
}
.wp-toc-panel-header {
  padding: 10px 16px;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
  background: linear-gradient(135deg, #003070 0%, #1a4480 100%);
  border-radius: 10px 10px 0 0;
  letter-spacing: 0.5px;
}
.wp-toc-h2-list {
  list-style: none;
  padding: 4px 0;
  margin: 0;
}
.wp-toc-h2-item {
  position: relative;
  margin: 0;
}
.wp-toc-h2-link {
  display: block;
  padding: 9px 16px;
  color: #1f2328;
  text-decoration: none;
  font-size: 13px;
  line-height: 1.5;
  border-left: 3px solid transparent;
  transition: all 0.12s ease;
  box-sizing: border-box;
}
.wp-toc-h2-item:hover > .wp-toc-h2-link,
.wp-toc-h2-item.is-active > .wp-toc-h2-link {
  background: #f0f4f8;
  color: #1a56db;
  border-left-color: #1a56db;
}
.wp-toc-h3-submenu {
  display: none;
  /* 以 .wp-toc-floating-wrap(fixed)为定位基准:wrap 创建 containing block,
     right:100% = 跳到 wrap 左侧,submenu 宽度固定不依赖父 width */
  position: absolute;
  top: 0;
  right: 100%;
  margin-right: 8px;
  width: 320px;
  max-height: 60vh;
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid #d0d8e0;
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0, 48, 112, 0.18);
  z-index: 2;
  box-sizing: border-box;
}
.wp-toc-h3-submenu.is-open {
  display: block;
}
.wp-toc-h3-submenu-list {
  list-style: none;
  padding: 4px 0;
  margin: 0;
}
.wp-toc-h3-link {
  display: block;
  padding: 9px 16px;
  color: #1f2328;
  text-decoration: none;
  font-size: 12px;
  line-height: 1.5;
  border-left: 3px solid transparent;
  transition: all 0.12s ease;
  box-sizing: border-box;
}
.wp-toc-h3-link:hover {
  background: #f0f4f8;
  color: #1a56db;
  border-left-color: #1a56db;
}
`;

// 把 TOC_CSS 包成 <style> 标签(含 id 标识,便于 toggling 时按 id 移除)
// v2.0.2:前后加 HTML 注释标记,方便用户在源代码视图识别 / 编辑
export function buildTocStyleTag(): string {
  return (
    `<!-- WeavePage TOC: 样式(可编辑) -->\n` +
    `<style id="wp-toc-style">\n${TOC_CSS}\n</style>\n` +
    `<!-- /WeavePage TOC: 样式 -->`
  );
}

// 从 head 字符串里移除 TOC style 标签(按 id 标识)
// 注意:不能直接用注释包裹判断 — 注释里的 <style> 也会被 regex 匹配
// 仅匹配真正的 <style id="wp-toc-style">...</style>
export function removeTocStyleTag(head: string): string {
  return head.replace(/<style\s+id=["']wp-toc-style["']>[\s\S]*?<\/style>/gi, "");
}

// 判断 head 字符串里是否已含 TOC style
export function hasTocStyleTag(head: string): boolean {
  return /<style\s+id=["']wp-toc-style["']>/i.test(head);
}

// 生成 doc-toc atom 的 tocHtml 字符串
// 第三十轮:全部 CSS 移到 <head>(由 buildTocStyleTag 注入),这里只输出 class 结构
export function buildTocHtml(entries: TocEntry[]): string {
  // 第三十轮:把 h3-submenu 移到 wrap 直接子节点(wrap 是 position:fixed,
  // 创建 containing block,submenu absolute 定位稳定),不在 h2-item 内
  // — 避免 li 默认样式 + 子节点 absolute 的渲染不确定性
  const h2ListItems: string[] = [];
  const submenuElements: string[] = [];
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
    // h2 list item(不含 submenu)
    h2ListItems.push(
      `<li class="wp-toc-h2-item" data-target="${target}">` +
      `<a href="#${target}" class="wp-toc-h2-link">${escHtml(e.text)}</a>` +
      `</li>`,
    );
    // submenu:作为 wrap 的兄弟节点(panel 之后),用 data-for 关联 h2
    if (h3Ids.length > 0) {
      submenuElements.push(
        `<div class="wp-toc-h3-submenu" data-for="${target}" data-h3-ids='${JSON.stringify(h3Ids)}' data-h3-texts='${JSON.stringify(h3Texts)}'>` +
        `<ul class="wp-toc-h3-submenu-list"></ul>` +
        `</div>`,
      );
    }
    i = j;
  }

  // v2.0.4:HTML 注释完整包住 doc-toc 外层 + wp-toc-floating-wrap + script
  // (之前只包了 wrap,doc-toc 外层 div 没在注释里)
  return (
    `<!-- WeavePage TOC: 结构(可编辑) -->\n` +
    `<div class="doc-toc" data-toc="1" data-doc-toc="1">\n` +
    `<div class="wp-toc-floating-wrap">` +
    `<button class="wp-toc-floating-btn" type="button">` +
    `<span aria-hidden="true">📑</span>` +
    `<span>目录</span>` +
    `<span aria-hidden="true">▾</span>` +
    `</button>` +
    `<div class="wp-toc-floating-panel" role="region" aria-label="文档目录">` +
    `<h3 class="wp-toc-panel-header">文档大纲</h3>` +
    `<ul class="wp-toc-h2-list">${h2ListItems.join("")}</ul>` +
    `</div>` +
    submenuElements.join("") +
    `</div>\n` +
    `</div>\n` +
    `<!-- /WeavePage TOC: 结构 -->\n` +
    `<script>\n` +
    `// WeavePage TOC: 行为脚本(可编辑)\n` +
    `${TOC_SCRIPT}\n` +
    `// /WeavePage TOC\n` +
    `</script>`
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
// v2.0.4:buildTocHtml 已经包了 <div class="doc-toc"> + 注释,这里直接插入
export function insertDocTocInHtml(html: string, tocHtml: string): string {
  const doc = parseHtml(html);
  const body = doc.body;
  if (!body) return tocHtml + html;
  body.insertAdjacentHTML("afterbegin", tocHtml);
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