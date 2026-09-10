// Goal 1+2 — iframe 内 block selector script(在 srcdoc 内执行)
// 完全在 iframe 内部自渲染 hover/selected overlay,跨 frame 监听问题彻底消除
// 与 outer App.tsx 通过 postMessage 通信:
//   outer → inner: { type: 'wp-set-style', prop, value }
//   inner → outer: { type: 'wp-block-selected', identity }
//
// 注意:这 script 在 iframe.contentWindow 内执行,所有 elementFromPoint/getComputedStyle
// 都是同 frame,无跨 realm 问题。
export const BLOCK_SELECTOR_SCRIPT = `
(function () {
  if (window.__wp_block_selector_installed) return;
  window.__wp_block_selector_installed = true;

  // v2.3.4:防御 — 清理可能在历史编辑中累积到 body 里的 overlay div
  //(v2.3.3 之前保存的 HTML body 里有 <div id="wp-hover-overlay"...> 等,
  // 这些会被 input 事件捕获进 docHtml → 又一次污染)
  // 必须在一切之前先清掉,确保后面 input 事件只捕获真正的用户内容
  ['wp-hover-overlay', 'wp-selected-overlay'].forEach(function (id) {
    var stale = document.getElementById(id);
    if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
  });

  // ---- 工具:从 element 找 BlockIdentity ----
  function nthOfType(el) {
    if (!el || !el.parentElement) return 0;
    var parent = el.parentElement;
    var siblings = Array.prototype.filter.call(
      parent.children,
      function (c) { return c.tagName === el.tagName; }
    );
    return siblings.indexOf(el);
  }
  function identityOf(el) {
    if (!el || el === document.body || el === document.documentElement) return null;
    return {
      tagName: el.tagName.toLowerCase(),
      nthOfType: nthOfType(el),
      textSample: (el.textContent || '').slice(0, 30),
    };
  }
  // 从 parentElement 链找 block ancestor
  // v2.3.3:IMG 视为 block 终点 — 默认 display:inline,会被原有规则跳过,
  // 导致点图片时选不中(img 跳出 selection 范围,选到上层 <p>)
  function blockFromPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return null;
    var cur = el;
    // 向上找到 block display 的元素(或 IMG)
    while (cur && cur !== document.body) {
      if (cur.tagName === 'IMG') return cur;
      var display = window.getComputedStyle(cur).display;
      if (display && display !== 'inline' && display !== 'inline-block' &&
          display !== 'inline-flex' && display !== 'inline-table') {
        return cur;
      }
      cur = cur.parentElement;
    }
    return el;
  }
  function breadcrumbOf(el) {
    var path = [];
    var cur = el;
    while (cur && cur.tagName !== 'BODY' && cur.tagName !== 'HTML') {
      path.unshift(cur.tagName.toLowerCase());
      cur = cur.parentElement;
    }
    return path.join(' > ') || el.tagName.toLowerCase();
  }

  // ---- 创建 / 复用 overlay 元素 ----
  // v2.3.4:挂到 documentElement 而不是 body — 避免被 input 事件
  //(body.addEventListener('input', () => setDocHtml(body.innerHTML)))
  // 捕获到 docHtml,导致保存到磁盘的 HTML 里残留 overlay div
  function ensureOverlay(id, className, borderStyle) {
    var el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('div');
    el.id = id;
    el.className = className;
    el.style.cssText = 'position:absolute;pointer-events:none;box-sizing:border-box;z-index:2147483600;' + borderStyle;
    document.documentElement.appendChild(el);
    return el;
  }
  var hoverBadge = document.createElement('span');
  hoverBadge.className = 'wp-hover-badge';
  hoverBadge.style.cssText = 'position:absolute;background:#94a3b8;color:white;font-size:11px;padding:1px 4px;border-radius:2px;';
  var selBadge = document.createElement('span');
  selBadge.className = 'wp-sel-badge';
  selBadge.style.cssText = 'position:absolute;background:#2563eb;color:white;font-size:11px;padding:1px 6px;border-radius:2px;white-space:nowrap;';

  // ---- 状态 ----
  var hoveredBlock = null;  // HTMLElement 引用(iframe 内)
  var selectedBlock = null;
  // v2.3.5:区分"刚点选块,准备删除"与"在块内编辑文字"
  // 块被 click 选中 → blockSelectionActive = true;用户开始打字(input 事件)→ false
  // Delete 只在 blockSelectionActive=true 时删块,否则让浏览器处理文本删字
  var blockSelectionActive = false;

  function positionOverlay(overlay, target, badge, badgeSide) {
    if (!target) return;
    var r = target.getBoundingClientRect();
    overlay.style.left = (r.left + window.scrollX) + 'px';
    overlay.style.top = (r.top + window.scrollY) + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
    if (badge) {
      overlay.appendChild(badge);
      if (badgeSide === 'left') {
        badge.style.left = '0';
        badge.style.top = '-18px';
        badge.style.right = '';
      } else {
        badge.style.right = '0';
        badge.style.top = '-20px';
        badge.style.left = '';
      }
    }
  }

  function clearHover() {
    var ov = document.getElementById('wp-hover-overlay');
    if (ov) ov.style.display = 'none';
    hoveredBlock = null;
  }

  // ---- mouseover: 更新 hover overlay ----
  document.addEventListener('mouseover', function (e) {
    var block = blockFromPoint(e.clientX, e.clientY);
    if (!block || block === document.body) { clearHover(); return; }
    hoveredBlock = block;
    var ov = ensureOverlay('wp-hover-overlay', 'wp-overlay wp-hover',
      'border:1px dashed #94a3b8;');
    ov.style.display = '';
    positionOverlay(ov, block, hoverBadge, 'left');
    hoverBadge.textContent = block.tagName.toLowerCase();
  });
  document.addEventListener('mouseout', function (e) {
    var rel = e.relatedTarget;
    if (rel && document.contains(rel)) return;
    clearHover();
  });

  // ---- mousedown + click:200ms 窗口 ----
  var lastMouseDown = 0;
  document.addEventListener('mousedown', function () { lastMouseDown = Date.now(); });
  document.addEventListener('click', function (e) {
    if (Date.now() - lastMouseDown > 200) return;
    var block = blockFromPoint(e.clientX, e.clientY);
    if (!block || block === document.body) return;
    selectedBlock = block;
    blockSelectionActive = true; // v2.3.5:标记"刚点选,准备删除"
    var ov = ensureOverlay('wp-selected-overlay', 'wp-overlay wp-selected',
      'border:2px solid #2563eb;');
    ov.style.display = '';
    positionOverlay(ov, block, selBadge, 'right');
    selBadge.textContent = breadcrumbOf(block);
    // 通知 outer(用于 Ribbon 容器组)
    try {
      window.parent.postMessage({
        type: 'wp-block-selected',
        identity: identityOf(block),
      }, '*');
    } catch (err) {}
  });

  // v2.3.5:用户在块内打字 → 退出"选区"模式,Delete 不再删块
  document.addEventListener('input', function () {
    blockSelectionActive = false;
  });
  // dblclick 不拦,文本编辑正常进行

  // ---- keydown ----
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      selectedBlock = null;
      var ov = document.getElementById('wp-selected-overlay');
      if (ov) ov.style.display = 'none';
      try { window.parent.postMessage({ type: 'wp-block-selected', identity: null }, '*'); } catch (err) {}
      return;
    }
    // Ctrl+S / Ctrl+Shift+S 在 iframe 内响应 — 父 window.keydown 收不到 iframe 内事件,
    // postMessage 走 outer App.tsx 的 onMessage handler → refs.current.save / saveAs
    // Windows: Ctrl+S;Mac: Cmd+S(metaKey)。两者都接受。
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      try { window.parent.postMessage({ type: 'wp-save', shift: e.shiftKey }, '*'); } catch (err) {}
      return;
    }
    // Ctrl+O / Cmd+O — 打开文件
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      try { window.parent.postMessage({ type: 'wp-open' }, '*'); } catch (err) {}
      return;
    }
    // Ctrl+N / Cmd+N — 新建
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      try { window.parent.postMessage({ type: 'wp-new' }, '*'); } catch (err) {}
      return;
    }
    // Ctrl+W / Cmd+W — 关闭当前 tab
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      try { window.parent.postMessage({ type: 'wp-close' }, '*'); } catch (err) {}
      return;
    }
    // Ctrl+Q / Cmd+Q — 退出应用
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'q') {
      e.preventDefault();
      try { window.parent.postMessage({ type: 'wp-exit-app' }, '*'); } catch (err) {}
      return;
    }
    // v2.3.5:Ctrl+Z / Cmd+Z 撤销(走 outer 切换历史栈)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      try { window.parent.postMessage({ type: 'wp-undo' }, '*'); } catch (err) {}
      return;
    }
    // v2.3.5:Ctrl+Y / Cmd+Y 或 Ctrl+Shift+Z / Cmd+Shift+Z 重做
    if ((e.ctrlKey || e.metaKey) &&
        ((!e.shiftKey && e.key.toLowerCase() === 'y') ||
         (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault();
      try { window.parent.postMessage({ type: 'wp-redo' }, '*'); } catch (err) {}
      return;
    }
    // v2.3.5:Delete / Backspace 删除选中块 — 仅在 blockSelectionActive 时触发
    // (避免在块内打字时误删整个块)
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlock && blockSelectionActive &&
        selectedBlock !== document.body && selectedBlock !== document.documentElement) {
      e.preventDefault();
      try {
        var removed = selectedBlock;
        if (removed.parentNode) removed.parentNode.removeChild(removed);
        selectedBlock = null;
        blockSelectionActive = false;
        try { window.parent.postMessage({ type: 'wp-block-selected', identity: null }, '*'); } catch (err2) {}
        try {
          window.parent.postMessage({
            type: 'wp-doc-updated',
            bodyHtml: document.body.innerHTML,
          }, '*');
        } catch (err3) {}
      } catch (err) {}
      return;
    }
    // v2.3.4 兼容逻辑:void 元素(IMG/BR/HR)无子节点,即使 blockSelectionActive=false 也允许删
    // (浏览器对 void 的默认 delete 行为在某些 contenteditable 场景下不一致)
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlock &&
        selectedBlock !== document.body && selectedBlock !== document.documentElement) {
      var isVoid = /^(IMG|BR|HR|INPUT)$/.test(selectedBlock.tagName);
      if (isVoid) {
        e.preventDefault();
        try {
          var removed = selectedBlock;
          if (removed.parentNode) removed.parentNode.removeChild(removed);
          selectedBlock = null;
          blockSelectionActive = false;
          try { window.parent.postMessage({ type: 'wp-block-selected', identity: null }, '*'); } catch (err2) {}
          try {
            window.parent.postMessage({
              type: 'wp-doc-updated',
              bodyHtml: document.body.innerHTML,
            }, '*');
          } catch (err3) {}
        } catch (err) {}
        return;
      }
    }
    if (selectedBlock && e.ctrlKey) {
      var target = null;
      if (e.key === 'ArrowUp') {
        target = selectedBlock.parentElement;
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        for (var i = 0; i < selectedBlock.children.length; i++) {
          var c = selectedBlock.children[i];
          if (c.tagName !== 'BR') { target = c; break; }
        }
        e.preventDefault();
      }
      if (target && target !== document.body) {
        selectedBlock = target;
        var ov2 = document.getElementById('wp-selected-overlay');
        if (ov2) {
          positionOverlay(ov2, target, selBadge, 'right');
          selBadge.textContent = breadcrumbOf(target);
        }
        try {
          window.parent.postMessage({
            type: 'wp-block-selected',
            identity: identityOf(target),
          }, '*');
        } catch (err) {}
      }
    }
  });

  // ---- 滚动时同步 overlay 位置 ----
  document.addEventListener('scroll', function () {
    if (hoveredBlock) {
      var hov = document.getElementById('wp-hover-overlay');
      if (hov) positionOverlay(hov, hoveredBlock, hoverBadge, 'left');
    }
    if (selectedBlock) {
      var sel = document.getElementById('wp-selected-overlay');
      if (sel) positionOverlay(sel, selectedBlock, selBadge, 'right');
    }
  }, true);
  window.addEventListener('resize', function () {
    if (hoveredBlock) {
      var hov = document.getElementById('wp-hover-overlay');
      if (hov) positionOverlay(hov, hoveredBlock, hoverBadge, 'left');
    }
    if (selectedBlock) {
      var sel = document.getElementById('wp-selected-overlay');
      if (sel) positionOverlay(sel, selectedBlock, selBadge, 'right');
    }
  });

  // ---- 监听 outer 发来的指令 ----
  window.addEventListener('message', function (e) {
    var msg = e.data || {};
    if (msg.type === 'wp-set-style') {
      if (!selectedBlock) return;
      var prop = msg.prop;
      var val = msg.value;
      // 跟 applyContainerStyle 同逻辑
      var style = selectedBlock.getAttribute('style') || '';
      var props = {};
      style.split(';').forEach(function (d) {
        var i = d.indexOf(':');
        if (i < 0) return;
        var n = d.slice(0, i).trim().toLowerCase();
        var v = d.slice(i + 1).trim();
        if (n && v) props[n] = v;
      });
      var cssProp = ({
        bgColor: 'background',
        borderColor: 'border-color',
        borderWidth: 'border-width',
        borderStyle: 'border-style',
        borderRadius: 'border-radius',
        padding: 'padding',
      })[prop];
      if (!cssProp) return;
      if (val === '') delete props[cssProp];
      else props[cssProp] = val;
      var newStyle = Object.keys(props).filter(function (k) { return props[k] !== ''; })
        .map(function (k) { return k + ': ' + props[k]; }).join('; ');
      selectedBlock.setAttribute('style', newStyle);
      // 通知 outer:doc 内容已变,需要重新读 docHtml
      try {
        window.parent.postMessage({
          type: 'wp-doc-updated',
          bodyHtml: document.body.innerHTML,
        }, '*');
      } catch (err) {}
      return;
    }
    if (msg.type === 'wp-promote') {
      if (!selectedBlock) return;
      var tagName = selectedBlock.tagName.toLowerCase();
      var props2 = {};
      var s2 = selectedBlock.getAttribute('style') || '';
      var allowedCssProps = {
        background: 1, 'border-color': 1, 'border-width': 1,
        'border-style': 1, 'border-radius': 1, padding: 1
      };
      s2.split(';').forEach(function (d) {
        var i = d.indexOf(':');
        if (i < 0) return;
        var n = d.slice(0, i).trim().toLowerCase();
        var v = d.slice(i + 1).trim();
        if (allowedCssProps[n] && v) props2[n] = v;
      });
      try {
        window.parent.postMessage({
          type: 'wp-promote-result',
          tagName: tagName,
          props: props2,
          styleAttr: s2,
        }, '*');
      } catch (err) {}
      return;
    }
    if (msg.type === 'wp-clear-selected') {
      selectedBlock = null;
      var ov = document.getElementById('wp-selected-overlay');
      if (ov) ov.style.display = 'none';
      return;
    }
    if (msg.type === 'wp-clear-inline') {
      // ⭐ 提升后清原 inline(iframe 由 outer 触发 shell 重建会 reload,这里直接清)
      if (selectedBlock) {
        selectedBlock.setAttribute('style', '');
        try {
          window.parent.postMessage({
            type: 'wp-doc-updated',
            bodyHtml: document.body.innerHTML,
          }, '*');
        } catch (err) {}
      }
      return;
    }
    if (msg.type === 'wp-reapply-selected') {
      // iframe 重建后 outer 通知重新选中。msg.identity 是 BlockIdentity
      var id = msg.identity;
      if (!id) return;
      var candidates = document.querySelectorAll(id.tagName);
      var target = null;
      // 主路径:nthOfType
      if (candidates[id.nthOfType]) target = candidates[id.nthOfType];
      // fallback:textSample
      if (!target && id.textSample) {
        for (var j = 0; j < candidates.length; j++) {
          if ((candidates[j].textContent || '').indexOf(id.textSample) === 0) {
            target = candidates[j];
            break;
          }
        }
      }
      if (target) {
        selectedBlock = target;
        var ov2 = document.getElementById('wp-selected-overlay');
        if (!ov2) {
          ov2 = document.createElement('div');
          ov2.id = 'wp-selected-overlay';
          ov2.className = 'wp-overlay wp-selected';
          ov2.style.cssText = 'position:absolute;pointer-events:none;box-sizing:border-box;z-index:2147483600;border:2px solid #2563eb;';
          document.documentElement.appendChild(ov2);
        }
        ov2.style.display = '';
        positionOverlay(ov2, target, selBadge, 'right');
        selBadge.textContent = breadcrumbOf(target);
      }
      return;
    }
  });

  // ---- v3.0.0:粘贴图片 → outer 处理(走 SHA-256 去重 + sidecar 写入)----
  // 拖拽(v2.3.8 起先在 iframe DOM 监听,后改走 Tauri IPC)由 outer App.tsx 的
  // getCurrentWebviewWindow().onDragDropEvent 接管,这里不再监听 drop。
  // paste 是 contenteditable DOM 事件,Tauri 不拦截,继续走 iframe listener。
  function postImageBytes(file, sourceExt) {
    var reader = new FileReader();
    reader.onload = function () {
      var bytes = new Uint8Array(reader.result);
      try {
        window.parent.postMessage({
          type: 'wp-insert-image-bytes',
          bytes: bytes.buffer,
          ext: sourceExt,
          sourceName: file.name || ('pasted_' + Date.now() + '.' + sourceExt),
        }, '*', [bytes.buffer]);
      } catch (err) {
        console.error('postImageBytes 失败:', err);
      }
    };
    reader.onerror = function () {
      console.error('FileReader 失败:', reader.error);
    };
    reader.readAsArrayBuffer(file);
  }

  // MIME → 默认扩展名(粘贴场景 file.name 可能为空,用 mime 推断)
  var MIME_TO_EXT = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
  };

  document.addEventListener('paste', function (e) {
    if (!e.clipboardData) return;
    var items = e.clipboardData.items;
    if (!items || !items.length) return;
    var file = null;
    for (var j = 0; j < items.length; j++) {
      if (items[j].kind === 'file' && items[j].type.indexOf('image/') === 0) {
        file = items[j].getAsFile();
        break;
      }
    }
    if (!file) return;
    e.preventDefault();
    var ext2 = MIME_TO_EXT[file.type] || 'png';
    postImageBytes(file, ext2);
  });
})();
`;

export function blockSelectorScript(): string {
  return BLOCK_SELECTOR_SCRIPT;
}