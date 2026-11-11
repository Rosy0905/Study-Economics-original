/* 图片控件：全站唯一一份图片处理实现。
   - 算法层：插入瘦身、透明底探测、体积估算、画质压缩、图床入库与回写。
     普通子页笔记与我的卡片答案都调这一层，插入瘦身参数全站只有一份。
   - 交互层：create(opt) 生成「缩放 / 压缩」双模式尺寸条，自己持有状态，
     只通过 opt 注入编辑器、提示、保存与看图等页面能力，不认任何页面类名。
   - 皮肤层：ui/imgctl.css 一份结构样式，数值差异由 --imgctl-* 变量吸收。
   缩放只改显示宽度、文件一个字节不动；压缩只降画质、长宽一个像素不动。
   显示宽度存「占所在容器的百分比」，编辑器与卡片答案区各按自己的容器算，
   同一份正文在两端占比一致；历史绝对 px 在渲染注水时惰性换算。 */
(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});
  var doc = global.document;

  /* ---------------- 算法层 ---------------- */

  function kbOf(dataUrl) {
    return Math.round((dataUrl ? dataUrl.length : 0) * 0.75 / 1024);
  }

  /* 带透明的图只能走 PNG，压不动时提前说明，别报一个让人困惑的大数 */
  function probeHasAlpha(im) {
    try {
      var w = im.naturalWidth || 1, h = im.naturalHeight || 1;
      var c = doc.createElement('canvas');
      c.width = Math.min(w, 300); c.height = Math.min(h, 300);
      var ctx = c.getContext('2d');
      ctx.drawImage(im, 0, 0, c.width, c.height);
      var d = ctx.getImageData(0, 0, c.width, c.height).data;
      for (var i = 3; i < d.length; i += 4) { if (d[i] < 250) return true; }
    } catch (e) {}
    return false;
  }

  function baseSrc(img) { return img ? (img.__curSrc || img.__origSrc || img.src) : ''; }

  function bytesOf(img) {
    if (!img) return 0;
    if (KB.Blobs && KB.Blobs.isUsable()) {
      var b = KB.Blobs.bytesOf(img);
      if (b) return b;
    }
    return Math.round((baseSrc(img) || '').length * 0.75);
  }

  /* 拖动防抖时真编码一次量体积，与应用同一口径 */
  function estimateKb(img, quality, cb) {
    var im = new Image();
    im.onload = function () {
      try {
        var w = im.naturalWidth || 1, h = im.naturalHeight || 1;
        var c = doc.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        var alpha = probeHasAlpha(im);
        if (alpha) ctx.clearRect(0, 0, w, h);
        else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(im, 0, 0, w, h);
        if (alpha) { cb(kbOf(c.toDataURL('image/png'))); return; }
        if (c.toBlob) c.toBlob(function (b) { cb(b ? Math.round(b.size / 1024) : 0); }, 'image/jpeg', quality);
        else cb(kbOf(c.toDataURL('image/jpeg', quality)));
      } catch (e) { cb(0); }
    };
    im.onerror = function () { cb(0); };
    im.src = baseSrc(img);
  }

  /* 画质压缩：长宽不动，编出来不比现在小就保持原文件。
     带证号的图压完覆盖同一个 id 的 Blob 并换发新证，刷新后不会退回压缩前的大图。 */
  function reencode(img, q, done) {
    var src = baseSrc(img);
    var id = (img.dataset && img.dataset.blobId) || null;
    var beforeB = bytesOf(img);
    var kb = function (b) { return Math.round(b / 1024); };
    var im = new Image();
    im.onload = function () {
      try {
        var w = im.naturalWidth || 1, h = im.naturalHeight || 1;
        var c = doc.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        var alpha = probeHasAlpha(im);
        if (alpha) ctx.clearRect(0, 0, w, h);
        else { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(im, 0, 0, w, h);
        var out = alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', q);
        if (!out) { if (done) done(false, 'noshrink', w, h, kb(beforeB), kb(beforeB)); return; }
        var afterB = Math.round(out.length * 0.75);
        if (afterB >= beforeB) {
          if (done) done(false, alpha ? 'alpha' : 'noshrink', w, h, kb(beforeB), kb(afterB));
          return;
        }
        var finishInline = function () {
          img.src = out; img.__curSrc = out;
          if (done) done(true, '', w, h, kb(beforeB), kb(afterB));
        };
        if (id && KB.Blobs && KB.Blobs.isUsable()) {
          var nb = KB.Blobs.dataUrlToBlob(out);
          if (nb) {
            KB.Blobs.put(id, nb).then(function (okc) {
              if (!okc) { finishInline(); return; }
              KB.Blobs.replaceUrl(id, nb).then(function (u) {
                if (u) {
                  img.src = u; img.__curSrc = u;
                  if (img.__origSrc) img.__origSrc = u;
                }
                if (done) done(true, '', w, h, kb(beforeB), kb(afterB));
              });
            });
            return;
          }
        }
        finishInline();
      } catch (e) { if (done) done(false, 'noshrink', 0, 0, 0, 0); }
    };
    im.onerror = function () { if (done) done(false, 'noshrink', 0, 0, 0, 0); };
    im.src = src;
  }

  /* 插入时的基础瘦身：超宽大图缩到 1200px 内、转 JPEG 重编码。
     返回 Promise，完成前不入库 —— 瘦身和入库都会改 src，必须排队。 */
  function shrink(img, dataUrl) {
    return new Promise(function (resolve) {
      var MAXW = 1200, QUALITY = 0.72, KEEP_UNDER = 220 * 1024;
      if (!img || !dataUrl || String(dataUrl).indexOf('data:image/') !== 0 || dataUrl.length < KEEP_UNDER) {
        resolve(); return;
      }
      var im = new Image();
      im.onload = function () {
        try {
          var w = im.naturalWidth || im.width || 1;
          var h = im.naturalHeight || im.height || 1;
          var scale = Math.min(1, MAXW / w);
          var c = doc.createElement('canvas');
          c.width = Math.max(1, Math.round(w * scale));
          c.height = Math.max(1, Math.round(h * scale));
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(im, 0, 0, c.width, c.height);
          var out = c.toDataURL('image/jpeg', QUALITY);
          if (out && out.length < dataUrl.length) {
            img.src = out;
            img.__origSrc = out;
            img.dataset.shrunk = '1';
          }
        } catch (e) {}
        resolve();
      };
      im.onerror = function () { resolve(); };
      im.src = dataUrl;
    });
  }

  /* 插入的图收进图床，换成出入证并记证号；图床不可用安静保持内联 */
  function store(img) {
    if (!KB.Blobs || !KB.Blobs.isUsable()) return Promise.resolve(null);
    var dataUrl = img.__origSrc || img.__curSrc || img.src;
    if (String(dataUrl).indexOf('data:image/') !== 0) return Promise.resolve(null);
    var blob = KB.Blobs.dataUrlToBlob(dataUrl);
    if (!blob) return Promise.resolve(null);
    var id = KB.Blobs.newId();
    return KB.Blobs.put(id, blob).then(function (ok) {
      if (!ok) return null;
      return KB.Blobs.urlOf(id).then(function (u) {
        if (!u || !img.isConnected) return null;
        img.dataset.blobId = id;
        img.src = u;
        img.__origSrc = u;
        if (img.__curSrc) img.__curSrc = u;
        return id;
      });
    }).catch(function () { return null; });
  }

  /* ---------------- 相对宽度 ----------------
      显示宽度存占容器的百分比，编辑器与卡片答案区各按自己的包含块计算，
      同一份正文在两端占比一致；676 是历史绝对 px 的换算基准，只用于迁移。
      历史 px 在渲染注水时惰性换算，幂等，不参与新数据。 */
  var LEGACY_BASE = 676;
  var DEFAULT_RATIO = 50;

  function clampPct(v) { return Math.max(10, Math.min(100, Math.round(v * 10) / 10)); }
  function pctOf(v) {
    var t = String(v == null ? '' : v).trim();
    if (!t) return null;
    if (t.slice(-1) === '%') {
      var p = parseFloat(t);
      return isFinite(p) && p > 0 ? clampPct(p) : null;
    }
    if (!/^\d+(\.\d+)?(px)?$/i.test(t)) return null;
    var px = parseFloat(t);
    return isFinite(px) && px > 0 ? clampPct(px / LEGACY_BASE * 100) : null;
  }
  /* 图片百分比的包含块：往上找第一个非 inline 且能量到宽度的父元素 */
  function boxW(img) {
    var n = img && img.parentElement;
    while (n && n !== doc.body) {
      var cs = global.getComputedStyle(n);
      if (cs.display !== 'inline') {
        var w = (n.clientWidth || 0)
              - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
        if (w > 40) return w;
      }
      n = n.parentElement;
    }
    return LEGACY_BASE;
  }
  function readRatio(img) {
    if (!img) return DEFAULT_RATIO;
    return pctOf(img.style && img.style.width)
        || pctOf(img.getAttribute('data-insw')) || DEFAULT_RATIO;
  }
  /* 预览与拖动只改显示宽度；「还原」基准 data-insw 只在插入、归一化时写 */
  function setWidth(img, pct) {
    if (!img) return;
    img.style.width = clampPct(pct) + '%';
    img.style.height = 'auto';
  }
  function setRatio(img, pct) {
    var v = clampPct(pct);
    setWidth(img, v);
    if (img.setAttribute) img.setAttribute('data-insw', v + '%');
    return v;
  }
  /* 渲染注水后跑一遍，把历史绝对 px 换成百分比；已是百分比的原样跳过 */
  function normalize(root, selector) {
    if (!root || !root.querySelectorAll) return 0;
    var changed = 0;
    root.querySelectorAll(selector || 'img').forEach(function (img) {
      var w = img.style && img.style.width, ins = img.getAttribute('data-insw');
      if (w && /%$/.test(w) && ins && /%$/.test(ins)) return;
      var p = pctOf(w) || pctOf(ins);
      if (p === null) return;
      setRatio(img, p);
      changed++;
    });
    return changed;
  }
  function insertRatio(editor, pxW) {
    var p = DEFAULT_RATIO;
    if (pxW > 0) p = Math.min(p, pxW / LEGACY_BASE * 100);
    return clampPct(p);
  }
  function rowWidth(editor) {
    if (!editor) return LEGACY_BASE;
    var cs = global.getComputedStyle(editor);
    var w = (editor.clientWidth || LEGACY_BASE)
          - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0) - 6;
    return Math.max(160, Math.round(w));
  }

  /* ---------------- 交互层 ---------------- */

  var DEFAULT_LABELS = {
    icon: '📐', zoom: '缩放', zip: '压缩',
    reset: '↩ 还原', apply: '应用', cancel: '取消',
    quality: '画质 ', current: '当前 ', approx: '约 ', kb: ' KB',
    atLimit: '已压到极限', width: '宽 ', px: ' px',
    tipZoom: '显示宽度 ', tipZoomTail: ' px，图片文件没动',
    tipAlreadyOrig: '已经是原图，往下拖才是压',
    tipAlpha: '透明底的 PNG 压不动（转 JPG 会丢透明），先保持原样',
    tipNoShrink: '这张已经压到极限了，再压体积也不会更小',
    tipRestored: '已还原成刚插入时的大小'
  };

  function create(opt) {
    var o = opt || {};
    var host = o.host, editor = o.editor;
    var L = Object.assign({}, DEFAULT_LABELS, o.labels || {});
    var tip = o.tip || function () {};
    var el = doc.createElement('div');
    el.className = 'imgctl ' + (o.skinClass || '');
    el.innerHTML =
        '<span data-part="icon">' + L.icon + '</span>' +
        '<span data-part="modes">' +
          '<button type="button" class="m on" data-mode="zoom">' + L.zoom + '</button>' +
          '<button type="button" class="m" data-mode="zip">' + L.zip + '</button>' +
        '</span>' +
        '<input type="range" data-part="range" min="25" max="100" step="1" value="100">' +
        '<span data-part="val">100%</span>' +
        '<span data-part="px"></span>' +
        '<button type="button" data-part="reset">' + L.reset + '</button>' +
        '<button type="button" data-part="apply">' + L.apply + '</button>' +
        '<button type="button" data-part="cancel">' + L.cancel + '</button>';
    if (host) {
      if (o.before && o.before.parentNode === host) host.insertBefore(el, o.before);
      else host.appendChild(el);
    }

    var range = el.querySelector('[data-part=range]');
    var val = el.querySelector('[data-part=val]');
    var px = el.querySelector('[data-part=px]');
    var modes = el.querySelector('[data-part=modes]');
    var st = { img: null, mode: 'zoom', before: '', estT: null };

    function natW() { var i = st.img; return i ? (i.naturalWidth || i.__pxW || i.__origW || 0) : 0; }
    function natH() { var i = st.img; return i ? (i.naturalHeight || i.__pxH || i.__origH || 0) : 0; }
    function rowW() { return st.img ? boxW(st.img) : rowWidth(editor); }
    function bytes() { return o.currentBytes ? o.currentBytes(st.img) : bytesOf(st.img); }
    function selected(on) {
      if (!st.img) return;
      if (o.select) o.select(st.img, on);
      else st.img.classList.toggle(o.selectedClass || 'imgctl-sel', !!on);
    }

    function refreshPx() {
      var v = parseInt(range.value, 10);
      var W = natW();
      if (st.mode === 'zoom') {
        px.textContent = st.img ? (L.width + Math.round(boxW(st.img) * v / 100) + L.px) : '';
        return;
      }
      if (v >= 100) {
        var cur = bytes();
        px.textContent = cur ? (L.current + Math.round(cur / 1024) + L.kb) : '';
        return;
      }
      px.textContent = W ? (L.approx + '…') : '';
      clearTimeout(st.estT);
      st.estT = setTimeout(function () {
        /* 收条、换图之后这次估算作废，别拿空图片去编码 */
        if (!st.img || !el.classList.contains('show')) return;
        var est = o.estimate || estimateKb;
        est(st.img, v / 100, function (kb) {
          if (!st.img || parseInt(range.value, 10) !== v) return;
          if (!kb) { px.textContent = ''; return; }
          px.textContent = kb * 1024 >= bytes() ? L.atLimit : (L.approx + kb + L.kb);
        });
      }, o.debounce || 200);
    }

    function setMode(mode) {
      st.mode = mode;
      modes.querySelectorAll('.m').forEach(function (b) {
        b.classList.toggle('on', b.dataset.mode === mode);
      });
      if (mode === 'zoom') {
        /* 滑块单位是「占所在容器的百分比」，上限 100% 即铺满；
           两端容器不同也能保持同样占比。 */
        range.min = '25'; range.max = '100'; range.step = '1';
        range.value = String(Math.round(readRatio(st.img)));
        val.textContent = range.value + '%';
      } else {
        range.min = '30'; range.max = '100'; range.step = '5'; range.value = '100';
        val.textContent = L.quality + '100%';
      }
      refreshPx();
    }

    /* keep=true 应用收条，keep=false 回滚全部内联样式 */
    function finish(keep) {
      clearTimeout(st.estT);
      var im = st.img;
      if (im) {
        if (!keep) im.style.cssText = st.before || '';
        else im.style.maxHeight = '';
        selected(false);
        var sel = global.getSelection();
        if (sel && sel.rangeCount && im.contains(sel.anchorNode)) sel.removeAllRanges();
      }
      el.classList.remove('show');
      el.__img = null;
      st.img = null;
      if (o.guard) o.guard.setActive(editor, false);
      else if (editor) editor.__imgCtlActive = false;
    }

    el.__close = finish;   /* 页面原有的「点外面收起」监听读这个钩子 */

    function close(keep) {
      if (!el.classList.contains('show')) return;
      finish(!!keep);
    }

    function open(img) {
      if (!img) return;
      if (st.img === img && el.classList.contains('show')) return;
      if (st.img && el.classList.contains('show')) finish(false);

      st.img = img;
      /* 历史绝对 px 一打开就换算成百分比，取消时回到这个归一化后的状态。
         这里只改显示宽度：data-insw 是「还原」基准，不能被当前宽度覆盖。 */
      if ((img.style && img.style.width) || img.getAttribute('data-insw')) {
        setWidth(img, readRatio(img));
      }
      st.before = img.style.cssText;
      el.__img = img;
      el.classList.add('show');
      selected(true);
      if (o.guard) o.guard.setActive(editor, true);
      else if (editor) editor.__imgCtlActive = true;
      img.style.maxHeight = 'none';
      setMode('zoom');
    }

    range.oninput = function () {
      var v = parseInt(range.value, 10);
      val.textContent = st.mode === 'zip' ? (L.quality + v + '%') : (v + '%');
      if (st.mode === 'zoom' && st.img) setWidth(st.img, v);
      refreshPx();
    };

    modes.querySelectorAll('.m').forEach(function (b) {
      b.onclick = function () { setMode(b.dataset.mode); };
    });

    el.querySelector('[data-part=apply]').onclick = function () {
      var v = parseInt(range.value, 10);
      if (st.mode === 'zoom') {
        var tw = Math.round(boxW(st.img) * v / 100);
        setWidth(st.img, v);
        finish(true);
        if (o.onApplied) o.onApplied(editor);
        tip(L.tipZoom + tw + L.tipZoomTail);
        return;
      }
      if (v >= 100) { tip(L.tipAlreadyOrig); return; }
      var enc = o.reencode || reencode;
      enc(st.img, v / 100, function (ok, why, w, h, before, after) {
        if (!ok) { tip(why === 'alpha' ? L.tipAlpha : L.tipNoShrink); return; }
        finish(true);
        if (o.onApplied) o.onApplied(editor);
        tip(L.quality + v + '% · 体积 ' + before + ' KB → ' + after + ' KB，长宽没动');
      });
    };

    el.querySelector('[data-part=reset]').onclick = function () {
      var im = st.img;
      if (!im) return;
      var insPct = pctOf(im.getAttribute('data-insw'));
      if (insPct !== null) setWidth(im, insPct);
      else { im.style.width = ''; im.style.maxWidth = ''; im.style.height = ''; }
      setMode(st.mode);
      tip(L.tipRestored);
    };

    el.querySelector('[data-part=cancel]').onclick = function () { finish(false); };

    /* 点条与图片以外任意位置，按没应用处理 */
    function onDocClick(e) {
      if (!el.classList.contains('show')) return;
      if (el.contains(e.target)) return;
      var im = el.__img;
      if (im && (im === e.target || im.contains(e.target))) return;
      finish(false);
    }
    doc.addEventListener('click', onDocClick, true);

    return {
      el: el,
      open: open,
      close: close,
      isOpen: function () { return el.classList.contains('show'); },
      destroy: function () {
        doc.removeEventListener('click', onDocClick, true);
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    };
  }

  KB.ImgCtl = {
    create: create,
    kbOf: kbOf,
    probeHasAlpha: probeHasAlpha,
    estimateKb: estimateKb,
    reencode: reencode,
    shrink: shrink,
    store: store,
    rowWidth: rowWidth,
    insertRatio: insertRatio,
    readRatio: readRatio,
    setWidth: setWidth,
    setRatio: setRatio,
    normalize: normalize,
    boxW: boxW,
    pctOf: pctOf
  };
})(window);
