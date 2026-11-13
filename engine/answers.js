/* 答案册：一份答案数据渲染成一页可分卷翻的正文。
   结构与真题页分工——真题页只放题干，答案按卷放在这里，两页用同一批 id 对上深链：
   题目卡落 #题目id，说明卡落 #s-学科（该学科第一套卷）。

   本文件管外壳与分卷：页头题条、学科下拉、年份行、卷首、题型分节、单条题目，
   以及搜索、收藏、熟悉度三样筛选。答案正文的段落判据在 engine/answer.js，
   搜索的匹配与片段在 engine/answer-search.js，题号面板在 engine/answer-nav.js。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  /* 题型分节的序号：一、简答　二、计算　三、论述 */
  var CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  /* 熟悉度的档位：与题库页同一套词与同一份存储。
     label 是药丸上的字，word 是句子里对这一档的说法（空状态文案用），
     加档位只改这一处，药丸和句子不会各说各的。 */
  var CHIPS = [
    { key: 'all', label: '全部', word: '', cls: '' },
    { key: 'weak', label: '只看不会的', word: '忘了 / 模糊', cls: 'c-weak' },
    { key: 'ok', label: '会了', word: '会了', cls: 'c-ok' },
    { key: 'meh', label: '模糊', word: '模糊', cls: 'c-meh' },
    { key: 'no', label: '忘了', word: '忘了', cls: 'c-no' },
    { key: 'none', label: '未测', word: '未测', cls: 'c-left' }
  ];

  function chipOf(key) {
    return CHIPS.filter(function (x) { return x.key === key; })[0] || null;
  }

  function mount(config) {
    /* 内容类数据在 IndexedDB 里，读盘是异步的：没读完就装配会拿到空白 */
    if (KB.Store && !KB.Store.isReady()) {
      KB.Store.ready().then(function () { mount(config); });
      return null;
    }

    var c = config || {};
    var P = c.project || global.PROJECT_CONFIG || {};
    var A = c.answer || global.ANSWER_CONFIG || {};

    /* 自测三档叫法可由项目配置覆盖，没配用默认「会了／模糊／忘了」。
       CHIPS 与子页 selftest.js 同源，改一处两处都变。 */
    var SL = (P.selftestLabels) || {};
    ['ok', 'meh', 'no'].forEach(function (k) {
      if (SL[k] != null) {
        var chip = chipOf(k);
        if (chip) { chip.label = SL[k]; chip.word = SL[k]; }
      }
    });
    var book = c.book || global.ANSWER_BOOK || {};
    var papers = book.papers || [];

    var contentEl = document.getElementById((c.ids && c.ids.content) || 'content');
    var yearbarEl = document.getElementById((c.ids && c.ids.yearbar) || 'yearbar');
    var subEl = document.getElementById((c.ids && c.ids.sub) || 'tbSub');
    var stBar = document.getElementById('stBar');
    var favBtn = document.getElementById('favOnly');
    /* 工具组在两种状态下住不同的行：关着住第一行最右，开了挪到第二行最右 */
    var toolsEl = document.querySelector('.tb-tools');
    var row1El = document.querySelector('.tb-row1');
    var row2El = document.querySelector('.tb-row2');
    var searchInput = document.getElementById('searchInput');
    var resetBtn = document.getElementById('searchReset');
    var toggle = document.getElementById('stToggle');
    if (!contentEl) return null;

    if (A.title) {
      var h1 = document.querySelector('.topbar h1');
      if (h1) h1.textContent = A.title;
      /* 标签用 tab（纯文字），没配就沿用 title */
      document.title = A.tab != null ? A.tab : (A.title || '') + ' · 记忆卡';
    }

    /* 配色款（公式要不要底色）跟全站同一条：配置不给就按原版带底那款走。
       渲染方式另看 PROJECT_CONFIG.math，两件事不混。 */
    document.body.dataset.preset = A.preset || 'tinted';

    /* 返回键由配置给：答案册退回去看的是题库，不是主页 */
    if (A.back && A.back.href) {
      var back = document.querySelector('.topbar .back');
      if (back) {
        back.href = A.back.href;
        back.lastChild.textContent = A.back.label || '返回';
      }
    }

    /* 搜索框提示词与熟悉度叫法都由配置给，没配就用默认这一套 */
    var S = A.search || {};
    if (searchInput && S.placeholder) searchInput.placeholder = S.placeholder;
    var ST = A.selftest || {};
    if (toggle) {
      var lbl = toggle.parentNode.querySelector('.st-lbl');
      if (lbl && ST.label) lbl.textContent = ST.label;
      if (ST.hint) toggle.parentNode.title = ST.hint;
    }

    if (!papers.length) {
      contentEl.innerHTML = '<div class="empty">答案数据没加载上</div>';
      return null;
    }

    /* 收藏与档位标记与题库页共用一份：同一个 projectId + moduleId */
    KB.Store.configure({ prefix: P.storagePrefix, projectId: P.projectId });
    var moduleId = A.moduleId || 'past-exams';

    var renderer = P.math === 'latex' ? KB.Renderer.latex : KB.Renderer.unicode;
    var esc = KB.escape;

    /* ---- 当次浏览的临时记忆 ----
       搜索词、滚动位置、金边记录只活在当次浏览里：sessionStorage 刷新还在、关标签页即清；
       收藏与档位标记属于长期状态，走 KB.Store，两边不混。
       键沿用 KB.Store 的命名（前缀:项目:模块:类型），同域名部署多个项目不会互相串。 */
    function skey(kind, sub) {
      return [P.storagePrefix || 'kb', P.projectId || 'demo', moduleId, kind]
        .concat(sub ? [sub] : [])
        .join(':');
    }

    function session() {
      try {
        return global.sessionStorage;
      } catch (err) {
        return null;
      }
    }

    function kwRead() {
      var s = session();
      if (!s) return '';
      try {
        return s.getItem(skey('kw')) || '';
      } catch (err) {
        return '';
      }
    }

    function kwSave(v) {
      var s = session();
      if (!s) return;
      try {
        if (v && String(v).trim()) s.setItem(skey('kw'), String(v).trim());
        else s.removeItem(skey('kw'));
      } catch (err) {}
    }

    /* 滚动恢复只认自己的那套：浏览器自带的会和脚本的先后各来一次，
       长页面刷新时先落一处再跳一下。 */
    try {
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    } catch (err) {}

    /* ---- 状态 ---- */

    var st = {
      keyword: '',
      facet: 'all',
      favOnly: false,
      selftest: false,
      marks: {},
      favs: {},
      /* 'global' = 全站结果列表；'paper' = 单卷（可带关键词过滤） */
      listMode: 'paper',
      /* 刚从结果里点开的那道题：回列表时给它留个记认，并滚到它那一截 */
      lastHit: ''
    };

    (function loadState() {
      st.selftest = KB.Store.get(moduleId, 'selftest-on', false) === true;
      st.favOnly = KB.Store.get(moduleId, 'fav-only', false) === true;
      st.marks = KB.Store.get(moduleId, 'selftest', {}) || {};
      (KB.Store.get(moduleId, 'favs', []) || []).forEach(function (id) {
        st.favs[id] = 1;
      });
      var chip = KB.Store.get(moduleId, 'selftest-chip', 'all');
      st.facet = CHIPS.some(function (x) { return x.key === chip; }) ? chip : 'all';
      /* 上次的搜索词：刷新还搜着，不用重新打字 */
      st.keyword = kwRead();
    })();

    /* ---- 查询 ---- */

    function papersOf(subject) {
      return papers.filter(function (p) { return p.subject === subject; });
    }

    function findPaper(key) {
      return papers.filter(function (p) { return p.key === key; })[0] || null;
    }

    function itemCount(paper) {
      return (paper.parts || []).reduce(function (n, part) {
        return n + (part.items || []).length;
      }, 0);
    }

    /* 整卷已录入答案的题数：卷首提示条与年份行的淡显都用它 */
    function filledOf(paper) {
      return ((paper && paper.parts) || []).reduce(function (n, part) {
        return n + (part.items || []).filter(function (it) { return !!it.ans; }).length;
      }, 0);
    }

    function findItem(id) {
      if (!id) return null;
      for (var i = 0; i < papers.length; i++) {
        var parts = papers[i].parts || [];
        for (var j = 0; j < parts.length; j++) {
          var items = parts[j].items || [];
          for (var k = 0; k < items.length; k++) {
            if (items[k].id === id) return { paper: papers[i], item: items[k] };
          }
        }
      }
      return null;
    }

    /* 一条题过不过当前筛选：收藏、档位、关键词三层叠加。
       熟悉度关着时档位不参与——看不到标记，就不该被标记筛掉。 */
    function passItem(it) {
      if (st.favOnly && !st.favs[it.id]) return false;
      if (!st.selftest || st.facet === 'all') return true;
      var m = st.marks[it.id];
      if (st.facet === 'weak') return m === 'meh' || m === 'no';
      if (st.facet === 'none') return !m;
      return m === st.facet;
    }

    /* 档位计数的分母：只受收藏影响，档位本身不参与——
       否则每一档的分母都不一样，数字之间就没法比 */
    function poolOf(paper) {
      var out = [];
      ((paper && paper.parts) || []).forEach(function (part) {
        (part.items || []).forEach(function (it) {
          if (st.favOnly && !st.favs[it.id]) return;
          out.push(it);
        });
      });
      return out;
    }

    /* 副题里那个「共 N 题」：档位开着时用档位池的大小（原版口径），
       否则整卷题数 */
    function poolCount(paper) {
      var n = 0;
      ((paper && paper.parts) || []).forEach(function (part) {
        (part.items || []).forEach(function (it) {
          if (passItem(it)) n++;
        });
      });
      return n;
    }

    /* 档位范围：熟悉度开着且不是「全部」时，本卷与搜索结果都只在该档位池里 */
    function scopeOn() {
      return st.selftest && st.facet !== 'all';
    }

    function facetLabel() {
      var c = chipOf(st.facet);
      return c ? c.label : '';
    }

    /* 句子里用短说法：「这一卷还没有标记『忘了 / 模糊』的题」比「只看不会的」顺 */
    function facetWord() {
      var c = chipOf(st.facet);
      return c ? c.word : '';
    }

    /* 全站档位分布：范围说明里那句「全站 N 题」用它 */
    function tallyAll() {
      var t = { all: 0, ok: 0, meh: 0, no: 0, none: 0, weak: 0 };
      papers.forEach(function (p) {
        (p.parts || []).forEach(function (part) {
          (part.items || []).forEach(function (it) {
            var m = st.marks[it.id];
            t.all++;
            if (m) t[m]++;
            else t.none++;
          });
        });
      });
      t.weak = t.meh + t.no;
      return t;
    }

    /* 搜索扫描：关键词为空时不过滤，口径与题库页一致（题干＋答案） */
    function scan(list) {
      var kw = st.keyword.trim();
      var M = kw ? KB.AnswerSearch.matcher(kw) : null;
      var groups = [];
      var total = 0;

      list.forEach(function (p) {
        var hits = [];
        (p.parts || []).forEach(function (part) {
          (part.items || []).forEach(function (it) {
            if (!passItem(it)) return;
            if (M && !KB.AnswerSearch.hit(KB.AnswerSearch.hay(it), M)) return;
            hits.push({ type: part.type, it: it });
          });
        });
        if (hits.length) {
          groups.push({ paper: p, hits: hits });
          total += hits.length;
        }
      });

      return { groups: groups, total: total, M: M };
    }

    /* ---- 题号面板 ---- */

    var nav = KB.AnswerNav
      ? KB.AnswerNav.mount({
          content: contentEl,
          wide: [
            document.querySelector('.topbar'),
            document.querySelector('.yearbar')
          ],
          onJump: function () {
            try {
              history.replaceState(null, '', '#' + currentKey);
            } catch (err) {}
          }
        })
      : null;

    /* ---- 卷别条 ---- */

    var yearbar = KB.AnswerYearbar
      ? KB.AnswerYearbar.mount({ el: yearbarEl, papers: papers, onPick: go })
      : null;

    /* ---- 打开时的落点 ---- */

    function startKey() {
      var h = decodeHash();
      if (h.indexOf('s-') === 0) {
        var list = papersOf(h.slice(2));
        if (list.length) return list[0].key;
      }
      var hit = findItem(h);
      if (hit) return hit.paper.key;
      if (findPaper(h)) return h;
      /* 没带卷号或题号：回到上次看的那套卷。
         从真题页点进来、或刷新后重开，都不该每次都掉回第一套。 */
      var last = KB.Store.get(moduleId, 'last', '');
      if (last && findPaper(last)) return last;
      return papers[0].key;
    }

    function decodeHash() {
      var raw = (global.location.hash || '').replace(/^#/, '');
      try {
        return decodeURIComponent(raw);
      } catch (err) {
        return raw;
      }
    }

    var currentKey = startKey();

    function remember(key) {
      if (!findPaper(key)) return;
      /* 跨会话记住这套卷：下次不带 hash 进来就落这儿 */
      KB.Store.set(moduleId, 'last', key);
    }

    remember(currentKey);

    /* 页头副题：卷名 · 题数 · 题型。
       档位数字只写在档位条的药丸上，副题不重复写，
       那会占掉手机端一整行。
       三段各包一层不折行的 span：窄屏折行只发生在「·」处，
       不会把「简答 / 计算 / 论述」从中间劈开、留下一个孤字。 */
    function renderSub() {
      if (!subEl) return;
      var kw = st.keyword.trim();

      if (kw && st.listMode === 'global') {
        subEl.innerHTML = seg('全站搜索') + ' ' +
          seg('· 命中 ' + scan(papers).total + ' 题');
        return;
      }

      var paper = findPaper(currentKey);
      if (!paper) return;
      var types = (paper.parts || [])
        .map(function (p) { return p.type; })
        .filter(function (t) { return !!t; });
      var pool = st.favOnly || scopeOn() ? poolCount(paper) : itemCount(paper);

      var segs = [
        paper.title,
        kw ? '命中 ' + scan([paper]).total + ' 题 / 共 ' + pool + ' 题' : pool + ' 题'
      ];
      if (types.length) segs.push(types.join(' / '));

      subEl.innerHTML = segs.map(function (s, i) {
        return seg(i ? '· ' + s : s);
      }).join(' ');
    }

    function seg(s) {
      return '<span class="tb-seg">' + esc(s) + '</span>';
    }

    /* ---- 单条题目 ---- */

    function renderSrc(item) {
      if (!item.src || !item.src.length) return '';
      return (
        '<div class="src">' +
        item.src
          .map(function (r) {
            return '<div class="src-row"><span class="src-t">' + esc(r.t || '') + '</span></div>';
          })
          .join('') +
        '</div>'
      );
    }

    /* 档位只用来筛，不在条目上留任何标记：原版就是这样——
       条目的题号、题干、出处、参考答案区在开不开熟悉度时长得一模一样 */
    function renderItem(item) {
      return (
        '<article class="item" id="' + esc(item.id) + '">' +
        '<div class="q-head"><span class="no">' + esc(item.qid) + '</span>' +
        '<div class="stem">' + KB.Html.stem(item.stem, renderer) + '</div></div>' +
        renderSrc(item) +
        (item.ans
          ? '<div class="ans"><span class="ans-label">参考答案</span>' +
            '<div class="ans-body">' + KB.Answer.render(item.ans) + '</div></div>'
          : '<div class="ans ans-empty"><span class="ans-label">参考答案</span>' +
            '<div class="ans-wait">这一题的答案还在录入，先把题干过一遍。</div></div>') +
        '</article>'
      );
    }

    /* ---- 全站搜索结果 ---- */

    function renderGlobal() {
      var kw = st.keyword.trim();
      var res = scan(papers);
      var scope = scopeOn();

      /* 结果是跨卷的，单卷题号面板不适用 */
      if (nav) nav.setSearch(true);

      var html =
        '<div class="search-head">关键词 <b>「' + esc(kw) + '」</b>' +
        (res.total
          ? '　全站命中 <b>' + res.total + '</b> 题，分布在 <b>' + res.groups.length + '</b> 套卷'
          : '') +
        /* 档位不是「全部」时把搜索范围亮出来：统计条会记住上次那一档，
           不写清楚的话，很容易以为「怎么才搜到这么点」是搜索坏了 */
        (scope
          ? '<div class="sc-scope"><span>范围：<b>' + esc(facetLabel()) + '</b>（统计条档位，全站 ' +
            tallyAll()[st.facet] + ' 题）</span>' +
            '<a href="#" id="scopeAll">不限档位 · 重搜全站</a></div>'
          : '') +
        '</div>';

      if (!res.total) {
        var gsub;
        if (scope && st.favOnly) {
          gsub = '当前只在「收藏」和「' + facetLabel() + '」里搜索，取消其中一个再试';
        } else if (scope) {
          gsub = '当前只在「' + facetLabel() + '」范围内搜索，试试上面那个「不限档位 · 重搜全站」';
        } else if (st.favOnly) {
          gsub = '当前只在收藏过的题里搜索，点右侧「收藏」可以放开';
        } else {
          gsub = '换个关键词试试，比如「古诺」「外部性」「索洛」「价格歧视」';
        }

        html +=
          '<div class="empty">没搜到「' + esc(kw) + '」<br><span>' + gsub + '</span></div>';
        contentEl.innerHTML = html;
        return;
      }

      res.groups.forEach(function (g) {
        html +=
          '<section class="sr-group"><div class="sr-paper">' +
          esc(String(g.paper.title).replace(/\s+/g, ' ')) +
          '<span>' + esc(g.paper.subject) + ' · ' + g.hits.length + ' 题</span></div>';

        g.hits.forEach(function (h) {
          var sn = KB.AnswerSearch.snippet(h.it, res.M);
          html +=
            '<a class="sr-item"' +
            ' href="#' + esc(h.it.id) + '" data-qid="' + esc(h.it.id) + '">' +
            '<span class="sr-no">' + esc(h.type) + ' ' + esc(h.it.qid) + '</span>' +
            '<span class="sr-txt">' + KB.AnswerSearch.hl(sn.text, res.M) +
            (sn.where === 'ans' ? '<span class="sr-tip">　· 命中在答案里</span>' : '') +
            '</span></a>';
        });

        html += '</section>';
      });

      contentEl.innerHTML = html;

      /* 只有「回到结果列表」这一趟恢复位置：刚点过的那条回到之前的屏幕位置，
         并亮 2.4 秒。换档位、改词等其它重绘都停在顶部。 */
      if (restoreListPending) {
        restoreListPending = false;
        if (!restoreSrPos() && st.lastHit) {
          var hitEl0 = contentEl.querySelector('.sr-item[data-qid="' + st.lastHit + '"]');
          if (hitEl0) hitEl0.scrollIntoView({ block: 'center' });
        }
      }

      /* 结果页不属于任何一卷：把地址栏的卷/题 hash 去掉，
         否则刷新时会被当成那一卷的过滤视图，回不到结果列表 */
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch (err) {}
    }

    /* ---- 搜索结果的位置记忆 ----
       记下「点进去的是哪一条」和「它点开时的屏幕位置」，回来时把那条滚回原处，
       不甩回顶部。关键词一变就作废。 */

    var srPos = null;
    /* 下一次渲染结果列表时要不要恢复位置：只有「回到结果列表」这条路要 */
    var restoreListPending = false;

    function saveSrPos(qid) {
      var el = contentEl.querySelector('.sr-item[data-qid="' + qid + '"]');
      if (!el) {
        srPos = null;
        return;
      }
      var r = el.getBoundingClientRect();
      srPos = {
        qid: qid,
        kw: st.keyword.trim(),
        vtop: Math.round(r.top)
      };
      var s = session();
      if (!s) return;
      try {
        s.setItem(skey('srpos'), JSON.stringify(srPos));
      } catch (err) {}
    }

    function readSrPos() {
      var s = session();
      if (!s) return null;
      try {
        var raw = s.getItem(skey('srpos'));
        if (!raw) return null;
        var o = JSON.parse(raw);
        return o && o.qid ? o : null;
      } catch (err) {
        return null;
      }
    }

    function restoreSrPos() {
      var p = srPos || readSrPos();
      if (!p) return false;
      /* 关键词换过了：位置对不上，不硬拽 */
      if (p.kw !== st.keyword.trim()) return false;
      var el = contentEl.querySelector('.sr-item[data-qid="' + p.qid + '"]');
      if (!el) return false; /* 结果集变了（换档位等）→ 不强行定位 */

      var apply = function () {
        var e2 = contentEl.querySelector('.sr-item[data-qid="' + p.qid + '"]');
        if (!e2) return;
        var doc = e2.getBoundingClientRect().top + (global.scrollY || 0);
        var max = document.documentElement.scrollHeight - global.innerHeight;
        var want = doc - p.vtop;
        global.scrollTo(0, max > 0 ? Math.min(Math.max(0, want), max) : Math.max(0, want));
      };
      apply();
      if (global.requestAnimationFrame) global.requestAnimationFrame(apply);
      global.setTimeout(apply, 120);

      /* 刚点过的那条闪一下，省得在一堆结果里找不到；2.4 秒后自己褪掉 */
      el.classList.remove('sr-hit');
      void el.offsetWidth;
      el.classList.add('sr-hit');
      global.setTimeout(function () {
        var e3 = contentEl.querySelector('.sr-item[data-qid="' + p.qid + '"]');
        if (e3) e3.classList.remove('sr-hit');
      }, 2400);
      return true;
    }

    /* ---- 正文 ---- */

    /* 空态文案。收藏、档位、关键词可以同时开着，只说一句「没有匹配的内容」
       等于让人自己猜是哪一层筛空的，所以按当前生效的层拼句子 */
    function emptyCopy() {
      var kw = st.keyword.trim();
      var facetOn = st.selftest && st.facet !== 'all';
      var lv = facetWord();
      var main, sub;

      if (st.favOnly && facetOn && kw) {
        main = '收藏的题里，标「' + lv + '」的没有匹配「' + kw + '」的';
      } else if (st.favOnly && facetOn) {
        main = '这一卷收藏的题里没有标「' + lv + '」的';
      } else if (st.favOnly && kw) {
        main = '收藏的题里没有匹配「' + kw + '」的';
      } else if (st.favOnly) {
        main = '这一卷还没有收藏的题';
      } else if (facetOn && kw) {
        main = '这一卷标「' + lv + '」的题里没有匹配「' + kw + '」的';
      } else if (facetOn) {
        main = st.facet === 'none'
          ? '这一卷的题都标记过了，没有「未测」的'
          : '这一卷还没有标记「' + lv + '」的题';
      } else if (kw) {
        main = '没有匹配「' + kw + '」的内容';
      } else {
        main = '没有匹配的内容';
      }

      if (st.favOnly && facetOn) sub = '取消「收藏」或换回「全部」档位看看';
      else if (st.favOnly) sub = '点一下右侧「收藏」取消筛选，或者换一套卷';
      else if (facetOn) sub = '换个档位，或者清空搜索框试试';
      else sub = '换个筛选条件，或者清空搜索框试试';

      return { main: main, sub: sub };
    }

    function renderContent() {
      var paper = findPaper(currentKey);
      var kw = st.keyword.trim();

      if (kw && st.listMode === 'global') {
        renderGlobal();
        return;
      }

      if (!paper) {
        if (nav) nav.setSearch(true);
        contentEl.innerHTML = '<div class="empty">这套卷没有数据</div>';
        return;
      }

      if (nav) nav.setSearch(false);

      var res = scan([paper]);
      var M = res.M;

      var html = '';

      /* 卷内过滤态：一条吸顶提示，顺手能回全站结果 */
      if (kw) {
        var all = scan(papers);
        html +=
          '<div class="search-back">关键词「' + esc(kw) + '」　本卷命中 <b>' + res.total +
          '</b> 题　全站 <b>' + all.total + '</b> 题' +
          '<a href="#" id="searchBack">← 回到全站搜索结果</a></div>';
      }

      /* 还有题没录入时提示一句，别让人以为页面漏了内容 */
      var total = itemCount(paper);
      var filled = filledOf(paper);
      if (filled < total) {
        html +=
          '<div class="rec-bar"><b>' + (filled ? '本卷答案录入中' : '本卷答案待录入') + '</b>　' +
          '共 ' + total + ' 题，已录入 <span class="rec-num">' + filled + ' 题</span>' +
          (filled ? '，其余正在整理，先看题干复习。' : '，题干已就绪，答案稍后补上。') + '</div>';
      }

      var types = (paper.parts || [])
        .map(function (part) { return part.type; })
        .filter(function (t) { return !!t; });

      var shownParts = [];
      (paper.parts || []).forEach(function (part, i) {
        var items = (part.items || []).filter(function (it) {
          if (!passItem(it)) return false;
          if (M && !KB.AnswerSearch.hit(KB.AnswerSearch.hay(it), M)) return false;
          return true;
        });
        if (items.length) shownParts.push({ type: part.type, items: items, idx: i, note: part.note });
      });

      var shown = shownParts.reduce(function (n, p) { return n + p.items.length; }, 0);

      /* 卷首第三行与原版一致：始终是整卷题数，搜索态也不改成「命中／共」 */
      html +=
        '<div class="paper-head">' +
        '<div class="crumb">' + esc(paper.subject) + '</div>' +
        '<h2>' + esc(paper.title) + '</h2>' +
        '<div class="meta">' +
        '共 ' + itemCount(paper) + ' 题' +
        (types.length ? ' · ' + esc(types.join(' / ')) : '') +
        '</div></div>';

      shownParts.forEach(function (part) {
        /* 题型备注（每题 5 分，共 40 分）跟题型名排在同一行，原版就是这一行 */
        html +=
          '<section class="part"><h3>' + (CN[part.idx] || part.idx + 1) + '、' + esc(part.type) +
          (part.note ? '<span>' + esc(part.note) + '</span>' : '') +
          '</h3>';
        part.items.forEach(function (item) { html += renderItem(item); });
        html += '</section>';
      });

      if (!shown) {
        var cp = emptyCopy();
        html +=
          '<div class="empty">' + esc(cp.main) + '<br><span>' + esc(cp.sub) + '</span></div>';
      }

      contentEl.innerHTML = html;

      /* 面板随正文走：只列当前显示得出的题，筛掉的题不在面板里占位 */
      if (nav) nav.render(paper, shownParts);
    }

    /* ---- 熟悉度的档位条 ---- */

    function buildChips() {
      if (!stBar) return;

      /* 搜索态那排数字是全站口径，前面挂一个「全站」小字说明，
         不然会跟本卷的数字打架 */
      stBar.innerHTML =
        '<span class="chips-cap" hidden>全站</span>' +
        CHIPS.map(function (x) {
          return (
            '<button type="button" class="chip2 ' + x.cls +
            (x.key === st.facet ? ' sel' : '') +
            '" data-f="' + x.key + '">' + x.label + '<b>0</b></button>'
          );
        }).join('');

      stBar.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.chip2') : null;
        if (!btn || !btn.dataset) return;
        st.facet = btn.dataset.f;
        KB.Store.set(moduleId, 'selftest-chip', st.facet);
        render();
        global.scrollTo(0, 0);
      });
    }

    function syncChips() {
      if (!stBar) return;

      /* 搜索结果是全站的，那排数字也跟着算全站；否则只算当前这一卷 */
      var isGlobal = !!st.keyword.trim() && st.listMode === 'global';
      var n = { all: 0, ok: 0, meh: 0, no: 0, weak: 0, none: 0 };

      if (isGlobal) {
        n = tallyAll();
      } else {
        poolOf(findPaper(currentKey)).forEach(function (it) {
          var m = st.selftest ? st.marks[it.id] : '';
          n.all++;
          if (m) n[m]++;
          else n.none++;
        });
        n.weak = n.meh + n.no;
      }

      var cap = stBar.querySelector('.chips-cap');
      if (cap) cap.hidden = !isGlobal;

      Array.prototype.forEach.call(stBar.querySelectorAll('.chip2'), function (b) {
        var v = b.querySelector('b');
        if (v) v.textContent = n[b.dataset.f] || 0;
        if (b.dataset.f === st.facet) b.classList.add('sel');
        else b.classList.remove('sel');
      });
    }

    function syncTools() {
      /* 答案册自己的排法：收藏与搜索跟着熟悉度换行——关着住第一行最右，
         开了挪到档位条那一行。换的是节点本身，不复制，监听只挂一次。
         通用页头不做这件事，所以这段不进公共组件。 */
      if (toolsEl && row1El && row2El) {
        var host = st.selftest ? row2El : row1El;
        if (toolsEl.parentNode !== host) host.appendChild(toolsEl);
      }

      if (favBtn) {
        favBtn.classList.toggle('on', st.favOnly);
        favBtn.setAttribute('aria-pressed', st.favOnly ? 'true' : 'false');
      }
      if (resetBtn) resetBtn.classList.toggle('show', !!st.keyword);
      if (toggle) toggle.checked = st.selftest;
      document.body.classList.toggle('st-on', st.selftest);
    }

    function render() {
      renderSub();
      if (yearbar) yearbar.render(findPaper(currentKey));
      renderContent();
      syncChips();
      syncTools();
    }

    /* ---- 滚动位置记忆 ----
       只记「这一卷看到哪儿」：刷新、从别处回到本卷都落在原位。
       带题号的深链优先，那条路自己会滚到该题，位置恢复不叠加；
       搜索态不记，它不属于任何一卷。 */

    var scrollTimer = null;

    function saveScroll() {
      /* 搜索态也照存：列表滚动后刷新仍落原位（对齐原版，原版无此跳过） */
      var s = session();
      if (!s) return;
      try {
        s.setItem(skey('scroll', currentKey), String(Math.round(global.scrollY || 0)));
      } catch (err) {}
    }

    global.addEventListener(
      'scroll',
      function () {
        clearTimeout(scrollTimer);
        scrollTimer = global.setTimeout(saveScroll, 160);
      },
      { passive: true }
    );
    /* 刷新或关页时同步落一次盘：160ms 防抖可能漏掉最后一小段。
       pagehide 已覆盖这些时机，不再挂离开确认，页面才能进往返缓存 */
    global.addEventListener('pagehide', saveScroll);

    function restoreScroll() {
      /* 搜索态也恢复：列表滚动后刷新仍落原位（对齐原版） */
      var s = session();
      if (!s) return false;
      var y = 0;
      try {
        y = parseInt(s.getItem(skey('scroll', currentKey)) || '0', 10) || 0;
      } catch (err) {
        return false;
      }
      if (y <= 0) return false;

      /* 两次落位：首帧之后一次，字体与图片撑开高度后再校正一次 */
      var apply = function () {
        var max = document.documentElement.scrollHeight - global.innerHeight;
        global.scrollTo(0, max > 0 ? Math.min(y, max) : y);
      };
      apply();
      if (global.requestAnimationFrame) global.requestAnimationFrame(apply);
      global.setTimeout(apply, 140);
      return true;
    }

    /* ---- 跳转与深链 ---- */

    function go(key) {
      if (!findPaper(key)) return;
      currentKey = key;
      remember(key);
      /* 带着关键词切卷：看该卷里命中的题，而不是跳回全站结果列表 */
      if (st.keyword.trim()) st.listMode = 'paper';
      global.scrollTo(0, 0);
      render();
      /* 地址栏跟着走：刷新、分享都能回到这套卷 */
      try {
        history.replaceState(null, '', '#' + key);
      } catch (err) {
        global.location.hash = key;
      }
    }

    function locate(hash) {
      var h = hash != null ? hash : decodeHash();
      if (!h) return false;

      if (h.indexOf('s-') === 0) {
        var list = papersOf(h.slice(2));
        if (!list.length) return false;
        go(list[0].key);
        return true;
      }

      var hit = findItem(h);
      if (hit) {
        /* 手改地址栏贴了题号进来时，视图可能是全站结果列表：切回单卷才找得到这一题 */
        if (st.listMode === 'global') st.listMode = 'paper';
        if (hit.paper.key !== currentKey) {
          currentKey = hit.paper.key;
          remember(currentKey);
          /* 地址栏已经指向这道题时不要覆盖成卷号：从结果点进来那条历史得留住，
             否则后退键回不到结果列表。其余情况记下这一卷，刷新还落在这套卷上。 */
          if (decodeHash() !== h) {
            try {
              history.replaceState(null, '', '#' + currentKey);
            } catch (err) {}
          }
        }
        /* 先按当前状态重绘一次再找元素：从全站结果点进来时，
           页面上只有结果行、还没有条目 DOM，直接找会误判成「被筛掉了」 */
        render();
        var el = document.getElementById(h);
        /* 目标被筛掉时不改筛选条件，沿用已有空态提示 */
        if (el) {
          /* 搜索态顶部有吸顶的「本卷命中 N 题」条：定位时把这段让出来，别压住题干第一行 */
          var off = contentEl.querySelector('.search-back') ? 48 : 0;
          /* 瞬间到位，不带动画：长距离用平滑滚动像被一路带着往下翻 */
          el.scrollIntoView({ block: 'start', behavior: 'auto' });
          if (off) global.scrollBy(0, -off);
          /* 首帧文档高度可能还没撑开，稍后再校一次 */
          global.setTimeout(function () {
            var e2 = document.getElementById(h);
            if (!e2) return;
            e2.scrollIntoView({ block: 'start', behavior: 'auto' });
            if (off) global.scrollBy(0, -off);
          }, 120);

          /* 同一题只亮一次金边：亮过记进会话，刷新页面不重闪 */
          var seen = false;
          var ss = session();
          try {
            seen = !!ss && ss.getItem(skey('flash')) === h;
          } catch (err) {}
          if (!seen) {
            el.classList.add('flash');
            global.setTimeout(function () {
              var e3 = document.getElementById(h);
              if (e3) e3.classList.remove('flash');
            }, 2600);
            try {
              if (ss) ss.setItem(skey('flash'), h);
            } catch (err) {}
          }

          if (nav) nav.highlight(h);
        }
        return true;
      }

      if (findPaper(h)) {
        /* 同卷的 hash 是 go() 自己写回地址栏的，不是真深链：不重渲染、不滚到顶，
           把位置交给 restoreScroll；只有真从不同卷跳过来（hashchange/粘贴）才 go */
        if (h !== currentKey) {
          go(h);
          return true;
        }
        return false;
      }

      return false;
    }

    /* 当前这条历史是从结果列表推进来的那道题：popstate 靠它认出后退方向，
       否则从题目退回列表会被当成普通切题、页面卡在题目视图。 */
    var pushedFromList = '';

    global.addEventListener('hashchange', function () {
      locate();
    });

    /* 浏览器前进/后退：从某道题退回结果列表时，回到列表、并让刚点过的那条留在视野里
       （render 里按 lastHit 把它滚到视野中间）。 */
    global.addEventListener('popstate', function (e) {
      var s = e.state;
      var h = decodeHash();

      if (s && s.srFrom === 'list' && s.id === h) {
        /* 前进回到那道题：切回单卷视图再定位 */
        var hit = findItem(h);
        if (hit) {
          st.listMode = 'paper';
          locate(h);
        }
        pushedFromList = h;
        return;
      }

      if (!pushedFromList) return;
      pushedFromList = '';
      st.listMode = 'global';
      restoreListPending = true;
      render();
    });

    /* ---- 工具栏 ---- */

    if (toggle) {
      toggle.addEventListener('change', function () {
        st.selftest = toggle.checked;
        KB.Store.set(moduleId, 'selftest-on', st.selftest);
        document.body.classList.toggle('st-on', st.selftest);
        render();
        global.scrollTo(0, 0);
      });
    }

    if (favBtn) {
      favBtn.addEventListener('click', function () {
        st.favOnly = !st.favOnly;
        KB.Store.set(moduleId, 'fav-only', st.favOnly);
        render();
        global.scrollTo(0, 0);
      });
    }

    var searchTimer = null;

    function applyKeyword() {
      st.keyword = searchInput ? searchInput.value : '';
      st.listMode = 'global';
      /* 换了词，上一轮点过的那道题就不再是「刚点过的」 */
      st.lastHit = '';
      kwSave(st.keyword);
      render();
      global.scrollTo(0, 0);
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = global.setTimeout(applyKeyword, 220);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        clearTimeout(searchTimer);
        if (searchInput) searchInput.value = '';
        st.keyword = '';
        st.listMode = 'paper';
        st.lastHit = '';
        kwSave('');
        render();
        global.scrollTo(0, 0);
        if (searchInput) searchInput.focus();
      });
    }

    /* 结果条目点一下就进那一卷并落到题上；卷内提示条点一下回结果列表；
       范围说明里那个链接把所有档位放开、重搜一遍 */
    contentEl.addEventListener('click', function (e) {
      if (!e.target.closest) return;

      var scopeAll = e.target.closest('#scopeAll');
      if (scopeAll) {
        e.preventDefault();
        st.facet = 'all';
        KB.Store.set(moduleId, 'selftest-chip', 'all');
        render();
        global.scrollTo(0, 0);
        return;
      }

      var backLink = e.target.closest('#searchBack');
      if (backLink) {
        e.preventDefault();
        st.listMode = 'global';
        /* 回到刚才那一条结果的位置，不是甩回顶部 */
        restoreListPending = true;
        render();
        return;
      }

      var item = e.target.closest('a.sr-item');
      if (!item) return;
      e.preventDefault();
      var qid = item.getAttribute('data-qid');
      st.lastHit = qid;
      st.listMode = 'paper';
      /* 先记下这一条点开时的屏幕位置：回到结果列表时靠它弹回原处 */
      saveSrPos(qid);
      /* pushState 而不是 replaceState：浏览器后退键才能回到结果列表（手机上更常用）。
         必须排在 locate 前面——locate 会把地址栏写成卷号，排在后面就把这条历史冲掉了。 */
      try {
        history.pushState({ srFrom: 'list', id: qid }, '', '#' + qid);
        pushedFromList = qid;
      } catch (err) {
        try {
          history.replaceState(null, '', '#' + qid);
        } catch (err2) {}
      }
      locate(qid);
    });

    /* ---- 装配 ---- */

    /* 上次留下搜索词、地址栏又没指向具体某题 → 直接回到全站结果列表。
       卷级 hash 不算落点（那是页面自己写回地址栏的），否则一刷新就掉进该卷的命中视图。 */
    if (st.keyword) {
      if (searchInput) searchInput.value = st.keyword;
      if (!findItem(decodeHash())) st.listMode = 'global';
    }

    buildChips();
    render();

    /* 首帧之后才滚：字体与图片可能还在加载，太早滚会落偏。
       带题号或学科的深链优先落点；没有深链就回到上次看到的位置。 */
    global.requestAnimationFrame(function () {
      if (!locate()) restoreScroll();
      /* 位置定下来再画第一次高亮：面板不会先亮第 1 题、再跳到真正在读的那题 */
      if (nav) nav.release();
    });

    return {
      render: render,
      go: go,
      current: function () { return currentKey; }
    };
  }

  KB.Answers = { mount: mount };
})(window);
