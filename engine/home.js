/* 主页渲染：模块网格、我的卡片入口（双形态）、学习进度。
   配置驱动：模块列表、配色方案、入口形态全读 project.config.js，代码不做假设。
   清除数据与导入导出的入口挂在学习进度条两端，由独立模块接入。 */

(function (global) {
  'use strict';

  var KB = global.KB = global.KB || {};

  var cfg = global.PROJECT_CONFIG || {};
  var home = cfg.home || {};
  var palettes = global.HOME_PALETTES || {};

  /* 渲染时才解析配色：生成器或页面可在 start() 前改 palette 热切换 */
  function paletteColors() { return palettes[home.palette || 'default'] || []; }

  /* 由单个主色衍生配套的亮色与底色：亮色 = 主色混白 36%，底色 = 混白 90%。 */
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
  function deriveColors(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
    return { c: hex, c2: mixWhite(hex, 0.36), soft: mixWhite(hex, 0.90) };
  }

  /* 取模块的配色：配置里指定了 color 就用指定的——
     色名在所有风格套里全局查（轮取套之外的套也能点色）/
     单 hex 自动衍生 / {c,c2,soft} 对象直接用；
     都不是（或色名查不到）返回 null，由调用方按序号从轮取套兜底 */
  function colorOf(m) {
    if (!m || !m.color) return null;
    if (typeof m.color === 'string') {
      if (m.color.charAt(0) === '#') return deriveColors(m.color);
      for (var key in palettes) {
        var list = palettes[key] || [];
        for (var i = 0; i < list.length; i++) {
          if (list[i].name === m.color) return list[i];
        }
      }
      return null;
    }
    return m.color;
  }

  /* 按渲染顺序收集实际用到的亮色（c2），拼成顶部彩虹线渐变。
     写到 .home-head 的同名 CSS 变量上，覆盖 tokens 里的默认值。 */
  function paintRainbowLine() {
    var head = document.querySelector('.home-head');
    if (!head) return;
    var pool = paletteColors();
    var items = (home.modules || []).slice();
    var mine = home.myCards;
    if (mine && mine.style === 'module') items.push(mine);
    var stops = [];
    for (var i = 0; i < items.length; i++) {
      var col = colorOf(items[i]) || pool[i % pool.length] || {};
      if (col.c2) stops.push(col.c2);
    }
    if (stops.length) {
      head.style.setProperty('--home-head-line', 'linear-gradient(90deg, ' + stops.join(', ') + ')');
    }
  }

  var esc = KB.escape;

  /* ---------- 模块卡 ---------- */

  function modCard(m, i) {
    var colors = paletteColors();
    var col = colorOf(m) || colors[i % colors.length] || {};
    var bookSvg = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
      '<path d="M2 3.5c2-1 4-1 6 0v10c-2-1-4-1-6 0zM14 3.5c-2-1-4-1-6 0v10c2-1 4-1 6 0z" ' +
      'stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    var book = m.answerBook
      ? '<a class="mod-answer" href="' + esc(m.answerBook.page) + '"' +
        ' title="进入' + esc(m.answerBook.label || '答案册') + '">' + bookSvg +
        '<span>' + esc(m.answerBook.label || '答案册') + '</span></a>'
      : '';
    /* 答案册入口与卡片同级，避免链接嵌套；配色变量挂在外层供两边继承 */
    return '<div class="mod-wrap" style="--c:' + esc(col.c) + ';--c2:' + esc(col.c2) + ';--soft:' + esc(col.soft) + '">' +
      '<a class="mod" href="' + esc(m.url) + '" title="' + esc(m.title) + '">' +
      '<div class="ic">' + esc(m.icon) + '</div>' +
      '<div class="t">' + esc(m.title) + '</div>' +
      '<div class="d">' + esc(m.desc) + '</div>' +
      '<div class="foot">' +
        (m.count != null ? '<span class="count">' + esc(m.count) + ' 张</span>' : '<span></span>') +
        '<span class="go">进入 →</span>' +
      '</div>' +
      '</a>' + book + '</div>';
  }

  function renderGrid() {
    var grid = document.getElementById('homeGrid');
    if (!grid) return;
    var html = (home.modules || []).map(modCard).join('');

    /* 我的卡片入口双形态：module 时与模块卡同风格进网格，bar 时由 home.html 静态通栏承载（脚本未跑也可进入） */
    var mine = home.myCards;
    if (mine && mine.style === 'module') {
      html += modCard(mine, (home.modules || []).length);
    }
    grid.innerHTML = html;
  }

  /* ---------- 学习进度（输入框只是门把手，正文在弹层写，
     停手 2.5s 自动保存；朗读共用进度条上的主播放器，弹层按钮只是代理） ---------- */

  var PROG_TIP = '随手记一句：今天背到哪、哪块还没搞懂、下一步计划…';
  var AUTO_SAVE_DELAY = 2500;

  function initProgress(mainTtsCtl) {
    var input = document.getElementById('progressNote');
    var overlay = document.getElementById('progOverlay');
    var card = overlay && overlay.querySelector('.prog-card');
    if (!input || !overlay || !card) return;

    var full = card.querySelector('textarea');
    var cnt = card.querySelector('.prog-cnt');
    var dt = card.querySelector('.dt');
    var saveBtn = card.querySelector('.prog-save');
    var clearBtn = card.querySelector('.prog-clear');
    var ttsBtn = card.querySelector('.prog-tts');
    var closeBtn = card.querySelector('.prog-card-close');
    if (!full) return;

    var mainTts = document.getElementById('ttsBtn');
    var autoTimer = null;

    /* 输入框是门把手：不可打字，点了开弹层 */
    input.setAttribute('readonly', 'readonly');
    input.title = '点击展开写';
    input.value = KB.Store.get('home', 'progress', '');

    function count() { cnt.textContent = full.value.replace(/\s/g, '').length + ' 字'; }

    /* 头部日期 = 最后一次保存的时间 */
    function renderDate() {
      var t = parseInt(KB.Store.get('home', 'progress-at', '0'), 10) || 0;
      if (!t) { dt.textContent = '还没有记录'; return; }
      var d = new Date(t);
      function pad(n) { return n < 10 ? '0' + n : '' + n; }
      dt.textContent = '最后保存 ' + (d.getMonth() + 1) + '.' + d.getDate() +
        ' 周' + '日一二三四五六'[d.getDay()] + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function doSave(showTip) {
      var v = full.value;
      KB.Store.set('home', 'progress', v);
      KB.Store.set('home', 'progress-at', String(Date.now()));
      /* 条上的门把手只显示单行（换行拍平） */
      input.value = v.replace(/[\r\n]+/g, ' ');
      if (showTip) {
        cnt.classList.add('saved');
        cnt.textContent = '已保存';
        saveBtn.textContent = '已保存 ✓';
        saveBtn.classList.add('done');
        setTimeout(function () {
          cnt.classList.remove('saved');
          count();
        }, 1200);
        setTimeout(function () {
          saveBtn.textContent = '保存';
          saveBtn.classList.remove('done');
        }, 1400);
      }
      renderDate();
      count();
    }

    function stopIfPlaying() {
      if (mainTtsCtl && mainTtsCtl.isBusy()) mainTtsCtl.stop();
    }

    function openCard() {
      full.value = KB.Store.get('home', 'progress', '');
      count();
      renderDate();
      /* 门把手把焦点交出去，光标别在遮罩后面一闪一闪 */
      try { input.blur(); } catch (e) {}
      overlay.classList.add('show');
      setTimeout(function () { full.focus(); }, 120);
    }

    function closeCard() { overlay.classList.remove('show'); }

    input.addEventListener('click', function (e) { e.preventDefault(); openCard(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(); }
    });

    /* 弹层里一改字就停读（念的已是旧内容），停手 2.5s 自动保存 */
    full.addEventListener('input', function () {
      stopIfPlaying();
      count();
      clearTimeout(autoTimer);
      autoTimer = setTimeout(function () { doSave(false); }, AUTO_SAVE_DELAY);
    });

    if (saveBtn) saveBtn.addEventListener('click', function () {
      clearTimeout(autoTimer);
      doSave(true);
    });

    /* 清空点两次才真清，防手滑 */
    var clearArm = null;
    function resetClear() {
      clearArm = null;
      clearBtn.textContent = '清空';
      clearBtn.classList.remove('danger');
    }
    if (clearBtn) clearBtn.addEventListener('click', function () {
      if (!clearArm) {
        clearBtn.textContent = '确定清空？';
        clearBtn.classList.add('danger');
        clearArm = setTimeout(resetClear, 3000);
        return;
      }
      clearTimeout(clearArm);
      resetClear();
      clearTimeout(autoTimer);
      stopIfPlaying();
      full.value = '';
      doSave(true);
      full.focus();
    });

    /* 弹层朗读：完全共用主界面的播放器（语速/暂停/状态一套），
       把弹层最新内容推给主控件再代点主按钮；按钮文案用观察者同步 */
    var lastSpoken = null;
    if (ttsBtn && mainTts && mainTtsCtl && mainTtsCtl.supported) {
      var syncTtsLabel = function () {
        var playing = mainTts.classList.contains('speaking');
        var paused = mainTts.classList.contains('paused');
        ttsBtn.textContent = playing ? '⏸ 暂停' : (paused ? '▶ 继续' : '🔊 朗读');
        ttsBtn.classList.toggle('speaking', playing);
        ttsBtn.classList.toggle('paused', paused);
      };
      try {
        new MutationObserver(syncTtsLabel).observe(mainTts, { attributes: true, attributeFilter: ['class'] });
      } catch (e) {}
      syncTtsLabel();

      ttsBtn.addEventListener('click', function () {
        var text = full.value.replace(/[\r\n]+/g, ' ');
        if (!text.trim()) return;
        /* 内容改过了先复位播放器，免得从上次停下的位置接着念 */
        if (lastSpoken !== null && lastSpoken !== full.value) stopIfPlaying();
        lastSpoken = full.value;
        /* 先把最新内容写进存储并同步门把手，保证主按钮读到的是刚写的 */
        KB.Store.set('home', 'progress', full.value);
        input.value = text;
        mainTts.click();
        setTimeout(syncTtsLabel, 100);
      });
    } else if (ttsBtn) {
      ttsBtn.disabled = true;
    }

    if (closeBtn) closeBtn.addEventListener('click', closeCard);
    /* 点遮罩关闭（点卡片本身不关）；朗读不随关闭中断 */
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeCard(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('show')) closeCard();
    });
  }

  /* ---------- 学习进度朗读（引擎在 engine/tts.js，语速记忆挂项目名下） ---------- */

  function initTTS() {
    if (!KB.TTS || !KB.UI) return null;
    return KB.TTS.mount({
      btn: document.getElementById('ttsBtn'),
      range: document.getElementById('ttsRate'),
      val: document.getElementById('ttsVal'),
      textInput: document.getElementById('progressNote'),
      getText: function () { return KB.Store.get('home', 'progress', ''); },
      title: '朗读学习进度',
      emptyTip: '先写点学习进度，再朗读哦',
      toast: function (m) { KB.UI.toast(m); },
      getRate: function () { return KB.Store.get('home', 'tts-rate', null); },
      setRate: function (v) { KB.Store.set('home', 'tts-rate', v); }
    });
  }

  /* ---------- 清除数据：核心与选择器拆在 engine/clear/ ----------
     这里只负责接线。默认用花瓣选模块，换形态改 home.clear.picker。 */

  function initClearData(mainTtsCtl, getSyncCtl) {
    if (!KB.Clear) return null;
    return KB.Clear.mount({
      section: document.getElementById('clearSection'),
      layer: document.getElementById('petalLayer'),
      btn: document.getElementById('clearBtn'),
      label: document.getElementById('clearText'),
      overlay: document.getElementById('confirmOverlay'),
      list: document.getElementById('confirmList'),
      okBtn: document.getElementById('confirmOk'),
      cancelBtn: document.getElementById('confirmCancel'),
      modules: home.modules || [],
      config: home.clear || {},
      labelText: (home.clear && home.clear.label) || '清除',
      colorAt: function (i) {
        var m = (home.modules || [])[i];
        var pool = paletteColors();
        return colorOf(m) || pool[i % pool.length] || {};
      },
      storagePrefix: cfg.storagePrefix,
      projectId: cfg.projectId,
      onOpen: function () {
        var s = getSyncCtl && getSyncCtl();
        if (s) s.close();
      },
      onCleared: function () {
        if (mainTtsCtl && mainTtsCtl.isBusy()) mainTtsCtl.stop();
        var input = document.getElementById('progressNote');
        try { if (input) input.value = ''; } catch (err) {}
      },
      toast: function (t) { if (KB.UI && KB.UI.toast) KB.UI.toast(t); }
    });
  }

  /* ---------- 导入导出：核心在 engine/sync/core.js ----------
     备份 = 本项目 localStorage 全部键 + 图床图片（可选）。
     图床读不到时备份标 incomplete，不写空壳。 */

  function initSync(clearCtl, mainTtsCtl) {
    if (!KB.Sync) return null;
    var syncCfg = home.sync || {};
    var btn = document.getElementById('syncBtn');
    if (btn && syncCfg.label) btn.textContent = syncCfg.label;
    return KB.Sync.mount({
      section: document.getElementById('syncSection'),
      btn: btn,
      orbImport: document.getElementById('orbImport'),
      orbExport: document.getElementById('orbExport'),
      fileInput: document.getElementById('importFile'),
      modules: home.modules || [],
      storagePrefix: cfg.storagePrefix,
      projectId: cfg.projectId,
      fileName: syncCfg.fileName || '知识库备份',
      texts: syncCfg.texts || {},

      exportOverlay: document.getElementById('exportOverlay'),
      exportImages: document.getElementById('expImages'),
      optImages: document.getElementById('optImages'),
      exportConfig: document.getElementById('expConfig'),
      optConfig: document.getElementById('optConfig'),
      exportHistory: document.getElementById('expHistory'),
      optHistory: document.getElementById('optHistory'),
      exportSize: document.getElementById('exportSize'),
      exportOk: document.getElementById('exportOk'),
      exportCancel: document.getElementById('exportCancel'),

      onOpen: function () { if (clearCtl) clearCtl.reset(); },
      onImporting: function () {
        if (mainTtsCtl && mainTtsCtl.isBusy()) mainTtsCtl.stop();
      },
      toast: function (t) { if (KB.UI && KB.UI.toast) KB.UI.toast(t); }
    });
  }

  /* ---------- 引导 ---------- */

  function start() {
    KB.Store.configure({ prefix: cfg.storagePrefix, projectId: cfg.projectId });
    if (KB.UI && KB.UI.initToast) KB.UI.initToast(document.getElementById('toast'));

    /* 内容类数据在库里，等镜像灌满再渲染与接线，
       否则导出与统计只看得到 localStorage 那一层 */
    var boot = (KB.Store && KB.Store.ready) ? KB.Store.ready() : Promise.resolve();
    Promise.resolve(boot).then(mountHome, mountHome);
  }

  function mountHome() {
    /* 文案全部来自配置 */
    var title = document.getElementById('homeTitle');
    var sub = document.getElementById('homeSubtitle');
    var foot = document.getElementById('homeFooter');
    if (title && home.title) title.textContent = home.title;
    if (sub && home.subtitle) sub.textContent = home.subtitle;
    /* 页脚支持一行或多行：字符串按单行处理，数组逐行渲染 */
    if (foot && home.footer) {
      var lines = Array.isArray(home.footer) ? home.footer : [home.footer];
      foot.innerHTML = '';
      lines.forEach(function (t) {
        if (t == null || t === '') return;
        var s = document.createElement('span');
        s.className = 'home-foot-line';
        s.textContent = t;
        foot.appendChild(s);
      });
    }
    document.title = home.title || document.title;

    /* 搜索页路径留空就不渲染入口 */
    var search = document.getElementById('hdrSearch');
    if (search) {
      if (home.search) search.href = home.search;
      else search.style.display = 'none';
    }

    renderGrid();
    paintRainbowLine();
    var ttsCtl = initTTS();
    initProgress(ttsCtl);

    /* 花瓣与同步球互斥：展开一边就收起另一边。
       两个模块互不认识，交叉接线只在这里做一次 */
    var syncCtl = null;
    var clearCtl = initClearData(ttsCtl, function () { return syncCtl; });
    syncCtl = initSync(clearCtl, ttsCtl);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  KB.Home = { start: start };
})(window);
