/* 抽查：一次只看一张。
   ◀ 沿历史往回退，▶ 从当前筛选池里随机抽一张（排除当前这张），抽完把指针之后的历史截掉。
   只管历史、指针和抽查条上那几个控件；池子从哪来、卡片怎么画，由页面交进来。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  function mount(opt) {
    var o = opt || {};
    var bar = o.bar;
    var badge = o.badge;
    var prev = o.prev;
    var next = o.next;
    var exitBtn = o.exit;
    if (!bar) return null;

    var history = [];
    var index = -1;

    function active() {
      return index >= 0;
    }

    function currentId() {
      return history[index] || null;
    }

    function pool() {
      return (o.getPool && o.getPool()) || [];
    }

    /* 条上的标题由页面给：缺字段才退回「卡片」 */
    function label() {
      var card = o.cardOf ? o.cardOf(currentId()) : null;
      if (!card) return '卡片';
      if (o.labelOf) return o.labelOf(card);
      return card.qid || card.section || '卡片';
    }

    function refresh() {
      if (!active() || !badge) return;
      badge.textContent = label();
      if (prev) prev.classList.toggle('disabled', index <= 0);

      /* ▶ 灰不灰只看筛选态张数，不看档位池：档位空了也让箭头能点，
         点下去由 step 给出"没有更多"的提示，而不是灰着不吭声。 */
      var navPool = o.getNavPool ? (o.getNavPool() || []) : pool();
      if (next) next.classList.toggle('disabled', navPool.length <= 1);
    }

    function draw() {
      if (o.onRender) o.onRender();
    }

    function scrollTop() {
      if (o.onScrollTop) o.onScrollTop();
    }

    /* 提示文案里的名词：子页说「卡片」，题库页说「题目」，由配置给 */
    var noun = o.noun || '卡片';

    /* 从当前筛选池里随机抽第一张，不把整池排成队 */
    function enter(list) {
      var p = list && list.length ? list : pool();
      if (!p.length) {
        if (o.toast) {
          o.toast(o.emptyText ? o.emptyText() : '😶‍🌫️当前没有' + noun + '可抽查，请调整筛选条件~');
        }
        return;
      }

      var pick = p[Math.floor(Math.random() * p.length)];
      var pickId = typeof pick === 'string' ? pick : pick.id;
      /* 深链可能带已被删掉的 id：取不到卡就报一次，不静默进抽查。
         文案里的名词跟页面一致，子页叫卡片、题库页叫题目 */
      if (o.cardOf && !o.cardOf(pickId)) {
        if (o.toast) o.toast('🫥' + noun + '不存在哦~');
        return;
      }
      history = [pickId];
      index = 0;

      if (o.onEnter) o.onEnter();
      bar.classList.add('show');
      refresh();
      draw();
      scrollTop();
      /* 进入提示沿用题库页的写法，标题与条上一致 */
      if (o.toast) o.toast('🎯 抽查: ' + label());
    }

    function exit(silent) {
      if (!active()) return;
      index = -1;
      history = [];

      bar.classList.remove('show');
      if (o.onExit) o.onExit();
      if (!silent) draw();
      if (!silent && o.toast) o.toast('📋 已退出抽查模式');
    }

    function step(delta) {
      if (!active()) return;

      if (delta < 0) {
        if (index <= 0) {
          if (o.toast) o.toast('已经是第一张了');
          return;
        }
        index--;
      } else {
        var cur = currentId();
        var p = pool().filter(function (c) { return c.id !== cur; });
        if (!p.length) {
          if (o.toast) o.toast('🤧没有更多' + noun + '可抽查了~');
          return;
        }

        var pick = p[Math.floor(Math.random() * p.length)];
        history = history.slice(0, index + 1);
        history.push(pick.id);
        index = history.length - 1;
      }

      if (o.onStep) o.onStep();
      refresh();
      draw();
      scrollTop();
      /* ▶ 只在往后抽时报下一张，往回翻不报 */
      if (delta > 0 && o.toast) o.toast('▶ 下一张: ' + label());
    }

    if (prev) prev.addEventListener('click', function () { step(-1); });
    if (next) next.addEventListener('click', function () { step(1); });
    if (exitBtn) {
      exitBtn.addEventListener('click', function () {
        if (o.onExitClick) o.onExitClick();
        else exit(false);
      });
    }

    return {
      enter: enter,
      exit: exit,
      step: step,
      active: active,
      currentId: currentId,
      refresh: refresh
    };
  }

  KB.Single = { mount: mount };
})(window);
