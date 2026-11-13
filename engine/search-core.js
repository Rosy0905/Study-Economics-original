/* 全站搜索的匹配与片段：不碰 DOM、不碰存储，主线程与后台线程共用同一份。
   判据与答案册保持一致：按空白切词 → 每个词逐字之间允许空白 → 多词同时命中 → 大小写不敏感。
   两处口径一旦分叉，同一个词在答案册搜得到、在全站搜不到，最难解释。 */

(function (global) {
  'use strict';

  function kwTerms(kw) {
    var out = [];
    String(kw || '').toLowerCase().split(/[\s\u3000]+/).forEach(function (t) {
      t = t.trim();
      if (t && out.indexOf(t) === -1) out.push(t);
    });
    return out;
  }
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function looseSrc(t) {
    var cs = [], i;
    for (i = 0; i < t.length; i++) cs.push(escRe(t.charAt(i)));
    return cs.join('\\s*');
  }
  function kwMatcher(kw) {
    var terms = kwTerms(kw), tests = [], hl = null;
    if (!terms.length) return null;
    terms.forEach(function (t) {
      try { tests.push(new RegExp(looseSrc(t), 'i')); } catch (e) { tests.push(null); }
    });
    try { hl = new RegExp('(' + terms.map(looseSrc).join('|') + ')', 'gi'); } catch (e) { hl = null; }
    return { terms: terms, tests: tests, hl: hl };
  }
  function kwHit(text, M) {
    if (!M) return true;
    var s = String(text == null ? '' : text);
    for (var i = 0; i < M.tests.length; i++) {
      if (!M.tests[i] || !M.tests[i].test(s)) return false;
    }
    return true;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  /* 子页答案里带 Markdown 记号（加粗、小标题），片段显示时清掉，匹配仍按原文 */
  function displayText(s) {
    return String(s || '')
      .replace(/\*\*/g, '')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/__/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  /* 取命中句加前一句：命中在很靠后的位置时也能看见词 */
  function sentAround(s, i, len) {
    var B = /[。！？；\n]/;
    var curS = 0, k;
    for (k = i - 1; k >= 0; k--) { if (B.test(s.charAt(k))) { curS = k + 1; break; } }
    var curE = s.length;
    for (k = i + len; k < s.length; k++) { if (B.test(s.charAt(k))) { curE = k + 1; break; } }
    var from = curS;
    if (curS > 0 && curS < 46) {
      var prev = 0;
      for (k = curS - 2; k >= 0; k--) { if (B.test(s.charAt(k))) { prev = k + 1; break; } }
      if (curS - prev <= 70) from = prev;
    }
    var to = curE;
    if (to - from > 160) to = Math.min(curE, from + 160);
    return (from > 0 ? '…' : '') + s.slice(from, to) + (to < s.length ? '…' : '');
  }
  function locIn(s, M) {
    if (!M || !M.hl) return null;
    var m;
    try { m = new RegExp(M.hl.source, 'gi').exec(s); } catch (e) { return null; }
    return m ? { i: m.index, len: m[0].length } : null;
  }
  function snippet(c, M) {
    var q = displayText(c.q);
    var a = displayText(c.a);
    var r1 = locIn(q, M);
    if (r1) return { text: sentAround(q, r1.i, r1.len), where: 'q' };
    var r2 = locIn(a, M);
    if (r2) return { text: sentAround(a, r2.i, r2.len), where: 'a' };
    return { text: (q || a).slice(0, 96), where: 'q' };
  }
  function hl(text, M) {
    var s = esc(text);
    if (!M || !M.hl) return s;
    try { return s.replace(new RegExp(M.hl.source, 'gi'), '<em>$1</em>'); }
    catch (e) { return s; }
  }

  /* 在给定模块表上跑一遍匹配，返回分组结果。
     limit 为每个模块最多回传多少条，0 表示不限；n 始终是该模块的命中总数，
     渲染时按 n 报数、按 hits 铺条目，展开时再要全量。 */
  function runMods(mods, kw, limit) {
    var M = kwMatcher(kw);
    var groups = [], total = 0;
    if (!M) return { groups: groups, total: total };
    (mods || []).forEach(function (m) {
      var hits = [];
      (m.cards || []).forEach(function (c) {
        if (!kwHit(String(c.q || '') + '\n' + String(c.a || ''), M)) return;
        var sn = snippet(c, M);
        hits.push({
          i: String(c.i == null ? '' : c.i),
          no: String(c.d == null ? '' : c.d),
          meta: String(c.s == null ? '' : c.s),
          txt: hl(sn.text, M),
          where: sn.where
        });
      });
      if (!hits.length) return;
      total += hits.length;
      groups.push({
        key: m.key,
        name: m.name,
        url: m.url,
        hash: !!m.hash,
        n: hits.length,
        hits: limit ? hits.slice(0, limit) : hits
      });
    });
    return { groups: groups, total: total };
  }

  global.KB_SEARCH_CORE = {
    kwTerms: kwTerms,
    kwMatcher: kwMatcher,
    kwHit: kwHit,
    esc: esc,
    snippet: snippet,
    hl: hl,
    runMods: runMods
  };
})(self);
