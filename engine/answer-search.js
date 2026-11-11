/* 答案册全站搜索：分词、宽松匹配、命中片段、高亮。
   只出纯函数，不碰 DOM——结果怎么排、放哪儿由页面决定。

   口径与题库页搜索一致：多个词按「都要命中」算（AND），词内字与字之间
   允许夹空白，跨行断开的词、全角空格都不会漏。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  function escRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* 逐字之间插 \s*：消费者剩余 → 消\s*费\s*者\s*剩\s*余 */
  function looseSrc(t) {
    var out = [];
    for (var i = 0; i < t.length; i++) out.push(escRe(t.charAt(i)));
    return out.join('\\s*');
  }

  function terms(kw) {
    var out = [];
    String(kw || '').toLowerCase().split(/[\s\u3000]+/).forEach(function (t) {
      t = t.trim();
      if (t && out.indexOf(t) === -1) out.push(t);
    });
    return out;
  }

  /* 预编译：tests 逐词判定（不带 g），hl 汇总高亮（带 g）。
     词表为空返回 null＝没在搜，调用方自己判 */
  function matcher(kw) {
    var list = terms(kw);
    var tests = [];
    var hl = null;
    if (!list.length) return null;

    list.forEach(function (t) {
      try {
        tests.push(new RegExp(looseSrc(t), 'i'));
      } catch (e) {
        tests.push(null);
      }
    });
    try {
      hl = new RegExp('(' + list.map(looseSrc).join('|') + ')', 'gi');
    } catch (e) {
      hl = null;
    }
    return { terms: list, tests: tests, hl: hl };
  }

  /* 所有词都在这一段里（AND）。M 为 null 视为不过滤 */
  function hit(text, M) {
    if (!M) return true;
    var s = String(text == null ? '' : text);
    for (var i = 0; i < M.tests.length; i++) {
      if (!M.tests[i] || !M.tests[i].test(s)) return false;
    }
    return true;
  }

  /* 一道题的搜索底本：题干 + 换行 + 答案 */
  function hay(item) {
    return String(item.stem || '') + '\n' + String(item.ans || '');
  }

  /* 命中片段：以命中词为中心取「命中句 + 前一句」，保证片段里看得到关键词。
     只截题干前 N 字的话，命中在中后段的词在片段里根本找不到。 */
  function around(s, i, len) {
    var B = /[。！？；\n]/;
    var curS = 0;
    var k;
    for (k = i - 1; k >= 0; k--) {
      if (B.test(s.charAt(k))) {
        curS = k + 1;
        break;
      }
    }
    var curE = s.length;
    for (k = i + len; k < s.length; k++) {
      if (B.test(s.charAt(k))) {
        curE = k + 1;
        break;
      }
    }
    var from = curS;
    /* 命中句太短时，前面再带一句（前一句不超过 70 字才带，免得整段搬过来） */
    if (curS > 0 && curS < 46) {
      var prev = 0;
      for (k = curS - 2; k >= 0; k--) {
        if (B.test(s.charAt(k))) {
          prev = k + 1;
          break;
        }
      }
      if (curS - prev <= 70) from = prev;
    }
    var to = curE;
    if (to - from > 160) to = Math.min(curE, from + 160);
    return (from > 0 ? '…' : '') + s.slice(from, to) + (to < s.length ? '…' : '');
  }

  /* 在折叠成一行的文本里找第一个命中的词：位置和长度按实际匹配到的串算，
     跨行断开的词折叠后可能还留着空白，长度略大于词本身，片段照样能圈住 */
  function firstIn(s, M) {
    if (!M || !M.hl) return null;
    var m;
    try {
      m = new RegExp(M.hl.source, 'i').exec(s);
    } catch (e) {
      return null;
    }
    return m ? { i: m.index, len: m[0].length } : null;
  }

  function snippet(item, M) {
    var stem = String(item.stem || '')
      .replace(/\n[ \t]*\n[\s]*/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();
    var ans = String(item.ans || '').replace(/\s+/g, ' ').trim();

    /* 先看题干再看答案，命中在答案里才标那句提示 */
    var r1 = firstIn(stem, M);
    if (r1) return { text: around(stem, r1.i, r1.len), where: 'stem' };

    var r2 = firstIn(ans, M);
    if (r2) return { text: around(ans, r2.i, r2.len), where: 'ans' };

    return { text: stem.slice(0, 96), where: 'stem' };
  }

  /* 先转义再包 <em>：高亮只标命中词，其余字符一律当文本 */
  function hl(text, M) {
    var s = KB.escape(text);
    if (!M || !M.hl) return s;
    try {
      return s.replace(new RegExp(M.hl.source, 'gi'), '<em>$1</em>');
    } catch (e) {
      return s;
    }
  }

  KB.AnswerSearch = {
    matcher: matcher,
    hit: hit,
    hay: hay,
    snippet: snippet,
    hl: hl
  };
})(window);
