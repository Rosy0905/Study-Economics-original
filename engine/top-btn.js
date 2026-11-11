/* 返回顶部箭头（独立组件，不依赖任何别的脚本）：
   右下角一条浅绿线条箭头，没有圆底、不带文字，不挡内容。

   出现条件：本段上滑累计满 150px 且持续满 150ms；向下滚、停手、距顶 400 以内都收。
   出现后停手 1.5 秒淡出，鼠标停在箭头上时不收；点击平滑回顶，到顶自动消失。
   尺寸与坐标都在 ui/top-btn.css 的变量里，改位置不用动这里。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  var MIN_Y = 400; /* 距顶 400 以内不出现 */
  var IDLE_MS = 1500; /* 停手多久淡出 */
  var UP_PX = 150; /* 本段累计上滑距离 */
  var UP_MS = 150; /* 同时要求持续上滑时长，挡掉瞬时猛甩 */
  var JITTER = 2; /* 小于这个位移算抖动，不判方向 */

  function mount() {
    /* 返回顶部开关：features.topBtn 为 false 时不挂载（默认显示）。
       与全站其它功能开关同一套判定，读 PROJECT_CONFIG.features。 */
    var P = global.PROJECT_CONFIG || {};
    var FEAT = P.features || {};
    if (FEAT.topBtn === false) return null;

    if (document.getElementById('toTop')) return null;

    var btn = document.createElement('button');
    btn.id = 'toTop';
    btn.type = 'button';
    btn.title = '返回顶部';
    btn.setAttribute('aria-label', '返回顶部');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
      ' stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 20 V4 M12 4 L6 11 M12 4 L18 11"/></svg>';
    document.body.appendChild(btn);

    var lastY = global.scrollY || document.documentElement.scrollTop || 0;
    var idleTimer = null;
    var ticking = false;
    var upDist = 0;
    var upMs = 0;
    var lastT = -1;
    var hovering = false;

    /* AI 面板展开时，AI 按钮会被加 .hidden —— 箭头不单独浮在面板上，跟着收；
       面板收起后恢复可用。位置由 CSS 定死，不像原版那样收起后还要重新对准。
       AI 按钮由 AI 脚本在页面末尾同步创建，正常 mount 时已就位；
       万一没赶上，load 再补一次，已绑过就直接返回。 */
    var fab = null;
    var fabOn = true;
    function bindFab() {
      if (fab) return;
      fab = document.querySelector('.ai-fab');
      if (!fab) return;
      fabOn = !fab.classList.contains('hidden');
      if (global.MutationObserver) {
        new global.MutationObserver(function () {
          fabOn = !fab.classList.contains('hidden');
          if (!fabOn) hide();
        }).observe(fab, { attributes: true, attributeFilter: ['class'] });
      }
    }
    bindFab();
    global.addEventListener('load', bindFab);

    function show() { if (fabOn) btn.classList.add('show'); }
    function hide() { btn.classList.remove('show'); }

    function armIdle() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(function () {
        idleTimer = null;
        if (hovering) return; /* 指针停在箭头上时保持展开 */
        upDist = 0;
        upMs = 0;
        lastT = -1;
        hide();
      }, IDLE_MS);
    }

    /* 悬停锁：进箭头清倒计时，离开后若还可见就重新计时 */
    btn.addEventListener('mouseenter', function () {
      hovering = true;
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    });
    btn.addEventListener('mouseleave', function () {
      hovering = false;
      if (btn.classList.contains('show')) armIdle();
    });

    function update() {
      ticking = false;
      var y = global.scrollY || document.documentElement.scrollTop || 0;
      var dy = y - lastY;
      lastY = y;
      var now = performance.now();
      var dt = lastT > 0 ? now - lastT : 0;
      lastT = now;

      if (dy < -JITTER) {
        upDist += -dy;
        upMs += dt;
        if (y > MIN_Y) {
          if (upDist >= UP_PX && upMs >= UP_MS) show();
        } else {
          hide();
        }
      } else if (dy > JITTER) {
        upDist = 0;
        upMs = 0;
        lastT = -1;
        if (!hovering) hide();
      } else {
        upDist = 0;
        upMs = 0;
        lastT = -1;
      }
      armIdle();
    }

    global.addEventListener(
      'scroll',
      function () {
        if (!ticking) {
          global.requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );

    btn.addEventListener('click', function () {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      global.scrollTo({ top: 0, behavior: 'smooth' });
    });

    hide();
    return { show: show, hide: hide };
  }

  KB.TopBtn = { mount: mount };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})(window);
