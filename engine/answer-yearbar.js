/* 答案册卷别条：学科下拉 + 年份单行。

   输入 papers 与当前卷，输出这一条 DOM；选中的卷通过 onPick 交回去，
   自己不留页面状态，只记住「每个学科上次看的是哪套卷」这一件事。
   删掉这个文件、页面不引它，答案册照常渲染，只是没有卷别条。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  function mount(opts) {
    var o = opts || {};
    var el = o.el;
    var papers = o.papers || [];
    var onPick = o.onPick || function () {};
    if (!el || !papers.length) return null;

    var esc = KB.escape;
    /* 学科 → 上次看的卷：从理论经济学切回应用经济学时落回原处 */
    var lastOf = {};

    function subjects() {
      var out = [];
      papers.forEach(function (p) {
        if (out.indexOf(p.subject) === -1) out.push(p.subject);
      });
      return out;
    }

    function papersOf(subject) {
      return papers.filter(function (p) { return p.subject === subject; });
    }

    function itemCount(paper) {
      return (paper.parts || []).reduce(function (n, part) {
        return n + (part.items || []).length;
      }, 0);
    }

    function filledOf(paper) {
      return ((paper && paper.parts) || []).reduce(function (n, part) {
        return n + (part.items || []).filter(function (it) { return !!it.ans; }).length;
      }, 0);
    }

    function render(paper) {
      var cur = paper || papers[0];
      var subject = cur.subject;
      lastOf[subject] = cur.key;

      var html =
        '<div class="yb-pick"><button type="button" class="yb-btn" aria-haspopup="true" ' +
        'aria-expanded="false">' + esc(subject) +
        '<svg viewBox="0 0 10 6" fill="none" aria-hidden="true">' +
        '<path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" ' +
        'stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<div class="yb-menu">';

      subjects().forEach(function (s) {
        html +=
          '<button type="button" data-subj="' + esc(s) + '"' +
          (s === subject ? ' class="on"' : '') + '>' + esc(s) +
          '<span>' + papersOf(s).length + ' 套</span></button>';
      });

      html += '</div></div><div class="yb-years">';

      /* 年份按该学科下的卷序排；地址栏认 #卷key，点年份就是改 hash */
      papersOf(subject).forEach(function (p) {
        var pend = filledOf(p) === 0;
        html +=
          '<a href="#' + esc(p.key) + '" data-key="' + esc(p.key) + '"' +
          ' class="' + (p.key === cur.key ? 'active' : '') + (pend ? ' pend' : '') + '"' +
          ' title="' + esc(p.title + ' · ' + (pend ? '答案待录入' : itemCount(p) + ' 题')) + '">' +
          esc(p.short) + '</a>';
      });

      html += '</div>';
      el.innerHTML = html;

      var pick = el.querySelector('.yb-pick');
      var btn = pick.querySelector('.yb-btn');

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = pick.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      Array.prototype.forEach.call(pick.querySelectorAll('.yb-menu button'), function (b) {
        b.addEventListener('click', function () {
          pick.classList.remove('open');
          var to = b.dataset.subj;
          onPick(lastOf[to] || papersOf(to)[0].key);
        });
      });

      /* 当前这套卷滚进视野：年份多的时候手机上一屏只露六七个，
         不主动滚过去就看不见自己在哪一年 */
      var box = el.querySelector('.yb-years');
      var act = box && box.querySelector('a.active');
      if (act && box.scrollWidth > box.clientWidth) {
        var br = box.getBoundingClientRect();
        var ar = act.getBoundingClientRect();
        box.scrollLeft += (ar.left - br.left) - Math.min(40, (br.width - ar.width) / 2);
      }
    }

    /* 点别处、按 Esc 收起下拉：只挂一次，跟重绘无关 */
    document.addEventListener('click', function (e) {
      var pick = el.querySelector('.yb-pick');
      if (!pick || !pick.classList.contains('open')) return;
      if (pick.contains(e.target)) return;
      pick.classList.remove('open');
      pick.querySelector('.yb-btn').setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var pick = el.querySelector('.yb-pick');
      if (pick) pick.classList.remove('open');
    });

    return { render: render };
  }

  KB.AnswerYearbar = { mount: mount };
})(window);
