/* 全站搜索落点：子页被 search.html 带 ?kw=&cid= 打开时，首帧盖遮罩、填词筛选、
   按 data-id 定位目标卡并闪框；词被筛掉时按整串 → 单词 → 全量逐档降级。
   顶部返回条回 search.html；退出搜索则抹参数、还原筛选栏与筛选记忆、清滚动记录。
   依赖 filter-memory.js 的 snapshot / suspend / restore；未引入时筛选栏回默认值。
   答案册走 ?kw=&cid=&ans=1&from=site#题号，选择器用 #searchInput 与 .sr-item[data-qid]。
   必须放在 head 内同步执行，遮罩要赶在首帧之前；其余动作等 DOMContentLoaded。 */
(function () {
    'use strict';

    var qs;
    try { qs = new URLSearchParams(window.location.search); } catch (e) { return; }
    var kw = (qs.get('kw') || '').trim();
    var cid = (qs.get('cid') || '').trim();
    var ansMode = (qs.get('ans') || '') === '1';      /* 真题答案册：换一套选择器 */
    var fromSite = (qs.get('from') || '') === 'site'; /* 只挂返回条用的标记 */
    /* 框架各页搜索框 id 不统一：子页与题库页是 pageSearch，我的卡片是 filterSearch，
       答案册是 searchInput。运行时按页面探测，head 阶段取不到 DOM。 */
    function getInp() {
        if (ansMode) return document.getElementById('searchInput');
        return document.getElementById('pageSearch') || document.getElementById('filterSearch');
    }
    if (!kw && !cid && !fromSite) return;             /* 正常访问：直接退出 */

    var BACK_URL = 'search.html?back=1';

    /* ---------- 遮罩：把中间过程藏起来 ----------
       带词落地时，页面会先画全量列表、再筛、再滚过去。这三步在眼睛里就是「跳了一下」。
       脚本在 head 里同步跑，先把 <html> 底色染成页面底色，浏览器第一帧就是浅绿而不是白；
       遮罩本身等 <body> 出现的那一刻直接挂进 body（不在 <html> 下先挂着再搬，搬家会重排一次），
       定位完成调用 unveil() 淡出。人看到的就是「一打开就已经筛好、卡已经在闪」。
       兜底 3.2 秒强制撤，绝不留白屏。 */
    var veiled = !!(kw || cid);
    var unveilDone = false;
    var veilEl = null;

    function unveil() {
        if (unveilDone) return;
        unveilDone = true;
        if (!veilEl || !veilEl.parentNode) return;
        veilEl.classList.add('sj-off');
        /* 内联也写一遍，样式标签万一没生效也能正常淡出，不会一直糊在页面上 */
        veilEl.style.transition = 'opacity .16s ease';
        veilEl.style.opacity = '0';
        try { document.documentElement.classList.remove('sj-veiled'); } catch (e) {}
        var gone = veilEl;
        setTimeout(function () {
            if (gone.parentNode) gone.parentNode.removeChild(gone);
        }, 220);
    }

    /* 遮罩挂进 body。head 里跑的时候 body 还没解析出来，等它一出现就挂上去；
       不先挂 <html> 再搬进 body —— 那一次 DOM 移动会让已经可见的遮罩重绘一帧，看着就是「抖一下」。 */
    function mountVeil(el) {
        function put() {
            if (el.parentNode) return;
            (document.body || document.documentElement).appendChild(el);
        }
        if (document.body) { put(); return; }
        try {
            var mo = new MutationObserver(function () {
                if (!document.body) return;
                mo.disconnect();
                put();
            });
            mo.observe(document.documentElement, { childList: true });
        } catch (e) { put(); }
    }

    /* 遮罩内容：三张单列满宽的骨架卡 + 一行字，字右边三个依次跳的点。
       形状、宽度、圆角、左侧绿边都照子页真实卡片来，揭开那一刻能直接接上；
       字和点补一句人话，否则纯图形看不出在干什么。 */
    if (veiled) {
        var vst = document.createElement('style');
        vst.textContent =
            /* 底色跟八个子页的 body 同一个值，揭开时不会有一层色差闪一下 */
            'html.sj-veiled{background:var(--sj-veil-bg, #f0f7f0);}'
            + '.sj-veil{position:fixed;left:0;right:0;top:0;bottom:0;background:var(--sj-veil-bg, #f0f7f0);'
            + 'z-index:2147483500;display:flex;align-items:center;justify-content:center;'
            + 'transition:opacity .16s ease;}'
            + '.sj-veil.sj-off{opacity:0;}'
            + '.sj-load{width:min(400px,86vw);box-sizing:border-box;}'
            /* 骨架照真实布局画：单列满宽、gap 18px、18px 圆角、6px 左绿边。
               八个子页的 .card-grid 全是 grid-template-columns:1fr，一张卡占一整行 */
            + '.sj-grid{display:grid;grid-template-columns:1fr;gap:18px;}'
            + '.sj-sk{position:relative;overflow:hidden;display:flex;flex-direction:column;'
            + 'justify-content:center;height:148px;padding:24px 26px;box-sizing:border-box;'
            + 'background:#fff;border:1px solid var(--sj-card-border, #e6f0e8);border-left:6px solid var(--sj-card-accent, #dfeee3);'
            + 'border-radius:18px;opacity:.55;animation:sjRise .28s ease forwards;}'
            + '.sj-sk i{display:block;height:8px;border-radius:4px;background:var(--sj-skel, #e9f2ec);}'
            + '.sj-sk i+i{margin-top:9px;}'
            + '.sj-sk::after{content:"";position:absolute;left:0;right:0;top:0;bottom:0;'
            /* 高光压到很淡，只留一层薄薄的呼吸感，不再有白光扫过去那种晃眼 */
            + 'background:linear-gradient(100deg,transparent 20%,var(--sj-shine-1, rgba(233,244,236,.42)) 42%,'
            + 'var(--sj-shine-2, rgba(255,255,255,.5)) 50%,var(--sj-shine-1, rgba(233,244,236,.42)) 58%,transparent 80%);'
            + 'background-size:240% 100%;animation:sjSw 3.4s linear infinite;}'
            + '@keyframes sjSw{0%{background-position:130% 0;}100%{background-position:-40% 0;}}'
            + '@keyframes sjRise{from{opacity:.55;transform:translateY(6px);}to{opacity:1;transform:none;}}'
            /* 一行字，右边跟三个依次跳的点 */
            + '.sj-foot{display:flex;align-items:center;justify-content:center;gap:9px;margin-top:15px;}'
            + '.sj-lbl{font:500 14.5px/1.5 "Segoe UI","PingFang SC",sans-serif;'
            + 'color:var(--sj-hint, #547d60);letter-spacing:.4px;}'
            + '.sj-dots{display:flex;align-items:flex-end;gap:5px;flex:0 0 auto;height:10px;}'
            + '.sj-dots i{width:6px;height:6px;border-radius:50%;background:var(--sj-dot, #7fb98f);'
            + 'animation:sjDot 1.05s ease-in-out infinite;}'
            + '.sj-dots i:nth-child(2){animation-delay:.15s;}'
            + '.sj-dots i:nth-child(3){animation-delay:.30s;}'
            + '@keyframes sjDot{0%,70%,100%{opacity:.35;transform:translateY(0);}'
            + '35%{opacity:1;transform:translateY(-4px);}}'
            + '@media (max-width:760px){.sj-sk{height:136px;}}'
            + '@media (max-width:640px){.sj-grid{gap:12px;}.sj-sk{height:124px;padding:20px 20px;}}';
        (document.head || document.documentElement).appendChild(vst);
        /* 先染色再挂遮罩：浏览器首帧就是页面底色，不会先白一下 */
        try { document.documentElement.classList.add('sj-veiled'); } catch (e) {}

        var bone = function (delay, w1, w2, w3) {
            return '<div class="sj-sk" style="animation-delay:' + delay + 's">'
                + '<i style="width:' + w1 + '"></i>'
                + '<i style="width:' + w2 + '"></i>'
                + '<i style="width:' + w3 + '"></i></div>';
        };
        veilEl = document.createElement('div');
        veilEl.className = 'sj-veil';
        /* 定位、铺满、居中三件事直接写在元素上：
           哪怕样式标签因为任何原因没及时生效，遮罩也不会掉进文档流跑到页面角落去 */
        veilEl.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;'
            + 'z-index:2147483500;display:flex;align-items:center;justify-content:center;'
            + 'background:var(--sj-veil-bg, #f0f7f0);box-sizing:border-box;';
        veilEl.innerHTML =
            '<div class="sj-load">'
            + '<div class="sj-grid">'
            + bone(0.00, '38%', '86%', '62%')
            + '</div>'
            + '<div class="sj-foot">'
            + '<span class="sj-lbl">正在定位那张卡片</span>'
            + '<span class="sj-dots"><i></i><i></i><i></i></span>'
            + '</div>'
            + '</div>';
        mountVeil(veilEl);
        setTimeout(unveil, 3200);
    }

    /* ---------- 以下都要等 DOM 就绪 ---------- */
    function boot() {
        /* 遮罩节点在 head 里建的，解析器可能把它挪走；这里确认它落在 body 里 */
        if (veilEl && document.body && veilEl.parentNode && !document.body.contains(veilEl)) {
            document.body.appendChild(veilEl);
        }

        /* 进搜索之前的筛选记忆原件。必须在这一刻取：再晚一点，下面填词就会把它污染掉。
           退出搜索时原样写回，叉掉才算「没发生过」。 */
        /* 框架把筛选记忆挂在 KB 命名空间下，原版挂全局；两边都认 */
        var FM = (window.KB && window.KB.FilterMemory) || window.FilterMemory || null;
        var fmSnap = null;
        if (FM && FM.snapshot) { try { fmSnap = FM.snapshot(); } catch (e) {} }
        /* 整个搜索会话期间只冻结搜索框，不冻下拉。
           框里的词是借来的，写进记忆就等于把「消费者」变成这一页的常设搜索；
           而搜索进来后自己选的章节属于真实筛选，照常记。 */
        if (FM && FM.freezeText) { try { FM.freezeText(); } catch (e) {} }
        var fmTimer = null;
        function fmPause() {
            if (!FM) return;
            if (FM.suspend) { try { FM.suspend(); } catch (e) {} }
            clearTimeout(fmTimer);
        }
        /* 临时放行的开关与抑制计数，先声明再挂监听 */
        var revealed = false;
        var suppress = 0;
        /* 落点结束后，用户自己动筛选就撤掉临时放行，见 armUserFilterWatch */
        armUserFilterWatch();
        function fmResumeSoon(ms) {
            if (!FM) return;
            clearTimeout(fmTimer);
            fmTimer = setTimeout(function () {
                if (FM.resume) { try { FM.resume(); } catch (e) {} }
            }, ms || 700);
        }

        /* 样式：全部内联注入，不依赖各页 CSS */
        var css = ''
            + '.sj-bar{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483000;'
            + 'display:flex;align-items:center;gap:10px;max-width:92vw;padding:7px 8px 7px 14px;'
            + 'background:#fff;border:1px solid var(--sj-bar-border, #cfe8da);border-radius:999px;'
            + 'box-shadow:var(--sj-bar-shadow, 0 6px 20px rgba(40,90,50,.18));'
            + 'font:13px/1.4 "Segoe UI","PingFang SC",Roboto,sans-serif;color:var(--sj-bar-fg, #2c4a36);}'
            + '.sj-bar a{color:var(--sj-bar-link, #23603a);font-weight:700;text-decoration:none;white-space:nowrap;}'
            + '.sj-bar a:hover{text-decoration:underline;}'
            + '.sj-bar .sj-kw{color:var(--sj-bar-kw, #7b9a80);max-width:40vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
            /* 真题那边自己有一条「← 回到全站搜索结果」（回的是命中列表），和这条撞名，
               在搜索会话里藏掉，改由这条里的「命中列表」承担同一个动作 */
            + '.sj-bar .sj-list{color:var(--sj-list-fg, #5c8a68);font-weight:600;padding-left:10px;border-left:1px solid var(--sj-list-line, #e2eee6);}'
            + 'html.sj-in-search #searchBack{display:none;}'
            /* 答案册那条信息条（关键词 + 本卷/全站命中数 + 回列表链接）整条收掉：
               关键词和命中数并进返回条，回列表的动作放在条里的「命中列表」，不留重复的一横条 */
            + 'html.sj-in-search .search-back{display:none;}'
            + '.sj-bar .sj-x{border:none;background:var(--sj-x-bg, #eef7ee);color:var(--sj-x-fg, #4d7a58);width:22px;height:22px;border-radius:50%;'
            + 'cursor:pointer;font:14px/1 sans-serif;padding:0;flex:0 0 auto;}'
            + '.sj-bar .sj-x:hover{background:var(--sj-x-hover-bg, #dff0df);color:var(--sj-bar-link, #23603a);}'
            + '.sj-bar-lazy{opacity:0;pointer-events:none;transform:translateX(-50%) translateY(-6px);'
            + 'transition:opacity .2s ease,transform .2s ease;}'
            + '.sj-bar-lazy.on{opacity:1;pointer-events:auto;transform:translateX(-50%) translateY(0);}'
            /* 闪框：照答案册 .item.flash 的写法 —— 2px 琥珀描边（压在边框内侧）+ 柔光阴影。
               描边颜色走动画，头尾都透明，进出是淡的；不改 border-radius，卡片形状不动。 */
            + '@keyframes sjFlash{0%{outline-color:rgba(212,162,78,0);}'
            + '8%,72%{outline-color:#d4a24e;}100%{outline-color:rgba(212,162,78,0);}}'
            + '.card-item.sj-flash,.item.sj-flash{outline:2px solid transparent;outline-offset:-2px;'
            + 'box-shadow:0 4px 18px rgba(180,140,60,.28);animation:sjFlash 2.8s ease;}'
            /* 答案册结果列表的行：跟列表行高亮同一套，浅黄底 + 细描边，不套卡片那圈光环 */
            + '.sr-item.sj-flash{background:#fff8e6;outline:2px solid #e8c877;outline-offset:-2px;}'
            /* 提示条：宽度按文字自然宽度走（max-content），一行放得下就一行，
               放不下才折行；再用 max-width 兜住，手机上顶到 90vw 折行，不会缩成一条竖长条。
               写死宽度会让长语句折行、末行只剩一两个字，最难看的正是这一种。 */
            + '.sj-tip{position:fixed;left:50%;top:66px;z-index:2147483000;'
            + 'display:flex;align-items:flex-start;gap:8px;box-sizing:border-box;'
            + 'width:max-content;max-width:min(560px,90vw);'
            + 'background:#fdf3d8;border:1px solid #e8c877;color:#6b4d22;border-radius:10px;padding:9px 12px;'
            + 'font:13.5px/1.55 "Segoe UI","PingFang SC",sans-serif;'
            + 'box-shadow:0 4px 14px rgba(120,90,30,.16);'
            + 'opacity:0;transform:translateX(-50%) translateY(-6px);'
            + 'transition:opacity .18s ease,transform .18s ease;}'
            + '.sj-tip.on{opacity:1;transform:translateX(-50%) translateY(0);}'
            + '.sj-tip i{flex:0 0 auto;width:17px;height:17px;border-radius:50%;background:#e8c877;'
            + 'color:#5c3f14;font:11px/17px sans-serif;font-style:normal;text-align:center;margin-top:1px;}'
            + '@media (max-width:640px){.sj-tip{top:58px;font-size:13px;padding:8px 11px;}}';
        var st = document.createElement('style');
        st.textContent = css;
        (document.head || document.documentElement).appendChild(st);

        /* ---------- 叉掉 = 退出搜索，等于「没发生过」 ----------
           四件事：抹地址栏参数 → 筛选栏还原成进入时的样子 → 撤条 → 清滚动记录。
           还原不是清空：#filterSpecial / #filterFav / #filterSearch 的值一律取进来时拍的快照，
           页面的筛选记忆（<前缀>filters）也原样写回，否则跳到搜索期间被填进去的临时词
           会被当成新筛选存下来，下次正常打开看到的就不是原有筛选了。 */
        function optionExists(sel, v) {
            for (var i = 0; i < sel.options.length; i++) {
                if (sel.options[i].value === v) return true;
            }
            return false;
        }

        function restoreFilters() {
            /* 退出搜索：按快照还原搜索词与各下拉。
               框架子页的下拉是 select[data-key] 没有 id，必须一并写回并触发 change，
               否则屏幕上的下拉停在会话中改过的值，只有存储还原了，看起来就像没还原。
               快照两种格式都认：框架 { values: {...}, keyword }，原版扁平键。 */
            var o = null;
            if (fmSnap) { try { o = JSON.parse(fmSnap) || null; } catch (e) { o = null; } }
            function storedVal(s) {
                if (!o) return '';
                var key = s.getAttribute('data-key') ||
                          (s.id ? s.id.replace(/^filter/, '') : '');
                if (o.values && typeof o.values[key] === 'string') return o.values[key];
                if (s.id && typeof o[s.id] === 'string') return o[s.id];
                if (typeof o[key] === 'string') return o[key];
                return '';
            }
            var bar = document.getElementById('filterBar');
            if (bar) {
                var sels = bar.querySelectorAll('select');
                for (var i = 0; i < sels.length; i++) {
                    var s = sels[i];
                    var v = storedVal(s);
                    var t = (v && optionExists(s, v)) ? v
                          : (s.options.length ? s.options[0].value : '');
                    if (s.value !== t) {
                        s.value = t;
                        try { s.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
                    }
                }
            }
            /* 原版快照的搜索词存在扁平键里，框架的存在 keyword */
            var kwv = o ? ((typeof o.keyword === 'string') ? o.keyword
                       : (typeof o.filterSearch === 'string') ? o.filterSearch : '') : '';
            var inp = getInp();
            if (inp) {
                inp.value = kwv;
                try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
            }
        }

        function exitSearch() {
            fmPause();                       /* 整个过程不许写筛选记忆 */

            try {
                var q = new URLSearchParams(window.location.search);
                ['kw', 'cid', 'ans', 'from'].forEach(function (k) { q.delete(k); });
                var s = q.toString();
                /* 必须写 window.history：7 个主题页里都有全局 let history = []（它们自己的操作栈），
                   裸写 history 取到的是那个数组，replaceState 直接抛错，被 catch 吞掉就悄无声息。
                   不带 hash：真题那条 #题号 一并去掉。 */
                window.history.replaceState(null, '', window.location.pathname + (s ? '?' + s : ''));
            } catch (e) {}

            /* 先撤销落点时的临时放行：这一步可能触发页面重绘，
               必须排在还原筛选之前，且整段仍在 suspend 里，不会写进记忆 */
            exitReveal();

            if (ansMode) {
                /* 答案册：点它自己的「清空搜索」。档位（只看不会的）是它跨会话记的，不动 */
                var btn = document.getElementById('searchReset');
                if (btn) { try { btn.click(); } catch (e) {} }
            } else {
                restoreFilters();
            }
            if (FM && FM.restore) { try { FM.restore(fmSnap); } catch (e) {} }

            var barEl = document.querySelector('.sj-bar');
            if (barEl && barEl.parentNode) barEl.parentNode.removeChild(barEl);
            /* 退出搜索后把答案册自己那条「← 回到全站搜索结果」放出来，它原生搜索还要用 */
            try { document.documentElement.classList.remove('sj-in-search'); } catch (e) {}
            try { sessionStorage.removeItem(SKEY); } catch (e) {}
            /* 退出搜索后本页回到正常记忆状态，搜索框再改就该照常记了 */
            if (FM && FM.unfreezeText) { try { FM.unfreezeText(); } catch (e) {} }
            if (FM && FM.resume) { try { FM.resume(); } catch (e) {} }
        }

        /* ---------- 顶部返回条 ----------
           lazy：先不显示，滚出 60px 再浮出来。
           真题答案册顶上排满了筛选区，固定条压上去会挡住「⬅ 题库」和标题。 */
        function addBar(lazy) {
            if (document.querySelector('.sj-bar')) return;
            /* 搜索会话标记：筛选记忆据此忽略临时搜索词，退出时由 exitSearch 摘掉 */
            try { document.documentElement.classList.add('sj-in-search'); } catch (e) {}
            var bar = document.createElement('div');
            bar.className = 'sj-bar' + (lazy ? ' sj-bar-lazy' : '');
            var a = document.createElement('a');
            a.href = BACK_URL;
            a.textContent = '← 回到搜索结果';
            /* 点回搜索列表前把进会话前的筛选记忆原件写回存储：
               会话里手动改过的下拉在页面上继续有效，但下不为例——
               不写回的话，绕道返回再点一次进来，筛选就真的被改掉了 */
            a.addEventListener('click', function () {
                fmPause();
                exitReveal();
                if (FM && FM.restore) { try { FM.restore(fmSnap); } catch (e) {} }
                var t = document.querySelector('.sj-tip');
                if (t && t.parentNode) t.parentNode.removeChild(t);
            });
            bar.appendChild(a);
            if (ansMode) {
                /* 真题的命中列表单独给一个入口，跟「回搜索页」分开：
                   点它等于触发答案册那条「← 回到全站搜索结果」（会弹回原处并闪一下） */
                var lb = document.createElement('a');
                lb.className = 'sj-list';
                lb.href = '#';
                lb.textContent = '命中列表';
                lb.addEventListener('click', function (ev) {
                    if (ev) ev.preventDefault();
                    var sb = document.getElementById('searchBack');
                    if (sb) { try { sb.click(); } catch (e) {} }
                });
                bar.appendChild(lb);
                try { document.documentElement.classList.add('sj-in-search'); } catch (e) {}
            }
            if (kw) {
                var s = document.createElement('span');
                s.className = 'sj-kw';
                s.textContent = '关键词「' + kw + '」';
                bar.appendChild(s);
            }
            var x = document.createElement('button');
            x.className = 'sj-x';
            x.type = 'button';
            x.title = '退出搜索，还原筛选';
            x.setAttribute('aria-label', '退出搜索');
            x.textContent = '×';
            x.addEventListener('click', exitSearch);
            bar.appendChild(x);
            document.body.appendChild(bar);
            if (lazy) {
                var sync = function () {
                    if ((window.scrollY || 0) > 60) bar.classList.add('on');
                    else bar.classList.remove('on');
                };
                window.addEventListener('scroll', sync, false);
                sync();
            }
        }

        /* ---------- 滚动位置记忆 ----------
           只管「从搜索页跳进来之后按 F5」这一种。正常进来位置由定位决定，
           刷新时该回到你翻到的地方，而不是重新弹回那张卡。
           用导航类型判断刷新，比记标记稳 —— 重新点一次结果不会被误判成刷新。 */
        var SKEY = 'sj_scroll:' + window.location.pathname;
        var isReload = false;
        try {
            var navs = performance.getEntriesByType && performance.getEntriesByType('navigation');
            isReload = !!(navs && navs[0] && navs[0].type === 'reload');
        } catch (e) {}

        function savedY() {
            try { return parseInt(sessionStorage.getItem(SKEY) || '0', 10) || 0; } catch (e) { return 0; }
        }
        function saveScroll() {
            try { sessionStorage.setItem(SKEY, String(Math.round(window.scrollY || 0))); } catch (e) {}
        }
        function restoreScroll() {
            var y = savedY();
            if (y <= 0) return false;
            var apply = function () {
                var max = document.documentElement.scrollHeight - window.innerHeight;
                window.scrollTo(0, max > 0 ? Math.min(y, max) : y);
            };
            apply();
            if (window.requestAnimationFrame) requestAnimationFrame(apply);
            setTimeout(apply, 140);
            setTimeout(apply, 420);
            return true;
        }
        var scrollTimer = null;
        window.addEventListener('scroll', function () {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(saveScroll, 160);
        }, { passive: true });
        /* 防抖可能漏掉最后一段，关页/刷新前同步落一次。
           pagehide 已覆盖关页、刷新与切后台，不再挂离开确认，页面才能进往返缓存 */
        window.addEventListener('pagehide', saveScroll);

        /* 落点失败分两种，文案分开：目标被当前筛选挡住而临时放出，
           与数据里确实找不到（删了或改了），不要混成一句。 */
        var TIP_BLOCKED = '这张卡被当前筛选挡住，现在临时放出~';
        var TIP_MISSING = '这张卡没有找到哦，可能被修改或删除了';

        function tip(msg) {
            /* 同时只留一条：连着触发两次不会叠成两坨 */
            var old = document.querySelector('.sj-tip');
            if (old && old.parentNode) old.parentNode.removeChild(old);
            var d = document.createElement('div');
            d.className = 'sj-tip';
            var ic = document.createElement('i');
            ic.textContent = '!';
            var sp = document.createElement('span');
            sp.textContent = msg;
            d.appendChild(ic);
            d.appendChild(sp);
            document.body.appendChild(d);
            if (window.requestAnimationFrame) {
                requestAnimationFrame(function () { d.classList.add('on'); });
            } else {
                d.classList.add('on');
            }
            setTimeout(function () { d.classList.remove('on'); }, 4200);
            setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 4400);
        }

        /* 填词后按卡片数量变化判定筛选完成，320ms 兜底。
           input 与 keyup 各发一次，兼容两种监听方式。 */
        var CARD_SEL = ansMode ? '.sr-item' : '.card-item';
        function fill(val, cb) {
            var inp = getInp();
            if (!inp) { cb(false); return; }
            /* 这一填是临时借用的，不是既有的筛选状态，别让筛选记忆把它记下来。
               恢复记录要等过页面自己的 320ms 防抖，否则还是会漏一笔进去 */
            fmPause();
            fmResumeSoon(700);
            var before = document.querySelectorAll(CARD_SEL).length;
            inp.value = val;
            try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
            try {
                inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
            } catch (e) {}
            var tick = 0;
            (function poll() {
                if (document.querySelectorAll(CARD_SEL).length !== before) { cb(true); return; }
                if (++tick >= 8) { cb(true); return; }
                setTimeout(poll, 40);
            })();
        }

        function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

        /* 答案册单卷渲染后给目标题补一次金边，跟其余模块用同一套 sjFlash。
           答案册自身的 flash 有会话门闩会挡掉跨页跳转的这一次，这里绕开门闩；
           先摘掉可能残留的 flash，避免两套样式叠在同一题上。 */
        function flashPaperItem(id) {
            var el = null;
            try { el = document.getElementById(id); } catch (e) {}
            if (!el) return;
            el.classList.remove('flash');
            el.classList.remove('sj-flash');
            void el.offsetWidth;
            el.classList.add('sj-flash');
            setTimeout(function () {
                var e2 = document.getElementById(id);
                if (e2) e2.classList.remove('sj-flash');
            }, 2800);
        }

        /* ---------- 被挡住的落点：判存在 → 临时放出 → 定位 ----------
           页面只有「当前筛选后」的 DOM，被挡的卡根本不在里面，所以先问页面
           原始数据源有没有这 id：有就是被挡住，没有才是真的删改了。 */
        function probeExists() {
            if (ansMode) {
                return !!(window.KB && KB.Answers && KB.Answers.exists &&
                          KB.Answers.exists(cid));
            }
            if (window.KB && KB.Page && KB.Page.exists) return !!KB.Page.exists(cid);
            /* 我的卡片页不加载 page.js，走它自己的门面 */
            if (window.KB && KB.MyCards && KB.MyCards.exists) return !!KB.MyCards.exists(cid);
            return false;
        }

        /* 把目标临时放出后落到它身上。各页 reveal 只改内存态、不写存储，
           退出搜索时由 exitSearch 统一撤销，筛选记忆也随快照还原。
           放出后卡片才进 DOM，定位与闪框仍走 gotoCard 那套。 */
        function revealAndLocate(fail) {
            var ok = false;
            fmPause();   /* 放行引起的重绘不许写进筛选记忆 */
            if (ansMode) {
                /* 答案册 reveal 已切到单卷并渲染出目标题，命中列表此时不在 DOM，
                   不能再走 gotoCard 找 .sr-item；直接对题目节点定位闪框。 */
                ok = !!(window.KB && KB.Answers && KB.Answers.reveal &&
                        suppressedCall(function () { return KB.Answers.reveal(cid); }));
                if (!ok) { fail(); return; }
                revealed = true;
                var el = null;
                try { el = document.getElementById(cid); } catch (e) {}
                if (!el) { fail(); return; }
                try { el.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (e) {}
                setTimeout(function () {
                    try { el.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (e) {}
                }, 120);
                flashPaperItem(cid);
                unveil();
                tip(TIP_BLOCKED);
                return;
            }
            var pg = (window.KB && KB.Page && KB.Page.reveal) ? KB.Page
                   : (window.KB && KB.MyCards && KB.MyCards.reveal) ? KB.MyCards : null;
            ok = !!(pg && suppressedCall(function () { return pg.reveal(cid); }));
            if (!ok) { fail(); return; }
            revealed = true;
            gotoCard(0, fail, function () {
                tip(TIP_BLOCKED);
            });
        }

        function exitReveal() {
            revealed = false;
            if (ansMode) {
                if (window.KB && KB.Answers && KB.Answers.unreveal) {
                    try { KB.Answers.unreveal(); } catch (e) {}
                }
            } else if (window.KB && KB.Page && KB.Page.unreveal) {
                try { KB.Page.unreveal(); } catch (e) {}
            } else if (window.KB && KB.MyCards && KB.MyCards.unreveal) {
                try { KB.MyCards.unreveal(); } catch (e) {}
            }
            var t = document.querySelector('.sj-tip');
            if (t && t.parentNode) t.parentNode.removeChild(t);
        }

        /* 落点把卡放出来后，用户在页面上自己动筛选，那张卡就该回到新筛选的结果里。
           否则「选了只看不会的，放出的那张会了的卡还杵在那儿」就是错位。
           脚本自己填词、放下拉也会发同名事件，用 suppressed 把那些挡掉。 */
        function suppressedCall(fn) {
            suppress++;
            var out;
            try { out = fn(); } finally {
                setTimeout(function () { suppress = Math.max(0, suppress - 1); }, 0);
            }
            return out;
        }
        function onUserFilterChange() {
            if (!revealed || suppress > 0) return;
            revealed = false;
            exitReveal();
        }
        function armUserFilterWatch() {
            var bar = document.getElementById('filterBar');
            if (bar) {
                bar.addEventListener('change', onUserFilterChange, true);
                bar.addEventListener('input', onUserFilterChange, true);
            }
            var inp = getInp();
            if (inp) inp.addEventListener('input', onUserFilterChange);
            /* 各页的重置按钮直接改值再重绘，不发 change 事件，单独认一下；
               答案册的收藏开关、档位条、范围链接同理不走筛选栏 */
            document.addEventListener('click', function (e) {
                var t = e.target;
                if (!t || !t.closest) return;
                if (t.closest('#btnReset') || t.closest('#clearFilterBtn') ||
                    t.closest('#searchReset') || t.closest('#mcSearchClear') ||
                    t.closest('#favOnly') || t.closest('#stBar') ||
                    t.closest('.st-bar') || t.closest('.st-chip') ||
                    t.closest('.chip2') || t.closest('#scopeAll') ||
                    t.closest('#stToggle')) onUserFilterChange();
            }, true);
        }

        /* ---------- 定位卡片 ----------
           n：重试次数（卡片渲染有延迟）
           onFail：重试完仍找不到时的回调，由调用方决定下一步降级 */
        function gotoCard(n, onFail, onFound) {
            var el = null;
            if (cid) {
                var sel = ansMode
                    ? '.sr-item[data-qid="' + cssEsc(cid) + '"]'
                    : '.card-item[data-id="' + cssEsc(cid) + '"]';
                try { el = document.querySelector(sel); } catch (e) {}
            }
            /* 自测档位靠 display:none 藏卡，DOM 还在。不可见的不算找到，
               否则会停在隐藏卡上空闪一下，永远走不到临时放出那一步。 */
            if (el && !ansMode) {
                try {
                    if (el.classList.contains('st-hide') ||
                        window.getComputedStyle(el).display === 'none') el = null;
                } catch (e) {}
            }
            if (el) {
                if (ansMode) {
                    /* 真题的答案是藏在单卷视图里的，列表本身不是内容。
                       这里自动把命中那条点下去，走答案册自己的点击流程：记位置、pushState、
                       渲染该卷、定位到题号。落地就是题目本身，不用再点第二次。
                       揭开等单卷渲染出来再走，别让人看到列表被换掉那一下。 */
                    /* 命中数在切回列表的这一瞬最容易拿：.sr-item 有几条就是几题，
                       并进返回条的关键词那里，答案册那条信息条就可以整条收掉 */
                    var hitN = document.querySelectorAll('.sr-item').length;
                    var kwSpan = document.querySelector('.sj-bar .sj-kw');
                    if (kwSpan && hitN) kwSpan.textContent = '关键词「' + kw + '」· 命中 ' + hitN + ' 题';
                    el.classList.add('sj-flash');
                    setTimeout(function () { try { el.click(); } catch (e) {} }, 130);
                    var wait = 0;
                    (function paperReady() {
                        if (document.querySelector('.paper-head')) {
                            flashPaperItem(cid);
                            setTimeout(unveil, 130);
                            return;
                        }
                        if (++wait > 14) { unveil(); return; }
                        setTimeout(paperReady, 50);
                    })();
                setTimeout(saveScroll, 400);
                if (onFound) onFound();
                return true;
            }
            el.scrollIntoView({ block: 'start', behavior: 'auto' });
                if (window.requestAnimationFrame) requestAnimationFrame(function () {
                    el.scrollIntoView({ block: 'start', behavior: 'auto' });
                });
                /* 顶部浮着返回条，往下让一点，别把卡片头顶压在条下面 */
                setTimeout(function () { window.scrollBy(0, -72); }, 40);
                el.classList.remove('sj-flash');
                void el.offsetWidth;
                el.classList.add('sj-flash');
                setTimeout(function () { el.classList.remove('sj-flash'); }, 3000);
                setTimeout(saveScroll, 120);   /* 落点定下来就记一次，免得刷新时读到上一次的旧位置 */
                setTimeout(unveil, 90);      /* 滚完再揭，揭开的瞬间位置已经对了 */
                if (onFound) onFound();
                return true;
            }
            if (n < 10) {
                setTimeout(function () { gotoCard(n + 1, onFail, onFound); }, 120);
                return false;
            }
            if (onFail) onFail();
            return false;
        }

        /* ---------- 启动：三档降级 ----------
           子页搜索是整串匹配，全站搜索那边是多词 AND，同一个「A B」填进子页往往一张不剩。
           直接清空会让人看到「列表先空一下再装满」，所以按下面顺序试：
             ① 整串原样   ② 拆开的单个词（最多两个）   ③ 清空，全量里定位
           只要有一档能定位就停，搜索框里始终留着一个搜得到的词，落地那一屏还是筛过的。 */
        function splitTerms(s) {
            var out = [];
            String(s || '').split(/[\s\u3000]+/).forEach(function (t) {
                t = t.trim();
                if (t && out.indexOf(t) === -1) out.push(t);
            });
            return out;
        }

        var tries = [];
        splitTerms(kw).forEach(function (t, i) {
            if (i === 0) tries.push(kw);
            if (tries.length < 3 && tries.indexOf(t) === -1) tries.push(t);
        });

        /* 降级到底仍看不到目标：先看数据源里有没有。
           有 → 只是被当前筛选挡住，临时放出并落到它身上；
           没有 → 才是真的删了或改了。 */
        function lastResort() {
            if (probeExists()) {
                revealAndLocate(function () { reallyLost(); });
                return;
            }
            reallyLost();
        }

        function reallyLost() {
            /* 答案册还有一条后路：直接改 hash，它自己的 locateFromHash 会接住 */
            if (ansMode && cid) { try { window.location.hash = cid; } catch (e) {} }
            unveil();
            tip(TIP_MISSING);
        }

        /* 最后一搏：把各下拉临时放回默认再定位。
           卡片常被「只看收藏」这类档位挡住，放下来就能看见；
           放下的档位属于搜索会话，叉掉浮动条时随快照一起还原 */
        function liftAndLocate() {
            var bar = document.getElementById('filterBar');
            var lifted = false;
            if (bar) {
                var sels = bar.querySelectorAll('select');
                for (var i = 0; i < sels.length; i++) {
                    var s = sels[i];
                    var d = s.options.length ? s.options[0].value : '';
                    if (s.value !== d) {
                        s.value = d;
                        lifted = true;
                        try { s.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
                    }
                }
            }
            if (!lifted) { lastResort(); return; }
            /* 程序放下的档位不写筛选记忆，等页面自己的防抖过去再恢复记录 */
            fmPause();
            fmResumeSoon(700);
            gotoCard(0, lastResort, function () {
                revealed = true;
                tip(TIP_BLOCKED);
            });
        }

        function clearAndLocate() {
            var inp = getInp();
            if (inp && inp.value) {
                fill('', function () { gotoCard(0, liftAndLocate); });
                return;
            }
            gotoCard(0, liftAndLocate);
        }

        function attempt(i) {
            if (i >= tries.length) {
                /* 目标在数据源里却一直没搜出来，是被筛选挡住了：
                   直接进放出流程，省掉「清词再找」「放下拉再找」两轮白等。
                   判据不存在（页面没提供 exists）时才退回逐档降级。 */
                if (probeExists()) { lastResort(); return; }
                clearAndLocate();
                return;
            }
            fill(tries[i], function (ok) {
                if (!ok) { attempt(i + 1); return; }
                gotoCard(0, function () { attempt(i + 1); });
            });
        }

        /* 刷新分支：把筛选重放一遍，然后回到翻到的位置，不弹回卡片。
           还得挑一个子页真能搜出东西的词 —— 多词整串往往一张不剩，列表空了就没位置可回。
           刷新前若靠临时放行才看到这张卡，那份放行是内存态，刷新即失效；
           这里补一次放出，否则一按 F5 卡就退回隐藏态、页面还留着 ?kw=&cid=。
           补放出只在目标确实被挡时做，放完后按原逻辑回到翻到的位置。 */
        function reloadReveal(done) {
            if (!cid || !probeExists()) { done(); return; }
            var el = null;
            if (ansMode) {
                el = document.getElementById(cid);
            } else {
                try { el = document.querySelector('.card-item[data-id="' + cssEsc(cid) + '"]'); } catch (e) {}
                if (el && (el.classList.contains('st-hide') ||
                           window.getComputedStyle(el).display === 'none')) el = null;
            }
            if (el) { done(); return; }   /* 没被挡住，刷新本就能看见，不动 */
            fmPause();
            var ok = false;
            if (ansMode) {
                ok = !!(window.KB && KB.Answers && KB.Answers.reveal &&
                        suppressedCall(function () { return KB.Answers.reveal(cid); }));
            } else {
                ok = !!(window.KB && KB.Page && KB.Page.reveal &&
                        suppressedCall(function () { return KB.Page.reveal(cid); }));
            }
            if (ok) { revealed = true; tip(TIP_BLOCKED); }
            done();
        }

        function attemptReload(i) {
            if (i >= tries.length) {
                var inp0 = getInp();
                if (inp0 && inp0.value) {
                    fill('', function () { reloadReveal(function () { restoreScroll(); unveil(); }); });
                    return;
                }
                reloadReveal(function () { restoreScroll(); unveil(); });
                return;
            }
            fill(tries[i], function (ok) {
                if (!ok) { attemptReload(i + 1); return; }
                var n = document.querySelectorAll(ansMode ? '.sr-item' : '.card-item').length;
                if (n > 0) { reloadReveal(function () { restoreScroll(); unveil(); }); }
                else attemptReload(i + 1);
            });
        }

        if (fromSite && !kw && !cid) {
            addBar(true);                    /* 真题答案册只带标记进来：只挂返回条 */
        } else {
            addBar();
            if (isReload && cid && savedY() > 0) {
                attemptReload(0);
            } else if (kw) {
                attempt(0);
            } else {
                gotoCard(0, lastResort);
            }
        }
    }

    /* 落点要在页面装配之后填词：内容数据走异步读盘，装配会推迟一拍，
       先填后装的话搜索框会被初始化冲掉。等存储就绪再走 boot。 */
    function start() {
        var S = window.KB && window.KB.Store;
        if (S && S.ready) S.ready().then(boot);
        else boot();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
