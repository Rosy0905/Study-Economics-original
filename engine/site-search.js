
(function (global) {
  'use strict';
  var KB = global.KB || (global.KB = {});
  KB.SiteSearch = { mount: function () {

    var KW_KEY = 'site_search_kw';      /* 搜索词：sessionStorage，关标签页即清 */
    var POS_KEY = 'site_search_pos';    /* 从结果点进去的那条 + 它点开时的屏幕位置 */
    var MY_KEY = 'kb:demo:cards:items';     /* 我的卡片：26/11/10 起在 IndexedDB 内容层，这里留作兜底 */
    var PER_MOD = 40;                   /* 每个模块最多列多少条，防止搜「的」时渲染上千条卡死 */

    var wrapEl = document.getElementById('wrap');
    var kwEl = document.getElementById('kw');
    var resetEl = document.getElementById('reset');
    var IDX = window.SITE_INDEX;
    var keyword = '';
    var timer = null;
    var srPos = null;
    var curRes = null, curM = null, curKw = '';   /* 展开某组时要用，存住这一轮的结果 */

    /* ================= 关键词匹配 =================
       口径与答案册 answers.html 完全一致（那边实测通过）：
       按空白切词 → 每个词逐字之间允许 \s* → 多词 AND → 大小写不敏感。
       两处搜索必须是同一套判据，否则同一个词在答案册搜得到、在全站搜不到，最难解释。 */
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

    /* ================= 片段与高亮 ================= */
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    /* 子页答案里带 Markdown 记号（**加粗**、## 小标题），片段显示时清掉，搜索仍按原文匹配 */
    function displayText(s) {
        return String(s || '')
            .replace(/\*\*/g, '')
            .replace(/^#{1,6}\s*/gm, '')
            .replace(/__/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    /* 取「命中句 + 前一句」：命中在很靠后的位置时也能看见词 */
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

    /* ================= 我的卡片：运行时补一组 =================
       存在 localStorage 的 custom_cards_v1，构建期读不到，只能这里现读。
       file:// 双击打开时浏览器可能不共享，读不到就静默跳过，不报错。 */
    function loadMyCards() {
        var out = [];
        try {
            /* 卡片早在内容层里了，先问存储层；没就绪时退回抽屉，读到的是空也不报错。
               就绪后再走一遍，见文件末尾的 ready 钩子 */
            var arr = null;
            if (KB.Store && KB.Store.get) {
                var v = KB.Store.get('cards', 'items', null);
                if (Array.isArray(v)) arr = v;
            }
            if (!arr) {
                var raw = localStorage.getItem(MY_KEY);
                arr = raw ? JSON.parse(raw) : [];
            }
            if (Array.isArray(arr)) {
                arr.forEach(function (o) {
                    if (!o) return;
                    var id = String(o.id || '');
                    var q = String(o.question || '');
                    var a = String(o.answerHtml || o.answer || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
                    if (!id || (!q && !a)) return;
                    out.push({ i: id, q: q, a: a, s: String(o.chapter || ''), t: String(o.subject || ''), d: String(o.qid || '') });
                });
            }
        } catch (e) { out = []; }
        return out;
    }
    function allMods() {
        var mods = (IDX && IDX.mods) ? IDX.mods.slice() : [];
        var mine = loadMyCards();
        if (mine.length) {
            mods.push({ key: '9my-cards', name: '我的卡片', url: 'mycards.html', n: mine.length, cards: mine });
        }
        return mods;
    }

    /* ================= 搜索 ================= */
    function searchAll(kw, M) {
        var groups = [], total = 0;
        if (!M) return { groups: groups, total: 0 };
        allMods().forEach(function (m) {
            var hits = [];
            (m.cards || []).forEach(function (c) {
                if (!kwHit(String(c.q || '') + '\n' + String(c.a || ''), M)) return;
                hits.push(c);
            });
            if (hits.length) { groups.push({ mod: m, hits: hits }); total += hits.length; }
        });
        return { groups: groups, total: total };
    }

    /* 点结果跳哪去：真题走答案册的题 hash；其余子页带 kw + cid 两个参数，
       由页面自己填搜索框、过滤、按卡片 id 滚到位 */
    function jumpUrl(mod, c, kw) {
        /* 真题答案册的搜索框和结果条跟子页不是一套结构，ans=1 让落点脚本换一套选择器；
           from=site 只是给那边挂返回条用的标记 */
        if (mod.hash) {
            return mod.url + '?kw=' + encodeURIComponent(kw) +
                '&cid=' + encodeURIComponent(c.i) + '&ans=1&from=site#' + encodeURIComponent(c.i);
        }
        return mod.url + '?kw=' + encodeURIComponent(kw) + '&cid=' + encodeURIComponent(c.i);
    }

    function savePos(mod, c) {
        var el = document.querySelector('.hit[data-key="' + mod.key + '|' + c.i + '"]');
        if (!el) { srPos = null; return; }
        var r = el.getBoundingClientRect();
        srPos = { kw: keyword.trim(), key: mod.key + '|' + c.i, vtop: Math.round(r.top), y: Math.round(window.scrollY || 0) };
        try { sessionStorage.setItem(POS_KEY, JSON.stringify(srPos)); } catch (e) {}
    }
    function restorePos() {
        var p = srPos;
        if (!p) {
            try {
                var raw = sessionStorage.getItem(POS_KEY);
                p = raw ? JSON.parse(raw) : null;
            } catch (e) { p = null; }
        }
        if (!p || !p.key) return false;
        if (p.kw !== keyword.trim()) return false;
        var el = document.querySelector('.hit[data-key="' + p.key + '"]');
        if (!el) return false;
        var apply = function () {
            var e2 = document.querySelector('.hit[data-key="' + p.key + '"]');
            if (!e2) return;
            var doc = e2.getBoundingClientRect().top + (window.scrollY || 0);
            var max = document.documentElement.scrollHeight - window.innerHeight;
            var want = doc - (p.vtop || 0);
            window.scrollTo(0, max > 0 ? Math.min(Math.max(0, want), max) : Math.max(0, want));
        };
        apply();
        if (window.requestAnimationFrame) requestAnimationFrame(apply);
        setTimeout(apply, 130);
        el.classList.remove('hit-flash');
        void el.offsetWidth;
        el.classList.add('hit-flash');
        setTimeout(function () { el.classList.remove('hit-flash'); }, 2400);
        return true;
    }

    /* ================= 结果渲染（单条 / 单组抽出，展开时复用） ================= */
    function hitHtml(g, c, M, kw) {
        var sn = snippet(c, M);
        var noTxt = c.d ? c.d : '';
        var metaTxt = c.s || '';
        return '<a class="hit" href="' + esc(jumpUrl(g.mod, c, kw)) + '" ' +
            'data-key="' + esc(g.mod.key + '|' + c.i) + '" ' +
            'data-mod="' + esc(g.mod.key) + '" data-cid="' + esc(c.i) + '">' +
            (noTxt ? '<span class="no">' + esc(noTxt) + '</span>' : '') +
            '<span class="txt">' + hl(sn.text, M) +
            (sn.where === 'a' ? '<span class="tip">　· 命中在答案里</span>' : '') + '</span>' +
            (metaTxt ? '<span class="meta" title="' + esc(metaTxt) + '">' + esc(metaTxt) + '</span>' : '') +
            '</a>';
    }

    function groupHtml(g, all, M, kw) {
        var shown = all ? g.hits.length : Math.min(g.hits.length, PER_MOD);
        var html = '<div class="grp-head">' + esc(g.mod.name) +
            '<span>' + g.hits.length + ' 张</span></div>';
        for (var i = 0; i < shown; i++) html += hitHtml(g, g.hits[i], M, kw);
        if (!all && g.hits.length > shown) {
            html += '<button class="more-btn" type="button" data-mod="' + esc(g.mod.key) + '">' +
                '展开剩下的 ' + (g.hits.length - shown) + ' 张</button>';
        }
        return html;
    }

    function renderSearch(opt) {
        var kw = keyword.trim();
        var M = kwMatcher(kw);
        var res = searchAll(kw, M);
        var html = '';

        html += '<div class="sum">关键词 <b>「' + esc(kw) + '」</b>' +
            (res.total
                ? '　全站命中 <b>' + res.total + '</b> 张，分布在 <b>' + res.groups.length + '</b> 个模块'
                : '') + '</div>';

        if (!res.total) {
            html += '<div class="empty">没搜到「' + esc(kw) + '」<br>' +
                '<span>换个说法试试，空格分开两个词是「同时包含」的意思<br>' +
                '比如 <a href="#" data-demo="消费者 偏好">消费者 偏好</a>、' +
                '<a href="#" data-demo="无差异曲线">无差异曲线</a>、' +
                '<a href="#" data-demo="帕累托">帕累托</a></span></div>';
        }

        res.groups.forEach(function (g) {
            html += '<section class="grp" data-mod="' + esc(g.mod.key) + '">' +
                groupHtml(g, false, M, kw) + '</section>';
        });

        curRes = res; curM = M; curKw = kw;   /* 展开按钮要用 */

        wrapEl.innerHTML = html;
        updateResetUI();
        if (!(opt && opt.restore && restorePos())) window.scrollTo(0, 0);
    }

    /* 点「展开剩下的 N 张」：这一组改成全量渲染，按钮自己就没了 */
    wrapEl.addEventListener('click', function (e) {
        var t = e.target;
        while (t && t !== wrapEl) {
            if (t.className && String(t.className).indexOf('more-btn') > -1) break;
            t = t.parentNode;
        }
        if (!t || t === wrapEl || !curRes) return;
        var key = t.getAttribute('data-mod');
        var g = null;
        curRes.groups.forEach(function (x) { if (x.mod.key === key) g = x; });
        if (!g) return;
        var sec = null;
        try { sec = wrapEl.querySelector('section.grp[data-mod="' + key.replace(/["\\]/g, '\\$&') + '"]'); } catch (er) {}
        if (!sec) return;
        sec.innerHTML = groupHtml(g, true, curM, curKw);
    });

    function renderIdle() {
        wrapEl.innerHTML = '<div class="empty">在右上角敲一个词，一次搜遍全站<br>' +
            '<span>各模块卡片、历年真题题干与答案、你自己存的卡片，都在里面<br>' +
            '空格分开两个词表示「同时包含」，比如 <a href="#" data-demo="无差异曲线 递减">无差异曲线 递减</a></span></div>';
        updateResetUI();
    }

    function updateResetUI() {
        resetEl.classList.toggle('show', !!kwEl.value);
    }
    function saveKw() {
        try {
            if (keyword.trim()) sessionStorage.setItem(KW_KEY, keyword.trim());
            else sessionStorage.removeItem(KW_KEY);
        } catch (e) {}
    }

    /* ================= 事件 ================= */
    kwEl.addEventListener('input', function () {
        updateResetUI();
        clearTimeout(timer);
        timer = setTimeout(function () {
            keyword = kwEl.value;
            saveKw();
            if (keyword.trim()) renderSearch(); else renderIdle();
        }, 220);
    });

    resetEl.addEventListener('click', function () {
        clearTimeout(timer);
        kwEl.value = '';
        keyword = '';
        saveKw();
        try { sessionStorage.removeItem(POS_KEY); } catch (e) {}
        renderIdle();
        kwEl.focus();
    });

    /* 空状态里的示例词：点一下直接搜 */
    wrapEl.addEventListener('click', function (e) {
        var d = e.target.closest ? e.target.closest('[data-demo]') : null;
        if (d) {
            e.preventDefault();
            kwEl.value = d.getAttribute('data-demo');
            keyword = kwEl.value;
            saveKw();
            renderSearch();
            return;
        }
        var a = e.target.closest ? e.target.closest('.hit') : null;
        if (!a) return;
        /* 记下点的是哪条、它点开时在屏幕哪个位置，回来时弹回原处 */
        var key = a.getAttribute('data-key') || '';
        var parts = key.split('|');
        var mod = null, c = null;
        allMods().forEach(function (m) {
            if (m.key !== parts[0]) return;
            mod = m;
            (m.cards || []).forEach(function (x) { if (x.i === parts[1]) c = x; });
        });
        if (mod && c) savePos(mod, c);
        /* 不拦默认跳转：href 已经拼好，浏览器直接走，页面本身留在历史里，
           子页顶上的返回条点一下就回得来 */
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
            if (kwEl.value) {
                kwEl.value = '';
                keyword = '';
                saveKw();
                renderIdle();
            }
        }
    });

    /* ================= 启动 ================= */
    if (!IDX || !IDX.mods) {
        wrapEl.innerHTML = '<div class="empty">索引没加载上<br><span>先跑一次 node _tools/build-search.js</span></div>';
        return;
    }

    /* 回来时：有搜索词就重建结果并落回原位；没有就显示空状态 */
    var saved = '';
    try { saved = sessionStorage.getItem(KW_KEY) || ''; } catch (e) {}
    if (saved) {
        keyword = saved;
        kwEl.value = saved;
        renderSearch({ restore: true });
    } else {
        renderIdle();
    }
    if (window.matchMedia && window.matchMedia('(min-width: 641px)').matches) kwEl.focus();

    /* 卡片在 IndexedDB 里，首帧可能还没读完：就绪后重算一次，
       有搜索词就重建结果，没有就只刷新空状态里的计数 */
    if (KB.Store && KB.Store.ready && !KB.Store.isReady()) {
        KB.Store.ready().then(function () {
            if (keyword) renderSearch({ restore: false });
            else renderIdle();
        });
    }
  } };
})(window);
