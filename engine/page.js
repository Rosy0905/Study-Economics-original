/* 普通子页装配：把一份配置和一份数据接成一张能用的页面。
   页面只留骨架和一行 mount，筛选、渲染、收藏、笔记、自测、抽查、键盘都在这里装。
   七类子页共用这一份，差异全在 PROJECT_CONFIG 与 MODULE_CONFIG 里。

   约定：本模块只认下面这些 id（可用 mount 的 ids 覆盖），其余一律不碰 DOM。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  var DEFAULT_IDS = {
    title: 'pageTitle',
    stats: 'stats',
    filterBar: 'filterBar',
    filterDims: 'filterDims',
    search: 'pageSearch',
    reset: 'btnReset',
    random: 'btnRandom',
    grid: 'cardGrid',
    empty: 'empty',
    toast: 'toast',
    singleBar: 'singleModeBar',
    singleBadge: 'singleCardBadge',
    prev: 'prevCardBtn',
    next: 'nextCardBtn',
    exit: 'exitSingleBtn',
    header: 'app-header'
  };

  var instance = null;

  function mount(config) {
    /* 内容类数据在 IndexedDB 里，读盘是异步的：没读完就装配会拿到空数据。
       等一次再装，通常几毫秒，页面骨架已经画出来了，看不出停顿。 */
    if (KB.Store && !KB.Store.isReady()) {
      KB.Store.ready().then(function () { mount(config); });
      return null;
    }

    var c = config || {};
    var P = c.project || global.PROJECT_CONFIG || {};
    var M = c.module || global.MODULE_CONFIG || {};
    var raw = c.data || global.MODULE_DATA || {};
    var cards = Array.isArray(raw) ? raw : raw.cards || [];

    var ids = {};
    Object.keys(DEFAULT_IDS).forEach(function (k) { ids[k] = DEFAULT_IDS[k]; });
    Object.keys(c.ids || {}).forEach(function (k) { ids[k] = c.ids[k]; });

    function byId(k) { return document.getElementById(ids[k]); }


    var grid = byId('grid');
    if (!grid) return null;

    var dimsEl = byId('filterDims');
    var barEl = byId('filterBar');
    var statsEl = byId('stats');
    var emptyEl = byId('empty');
    var searchEl = byId('search');

    KB.Store.configure({ prefix: P.storagePrefix, projectId: P.projectId });

    /* 图片跟着本子页走：图床键用和笔记同一个命名 kb:{项目}:{子页}:img:{随机}，
       导出、清数据、孤儿回收都按这个前缀对账 */
    if (KB.Blobs && KB.Blobs.setScope) {
      KB.Blobs.setScope({ prefix: P.storagePrefix, projectId: P.projectId, moduleId: M.id });
    }

    KB.UserData.init(M.id);
    KB.UI.initToast(byId('toast'));
    KB.UI.renderStats(statsEl, P.stats);

    /* 页头左块：标题、返回主页、自测开关、答案册入口排在一行。
       标题先包进左块，后面两个组件插进来时不用各自判断该挂哪儿。 */
    var headerEl = document.getElementById(ids.header) || document.querySelector('.app-header');
    var headerLeft = null;

    function mountHeaderNav() {
      if (!headerEl) return;
      var title = headerEl.querySelector('h1');

      headerLeft = headerEl.querySelector('.header-left');
      if (!headerLeft && title) {
        headerLeft = document.createElement('div');
        headerLeft.className = 'header-left';
        headerEl.insertBefore(headerLeft, title);
        headerLeft.appendChild(title);
      }
      if (!headerLeft) return;

      /* 返回主页：项目级配置，主页自己不挂这个页面，也就不配这一项 */
      if (P.back && P.back.href) {
        var back = document.createElement('a');
        back.className = 'back-home';
        back.href = P.back.href;
        back.title = '返回主页';
        back.innerHTML = '<span class="arrow">⬅</span><span></span>';
        back.lastChild.textContent = P.back.label || '主页';
        headerLeft.insertBefore(back, headerLeft.firstChild);
      }

      /* 板块串连导航：返回键右侧的序号圆钮，清单从主页模块派生 */
      if (KB.SectionNav) {
        KB.SectionNav.mount({
          project: P,
          host: headerLeft,
          after: headerLeft.querySelector('.back-home'),
          current: M.id
        });
      }
    }

    /* 答案册入口：模块配了 answerBook 才有，排在自测开关右边 */
    function mountAnswerEntry() {
      var ab = M.answerBook;
      if (!ab || !ab.page) return;
      var host = headerLeft || headerEl;
      if (!host) return;

      var a = document.createElement('a');
      a.className = 'answer-entry';
      a.href = ab.page;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = '整卷参考答案';
      a.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 6.2C10.6 4.9 8.7 4.2 6.5 4.2c-.8 0-1.5.1-2.2.3v13.1c.7-.2 1.4-.3 2.2-.3 2.2 0 4.1.7 5.5 2"/>' +
        '<path d="M12 6.2c1.4-1.3 3.3-2 5.5-2 .8 0 1.5.1 2.2.3v13.1c-.7-.2-1.4-.3-2.2-.3-2.2 0-4.1.7-5.5 2"/>' +
        '<path d="M12 6.2v13.1"/></svg>' +
        '<span class="ae-txt"></span>';
      a.querySelector('.ae-txt').textContent = ab.label || '答案册';

      var sw = host.querySelector('.st-switch');
      if (sw && sw.parentNode) sw.parentNode.insertBefore(a, sw.nextSibling);
      else host.appendChild(a);
    }

    mountHeaderNav();

    /* 功能开关：关掉的按钮不渲染，对应模块也不加载 */
    var FEATURES = P.features || {};

    /* 公式行位置：center 或 indent，只有去掉色块的款才看得出区别 */
    document.body.dataset.formulaAlign = P.formulaAlign || 'center';

    /* 页头图标按页设计：emoji、纯文字、svg 路径或内联 svg 都能收。
       配置只提供内容，尺寸统一由 page.css 的 .page-title-icon 管。
       走节点挂载而不是拼 innerHTML，标题正文始终用 textContent 写入。 */
    var titleIconNode = function (icon) {
      var node = null;
      if (/^<svg[\s>]/i.test(icon)) {
        var box = document.createElement('span');
        box.innerHTML = icon;
        node = box.firstElementChild;
      } else if (/\.(svg|png|webp|jpe?g|gif)(\?|$)/i.test(icon)) {
        node = document.createElement('img');
        node.src = icon;
        node.alt = '';
      }
      if (!node) {
        node = document.createElement('span');
        node.textContent = icon;
      }
      node.className = 'page-title-icon';
      return node;
    };

    var titleEl = byId('title');
    if (titleEl) {
      /* 页头长标题：配置给了 pageTitle（页头展示用）就用它，没给退回模块名。
         模块名管入口卡，pageTitle 管页头，两处可以是两套文案 */
      titleEl.textContent = M.pageTitle || M.title || '';
      if (M.icon) {
        var ic = titleIconNode(M.icon);
        titleEl.insertBefore(ic, titleEl.firstChild);
        titleEl.insertBefore(document.createTextNode(' '), ic.nextSibling);
      }
    }
    /* 标签页标题：配置给了 tab 用 tab（可为空串），没给按「模块名 · 记忆卡」拼 */
    document.title = M.tab != null ? M.tab : (M.title || '') + ' · 记忆卡';

    /* 两种页面共用一套样式，题干字号、徽标间距这类数值各有一套：
       答案在答案册的题库页靠这个标记切到题库那一档。 */
    document.body.dataset.answerMode = M.answerMode || 'inline';

    /* 小问标题自动加粗开关：模块配置 subHeading: false 时关掉 */
    if (KB.Lines) KB.Lines.setSubHeading(M.subHeading !== false);

    var preset = document.body.dataset.preset || 'tinted';
    /* 渲染方式逐页可写：PROJECT_CONFIG.math 或模块自己覆盖，默认 unicode。
       与 preset 彻底分开——preset 只说公式要不要底色。 */
    var math = (M.math || P.math) === 'latex' ? 'latex' : 'unicode';
    var values = KB.Filters.emptyValues(M);
    var keyword = '';
    var favorites = KB.Store.get(M.id, 'favs', []) || [];

    /* 筛选记忆：首次 render 之前还原，页面只画一遍 */
    var remembered = KB.FilterMemory.load(M.id, values);
    keyword = remembered.keyword;

    /* 展开状态按 id 记，重绘、切款之后照样恢复 */
    var openIds = Object.create(null);

    /* 渲染与搜索都基于改过的内容，原始数据本身不动 */
    function dataCards() {
      return KB.UserData.applyAll(cards);
    }

    function cardOf(id) {
      var found = null;
      dataCards().forEach(function (card) {
        if (card.id === id) found = card;
      });
      return found;
    }

    function filtered() {
      return KB.Filters.apply(dataCards(), M, values, keyword, { favs: favorites });
    }

    /* 抽查池：先按章节、收藏、搜索筛，再按自测档位挑。
       档位不进 filtered——它只把列表里的卡藏起来，不改变筛选结果。 */
    function chipPool() {
      var list = filtered();
      if (!KB.SelfTest) return list;
      return list.filter(function (card) { return KB.SelfTest.pass(card.id); });
    }

    function currentList() {
      if (!single || !single.active()) return filtered();
      var id = single.currentId();
      return dataCards().filter(function (card) { return card.id === id; });
    }

    /* 页头三项统计：总数、收藏、已学（自测开着才显示「已学」） */
    function syncStats() {
      KB.UI.setStats(statsEl, {
        total: cards.length,
        fav: favorites.length,
        showLearned: !!KB.SelfTest && KB.SelfTest.enabled(),
        learned: KB.SelfTest ? KB.SelfTest.countLearned() : 0
      });
    }

    function render() {
      var list = currentList();

      /* 抽查模式栅格收窄、卡片投影加重，跟普通列表区分开 */
      grid.classList.toggle('single-mode', !!single && single.active());

      grid.innerHTML = KB.Card.renderList(list, {
        preset: preset,
        math: math,
        favorites: favorites,
        features: FEATURES,
        tags: M.cardTags || null,
        qidPrefix: M.qidPrefix || '',
        qidSuffix: M.qidSuffix || '',
        answerMode: M.answerMode || 'inline',
        answerBook: M.answerBook || null
      });

      /* 重绘后一律收起：换筛选就是要换卡看，不把上一轮的展开态带过来 */
      openIds = Object.create(null);

      emptyEl.hidden = list.length > 0;
      /* 空状态：筛选无结果用 A（绿色放大镜插画），模块为空用 ③（空白页+笔）；
         文案保持原版，表情符号换成插画。我的卡片页不在此文件，不受影响。 */
      if (cards.length) {
        emptyEl.innerHTML =
          '<svg class="es-illu" viewBox="0 0 120 120" aria-hidden="true">' +
            '<rect x="36" y="28" width="44" height="56" rx="6" fill="#fff" stroke="var(--empty-ill-1,#9FD9B8)" stroke-width="2.5" stroke-dasharray="5 5"/>' +
            '<line x1="46" y1="42" x2="74" y2="42" stroke="var(--empty-ill-2,#CDE9D6)" stroke-width="3" stroke-linecap="round"/>' +
            '<line x1="46" y1="54" x2="64" y2="54" stroke="var(--empty-ill-2,#CDE9D6)" stroke-width="3" stroke-linecap="round"/>' +
            '<circle cx="68" cy="64" r="14" fill="rgba(255,255,255,0.45)" stroke="var(--empty-ill-3,#4FAE7D)" stroke-width="6"/>' +
            '<line x1="78" y1="74" x2="90" y2="86" stroke="var(--empty-ill-3,#4FAE7D)" stroke-width="7" stroke-linecap="round"/>' +
          '</svg>' +
          '<div class="empty-main">没有找到匹配的' + (M.cardNoun || '卡片') + '</div>' +
          '<div class="empty-sub">试试调整筛选条件吧</div>';
      } else {
        emptyEl.innerHTML =
          '<svg class="es-illu" viewBox="0 0 120 120" aria-hidden="true">' +
            '<rect x="36" y="26" width="48" height="62" rx="4" fill="#fff" stroke="var(--empty-ill-3,#4FAE7D)" stroke-width="4"/>' +
            '<line x1="46" y1="40" x2="74" y2="40" stroke="var(--empty-ill-2,#CDE9D6)" stroke-width="3" stroke-linecap="round"/>' +
            '<line x1="46" y1="52" x2="68" y2="52" stroke="var(--empty-ill-2,#CDE9D6)" stroke-width="3" stroke-linecap="round"/>' +
            '<line x1="46" y1="64" x2="74" y2="64" stroke="var(--empty-ill-2,#CDE9D6)" stroke-width="3" stroke-linecap="round"/>' +
            '<line x1="72" y1="76" x2="92" y2="56" stroke="var(--empty-ill-4,#2F7A4F)" stroke-width="4" stroke-linecap="round"/>' +
            '<path d="M92 56 l5 -3 -3 5 z" fill="var(--empty-ill-4,#2F7A4F)"/>' +
          '</svg>' +
          '<div class="empty-main">这个模块还没有数据</div>';
      }

      syncStats();

      /* 列表重建后要重新套遮罩与自评按钮 */
      if (KB.SelfTest) KB.SelfTest.refresh();

      /* 笔记里的 idb: 引用换挂出入证（异步，不挡渲染） */
      if (KB.Blobs) KB.Blobs.hydrate(grid);

      KB.FilterMemory.save(M.id, values, { keyword: keyword });
    }

    function saveFavorites() {
      KB.Store.set(M.id, 'favs', favorites);
    }

    /* 只重绘一张卡：编辑保存后其他卡的 DOM 原样不动，
       展开态、滚动位置、动画都不受影响，也就不需要整表重绘那套补丁。 */
    function rerenderCard(id) {
      var card = cardOf(id);
      var el = grid.querySelector('.card-item[data-id="' + id + '"]');
      if (!card || !el) {
        render();
        return;
      }

      var html = KB.Card.renderCard(card, {
        preset: preset,
        math: math,
        favorites: favorites,
        features: FEATURES,
        tags: M.cardTags || null,
        qidPrefix: M.qidPrefix || '',
        qidSuffix: M.qidSuffix || '',
        answerMode: M.answerMode || 'inline',
        answerBook: M.answerBook || null,
        favorited: favorites.indexOf(id) !== -1,
        hasNote: !!KB.UserData.noteOf(id),
        note: KB.UserData.noteOf(id) || ''
      });

      var tmp = document.createElement('div');
      tmp.innerHTML = html;
      el.replaceWith(tmp.firstChild);

      if (openIds[id]) {
        KB.UI.toggleAnswer(grid, id, true);
        if (KB.Notes) KB.Notes.followAnswer(grid, id, true);
      }

      if (KB.Blobs) KB.Blobs.hydrate(tmp.firstChild);
      if (KB.SelfTest) KB.SelfTest.refresh();
    }

    function onFavorite(id) {
      var i = favorites.indexOf(id);
      var on = i === -1;
      if (on) favorites.push(id);
      else favorites.splice(i, 1);

      saveFavorites();
      KB.Card.applyFavorite(grid, id, on);
      KB.UI.setStat(statsEl, 'fav', favorites.length);
    }

    /* 展开一张卡：答案在卡片里的模块展开答案区，答案在答案册的模块展开笔记区。
       book 模式下空笔记也要能展开着写，不走 followAnswer 的「有笔记才露」判断。 */
    function setOpen(id, open) {
      if (M.answerMode === 'book') {
        var area = grid.querySelector('.card-note-area[data-id="' + id + '"]');
        if (!area) return;
        area.classList.toggle('open', open);
        var btn = grid.querySelector('.btn-note[data-id="' + id + '"]');
        if (btn) btn.classList.toggle('active', open);
        return;
      }
      KB.UI.toggleAnswer(grid, id, open);
      if (KB.Notes) KB.Notes.followAnswer(grid, id, open);
    }

    function isOpen(id) {
      var sel = M.answerMode === 'book' ? '.card-note-area' : '.card-answer';
      var el = grid.querySelector(sel + '[data-id="' + id + '"]');
      return !!el && el.classList.contains('open');
    }

    function onToggle(id) {
      /* 自测模式下答案固定展开并遮住，点题目不切换；揭晓只走「查看答案」。
         没有答案区的模块（熟悉度）不遮不拦，点题目照常展开作答区。 */
      if (KB.SelfTest && KB.SelfTest.enabled() && M.answerMode !== 'book') {
        /* 点题目也算「正在看这张」，交给 AI 取上下文用 */
        window.__stFocusId = id;
        return;
      }

      var open = !isOpen(id);
      setOpen(id, open);

      if (open) {
        openIds[id] = true;
        /* 只有点开这一下才播淡入。重绘会重建列表，若每次恢复展开态都播，
           筛选一次就是整片卡片一起淡入 */
        var card = grid.querySelector('.card-item[data-id="' + id + '"]');
        if (card) {
          card.classList.add('just-opened');
          setTimeout(function () {
            card.classList.remove('just-opened');
          }, 400);
        }
      } else {
        delete openIds[id];
      }
    }

    function onFilterChange(key, value) {
      values[key] = value;

      /* 下级的值交给 refreshOptions 收口：候选重建后旧值仍在列表里就保留，不在才清空。
         换专业时上一套卷能接着用，不会被打回「全部套卷」。 */
      KB.Filters.refreshOptions(dimsEl, M, cards, values, { favs: favorites });
      render();
    }

    function resetFilters() {
      values = KB.Filters.emptyValues(M);
      keyword = '';
      searchEl.value = '';
      toggleSearchClear();
      KB.Filters.refreshOptions(dimsEl, M, cards, values, { favs: favorites });
      if (single) single.exit(true);
      render();
    }

    /* ---- 抽查 ---- */

    var single = KB.Single
      ? KB.Single.mount({
          bar: byId('singleBar'),
          badge: byId('singleBadge'),
          prev: byId('prev'),
          next: byId('next'),
          exit: byId('exit'),
          getPool: chipPool,
          /* 箭头的灰不灰按筛选态张数算，与档位无关：档位池空了也让箭头能点，
             点下去由抽查模块提示「没有更多」 */
          getNavPool: filtered,
          cardOf: cardOf,
          /* 抽查条标题：子页是「章节 · 小题号」；题库页配置 cardLabel 后
             按字段拼成「套卷 · 题型题号」，题型与题号直接相连 */
          labelOf: function (card) {
            var cfg = M.cardLabel;
            /* 抽查标题的前缀单独配：7 页卡片写 U1，抽查条上却只写 1，
               两处规则不同，不能共用卡片那个前缀 */
            var qp = M.singleQidPrefix || '';
            var qid = qp + (card.qid || '');

            if (!cfg) {
              var sec = card.section || '';
              if (sec && qid) return sec + ' · ' + qid;
              return qid || sec || '卡片';
            }
            var parts = [];
            (cfg.fields || []).forEach(function (k) {
              if (card[k]) parts.push(card[k]);
            });
            var head = parts.join(cfg.sep || ' · ');
            if (!head) return qid || '卡片';
            /* 题号前面的连接符单独配：真题页是「简答」+「第3题」直接相连，
               子页是「章节」+「 · 」+「A1」，两种都对，所以做成配置项 */
            return qid ? head + (cfg.qidSep === undefined ? '' : cfg.qidSep) + qid : head;
          },
          toast: function (m) { KB.UI.toast(m); },
          /* 空池提示按档位区分：开着熟悉度／自测时提示换档位 */
          noun: M.cardNoun || '卡片',
          emptyText: function () {
            var n = M.cardNoun || '卡片';
            return KB.SelfTest && KB.SelfTest.enabled()
              ? '🎯 当前档位没有' + n + '可抽，换个档位或先自评几张吧'
              : '😶‍🌫️当前没有' + n + '可抽查，请调整筛选条件~';
          },
          onEnter: function () {
            openIds = Object.create(null);
            barEl.classList.add('disabled');
            document.body.classList.add('single-on');
          },
          onExit: function () {
            openIds = Object.create(null);
            barEl.classList.remove('disabled');
            document.body.classList.remove('single-on');
          },
          onRender: render,
          /* 抽查态滚到抽查条上沿 − 12px，同屏能看见 ◀ ▶ 与卡头；
             抽查条未显示时退回第一张卡片顶部，不硬顶到页顶 */
          onScrollTop: function () {
            var sb = byId('singleBar');
            var anc = sb && sb.classList.contains('show')
              ? sb
              : grid.querySelector('.card-item');
            if (!anc) return;
            var y = anc.getBoundingClientRect().top + window.pageYOffset - 12;
            window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
          },
          onExitClick: function () { single.exit(false); }
        })
      : null;

    function randomPick() {
      if (!single) return;
      /* 池子已按档位挑过：空池交给抽查模块报，它按当前档位给出更准的提示 */
      single.enter(chipPool());
    }

    function applyPreset(next) {
      preset = next;
      /* demo 的三款里，LaTeX 那款同时在切渲染器；其余两款只在切底色。
         生成真实项目不带这个切换，math 由配置一次定死。 */
      math = next === 'latex' ? 'latex' : ((M.math || P.math) === 'latex' ? 'latex' : 'unicode');
      render();
    }

    /* ---- 装配 ---- */

    KB.Filters.render(dimsEl, M, cards, values, onFilterChange, { favs: favorites });
    KB.UI.bindList(grid, { onFavorite: onFavorite, onToggle: onToggle });

    if (FEATURES.notes) KB.Notes.bind(grid);

    if (FEATURES.edit) {
      KB.Edit.bind(grid, {
        /* 编辑要用数据原文，不能从 DOM 取排版后的样子，否则标记会丢 */
        getCard: function (id) {
          var origin = cards.filter(function (card) { return card.id === id; })[0];
          return origin ? KB.UserData.apply(origin) : null;
        },
        onOpen: function (id) {
          openIds[id] = true;
        },
        onSaved: function (id) {
          rerenderCard(id);
        }
      });
    }

    /* 把记忆里的搜索词回填到控件上；下拉在 render 时已按 values 选中 */
    var searchClear = document.getElementById('pageClear');
    function toggleSearchClear() {
      if (searchClear) searchClear.classList.toggle('show', !!searchEl.value);
    }
    searchEl.value = keyword;
    toggleSearchClear();

    searchEl.addEventListener(
      'input',
      KB.UI.debounce(function () {
        keyword = searchEl.value;
        toggleSearchClear();
        render();
      }, 220)
    );

    byId('reset').addEventListener('click', resetFilters);
    if (searchClear) {
      searchClear.addEventListener('click', function () {
        searchEl.value = '';
        keyword = '';
        toggleSearchClear();
        render();
      });
    }
    byId('random').addEventListener('click', randomPick);

    /* 键盘：R 重新抽一批，抽查模式下左右翻卡、Esc 退出。
       在输入框里打字时不拦，否则搜索框没法输 r。 */
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      var typing =
        t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

      if (
        !typing &&
        (e.key === 'r' || e.key === 'R') &&
        !e.ctrlKey && !e.metaKey && !e.altKey
      ) {
        e.preventDefault();
        randomPick();
        return;
      }

      if (!single || !single.active()) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        single.step(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        single.step(1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        single.exit(false);
      }
    });

    if (FEATURES.selftest) {
      var bookMode = M.answerMode === 'book';
      KB.SelfTest.init({
        listEl: grid,
        statsEl: statsEl,
        headerEl: document.getElementById(ids.header) || document.querySelector('.app-header'),
        moduleId: M.id,
        /* 没有答案区可遮，这个开关管的是「这道题掌握得怎么样」，
           与答案册同一个叫法，别跟子页的默背自测混在一起 */
        label: bookMode ? '熟悉度' : '自测模式',
        hint: bookMode
          ? '熟悉度：给每道真题标一下掌握程度'
          : '自测模式：先默背，再看答案，然后自评',
        /* 退出自测时回到进自测前的展开态：那张卡本来就在 openIds 里，
           开关不重建列表，不用另存一份快照 */
        isOpen: function (id) { return !!openIds[id]; },
        onChange: function (e) {
          /* 三种动作都不重建列表：开关增删卡内节点，切档位只改卡片隐藏，
             滚动位置与展开态一律不动。 */
          var kind = e && e.kind;
          if (kind === 'chip') {
            /* 档位换了，抽查条的「下一张」要看新档位的池子里还有没有别的 */
            if (single && single.active()) single.refresh();
            return;
          }
          KB.SelfTest.refresh();
          syncStats();
        }
      });
    }

    /* 开关已就位，答案册入口插在它右边 */
    mountAnswerEntry();

    render();

    instance = {
      render: render,
      setPreset: applyPreset,
      cards: cards,
      randomPick: randomPick,
      enterSingle: function (list) { if (single) single.enter(list); },
      exitSingle: function (silent) { if (single) single.exit(silent); }
    };

    return instance;
  }

  KB.Page = {
    mount: mount,
    setPreset: function (p) { if (instance) instance.setPreset(p); }
  };
})(window);
