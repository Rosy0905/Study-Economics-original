/* 答案册左侧题号面板：按题型列题号，滚到哪儿亮到哪儿，点一下跳到那题。
   面板只取四档宽度（4／3／2／1 列），住进正文左边的留白里，左距＝右距。
   窗口窄下来先收正文给面板腾位置，四档都放不下才收成左下角小按钮。
   尺寸变化只重算变量、不重建 DOM。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  /* 面板宽度只取四档，每档刚好放下整数个题号：4 列 154 / 3 列 127 / 2 列 101 / 1 列 74。
     档宽由「题型标签 29px + n 个 23px 方块 + (n-1) 个 3.5px 间距 + 左右内边距 22px」反推，
     所以每档都贴合、不拖一条空边，列数也不会因为浏览器字体差一点就跳档。
     一档都放不下（留白 < 106）才收成左下角小按钮。 */
  var TIERS = [154, 127, 101, 74];
  var GUTTER = 32; /* 面板与正文之间、与屏幕边缘之间各留 16 */
  var MIN_CONTENT = 860; /* 正文地板：窄到这儿就不再让位 */
  var RESERVE = 318; /* 正文两侧预留给「面板＋两条留白」的总宽 */

  /* 正文宽度取答案册那一条（--ab-max），不在脚本里另写死一个数：
     换宽度只改 tokens 一处，面板跟着走 */
  function pageMax(fallback) {
    var v = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--ab-max')
    );
    return v > 0 ? v : fallback || 1000;
  }

  function mount(opts) {
    var ids = opts.ids || {};
    var panel = document.getElementById(ids.panel || 'navPanel');
    var rowsEl = document.getElementById(ids.rows || 'npRows');
    var titleEl = document.getElementById(ids.title || 'npTitle');
    var fab = document.getElementById(ids.fab || 'npFab');
    var content = opts.content;
    if (!panel || !rowsEl || !content) return null;

    var wide = [content].concat(opts.wide || []).filter(function (el) { return !!el; });

    var current = null; // 当前高亮的题号 id
    var spyTimer = null;
    var resizeRaf = 0;
    /* 落点释放前不画高亮，释放后按指定题号画一次 */
    var hold = true;
    var heldId = '';
    /* 全站搜索结果不属于任何一卷，面板收起来，正文不再让位 */
    var searchMode = false;

    function esc(s) { return KB.escape(s); }

    /* ---- 留白测算 ---- */

    function layout() {
      var cs = getComputedStyle(document.body);
      var padL = parseFloat(cs.paddingLeft) || 0;
      var padR = parseFloat(cs.paddingRight) || 0;
      var cw = document.documentElement.clientWidth;
      var maxContent = pageMax(1000);
      var avail = cw - padL - padR;

      /* 正文给面板让位：窗口够宽时正文取满 --ab-max；
         窄下来先收正文，把留白稳在能放下一档面板的位置，
         面板就能一级一级退（4→3→2→1），而不是留白一不够就直接掉成小按钮。 */
      var width = Math.max(MIN_CONTENT, Math.min(maxContent, avail - RESERVE));
      var gap = padL + Math.max(0, (avail - width) / 2);
      var pw = 0;
      for (var i = 0; i < TIERS.length; i++) {
        if (TIERS[i] + GUTTER <= gap) { pw = TIERS[i]; break; }
      }
      var mini = pw === 0;

      wide.forEach(function (el) { el.style.maxWidth = width + 'px'; });
      panel.style.setProperty('--npm', gap.toFixed(2) + 'px');
      if (!mini) panel.style.setProperty('--npw', pw + 'px');
      panel.classList.toggle('np-mini', mini);
      /* 127 宽还放得下「2026 年（应经）」；101 及以下换短标题，否则会断成两行 */
      panel.classList.toggle('np-tight', !mini && pw <= 101);
      panel.classList.toggle('np-c1', !mini && pw === 74);
      if (mini) panel.classList.remove('open');
    }

    /* ---- 面板内容 ---- */

    /* 卷名去掉末尾括注做短版：窄档里「2021 年（应经）」会断成「2021 年（应／经）」 */
    function shortTitle(title) {
      return String(title || '').replace(/（[^）]*）\s*$/, '').trim() || title;
    }

    function render(paper, parts) {
      var flat = (parts || []).filter(function (p) { return (p.items || []).length; });
      if (searchMode || !flat.length) {
        panel.hidden = true;
        return;
      }

      layout();
      panel.hidden = false;

      titleEl.innerHTML =
        '<b><span class="np-t-long">' + esc(paper.title) + '</span>' +
        '<span class="np-t-short">' + esc(shortTitle(paper.title)) + '</span></b>' +
        '<br><span class="np-subj">' + esc(paper.subject) + '</span>';

      rowsEl.innerHTML = flat
        .map(function (part) {
          return (
            '<div class="np-row"><span class="np-type">' + esc(part.type) + '</span>' +
            '<span class="np-nums">' +
            part.items
              .map(function (it) {
                return (
                  '<a href="#' + esc(it.id) + '" data-id="' + esc(it.id) + '">' +
                  esc(it.qid) + '</a>'
                );
              })
              .join('') +
            '</span></div>'
          );
        })
        .join('');

      current = null;
      if (!hold) spy();
    }

    /* ---- 高亮 ---- */

    function paint(id) {
      var old = rowsEl.querySelector('a.on');
      if (old) old.classList.remove('on');
      var nu = rowsEl.querySelector('a[data-id="' + id + '"]');
      if (nu) nu.classList.add('on');
    }

    /* 视口内可见面积最大的那题算「正在读」；一屏里谁都不到 1/5 高就维持原判，
       免得两题交界处来回跳。 */
    function spy(forceId) {
      if (panel.hidden) return;
      if (hold) {
        if (forceId) heldId = forceId;
        return;
      }

      var id = forceId || '';
      if (!id) {
        var vh = global.innerHeight || 800;
        var items = content.querySelectorAll('.item');
        var best = null;
        var bestArea = 0;

        for (var i = 0; i < items.length; i++) {
          var r = items[i].getBoundingClientRect();
          var visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
          if (visible > bestArea) {
            bestArea = visible;
            best = items[i];
          }
        }
        if (best && bestArea > vh * 0.18) id = best.id;
      }

      if (!id) {
        if (current) paint(current);
        return;
      }
      current = id;
      paint(id);
    }

    /* ---- 事件 ---- */

    global.addEventListener(
      'scroll',
      function () {
        clearTimeout(spyTimer);
        spyTimer = setTimeout(function () { spy(); }, 80);
      },
      { passive: true }
    );

    /* 窗口尺寸与浏览器缩放：只重算那一组变量，不重建面板 */
    function onResize() {
      if (resizeRaf) return;
      resizeRaf = global.requestAnimationFrame(function () {
        resizeRaf = 0;
        layout();
      });
    }

    global.addEventListener('resize', onResize);
    if (global.visualViewport) global.visualViewport.addEventListener('resize', onResize);

    if (fab) {
      fab.addEventListener('click', function (e) {
        e.stopPropagation();
        panel.classList.toggle('open');
      });
    }

    document.addEventListener('click', function (e) {
      if (!panel.classList.contains('open')) return;
      if (panel.contains(e.target)) return;
      panel.classList.remove('open');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') panel.classList.remove('open');
    });

    rowsEl.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[data-id]') : null;
      if (!a) return;
      e.preventDefault();

      var id = a.getAttribute('data-id');
      var el = document.getElementById(id);
      if (!el) return;

      el.scrollIntoView({ block: 'start', behavior: 'auto' });
      /* 重新触发金框：先摘类、读一次宽度，再加回去 */
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
      setTimeout(function () { el.classList.remove('flash'); }, 2600);

      /* 地址栏只记卷号，不记题号：刷新回到这套卷，不强行跳回某一题 */
      if (opts.onJump) opts.onJump(id);
      panel.classList.remove('open');
      spy(id);
    });

    return {
      render: render,
      highlight: function (id) { spy(id); },
      layout: layout,
      /* 落点定下来之后再画第一次高亮，避免先亮第 1 题再跳 */
      release: function () {
        hold = false;
        spy(heldId || '');
        heldId = '';
      },
      /* 进出搜索态：面板跟着藏／露，正文宽度随之重算 */
      setSearch: function (on) {
        searchMode = !!on;
        if (searchMode) {
          panel.hidden = true;
          panel.classList.remove('open');
        }
        layout();
      }
    };
  }

  KB.AnswerNav = { mount: mount };
})(window);
