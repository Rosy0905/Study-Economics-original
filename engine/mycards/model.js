/* 我的卡片 · 数据层：卡片与章节的读写、归一化、排序、导入导出。
   独立模块，不碰 DOM、不认页面 id，
   生成器与转换脚本可以直接复用。存储统一走 KB.Store，键为
   {prefix}:{projectId}:cards:items / :chapters（无前缀旧键会自动迁移一次）。 */

(function (global) {
    'use strict';

    var KB = global.KB || (global.KB = {});

    var LEGACY_CARDS = 'custom_cards_v1';
    var LEGACY_CHAPTERS = 'custom_chapters_v2';
    var LEGACY_CHAPTERS_V1 = 'custom_chapters_v1';
    var UNCATEGORIZED = '未分类';
    var SUBJECTS = ['微观', '宏观'];

    /* 稳定的数组／对象引用：页面持有的是同一份，重载时原地改内容，不换引用 */
    var cards = [];
    var chaptersBySubject = { '微观': [], '宏观': [] };

    /* 分类由页面配置注入，原地替换数组与章节表，页面持有的引用不变 */
    function setSubjects(list) {
        if (!Array.isArray(list) || !list.length) return;
        var next = list.map(function (s) { return String(s).trim(); })
            .filter(function (s, i, a) { return s && a.indexOf(s) === i; });
        if (!next.length) return;
        SUBJECTS.length = 0;
        Array.prototype.push.apply(SUBJECTS, next);
        Object.keys(chaptersBySubject).forEach(function (k) { delete chaptersBySubject[k]; });
        SUBJECTS.forEach(function (s) { chaptersBySubject[s] = []; });
    }

    function normSubject(s) { return SUBJECTS.indexOf(s) >= 0 ? s : SUBJECTS[0]; }
    function chList(subject) {
        var s = normSubject(subject);
        if (!chaptersBySubject[s]) chaptersBySubject[s] = [];
        return chaptersBySubject[s];
    }
    function chapterTotal() { return chList('微观').length + chList('宏观').length; }
    function pushChapter(subject, name) {
        name = String(name || '').trim();
        if (!name || name === UNCATEGORIZED) return;
        var list = chList(subject);
        if (list.indexOf(name) < 0) list.push(name);
    }

    function safeText(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    /* 题目里的连续空行压成单换行，答案区是富文本、不动 */
    function cleanQ(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/\r\n?/g, '\n')
            .replace(/\n[ \t\u3000]*\n+/g, '\n')
            .trim();
    }
    function stripHtml(html) {
        var tmp = document.createElement('div');
        tmp.innerHTML = html || '';
        return tmp.textContent || tmp.innerText || '';
    }
    function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
    function chKey(c) {
        var n = (c && c.chapter ? c.chapter : '').trim();
        return n || UNCATEGORIZED;
    }

    /* 归一化一条卡：字段缺失补齐，正文不动 */
    function normalizeCard(c) {
        var o = Object.assign({}, c);
        if (SUBJECTS.indexOf(o.subject) < 0) o.subject = SUBJECTS[0];
        if (typeof o.chapter !== 'string') o.chapter = '';
        if (typeof o.qid !== 'string') o.qid = '';
        if (typeof o.hasImage !== 'boolean') o.hasImage = false;
        if (typeof o.fav !== 'boolean') o.fav = false;
        if (typeof o.created !== 'number') o.created = Date.now();
        if (!o.id) o.id = uid();
        o.question = cleanQ(o.question);
        return o;
    }

    function legacyRaw(key) {
        try {
            var raw = global.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (err) { return null; }
    }

    function readCardsFromStorage() {
        var parsed = KB.Store.get('cards', 'items', null);
        if (!Array.isArray(parsed)) parsed = legacyRaw(LEGACY_CARDS);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeCard);
    }

    function readChaptersFromStorage() {
        var pc = KB.Store.get('cards', 'chapters', null);
        if (pc && !Array.isArray(pc) && typeof pc === 'object') return pc;
        var old = legacyRaw(LEGACY_CHAPTERS);
        if (old && !Array.isArray(old) && typeof old === 'object') return old;
        return null;
    }

    /* 原地重载：页面持有的 cards 引用不变 */
    function reload() {
        var next = readCardsFromStorage();
        cards.length = 0;
        Array.prototype.push.apply(cards, next);
        return cards;
    }

    function loadChapters() {
        var got = false;
        var pc = readChaptersFromStorage();
        if (pc) {
            SUBJECTS.forEach(function (s) {
                if (Array.isArray(pc[s])) {
                    chaptersBySubject[s] = pc[s]
                        .filter(function (n) { return typeof n === 'string' && n.trim(); })
                        .map(function (n) { return n.trim(); });
                }
            });
            got = true;
        }

        /* 老结构是一整个数组、没有分类：按哪张卡在用定位归属 */
        var legacy = null;
        if (!got) {
            var p1 = legacyRaw(LEGACY_CHAPTERS_V1);
            if (Array.isArray(p1)) {
                legacy = p1.filter(function (n) { return typeof n === 'string' && n.trim(); })
                           .map(function (n) { return n.trim(); });
            }
        }
        if (legacy) {
            legacy.forEach(function (n) {
                var hit = cards.filter(function (c) { return (c.chapter || '').trim() === n; })[0];
                pushChapter(hit ? hit.subject : '微观', n);
            });
        }
        cards.forEach(function (c) { pushChapter(c.subject, c.chapter); });
        if (!got) persistChaptersOnly();
    }

    function normalizeChapters() {
        cards.forEach(function (c) { pushChapter(c.subject, c.chapter); });
    }

    /* 配额满时本页沿用原版措辞，保住「图片可能太大」的归因。
       通过可选参数注入，不改全站默认文案，其它页面不受影响。 */
    var QUOTA_MSG = '⚠️ 存储空间不足，图片可能太大了';
    var failTipAt = 0;
    var QUOTA_OPT = {
        quotaMsg: QUOTA_MSG,
        /* 同步返回 true 只代表已收下。异步落库两处都失败时补一句，
           不然页面照常显示新内容，刷新后整批没了 */
        onFail: function () {
            var now = Date.now();
            if (now - failTipAt < 5000) return;
            failTipAt = now;
            if (KB.UI && KB.UI.toast) {
                KB.UI.toast('⚠️ 这批改动没能存进本机，刷新会丢，请先导出备份');
            }
        }
    };
    function persist() {
        return KB.Store.set('cards', 'items', cards, QUOTA_OPT) &&
               KB.Store.set('cards', 'chapters', chaptersBySubject, QUOTA_OPT);
    }
    function persistChaptersOnly() {
        return KB.Store.set('cards', 'chapters', chaptersBySubject, QUOTA_OPT);
    }

    function clearAll() {
        cards.length = 0;
        SUBJECTS.forEach(function (s) { chaptersBySubject[s] = []; });
        KB.Store.remove('cards', 'items');
        KB.Store.remove('cards', 'chapters');
        KB.Store.remove('cards', 'filters');
        orderState = { mode: 'auto', seq: {} };
        KB.Store.remove('cards', 'order');
        /* 旧键也一并清掉，免得下次又被迁移回来 */
        [LEGACY_CARDS, LEGACY_CHAPTERS, LEGACY_CHAPTERS_V1].forEach(function (k) {
            try { global.localStorage.removeItem(k); } catch (err) {}
        });
    }

    /* ---- 排序：分类 → 章节顺序 → 题号自然序 → 创建时间 ----
       题号切片保留原始串，前导零参与比较；文本段先按字符类别
       分档（数字 → 拉丁字母 → 汉字 → 其它），同档再走中文拼音排序器。 */
    var LATIN_RE = null, HAN_RE = null;
    try {
        LATIN_RE = new RegExp('\\p{Script=Latin}', 'u');
        HAN_RE = new RegExp('\\p{Script=Han}', 'u');
    } catch (e) {}
    function charRank(ch) {
        if (ch >= '0' && ch <= '9') return '0';
        if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) return '1';
        if (LATIN_RE && LATIN_RE.test(ch)) return '1';
        var code = ch.charCodeAt(0);
        if (HAN_RE && HAN_RE.test(ch)) return '2';
        if (code >= 0x4e00 && code <= 0x9fff) return '2';
        return '3';
    }
    function rankKey(text) {
        var out = '';
        for (var i = 0; i < text.length; i++) out += charRank(text.charAt(i));
        return out;
    }
    /* 切成「纯数字段 / 纯非数字段」交替，原始串一个字符不丢 */
    function naturalKey(qid) { return String(qid).match(/(\d+|\D+)/g) || []; }
    var ZH_COLL = (global.Intl && global.Intl.Collator)
        ? new Intl.Collator('zh-Hans-CN', { numeric: false, sensitivity: 'base' }) : null;
    function textCmp(a, b) {
        a = String(a); b = String(b);
        var ra = rankKey(a), rb = rankKey(b);
        if (ra !== rb) return ra < rb ? -1 : 1;
        if (ZH_COLL) { var c = ZH_COLL.compare(a, b); if (c !== 0) return c; }
        return a < b ? -1 : (a > b ? 1 : 0);
    }
    function compareQid(a, b) {
        var ka = naturalKey(a.qid), kb = naturalKey(b.qid);
        var n = Math.min(ka.length, kb.length);
        for (var i = 0; i < n; i++) {
            var sa = ka[i], sb = kb[i];
            var na = /^\d+$/.test(sa), nb = /^\d+$/.test(sb);
            if (na && nb) {
                var va = parseInt(sa, 10), vb = parseInt(sb, 10);
                if (va !== vb) return va - vb;
                if (sa !== sb) return sa < sb ? -1 : 1;   /* 前导零参与：Q02 与 Q2 有确定先后 */
                continue;
            }
            if (sa !== sb) return textCmp(sa, sb);
        }
        return ka.length - kb.length;
    }
    function chapterIndex(card) {
        var list = chList(card.subject);
        var n = (card.chapter || '').trim();
        if (!n) return list.length + 1;
        var i = list.indexOf(n);
        return i < 0 ? list.length : i;
    }
    function subjectIndex(subject) {
        var i = SUBJECTS.indexOf(normSubject(subject));
        return i < 0 ? 0 : i;
    }
    function sortCards(list) {
        list.sort(function (a, b) {
            var sa = subjectIndex(a.subject), sb = subjectIndex(b.subject);
            if (sa !== sb) return sa - sb;
            var ca = chapterIndex(a), cb = chapterIndex(b);
            if (ca !== cb) return ca - cb;
            var aHas = !!(a.qid && a.qid.trim());
            var bHas = !!(b.qid && b.qid.trim());
            if (aHas && bHas) {
                var c = compareQid(a, b);
                if (c !== 0) return c;
                return (a.created || 0) - (b.created || 0);
            }
            if (aHas) return -1;
            if (bHas) return 1;
            return (a.created || 0) - (b.created || 0);
        });
        return list;
    }

    /* ---- 手动顺序：本机视图状态，按分组存 id 序列 ----
       顺序表首次以自动序为种子；之后只随拖动改变，自动序重排不回头改它。
       新卡按自动序找到前驱卡在表里的位置插到其后，找不到就放该组最前。 */
    var orderState = { mode: 'auto', seq: {} };
    function groupKeyOf(c) {
        return JSON.stringify([normSubject(c.subject), (c.chapter || '').trim()]);
    }
    function loadOrder() {
        var got = KB.Store.get('cards', 'order', null);
        orderState = { mode: 'auto', seq: {} };
        if (got && typeof got === 'object') {
            if (got.mode === 'manual') orderState.mode = 'manual';
            if (got.seq && typeof got.seq === 'object') {
                Object.keys(got.seq).forEach(function (k) {
                    if (Array.isArray(got.seq[k])) {
                        orderState.seq[k] = got.seq[k].filter(function (x) { return typeof x === 'string'; });
                    }
                });
            }
        }
    }
    function saveOrder() { return KB.Store.set('cards', 'order', orderState); }
    /* 重置：丢弃手动顺序，回到自动模式，并以当前自动序重新铺一遍顺序表 */
    function resetOrder() {
        orderState.seq = {};
        orderState.mode = 'auto';
        return syncOrder();
    }
    function orderMode() { return orderState.mode; }
    function setOrderMode(mode) {
        orderState.mode = (mode === 'manual') ? 'manual' : 'auto';
        syncOrder();
        return orderState.mode;
    }
    function orderSeq(k) { return orderState.seq[k] || []; }
    /* 容错补齐：删掉不存在的 id，新 id 按自动序插位，已有 id 的相对顺序一个不动 */
    function syncOrder() {
        var groups = Object.create(null);
        cards.forEach(function (c) {
            var k = groupKeyOf(c);
            (groups[k] || (groups[k] = [])).push(c);
        });
        Object.keys(groups).forEach(function (k) {
            var auto = sortCards(groups[k].slice()).map(function (c) { return c.id; });
            var alive = Object.create(null);
            groups[k].forEach(function (c) { alive[c.id] = 1; });
            var seq = (orderState.seq[k] || []).filter(function (id) { return alive[id]; });
            auto.forEach(function (id) {
                if (seq.indexOf(id) >= 0) return;
                var at = auto.indexOf(id), anchor = -1;
                for (var i = at - 1; i >= 0; i--) {
                    var found = seq.indexOf(auto[i]);
                    if (found >= 0) { anchor = found; break; }
                }
                if (anchor < 0) seq.unshift(id); else seq.splice(anchor + 1, 0, id);
            });
            orderState.seq[k] = seq;
        });
        Object.keys(orderState.seq).forEach(function (k) { if (!groups[k]) delete orderState.seq[k]; });
        return saveOrder();
    }
    /* 拖拽落位：只让当前可见的卡在全量序列占的那几个坑位里互换，隐藏卡原地不动 */
    function applyVisibleOrder(k, visibleIds) {
        var seq = orderState.seq[k] || [];
        var vis = Object.create(null);
        visibleIds.forEach(function (id) { vis[id] = 1; });
        var slots = [];
        seq.forEach(function (id, i) { if (vis[id]) slots.push(i); });
        slots.forEach(function (pos, i) { if (visibleIds[i]) seq[pos] = visibleIds[i]; });
        orderState.seq[k] = seq;
        return saveOrder();
    }
    function orderSort(list) {
        var pos = Object.create(null);
        Object.keys(orderState.seq).forEach(function (k) {
            orderState.seq[k].forEach(function (id, i) { pos[id] = i; });
        });
        return list.sort(function (a, b) {
            var sa = subjectIndex(a.subject), sb = subjectIndex(b.subject);
            if (sa !== sb) return sa - sb;
            var ca = chapterIndex(a), cb = chapterIndex(b);
            if (ca !== cb) return ca - cb;
            var pa = pos[a.id] === undefined ? 1e9 : pos[a.id];
            var pb = pos[b.id] === undefined ? 1e9 : pos[b.id];
            return pa - pb;
        });
    }

    /* ---- 备份 JSON：v3 形状，blobs 与整站备份同一格式 ---- */
    function buildBackup(picked, blobs) {
        var chapters = {};
        SUBJECTS.forEach(function (s) { chapters[s] = chList(s).slice(); });
        return {
            app: 'my-cards',
            version: 3,
            exportedAt: new Date().toISOString(),
            chapters: chapters,
            cards: sortCards(picked.slice()),
            blobs: blobs || []
        };
    }
    function parseBackup(text) {
        var data = JSON.parse(text);
        var list, chapters = null, legacyChapters = null;
        if (Array.isArray(data)) {
            list = data;
        } else if (data && Array.isArray(data.cards)) {
            list = data.cards;
            if (data.chapters && !Array.isArray(data.chapters) && typeof data.chapters === 'object') {
                chapters = data.chapters;
            } else if (Array.isArray(data.chapters)) {
                legacyChapters = data.chapters;
            }
        } else {
            throw new Error('bad format');
        }
        return { list: list, chapters: chapters, legacyChapters: legacyChapters };
    }

    function init(opts) {
        var o = opts || {};
        setSubjects(o.subjects);
        KB.Store.configure({
            prefix: o.storagePrefix || 'kb',
            projectId: o.projectId || 'demo'
        });
        reload();
        loadChapters();
        loadOrder();
        syncOrder();
    }

    KB.MyCardsModel = {
        /* 稳定引用，页面直接持有 */
        cards: cards,
        chapters: chaptersBySubject,
        SUBJECTS: SUBJECTS,
        UNCATEGORIZED: UNCATEGORIZED,
        LEGACY_CARDS: LEGACY_CARDS,
        LEGACY_CHAPTERS: LEGACY_CHAPTERS,
        LEGACY_CHAPTERS_V1: LEGACY_CHAPTERS_V1,

        init: init,
        reload: reload,
        clearAll: clearAll,
        readCardsFromStorage: readCardsFromStorage,
        normalizeChapters: normalizeChapters,
        persist: persist,
        persistChaptersOnly: persistChaptersOnly,

        normSubject: normSubject,
        chList: chList,
        chapterTotal: chapterTotal,
        pushChapter: pushChapter,
        safeText: safeText,
        cleanQ: cleanQ,
        stripHtml: stripHtml,
        uid: uid,
        chKey: chKey,
        normalizeCard: normalizeCard,
        naturalKey: naturalKey,
        compareQid: compareQid,
        chapterIndex: chapterIndex,
        subjectIndex: subjectIndex,
        sortCards: sortCards,
        groupKeyOf: groupKeyOf,
        orderMode: orderMode,
        setOrderMode: setOrderMode,
        resetOrder: resetOrder,
        orderSeq: orderSeq,
        syncOrder: syncOrder,
        applyVisibleOrder: applyVisibleOrder,
        orderSort: orderSort,
        buildBackup: buildBackup,
        parseBackup: parseBackup
    };
})(window);
