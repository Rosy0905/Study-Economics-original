(function (global) {
    'use strict';

    var KB = global.KB || (global.KB = {});
    var C = KB.Editor;
    var escHtml = C.escapeHtml;
    var inlineMd = C.inlineMd;
    var isTableRow = C.isTableRow;
    var isTableSep = C.isTableSep;
    var splitRow = C.splitRow;
    var M = KB.MyCardsModel;

    /* 数据层抽到 model.js：这里持有同一份数组／对象引用，重载时原地改内容 */
    var cards = M.cards;
    var chaptersBySubject = M.chapters;
    var SUBJECTS = M.SUBJECTS;
    var UNCATEGORIZED = M.UNCATEGORIZED;
    var STORAGE_KEY = M.LEGACY_CARDS;
    var CHAPTER_KEY = M.LEGACY_CHAPTERS;
    var CHAPTER_KEY_V1 = M.LEGACY_CHAPTERS_V1;
    var normSubject = M.normSubject;
    var chList = M.chList;
    var chapterTotal = M.chapterTotal;
    var pushChapter = M.pushChapter;
    var safeText = M.safeText;
    var cleanQ = M.cleanQ;
    var stripHtml = M.stripHtml;
    var uid = M.uid;
    var chKey = M.chKey;
    var naturalKey = M.naturalKey;
    var compareQid = M.compareQid;
    var chapterIndex = M.chapterIndex;
    var subjectIndex = M.subjectIndex;
    var sortCards = M.sortCards;
    var readCardsFromStorage = M.readCardsFromStorage;
    var normalizeChapters = M.normalizeChapters;
    var persist = M.persist;
    var persistChaptersOnly = M.persistChaptersOnly;
    function showToast(msg) { KB.UI.toast(msg); }


    /* ============================================================
       DOM 引用
       ============================================================ */
    var grid = document.getElementById('cardGrid');
    var totalSpan = document.getElementById('totalCards');
    var favSpan = document.getElementById('favCount');
    var filterChapter = document.getElementById('filterChapter');
    var filterFav = document.getElementById('filterFav');
    var filterSearch = document.getElementById('filterSearch');
    var clearFilterBtn = document.getElementById('clearFilterBtn');
    var mcSearchClear = document.getElementById('mcSearchClear');
    function toggleMcClear() {
      if (mcSearchClear) mcSearchClear.classList.toggle('show', !!filterSearch.value);
    }
    var addCardBtn = document.getElementById('addCardBtn');
    var expandAllBtn = document.getElementById('expandAllBtn');
    var exportBtn = document.getElementById('exportBtn');
    var importBtn = document.getElementById('importBtn');
    var importFile = document.getElementById('importFile');
    var toastEl = document.getElementById('toast');
    var clearDataBtn = document.getElementById('clearDataBtn');
    var sortModeBtn = document.getElementById('sortModeBtn');
    var ioWrap = document.getElementById('ioWrap');
    var ioBtn = document.getElementById('ioBtn');

    /* 板块串连导航：返回键右侧的序号圆钮，清单从主页模块派生 */
    if (KB.SectionNav) {
        KB.SectionNav.mount({
            project: window.PROJECT_CONFIG || {},
            host: document.querySelector('.header-left'),
            after: document.querySelector('.back-home'),
            current: 'my-cards'
        });
    }

    var editorOverlay = document.getElementById('editorOverlay');
    var modalTitle = document.getElementById('modalTitle');
    var subjectSelect = document.getElementById('subjectSelect');
    var chapterField = document.getElementById('chapterField');
    var chapterTrigger = document.getElementById('chapterTrigger');
    var chapterTriggerText = document.getElementById('chapterTriggerText');
    var chapterPop = document.getElementById('chapterPop');
    var chapterPopList = document.getElementById('chapterPopList');
    var chScope = document.getElementById('chScope');
    var chScopeName = document.getElementById('chScopeName');
    var chapterNameInput = document.getElementById('chapterNameInput');
    var chapterAddIcon = document.getElementById('chapterAddIcon');
    var chapterNewBtn = document.getElementById('chapterNewBtn');
    var chNewInputWrap = document.getElementById('chNewInputWrap');
    var indexInput = document.getElementById('indexInput');
    var hasImgToggle = document.getElementById('hasImgToggle');
    var hasImgInput = document.getElementById('hasImgInput');
    var questionInput = document.getElementById('questionInput');
    var answerEditor = document.getElementById('answerEditor');
    var closeModalBtn = document.getElementById('closeModalBtn');
    var cancelBtn = document.getElementById('cancelBtn');
    var saveBtn = document.getElementById('saveBtn');
    var editorTools = editorOverlay.querySelector('.editor-tools');
    var insertImgBtn = document.getElementById('insertImgBtn');
    var insertTableBtn = document.getElementById('insertTableBtn');
    var insertInlineFormulaBtn = document.getElementById('insertInlineFormulaBtn');
    var insertBlockFormulaBtn = document.getElementById('insertBlockFormulaBtn');
    var clearAnswerBtn = document.getElementById('clearAnswerBtn');
    var clearFmtBtn = document.getElementById('clearFmtBtn');
    var imgCtlHost = document.getElementById('imgCtlHost');

    /* 图片大图预览浮层 */
    var imgViewer = document.getElementById('imgViewer');
    var imgViewerImg = document.getElementById('imgViewerImg');
    var imgViewerVal = document.getElementById('imgViewerVal');
    var imgViewerIn = document.getElementById('imgViewerIn');
    var imgViewerOut = document.getElementById('imgViewerOut');
    var imgViewerFit = document.getElementById('imgViewerFit');
    var imgViewerOne = document.getElementById('imgViewerOne');
    var imgViewerClose = document.getElementById('imgViewerClose');

    /* 记住上次使用的分类与该分类下最近使用的章节，新建卡片时自动带上，减少重复选择 */
    var lastSubject = '微观';
    var lastChapterBySubject = { '微观': '', '宏观': '' };

    var tableOverlay = document.getElementById('tableOverlay');
    var tableRows = document.getElementById('tableRows');
    var tableCols = document.getElementById('tableCols');
    var tableOkBtn = document.getElementById('tableOkBtn');
    var tableCancelBtn = document.getElementById('tableCancelBtn');

    var confirmOverlay = document.getElementById('confirmOverlay');
    var confirmTitle = document.getElementById('confirmTitle');
    var confirmMsg = document.getElementById('confirmMsg');
    var confirmOkBtn = document.getElementById('confirmOkBtn');
    var confirmCancelBtn = document.getElementById('confirmCancelBtn');

    var clearChoiceOverlay = document.getElementById('clearChoiceOverlay');
    var clearChoiceSub = document.getElementById('clearChoiceSub');
    var clearChoiceCancelBtn = document.getElementById('clearChoiceCancelBtn');

    var clearOverlay = document.getElementById('clearOverlay');
    var clearMsg = document.getElementById('clearMsg');
    var clearCancelBtn = document.getElementById('clearCancelBtn');
    var clearOkBtn = document.getElementById('clearOkBtn');

    var exportOverlay = document.getElementById('exportOverlay');
    var exportList = document.getElementById('exportList');
    var exportPanelTitle = document.getElementById('exportPanelTitle');
    var exportFilterChapter = document.getElementById('exportFilterChapter');
    var exportFilterFav = document.getElementById('exportFilterFav');
    var exportCount = document.getElementById('exportCount');
    var closeExportBtn = document.getElementById('closeExportBtn');
    var exportCancelBtn = document.getElementById('exportCancelBtn');
    var exportConfirmBtn = document.getElementById('exportConfirmBtn');
    var exportSelectAllBtn = document.getElementById('exportSelectAll');
    var exportSelectNoneBtn = document.getElementById('exportSelectNone');
    var exportSelectInvertBtn = document.getElementById('exportSelectInvert');

    /* 从 AI 对话导入 */
    var aiImportBtn = document.getElementById('aiImportBtn');
    var aiImpOverlay = document.getElementById('aiImpOverlay');
    var aiImpList = document.getElementById('aiImpList');
    var aiImpCount = document.getElementById('aiImpCount');
    var aiImpSubject = document.getElementById('aiImpSubject');
    var aiImpChapter = document.getElementById('aiImpChapter');
    var aiImpSelectAllBtn = document.getElementById('aiImpSelectAll');
    var aiImpSelectNoneBtn = document.getElementById('aiImpSelectNone');
    var closeAiImpBtn = document.getElementById('closeAiImpBtn');
    var aiImpCancelBtn = document.getElementById('aiImpCancelBtn');
    var aiImpConfirmBtn = document.getElementById('aiImpConfirmBtn');

    var editingId = null;
    var pickSelected = new Set();
    var pickMode = 'export';          // export | delete，勾选列表由导出与部分删除共用
    var confirmAction = null;
    var openIds = new Set();
    var savedRange = null;
    var toastTimer = null;
    var renamingName = null;
    var editorChapter = '';   // 编辑弹层里当前选中的章节
    var aiImpPairs = [];      // [{q, a}] 从 AI 对话里配好的一问一答
    var aiImpPicked = new Set();

    /* ============================================================
       工具
       ============================================================ */
    function lockBody(on) { document.body.style.overflow = on ? 'hidden' : ''; }
    function anyOverlayOpen() {
        return editorOverlay.classList.contains('show') ||
               tableOverlay.classList.contains('show') ||
               confirmOverlay.classList.contains('show') ||
               clearOverlay.classList.contains('show') ||
               clearChoiceOverlay.classList.contains('show') ||
               aiImpOverlay.classList.contains('show') ||
               exportOverlay.classList.contains('show') ||
               imgViewer.classList.contains('show');
    }

    /* ============================================================
       KaTeX：把 $…$ / $$…$$ 渲染成公式（不用 auto-render，纯本地）
       ============================================================ */
    function renderMathIn(root) {
        if (!root || !window.katex) return;
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var targets = [], n;
        while ((n = walker.nextNode())) {
            var p = n.parentNode;
            if (!p) continue;
            var tag = p.nodeName;
            if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'PRE' || tag === 'CODE') continue;
            if (p.closest && p.closest('.katex')) continue;
            if (n.nodeValue.indexOf('$') < 0) continue;
            targets.push(n);
        }
        targets.forEach(function (node) {
            var text = node.nodeValue;
            var re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
            if (!re.test(text)) return;
            re.lastIndex = 0;
            var frag = document.createDocumentFragment();
            var last = 0, m;
            while ((m = re.exec(text))) {
                if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
                var src = (m[1] !== undefined) ? m[1] : m[2];
                var span = document.createElement('span');
                span.className = 'katex-host';
                try {
                    span.innerHTML = window.katex.renderToString(src, {
                        displayMode: (m[1] !== undefined),
                        throwOnError: false
                    });
                } catch (e) { span.textContent = m[0]; }
                frag.appendChild(span);
                last = m.index + m[0].length;
            }
            if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
            if (node.parentNode) node.parentNode.replaceChild(frag, node);
        });
    }
    window.__renderMath = function () { renderMathIn(grid); };

    /* ============================================================
       章节相关（章节归属于分类，微观建的章节不出现在宏观里）
       ============================================================ */
    /* 下拉框的 option value：用 JSON 存 [分类, 章节名]。
       注意不能用 \u0000 之类做分隔符 —— HTML 解析属性时会把 NUL 换成 U+FFFD，value 就对不上了。 */
    function chFilterValue(subject, name) { return JSON.stringify([normSubject(subject), name]); }
    function parseChFilter(v) {
        /* __grp__ 前缀表示分类组标题，选中即该分类全部章节；映射成带 subject 与空章节名的对象，供新建卡片与 AI 导入的默认分类复用 */
        if (typeof v === 'string' && v.indexOf('__grp__') === 0) {
            var gs = v.slice(7);
            return SUBJECTS.indexOf(gs) >= 0 ? { subject: gs, name: '' } : null;
        }
        /* __unch__ 前缀表示该分类下没选章节的卡片；与组标题（整类）区分开 */
        if (typeof v === 'string' && v.indexOf('__unch__') === 0) {
            var us = v.slice(8);
            return SUBJECTS.indexOf(us) >= 0 ? { subject: us, name: '', unch: true } : null;
        }
        try {
            var a = JSON.parse(v);
            return (Array.isArray(a) && a.length === 2) ? { subject: a[0], name: a[1] } : null;
        } catch (e) { return null; }
    }

    function chapterCount(name, subject) {
        var s = normSubject(subject);
        var n = String(name || '').trim();
        return cards.filter(function (c) {
            return normSubject(c.subject) === s && (c.chapter || '').trim() === n;
        }).length;
    }

    function updateChapterFilterOptions() {
        var prev = filterChapter.value;
        /* 章节下拉的组标题做成可点 option，选中即该分类全部章节，成员项用全角空格缩进；optgroup 不可选中，故不用 */
        var html = '<option value="all">全部</option>';
        SUBJECTS.forEach(function (s) {
            var list = chList(s);
            var unch = cards.filter(function (c) {
                return normSubject(c.subject) === s && !(c.chapter || '').trim();
            }).length;
            /* 分类只要有章节或没选章节的卡片就留组标题，避免空分类占位 */
            if (!list.length && !unch) return;
            html += '<option value="__grp__' + safeText(s) + '" style="font-weight:600;">' + safeText(s) + '</option>';
            list.forEach(function (ch) {
                html += '<option value="' + safeText(chFilterValue(s, ch)) + '">　　' + safeText(ch) + '</option>';
            });
            /* 未选章节排在该分类具名章节之后，与卡片列表的分组顺序一致 */
            if (unch) {
                html += '<option value="__unch__' + safeText(s) + '">　　未选章节</option>';
            }
        });
        filterChapter.innerHTML = html;
        var found = false;
        for (var i = 0; i < filterChapter.options.length; i++) {
            if (filterChapter.options[i].value === prev) { found = true; break; }
        }
        filterChapter.value = found ? prev : 'all';
    }

    /* 章节选择在编辑器里的章节选择器完成，列表页不设章节下拉 */

    function addChapter(name, subject, opts) {
        name = String(name || '').trim();
        if (!name) return null;
        if (name === UNCATEGORIZED) { showToast('⚠️ 这个名称被系统占用了，换一个吧'); return null; }
        var list = chList(subject);
        if (list.indexOf(name) >= 0) {
            if (!opts || !opts.silent) showToast('这个章节已经存在啦');
            return name;
        }
        list.push(name);
        persistChaptersOnly();
        updateChapterFilterOptions();
        if (!opts || !opts.noRender) render();
        return name;
    }

    function renameChapter(subject, oldName, newName) {
        var s = normSubject(subject);
        var list = chList(s);
        newName = String(newName || '').trim();
        if (!newName) { showToast('⚠️ 章节名不能为空'); return false; }
        if (newName === oldName) return true;
        if (newName === UNCATEGORIZED) { showToast('⚠️ 这个名称被系统占用了，换一个吧'); return false; }
        if (list.indexOf(newName) >= 0) { showToast('⚠️ 已有同名章节'); return false; }
        var i = list.indexOf(oldName);
        if (i < 0) return false;
        list[i] = newName;
        cards.forEach(function (c) {
            if (normSubject(c.subject) === s && (c.chapter || '').trim() === oldName) c.chapter = newName;
        });
        persist();
        updateChapterFilterOptions();
        if (filterChapter.value === chFilterValue(s, oldName)) filterChapter.value = chFilterValue(s, newName);
        render();
        return true;
    }

    function deleteChapter(subject, name) {
        var s = normSubject(subject);
        var list = chList(s);
        var i = list.indexOf(name);
        if (i < 0) return;
        list.splice(i, 1);
        cards.forEach(function (c) {
            if (normSubject(c.subject) === s && (c.chapter || '').trim() === name) c.chapter = '';
        });
        persist();
        updateChapterFilterOptions();
        if (filterChapter.value === chFilterValue(s, name)) filterChapter.value = 'all';
        render();
    }

    /* 章节顺序在编辑卡片里直接拖动，不设独立管理弹层 */
    function applyChapterOrder(subject, fromName, beforeName) {
        var list = chList(subject);
        var from = list.indexOf(fromName);
        if (from < 0) return false;
        if (beforeName === fromName) return false;
        var names = list.slice();
        names.splice(from, 1);
        var to = beforeName ? names.indexOf(beforeName) : -1;
        if (to < 0) to = names.length;
        names.splice(to, 0, fromName);
        if (names.join('\u0000') === list.join('\u0000')) return false;
        chaptersBySubject[normSubject(subject)] = names;
        persistChaptersOnly();
        updateChapterFilterOptions();
        renderChapterPop();
        render();
        return true;
    }

    /* ============================================================
       章节选择器（编辑器内）：点选 · ＋新建 · 拖动排序 · 重命名 / 删除
       ============================================================ */
    function isChapterPopOpen() { return chapterPop.classList.contains('show'); }

    /* 「新建章节」那一行：默认只是个按钮，点开才变成 输入框 + 确认 */
    function inNewChapterMode() { return !chNewInputWrap.hidden; }
    function enterNewChapterMode() {
        chapterNewBtn.hidden = true;
        chNewInputWrap.hidden = false;
        chapterNameInput.value = '';
        chapterAddIcon.disabled = true;
        renderChapterPop();   /* 列表里的行此刻起不可拖动 */
        setTimeout(function () { chapterNameInput.focus(); }, 30);
    }
    function exitNewChapterMode() {
        var was = !chNewInputWrap.hidden;
        chNewInputWrap.hidden = true;
        chapterNewBtn.hidden = false;
        chapterNameInput.value = '';
        if (was) renderChapterPop();
    }

    function openChapterPop() {
        renamingName = null;
        exitNewChapterMode();
        chapterPop.classList.add('show');
        renderChapterPop();
    }
    function closeChapterPop() {
        renamingName = null;
        exitNewChapterMode();
        chapterPop.classList.remove('show');
    }
    /* 新建模式下不拖动（怕误触），其余时候随时可拖 */
    function canDragChapters() { return !inNewChapterMode(); }

    /* 编辑弹层里当前选中的分类（章节归属它） */
    function editorSubject() { return normSubject(subjectSelect.value); }

    function renderChapterPop() {
        var s = editorSubject();
        var list = chList(s);

        chScopeName.textContent = s;
        chScope.classList.toggle('macro', s === '宏观');

        var html = '';

        html += '<div class="ch-item' + (editorChapter ? '' : ' selected') + '" data-name="">' +
                    '<span class="ch-grip ghost">\u283f</span>' +
                    '<span class="ch-box">' + (editorChapter ? '' : '\u2713') + '</span>' +
                    '<span class="ch-item-name empty-name">不选章节</span>' +
                '</div>';

        list.forEach(function (ch) {
            if (renamingName === ch) {
                html += '<div class="ch-item editing" data-name="' + safeText(ch) + '">' +
                            '<span class="ch-grip ghost">\u283f</span>' +
                            '<input type="text" class="ch-rename" id="chRenameInput" value="' + safeText(ch) + '" maxlength="60">' +
                            '<button type="button" class="ch-mini ok" data-act="rename-ok" data-name="' + safeText(ch) + '">保存</button>' +
                        '</div>';
                return;
            }
            var on = editorChapter === ch;
            html += '<div class="ch-item' + (on ? ' selected' : '') + '"' +
                        (canDragChapters() ? ' draggable="true"' : '') +
                        ' data-name="' + safeText(ch) + '">' +
                        '<span class="ch-grip" title="按住拖动排序">\u283f</span>' +
                        '<span class="ch-box">' + (on ? '\u2713' : '') + '</span>' +
                        '<span class="ch-item-name">' + safeText(ch) + '</span>' +
                        '<span class="ch-item-count">' + chapterCount(ch, s) + ' 张</span>' +
                        '<button type="button" class="ch-mini" data-act="rename" data-name="' + safeText(ch) + '" title="重命名">✏️</button>' +
                        '<button type="button" class="ch-mini del" data-act="del" data-name="' + safeText(ch) + '" title="删除章节">🗑️</button>' +
                    '</div>';
        });

        if (list.length === 0) {
            html += '<div class="ch-empty">「' + safeText(s) + '」还没有章节<br>点下面的「＋ 新建章节」加一个</div>';
        }
        chapterPopList.innerHTML = html;
        updateChapterAddIcon();

        if (renamingName !== null) {
            var inp = document.getElementById('chRenameInput');
            if (inp) { inp.focus(); inp.select(); }
        }
    }

    function updateChapterAddIcon() {
        chapterAddIcon.disabled = !chapterNameInput.value.trim();
    }

    function setEditorChapter(name) {
        editorChapter = (name || '').trim();
        renderChapterTrigger();
    }
    function renderChapterTrigger() {
        chapterTriggerText.textContent = editorChapter || '选择章节';
        chapterTriggerText.classList.toggle('empty', !editorChapter);
    }

    function pickChapter(name) {
        setEditorChapter(name);
        closeChapterPop();
    }

    function submitChapterName() {
        var v = chapterNameInput.value.trim();
        if (!v) { showToast('⚠️ 请先输入章节名'); chapterNameInput.focus(); return; }
        var s = editorSubject();
        if (chList(s).indexOf(v) >= 0) { pickChapter(v); return; }
        var name = addChapter(v, s);
        if (name) {
            pickChapter(name);
            showToast('✅ 已在「' + s + '」下新建章节「' + name + '」');
        }
    }

    /* 切换分类时章节表跟着换；原选章节不属于新分类就清空 */
    subjectSelect.addEventListener('change', function () {
        var s = editorSubject();
        if (editorChapter && chList(s).indexOf(editorChapter) < 0) {
            editorChapter = '';
            renderChapterTrigger();
        }
        if (isChapterPopOpen()) renderChapterPop();
    });

    chapterTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        if (isChapterPopOpen()) closeChapterPop(); else openChapterPop();
    });
    document.addEventListener('click', function (e) {
        if (!isChapterPopOpen()) return;
        if (chapterField.contains(e.target)) return;
        closeChapterPop();
    });

    chapterNameInput.addEventListener('input', updateChapterAddIcon);
    chapterNameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submitChapterName(); return; }
        /* 新建模式下 Esc 收掉那一行；否则关掉整个浮层 */
        if (e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation();
            if (inNewChapterMode()) exitNewChapterMode(); else closeChapterPop();
        }
    });
    chapterNewBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        enterNewChapterMode();
    });
    chapterAddIcon.addEventListener('click', function (e) {
        e.stopPropagation();
        submitChapterName();
    });

    chapterPopList.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;

        var btn = t.closest('.ch-mini');
        if (btn) {
            e.stopPropagation();
            var act = btn.dataset.act;
            var name = btn.dataset.name;
            if (act === 'rename') { renamingName = name; renderChapterPop(); return; }
            if (act === 'rename-ok') {
                var inp = document.getElementById('chRenameInput');
                var v = inp ? inp.value : '';
                if (renameChapter(editorSubject(), name, v)) { renamingName = null; renderChapterPop(); showToast('✅ 章节已重命名'); }
                return;
            }
            if (act === 'del') {
                var cnt = chapterCount(name, editorSubject());
                openConfirm({
                    title: '删除章节',
                    msg: '删除「' + name + '」？\n' + (cnt ? '该章节下的 ' + cnt + ' 张卡片会变成没选章节的状态，卡片不会被删除。' : '该章节下目前没有卡片。'),
                    okText: '删除',
                    danger: true,
                    onOk: function () {
                        deleteChapter(editorSubject(), name);
                        renamingName = null;
                        renderChapterPop();
                        showToast('🗑️ 章节已删除');
                    }
                });
                return;
            }
            return;
        }

        var item = t.closest('.ch-item');
        if (!item) return;
        if (t.tagName === 'INPUT') return;
        e.stopPropagation();
        pickChapter(item.dataset.name || '');
    });

    chapterPopList.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var inp = e.target.closest ? e.target.closest('.ch-rename') : null;
        if (!inp) return;
        e.preventDefault();
        var row = inp.closest('.ch-item');
        var name = row ? row.dataset.name : null;
        if (name && renameChapter(editorSubject(), name, inp.value)) {
            renamingName = null;
            renderChapterPop();
            showToast('✅ 章节已重命名');
        }
    });

    /* ---- 拖动排序（HTML5 拖放，松手即生效） ---- */
    var dragName = null;
    function clearDropMarks() {
        chapterPopList.querySelectorAll('.ch-item').forEach(function (el) {
            el.classList.remove('drop-before', 'drop-after');
        });
    }
    function chapterPopItems() {
        return Array.prototype.filter.call(
            chapterPopList.querySelectorAll('.ch-item'),
            function (el) { return !!el.dataset.name; }
        );
    }
    chapterPopList.addEventListener('dragstart', function (e) {
        var item = e.target.closest ? e.target.closest('.ch-item') : null;
        if (!item || !item.dataset.name || !canDragChapters()) { e.preventDefault(); return; }
        dragName = item.dataset.name;
        item.classList.add('dragging');
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragName); } catch (x) {}
    });
    chapterPopList.addEventListener('dragover', function (e) {
        if (!dragName) return;
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'move'; } catch (x) {}
        var items = chapterPopItems();
        clearDropMarks();
        if (!items.length) return;
        var mark = null;
        for (var i = 0; i < items.length; i++) {
            var r = items[i].getBoundingClientRect();
            if (e.clientY < r.top + r.height / 2) { mark = items[i]; break; }
        }
        if (mark) mark.classList.add('drop-before');
        else items[items.length - 1].classList.add('drop-after');
    });
    chapterPopList.addEventListener('drop', function (e) {
        if (!dragName) return;
        e.preventDefault();
        var items = chapterPopItems();
        var before = null;
        for (var i = 0; i < items.length; i++) {
            var r = items[i].getBoundingClientRect();
            if (e.clientY < r.top + r.height / 2) { before = items[i].dataset.name; break; }
        }
        var moved = dragName;
        dragName = null;
        clearDropMarks();
        if (before === moved) return;
        if (applyChapterOrder(editorSubject(), moved, before)) showToast('↕️ 章节顺序已更新');
    });
    chapterPopList.addEventListener('dragend', function () {
        dragName = null;
        clearDropMarks();
        chapterPopList.querySelectorAll('.ch-item').forEach(function (el) { el.classList.remove('dragging'); });
    });

    /* ============================================================
       筛选 + 渲染
       ============================================================ */
    function cardsMatching(chVal, favVal, kw) {
        /* 章节下拉的组标题 __grp__ 表示该分类全部章节，具体章节值用 JSON 带分类 */
        var chPick = (chVal === 'all') ? null : parseChFilter(chVal);
        return cards.filter(function (c) {
            if (chPick) {
                if (normSubject(c.subject) !== chPick.subject) return false;
                if (chPick.unch) {
                    if ((c.chapter || '').trim()) return false;                              // 只要没选章节的
                } else if (chPick.name && (c.chapter || '').trim() !== chPick.name) return false;   // name 为空 = 整类
            }
            if (favVal === 'fav' && !c.fav) return false;
            if (kw) {
                var q = (c.question || '').toLowerCase();
                var a = stripHtml(c.answerHtml || '').toLowerCase();
                var ch = (c.chapter || '').toLowerCase();
                var qid = (c.qid || '').toLowerCase();
                if (q.indexOf(kw) < 0 && a.indexOf(kw) < 0 &&
                    ch.indexOf(kw) < 0 && qid.indexOf(kw) < 0) return false;
            }
            return true;
        });
    }

    function getFilteredCards() {
        var filtered = cardsMatching(filterChapter.value, filterFav.value,
                                     filterSearch.value.trim().toLowerCase());
        return M.orderMode() === 'manual' ? M.orderSort(filtered) : sortCards(filtered);
    }

    function cardHTML(c) {
        var hasAnswerContent =
            (c.answerHtml && c.answerHtml.replace(/<[^>]*>/g, '').trim()) ||
            (c.answerHtml && c.answerHtml.indexOf('<img') >= 0);
        var answerHtml = hasAnswerContent
            ? c.answerHtml
            : '<p class="card-empty-hint">（暂无答案）</p>';

        var subj = normSubject(c.subject);
        var chName = (c.chapter || '').trim();
        /* 分类与章节合成一枚标签（微观 · 需求） */
        var tagText = chName ? (subj + ' · ' + chName) : subj;
        var subjectHtml = '<span class="tag subj ' + (subj === '宏观' ? 'macro' : 'micro') + '">' +
                          safeText(tagText) + '</span>';
        var qidHtml = c.qid ? '<span class="qid">' + safeText(c.qid) + '</span>' : '';
        var hasImgHtml = c.hasImage ? '<span class="has-img">📐 有图示</span>' : '';
        var isOpen = openIds.has(c.id);

        var dragOn = M.orderMode() === 'manual' && canDragNow();
        return '' +
        '<div class="card-item' + (c.fav ? ' favorited' : '') + '" data-id="' + safeText(c.id) +
            '" data-group="' + safeText(M.groupKeyOf(c)) + '"' +
            (dragOn ? ' draggable="true"' : '') + '>' +
            '<div class="card-header">' +
                '<div class="label">' + subjectHtml + ' ' + qidHtml + ' ' + hasImgHtml + '</div>' +
                '<div class="card-actions">' +
                    '<button class="btn-fav' + (c.fav ? ' active' : '') + '" data-id="' + safeText(c.id) + '" title="' + (c.fav ? '取消收藏' : '收藏') + '">' +
                        (c.fav ? '⭐' : '☆') +
                    '</button>' +
                    '<button class="btn-edit" data-id="' + safeText(c.id) + '" title="编辑">✏️</button>' +
                    '<button class="btn-del"  data-id="' + safeText(c.id) + '" title="删除">🗑️</button>' +
                '</div>' +
            '</div>' +
            '<div class="card-question" data-id="' + safeText(c.id) + '">' +
                (c.question
                    ? '<span class="q-text">' + safeText(c.question) + '</span>'
                    : '<span class="q-text card-empty-hint">（题目未输入）</span>') +
                '<span class="toggle-hint">(点击展开答案)</span>' +
            '</div>' +
            '<div class="card-answer' + (isOpen ? ' open' : '') + '" data-id="' + safeText(c.id) + '">' +
                '<div class="answer-inner">' + answerHtml + '</div>' +
            '</div>' +
        '</div>';
    }

    function render() {
        syncDragState();
        var list = getFilteredCards();
        totalSpan.textContent = cards.length;
        favSpan.textContent = cards.filter(function (c) { return c.fav; }).length;

        if (list.length === 0) {
            grid.innerHTML = cards.length === 0
                ? '<div class="empty-state">' +
                      '<span class="big">🌱</span>' +
                      '<span class="empty-main">还没有任何卡片</span>' +
                      '<span class="sub">点击「新建卡片」开始记录吧</span>' +
                  '</div>'
                : '<div class="no-result"><span class="empty-main">🌿 没有找到匹配的卡片，试试调整筛选条件吧</span></div>';
            return;
        }

        /* 分组键 = 分类 + 章节（同一章节名在微观/宏观下互不相干）；
           没选章节的按分类各自成组，标题与已命名章节同款，仍排在该分类最后 */
        var NO_CHAPTER_LABEL = '未选章节';
        function groupInfo(c) {
            var s = normSubject(c.subject);
            var n = (c.chapter || '').trim();
            return { key: M.groupKeyOf(c), text: n ? s + ' · ' + n : s + ' · ' + NO_CHAPTER_LABEL };
        }
        var counts = Object.create(null);
        var texts = Object.create(null);
        list.forEach(function (c) {
            var g = groupInfo(c);
            counts[g.key] = (counts[g.key] || 0) + 1;
            texts[g.key] = g.text;
        });

        var html = '', lastKey = null;
        list.forEach(function (c) {
            var k = groupInfo(c).key;
            if (k !== lastKey) {
                html += '<div class="chapter-divider">' +
                            '<span class="cd-name">' + safeText(texts[k]) + '</span>' +
                            '<span class="cd-count">' + counts[k] + ' 张</span>' +
                        '</div>';
                lastKey = k;
            }
            html += cardHTML(c);
        });
        grid.innerHTML = html;
        KB.ImageStore.hydrate(grid, 'img');
        renderMathIn(grid);
    }

    /* ============================================================
       卡片区事件
       ============================================================ */
    function applyFav(id, fav) {
        var el = grid.querySelector('.card-item[data-id="' + id + '"]');
        if (el) {
            el.classList.toggle('favorited', fav);
            var btn = el.querySelector('.btn-fav');
            if (btn) {
                btn.classList.toggle('active', fav);
                btn.textContent = fav ? '⭐' : '☆';
                btn.title = fav ? '取消收藏' : '收藏';
            }
        }
        favSpan.textContent = cards.filter(function (c) { return c.fav; }).length;
    }

    grid.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;

        /* 答案展示态的图片点一下开大图浮层，可加减缩放 */
        if (t.tagName === 'IMG' && t.closest('.card-answer')) {
            e.stopPropagation();
            openImgViewer(t.getAttribute('src'));
            return;
        }

        var favBtn = t.closest('.btn-fav');
        if (favBtn) {
            e.stopPropagation();
            var id = favBtn.dataset.id;
            var c = cards.find(function (x) { return x.id === id; });
            if (c) {
                c.fav = !c.fav;
                persist();
                /* 收藏只改当前卡片样式，不整表重绘，避免换色动效 */
                if (filterFav.value === 'fav') render();
                else applyFav(id, c.fav);
                showToast(c.fav ? '⭐ 已收藏' : '已取消收藏');
            }
            return;
        }

        var editBtn = t.closest('.btn-edit');
        if (editBtn) { e.stopPropagation(); openEditor(editBtn.dataset.id); return; }

        var delBtn = t.closest('.btn-del');
        if (delBtn) {
            e.stopPropagation();
            var did = delBtn.dataset.id;
            var dc = cards.find(function (x) { return x.id === did; });
            if (dc) openConfirmDeleteCard(dc);
            return;
        }

        var q = t.closest('.card-question');
        if (q) {
            var card = q.closest('.card-item');
            if (!card) return;
            var cid = card.dataset.id;
            var ans = card.querySelector('.card-answer');
            if (!ans) return;
            var willOpen = !ans.classList.contains('open');
            ans.classList.toggle('open', willOpen);
            if (willOpen) openIds.add(cid); else openIds.delete(cid);
        }
    });

    /* ============================================================
       调顺序模式：圆钮双态 + 章节内拖拽
       ============================================================ */
    function canDragNow() {
        return !filterSearch.value.trim() && filterFav.value !== 'fav';
    }
    function syncDragState() {
        var manual = M.orderMode() === 'manual';
        sortModeBtn.classList.toggle('active', manual);
        sortModeBtn.title = manual ? '回到自动排序' : '调整卡片顺序';
        grid.classList.toggle('sortable', manual && canDragNow());
    }
    function setSortMode(mode) {
        M.setOrderMode(mode);
        syncDragState();
        render();
        showToast(mode === 'manual'
            ? (canDragNow() ? '进入调顺序模式 · 拖动卡片排顺序' : '进入调顺序模式 · 当前筛选下不能拖')
            : '已回到自动排序 · 手动顺序已保留');
    }
    /* 重置顺序：只在手动模式长按排序球，弹通用确认层，确认与取消都有。
       短按仍是切换模式；长按触发后随后那次 click 被吞掉，避免刚重置又跳模式。 */
    function openResetOrderConfirm() {
        openConfirm({
            title: '重置为自动顺序',
            msg: '当前手动排好的顺序会被清空，回到按学科、章节与题号的自动排序。此操作不可撤销。',
            okText: '确认重置',
            guardMs: 350,
            onOk: function () {
                M.resetOrder();
                syncDragState();
                render();
                showToast('已重置为自动顺序');
            }
        });
    }
    var pressTimer = null, pressFired = false, pressStartedAt = 0;
    function clearPress() { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }
    sortModeBtn.addEventListener('pointerdown', function () {
        pressFired = false;
        pressStartedAt = Date.now();
        clearPress();
        if (M.orderMode() !== 'manual') return;
        pressTimer = setTimeout(function () {
            pressTimer = null;
            pressFired = true;
            openResetOrderConfirm();
        }, 600);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (type) {
        sortModeBtn.addEventListener(type, clearPress);
    });
    sortModeBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    sortModeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        /* 长按本身不该顺带切换模式。键盘触发的 click 不带 detail，照常切换。 */
        var held = e.detail !== 0 && (pressFired ||
            (Date.now() - pressStartedAt >= 400 && Date.now() - pressStartedAt < 3000));
        pressFired = false;
        if (held) return;
        setSortMode(M.orderMode() === 'manual' ? 'auto' : 'manual');
    });

    /* 落位只改当前可见卡在全量序列占的那几个坑位，隐藏卡原地不动 */
    function applyCardDrop(fromId, toId, after) {
        var nodes = Array.prototype.slice.call(grid.querySelectorAll('.card-item'));
        var fromNode = nodes.filter(function (n) { return n.dataset.id === fromId; })[0];
        var toNode = nodes.filter(function (n) { return n.dataset.id === toId; })[0];
        if (!fromNode || !toNode) return false;
        var gk = fromNode.dataset.group;
        if (toNode.dataset.group !== gk) return false;
        var visible = nodes.filter(function (n) { return n.dataset.group === gk; })
                           .map(function (n) { return n.dataset.id; });
        var at = visible.indexOf(fromId), to = visible.indexOf(toId);
        if (at < 0 || to < 0 || fromId === toId) return false;
        visible.splice(at, 1);
        to = visible.indexOf(toId);
        visible.splice(after ? to + 1 : to, 0, fromId);
        M.applyVisibleOrder(gk, visible);
        /* 只挪节点、不整表重建：拖拽源留在 DOM 里，浏览器能把这次拖拽正常收尾，
           下一次拖动不用等它自己超时。分组条在同章节内位置不变。 */
        if (after) toNode.parentNode.insertBefore(fromNode, toNode.nextSibling);
        else toNode.parentNode.insertBefore(fromNode, toNode);
        showToast('顺序已保存');
        return true;
    }
    function clearCardDropMarks() {
        grid.querySelectorAll('.card-item').forEach(function (n) {
            n.classList.remove('dragging', 'drop-before', 'drop-after');
        });
    }
    var dragId = null, dragGroup = null;
    grid.addEventListener('dragstart', function (e) {
        var item = e.target.closest && e.target.closest('.card-item');
        if (!item || M.orderMode() !== 'manual' || !canDragNow()) { e.preventDefault(); return; }
        dragId = item.dataset.id;
        dragGroup = item.dataset.group;
        item.classList.add('dragging');
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', dragId); } catch (err) {}
        }
    });
    grid.addEventListener('dragover', function (e) {
        if (!dragId) return;
        var item = e.target.closest && e.target.closest('.card-item');
        if (!item || item.dataset.id === dragId) return;
        if (item.dataset.group !== dragGroup) {
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
            return;
        }
        e.preventDefault();
        var r = item.getBoundingClientRect();
        var after = e.clientY > r.top + r.height / 2;
        clearCardDropMarks();
        item.classList.add(after ? 'drop-after' : 'drop-before');
    });
    grid.addEventListener('drop', function (e) {
        e.preventDefault();
        var item = e.target.closest && e.target.closest('.card-item');
        var from = dragId, gk = dragGroup;
        clearCardDropMarks();
        dragId = null; dragGroup = null;
        if (!from || !item) return;
        if (item.dataset.group !== gk) { showToast('只能在同一个章节内调整顺序'); return; }
        var r = item.getBoundingClientRect();
        applyCardDrop(from, item.dataset.id, e.clientY > r.top + r.height / 2);
    });
    grid.addEventListener('dragend', function () {
        clearCardDropMarks();
        dragId = null; dragGroup = null;
    });

    /* ============================================================
       通用确认弹层
       ============================================================ */
    /* 只有长按触发的重置窗口需要防「松手那一下点到遮罩」，其余窗口保持点背景即关 */
    var confirmGuardUntil = 0;
    function openConfirm(opt) {
        confirmTitle.textContent = opt.title || '确认';
        confirmMsg.textContent = opt.msg || '';
        confirmOkBtn.textContent = opt.okText || '确定';
        confirmOkBtn.className = 'btn-ok' + (opt.danger ? ' btn-danger' : '');
        confirmAction = opt.onOk || null;
        confirmOverlay.classList.add('show');
        confirmGuardUntil = opt.guardMs ? Date.now() + opt.guardMs : 0;
        lockBody(true);
    }
    function closeConfirm() {
        confirmAction = null;
        confirmOverlay.classList.remove('show');
        if (!anyOverlayOpen()) lockBody(false);
    }
    confirmCancelBtn.addEventListener('click', closeConfirm);
    confirmOverlay.addEventListener('click', function (e) {
        /* 只有带 guardMs 的窗口在保护期内忽略遮罩点击，其余窗口立即关 */
        if (e.target === confirmOverlay && Date.now() > confirmGuardUntil) closeConfirm();
    });
    confirmOkBtn.addEventListener('click', function () {
        var fn = confirmAction;
        closeConfirm();
        if (fn) fn();
    });

    function openConfirmDeleteCard(card) {
        var preview = (card.question || '').slice(0, 60);
        openConfirm({
            title: '确认删除',
            msg: '确定要删除「' + preview + (card.question && card.question.length > 60 ? '…' : '') + '」这张卡片吗？',
            okText: '删除',
            danger: true,
            onOk: function () {
                var before = cards.length;
                var kept = cards.filter(function (c) { return c.id !== card.id; });
                cards.length = 0;
                Array.prototype.push.apply(cards, kept);
                if (cards.length !== before) {
                    openIds.delete(card.id);
                    persist();
                    M.syncOrder();
                    KB.ImageStore.reconcile(card.answerHtml || '', '');
                    updateChapterFilterOptions();
                    render();
                    showToast('🗑️ 卡片已删除');
                }
            }
        });
    }

    /* ============================================================
       清除数据：先选方式，再进勾选列表或原确认弹层
       ============================================================ */
    function openClearChoice() {
        if (cards.length === 0 && chapterTotal() === 0) {
            showToast('本来就没有数据哦~');
            return;
        }
        clearChoiceSub.textContent =
            '当前有 ' + cards.length + ' 张卡片、' + chapterTotal() + ' 个章节，请选择清除方式：';
        clearChoiceOverlay.classList.add('show');
        lockBody(true);
    }
    function closeClearChoice() {
        clearChoiceOverlay.classList.remove('show');
        if (!anyOverlayOpen()) lockBody(false);
    }

    function openClearData() {
        if (cards.length === 0 && chapterTotal() === 0) {
            showToast('本来就没有数据哦~');
            return;
        }
        clearMsg.textContent =
            '当前有 ' + cards.length + ' 张卡片、' + chapterTotal() + ' 个章节。\n' +
            '此操作不可恢复，卡片和章节都会被删除。\n' +
            '如需保留，请先点顶部右侧的绿色小球导出备份。';
        clearOverlay.classList.add('show');
        lockBody(true);
    }
    function closeClearData() {
        clearOverlay.classList.remove('show');
        if (!anyOverlayOpen()) lockBody(false);
    }
    /* ---- 顶部蓝球：点开才出现「导入 / 导出」---- */
    function toggleIo(open) {
        var willOpen = (typeof open === 'boolean') ? open : !ioWrap.classList.contains('open');
        ioWrap.classList.toggle('open', willOpen);
        /* 窄屏展开的两颗子弹由 CSS 定位，给 header 打标记供窄屏样式调整卡片高度 */
        var hd = document.querySelector('.app-header');
        if (hd) hd.classList.toggle('orb-open', willOpen);
    }
    ioBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleIo();
    });
    ioWrap.addEventListener('click', function (e) { e.stopPropagation(); });
    /* 收起走捕获阶段：卡片内多数按钮会 stopPropagation，等冒泡到 document 就收不到了。
       球自身与两颗子弹的点击不在这里处理，交给各自入口决定。 */
    document.addEventListener('click', function (e) {
        if (ioWrap.contains(e.target)) return;
        if (ioWrap.classList.contains('open')) toggleIo(false);
    }, true);

    clearDataBtn.addEventListener('click', openClearChoice);
    clearChoiceCancelBtn.addEventListener('click', closeClearChoice);
    clearChoiceOverlay.addEventListener('click', function (e) {
        if (e.target === clearChoiceOverlay) closeClearChoice();
    });
    /* 上下二选一：部分删除进勾选列表，清空全部沿用原确认弹窗 */
    Array.prototype.forEach.call(clearChoiceOverlay.querySelectorAll('.ai-share-opt'), function (btn) {
        btn.addEventListener('click', function () {
            closeClearChoice();
            if (btn.getAttribute('data-mode') === 'part') openPickPanel('delete');
            else openClearData();
        });
    });
    clearCancelBtn.addEventListener('click', closeClearData);
    clearOverlay.addEventListener('click', function (e) {
        if (e.target === clearOverlay) closeClearData();
    });
    clearOkBtn.addEventListener('click', function () {
        var allHtml = cards.map(function (c) { return c.answerHtml || ''; }).join('');
        M.clearAll();
        KB.ImageStore.reconcile(allHtml, '');
        openIds.clear();
        filterChapter.value = 'all';
        filterFav.value = 'all';
        filterSearch.value = '';
        updateChapterFilterOptions();
        render();
        closeClearData();
        showToast('已清空全部数据');
    });

    /* ============================================================
       编辑弹层
       ============================================================ */
    function openEditor(id) {
        editingId = id || null;
        clearImgSelection();
        savedRange = null;
        closeChapterPop();

        if (id) {
            var c = cards.find(function (x) { return x.id === id; });
            if (!c) { showToast('🫥卡片不存在哦~'); return; }
            modalTitle.textContent = '编辑卡片';
            indexInput.value = c.qid || '';
            hasImgInput.checked = !!c.hasImage;
            hasImgToggle.classList.toggle('active', !!c.hasImage);
            questionInput.value = c.question || '';
            answerEditor.innerHTML = c.answerHtml || '';
            subjectSelect.value = (SUBJECTS.indexOf(c.subject) >= 0) ? c.subject : SUBJECTS[0];
            setEditorChapter(c.chapter || '');
        } else {
            modalTitle.textContent = '新建卡片';
            indexInput.value = '';
            hasImgInput.checked = false;
            hasImgToggle.classList.remove('active');
            questionInput.value = '';
            answerEditor.innerHTML = '';
            /* 新建时默认沿用当前筛选的章节（只在分类对得上时才沿用），省一次选择 */
            var fp = parseChFilter(filterChapter.value);
            /* 默认分类取当前章节筛选所属分类，没选章节时用上次用过的分类 */
            var defSubj = (fp && SUBJECTS.indexOf(fp.subject) >= 0)
                ? fp.subject
                : (SUBJECTS.indexOf(lastSubject) >= 0 ? lastSubject : SUBJECTS[0]);
            subjectSelect.value = defSubj;
            var def = (fp && fp.subject === defSubj) ? fp.name : '';
            /* 优先取该分类上次使用的章节；章节已删则回退到当前筛选章节或空 */
            var mem = lastChapterBySubject[defSubj] || '';
            if (mem && chList(defSubj).indexOf(mem) >= 0) def = mem;
            setEditorChapter(def);
        }

        /* 每次打开回到默认两行 / 160px，别把上次拖出来的高度带过来 */
        questionInput.style.height = '';
        answerEditor.style.height = '';
        KB.ImageStore.hydrate(answerEditor, 'img');
        editorOverlay.classList.add('show');
        lockBody(true);
        /* 新建时直接聚焦题目输入框，不给分类下拉自动对焦 */
        if (!id) setTimeout(function () { questionInput.focus(); }, 60);
    }

    function closeEditor() {
        editorOverlay.classList.remove('show');
        if (!anyOverlayOpen()) lockBody(false);
        clearImgSelection();
        closeChapterPop();
        editingId = null;
        savedRange = null;
    }

    function clearImgSelection() {
        answerEditor.querySelectorAll('img').forEach(function (i) { i.classList.remove('selected'); });
        if (imgCtl) imgCtl.close(false);
    }
    function isEditorEmpty() {
        var html = answerEditor.innerHTML.trim();
        if (html === '' || html === '<br>' || html === '<div><br></div>') return true;
        if (answerEditor.querySelector('img')) return false;
        return answerEditor.textContent.trim() === '';
    }
    function getAnswerHtml() {
        if (isEditorEmpty()) return '';
        var tmp = document.createElement('div');
        tmp.innerHTML = answerEditor.innerHTML;
        tmp.querySelectorAll('img.selected').forEach(function (i) { i.classList.remove('selected'); });
        return KB.ImageStore.serialize(tmp.innerHTML.trim());
    }

    var saving = false;
    function saveCard() {
        if (saving) return;
        var q = cleanQ(questionInput.value);
        var qid = indexInput.value.trim();
        var a = getAnswerHtml();
        var hasAnswer = !!(a && (a.replace(/<[^>]*>/g, '').trim() || a.indexOf('<img') >= 0));
        /* 序号、题目、答案三处填一处即可建卡 */
        if (!q && !qid && !hasAnswer) {
            showToast('⚠️ 序号、题目、答案至少填一处');
            questionInput.focus();
            return;
        }

        var ch = editorChapter || '';
        var subj = (SUBJECTS.indexOf(subjectSelect.value) >= 0) ? subjectSelect.value : SUBJECTS[0];
        var hasImage = !!hasImgInput.checked;
        var oldHtml = '';
        if (editingId) {
            var old = cards.find(function (x) { return x.id === editingId; });
            oldHtml = old ? (old.answerHtml || '') : '';
        }

        function write(finalHtml) {
            if (editingId) {
                var c = cards.find(function (x) { return x.id === editingId; });
                if (c) {
                    c.subject = subj;
                    c.chapter = ch;
                    c.qid = qid;
                    c.hasImage = hasImage;
                    c.question = q;
                    c.answerHtml = finalHtml;
                    c.updated = Date.now();
                }
            } else {
                cards.push({
                    id: uid(),
                    subject: subj,
                    chapter: ch,
                    qid: qid,
                    hasImage: hasImage,
                    question: q,
                    answerHtml: finalHtml,
                    fav: false,
                    created: Date.now()
                });
            }

            if (!persist()) return;
            M.syncOrder();
            KB.ImageStore.reconcile(oldHtml, finalHtml);
            lastSubject = subj;          /* 记住最近使用的分类，供下次新建默认带入 */
            lastChapterBySubject[subj] = ch;   /* 记住该分类下最近使用的章节 */
            closeEditor();
            updateChapterFilterOptions();
            render();
            showToast('✅ 已保存');
        }

        saving = true;
        KB.ImageStore.commit(a).then(write, function () { write(a); })
            .then(function () { saving = false; }, function () { saving = false; });
    }

    addCardBtn.addEventListener('click', function () { openEditor(null); });
    closeModalBtn.addEventListener('click', closeEditor);
    cancelBtn.addEventListener('click', closeEditor);
    saveBtn.addEventListener('click', saveCard);

    hasImgInput.addEventListener('change', function () {
        hasImgToggle.classList.toggle('active', this.checked);
    });

    editorOverlay.addEventListener('click', function (e) {
        if (e.target === editorOverlay) closeEditor();
    });

    /* ============================================================
       富文本编辑器
       ============================================================ */
    /* 手机点按钮时系统会清掉编辑框选区并塞回空光标，不能把这种空光标当作最新选区，否则 BIU / 公式会落空。
       非空选区总是记；空光标只在刚于编辑框里点过或敲过时记，工具栏按钮按下那一瞬也不记。 */
    var toolbarPressUntil = 0;      /* 按工具栏按钮的抖动窗口 */
    var lastEdInteraction = 0;      /* 最近一次真的在编辑框里动过 */

    /* 记下的那个位置如果已经不在文档里了（内容被整体换过），就别再用它 */
    function pruneSavedRange() {
        if (C.rangeIsStale(savedRange)) savedRange = null;
    }

    function rememberEditorRange() {
        pruneSavedRange();
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        var node = sel.anchorNode;
        if (!node || !answerEditor.contains(node)) return;
        var r;
        try { r = sel.getRangeAt(0).cloneRange(); } catch (e) { return; }
        if (r.collapsed) {
            /* 只按「是否正按着工具栏按钮」判断选区抖动，不用时间窗推测；拖选文字不触发 click / keyup，时间窗会误判 */
            if (savedRange && Date.now() < toolbarPressUntil) return;
        }
        savedRange = r;
    }

    document.addEventListener('selectionchange', rememberEditorRange);

    /* 在 document 捕获阶段记录工具栏按下，早于 touchstart 默认动作清选区；click 时由快照恢复 */
    ['touchstart', 'mousedown'].forEach(function (ev) {
        document.addEventListener(ev, function (e) {
            if (!e.target || !e.target.closest) return;
            if (!e.target.closest('.editor-tools')) return;
            toolbarPressUntil = Date.now() + 900;
            rememberEditorRange();
        }, true);
    });

    /* 编辑框上「真的动过」的事件（点、敲、摸、粘贴…）才算一次交互 */
    ['mouseup', 'keyup', 'touchend', 'input', 'click', 'paste'].forEach(function (ev) {
        answerEditor.addEventListener(ev, function () { lastEdInteraction = Date.now(); }, true);
    });

    /* 判断当前空光标是否由系统抖动产生（点工具栏或触摸时选区被清掉，只剩空光标） */
    function liveCaretIsBogus() {
        pruneSavedRange();
        return C.liveCaretIsBogus({ savedRange: savedRange, pressUntil: toolbarPressUntil });
    }

    function getEditorRange() {
        pruneSavedRange();
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && sel.anchorNode && answerEditor.contains(sel.anchorNode)
            && !liveCaretIsBogus()) {
            return sel.getRangeAt(0);
        }
        if (savedRange) {
            try {
                answerEditor.focus();
                /* 用记住的边界点「新建」一个 Range，而不是把记下那个直接塞回去：
                   旧对象可能已经被浏览器钳过位置，新建的最准。 */
                var live = document.createRange();
                live.setStart(savedRange.startContainer, savedRange.startOffset);
                live.setEnd(savedRange.endContainer, savedRange.endOffset);
                sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(live);
                return live;
            } catch (e) { savedRange = null; }
        }
        answerEditor.focus();
        var range = document.createRange();
        range.selectNodeContents(answerEditor);
        range.collapse(false);
        return range;
    }

    function insertTextAtCursor(text, cursorOffset) {
        var range = getEditorRange();
        range.deleteContents();
        var node = document.createTextNode(text);
        range.insertNode(node);
        if (typeof cursorOffset === 'number') {
            var p = Math.max(0, Math.min(cursorOffset, text.length));
            range.setStart(node, p); range.setEnd(node, p);
        } else {
            range.setStartAfter(node); range.setEndAfter(node);
        }
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        try { savedRange = sel.getRangeAt(0).cloneRange(); } catch (e) {}
    }

    function insertNodeAtCursor(node) {
        var range = getEditorRange();
        range.deleteContents();
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        try { savedRange = sel.getRangeAt(0).cloneRange(); } catch (e) {}
    }

    /* 在光标处插入 HTML 片段，用 DocumentFragment 逐节点插入，避免多套一层 wrapper div */
    function insertHtmlAtCursor(html) {
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        var frag = document.createDocumentFragment();
        while (tmp.firstChild) frag.appendChild(tmp.firstChild);
        var range = getEditorRange();
        range.deleteContents();
        var last = frag.lastChild;
        range.insertNode(frag);
        if (last) { range.setStartAfter(last); range.collapse(true); }
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        try { savedRange = sel.getRangeAt(0).cloneRange(); } catch (e) {}
    }

    /* 纯文本仅含 Markdown 标记时才转 HTML；普通文本与已带 text/html 的剪贴板内容不转换，避免误转与膨胀 */
    function looksLikeMarkdown(s) {
        return C.looksLikeMarkdown(s, { mode: 'card' });
    }

    /* 工具栏按钮：mousedown 阻止默认，避免编辑器失焦丢选区 */
    editorTools.addEventListener('mousedown', function (e) {
        var b = e.target.closest ? e.target.closest('button') : null;
        if (!b) return;
        e.preventDefault();
        toolbarPressUntil = Date.now() + 800;   /* 这段窗口里的选区抖动一律不算 */
        rememberEditorRange();
    });

    /* 手机没有 mousedown，touchstart 阶段先存选区，点下去再恢复，避免按钮点击时选区丢失 */
    editorTools.addEventListener('touchstart', function (e) {
        var b = e.target.closest ? e.target.closest('button') : null;
        if (!b) return;
        toolbarPressUntil = Date.now() + 800;
        rememberEditorRange();
    }, { passive: true });

    /* ---- BIU ---- */
    editorTools.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button[data-cmd]') : null;
        if (!b) return;
        if (Date.now() < (b.__runAt || 0) + 300) return;   /* 防重复执行 */
        b.__runAt = Date.now();
        b.__clickAt = Date.now();
        var cmd = b.getAttribute('data-cmd');
        /* 先恢复光标/选区再执行：手机（和部分国产内核）点按钮会把选区清掉，
           直接 execCommand 等于什么都没做；恢复后才是「选中文字点 B 就变粗」。 */
        try { getEditorRange(); } catch (x) {}
        answerEditor.focus();
        try { document.execCommand(cmd, false, null); } catch (x) {}
        lastEdInteraction = Date.now();   /* 这是编辑框里的一次真实动作 */
        toolbarPressUntil = 0;            /* 命令执行完立即解除抖动窗口，好记下命令后的真实光标 */
        rememberEditorRange();
        syncFormatButtons();
    });
    /* 手机上 click 偶尔被吞时，touchend 后 320ms 未等到 click 就补一次；click 真来了则不补 */
    editorTools.addEventListener('touchend', function (e) {
        var b = e.target.closest ? e.target.closest('button[data-cmd]') : null;
        if (!b) return;
        var t = Date.now();
        setTimeout(function () {
            if ((b.__clickAt || 0) >= t) return;
            b.click();
        }, 320);
    }, { passive: true });
    function syncFormatButtons() {
        C.syncFormatButtons(editorTools, 'active');
    }
    document.addEventListener('selectionchange', function () {
        var sel = window.getSelection();
        if (!sel || !sel.anchorNode) return;
        if (answerEditor.contains(sel.anchorNode)) syncFormatButtons();
    });

    /* ---- BIU 快捷键：Ctrl+B / Ctrl+I / Ctrl+U（Mac 上 Cmd 同效） ---- */
    function editorShortcutCmd(e) {
        if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return '';
        var k = e.key ? e.key.toLowerCase() : '';
        if (k === 'b') return 'bold';
        if (k === 'i') return 'italic';
        if (k === 'u') return 'underline';
        return '';
    }
    answerEditor.addEventListener('keydown', function (e) {
        var cmd = editorShortcutCmd(e);
        if (!cmd) return;
        e.preventDefault();
        try { getEditorRange(); } catch (x) {}
        answerEditor.focus();
        try { document.execCommand(cmd, false, null); } catch (x) {}
        syncFormatButtons();
    });

    /* ---- 清除格式 ----
        选中文字时去掉该段的加粗 / 斜体 / 下划线；
        只有光标时关掉待生效的打字样式，避免接着写仍被前面的粗体带着走。 */
    clearFmtBtn.addEventListener('click', function () {
        try { getEditorRange(); } catch (x) {}
        answerEditor.focus();
        try { document.execCommand('styleWithCSS', false, false); } catch (x) {}
        var sel = window.getSelection();
        var collapsed = !sel || !sel.rangeCount || sel.isCollapsed;
        if (!collapsed) {
            try { document.execCommand('removeFormat'); } catch (x) {}
            try { document.execCommand('unlink'); } catch (x) {}
            /* removeFormat 会留下空壳标签（<b></b>），顺手清掉，免得下次点 B 又整段变粗 */
            try {
                answerEditor.querySelectorAll('b,i,u,strong,em').forEach(function (el) {
                    if (!el.textContent && !el.querySelector('img,br')) el.remove();
                });
            } catch (x) {}
        } else {
            /* 光标收缩：把几项「待生效」的打字样式逐个关掉（execCommand 在这种
               光标下只改接下来要打的字，不会动已经写好的内容） */
            ['bold', 'italic', 'underline', 'strikeThrough'].forEach(function (c) {
                try { if (document.queryCommandState(c)) document.execCommand(c, false, null); } catch (x) {}
            });
        }
        lastEdInteraction = Date.now();
        toolbarPressUntil = 0;
        rememberEditorRange();
        syncFormatButtons();
        showToast('已清除格式');
    });

    /* ---- 清空答案 ---- */
    clearAnswerBtn.addEventListener('click', function () {
        if (isEditorEmpty()) { showToast('答案本来就是空的'); return; }
        openConfirm({
            title: '清空答案',
            msg: '确定要清空这张卡片的答案吗？',
            okText: '清空',
            danger: true,
            onOk: function () {
                answerEditor.innerHTML = '';
                clearImgSelection();
                showToast('🧹 答案已清空（记得点保存）');
            }
        });
    });

    /* ============================================================
       插入表格
       ============================================================ */
    function openTableDialog() {
        tableRows.value = 3;
        tableCols.value = 3;
        tableOverlay.classList.add('show');
        /* 手机编辑态点插入表格前先把焦点移出答案框，再把光标放进行数输入框并全选 */
        try { answerEditor.blur(); } catch (e) {}
        setTimeout(function () {
            try { tableRows.focus(); } catch (e) {}
            try { tableRows.select(); } catch (e) {}
        }, 80);
    }
    function closeTableDialog() { tableOverlay.classList.remove('show'); }

    function confirmInsertTable() {
        var r = parseInt(tableRows.value, 10);
        var c = parseInt(tableCols.value, 10);
        if (isNaN(r)) r = 3;
        if (isNaN(c)) c = 3;
        r = Math.max(1, Math.min(20, r));
        c = Math.max(1, Math.min(10, c));

        var html = '<table><thead><tr>';
        for (var i = 0; i < c; i++) html += '<th>表头' + (i + 1) + '</th>';
        html += '</tr></thead><tbody>';
        for (var k = 1; k < r; k++) {
            html += '<tr>';
            for (var j = 0; j < c; j++) html += '<td>&nbsp;</td>';
            html += '</tr>';
        }
        html += '</tbody></table><p><br></p>';

        insertHtmlAtCursor(html);
        closeTableDialog();
        showToast('▦ 表格已插入，点击单元格可直接编辑');
    }

    insertTableBtn.addEventListener('click', openTableDialog);
    tableOkBtn.addEventListener('click', confirmInsertTable);
    tableCancelBtn.addEventListener('click', closeTableDialog);
    tableOverlay.addEventListener('click', function (e) {
        if (e.target === tableOverlay) closeTableDialog();
    });
    tableRows.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); tableCols.focus(); tableCols.select(); }
    });
    tableCols.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); confirmInsertTable(); }
    });

    /* ============================================================
       插入图片 / 公式
       ============================================================ */
    function readAndInsertImage(file) {
        C.readAndInsertImage(file, {
            editor: answerEditor,
            alt: '图片',
            insert: function (img) { insertNodeAtCursor(img); },
            tip: function () { showToast('🖼️ 图片已插入 · 点图片可调尺寸，选「压缩」再点应用会真的压小'); }
        });
    }

    insertImgBtn.addEventListener('click', function () {
        /* 手机编辑态先收键盘、隔 160ms 再弹文件选择器，避免键盘收起与选择器弹出撞在一起；光标位置已保存在 getEditorRange / savedRange */
        try { answerEditor.blur(); } catch (e) {}
        setTimeout(function () {
            var fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);
            fileInput.onchange = function () {
                var file = this.files && this.files[0];
                if (file) readAndInsertImage(file);
                document.body.removeChild(fileInput);
            };
            fileInput.click();
        }, 160);
    });

    answerEditor.addEventListener('paste', function (e) {
        var cd = e.clipboardData;
        if (!cd) return;
        var items = cd.items;
        /* ① 图片优先 */
        if (items) {
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (item.type && item.type.indexOf('image/') === 0) {
                    e.preventDefault();
                    readAndInsertImage(item.getAsFile());
                    return;
                }
            }
        }
        /* ② 真富文本 HTML 先剥掉来源页的配色、字号与背景，只留结构标签再插入。
           底色常包在没有结构标签的 span 里，所以带内联样式的内容也要走清洗。
           安卓剪贴板给纯文本套的 HTML 空壳若含 Markdown，仍留给 ③ 转换。 */
        var html = '';
        try { html = cd.getData('text/html'); } catch (x) {}
        var text = '';
        try { text = cd.getData('text/plain'); } catch (x) {}
        var rich = /<(table|thead|tbody|tr|td|th|strong|b|em|i|u|h[1-6]|ul|ol|li|img|pre|code|a|blockquote)[\s>]/i.test(html);
        var styled = /\bstyle\s*=/i.test(html);
        var isMd = text && text.trim() && looksLikeMarkdown(text);
        if (html && (rich || (styled && !isMd))) {
            var clean = C.sanitizePastedHtml(html);
            if (clean) {
                e.preventDefault();
                insertHtmlAtCursor(clean);
                /* 网页图文里内嵌的 base64 图跟着进图床，正文只留引用 */
                if (KB.ImageStore) KB.ImageStore.adoptInline(answerEditor);
                return;
            }
        }
        /* ③ 纯文本：看着像 Markdown 才转成 HTML 插入；普通纯文本仍走浏览器默认粘贴 */
        if (!isMd) return;
        e.preventDefault();
        insertHtmlAtCursor(mdToHtml(text));
        showToast('📋 已按 Markdown 渲染粘贴');
    });

    /* 公式按钮只插入占位的「公式」二字并自动选中，直接输入 LaTeX 即可替换 */

    function selectInsertedFormula(text, pad) {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        var r = sel.getRangeAt(0);
        var n = r.startContainer;
        if (!n || n.nodeType !== 3) return;
        var s = n.textContent, at = r.startOffset, base = at - text.length;
        if (base < 0 || s.slice(base, at) !== text) return;
        var rr = document.createRange();
        rr.setStart(n, base + pad);
        rr.setEnd(n, at - pad);
        sel.removeAllRanges(); sel.addRange(rr);
        try { savedRange = sel.getRangeAt(0).cloneRange(); } catch (e) {}
    }

    insertInlineFormulaBtn.addEventListener('click', function () {
        var t = '$公式$';
        insertTextAtCursor(t, t.length);
        selectInsertedFormula(t, 1);
        /* 插入后不弹提示，占位文字已选中，直接输入即可替换 */
    });

    insertBlockFormulaBtn.addEventListener('click', function () {
        var t = '$$公式$$';
        insertTextAtCursor(t, t.length);
        selectInsertedFormula(t, 2);
    });

    answerEditor.addEventListener('input', function () {
        var h = this.innerHTML.trim();
        if (h === '<br>' || h === '<div><br></div>') this.innerHTML = '';
    });

    /* 图片尺寸条：与全站富文本共用 KB.ImgCtl 的双模式状态机。
       缩放只改显示宽度，压缩只降画质；两者都不动原图像素，压缩后覆盖同一张图床 Blob。 */
    var imgCtl = KB.ImgCtl.create({
        host: imgCtlHost,
        editor: answerEditor,
        skinClass: 'imgctl--mc',
        selectedClass: 'selected',
        tip: showToast,
        select: function (img, on) { img.classList.toggle('selected', !!on); }
    });

    answerEditor.addEventListener('click', function (e) {
        var img = e.target && e.target.closest ? e.target.closest('img') : null;
        if (img && answerEditor.contains(img)) {
            answerEditor.querySelectorAll('img').forEach(function (i) { i.classList.remove('selected'); });
            imgCtl.open(img);
        }
    });

    /* ============================================================
       答案里的图片：点开看大图（浮层 + 放大缩小 + 拖动 + 滚轮）
       ============================================================ */
    var imgViewerScale = 1, imgViewerX = 0, imgViewerY = 0;

    function imgViewerApply() {
        imgViewerImg.style.transform =
            'translate(' + imgViewerX + 'px,' + imgViewerY + 'px) scale(' + imgViewerScale + ')';
        imgViewerVal.textContent = Math.round(imgViewerScale * 100) + '%';
    }
    function imgViewerBaseWidth() {
        var w = imgViewerImg.getBoundingClientRect().width;
        return imgViewerScale ? (w / imgViewerScale) : w;
    }
    function imgViewerReset() {
        imgViewerScale = 1; imgViewerX = 0; imgViewerY = 0;
        imgViewerImg.classList.remove('dragging');
        imgViewerImg.style.transform = '';
        imgViewerVal.textContent = '100%';
    }
    function imgViewerZoom(factor) {
        imgViewerScale = Math.max(0.2, Math.min(6, imgViewerScale * factor));
        imgViewerApply();
    }
    function openImgViewer(src) {
        if (!src) return;
        /* 注水还没回来就点开时，src 仍是 idb: 引用，先换成出入证 */
        if (String(src).indexOf('idb:') === 0) {
            KB.ImageStore.urlFor(src).then(function (u) {
                if (u && u !== src) openImgViewer(u);
            });
            return;
        }
        imgViewerImg.src = src;
        imgViewerReset();
        imgViewer.classList.add('show');
        lockBody(true);
    }
    function closeImgViewer() {
        if (!imgViewer.classList.contains('show')) return;
        imgViewer.classList.remove('show');
        imgViewerImg.removeAttribute('src');
        imgViewerReset();
        if (!anyOverlayOpen()) lockBody(false);
    }

    imgViewerIn.addEventListener('click', function () { imgViewerZoom(1.25); });
    imgViewerOut.addEventListener('click', function () { imgViewerZoom(1 / 1.25); });
    imgViewerFit.addEventListener('click', function () { imgViewerReset(); });
    imgViewerOne.addEventListener('click', function () {
        var base = imgViewerBaseWidth();
        var nw = imgViewerImg.naturalWidth || base;
        if (base > 0) {
            imgViewerScale = Math.max(0.2, Math.min(6, nw / base));
            imgViewerX = 0; imgViewerY = 0; imgViewerApply();
        }
    });
    imgViewerClose.addEventListener('click', closeImgViewer);

    /* 点背景关掉（点在图片上不关） */
    imgViewer.addEventListener('click', function (e) { if (e.target === imgViewer) closeImgViewer(); });

    /* 滚轮缩放 */
    imgViewer.addEventListener('wheel', function (e) {
        e.preventDefault();
        imgViewerZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });

    /* 按住拖动平移 */
    (function () {
        var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
        imgViewerImg.addEventListener('pointerdown', function (e) {
            dragging = true;
            sx = e.clientX; sy = e.clientY;
            ox = imgViewerX; oy = imgViewerY;
            imgViewerImg.classList.add('dragging');
            try { imgViewerImg.setPointerCapture(e.pointerId); } catch (err) {}
            e.preventDefault();
        });
        imgViewerImg.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            imgViewerX = ox + (e.clientX - sx);
            imgViewerY = oy + (e.clientY - sy);
            imgViewerApply();
        });
        function stopDrag(e) {
            if (!dragging) return;
            dragging = false;
            imgViewerImg.classList.remove('dragging');
            try { imgViewerImg.releasePointerCapture(e.pointerId); } catch (err) {}
        }
        imgViewerImg.addEventListener('pointerup', stopDrag);
        imgViewerImg.addEventListener('pointercancel', stopDrag);
    })();

    /* ============================================================
       导出 / 导入
       ============================================================ */
    /* 弹窗内只看章节与收藏两个下拉，页面搜索框不进弹层 */
    function pickVisibleCards() {
        return sortCards(cardsMatching(exportFilterChapter.value, exportFilterFav.value, ''));
    }

    /* 打开时同步页面筛选；章节选项与筛选栏同源，避免两处各维护一份 */
    function syncPickFilters() {
        exportFilterChapter.innerHTML = filterChapter.innerHTML;
        exportFilterChapter.value = filterChapter.value;
        if (!exportFilterChapter.value) exportFilterChapter.value = 'all';
        exportFilterFav.value = filterFav.value;
    }

    function openPickPanel(mode) {
        if (cards.length === 0) { showToast('还没有卡片哦~'); return; }
        pickMode = mode;
        syncPickFilters();
        exportPanelTitle.textContent = (mode === 'delete') ? '选择要删除的卡片' : '选择要导出的卡片';
        exportConfirmBtn.classList.toggle('btn-danger', mode === 'delete');
        /* 导出默认全选命中卡；删除默认一张不勾，逐张手动指定 */
        pickSelected = (mode === 'export')
            ? new Set(pickVisibleCards().map(function (c) { return c.id; }))
            : new Set();
        renderPickList();
        exportOverlay.classList.add('show');
        lockBody(true);
    }
    function closePickPanel() {
        exportOverlay.classList.remove('show');
        if (!anyOverlayOpen()) lockBody(false);
        pickSelected = new Set();
        pickMode = 'export';
        exportConfirmBtn.classList.remove('btn-danger');
    }

    /* 换筛选只重绘列表，已勾选的卡片原样保留，可跨筛选累积选择 */
    function onPickFilterChange() {
        renderPickList();
    }

    function renderPickList() {
        var sorted = pickVisibleCards();
        if (sorted.length === 0) {
            exportList.innerHTML = '<div class="export-empty">没有符合当前筛选的卡片</div>';
            updatePickCount();
            return;
        }
        exportList.innerHTML = sorted.map(function (c) {
            var checked = pickSelected.has(c.id);
            var subj = normSubject(c.subject);
            var subjectHtml = '<span class="tag subj">' + safeText(subj) + '</span>';
            var chapterHtml = c.chapter ? '<span class="tag">' + safeText(c.chapter) + '</span>' : '';
            var qidHtml = c.qid ? '<span class="qid">' + safeText(c.qid) + '</span>' : '';
            var hasImgHtml = c.hasImage ? '<span class="has-img">📐 有图示</span>' : '';
            var qHtml = c.question
                ? '<div class="export-item-q">' + safeText(c.question) + '</div>'
                : '<div class="export-item-q empty">（题目未输入）</div>';
            return '' +
            '<label class="export-item' + (checked ? ' checked' : '') + '" data-id="' + safeText(c.id) + '">' +
                '<input type="checkbox" data-id="' + safeText(c.id) + '"' + (checked ? ' checked' : '') + '>' +
                '<div class="export-item-body">' +
                    '<div class="export-item-meta">' + subjectHtml + chapterHtml + qidHtml + hasImgHtml + '</div>' +
                    qHtml +
                '</div>' +
            '</label>';
        }).join('');
        updatePickCount();
    }

    function updatePickCount() {
        var n = pickSelected.size;
        var verb = (pickMode === 'delete') ? '删除' : '导出';
        exportCount.textContent = n;
        exportConfirmBtn.disabled = n === 0;
        exportConfirmBtn.textContent = n > 0 ? verb + ' (' + n + ')' : verb;
    }

    exportList.addEventListener('click', function (e) {
        var item = e.target.closest ? e.target.closest('.export-item') : null;
        if (!item) return;
        var id = item.dataset.id;
        if (!id) return;
        if (e.target.tagName === 'INPUT') return;
        e.preventDefault();
        if (pickSelected.has(id)) pickSelected.delete(id);
        else pickSelected.add(id);
        var cb = item.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = pickSelected.has(id);
        item.classList.toggle('checked', pickSelected.has(id));
        updatePickCount();
    });

    exportList.addEventListener('change', function (e) {
        var cb = e.target;
        if (!cb || cb.type !== 'checkbox') return;
        var id = cb.dataset.id;
        var item = cb.closest('.export-item');
        if (cb.checked) pickSelected.add(id);
        else pickSelected.delete(id);
        if (item) item.classList.toggle('checked', cb.checked);
        updatePickCount();
    });

    exportSelectAllBtn.addEventListener('click', function () {
        /* 全选把当前筛选命中的卡并进已选，跨筛选的已选项保持累加 */
        pickVisibleCards().forEach(function (c) { pickSelected.add(c.id); });
        renderPickList();
    });
    exportSelectNoneBtn.addEventListener('click', function () {
        pickSelected = new Set();
        renderPickList();
    });
    exportSelectInvertBtn.addEventListener('click', function () {
        var next = new Set(pickSelected);
        pickVisibleCards().forEach(function (c) {
            if (next.has(c.id)) next.delete(c.id);
            else next.add(c.id);
        });
        pickSelected = next;
        renderPickList();
    });
    exportFilterChapter.addEventListener('change', onPickFilterChange);
    exportFilterFav.addEventListener('change', onPickFilterChange);

    function deletePickedCards() {
        var doomed = cards.filter(function (c) { return pickSelected.has(c.id); });
        if (!doomed.length) return;
        var n = doomed.length;
        var allHtml = doomed.map(function (c) { return c.answerHtml || ''; }).join('');
        var kept = cards.filter(function (c) { return !pickSelected.has(c.id); });
        cards.length = 0;
        Array.prototype.push.apply(cards, kept);
        doomed.forEach(function (c) { openIds.delete(c.id); });
        if (!persist()) return;
        M.syncOrder();
        KB.ImageStore.reconcile(allHtml, '');
        updateChapterFilterOptions();
        closePickPanel();
        render();
        showToast('🗑️ 已删除 ' + n + ' 张卡片');
    }

    function exportPickedCards() {
        var list = sortCards(cards.filter(function (c) { return pickSelected.has(c.id); }));
        /* 导出带上章节顺序（按分类分开），换设备导入后顺序不会乱；
           图片字节随备份一起走，正文里只留 idb: 引用 */
        KB.ImageStore.exportRefs(list.map(function (c) { return c.answerHtml || ''; }))
            .then(function (blobs) {
                var payload = M.buildBackup(list, blobs);
                var data = JSON.stringify(payload, null, 2);
                var blob = new Blob([data], { type: 'application/json' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                var d = new Date();
                var stamp = d.getFullYear() + '-' +
                    String(d.getMonth() + 1).padStart(2, '0') + '-' +
                    String(d.getDate()).padStart(2, '0');
                a.href = url;
                a.download = '我的卡片_' + stamp + '_' + list.length + '张.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

                showToast('📤 已导出 ' + list.length + ' 张卡片');
                closePickPanel();
            }).catch(function () {
                showToast('⚠️ 导出失败，请重试');
            });
    }

    exportConfirmBtn.addEventListener('click', function () {
        if (pickSelected.size === 0) { showToast('⚠️ 请至少勾选一张卡片'); return; }
        if (pickMode === 'delete') deletePickedCards();
        else exportPickedCards();
    });

    closeExportBtn.addEventListener('click', closePickPanel);
    exportCancelBtn.addEventListener('click', closePickPanel);
    exportOverlay.addEventListener('click', function (e) {
        if (e.target === exportOverlay) closePickPanel();
    });

    /* 去重签名：题目、序号、答案三段拼接，确认文案与落库共用同一口径 */
    function importSig(question, qid, answer) {
        return String(question || '').trim() + '\u0001' +
               String(qid || '').trim() + '\u0001' + String(answer || '');
    }

    /* ---- 导入 ---- */
    importBtn.addEventListener('click', function () { toggleIo(false); importFile.click(); });

    importFile.addEventListener('change', function () {
        var file = this.files && this.files[0];
        if (!file) return;
        importFile.value = '';

        var reader = new FileReader();
        reader.onload = function (ev) {
            var incoming = [];
            var newChapters = [];    /* 新格式按分类分开的章节表，确认后才落表 */
            var legacyCh = [];
            var blobs = [];
            try {
                var parsed = JSON.parse(ev.target.result);
                if (Array.isArray(parsed)) {
                    incoming = parsed;                                  /* 老格式：只有卡片数组 */
                } else if (parsed && Array.isArray(parsed.cards)) {
                    incoming = parsed.cards;
                    blobs = Array.isArray(parsed.blobs) ? parsed.blobs : [];
                    if (parsed.chapters && !Array.isArray(parsed.chapters) && typeof parsed.chapters === 'object') {
                        SUBJECTS.forEach(function (s) {
                            if (Array.isArray(parsed.chapters[s])) {
                                parsed.chapters[s].forEach(function (n) {
                                    newChapters.push({ subject: s, name: n });
                                });
                            }
                        });
                    } else if (Array.isArray(parsed.chapters)) {
                        legacyCh = parsed.chapters.filter(function (n) { return typeof n === 'string' && n.trim(); });
                    }
                } else {
                    throw new Error('bad format');
                }
            } catch (err) {
                showToast('⚠️ 导入失败：文件格式不正确');
                return;
            }

            var cardCount = incoming.filter(function (it) {
                return it && typeof it.question === 'string';
            }).length;
            if (!cardCount) { showToast('⚠️ 文件里没有可导入的卡片'); return; }

            /* 解析阶段只收集数据与预演结果，确认前不写章节表、不写图床、不动卡片 */
            var probe = {};
            cards.forEach(function (c) {
                probe[importSig(c.question, c.qid, c.answerHtml)] = 1;
            });
            var willAdd = 0, willSkip = 0;
            incoming.forEach(function (item) {
                if (!item || typeof item.question !== 'string') return;
                var sig = importSig(item.question, item.qid || item.index, item.answerHtml || item.answer);
                if (probe[sig]) { willSkip++; return; }
                probe[sig] = 1;
                willAdd++;
            });
            var lines = [
                '文件里有 ' + cardCount + ' 张卡片' + (blobs.length ? '、' + blobs.length + ' 张图片' : '') + '。',
                '本机现有 ' + cards.length + ' 张卡片，按题目、序号、答案去重后：',
                '将新增 ' + willAdd + ' 张，跳过重复 ' + willSkip + ' 张。',
                '已有卡片不会被覆盖或删除。'
            ];
            if (!blobs.length) lines.push('这份备份不含图片，答案里引用的图可能显示不出来。');
            lines.push('', '确定继续导入吗？');

            openConfirm({
                title: '导入卡片',
                msg: lines.join('\n'),
                okText: '导入',
                onOk: function () { doImport(incoming, newChapters, legacyCh, blobs); }
            });
        };
        reader.readAsText(file);
    });

    function doImport(incoming, newChapters, legacyCh, blobs) {
        newChapters.forEach(function (c) { pushChapter(c.subject, c.name); });

        /* 备份里的图片先回库，正文的 idb: 引用才注得出水 */
        KB.ImageStore.importBlobs(blobs).then(function () {
            /* 导入按「题目 + 序号 + 答案」去重合并，本机已有与文件内互相重复的都只留一张 */
            var seen = {};
            cards.forEach(function (c) {
                seen[importSig(c.question, c.qid, c.answerHtml)] = 1;
            });

            var added = 0;
            var skipped = 0;
            var fresh = [];
            incoming.forEach(function (item) {
                if (item && typeof item.question === 'string') {
                    var sig = importSig(item.question, item.qid || item.index, item.answerHtml || item.answer);
                    if (seen[sig]) { skipped++; return; }
                    seen[sig] = 1;
                    var ch = (typeof item.chapter === 'string' ? item.chapter : '').trim();
                    if (ch === UNCATEGORIZED) ch = '';
                    var subj = (SUBJECTS.indexOf(item.subject) >= 0) ? item.subject : SUBJECTS[0];
                    pushChapter(subj, ch);
                    var card = {
                        id: uid(),
                        subject: subj,
                        chapter: ch,
                        qid: typeof item.qid === 'string' ? item.qid : (typeof item.index === 'string' ? item.index : ''),
                        hasImage: !!item.hasImage,
                        question: cleanQ(item.question),
                        answerHtml: item.answerHtml || item.answer || '',
                        fav: !!item.fav,
                        created: item.created || Date.now()
                    };
                    fresh.push(card);
                    cards.push(card);
                    added++;
                }
            });

            /* 老文件的章节表：按「哪张卡在用」定位到分类 */
            legacyCh.forEach(function (n) {
                var hit = cards.filter(function (c) { return (c.chapter || '').trim() === n; })[0];
                pushChapter(hit ? hit.subject : SUBJECTS[0], n);
            });

            /* 老备份答案是内联 base64，落盘前一并升级进图床 */
            return KB.ImageStore.migrateList(fresh).then(function () {
                return { added: added, skipped: skipped };
            });
        }).then(function (r) {
            if (r.added === 0 && r.skipped === 0) {
                showToast('⚠️ 文件里没有可导入的卡片');
            } else {
                normalizeChapters();
                persist();
                M.syncOrder();
                updateChapterFilterOptions();
                render();
                showToast('📥 已导入 ' + r.added + ' 张卡片' + (r.skipped ? '，跳过重复 ' + r.skipped + ' 张' : ''));
            }
        }).catch(function () {
            showToast('⚠️ 导入失败：文件格式不正确');
        });
    }

    /* ============================================================
       从 AI 对话导入
       ------------------------------------------------------------
       读的是 AI 答疑助手那份对话历史，与助手同源：26/11/10 起它存在
       IndexedDB 内容层（键 {前缀}:{项目}:ai:history），本页与子页同源即可。
       按「一问一答」配成一张卡片：题目 = 你的提问，答案 = AI 的回答。
       ============================================================ */

    function oneLine(s) {
        return String(s || '').replace(/\s+/g, ' ').trim();
    }
    /* 把 markdown 的符号去掉，只留下一句话做预览/题目 */
    function mdPlain(s) {
        return String(s || '')
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/^\s{0,3}#{1,6}\s+/gm, '')
            .replace(/^\s*>\s?/gm, '')
            .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
            .replace(/\*\*|__|~~|`/g, '')
            .replace(/[*_]/g, '');
    }

    /* markdown -> 富文本 HTML（公式 $…$ / $$…$$ 原样留着，交给页面里的 KaTeX 渲染） */
    function mdToHtml(md) {
        var src = C.normalizeMathBlocks ? C.normalizeMathBlocks(md) : md;
        return C.mdToHtml(src, { paraJoin: '\n' });
    }

    function loadAiPairs() {
        var hist = [];
        try {
            if (KB.Store && KB.Store.get) {
                hist = KB.Store.get('ai', 'history', []) || [];
            }
        } catch (e) { hist = []; }
        if (!Array.isArray(hist)) hist = [];
        var pairs = [], pendingQ = '';
        hist.forEach(function (m) {
            if (!m) return;
            var txt = String(m.content || '');
            if (m.role === 'user') {
                pendingQ = txt;
            } else if (m.role === 'assistant' && txt.trim()) {
                pairs.push({ q: pendingQ, a: txt });
                pendingQ = '';
            }
        });
        return pairs;
    }

    function updateAiImpCount() {
        aiImpCount.textContent = aiImpPicked.size;
    }
    function renderAiImpList() {
        if (!aiImpPairs.length) {
            aiImpList.innerHTML = '<div class="ai-imp-empty">还没读到 AI 对话记录<br>' +
                '先在页面右下角的「AI 答疑助手」里聊几句，再回来点这里</div>';
            return;
        }
        var html = '';
        aiImpPairs.forEach(function (p, i) {
            var checked = aiImpPicked.has(i);
            var q = oneLine(mdPlain(p.q)) || '（这条没有提问）';
            var a = oneLine(mdPlain(p.a)).slice(0, 150) || '（空回答）';
            html += '<label class="export-item' + (checked ? ' checked' : '') + '" data-i="' + i + '">' +
                        '<input type="checkbox" data-i="' + i + '"' + (checked ? ' checked' : '') + '>' +
                        '<div class="export-item-body">' +
                            '<div class="export-item-q">' + safeText(q.slice(0, 120)) + (q.length > 120 ? '…' : '') + '</div>' +
                            '<div class="export-item-a">' + safeText(a) + (a.length >= 150 ? '…' : '') + '</div>' +
                        '</div>' +
                    '</label>';
        });
        aiImpList.innerHTML = html;
        updateAiImpCount();
    }

    /* 章节下拉随分类切换，换成该分类对应的章节表 */
    function updateAiImpChapterOptions(prefer) {
        var s = normSubject(aiImpSubject.value);
        var list = chList(s);
        var prev = (typeof prefer === 'string') ? prefer : aiImpChapter.value;
        var html = '<option value="">不设章节</option>';
        list.forEach(function (ch) {
            html += '<option value="' + safeText(ch) + '">' + safeText(ch) + '</option>';
        });
        aiImpChapter.innerHTML = html;
        aiImpChapter.value = (list.indexOf(prev) >= 0) ? prev : '';
    }

    function openAiImp() {
        aiImpPairs = loadAiPairs();
        aiImpPicked = new Set();
        aiImpPairs.forEach(function (p, i) { aiImpPicked.add(i); });   // 默认全选
        /* 分类：优先跟当前章节筛选一致，否则用上次用过的 */
        var fp = parseChFilter(filterChapter.value);
        var defSubj = (fp && SUBJECTS.indexOf(fp.subject) >= 0)
            ? fp.subject
            : (SUBJECTS.indexOf(lastSubject) >= 0 ? lastSubject : SUBJECTS[0]);
        aiImpSubject.value = defSubj;
        updateAiImpChapterOptions((fp && fp.subject === defSubj) ? fp.name : '');
        renderAiImpList();
        aiImpOverlay.classList.add('show');
        lockBody(true);
    }
    function closeAiImp() {
        aiImpOverlay.classList.remove('show');
        if (!anyOverlayOpen()) lockBody(false);
    }

    /* 单次最多导入 50 张：再多会让列表、章节与存储同时吃紧 */
    var AI_IMP_MAX = 50;

    function doAiImport() {
        var picked = [];
        aiImpPairs.forEach(function (p, i) { if (aiImpPicked.has(i)) picked.push(p); });
        if (!picked.length) { showToast('⚠️ 先勾选要导入的对话'); return; }

        var cut = picked.length > AI_IMP_MAX;
        if (cut) picked = picked.slice(0, AI_IMP_MAX);

        var subj = SUBJECTS.indexOf(aiImpSubject.value) >= 0 ? aiImpSubject.value : SUBJECTS[0];
        var chName = String(aiImpChapter.value || '').trim();
        if (chName && chList(subj).indexOf(chName) < 0) chName = '';   // 分类换过就对不上了，丢掉

        /* 同一段对话反复导会灌进重复卡片，按题目去重 */
        var seen = {};
        cards.forEach(function (c) { seen[String(c.question || '').trim()] = 1; });
        var added = 0;
        var skipped = 0;
        picked.forEach(function (p) {
            var q = oneLine(p.q);
            if (!q) q = oneLine(mdPlain(p.a)).slice(0, 60) || '（AI 回答）';
            if (seen[q]) { skipped++; return; }
            seen[q] = 1;
            cards.push({
                id: uid(),
                subject: subj,
                chapter: chName,
                qid: '',
                hasImage: false,
                question: q,
                answerHtml: mdToHtml(p.a),
                fav: false,
                created: Date.now()
            });
            added++;
        });

        if (!added) {
            showToast('⚠️ 勾选的对话都已经导入过了');
            return;
        }

        lastSubject = subj;
        lastChapterBySubject[subj] = chName || '';
        var saved = persist();
        M.syncOrder();
        updateChapterFilterOptions();
        render();
        closeAiImp();

        /* 同步返回 false 是当场就知道写不下；异步落库失败由 QUOTA_OPT.onFail 补一句 */
        if (!saved) {
            showToast('⚠️ 卡片没能存进本机，请先导出备份再清理后重试');
            return;
        }

        var msg = '✅ 已加入 ' + added + ' 张卡片';
        if (skipped) msg += '，跳过重复 ' + skipped + ' 张';
        if (cut) msg += '，单次最多 ' + AI_IMP_MAX + ' 张，其余再导一次';
        showToast(msg + (chName ? '（' + subj + ' · ' + chName + '）' : '（未设章节，可再编辑补上）'));
    }

    aiImportBtn.addEventListener('click', function () { this.blur(); openAiImp(); });
    closeAiImpBtn.addEventListener('click', closeAiImp);
    aiImpCancelBtn.addEventListener('click', closeAiImp);
    aiImpConfirmBtn.addEventListener('click', doAiImport);
    aiImpSubject.addEventListener('change', function () { updateAiImpChapterOptions(''); });
    aiImpSelectAllBtn.addEventListener('click', function () {
        aiImpPairs.forEach(function (p, i) { aiImpPicked.add(i); });
        renderAiImpList();
    });
    aiImpSelectNoneBtn.addEventListener('click', function () {
        aiImpPicked = new Set();
        renderAiImpList();
    });
    aiImpList.addEventListener('change', function (e) {
        var box = e.target;
        if (!box || box.type !== 'checkbox') return;
        var i = +box.dataset.i;
        if (box.checked) aiImpPicked.add(i); else aiImpPicked.delete(i);
        var item = box.closest('.export-item');
        if (item) item.classList.toggle('checked', box.checked);
        updateAiImpCount();
    });

    /* ============================================================
       筛选栏 + 键盘
       ============================================================ */
    var searchTimer = null;
    filterSearch.addEventListener('input', function () {
        clearTimeout(searchTimer);
        toggleMcClear();
        searchTimer = setTimeout(render, 220);
    });
    filterChapter.addEventListener('change', render);
    if (mcSearchClear) {
      mcSearchClear.addEventListener('click', function () {
        filterSearch.value = '';
        toggleMcClear();
        render();
      });
    }
    filterFav.addEventListener('change', render);

    /* 下拉选完自动收起（与子页一致） */
    document.querySelectorAll('.filter-bar select').forEach(function (sel) {
        sel.addEventListener('change', function () { this.blur(); });
    });

    clearFilterBtn.addEventListener('click', function () {
        filterChapter.value = 'all';
        filterFav.value = 'all';
        filterSearch.value = '';
        toggleMcClear();
        render();
    });

    var allExpanded = false;
    expandAllBtn.addEventListener('click', function () {
        allExpanded = !allExpanded;
        grid.querySelectorAll('.card-item').forEach(function (card) {
            var id = card.dataset.id;
            var ans = card.querySelector('.card-answer');
            if (!ans) return;
            ans.classList.toggle('open', allExpanded);
            if (allExpanded) openIds.add(id); else openIds.delete(id);
        });
        expandAllBtn.textContent = allExpanded ? '全部收起' : '全部展开';
    });

    exportBtn.addEventListener('click', function () { openPickPanel('export'); });

    document.addEventListener('keydown', function (e) {
        if (tableOverlay.classList.contains('show')) {
            if (e.key === 'Escape') { e.preventDefault(); closeTableDialog(); }
            return;
        }
        if (clearOverlay.classList.contains('show')) {
            if (e.key === 'Escape') { e.preventDefault(); closeClearData(); }
            return;
        }
        if (confirmOverlay.classList.contains('show')) {
            if (e.key === 'Escape') { e.preventDefault(); closeConfirm(); }
            if (e.key === 'Enter') { e.preventDefault(); confirmOkBtn.click(); }
            return;
        }
        if (editorOverlay.classList.contains('show')) {
            if (e.key === 'Escape') {
                if (isChapterPopOpen()) { e.preventDefault(); closeChapterPop(); return; }
                e.preventDefault(); closeEditor();
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveCard(); }
            return;
        }
        if (clearChoiceOverlay.classList.contains('show')) {
            if (e.key === 'Escape') { e.preventDefault(); closeClearChoice(); }
            return;
        }
        if (exportOverlay.classList.contains('show')) {
            if (e.key === 'Escape') { e.preventDefault(); closePickPanel(); }
            return;
        }
        if (aiImpOverlay.classList.contains('show')) {
            if (e.key === 'Escape') { e.preventDefault(); closeAiImp(); }
            return;
        }
    });

    /* 图片大图预览的键盘操作：Esc 关闭、+ / - 缩放、0 回到适应窗口 */
    document.addEventListener('keydown', function (e) {
        if (!imgViewer.classList.contains('show')) return;
        if (e.key === 'Escape') { e.preventDefault(); closeImgViewer(); return; }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); imgViewerZoom(1.25); return; }
        if (e.key === '-' || e.key === '_') { e.preventDefault(); imgViewerZoom(1 / 1.25); return; }
        if (e.key === '0') { e.preventDefault(); imgViewerReset(); }
    });

    /* ============================================================
       初始化
       ============================================================ */
    function mount(config) {
        var CFG = config || global.MYCARDS_CONFIG || {};

        /* 页头、返回入口与用法说明由配置决定，骨架里只留容器 */
        var pageCfg = CFG.page || {};
        if (pageCfg.title) document.title = pageCfg.title + ' · 记忆卡';
        var h1 = document.querySelector('.app-header h1');
        if (h1 && pageCfg.heading) h1.textContent = pageCfg.heading;
        var backLink = document.querySelector('.back-home');
        if (backLink && CFG.back) {
            if (CFG.back.href) backLink.setAttribute('href', CFG.back.href);
            var backLabel = backLink.querySelector('span:last-child');
            if (backLabel && CFG.back.label) backLabel.textContent = CFG.back.label;
        }
        var hint = document.querySelector('.usage-hint');
        if (hint && pageCfg.hint) hint.textContent = pageCfg.hint;

        M.init({ storagePrefix: CFG.storagePrefix, projectId: CFG.projectId, subjects: CFG.subjects });
        ['subjectSelect', 'aiImpSubject'].forEach(function (id) {
            var sel = document.getElementById(id);
            if (!sel) return;
            sel.innerHTML = SUBJECTS.map(function (v) {
                return '<option value="' + safeText(v) + '">' + safeText(v) + '</option>';
            }).join('');
        });
        var scopeName = document.getElementById('chScopeName');
        if (scopeName) scopeName.textContent = SUBJECTS[0];
        KB.ImageStore.setScope({
            prefix: CFG.storagePrefix || 'kb',
            projectId: CFG.projectId || 'demo',
            moduleId: CFG.moduleId || 'cards'
        });
        KB.UI.initToast(document.getElementById('toast'));
        try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
        normalizeChapters();
        /* 默认空库；地址带 ?sample=1 才载入样张供验收 */
        if (!cards.length && global.MYCARDS_SAMPLE && /(\?|&)sample\b/.test(global.location.search)) {
            Array.prototype.push.apply(cards, global.MYCARDS_SAMPLE.map(M.normalizeCard));
            normalizeChapters();
            persist();
        }
        updateChapterFilterOptions();
        /* 筛选记忆走框架的 KB.FilterMemory：章节下拉建好后再还原 */
        (function restoreFilters() {
            var saved = { chapter: 'all', fav: 'all' };
            var fm = KB.FilterMemory.load('cards', saved);
            if (saved.chapter) filterChapter.value = saved.chapter;
            if (saved.fav) filterFav.value = saved.fav;
            if (fm && fm.keyword) filterSearch.value = fm.keyword;
            function save() {
                KB.FilterMemory.save('cards', {
                    chapter: filterChapter.value,
                    fav: filterFav.value
                }, { keyword: filterSearch.value });
            }
            filterChapter.addEventListener('change', save);
            filterFav.addEventListener('change', save);
            filterSearch.addEventListener('input', KB.UI.debounce(save, 220));
            clearFilterBtn.addEventListener('click', save);
        })();
        render();
        /* 存卡或移卡后立刻重绘本页；写入与读取同走 KB.Store，靠自定义事件通知本页重绘 */
        window.addEventListener('mycards:changed', function (e) {
            var d = (e && e.detail) || {};
            M.reload();
            normalizeChapters();
            M.syncOrder();
            persistChaptersOnly();
            updateChapterFilterOptions();
            render();
            if (d.type === 'add' && d.id) focusNewCard(d.id);
        });

        /* 新卡按自动序可能插在视口上方，重绘后把它滚入视野并亮一下，避免看着像没反应 */
        function focusNewCard(id) {
            var node = null;
            var nodes = grid.querySelectorAll('.card-item');
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].dataset.id === id) { node = nodes[i]; break; }
            }

            if (!node) {
                /* 被当前筛选挡住了：不硬拽滚动条，只报个位置，免得正在做的事被打断 */
                var c = null;
                for (var j = 0; j < cards.length; j++) {
                    if (cards[j].id === id) { c = cards[j]; break; }
                }
                if (c) {
                    var where = normSubject(c.subject) + (c.chapter ? ' · ' + c.chapter : '');
                    showToast('已存进「' + where + '」，当前筛选看不到它');
                }
                return;
            }

            var top = node.getBoundingClientRect().top + (window.pageYOffset || 0) - 24;
            try { window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' }); }
            catch (err) { window.scrollTo(0, Math.max(0, top)); }

            node.classList.remove('card-flash');
            void node.offsetWidth;               // 强制重排，让动画能连着重放
            node.classList.add('card-flash');
            setTimeout(function () { node.classList.remove('card-flash'); }, 2000);
        }
        /* 从 AI 助手那边跳过来时带 #ai，落地直接弹导入面板 */
        if (/(^|[#&])ai($|[&])/i.test(location.hash || '')) {
            setTimeout(openAiImp, 260);
        }
        /* KaTeX 可能比脚本晚到，补渲染几次 */
        setTimeout(function () { renderMathIn(grid); }, 400);
        setTimeout(function () { renderMathIn(grid); }, 1200);
    }



    /* 对外门面：生成器、AI 存卡、回归脚本都从这里进，不直接摸闭包变量 */
    KB.MyCards = {
        mount: mount,
        render: render,
        setSortMode: setSortMode,
        applyDrop: applyCardDrop,
        canDragNow: canDragNow,
        orderSeq: M.orderSeq,
        groupKeyOf: M.groupKeyOf,
        openEditor: openEditor,
        cards: function () { return cards; },
        chapters: function () { return chaptersBySubject; },
        reload: function () {
            M.reload();
            normalizeChapters();
            updateChapterFilterOptions();
            render();
        },
        /* 返回 Promise：图片字节一并带上，别再走同步版丢图 */
        exportBackup: function (picked) {
            var list = sortCards((picked || cards).slice());
            return KB.ImageStore.exportRefs(list.map(function (c) { return c.answerHtml || ''; }))
                .then(function (blobs) { return M.buildBackup(list, blobs); });
        },
        parseBackup: M.parseBackup
    };
})(window);
