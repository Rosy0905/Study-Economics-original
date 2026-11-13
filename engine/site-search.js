/* 全站搜索页：渲染、事件与结果跳转都在这里。
   索引的加载与匹配交给 engine/search-worker.js，主线程不接触索引本体；
   后台线程不可用时（本地双击打开等）退回主线程同步加载，匹配仍是同一份内核，
   两条路径的判据与片段完全一致。 */

(function (global) {
  'use strict';
  var KB = global.KB || (global.KB = {});
  KB.SiteSearch = { mount: function () {

    var KW_KEY = 'site_search_kw';      /* 搜索词：sessionStorage，关标签页即清 */
    var POS_KEY = 'site_search_pos';    /* 从结果点进去的那条 + 它点开时的屏幕位置 */
    var MY_KEY = 'kb:demo:cards:items'; /* 我的卡片：内容层为主，这里留作兜底 */
    var PER_MOD = 40;                   /* 每个模块最多列多少条，防止搜「的」时渲染上千条卡死 */
    var INDEX_URL = 'search-index.js';

    var CORE = global.KB_SEARCH_CORE;
    var wrapEl = document.getElementById('wrap');
    var kwEl = document.getElementById('kw');
    var resetEl = document.getElementById('reset');

    if (!CORE || !wrapEl || !kwEl || !resetEl) {
      if (wrapEl) wrapEl.innerHTML = '<div class="empty">搜索内核没加载上</div>';
      return;
    }

    var esc = CORE.esc;

    var keyword = '';
    var timer = null;
    var srPos = null;
    var curRes = { groups: [], total: 0 };
    var booted = false;
    var pendingKw = '';
    var worker = null;
    var fellBack = false;
    var mineCards = [];
    var msgId = 0;
    var lastSearchId = 0;
    var waiters = {};

    /* ================= 我的卡片：运行时补一组 =================
       存在内容层，构建期读不到，只能这里现读。
       本地双击打开时浏览器可能不共享存储，读不到就静默跳过，不报错。 */
    function loadMyCards() {
      var out = [];
      try {
        var arr = null;
        if (KB.Store && KB.Store.get) {
          var v = KB.Store.get('cards', 'items', null);
          if (Array.isArray(v)) arr = v;
        }
        if (!arr) {
          var raw = global.localStorage.getItem(MY_KEY);
          arr = raw ? JSON.parse(raw) : [];
        }
        if (Array.isArray(arr)) {
          arr.forEach(function (o) {
            if (!o) return;
            var id = String(o.id || '');
            var q = String(o.question || '');
            var a = String(o.answerHtml || o.answer || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
            if (!id || (!q && !a)) return;
            out.push({ i: id, q: q, a: a, s: String(o.chapter || ''), t: String(o.subject || ''), d: String(o.qid || '') });
          });
        }
      } catch (e) { out = []; }
      return out;
    }

    /* 主线程同步路径用：索引模块在前，我的卡片补在后 */
    function allMods() {
      var idx = global.SITE_INDEX;
      var mods = (idx && idx.mods) ? idx.mods.slice() : [];
      var mine = loadMyCards();
      if (mine.length) {
        mods.push({ key: '9my-cards', name: '我的卡片', url: 'mycards.html', n: mine.length, cards: mine });
      }
      return mods;
    }

    /* ================= 结果跳转与位置 ================= */
    function jumpUrl(g, h, kw) {
      /* 真题答案册的搜索框和结果条跟子页不是一套结构，ans=1 让落点脚本换一套选择器；
         from=site 只是给那边挂返回条用的标记 */
      if (g.hash) {
        return g.url + '?kw=' + encodeURIComponent(kw) +
          '&cid=' + encodeURIComponent(h.i) + '&ans=1&from=site#' + encodeURIComponent(h.i);
      }
      return g.url + '?kw=' + encodeURIComponent(kw) + '&cid=' + encodeURIComponent(h.i);
    }

    function savePos(key) {
      var el = document.querySelector('.hit[data-key="' + key + '"]');
      if (!el) { srPos = null; return; }
      var r = el.getBoundingClientRect();
      srPos = { kw: keyword.trim(), key: key, vtop: Math.round(r.top), y: Math.round(global.scrollY || 0) };
      try { sessionStorage.setItem(POS_KEY, JSON.stringify(srPos)); } catch (e) {}
    }
    function restorePos() {
      var p = srPos;
      if (!p) {
        try {
          var raw = sessionStorage.getItem(POS_KEY);
          p = raw ? JSON.parse(raw) : null;
        } catch (e) { p = null; }
      }
      if (!p || !p.key) return false;
      if (p.kw !== keyword.trim()) return false;
      var el = document.querySelector('.hit[data-key="' + p.key + '"]');
      if (!el) return false;
      var apply = function () {
        var e2 = document.querySelector('.hit[data-key="' + p.key + '"]');
        if (!e2) return;
        var doc = e2.getBoundingClientRect().top + (global.scrollY || 0);
        var max = document.documentElement.scrollHeight - global.innerHeight;
        var want = doc - (p.vtop || 0);
        global.scrollTo(0, max > 0 ? Math.min(Math.max(0, want), max) : Math.max(0, want));
      };
      apply();
      if (global.requestAnimationFrame) global.requestAnimationFrame(apply);
      setTimeout(apply, 130);
      el.classList.remove('hit-flash');
      void el.offsetWidth;
      el.classList.add('hit-flash');
      setTimeout(function () { el.classList.remove('hit-flash'); }, 2400);
      return true;
    }

    /* ================= 结果渲染 ================= */
    function hitHtml(g, h) {
      var meta = h.meta || '';
      return '<a class="hit" href="' + esc(jumpUrl(g, h, keyword.trim())) + '" ' +
        'data-key="' + esc(g.key + '|' + h.i) + '" ' +
        'data-mod="' + esc(g.key) + '" data-cid="' + esc(h.i) + '">' +
        (h.no ? '<span class="no">' + esc(h.no) + '</span>' : '') +
        '<span class="txt">' + (h.txt || '') +
        (h.where === 'a' ? '<span class="tip">　· 命中在答案里</span>' : '') + '</span>' +
        (meta ? '<span class="meta" title="' + esc(meta) + '">' + esc(meta) + '</span>' : '') +
        '</a>';
    }

    function groupHtml(g, all) {
      var hits = g.hits || [];
      var total = g.n || hits.length;
      var html = '<div class="grp-head">' + esc(g.name) + '<span>' + total + ' 张</span></div>';
      for (var i = 0; i < hits.length; i++) html += hitHtml(g, hits[i]);
      if (!all && total > hits.length) {
        html += '<button class="more-btn" type="button" data-mod="' + esc(g.key) + '">' +
          '展开剩下的 ' + (total - hits.length) + ' 张</button>';
      }
      return html;
    }

    function paint(res, kw) {
      var html = '<div class="sum">关键词 <b>「' + esc(kw) + '」</b>' +
        (res.total
          ? '　全站命中 <b>' + res.total + '</b> 张，分布在 <b>' + res.groups.length + '</b> 个模块'
          : '') + '</div>';

      if (!res.total) {
        html += '<div class="empty">没搜到「' + esc(kw) + '」<br>' +
          '<span>换个说法试试，空格分开两个词是「同时包含」的意思<br>' +
          '比如 <a href="#" data-demo="消费者 偏好">消费者 偏好</a>、' +
          '<a href="#" data-demo="无差异曲线">无差异曲线</a>、' +
          '<a href="#" data-demo="帕累托">帕累托</a></span></div>';
      }

      res.groups.forEach(function (g) {
        html += '<section class="grp" data-mod="' + esc(g.key) + '">' + groupHtml(g, false) + '</section>';
      });

      wrapEl.innerHTML = html;
      updateResetUI();
    }

    function renderIdle() {
      wrapEl.innerHTML = '<div class="empty">在右上角敲一个词，一次搜遍全站<br>' +
        '<span>各模块卡片、历年真题题干与答案、自己存的卡片，都在里面<br>' +
        '空格分开两个词表示「同时包含」，比如 <a href="#" data-demo="古诺 均衡">古诺 均衡</a></span></div>';
      updateResetUI();
    }

    function showBoot() {
      wrapEl.innerHTML = '<div class="empty">正在准备索引…</div>';
    }

    function fail() {
      wrapEl.innerHTML = '<div class="empty">索引没加载上<br><span>先跑一次 node _tools/build-search.js</span></div>';
    }

    /* ================= 取结果：后台线程优先，不可用时走主线程 ================= */
    function renderSearch(opt) {
      var kw = keyword.trim();
      if (!kw) { renderIdle(); return; }
      if (!booted) { pendingKw = kw; showBoot(); return; }

      var myId = ++msgId;
      lastSearchId = myId;

      var done = function (res, resKw) {
        if (myId !== lastSearchId) return;
        curRes = { groups: res.groups || [], total: res.total || 0 };
        paint(curRes, resKw || kw);
        if (!(opt && opt.restore && restorePos())) global.scrollTo(0, 0);
      };

      if (worker) {
        waiters[myId] = done;
        worker.postMessage({ type: 'search', id: myId, kw: kw, url: INDEX_URL, limit: PER_MOD, mine: mineCards });
      } else {
        done(CORE.runMods(allMods(), kw, PER_MOD), kw);
      }
    }

    function expandGroup(key) {
      var g = null;
      curRes.groups.forEach(function (x) { if (x.key === key) g = x; });
      if (!g) return;

      var apply = function (res) {
        var sec = null;
        try { sec = wrapEl.querySelector('section.grp[data-mod="' + key.replace(/["\\]/g, '\\$&') + '"]'); } catch (er) {}
        if (!sec) return;
        var hits = res.hits || [];
        sec.innerHTML = groupHtml({ key: g.key, name: g.name, n: hits.length, hits: hits }, true);
      };

      if (worker) {
        var myId = ++msgId;
        waiters[myId] = apply;
        worker.postMessage({ type: 'expand', id: myId, key: key, kw: keyword.trim(), url: INDEX_URL });
      } else {
        var m = null;
        allMods().forEach(function (x) { if (x.key === key) m = x; });
        var one = m ? CORE.runMods([m], keyword.trim(), 0) : null;
        apply(one && one.groups.length ? one.groups[0] : { hits: [] });
      }
    }

    /* ================= 输入与控件 ================= */
    function updateResetUI() {
      resetEl.classList.toggle('show', !!kwEl.value);
    }
    function saveKw() {
      try {
        if (keyword.trim()) sessionStorage.setItem(KW_KEY, keyword.trim());
        else sessionStorage.removeItem(KW_KEY);
      } catch (e) {}
    }

    kwEl.addEventListener('input', function () {
      updateResetUI();
      clearTimeout(timer);
      timer = setTimeout(function () {
        keyword = kwEl.value;
        saveKw();
        if (keyword.trim()) renderSearch(); else renderIdle();
      }, 220);
    });

    resetEl.addEventListener('click', function () {
      clearTimeout(timer);
      kwEl.value = '';
      keyword = '';
      pendingKw = '';
      saveKw();
      try { sessionStorage.removeItem(POS_KEY); } catch (e) {}
      renderIdle();
      kwEl.focus();
    });

    wrapEl.addEventListener('click', function (e) {
      var t = e.target;

      var d = t.closest ? t.closest('[data-demo]') : null;
      if (d) {
        e.preventDefault();
        kwEl.value = d.getAttribute('data-demo');
        keyword = kwEl.value;
        saveKw();
        renderSearch();
        return;
      }

      var more = t.closest ? t.closest('.more-btn') : null;
      if (more) {
        expandGroup(more.getAttribute('data-mod'));
        return;
      }

      var a = t.closest ? t.closest('.hit') : null;
      if (!a) return;
      /* 记下点的是哪条、它点开时在屏幕哪个位置，回来时弹回原处 */
      var key = a.getAttribute('data-key') || '';
      if (key) savePos(key);
      /* 不拦默认跳转：href 已经拼好，浏览器直接走，页面本身留在历史里 */
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (kwEl.value) {
          kwEl.value = '';
          keyword = '';
          pendingKw = '';
          saveKw();
          renderIdle();
        }
      }
    });

    /* ================= 启动 ================= */
    function onReady() {
      booted = true;
      if (pendingKw) {
        keyword = pendingKw;
        kwEl.value = pendingKw;
        pendingKw = '';
        renderSearch({ restore: false });
        return;
      }
      var saved = '';
      try { saved = sessionStorage.getItem(KW_KEY) || ''; } catch (e) {}
      if (!keyword && saved) {
        keyword = saved;
        kwEl.value = saved;
      }
      if (keyword.trim()) renderSearch({ restore: true });
      else renderIdle();
      if (global.matchMedia && global.matchMedia('(min-width: 641px)').matches) kwEl.focus();
    }

    function bootLegacy() {
      var s = document.createElement('script');
      s.src = INDEX_URL;
      s.onload = function () {
        var idx = global.SITE_INDEX;
        if (!idx || !idx.mods) { fail(); return; }
        onReady();
      };
      s.onerror = fail;
      document.body.appendChild(s);
    }

    function fallback() {
      if (fellBack) return;
      fellBack = true;
      try { if (worker) worker.terminate(); } catch (e) {}
      worker = null;
      booted = false;
      bootLegacy();
    }

    function onWorkerMessage(e) {
      var d = e.data || {};
      if (d.type === 'ready') { onReady(); return; }
      if (d.type === 'error') {
        if (!booted) { fallback(); return; }
        return;
      }
      var cb = waiters[d.id];
      if (!cb) return;
      delete waiters[d.id];
      if (d.type === 'result') cb({ groups: d.groups || [], total: d.total || 0 }, d.kw);
      else if (d.type === 'expanded') cb({ hits: d.hits || [] });
    }

    var canWorker = typeof global.Worker !== 'undefined' && global.location.protocol !== 'file:';
    if (canWorker) {
      try {
        worker = new global.Worker('engine/search-worker.js');
        worker.onmessage = onWorkerMessage;
        worker.onerror = function () { fallback(); };
      } catch (e) { worker = null; }
    }

    if (worker) {
      mineCards = loadMyCards();
      worker.postMessage({ type: 'mine', cards: mineCards });
      worker.postMessage({ type: 'load', url: INDEX_URL });
    } else {
      bootLegacy();
    }

    /* 卡片在内容层里，首帧可能还没读完：就绪后补一次我的卡片并重算 */
    if (KB.Store && KB.Store.ready && !KB.Store.isReady()) {
      KB.Store.ready().then(function () {
        mineCards = loadMyCards();
        if (worker) worker.postMessage({ type: 'mine', cards: mineCards });
        if (!booted) return;
        if (keyword.trim()) renderSearch({ restore: false });
        else renderIdle();
      });
    }
  } };
})(window);
