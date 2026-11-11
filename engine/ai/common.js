/* AI 答疑助手：无状态工具、图标与轻提示。
   不碰面板状态，其余模块都能单独引用。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  function escapeHtml(s) {
    /* AI 回复是模型刚生成的原文，按纯转义处理，不先解码实体，保住字面文本。
       卡片历史数据的纯文本语义另走 KB.escape，两者按数据来源区分。 */
    var raw = KB.Html && KB.Html.escapeRaw;
    return (raw || KB.escape || function (x) { return String(x == null ? '' : x); })(s);
  }

  var ICONS = {
    COPY: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    CHECK: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    REGEN: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 9"/></svg>',
    DEL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>',
    EDIT: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    SEND: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    PAUSE: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    PLAY: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>',
    CARD: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M7 3v3M17 3v3M8 12h8M8 16h5"/></svg>',
    CLOSE_SM: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'
  };

  /* 轻提示：样式在 ui/ai.css，JS 只管加类与计时。 */
  var toastEl = null;
  var toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'aiToast';
      toastEl.className = 'ai-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    global.requestAnimationFrame(function () { toastEl.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 1800);
  }

  /* 存卡桥用的独立提示层，配色与位置跟主提示不同，两套不共用。 */
  var cardsToastEl = null;
  var cardsToastTimer = null;
  function cardsToast(msg) {
    if (!cardsToastEl) {
      cardsToastEl = document.createElement('div');
      cardsToastEl.className = 'ai-cards-toast';
      document.body.appendChild(cardsToastEl);
    }
    clearTimeout(cardsToastTimer);
    cardsToastEl.textContent = msg;
    cardsToastEl.classList.add('show');
    cardsToastTimer = setTimeout(function () {
      cardsToastEl.classList.remove('show');
    }, 2000);
  }

  function copy(text, onSuccess) {
    if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(text).then(function () {
        if (onSuccess) onSuccess();
      }).catch(function () { fallbackCopy(text, onSuccess); });
    } else {
      fallbackCopy(text, onSuccess);
    }
  }
  function fallbackCopy(text, onSuccess) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      if (onSuccess) onSuccess();
    } catch (e) {}
    document.body.removeChild(ta);
  }

  function isMobile(cfg) {
    return global.innerWidth <= ((cfg && cfg.limits && cfg.limits.mobileWidth) || 640);
  }

  var lastPointerType = '';
  document.addEventListener('pointerdown', function (e) {
    lastPointerType = (e && e.pointerType) || '';
  }, true);
  function isTouchTap() {
    if (lastPointerType === 'mouse') return false;
    if (lastPointerType === 'touch' || lastPointerType === 'pen') return true;
    try {
      return (navigator.maxTouchPoints || 0) > 0 ||
        !!(global.matchMedia && global.matchMedia('(pointer:coarse)').matches);
    } catch (e) { return false; }
  }

  function oneLine(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  KB.AIUtil = {
    escapeHtml: escapeHtml,
    icons: ICONS,
    toast: toast,
    cardsToast: cardsToast,
    copy: copy,
    isMobile: isMobile,
    isTouchTap: isTouchTap,
    oneLine: oneLine
  };
})(window);
