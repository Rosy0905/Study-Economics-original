/* 页面交互：展开答案、收藏、统计条、轻提示。
   事件一律委托在列表容器上，重绘列表不需要重新绑定。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  var toastEl = null;
  var toastTimer = null;

  /* 转义在 render/common.js 定义，全站一份；这里只取用 */
  var escapeHtml = KB.escape;

  function initToast(el) {
    toastEl = el;
  }

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 2200);
  }

  function bindList(listEl, handlers) {
    listEl.addEventListener('click', function (e) {
      var fav = e.target.closest('.btn-fav');
      if (fav) {
        e.stopPropagation();
        handlers.onFavorite(fav.dataset.id);
        return;
      }

      var q = e.target.closest('.card-question');
      if (q && !e.target.closest('.editable')) {
        handlers.onToggle(q.dataset.id);
      }
    });
  }

  function toggleAnswer(listEl, id, forceOpen) {
    var answer = listEl.querySelector('.card-answer[data-id="' + id + '"]');
    if (!answer) return false;
    var open = forceOpen === undefined ? !answer.classList.contains('open') : forceOpen;
    answer.classList.toggle('open', open);
    return open;
  }

  /* 统计条按配置生成，图标与叫法不写在 HTML 里，换科目不用改页面 */
  function renderStats(statsEl, items) {
    if (!statsEl || !items || !items.length) return;
    statsEl.innerHTML = items
      .map(function (it) {
        return (
          '<span data-stat="' + it.key + '"' + (it.hidden ? ' hidden' : '') + '>' +
          (it.icon ? '<span class="ico">' + it.icon + '</span> ' : '') +
          escapeHtml(it.label) + ' <b class="num">0</b></span>'
        );
      })
      .join('');
  }

  function setStat(statsEl, key, value) {
    if (!statsEl) return;
    var n = statsEl.querySelector('[data-stat="' + key + '"] .num');
    if (n) n.textContent = value;
  }

  /* 统计条：总卡与收藏常在，已学由自测模块决定是否点亮 */
  function setStats(statsEl, data) {
    if (!statsEl) return;

    setStat(statsEl, 'total', data.total);
    setStat(statsEl, 'fav', data.fav);

    var learned = statsEl.querySelector('[data-stat="learned"]');
    if (learned) {
      learned.hidden = !data.showLearned;
      setStat(statsEl, 'learned', data.learned || 0);
    }
  }

  /* 确认弹窗：返回 Promise<boolean>。
     不用原生 confirm，一是样式与全站不搭，二是弹原生框会打断页面焦点。 */
  function confirm(opts) {
    var o = opts || {};

    var mask = document.createElement('div');
    mask.className = 'kb-confirm-mask';
    /* message 支持 **加粗**：先整体转义再替换，顺序反了会把标签当内容转义掉 */
    var msgHtml = escapeHtml(o.message || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    mask.innerHTML =
      '<div class="kb-confirm' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="kb-confirm-title">' + escapeHtml(o.title || '确认') + '</div>' +
      '<div class="kb-confirm-msg">' + msgHtml + '</div>' +
      '<div class="kb-confirm-actions">' +
      '<button type="button" class="kb-confirm-btn ok' + (o.danger ? ' danger' : '') + '">' +
      escapeHtml(o.okText || '确定') +
      '</button>' +
      '<button type="button" class="kb-confirm-btn cancel">' + escapeHtml(o.cancelText || '取消') + '</button>' +
      '</div></div>';
    document.body.appendChild(mask);

    return new Promise(function (resolve) {
      function close(v) {
        mask.remove();
        document.removeEventListener('keydown', onKey);
        resolve(v);
      }

      function onKey(e) {
        if (e.key === 'Escape') close(false);
      }

      mask.querySelector('.kb-confirm-btn.cancel').addEventListener('click', function () {
        close(false);
      });
      mask.querySelector('.kb-confirm-btn.ok').addEventListener('click', function () {
        close(true);
      });
      mask.addEventListener('click', function (e) {
        if (e.target === mask) close(false);
      });
      document.addEventListener('keydown', onKey);
    });
  }

  function debounce(fn, wait) {
    var t = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(self, args);
      }, wait);
    };
  }

  KB.UI = {
    initToast: initToast,
    toast: toast,
    confirm: confirm,
    bindList: bindList,
    toggleAnswer: toggleAnswer,
    renderStats: renderStats,
    setStat: setStat,
    setStats: setStats,
    debounce: debounce
  };
})(window);
