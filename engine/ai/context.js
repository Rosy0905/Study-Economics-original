/* AI 答疑助手：当前页面上下文。
   卡片结构、筛选器与标题位置都由配置注入；页面结构不同的模块注册适配器即可，
   引擎不认识任何具体类名。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  function create(opt) {
    var cfg = opt.cfg;
    var util = opt.util;
    var S = opt.S;
    var C = cfg.context;
    var P = cfg.prompts;

    var lastFocusedCardKey = null;
    var lastSentFocusKey = null;
    var lastSentFocusLabel = '';
    var pendingReadCard = null;

    function adp() {
      var a = C.adapter || global.__AI_CARD_ADAPTER__;
      return (a && typeof a === 'object') ? a : null;
    }

    function cardKey(card) {
      if (!card) return '';
      var a = adp();
      if (a && a.key) { try { return a.key(card) || ''; } catch (e) {} }
      if (card.dataset && card.dataset.id) return 'id:' + card.dataset.id;
      var labelEl = card.querySelector(C.labelSelector);
      var label = labelEl ? labelEl.textContent.replace(/\s+/g, ' ').trim() : '';
      if (label) return 'label:' + label;
      var qEl = card.querySelector(C.questionSelector);
      return 'q:' + ((qEl ? qEl.textContent : '').trim().slice(0, 120));
    }

    function cardLabel(card) {
      var a = adp();
      if (a && a.label) { try { var lb = a.label(card); if (lb) return lb; } catch (e) {} }
      var labelEl = card.querySelector(C.labelSelector);
      var label = labelEl ? labelEl.textContent.replace(/\s+/g, ' ').trim() : '';
      if (label) return label.slice(0, 80);
      var qEl = card.querySelector(C.questionSelector);
      var q = qEl ? qEl.textContent.trim() : '';
      return q ? ('（无标签）' + q.slice(0, 30)) : '（无标签卡片）';
    }

    function readCard(card, withAnswer) {
      var a = adp();
      if (a && a.read) {
        try {
          var r = a.read(card, withAnswer);
          if (r) return {
            key: r.key || cardKey(card),
            label: r.label || cardLabel(card),
            q: r.q || '', a: r.a || '', n: r.n || ''
          };
        } catch (e) {}
      }
      var qEl = card.querySelector(C.questionSelector);
      var q = (qEl ? qEl.textContent : '').trim();
      var label = cardLabel(card);
      var ans = '', note = '';
      /* 答案未遮罩时才喂给模型；自测遮罩态不喂，避免剧透 */
      if (withAnswer) {
        var aEl = card.querySelector(C.answerSelector);
        var masked = aEl && aEl.closest(C.maskSelector);
        if (aEl && !masked) {
          ans = aEl.textContent.trim();
          var nEl = card.querySelector(C.noteSelector);
          note = nEl ? nEl.textContent.trim() : '';
          if (note && note.indexOf(C.notePlaceholder) > -1) note = '';
        }
      }
      return { key: cardKey(card), label: label, q: q, a: ans, n: note };
    }

    /* 长文本压到上限内：尽量截在句末，并明确标注「这是节选」。 */
    function clipForAI(text, maxChars, name, clipped) {
      var s = String(text == null ? '' : text);
      if (s.length <= maxChars) return s;
      var cut = s.slice(0, maxChars);
      var m = cut.match(/[。！？；\n][^。！？；\n]*$/);
      if (m && m.index > maxChars * 0.7) cut = cut.slice(0, m.index + 1);
      if (clipped) clipped.push({ name: name, total: s.length, sent: cut.length });
      return cut + '\n〔' + name + '为节选：原文共 ' + s.length + ' 字，此处只发前 ' +
        cut.length + ' 字，剩余 ' + (s.length - cut.length) + ' 字未发送〕';
    }

    /* labelOnly 只返回焦点卡标签，不拼上下文、不提交焦点状态，供输入框占位文字使用。 */
    function buildPageContext(commit, labelOnly) {
      var vh = global.innerHeight, vw = global.innerWidth;
      var allCards = [];
      var _adp = adp();
      if (_adp && _adp.all) {
        try {
          Array.prototype.forEach.call(_adp.all() || [], function (el) {
            if (el && allCards.indexOf(el) === -1) allCards.push(el);
          });
        } catch (e) {}
      }
      function collect(sel) {
        Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
          if (allCards.indexOf(el) === -1) allCards.push(el);
        });
      }
      if (!allCards.length) {
        var sels = C.cardSelectors || [];
        collect(sels[0] || '.card-item');
        if (!allCards.length) {
          for (var si = 1; si < sels.length; si++) collect(sels[si]);
        }
      }

      var visible = [];
      allCards.forEach(function (item) {
        var r = item.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return;
        var visibleH = Math.min(vh, r.bottom) - Math.max(0, r.top);
        var ratio = r.height > 0 ? visibleH / r.height : 0;
        var center = (r.top + r.bottom) / 2;
        var dist = Math.abs(center - vh / 2);
        var isOpen = !!item.querySelector(C.openSelector);
        var score = ratio * 1000 - dist + (isOpen ? 500 : 0);
        visible.push({ el: item, score: score, isOpen: isOpen });
      });
      visible.sort(function (a, b) { return b.score - a.score; });

      var focusEl = null;
      if (_adp && _adp.focus) {
        try { var _fe = _adp.focus(); if (_fe) focusEl = _fe; } catch (e) {}
      }
      if (!focusEl && lastFocusedCardKey) {
        for (var i = 0; i < visible.length; i++) {
          if (cardKey(visible[i].el) === lastFocusedCardKey) { focusEl = visible[i].el; break; }
        }
        if (!focusEl) lastFocusedCardKey = null;
      }
      if (!focusEl) {
        for (var j = 0; j < visible.length; j++) {
          if (visible[j].isOpen) { focusEl = visible[j].el; break; }
        }
      }
      if (!focusEl && visible.length) focusEl = visible[0].el;

      /* 自测模式下以「刚揭晓／刚标记」的卡为焦点 */
      var stFocus = (C.focusProvider && C.focusProvider()) ||
        (global.__selfTestOn ? global.__stFocusId : null);
      if (stFocus) {
        for (var s = 0; s < visible.length; s++) {
          var sid = visible[s].el.getAttribute ? visible[s].el.getAttribute('data-id') : null;
          if (sid && sid === stFocus) { focusEl = visible[s].el; break; }
        }
      }

      /* 焦点判定到此为止，与正式发消息共用同一张卡；只取标签时提前返回。 */
      if (labelOnly) return focusEl ? cardLabel(focusEl) : '';

      var ctx = '';
      var clipped = [];
      var h1 = document.querySelector(C.titleSelector);
      var pageTitle = h1 ? h1.textContent.replace(/^[^\u4e00-\u9fa5A-Za-z]+/, '').trim() : '';
      if (pageTitle) ctx += '【当前模块】' + pageTitle + '\n';
      ctx += P.uniqueRule + '\n';

      if (focusEl) {
        var fc = readCard(focusEl, true);
        var focusLabel = fc.label;
        if (lastSentFocusKey && lastSentFocusKey !== fc.key) {
          ctx += '\n【★★★ 焦点已切换 ★★★】\n'
            + '上一轮用户看的是「' + lastSentFocusLabel + '」，'
            + '现在屏幕上显示的是「' + focusLabel + '」。\n'
            + '用户说"看新题""换一道"时，就是这张。请直接按新卡片回答，'
            + '不要再说"仍在上一张 / 还是第一张 / 没看到切换"。\n';
        }
        ctx += '\n【当前卡片】\n';
        ctx += '标签：' + focusLabel + '\n';

        var qTxt = fc.q || '', aTxt = fc.a || '', nTxt = fc.n || '';
        var qUsed = Math.min(qTxt.length, C.questionLimit);
        var nUsed = Math.min(nTxt.length, C.noteLimit);
        var aLimit = Math.max(C.answerMin, Math.min(C.answerMax, C.budgetTotal - qUsed - nUsed));
        if (qTxt) ctx += '题目：' + clipForAI(qTxt, C.questionLimit, '题目', clipped) + '\n';
        if (aTxt) ctx += '答案：' + clipForAI(aTxt, aLimit, '答案', clipped) + '\n';
        if (nTxt) ctx += '用户笔记：' + clipForAI(nTxt, C.noteLimit, '笔记', clipped) + '\n';

        var refs = [];
        for (var k = 0; k < visible.length && refs.length < C.otherCards; k++) {
          if (visible[k].el === focusEl) continue;
          var rc = readCard(visible[k].el, false);
          if (!rc.label && !rc.q) continue;
          refs.push(rc);
        }
        if (refs.length) {
          ctx += '\n【同屏其他卡片（仅供消歧，不是用户当前关注的重点，回答时不要拿它们当主角）】\n';
          refs.forEach(function (r) {
            ctx += '· 标签：' + r.label + ' ｜ 题干：' +
              (r.q ? r.q.slice(0, C.otherQuestionChars) : '') + '\n';
          });
        }
        if (commit) {
          lastSentFocusKey = fc.key;
          lastSentFocusLabel = focusLabel;
        }
      } else {
        ctx += '\n【用户当前屏幕上没有可见的卡片】\n';
        if (commit) { lastSentFocusKey = null; lastSentFocusLabel = ''; }
      }

      (C.filterSelectors || []).forEach(function (f) {
        var sel = document.querySelector(f.key);
        var el = sel && sel.options ? sel.options[sel.selectedIndex] : null;
        var all = (f.allValue === undefined) ? 'all' : f.allValue;
        if (el && el.value !== all) ctx += '\n【' + f.label + '】' + el.textContent;
      });

      if (clipped.length) {
        var clipDesc = clipped.map(function (c) {
          return c.name + '（原文 ' + c.total + ' 字，只发了前 ' + c.sent + ' 字）';
        }).join('、');
        ctx += '\n【★★★ 节选提示：' + clipDesc + '，后面还有内容没有发送。'
          + '凡是要用到没显示的部分才能判断的地方，不要凭猜测下结论，'
          + '直接告诉用户"当前只看到它的一部分"，并说清是哪一部分。★★★】';
      }
      return ctx.trim();
    }

    /* 当前卡片标签：读卡关闭时返回空，由调用方回落原本占位文字。 */
    function currentCardLabel() {
      if (S.cfg.readCard === false) return '';
      try { return buildPageContext(false, true) || ''; } catch (e) { return ''; }
    }

    function buildOnNote(cardLabel, isToggle) {
      var head = isToggle ? '【★★★ 读卡开关刚刚开启 ★★★】\n' : '';
      if (cardLabel) {
        return head + '本轮【当前卡片】是「' + cardLabel + '」，它的标签、题目、答案已在上文一并提供。'
          + '上文【卡片指代规则】恢复适用，请直接按这张卡作答，不要问用户在看哪一张。';
      }
      return head + '本轮读卡已开启，但屏幕上没有可见的卡片（用户可能不在卡片列表页，或卡片滚出了视口），'
        + '所以本轮没有附带任何卡片内容。若用户问某张卡，请说明没能定位到卡片，请他发题目。';
    }

    function pickCardLabel(pageCtx) {
      if (!pageCtx) return '';
      var i = pageCtx.indexOf('标签：');
      if (i < 0) return '';
      return pageCtx.slice(i + 3).split('\n')[0].trim();
    }

    function takeReadCardNote(cardLabel, peek) {
      var switched = pendingReadCard;
      if (!peek) pendingReadCard = null;
      if (S.cfg.readCard === false) {
        return switched === 'off' ? P.offToggle : P.offSteady;
      }
      return buildOnNote(cardLabel, switched === 'on');
    }

    function setPending(v) { pendingReadCard = v; }
    function resetFocus() { lastSentFocusKey = null; lastSentFocusLabel = ''; }

    function syncReadCardUI(btn) {
      if (!btn) return;
      var off = S.cfg.readCard === false;
      btn.classList.toggle('off', off);
      btn.title = (off ? '当前：不读卡' : '当前：读取当前卡片') + '（点按切换）';
    }

    /* 焦点卡点击委托：点题目展开时记下这张卡，收起时把焦点让给下一张展开的卡。 */
    function bindFocusTracking() {
      document.addEventListener('click', function (e) {
        var q = e.target.closest && e.target.closest(C.questionClickSelector);
        if (!q) return;
        var card = q.closest(C.cardSelector);
        if (!card) return;
        var key = cardKey(card);
        setTimeout(function () {
          var isOpen = !!card.querySelector(C.openSelector);
          if (isOpen) { lastFocusedCardKey = key; return; }
          if (lastFocusedCardKey !== key) return;
          lastFocusedCardKey = null;
          var vh = global.innerHeight, vw = global.innerWidth;
          var all = document.querySelectorAll(C.cardSelector);
          for (var i = 0; i < all.length; i++) {
            var it = all[i];
            if (it === card) continue;
            if (!it.querySelector(C.openSelector)) continue;
            var r = it.getBoundingClientRect();
            if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
            lastFocusedCardKey = cardKey(it);
            break;
          }
        }, 0);
      }, true);
    }

    return {
      buildPageContext: buildPageContext,
      currentCardLabel: currentCardLabel,
      pickCardLabel: pickCardLabel,
      takeReadCardNote: takeReadCardNote,
      setPending: setPending,
      resetFocus: resetFocus,
      syncReadCardUI: syncReadCardUI,
      bindFocusTracking: bindFocusTracking,
      cardKey: cardKey,
      cardLabel: cardLabel,
      readCard: readCard
    };
  }

  KB.AIContext = { create: create };
})(window);
