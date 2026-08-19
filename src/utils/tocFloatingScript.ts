// 注入到预览 iframe 末尾的悬浮按钮 + 面板脚本
// 自包含 IIFE;不依赖 React;扫描文档 h2/h3 渲染面板
export const TOC_FLOATING_SCRIPT = `<script id="wp-toc-floating">
(function(){
  if (window.__wpTocInited) return; window.__wpTocInited = true;

  // 1. 创建悬浮按钮 + 面板(wrapper 共享 hover)
  var wrap = document.createElement('div');
  wrap.id = 'wp-toc-floating-wrap';
  wrap.style.cssText = 'position:fixed;top:80px;right:24px;z-index:900;';
  document.body.appendChild(wrap);

  var btn = document.createElement('button');
  btn.className = 'wp-toc-floating';
  btn.textContent = '📑';
  btn.title = '目录';
  wrap.appendChild(btn);

  var panel = document.createElement('div');
  panel.className = 'wp-toc-floating-panel';
  wrap.appendChild(panel);

  // 2. 扫描 h2 / h3 渲染嵌套 ul
  var render = function(){
    var heads = document.querySelectorAll('h2, h3');
    var html = '<div class="doc-toc-title">目录 ▾</div><div class="doc-toc-list-wrap"><ul class="doc-toc-list">';
    var openLi = false, inSub = false;
    for (var i = 0; i < heads.length; i++){
      var h = heads[i];
      var tag = h.tagName.toLowerCase();
      if (tag !== 'h2' && tag !== 'h3') continue;
      var txt = (h.textContent || '').trim();
      if (!txt) continue;
      var id = h.id || ('wp-toc-' + (i+1));
      if (tag === 'h2'){
        if (openLi) html += inSub ? '</ul></li>' : '</li>';
        html += '<li class="wp-toc-floating-item"><a class="doc-toc-h2" href="#' + id + '">' + txt + '</a>';
        openLi = true;
        var next = heads[i+1];
        if (next && next.tagName.toLowerCase() === 'h3'){
          html += '<ul>';
          inSub = true;
        } else {
          html += '</li>';
          openLi = false;
        }
      } else {
        if (!openLi) continue;
        html += '<li class="wp-toc-floating-item"><a class="doc-toc-h3" href="#' + id + '">' + txt + '</a></li>';
        var next2 = heads[i+1];
        if (!next2 || next2.tagName.toLowerCase() !== 'h3'){
          if (inSub){ html += '</ul></li>'; inSub = false; openLi = false; }
        }
      }
    }
    if (openLi) html += inSub ? '</ul></li>' : '</li>';
    html += '</ul></div>';
    panel.innerHTML = html;
  };
  render();

  // 3. hover 展开 / 250ms 延迟折叠
  var closeTimer = null;
  var openPanel = function(){
    if (closeTimer){ clearTimeout(closeTimer); closeTimer = null; }
    btn.classList.add('is-open');
    panel.style.display = 'block';
  };
  var scheduleClose = function(){
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(function(){
      btn.classList.remove('is-open');
      panel.style.display = 'none';
    }, 250);
  };
  wrap.addEventListener('mouseenter', openPanel);
  wrap.addEventListener('mouseleave', scheduleClose);

  // 4. 点击跳转
  panel.addEventListener('click', function(e){
    var t = e.target;
    while (t && t !== panel){
      if (t.tagName === 'A' && t.getAttribute('href') && t.getAttribute('href').charAt(0) === '#'){
        var id = t.getAttribute('href').slice(1);
        var tgt = document.getElementById(id);
        if (tgt){ tgt.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        e.preventDefault();
        return;
      }
      t = t.parentNode;
    }
  });

  // 5. IntersectionObserver 高亮当前标题
  if ('IntersectionObserver' in window){
    var obs = new IntersectionObserver(function(items){
      items.forEach(function(it){
        var item = it.target;
        if (it.isIntersecting){
          // 找到面板内对应 <a>
          var id = item.id;
          panel.querySelectorAll('a').forEach(function(a){
            if (a.getAttribute('href') === '#' + id){
              a.parentNode.classList.add('is-current');
            }
          });
        }
      });
    }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });
    document.querySelectorAll('h2, h3').forEach(function(h){ if (h.id) obs.observe(h); });
  }
})();
</script>`;
