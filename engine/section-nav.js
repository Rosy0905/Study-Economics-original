/* 板块串连导航：页头返回键右侧注入 34px 圆钮，圆内写当前板块序号（18px / 700）。
   点开面板列出全站板块，链接以新窗口打开；数据源 nav.config.js 的 SITE_NAV.pages。
   宽屏面板顶边压按钮下沿 9px，横向取按钮圆心落在面板宽度 30% 处，
   列数按剩余空间选 4 / 3 / 2；窄屏 ≤640 改贴底抽屉加轻遮罩，尺寸宽屏 ×1.3。 */

(function (global) {
  'use strict';

  var BTN_SIZE = 34;
  var BTN_FONT = 18;
  var BTN_WEIGHT = 700;
  var SAFE_GAP = 12;
  var PANEL_GAP = 9;
  var EDGE_PAD = 13;
  var EDGE_SNAP = 32;
  var EDGE_SMALL = 140;
  var NARROW_MAX = 640;
  var lastH = 0;

  function mixWhite(hex, t) {
    var m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    var out = '#';
    for (var shift = 16; shift >= 0; shift -= 8) {
      var ch = (n >> shift) & 255;
      var v = Math.round(ch + (255 - ch) * t);
      out += (v < 16 ? '0' : '') + v.toString(16);
    }
    return out;
  }

  /* 色名在所有风格套里全局查，跟主页模块卡同一套色板；
     查不到就退成单 hex 派生，再不行落回默认绿 */
  function paletteColor(name) {
    var palettes = global.HOME_PALETTES || {};
    for (var key in palettes) {
      var list = palettes[key] || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].name === name) return { c: list[i].c, soft: list[i].soft };
      }
    }
    return null;
  }

  /* 值可以是三种写法：
     色名（'green'）在 HOME_PALETTES 全局查，与主页模块卡同源；
     单 hex 自动衍生；
     'token:--变量名' 从根元素计算样式里读，用于跟着 tokens 走的那种入口 */
  function tokenColor(name) {
    var css = global.getComputedStyle && global.getComputedStyle(document.documentElement);
    var val = css ? css.getPropertyValue(name).trim() : '';
    if (/^#[0-9a-f]{3}$/i.test(val) || /^#[0-9a-f]{6}$/i.test(val)) {
      return { c: val, soft: mixWhite(val, 0.9) };
    }
    return null;
  }

  function colorParts(p) {
    var v = p.color;
    if (typeof v === 'string' && v) {
      if (v.indexOf('token:') === 0) {
        var tk = tokenColor(v.slice(6).trim());
        if (tk) return tk;
      } else if (v.charAt(0) === '#') {
        return { c: v, soft: mixWhite(v, 0.9) };
      } else {
        var hit = paletteColor(v);
        if (hit) return hit;
      }
    } else if (v && v.c) {
      return { c: v.c, soft: v.soft || mixWhite(v.c, 0.9) };
    }
    if (p.c) return { c: p.c, soft: p.soft || mixWhite(p.c, 0.9) };
    /* 什么都没填：跟着主题走，别落死一个绿 */
    var cs = getComputedStyle(document.documentElement);
    var cur = (cs.getPropertyValue('--secnav-cur') || '').trim();
    var soft = (cs.getPropertyValue('--secnav-btn-bg') || '').trim();
    return { c: cur || '#3FAE8C', soft: soft || '#EAF8F2' };
  }

  function pagesOf() {
    var nav = global.SITE_NAV || {};
    return (Array.isArray(nav.pages) ? nav.pages : []).map(function (p, i) {
      var col = colorParts(p);
      return {
        id: p.id || '',
        n: p.n || i + 1,
        short: p.short || p.title || p.name || '',
        name: p.name || p.title || p.short || '',
        url: p.url || '#',
        color: p.color || '',
        c: col.c,
        soft: col.soft
      };
    });
  }

  function currentOf(pages, hint) {
    /* 传对象时是清单外的页面：按钮序号按清单长度顺延，面板仍只列清单内的板块，
       本页不出现在面板里，因此没有当前项高亮。 */
    if (hint && typeof hint === 'object') {
      var col = colorParts(hint);
      return {
        id: hint.id || '',
        n: hint.n || pages.length + 1,
        short: hint.short || hint.name || '',
        name: hint.name || hint.short || '',
        url: hint.url || '',
        c: col.c,
        soft: col.soft
      };
    }
    var id = hint || (global.MODULE_CONFIG && global.MODULE_CONFIG.id) || '';
    var i;
    if (id) {
      for (i = 0; i < pages.length; i++) {
        if (pages[i].id === id) return pages[i];
      }
    }
    var path = location.pathname.replace(/\\/g, '/');
    var base = path.slice(path.lastIndexOf('/') + 1);
    for (i = 0; i < pages.length; i++) {
      var u = String(pages[i].url || '');
      var ub = u.slice(u.lastIndexOf('/') + 1);
      if (ub && ub === base) return pages[i];
    }
    return null;
  }

  function mount(opts) {
    var o = opts || {};
    var existed = document.querySelector('.secnav-wrap');
    if (existed) return existed.__secnav || null;

    var pages = pagesOf();
    if (!pages.length) return null;

    var current = currentOf(pages, o.current);
    if (!current) return null;

    var header = document.querySelector('.app-header');
    var host = header ? (header.querySelector('.header-left') || header) : null;
    if (!host) return null;

    var wrap = document.createElement('span');
    wrap.className = 'secnav-wrap';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'secnav-btn';
    btn.textContent = String(current.n);
    btn.title = '切换板块';
    btn.setAttribute('aria-label', '切换板块，当前为第 ' + current.n + ' 个：' + current.name);
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');

    var panel = document.createElement('div');
    panel.className = 'secnav-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'menu');
    panel.style.setProperty('--secnav-cur', current.c || '#3FAE8C');

    var scrim = document.createElement('div');
    scrim.className = 'secnav-scrim';

    pages.forEach(function (s) {
      var a = document.createElement('a');
      a.className = 'secnav-item' + (s === current ? ' is-current' : '');
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = s.name;
      a.style.background = s.soft;
      if (s === current) a.setAttribute('aria-current', 'page');

      var num = document.createElement('i');
      num.className = 'secnav-num';
      num.style.background = s.c;
      num.textContent = String(s.n);

      var label = document.createElement('span');
      label.textContent = s.short;

      a.appendChild(num);
      a.appendChild(label);
      panel.appendChild(a);
    });

    wrap.appendChild(btn);

    if (getComputedStyle(header).position === 'static') header.style.position = 'relative';

    var back = host.querySelector('.back-home');
    if (back && back.parentNode === host) host.insertBefore(wrap, back.nextSibling);
    else host.insertBefore(wrap, host.firstChild);

    /* 面板不放在按钮里——放按钮里就只能从按钮正下方弹，必切顶栏内容 */
    header.appendChild(panel);
    document.body.appendChild(scrim);

    function isNarrow() { return window.innerWidth <= NARROW_MAX; }

    function place(w) {
      var hr = header.getBoundingClientRect();
      var br = btn.getBoundingClientRect();
      var width = w || panel.offsetWidth || 0;
      var left = Math.round(br.left - hr.left);

      if (width > 0) {
        var center = br.left + br.width / 2 - hr.left;
        left = Math.round(Math.min(left, center - width * 0.3));
        var maxLeft = Math.round(hr.width - width - 8);
        if (maxLeft < 0) maxLeft = 0;
        left = Math.max(0, Math.min(left, maxLeft));
      }

      var belowLeft = leftmostBelow(br);
      if (belowLeft !== null && belowLeft < left) left = belowLeft;

      panel.style.left = left + 'px';
      panel.style.top = Math.round(br.bottom - hr.top + PANEL_GAP) + 'px';

      var cx = Math.round(br.left + br.width / 2 - hr.left - left);
      panel.style.transformOrigin = cx + 'px 0';
      panel.style.setProperty('--secnav-arrow', (cx - 5) + 'px');

      return hr.left + left;
    }

    function setEdges(left, width) {
      var hr = header.getBoundingClientRect();
      var br = btn.getBoundingClientRect();
      left = Math.round(left);
      panel.style.left = left + 'px';
      panel.style.width = Math.round(width) + 'px';
      var cx = Math.round(br.left + br.width / 2 - hr.left - left);
      panel.style.transformOrigin = cx + 'px 0';
      panel.style.setProperty('--secnav-arrow', (cx - 5) + 'px');
    }

    function isEdgeSensitive(el, r) {
      var t = el.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'BUTTON' || t === 'LABEL' ||
          t === 'IMG' || t === 'A' || t === 'SPAN') return true;
      if (el.namespaceURI && el.namespaceURI.indexOf('svg') !== -1) return true;
      if (r.width <= EDGE_SMALL || r.height <= 26) return true;
      for (var i = 0; i < el.childNodes.length; i++) {
        var n = el.childNodes[i];
        if (n.nodeType === 3 && n.nodeValue && n.nodeValue.replace(/\s/g, '')) return true;
      }
      return false;
    }

    function fadedOut(el) {
      var e = el, n = 0;
      while (e && e.nodeType === 1 && n++ < 6) {
        if (parseFloat(getComputedStyle(e).opacity) < 0.05) return true;
        e = e.parentElement;
      }
      return false;
    }

    function snapEdge(side, edge, topVp, h) {
      var best = 0;
      var bestD = EDGE_SNAP + 1;
      var all = document.body.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el === panel || panel.contains(el) || el === wrap || wrap.contains(el)) continue;
        if (el.checkVisibility && !el.checkVisibility()) continue;
        if (fadedOut(el)) continue;
        var r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (!(r.left < edge - 0.5 && r.right > edge + 0.5)) continue;
        if (!isEdgeSensitive(el, r)) continue;
        if (Math.min(r.bottom, topVp + h) - Math.max(r.top, topVp) <= 0.5) continue;
        var cands = [r.left - edge, r.right - edge];
        for (var k = 0; k < 2; k++) {
          var d = Math.abs(cands[k]);
          if (d > 0.5 && d < bestD) { bestD = d; best = cands[k]; }
        }
      }
      return Math.round(best);
    }

    function leftmostBelow(br) {
      var min = null;
      var hl = header.getBoundingClientRect().left;
      var all = header.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el === panel || panel.contains(el)) continue;
        if (el.contains(btn) || btn.contains(el)) continue;
        var r = el.getBoundingClientRect();
        if (r.height <= 0 || r.width <= 0) continue;
        if (r.top < br.bottom - 2) continue;
        var l = r.left - hl;
        if (min === null || l < min) min = l;
      }
      return min === null ? null : Math.round(min);
    }

    function applyCols() {
      panel.style.width = '';
      if (isNarrow()) {
        panel.style.left = '';
        panel.style.top = '';
        panel.style.transformOrigin = '';
        panel.style.gridTemplateColumns = '';
        return;
      }
      /* 列数决定面板宽度，宽度又决定锚点，两者互相咬合：
         先按 4 列量宽、定锚点，放不下退 3 列，最后按定下的列数重算一次锚点。
         板块少于 4 个时不硬凑满 4 列，否则末尾留一个空格看着像缺项 */
      var cap = Math.min(4, panel.children.length) || 4;
      var cols = cap;
      var w = measure(cap);
      var leftViewport = place(w);
      if (w > window.innerWidth - leftViewport - SAFE_GAP) {
        cols = Math.min(3, cap);
        w = measure(cols);
        leftViewport = place(w);
        if (w > window.innerWidth - leftViewport - SAFE_GAP) cols = Math.min(2, cap);
      }
      panel.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';

      var baseW = measure(cols) || w;
      var out = baseW + EDGE_PAD * 2;
      panel.style.width = out + 'px';
      place(out);

      if (lastH > 0) {
        var hr2 = header.getBoundingClientRect();
        var l0 = parseFloat(panel.style.left) || 0;
        var topVp = hr2.top + (parseFloat(panel.style.top) || 0);
        var dL = snapEdge('l', hr2.left + l0, topVp, lastH);
        var dR = snapEdge('r', hr2.left + l0 + out, topVp, lastH);
        var nl = l0 + dL;
        var nw = out + (dR - dL);
        var btnCenterOff = btn.getBoundingClientRect().left + btn.offsetWidth / 2 - hr2.left;
        if (nw >= baseW * 0.88 && nl >= 0 && nl + nw <= hr2.width - 8 &&
            nl <= btnCenterOff - 40 &&
            hr2.left + nl + nw <= window.innerWidth - SAFE_GAP) {
          setEdges(nl, nw);
        }
      }
    }

    /* 用 offsetWidth 而不是 rect：rect 会被入场动画的 scale 缩放，量出来偏小 */
    function measure(n) {
      var wasHidden = panel.hidden;
      panel.style.gridTemplateColumns = 'repeat(' + n + ',1fr)';
      if (wasHidden) {
        panel.hidden = false;
        panel.style.visibility = 'hidden';
      }
      var w = panel.offsetWidth;
      lastH = panel.offsetHeight || lastH;
      if (wasHidden) {
        panel.hidden = true;
        panel.style.visibility = '';
      }
      return w;
    }

    function open() {
      applyCols();
      panel.hidden = false;
      scrim.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    }
    function close() {
      panel.hidden = true;
      scrim.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (panel.hidden) open(); else close();
    });

    panel.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.secnav-item')) close();
    });

    scrim.addEventListener('click', function () { close(); });

    document.addEventListener('click', function (e) {
      if (panel.hidden) return;
      if (wrap.contains(e.target) || panel.contains(e.target)) return;
      close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { close(); btn.focus(); }
    });

    var rt = null;
    window.addEventListener('resize', function () {
      if (rt) clearTimeout(rt);
      rt = setTimeout(applyCols, 120);
    });

    var api = { open: open, close: close, pages: pages, current: current };
    wrap.__secnav = api;
    return api;
  }

  global.KB = global.KB || {};
  global.KB.SectionNav = { mount: mount };
})(window);
