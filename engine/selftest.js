/* 自测：先默背，再揭晓答案，然后自评。
   关闭时对页面零影响——不染色、不遮罩、不筛卡，卡片跟普通模式完全一样。

   标记三档（会了 / 模糊 / 忘了）与「未测」一起构成上方那排计数。
   档位是隐藏条件而不是筛选条件：它只给不合档的卡片加 st-hide，DOM 不删，
   所以统计分母始终是「筛选态的张数」，换档随时能换回来；抽查池另按档位挑。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  var LEVELS = ['ok', 'meh', 'no'];
  var CHIPS = [
    { key: 'all', label: '全部', cls: '' },
    { key: 'weak', label: '只看不会的', cls: 'c-weak' },
    { key: 'ok', label: '会了', cls: 'c-ok' },
    { key: 'meh', label: '模糊', cls: 'c-meh' },
    { key: 'no', label: '忘了', cls: 'c-no' },
    { key: 'none', label: '未测', cls: 'c-left' }
  ];

  /* 自测三档叫法：项目配置 selftestLabels 可覆盖，没配用「会了／模糊／忘了」。
     子页（本文件）与答案册（answers.js）共用同一份配置，改一处两处都变。 */
  function labels() {
    var L = (global.PROJECT_CONFIG && global.PROJECT_CONFIG.selftestLabels) || {};
    return { ok: L.ok || '会了', meh: L.meh || '模糊', no: L.no || '忘了' };
  }

  var cfg = null;
  var on = false;
  var chip = 'all';
  var marks = {};
  var revealed = {};
  /* 进抽查前那份可见 id：抽查时栅格只剩一张，统计要沿用这份才不会缩成 1 */
  var statsIds = null;

  var switchEl = null;
  var barEl = null;
  var toggleInput = null;

  function load() {
    if (!cfg) return;
    on = KB.Store.get(cfg.moduleId, 'selftest-on', false) === true;
    marks = KB.Store.get(cfg.moduleId, 'selftest', {}) || {};
    var saved = KB.Store.get(cfg.moduleId, 'selftest-chip', 'all');
    chip = CHIPS.some(function (c) { return c.key === saved; }) ? saved : 'all';
  }

  function countLearned() {
    return Object.keys(marks).length;
  }

  function enabled() {
    return on;
  }

  /* 档位筛选：没开启自测时一律放行，页面逻辑不用分叉 */
  function pass(id) {
    if (!on || chip === 'all') return true;
    var m = marks[id];
    if (chip === 'weak') return m === 'meh' || m === 'no';
    if (chip === 'none') return !m;
    return m === chip;
  }

  function buildSwitch() {
    switchEl = document.createElement('label');
    switchEl.className = 'st-switch';
    /* 叫法由页面给：有答案区的叫自测模式，只有作答区的题库页叫熟悉度 */
    switchEl.title = cfg.hint || '自测模式：先默背，再看答案，然后自评';
    switchEl.innerHTML =
      '<input type="checkbox" id="stToggle">' +
      '<span class="st-track"></span>' +
      '<span class="st-lbl"></span>';
    switchEl.querySelector('.st-lbl').textContent = cfg.label || '自测模式';

    var title = cfg.headerEl.querySelector('h1');
    if (title && title.parentNode) title.parentNode.insertBefore(switchEl, title.nextSibling);
    else cfg.headerEl.appendChild(switchEl);

    var input = switchEl.querySelector('input');
    toggleInput = input;
    input.checked = on;
    input.addEventListener('change', function () {
      on = input.checked;
      KB.Store.set(cfg.moduleId, 'selftest-on', on);
      revealed = {};
      document.body.classList.toggle('st-on', on);
      /* 全局开关位：AI 取卡片上下文时据此决定要不要读答案 */
      global.__selfTestOn = on;
      /* 切换开关时清掉焦点标记：上一次会话看的那张不该继续被 AI 当成焦点 */
      global.__stFocusId = null;
      /* 只开关、不动筛选：页面据此增删卡内节点，不重建列表 */
      cfg.onChange({ kind: 'toggle' });
    });
  }

  function buildBar() {
    barEl = document.createElement('div');
    barEl.className = 'st-bar';
    var L = labels();
    barEl.innerHTML = CHIPS.map(function (c) {
      var lbl = c.label;
      if (c.key === 'ok') lbl = L.ok;
      else if (c.key === 'meh') lbl = L.meh;
      else if (c.key === 'no') lbl = L.no;
      return (
        '<button type="button" class="st-chip ' + c.cls +
        (c.key === chip ? ' sel' : '') +
        '" data-f="' + c.key + '">' + lbl + '<b>0</b></button>'
      );
    }).join('');

    cfg.listEl.parentNode.insertBefore(barEl, cfg.listEl);

    barEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.st-chip');
      if (!btn) return;
      chip = btn.dataset.f;
      KB.Store.set(cfg.moduleId, 'selftest-chip', chip);
      Array.prototype.forEach.call(barEl.children, function (b) {
        b.classList.toggle('sel', b === btn);
      });
      /* 只改隐藏、不重建列表；页面据此更新抽查条的「下一张」是否可点 */
      syncHidden();
      syncCounts();
      cfg.onChange({ kind: 'chip' });
    });
  }

  /* 当前列表里的全部卡：章节、收藏、搜索改了什么它就跟着变。
     档位不算在内——档位只是把卡藏起来，DOM 留着，所以统计分母照旧是全量。 */
  function listIds() {
    var ids = [];
    Array.prototype.forEach.call(cfg.listEl.querySelectorAll('.card-item'), function (el) {
      if (el.dataset.id) ids.push(el.dataset.id);
    });
    return ids;
  }

  /* 档位靠 st-hide 隐藏，不重建列表。这样三件事同时成立：
     统计分母还是筛选态的张数、滚动位置不动、展开态不丢。
     抽查态一律不藏——抽查池已经按档位挑过，把当前这张藏掉会整页空白。 */
  function syncHidden() {
    var inSingle = cfg.listEl.classList.contains('single-mode');
    Array.prototype.forEach.call(cfg.listEl.querySelectorAll('.card-item'), function (card) {
      card.classList.toggle('st-hide', !inSingle && !pass(card.dataset.id));
    });
  }

  function syncCounts() {
    if (!barEl) return;

    /* 面板按当前列表的全部卡统计，档位不影响分母；
       抽查时栅格只剩一张，沿用进抽查前那份 id 集合，总数才不缩成 1。 */
    var domIds = listIds();
    var ids;
    if (cfg.listEl.classList.contains('single-mode')) {
      ids = statsIds && statsIds.length ? statsIds : domIds;
    } else {
      statsIds = domIds.slice();
      ids = domIds;
    }

    var n = { all: 0, ok: 0, meh: 0, no: 0, weak: 0, none: 0 };
    ids.forEach(function (id) {
      var m = marks[id];
      n.all++;
      if (m) n[m]++;
      else n.none++;
    });
    n.weak = n.meh + n.no;

    Array.prototype.forEach.call(barEl.children, function (b) {
      var v = b.querySelector('b');
      if (v) v.textContent = n[b.dataset.f] || 0;
    });

    /* 顶部「已学」是全本口径，跟收藏一样不跟筛选走，单独数全部标记 */
    if (cfg.statsEl) {
      var tag = cfg.statsEl.querySelector('[data-stat="learned"]');
      if (tag) {
        tag.hidden = !on;
        KB.UI.setStat(cfg.statsEl, 'learned', countLearned());
      }
    }
  }

  /* 遮罩 = 模糊的答案 + 一层空的虚线框。
     框放在答案之前，被模糊后的答案压住，只从边缘露出一圈浅虚线；
     框里不写字，写字会盖在模糊的答案上，反而糊成一片。 */
  function maskOn(answer) {
    if (answer.querySelector('.st-mask')) return;
    var inner = answer.querySelector('.answer-inner');
    if (!inner) return;

    var mask = document.createElement('div');
    mask.className = 'st-mask';

    var cover = document.createElement('div');
    cover.className = 'st-cover';

    answer.insertBefore(mask, inner);
    mask.appendChild(cover);
    mask.appendChild(inner);
  }

  function maskOff(answer) {
    var mask = answer.querySelector('.st-mask');
    if (!mask) return;
    var inner = mask.querySelector('.answer-inner');
    if (inner) answer.appendChild(inner);
    mask.remove();
  }

  function ensureRate(card, id) {
    if (card.querySelector('.st-rate')) return;

    var answer = card.querySelector('.card-answer');
    /* 有答案区就挂在答案下面；题库页（熟悉度）没有答案区可揭晓，
       自评三键直接挂在题目下方，也不出「查看答案」那一个。 */
    var anchor = answer || card.querySelector('.card-question');
    if (!anchor || !anchor.parentNode) return;

    var rate = document.createElement('div');
    rate.className = 'st-rate';
    rate.dataset.id = id;
    var L = labels();
    rate.innerHTML =
      '<button type="button" class="st-b-ok">' + L.ok + '</button>' +
      '<button type="button" class="st-b-meh">' + L.meh + '</button>' +
      '<button type="button" class="st-b-no">' + L.no + '</button>' +
      (answer ? '<button type="button" class="st-b-view">查看答案</button>' : '');

    anchor.parentNode.insertBefore(rate, anchor.nextSibling);

    LEVELS.forEach(function (lv) {
      rate.querySelector('.st-b-' + lv).addEventListener('click', function () {
        mark(id, lv);
      });
    });

    var view = rate.querySelector('.st-b-view');
    if (view) {
      view.addEventListener('click', function () {
        revealed[id] = !revealed[id];
        /* 揭晓这张就把焦点交给它，AI 读卡时优先取这一张 */
        global.__stFocusId = id;
        paint(card, id);
      });
    }
  }

  function mark(id, level) {
    if (marks[id] === level) delete marks[id];
    else marks[id] = level;

    revealed[id] = !!marks[id];
    /* 自评这张，同样把焦点交给它 */
    global.__stFocusId = id;
    KB.Store.set(cfg.moduleId, 'selftest', marks);
    syncCounts();

    var card = cfg.listEl.querySelector('.card-item[data-id="' + id + '"]');
    if (card) paint(card, id);

    /* 这张刚换了档位：不属于当前档就当场藏起来，与切换档位同一套规则 */
    syncHidden();
  }

  function paint(card, id) {
    var m = marks[id] || '';
    card.classList.remove('st-ok', 'st-meh', 'st-no');
    /* 只在自测开着时染色：关掉之后卡片要跟没标过一样 */
    if (on && m) card.classList.add('st-' + m);

    var rate = card.querySelector('.st-rate');
    if (rate) {
      Array.prototype.forEach.call(rate.querySelectorAll('button'), function (b) {
        b.classList.remove('sel');
      });
      if (m) {
        var sel = rate.querySelector('.st-b-' + m);
        if (sel) sel.classList.add('sel');
      }
      var view = rate.querySelector('.st-b-view');
      if (view) view.textContent = revealed[id] ? '重新遮住' : '查看答案';
    }

    var answer = card.querySelector('.card-answer');
    if (!answer) return;

    if (on && !revealed[id]) maskOn(answer);
    else maskOff(answer);
  }

  /* 页面每次重绘后调用：给新生成的卡片套上遮罩和自评按钮 */
  function refresh() {
    if (!barEl) return;

    var cards = cfg.listEl.querySelectorAll('.card-item');
    Array.prototype.forEach.call(cards, function (card) {
      var id = card.dataset.id;
      var answer = card.querySelector('.card-answer');

      if (on) {
        if (answer) answer.classList.add('open');
        ensureRate(card, id);
      } else {
        /* 退出时回到进自测前的展开态，其余收起 */
        if (answer) answer.classList.toggle('open', !!(cfg.isOpen && cfg.isOpen(id)));
        var rate = card.querySelector('.st-rate');
        if (rate) rate.remove();
      }
      paint(card, id);
    });

    syncHidden();
    syncCounts();
  }

  /* 从往返缓存恢复、从后台切回时，浏览器会按上次的样子还原 checkbox，
     但 change 事件不会触发，于是按钮看着是开的、内部却还是关的，遮罩也不生效。
     这类恢复一律以内存里的 on 为准强制对齐一次。 */
  function syncToggleUI() {
    if (toggleInput && toggleInput.checked !== on) toggleInput.checked = on;
    global.__selfTestOn = on;
    global.__stFocusId = null;
    document.body.classList.toggle('st-on', on);
  }

  function init(options) {
    cfg = options;
    load();

    buildSwitch();
    buildBar();
    document.body.classList.toggle('st-on', on);
    /* 刷新后开关状态从存储恢复，这个全局位也要跟着复位，
       否则 AI 会按上一次会话的状态判断 */
    global.__selfTestOn = on;

    global.addEventListener('pageshow', syncToggleUI);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') syncToggleUI();
    });

    refresh();
  }

  KB.SelfTest = {
    init: init,
    enabled: enabled,
    pass: pass,
    refresh: refresh,
    countLearned: countLearned
  };
})(window);
