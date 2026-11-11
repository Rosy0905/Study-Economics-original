/* AI 答疑助手：对话进度条。横条、弹出卡片与两向滚动同步是一套状态机，
   面板缩放与窗口变化都要重新量一次尺寸。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  function create(opt) {
    var cfg = opt.cfg;
    var util = opt.util;
    var D = opt.D;
    var L = cfg.limits;

    var navUserMsgs = [];
    var navTicks = [];
    var navActive = -1;

    function syncNavMetrics() {
      if (!D.panel) return;
      /* 用 offsetHeight：面板展开时带 scale(.96) 动画，矩形高度会被缩放污染。 */
      var h = D.panel.offsetHeight;
      var head = D.panel.querySelector('.ai-head');
      var headH = head ? head.offsetHeight : 0;
      if (head) D.panel.style.setProperty('--aiHeadHalf', Math.round(headH / 2) + 'px');
      if (!h) return;
      var foot = D.panel.querySelector('.ai-input-wrap');
      var footH = (foot && foot.offsetParent !== null) ? foot.offsetHeight : 0;
      var avail = h - headH - footH - L.navGap * 2;
      var max = Math.min(Math.round(h / 2) - 24, avail);
      D.panel.style.setProperty('--aiCardMax', Math.max(96, Math.round(max)) + 'px');
    }

    function keepActiveInView(idx) {
      var list = D.progressList;
      var tick = navTicks[idx];
      if (!list || !tick) return;
      var lr = list.getBoundingClientRect(), tr = tick.getBoundingClientRect();
      var top = tr.top - lr.top, bottom = tr.bottom - lr.top;
      if (top < 0) list.scrollTop += top;
      else if (bottom > lr.height) list.scrollTop += bottom - lr.height;
    }

    function showPanel() { if (D.progressPanel) D.progressPanel.classList.add('show'); }
    function hidePanel() { if (D.progressPanel) D.progressPanel.classList.remove('show'); }

    function updateActive() {
      if (!navUserMsgs.length) return;
      var msgsRect = D.msgsEl.getBoundingClientRect();
      var threshold = msgsRect.top + 80;
      var activeIdx = 0;
      navUserMsgs.forEach(function (n, i) {
        var r = n.getBoundingClientRect();
        if (r.top <= threshold) activeIdx = i;
      });
      navTicks.forEach(function (t, i) { t.classList.toggle('active', i === activeIdx); });
      if (activeIdx !== navActive) {
        navActive = activeIdx;
        keepActiveInView(activeIdx);
      }
      if (D.progressPanelInner) {
        D.progressPanelInner.querySelectorAll('.ai-progress-item').forEach(function (it, i) {
          it.classList.toggle('active', i === activeIdx);
        });
      }
    }

    function scrollTo(i) {
      var node = navUserMsgs[i];
      if (!node) return;
      D.msgsEl.classList.add('no-smooth');
      var msgsRect = D.msgsEl.getBoundingClientRect();
      var tRect = node.getBoundingClientRect();
      var delta = tRect.top - msgsRect.top;
      D.msgsEl.scrollTop = D.msgsEl.scrollTop + delta - 8;
      D.msgsEl.classList.remove('no-smooth');
      navTicks.forEach(function (t, k) { t.classList.toggle('active', k === i); });
      navActive = i;
      keepActiveInView(i);
      if (D.progressPanelInner) {
        D.progressPanelInner.querySelectorAll('.ai-progress-item').forEach(function (it, k) {
          it.classList.toggle('active', k === i);
        });
      }
    }

    function build() {
      syncNavMetrics();
      if (!D.progress) return;
      D.progress.querySelectorAll('.ai-tick').forEach(function (t) { t.remove(); });
      if (D.progressPanelInner) D.progressPanelInner.innerHTML = '';
      navUserMsgs = Array.prototype.filter.call(
        D.msgsEl.querySelectorAll('.ai-msg.user'),
        function (n) { return n.dataset.q; }
      );
      if (!navUserMsgs.length) return;
      navTicks = [];
      navUserMsgs.forEach(function (uNode, i) {
        var tick = document.createElement('div');
        tick.className = 'ai-tick';
        tick.dataset.idx = i;
        (D.progressList || D.progress).appendChild(tick);
        navTicks.push(tick);

        if (D.progressPanelInner) {
          var item = document.createElement('div');
          item.className = 'ai-progress-item';
          item.dataset.idx = i;
          item.textContent = (uNode.textContent || '').trim().slice(0, 40) || ('提问 ' + (i + 1));
          item.addEventListener('click', function (e) {
            e.stopPropagation();
            scrollTo(i);
            if (document.body) setTimeout(hidePanel, 60);
          });
          D.progressPanelInner.appendChild(item);
        }

        tick.addEventListener('click', function (e) {
          e.stopPropagation();
          /* 手指点横条先展开卡片再挑，鼠标一点即跳。 */
          if (util.isTouchTap()) { showPanel(); return; }
          scrollTo(i);
        });
      });
      updateActive();
    }

    function bindEvents() {
      if (!D.progress || !D.progressPanel) return;
      var progress = D.progress;
      var panelEl = D.progressPanel;
      progress.addEventListener('pointerenter', function (e) {
        if (e.pointerType !== 'mouse') return;
        showPanel();
      });
      progress.addEventListener('pointerleave', function (e) {
        if (e.pointerType !== 'mouse') return;
        hidePanel();
      });
      progress.addEventListener('click', function (e) {
        if (!util.isTouchTap()) return;
        e.stopPropagation();
        panelEl.classList.toggle('show');
      });
      panelEl.addEventListener('click', function (e) { e.stopPropagation(); });
      document.addEventListener('click', function (e) {
        if (!panelEl.classList.contains('show')) return;
        if (progress.contains(e.target) || panelEl.contains(e.target)) return;
        hidePanel();
      });

      /* 横条列与卡片滚动位置同步，两者的行高与高度上限相同。 */
      if (D.progressList && D.progressPanelInner) {
        var syncing = false;
        function link(from, to) {
          from.addEventListener('scroll', function () {
            if (syncing) return;
            syncing = true;
            to.scrollTop = from.scrollTop;
            global.requestAnimationFrame(function () { syncing = false; });
          });
        }
        link(D.progressPanelInner, D.progressList);
        link(D.progressList, D.progressPanelInner);
      }
      var navTimer = null;
      D.msgsEl.addEventListener('scroll', function () {
        if (navTimer) clearTimeout(navTimer);
        navTimer = setTimeout(updateActive, 80);
      });
    }

    return {
      build: build,
      updateActive: updateActive,
      scrollTo: scrollTo,
      syncNavMetrics: syncNavMetrics,
      bindEvents: bindEvents,
      showPanel: showPanel,
      hidePanel: hidePanel
    };
  }

  KB.AINav = { create: create };
})(window);
