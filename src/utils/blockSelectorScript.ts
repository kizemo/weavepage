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
  function blockFromPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return null;
    var cur = el;
    // 向上找到 block display 的元素
    while (cur && cur !== document.body) {
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
  function ensureOverlay(id, className, borderStyle) {
    var el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('div');
    el.id = id;
    el.className = className;
    el.style.cssText = 'position:absolute;pointer-events:none;box-sizing:border-box;z-index:2147483600;' + borderStyle;
    document.body.appendChild(el);
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
    // Ctrl+Q 在 iframe 内也响应(否则 iframe focus 时外层 window.keydown 不触发)
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'q') {
      e.preventDefault();
      try { window.parent.postMessage({ type: 'wp-exit-app' }, '*'); } catch (err) {}
      return;
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
          document.body.appendChild(ov2);
        }
        ov2.style.display = '';
        positionOverlay(ov2, target, selBadge, 'right');
        selBadge.textContent = breadcrumbOf(target);
      }
      return;
    }
  });
})();
`;

export function blockSelectorScript(): string {
  return BLOCK_SELECTOR_SCRIPT;
}