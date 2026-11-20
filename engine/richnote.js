/* 笔记区的富文本工具栏。只认页面上的类名，不改其他模块的代码。

   给每个 .card-note-area 挂一条工具栏：
       B I U | 🖼️ 图片  ▦ 表格  ∑ 行内  ∑ 块级 | 💾 保存  🗑️ 清空
   点图片开尺寸条（缩放显示宽度 / 画质压缩），非编辑态点图开浮层预览。

   保存与清空发起给 notes 模块的 KB.Notes.save / clear，这个模块只管编辑。
   样式全部带 rte- 前缀，独立在 ui/richnote.css（须随页面一起引入）。 */
(function () {
    'use strict';

    var KB = (window.KB = window.KB || {});
    var C = KB.Editor;
    var escMd = C.escapeHtml;
    var inlineMd = C.inlineMd;
    var mdIsTableRow = C.isTableRow;
    var mdIsTableSep = C.isTableSep;
    var mdSplitRow = C.splitRow;

    if (window.__rteLoaded) return;
    window.__rteLoaded = true;

    /* ======================= A. KaTeX（本地 vendor，多路径兜底） ============ */
    (function loadKatex() {
        var BASES = ['../vendor/katex/', 'vendor/katex/', '../../vendor/katex/'];
        var i = 0;
        function next() {
            if (i >= BASES.length) return;
            var base = BASES[i++];
            var s = document.createElement('script');
            s.src = base + 'katex.min.js';
            s.onload = function () {
                var l = document.createElement('link');
                l.rel = 'stylesheet';
                l.href = base + 'katex.min.css';
                document.head.appendChild(l);
                /* 编辑态的笔记框一律不渲染 —— 那里要保持 $...$ 源码（见 hookEditSource） */
                document.querySelectorAll('.note-editor').forEach(function (ed) {
                    if (ed.getAttribute('contenteditable') !== 'true') renderMathIn(ed);
                });
            };
            s.onerror = next;
            document.head.appendChild(s);
        }
        next();
    })();

    /* ======================= B. 样式 =========================================
       样式全部抽到 ui/richnote.css（index.html 在 page.css 之后引入，
       层叠顺序与旧的运行时注入一致）。选择器带 rte- 前缀避免撞车，
       颜色引用 tokens.css 的变量。 */

    /* ======================= C. 公式渲染 ================================== */
    function renderMathIn(root) {
        if (!root || !window.katex) return;
        /* 光标点在已渲染公式后面时，浏览器会把光标放进公式内部（.katex 最深的行内盒），
           新打的 $...$ 就成了 .katex 的后代，渲染循环会跳过 .katex 里的所有文本，
           新公式永远轮不到渲染。治法两步：
           ① 渲染时把 LaTeX 源码记在 data-tex / data-disp 上；光标若溜进公式内部，
              打字前被 handleFormulaKeys 弹出、退格删除整块拿掉，
              全程走 execCommand，Ctrl+Z 仍然有效；
           ② 每次渲染前扫一遍旧公式，发现 .katex 里混入了含 $ 的文本（被打坏的），
              就用 data-tex 还原成源码、连同混入的文本一起交还给当轮循环重新渲染。 */
        root.querySelectorAll('.katex-host').forEach(function (host) {
            var k = host.querySelector('.katex');
            if (!k) return;
            var stray = '';
            var w = document.createTreeWalker(k, NodeFilter.SHOW_TEXT, null);
            var t;
            while ((t = w.nextNode())) {
                if (t.nodeValue.indexOf('$') > -1) stray += t.nodeValue;
            }
            if (!stray) return;
            var tex = host.getAttribute('data-tex') || '';
            var disp = host.getAttribute('data-disp') === '1';
            var src = tex ? (disp ? '$$' + tex + '$$' : '$' + tex + '$') : '';
            host.parentNode.replaceChild(document.createTextNode(src + stray), host);
        });
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
                /* 记下源码：打坏还原与整块删除都靠它 */
                span.setAttribute('data-tex', src);
                span.setAttribute('data-disp', (m[1] !== undefined) ? '1' : '0');
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

    /* 保存前把公式「还原」成 $...$ 源码再存进 localStorage。
       渲染后的 HTML 是几十个带内联样式的 <span>：体积膨胀几十倍、
       公式改不动（里面根本没有 LaTeX 原文）、备份也没法读。
       只处理本脚本渲染出来的 .katex-host（身上带 data-tex 源码）；
       没有源码的老公式一律不动 —— 内容不会丢，只是体积照旧。 */
    function deflateMath(root) {
        if (!root) return 0;
        var n = 0;
        root.querySelectorAll('.katex-host').forEach(function (host) {
            var tex = host.getAttribute('data-tex');
            if (!tex) return;                    /* 无源码的老公式：原样保留，绝不丢内容 */
            var disp = host.getAttribute('data-disp') === '1';
            var txt = document.createTextNode(disp ? ('$$' + tex + '$$') : ('$' + tex + '$'));
            if (host.parentNode) { host.parentNode.replaceChild(txt, host); n++; }
        });
        return n;
    }

    /* ======================= E. 图片浮层预览 ============================== */
    var viewer = null, viewerImg = null, viewerVal = null;
    var vScale = 1, vTx = 0, vTy = 0, vNatW = 1, vNatH = 1, vDragging = false;

    function buildViewer() {
        if (viewer) return;
        viewer = document.createElement('div');
        viewer.className = 'rte-viewer';
        viewer.innerHTML =
            '<img alt="预览">' +
            '<button class="rte-viewer-close" type="button" title="关闭（Esc）">✕</button>' +
            '<div class="rte-viewer-bar">' +
              '<button type="button" data-z="out" title="缩小">−</button>' +
              '<span class="val">100%</span>' +
              '<button type="button" data-z="in" title="放大">＋</button>' +
              '<span class="vsep"></span>' +
              '<button type="button" class="txt" data-z="fit">适应窗口</button>' +
              '<button type="button" class="txt" data-z="one">1:1</button>' +
            '</div>';
        document.body.appendChild(viewer);
        viewerImg = viewer.querySelector('img');
        viewerVal = viewer.querySelector('.val');

        viewer.addEventListener('click', function (e) {
            if (e.target === viewer) closeViewer();
        });
        viewer.querySelector('.rte-viewer-close').addEventListener('click', closeViewer);
        viewer.querySelector('.rte-viewer-bar').addEventListener('click', function (e) {
            var b = e.target.closest('button[data-z]');
            if (!b) return;
            var z = b.getAttribute('data-z');
            if (z === 'in') setScale(vScale * 1.25);
            else if (z === 'out') setScale(vScale / 1.25);
            else if (z === 'fit') fitViewer();
            else if (z === 'one') { setScale(1); vTx = 0; vTy = 0; applyViewer(); }
        });
        viewer.addEventListener('wheel', function (e) {
            e.preventDefault();
            setScale(vScale * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
        }, { passive: false });
        viewerImg.addEventListener('mousedown', function (e) {
            e.preventDefault();
            vDragging = true; viewerImg.classList.add('dragging');
        });
        window.addEventListener('mousemove', function (e) {
            if (!vDragging) return;
            vTx += e.movementX; vTy += e.movementY; applyViewer();
        });
        window.addEventListener('mouseup', function () {
            vDragging = false;
            if (viewerImg) viewerImg.classList.remove('dragging');
        });
        document.addEventListener('keydown', function (e) {
            if (!viewer.classList.contains('show')) return;
            if (e.key === 'Escape') closeViewer();
            else if (e.key === '+' || e.key === '=') setScale(vScale * 1.25);
            else if (e.key === '-') setScale(vScale / 1.25);
        });
    }

    function applyViewer() {
        viewerImg.style.transform = 'translate(' + vTx + 'px,' + vTy + 'px) scale(' + vScale + ')';
        viewerVal.textContent = Math.round(vScale * 100) + '%';
    }
    function setScale(s) {
        vScale = Math.max(0.1, Math.min(8, s));
        applyViewer();
    }
    function fitViewer() {
        var pad = 60;
        var s = Math.min((window.innerWidth - pad * 2) / vNatW, (window.innerHeight - pad * 2 - 50) / vNatH);
        vTx = 0; vTy = 0;
        setScale(Math.max(0.1, Math.min(8, s)));
    }
    function openViewer(src) {
        buildViewer();
        viewerImg.src = src;
        var probe = new Image();
        probe.onload = function () {
            vNatW = probe.naturalWidth || 1;
            vNatH = probe.naturalHeight || 1;
            vTx = 0; vTy = 0;
            fitViewer();
            viewer.classList.add('show');
        };
        probe.onerror = function () {
            vNatW = 1; vNatH = 1; vTx = 0; vTy = 0; setScale(1);
            viewer.classList.add('show');
        };
        probe.src = src;
    }
    function closeViewer() {
        if (viewer) viewer.classList.remove('show');
    }

    /* ======================= F. 表格弹窗 ================================== */
    var tableModal = null;

    function buildTableModal() {
        if (tableModal) return;
        tableModal = document.createElement('div');
        tableModal.className = 'rte-modal';
        tableModal.innerHTML =
            '<div class="box">' +
              '<div class="t">插入表格</div>' +
              '<div class="row"><label>行数</label><input type="number" class="r" value="3" min="1" max="20"></div>' +
              '<div class="row"><label>列数</label><input type="number" class="c" value="3" min="1" max="10"></div>' +
              '<div class="hint">行数含表头行，最多 20 行 / 10 列</div>' +
              '<div class="acts"><button class="no" type="button">取消</button><button class="ok" type="button">插入</button></div>' +
            '</div>';
        document.body.appendChild(tableModal);
        tableModal.addEventListener('click', function (e) {
            if (e.target === tableModal) tableModal.classList.remove('show');
        });
        tableModal.querySelector('.no').addEventListener('click', function () {
            tableModal.classList.remove('show');
        });
        tableModal.querySelector('.ok').addEventListener('click', function () {
            var r = parseInt(tableModal.querySelector('.r').value, 10);
            var c = parseInt(tableModal.querySelector('.c').value, 10);
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
            html += '</tbody></table><p class="rte-after-tbl"><br></p>';
            var editor = tableModal.__editor;
            var rec = tableModal.__range;
            tableModal.classList.remove('show');
            if (editor) {
                /* 弹窗打开前记录的真实选区最可靠；用 forceRange 直接传进去，
               绕过 savedRange/pressUntil 那套保护逻辑，避免被重置到开头。 */
                insertHtmlAtCursor(editor, html, (rec && editor.contains(rec.startContainer)) ? rec : null);
            }
        });
    }
    function openTableModal(editor) {
        buildTableModal();
        tableModal.__editor = editor;
        /* blur 前先把当前真实选区记下来，避免弹窗期间浏览器把选区抖掉，
           导致表格被插到笔记开头或最后而不是光标位置。 */
        var sel = window.getSelection();
        var r = (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode))
            ? sel.getRangeAt(0).cloneRange()
            : (savedRange && editor.contains(savedRange.startContainer) ? savedRange.cloneRange() : null);
        tableModal.__range = r;
        tableModal.querySelector('.r').value = 3;
        tableModal.querySelector('.c').value = 3;
        tableModal.classList.add('show');
        /* 手机上点「表格」时会弹出软键盘，可光标还留在笔记的文字里，
           没法直接改行列数 —— 得先把焦点从笔记框挪走（键盘才会对准输入框），
           再把光标放进「行数」并全选，手指一敲就替换默认值。
           blur 之后留 80ms 给键盘换目标，不然有些手机 focus 会被键盘动画吃掉。 */
        try { editor.blur(); } catch (e) {}
        setTimeout(function () {
            var r = tableModal.querySelector('.r');
            if (!r) return;
            try { r.focus({ preventScroll: true }); } catch (e) { try { r.focus(); } catch (e2) {} }
            try { if (r.select) r.select(); } catch (e) {}
        }, 80);
    }

    /* ======================= G. 光标处插入 ================================ */
    var savedRange = null;
    var pressUntil = 0;     /* 按工具栏按钮的选区抖动窗口 */
    var lastEdAct = 0;      /* 最近一次真的在笔记框里动过（点/敲/摸/粘贴） */

    /* 记下的位置如果已经不在文档里（内容被整体换过），就别再用它 */
    function pruneSaved() {
        if (C.rangeIsStale(savedRange)) savedRange = null;
    }

    /* 捕获阶段保存选区快照，click 时恢复，避开移动端 touchstart 清选区 */
    function editorOf(node) {
        var a = node && node.closest ? node.closest('.card-note-area') : null;
        return a ? a.querySelector('.note-editor') : null;
    }
    ['touchstart', 'mousedown'].forEach(function (ev) {
        document.addEventListener(ev, function (e) {
            if (!e.target || !e.target.closest) return;
            if (!e.target.closest('.rte-bar')) return;
            var ed = editorOf(e.target);
            if (!ed) return;
            pressUntil = Date.now() + 900;
            rememberRange(ed);
        }, true);
    });

    function rememberRange(editor) {
        pruneSaved();
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        if (!sel.anchorNode || !editor.contains(sel.anchorNode)) return;
        var r;
        try { r = sel.getRangeAt(0).cloneRange(); } catch (e) { return; }
        /* 要不要记只看一件事：是不是正按着工具栏按钮。
           （手指拖选文字不触发 click / keyup，按「最近动过没」的时间窗判断会判错） */
        if (r.collapsed && savedRange && Date.now() < pressUntil) return;
        savedRange = r;
    }
    /* 命令执行完再记一次：这时 pressUntil 已清掉，记的是命令后的真实光标 */
    function commitRange(editor) { pressUntil = 0; rememberRange(editor); }

    /* 手里这个「空光标」是不是别人塞进来的（点工具栏 / 触摸时选区被抖掉） */
    function liveCaretIsBogus(editor) {
        pruneSaved();
        return C.liveCaretIsBogus({ savedRange: savedRange, pressUntil: pressUntil });
    }
    /* 程序化插入不触发 input，而自动保存与占位状态都听这个事件；
       插完统一补一发冒泡的 input，交给 notes.js 的处理链路。 */
    function notifyInput(editor) {
        try { editor.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    }
    function insertNodeAtCursor(editor, node, forceRange) {
        ensureEditable(editor);
        var sel = window.getSelection();
        var range = forceRange || ((sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode) && !liveCaretIsBogus(editor))
            ? sel.getRangeAt(0)
            : savedRange);
        if (!range || !editor.contains(range.startContainer)) {
            range = document.createRange();
            var last = editor.lastChild;
            if (last) range.setStartAfter(last);
            else range.selectNodeContents(editor);
            range.collapse(false);
        }
        range.deleteContents();
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        notifyInput(editor);
        savedRange = range.cloneRange();
        commitRange(editor);
    }
    function insertHtmlAtCursor(editor, html, forceRange) {
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        var frag = document.createDocumentFragment(), n;
        while ((n = tmp.firstChild)) frag.appendChild(n);
        var lastNode = frag.lastChild;
        ensureEditable(editor);
        var sel = window.getSelection();
        var range = forceRange || ((sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode) && !liveCaretIsBogus(editor))
            ? sel.getRangeAt(0)
            : savedRange);
        /* 如果既没有真实选区也没有 savedRange，就在编辑器末尾创建一个 range，
           绝不让内容跑到最前面。 */
        if (!range || !editor.contains(range.startContainer)) {
            range = document.createRange();
            var last = editor.lastChild;
            if (last) range.setStartAfter(last);
            else range.selectNodeContents(editor);
            range.collapse(false);
        }
        if (range && editor.contains(range.startContainer)) {
            range.deleteContents();
            range.insertNode(frag);
            var rr = document.createRange();
            /* 表格后面自动加了一个 <p class="rte-after-tbl"><br></p>，
               插入后把光标放到这个 p 里面（br 之前），才能在表格后直接换行。 */
            if (lastNode && lastNode.classList && lastNode.classList.contains('rte-after-tbl') && lastNode.firstChild) {
                rr.setStartBefore(lastNode.firstChild);
                rr.collapse(true);
            } else if (lastNode && lastNode.parentNode) {
                rr.setStartAfter(lastNode);
                rr.collapse(true);
            } else {
                rr.selectNodeContents(editor);
                rr.collapse(false);
            }
            sel.removeAllRanges();
            sel.addRange(rr);
            savedRange = rr.cloneRange();
        } else {
            editor.appendChild(frag);
        }
        notifyInput(editor);
        commitRange(editor);
    }
    function insertTextAtCursor(editor, text, forceRange) {
        ensureEditable(editor);
        var sel = window.getSelection();
        var range = forceRange || ((sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode) && !liveCaretIsBogus(editor))
            ? sel.getRangeAt(0)
            : savedRange);
        if (!range || !editor.contains(range.startContainer)) {
            range = document.createRange();
            var last = editor.lastChild;
            if (last) range.setStartAfter(last);
            else range.selectNodeContents(editor);
            range.collapse(false);
        }
        range.deleteContents();
        var tn = document.createTextNode(text);
        range.insertNode(tn);
        range.setStartAfter(tn);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        notifyInput(editor);
        savedRange = range.cloneRange();
        commitRange(editor);
    }
    /* 让笔记框进入可编辑态（原页面默认 false，点击才 true） */
    function ensureEditable(editor) {
        pruneSaved();
        editor.setAttribute('contenteditable', 'true');
        /* 已经聚焦就别再 focus —— 多余的 focus 会把刚选中的文本弄丢。
           真要 focus 时带 preventScroll —— 手机上 focus 会顶起键盘并滚动页面，
           滚一下就可能把手指底下的按钮挪走，表现就是「点了没反应 / 点不动」。 */
        if (document.activeElement !== editor) {
            try { editor.focus({ preventScroll: true }); }
            catch (e) { try { editor.focus(); } catch (e2) {} }
            /* 没有保存过选区时，浏览器 focus 后常把光标放到编辑器开头，
               导致表格 / 图片 / 公式等「在光标处插入」的内容跑到最前面。
               这里把光标默认放到末尾，并记下来，后续插入就落在合理位置。 */
            if (!savedRange) {
                try {
                    var sel = window.getSelection();
                    var r = document.createRange();
                    var last = editor.lastChild;
                    if (last) r.setStartAfter(last);
                    else r.selectNodeContents(editor);
                    r.collapse(false);
                    if (sel) { sel.removeAllRanges(); sel.addRange(r); }
                    savedRange = r.cloneRange();
                } catch (e) {}
            }
        }
    }

    /* 把记住的光标/选区重新放回笔记框（手机上点按钮时，系统常把选区清掉）。
       手里本来就有一个可信的选区时，什么都不用做。 */
    function restoreRange(editor) {
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && sel.anchorNode && editor.contains(sel.anchorNode)
            && !liveCaretIsBogus(editor)) return;
        if (!savedRange) return;
        try {
            if (!sel) return;
            sel.removeAllRanges();
            sel.addRange(savedRange);
        } catch (e) {}
    }

    /* 插入文本后选中其中一段（公式按钮用：插「公式」两字并选中，直接打字替换） */
    function selectInsertedText(editor, text, pad) {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        var r = sel.getRangeAt(0);
        var n = r.startContainer, at = r.startOffset;
        /* 光标常常停在“元素边界”而不是文本节点里（insertNode 之后就是这样），
           这时往回退一格找刚插进去的那个文本节点 */
        if (!n || n.nodeType !== 3) {
            var cand = n ? n.childNodes[at - 1] : null;
            if (cand && cand.nodeType === 3) { n = cand; at = cand.textContent.length; }
            else if (cand && cand.nodeType === 1 && cand.lastChild && cand.lastChild.nodeType === 3) {
                n = cand.lastChild; at = n.textContent.length;
            }
        }
        if (!n || n.nodeType !== 3) return;
        var s = n.textContent, base = at - text.length;
        if (base < 0 || s.slice(base, at) !== text) return;
        var rr = document.createRange();
        rr.setStart(n, base + pad);
        rr.setEnd(n, at - pad);
        sel.removeAllRanges(); sel.addRange(rr);
        commitRange(editor);
    }

    /* ======================= I. 轻提示 ==================================== */
    var tipEl = null, tipTimer = null;
    function showTip(msg) {
        if (!tipEl) {
            tipEl = document.createElement('div');
            tipEl.style.cssText =
                'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:10000;' +
                'background:var(--tip-bg);color:#fff;font-size:13px;padding:9px 18px;border-radius:30px;' +
                'box-shadow:0 8px 24px rgba(0,0,0,.24);transition:opacity .25s;pointer-events:none;' +
                'font-family:inherit;max-width:88vw;text-align:center;';
            document.body.appendChild(tipEl);
        }
        tipEl.textContent = msg;
        tipEl.style.opacity = '1';
        clearTimeout(tipTimer);
        tipTimer = setTimeout(function () { tipEl.style.opacity = '0'; }, 2000);
    }

    /* 保存成功的按钮反馈：换字 + 变色，3 秒后还原原文字 */
    var SAVED_TIP_MS = 3000;
    function showSaved(btn) {
        if (!btn) return;
        if (!btn.__savedHtml) btn.__savedHtml = btn.innerHTML;   /* 记住「💾 保存笔记/保存」的原始结构 */
        btn.innerHTML = '✅ 已保存';
        btn.classList.add('saved');
        clearTimeout(btn.__savedT);
        btn.__savedT = setTimeout(function () {
            btn.innerHTML = btn.__savedHtml;
            btn.classList.remove('saved');
        }, SAVED_TIP_MS);
    }

    /* ======================= J. 工具栏挂载 ================================ */
    function attach(area) {
        if (area.dataset.rteReady === '1') return;
        var editor = area.querySelector('.note-editor');
        if (!editor) return;
        area.dataset.rteReady = '1';

        /* 图片尺寸条 + 工具栏 */
        var bar = document.createElement('div');
        bar.className = 'rte-bar';
        bar.innerHTML =
            '<button type="button" class="rte-fmt" data-cmd="bold" title="加粗（Ctrl+B）"><b>B</b></button>' +
            '<button type="button" class="rte-fmt" data-cmd="italic" title="斜体（Ctrl+I）"><i>I</i></button>' +
            '<button type="button" class="rte-fmt" data-cmd="underline" title="下划线（Ctrl+U）"><u>U</u></button>' +
            /* 清除格式 —— 选了字就去掉加粗/斜体/下划线；
               只是光标停着，就把「接下来打字会带上的样式」关掉（在粗体后面接着写也不再是粗的）。 */
            '<button type="button" class="rte-fmt rte-cf" data-act="clearfmt" ' +
            'title="清除格式：选中文字 → 去掉加粗/斜体/下划线；只是光标停着 → 后面打的字不再跟着前面的样式">' +
            '<span class="rte-lbl-l">清格式</span><span class="rte-lbl-s">清格式</span></button>' +
            '<span class="rte-sev"></span>' +
            '<button type="button" class="rte-img" data-act="img" title="插入图片（也可直接粘贴截图）">🖼️ ' +
            '<span class="rte-lbl-l">插入图片</span><span class="rte-lbl-s">图片</span></button>' +
            '<button type="button" class="rte-tbl" data-act="table" title="插入表格">▦ ' +
            '<span class="rte-lbl-l">插入表格</span><span class="rte-lbl-s">表格</span></button>' +
            '<button type="button" class="rte-fml" data-act="inline" title="插入行内公式（$…$），直接打 LaTeX 即可">∑ ' +
            '<span class="rte-lbl-l">行内公式</span><span class="rte-lbl-s">行内</span></button>' +
            '<button type="button" class="rte-fml" data-act="block" title="插入块级公式（$$…$$，独占一行）">∑ ' +
            '<span class="rte-lbl-l">块级公式</span><span class="rte-lbl-s">块级</span></button>' +
            '<span class="rte-sp"></span>' +
            '<button type="button" class="rte-save" data-act="save" title="保存笔记">💾 ' +
            '<span class="rte-lbl-l">保存笔记</span><span class="rte-lbl-s">保存</span></button>' +
            '<button type="button" class="rte-clear" data-act="clear" title="清空笔记">🗑️ 清空</button>';
        area.appendChild(bar);
        /* 尺寸条与全站图片算法统一走 KB.ImgCtl；页面只注入提示与保存钩子 */
        var imgCtl = KB.ImgCtl.create({
            host: area,
            before: bar,
            editor: editor,
            skinClass: 'imgctl--rte',
            selectedClass: 'rte-sel',
            tip: showTip,
            onApplied: function (ed) { if (KB.Notes && KB.Notes.saveNow) KB.Notes.saveNow(ed); }
        });

        /* 按钮按下时别让编辑框失焦（否则原页面会把 contenteditable 关掉） */
        bar.addEventListener('mousedown', function (e) {
            if (!e.target.closest || !e.target.closest('button')) return;
            e.preventDefault();
            pressUntil = Date.now() + 800;   /* 这段窗口里的选区抖动一律不算 */
            rememberRange(editor);
            var tb = e.target.closest('.rte-tbl');
            if (tb) tb.__delTable = tableAtCaret();
        });
        /* 手机上没有 mousedown 这一下：在 touchstart 阶段就先把选区存好 */
        bar.addEventListener('touchstart', function (e) {
            if (e.target.closest && !e.target.closest('button')) return;
            pressUntil = Date.now() + 800;
            rememberRange(editor);
            var tb = e.target.closest('.rte-tbl');
            if (tb) tb.__delTable = tableAtCaret();
        }, { passive: true });

        /* 把选区涉及的 h1~h6 降为 p，保留子节点与选区位置 */
        function demoteHeadings(ed) {
            var sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;
            var range = sel.getRangeAt(0);
            var heads = ed.querySelectorAll('h1,h2,h3,h4,h5,h6');
            if (!heads.length) return;
            var targets = [];
            Array.prototype.forEach.call(heads, function (h) {
                var hit = false;
                try { hit = range.intersectsNode ? range.intersectsNode(h) : false; } catch (x) {}
                if (hit) targets.push(h);
            });
            if (!targets.length) return;
            var sc = range.startContainer, so = range.startOffset;
            var ec = range.endContainer, eo = range.endOffset;
            var moved = false;
            targets.forEach(function (h) {
                var p = document.createElement('p');
                while (h.firstChild) p.appendChild(h.firstChild);
                if (sc === h) { sc = p; moved = true; }
                if (ec === h) { ec = p; moved = true; }
                if (h.parentNode) h.parentNode.replaceChild(p, h);
            });
            /* 选区端点落在标题元素上时改指新段落 */
            if (moved) {
                try {
                    var r2 = document.createRange();
                    r2.setStart(sc, so);
                    r2.setEnd(ec, eo);
                    sel.removeAllRanges();
                    sel.addRange(r2);
                } catch (x) {}
            }
        }

        /* 正文行首退格并入前置空标题时，只删空标题、保留正文样式 */
        function handleBackspaceIntoHeading(ed, e) {
            if (e.isComposing || e.keyCode === 229) return false;
            if (e.key !== 'Backspace' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return false;
            var sel = window.getSelection();
            if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
            var r = sel.getRangeAt(0);
            if (r.startOffset !== 0) return false;   /* 光标须在块首 */
            var n = r.startContainer;
            if (n.nodeType === 3) n = n.parentNode;
            var block = n;
            while (block && block.parentNode !== ed && block !== ed) block = block.parentNode;
            if (!block || block === ed) return false;
            if (/^H[1-6]$/.test(block.nodeName || '')) return false;   /* 光标已在标题里，走默认 */
            var prev = block.previousElementSibling;
            if (!prev || !/^H[1-6]$/.test(prev.nodeName || '')) return false;
            if ((prev.textContent || '').trim() || prev.querySelector('img')) return false;
            e.preventDefault();
        if (prev.parentNode) prev.parentNode.removeChild(prev);
        return true;
    }

    /* 空标题内回车后转为正文段落 */
    function handleEmptyHeadingEnter(ed, e) {
        if (e.isComposing || e.keyCode === 229) return false;
        if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return false;
        var sel = window.getSelection();
        if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
        var n = sel.anchorNode;
        if (!n) return false;
        var el = n.nodeType === 1 ? n : n.parentNode;
        var head = null;
        while (el && el !== ed) {
            if (/^H[1-6]$/.test(el.nodeName || '')) { head = el; break; }
            el = el.parentNode;
        }
        if (!head) return false;
        if ((head.textContent || '').trim()) return false;
        if (head.querySelector('img')) return false;
        e.preventDefault();
        var p = document.createElement('p');
        while (head.firstChild) p.appendChild(head.firstChild);
        if (!p.firstChild) p.appendChild(document.createElement('br'));
        if (head.parentNode) head.parentNode.replaceChild(p, head);
        try {
            var r = document.createRange();
            r.setStart(p, 0);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
        } catch (x) {}
        return true;
    }

    /* 光标在表格内时表格按钮变删除态，图标不变、只换文案并高亮 */
    function tableAtCaret() {
        var sel = window.getSelection();
        if (!sel || !sel.rangeCount) return null;
        var n = sel.anchorNode;
        if (!n || !editor.contains(n)) return null;
        var el = n.nodeType === 1 ? n : n.parentNode;
        while (el && el !== editor) {
            if (/^TABLE$/i.test(el.nodeName || '')) return el;
            el = el.parentNode;
        }
        return null;
    }
    function syncTableBtn() {
        if (Date.now() < pressUntil) return;
        var btn = bar.querySelector('.rte-tbl');
        if (!btn) return;
        var tbl = tableAtCaret();
        btn.__delTable = tbl || null;
        var long = btn.querySelector('.rte-lbl-l');
        var short = btn.querySelector('.rte-lbl-s');
        if (tbl) {
            long.textContent = '删除表格';
            short.textContent = '删表';
            btn.title = '删除表格';
            btn.classList.add('is-del');
        } else {
            long.textContent = '插入表格';
            short.textContent = '表格';
            btn.title = '插入表格';
            btn.classList.remove('is-del');
        }
    }
    function deleteTableAtCaret(btn) {
        var tbl = btn.__delTable;
        if (!tbl || !editor.contains(tbl)) return;
        if (!KB.UI || !KB.UI.confirm) return;
        KB.UI.confirm({
            title: '删除表格',
            message: '确定删除这个表格吗？',
            okText: '删除',
            danger: true
        }).then(function (yes) {
            if (yes && editor.contains(tbl)) removeTableAndPlaceCaret(editor, tbl);
        });
    }

    /* BIU + 工具按钮。抽成函数，因为点击有可能被手机浏览器吞掉（见下面兜底） */
    function runBtn(b) {
            if (Date.now() < (b.__runAt || 0) + 300) return;   /* 防重复执行 */
            b.__runAt = Date.now();
            var cmd = b.getAttribute('data-cmd');
            if (cmd) {
                ensureEditable(editor);
                restoreRange(editor);   /* 先恢复选区再执行，手机上点 B 才真的加粗 */
                try { document.execCommand(cmd, false, null); } catch (x) {}
                commitRange(editor);
                syncFmt(bar);
                return;
            }
            var act = b.getAttribute('data-act');
            if (act === 'img') {
                /* 编辑态（光标在闪、键盘弹着）直接弹文件选择器时，
                   键盘收起和选择器弹出撞在一起，页面会「闪一下」。
                   这里先主动收键盘、隔 160ms 再弹选择器 —— 两件事排队做，观感就顺了。
                   光标位置前面已经记下（rememberRange），收键盘不会丢。 */
                try { editor.blur(); } catch (e) {}
                var ed2 = editor, ar2 = area;
                setTimeout(function () {
                    pickImage(function (file) { readAndInsertImage(ar2, ed2, file); });
                }, 160);
            } else if (act === 'clearfmt') {
                /* 清除格式
                   ① 选了字 → removeFormat 去掉加粗/斜体/下划线；
                   ② 只是光标停着 → 关掉「待生效」的打字样式；
                   ③ 选区碰到的 h1~h6 降为 p。 */
                ensureEditable(editor);
                restoreRange(editor);
                editor.focus();
                try { document.execCommand('styleWithCSS', false, false); } catch (x) {}
                var sel = window.getSelection();
                var collapsed = !sel || !sel.rangeCount || sel.isCollapsed;
                if (!collapsed) {
                    try { document.execCommand('removeFormat'); } catch (x) {}
                    try { document.execCommand('unlink'); } catch (x) {}
                    try {
                        editor.querySelectorAll('b,i,u,strong,em').forEach(function (el) {
                            if (!el.textContent && !el.querySelector('img,br')) el.remove();
                        });
                    } catch (x) {}
                } else {
                    ['bold', 'italic', 'underline', 'strikeThrough'].forEach(function (c) {
                        try { if (document.queryCommandState(c)) document.execCommand(c, false, null); } catch (x) {}
                    });
                }
                demoteHeadings(editor);
                commitRange(editor);
                syncFmt(bar);
                showTip('已清除格式');
            } else if (act === 'table') {
                if (b.__delTable) deleteTableAtCaret(b);
                else openTableModal(editor);
            } else if (act === 'inline') {
                var t1 = '$公式$';
                insertTextAtCursor(editor, t1);
                selectInsertedText(editor, t1, 1);
                /* 插完已自动选中「公式」二字，不再弹提示 */
            } else if (act === 'block') {
                var t2 = '$$公式$$';
                insertTextAtCursor(editor, t2);
                selectInsertedText(editor, t2, 2);
            } else if (act === 'save') {
                /* 保存／清空的实际逻辑在 notes 模块里，工具栏只负责发起 */
                var grid = editor.closest('.card-grid');
                if (KB.Notes && KB.Notes.save) KB.Notes.save(grid, editor.dataset.id);
                showSaved(b);
                setTimeout(function () {
                    /* 还在编辑态就别渲染，保留源码继续改 */
                    if (editor.getAttribute('contenteditable') !== 'true') renderMathIn(editor);
                }, 60);
            } else if (act === 'clear') {
                var grid2 = editor.closest('.card-grid');
                if (KB.Notes && KB.Notes.clear) KB.Notes.clear(grid2, editor.dataset.id);
            }
        }

        bar.addEventListener('click', function (e) {
            var b = e.target.closest('button');
            if (!b) return;
            b.__clickAt = Date.now();
            runBtn(b);
        });
        /* 兜底：手机上 click 偶尔会被浏览器吞掉（手指微动、键盘顶起页面、
           选区小手柄正好盖住按钮都会），表现就是按钮点不动。
           touchend 之后 320ms 还没等到 click 就自己跑一遍；click 真来了就不跑。
           touchend 的 target 始终是 touchstart 那个按钮，手指从按钮上滑过滚动页面时
           也会被当成点按钮，所以记下起点，位移超过阈值就判定为滑动、不补发。 */
        var touchStart = null;
        bar.addEventListener('touchstart', function (e) {
            var t0 = e.changedTouches && e.changedTouches[0];
            touchStart = t0 ? { x: t0.clientX, y: t0.clientY } : null;
        }, { passive: true });
        bar.addEventListener('touchcancel', function () { touchStart = null; }, { passive: true });
        bar.addEventListener('touchend', function (e) {
            var b = e.target.closest && e.target.closest('button');
            var start = touchStart;
            touchStart = null;
            if (!b) return;
            var t1 = e.changedTouches && e.changedTouches[0];
            if (start && t1) {
                var dx = t1.clientX - start.x, dy = t1.clientY - start.y;
                if (dx * dx + dy * dy > 100) return;   /* 超过 10px 视为滑动 */
            }
            var now = Date.now();
            setTimeout(function () {
                if ((b.__clickAt || 0) >= now) return;   /* click 正常到了 */
                runBtn(b);
            }, 320);
        }, { passive: true });

        /* 选区变化时：记下来 + 同步 B/I/U 的按下状态。
           手机上手指拖选文字只有 selectionchange 最靠得住（touchend 不一定落在笔记框上） */
        document.addEventListener('selectionchange', function () {
            syncTableBtn();
            var sel = window.getSelection();
            if (!sel || !sel.anchorNode || !editor.contains(sel.anchorNode)) return;
            rememberRange(editor);
            syncFmt(bar);
        });

        /* 表格删除与剪切共用：识别选中的整张表。判定按文字位置比较，
           拖选边界被浏览器吸附到表格内外任何一侧都能认出来。
           拖选产生单元格高亮选区的形态未接管，此路不通时删表用工具栏的删除表格按钮 */
        function selectedTable(editor) {
            var sel = window.getSelection();
            if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
            var range = sel.getRangeAt(0);
            /* 两端都在编辑器根上的选区（如 Ctrl+A）交给浏览器原生删除 */
            if (range.startContainer === editor && range.endContainer === editor) return null;
            var tables = editor.querySelectorAll('table');
            for (var i = 0; i < tables.length; i++) {
                var t = tables[i];
                var hit = false;
                try { hit = range.intersectsNode(t); } catch (x) {}
                if (hit && selectionCoversTable(range, t)) return t;
            }
            return null;
        }
        function selectionCoversTable(range, t) {
            var nr = document.createRange();
            nr.selectNode(t);
            if (range.compareBoundaryPoints(Range.START_TO_START, nr) <= 0 &&
                range.compareBoundaryPoints(Range.END_TO_END, nr) >= 0) return true;
            /* 拖选过表时选区起点落在第一行内、终点落在最后一行内，
               按首末行边界判断，中间隔着空单元格也能认出 */
            var rows = t.querySelectorAll('tr');
            if (!rows.length) return false;
            var fc = document.createRange();
            fc.selectNodeContents(rows[0]);
            fc.collapse(false);
            var lc = document.createRange();
            lc.selectNodeContents(rows[rows.length - 1]);
            lc.collapse(true);
            return range.compareBoundaryPoints(Range.START_TO_START, fc) <= 0 &&
                   range.compareBoundaryPoints(Range.END_TO_END, lc) >= 0;
        }
        /* 删表后的光标落位：表格前是什么就落哪里，裸文字落字后、
           空行落空行、段落落末尾；前面没有内容才落到后面那块的开头 */
        function caretRangeAfterTable(editor, table) {
            var n = table.previousSibling;
            while (n && n.nodeType === 3 && !(n.nodeValue || '').trim()) n = n.previousSibling;
            if (n && n.nodeType === 3) {
                var rt = document.createRange();
                rt.setStart(n, n.nodeValue.length);
                rt.collapse(true);
                return rt;
            }
            if (n && n.nodeType === 1 && n.tagName !== 'TABLE') {
                var re = document.createRange();
                re.selectNodeContents(n);
                re.collapse(false);
                return re;
            }
            var m = table.nextSibling;
            while (m && m.nodeType === 3 && !(m.nodeValue || '').trim()) m = m.nextSibling;
            if (m && m.nodeType === 1 && m.tagName !== 'TABLE') {
                var rf = document.createRange();
                rf.setStart(m, 0);
                rf.collapse(true);
                return rf;
            }
            var p = editor.querySelector('p');
            if (!p) {
                p = document.createElement('p');
                p.innerHTML = '<br>';
                editor.appendChild(p);
            }
            var rg = document.createRange();
            rg.setStart(p, 0);
            rg.collapse(true);
            return rg;
        }
        function applyCaretRange(editor, sel, rr) {
            if (!editor.contains(rr.startContainer)) {
                var p = editor.querySelector('p');
                if (!p) {
                    p = document.createElement('p');
                    p.innerHTML = '<br>';
                    editor.appendChild(p);
                }
                rr = document.createRange();
                rr.setStart(p, 0);
                rr.collapse(true);
            }
            sel.removeAllRanges();
            sel.addRange(rr);
        }
        function removeTableAndPlaceCaret(editor, table) {
            ensureEditable(editor);
            var sel = window.getSelection();
            var rr = caretRangeAfterTable(editor, table);
            /* 优先用 execCommand('delete')，删表动作会写进 undo 栈，Ctrl+Z 可撤销；
               浏览器没删干净再手动移除 */
            var r = document.createRange();
            r.selectNode(table);
            sel.removeAllRanges();
            sel.addRange(r);
            var ok = false;
            try { ok = document.execCommand('delete', false, null); } catch (x) {}
            if (!(ok && !editor.contains(table))) {
                table.remove();
                /* 手动移除时浏览器不会派发 input，补一发让保存逻辑认账 */
                notifyInput(editor);
            }
            applyCaretRange(editor, sel, rr);
            rememberRange(editor);
        }
        function handleTableDelete(editor, e) {
            if (e.key !== 'Backspace' && e.key !== 'Delete') return false;
            var sel = window.getSelection();
            if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) return false;
            if (sel.getRangeAt(0).collapsed) return false;
            var table = selectedTable(editor);
            if (!table) return false;
            e.preventDefault();
            removeTableAndPlaceCaret(editor, table);
            return true;
        }

        /* 剪切整表：contenteditable 原生剪切只带走文字，这里把表格写进剪贴板再删 */
        editor.addEventListener('cut', function (e) {
            if (editor.getAttribute('contenteditable') !== 'true') return;
            var table = selectedTable(editor);
            if (!table) return;
            e.preventDefault();
            if (e.clipboardData) {
                e.clipboardData.setData('text/html', table.outerHTML);
                try { e.clipboardData.setData('text/plain', table.textContent || ''); } catch (x) {}
            }
            removeTableAndPlaceCaret(editor, table);
        });

        /* 公式（.katex-host）的键盘处理：公式保持可编辑（原生删除/撤销照常），
           只在两个时机接管：
           ① 退格/删除键落在公式上或紧贴公式 → 整块删掉，execCommand 写进 undo 栈，可撤销；
           ② 光标溜进公式内部时打字 → 先把光标弹到公式外面，再让字符正常输入。 */
        function caretHost() {
            var sel = window.getSelection();
            if (!sel || !sel.rangeCount) return null;
            var r = sel.getRangeAt(0);
            var n = r.startContainer;
            var el = n.nodeType === 1 ? n : n.parentNode;
            return (el && el.closest) ? el.closest('.katex-host') : null;
        }
        function placeCaretAfter(host) {
            var sel = window.getSelection();
            if (!sel) return;
            var rr = document.createRange();
            rr.setStartAfter(host);
            rr.collapse(true);
            sel.removeAllRanges();
            sel.addRange(rr);
        }
        /* 光标紧贴的前/后一个公式块（Backspace 看前面，Delete 看后面） */
        function adjacentHost(back) {
            var sel = window.getSelection();
            if (!sel || !sel.rangeCount) return null;
            var r = sel.getRangeAt(0);
            if (!r.collapsed) return null;
            var c = r.startContainer;
            if (c.nodeType === 3) {
                var atEdge = back ? (r.startOffset === 0) : (r.startOffset === c.nodeValue.length);
                if (!atEdge) return null;
                var sib = back ? c.previousSibling : c.nextSibling;
                while (sib && sib.nodeType === 3 && !sib.nodeValue.length) sib = back ? sib.previousSibling : sib.nextSibling;
                if (!sib || sib.nodeType !== 1) return null;
                if (sib.classList.contains('katex-host')) return sib;
                var d = back ? sib.lastElementChild : sib.firstElementChild;
                if (d && d.classList.contains('katex-host')) return d;
                return null;
            }
            var kids = c.childNodes;
            var node = kids[back ? r.startOffset - 1 : r.startOffset];
            if (!node || node.nodeType !== 1) return null;
            if (node.classList.contains('katex-host')) return node;
            var dd = back ? node.lastElementChild : node.firstElementChild;
            return (dd && dd.classList.contains('katex-host')) ? dd : null;
        }
        function deleteHost(host) {
            var sel = window.getSelection();
            var r = document.createRange();
            r.selectNode(host);
            sel.removeAllRanges();
            sel.addRange(r);
            var ok = false;
            try { ok = document.execCommand('delete', false, null); } catch (x) {}
            if (!ok || document.contains(host)) { try { host.parentNode.removeChild(host); } catch (x) {} }
        }
        function handleFormulaKeys(editor, e) {
            if (editor.getAttribute('contenteditable') !== 'true') return false;
            if (e.ctrlKey || e.metaKey || e.altKey) return false;
            var sel = window.getSelection();
            if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) return false;
            if (e.key === 'Backspace' || e.key === 'Delete') {
                var h = caretHost() || adjacentHost(e.key === 'Backspace');
                if (!h || !editor.contains(h)) return false;
                e.preventDefault();
                deleteHost(h);
                rememberRange(editor);
                return true;
            }
            /* 普通字符：光标在公式里就把光标弹到公式后面，避免打进公式内部 */
            if (e.key && e.key.length === 1) {
                var inside = caretHost();
                if (!inside) return false;
                placeCaretAfter(inside);
            }
            return false;
        }

        /* 兜底：上面只在 keydown 时弹光标，但输入法、execCommand('insertText')、
           粘贴等路径不经过 keydown。这里在真正写入前再拦一次（输入法交给
           compositionstart，避免打断正在拼字的 composition）。 */
        editor.addEventListener('beforeinput', function (e) {
            if (!e || e.inputType === 'insertCompositionText') return;
            if (editor.getAttribute('contenteditable') !== 'true') return;
            var inside = caretHost();
            if (!inside) return;
            placeCaretAfter(inside);
        });
        editor.addEventListener('compositionstart', function () {
            if (editor.getAttribute('contenteditable') !== 'true') return;
            var inside = caretHost();
            if (inside) placeCaretAfter(inside);
        });

        /* Ctrl/Cmd + B/I/U */
        editor.addEventListener('keydown', function (e) {
            if (handleFormulaKeys(editor, e)) return;
            if (handleTableDelete(editor, e)) return;
            if (handleBackspaceIntoHeading(editor, e)) return;
            if (handleEmptyHeadingEnter(editor, e)) return;
            if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
            var k = e.key ? e.key.toLowerCase() : '';
            var map = { b: 'bold', i: 'italic', u: 'underline' };
            if (!map[k]) return;
            e.preventDefault();
            restoreRange(editor);
            try { document.execCommand(map[k], false, null); } catch (x) {}
            syncFmt(bar);
        });

        /* 记光标 + 粘贴图片。lastEdAct 用来区分「真的在笔记框里动过」和「外面飘来的空光标」 */
        ['click', 'keyup', 'mouseup', 'touchend', 'input'].forEach(function (ev) {
            editor.addEventListener(ev, function () {
                lastEdAct = Date.now();
                rememberRange(editor);
            });
        });
        /* ---------- 粘贴 markdown → 富文本 ----------
           从别处复制来的原始 markdown（**加粗** / ### 标题 / - 列表 / |表格|）
           直接粘只会剩字面星号，这里自带一份轻量转换。
           $...$ / $$...$$ 全程优先保护（否则 * 会被当成斜体，把公式结构拆坏）。
           跨行 $$ 块整体占位后再转换，公式内容保持在同一文本节点。 */
    function mdToHtml(md) {
        var src = C.normalizeMathBlocks ? C.normalizeMathBlocks(md) : md;
        var maths = [];
        src = String(src == null ? '' : src).replace(/\$\$([\s\S]+?)\$\$/g, function (m) {
            maths.push(m);
            return '\u0000B' + (maths.length - 1) + '\u0000';
        });
        var html = C.mdToHtml(src, { paraJoin: '<br>', skipEmptyQuote: true });
        return html.replace(/\u0000B(\d+)\u0000/g, function (_, i) { return maths[+i]; });
    }
        /* 只接管「纯文本 + 确实像 markdown」的粘贴；
           剪贴板自带真富文本 HTML 的交给浏览器原样粘，不碰。 */
    function looksLikeMd(s) {
        return C.looksLikeMarkdown(s, { mode: 'note' }) || /\$\$/.test(s || '');
    }

        editor.addEventListener('paste', function (e) {
            var cd = e.clipboardData;
            if (!cd) return;
            var items = cd.items, hasImg = false;
            for (var i = 0; items && i < items.length; i++) {
                if (items[i].type && items[i].type.indexOf('image/') === 0) {
                    hasImg = true;
                    e.preventDefault();
                    readAndInsertImage(area, editor, items[i].getAsFile());
                    break;
                }
            }
            if (hasImg) return;
            var html = '';
            try { html = cd.getData('text/html') || ''; } catch (err) { html = ''; }
            /* 安卓剪贴板连纯文本都会附带一层 HTML 空壳（只有 meta/br/p/span 之类），
               必须当成纯文本走下面的 markdown 转换；真富文本与带内联样式的内容都先剥掉来源页配色 */
            var txt = '';
            try { txt = cd.getData('text/plain') || ''; } catch (err2) { txt = ''; }
            var rich = /<(table|thead|tbody|tr|td|th|strong|b|em|i|u|h[1-6]|ul|ol|li|img|pre|code|a|blockquote)[\s>]/i.test(html);
            var styled = /\bstyle\s*=/i.test(html);
            var isMd = txt && looksLikeMd(txt);
            if (html && (rich || (styled && !isMd))) {
                var clean = C.sanitizePastedHtml(html);
                if (clean) {
                    e.preventDefault();
                    insertHtmlAtCursor(editor, clean);
                    /* 网页图文里内嵌的 base64 图跟着进图床，正文只留引用。
                       有图没收录成功时要说一声，不然它会一直以原图内联在正文里 */
                    if (KB.ImageStore) {
                        KB.ImageStore.adoptInline(editor).then(function (r) {
                            if (r && r.total > r.ok && KB.UI && KB.UI.toast) {
                                KB.UI.toast('⚠️ 有 ' + (r.total - r.ok) + ' 张图没能存进图床，会以原图内联在笔记里');
                            }
                        });
                    }
                    lastEdAct = Date.now();
                    rememberRange(editor);
                    return;
                }
            }
            if (!isMd) return;  /* 普通文字 → 原样粘 */
            e.preventDefault();
            insertHtmlAtCursor(editor, mdToHtml(txt));
            lastEdAct = Date.now();
            rememberRange(editor);
        });

        /* 点图片：编辑态 → 选中调尺寸；非编辑态 → 浮层预览 */
        area.addEventListener('click', function (e) {
            var img = e.target.closest && e.target.closest('.note-editor img');
            if (!img) return;
            e.stopPropagation();
            var editing = editor.getAttribute('contenteditable') === 'true';
            if (editing) {
                editor.querySelectorAll('img').forEach(function (i) { i.classList.remove('rte-sel'); });
                img.classList.add('rte-sel');
                if (imgCtl) imgCtl.open(img);
            } else {
                openViewer(img.src);
            }
        }, true);
    }

    function syncFmt(bar) {
        C.syncFormatButtons(bar, 'on');
    }

    function pickImage(cb) {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.onchange = function () {
            if (this.files && this.files[0]) cb(this.files[0]);
            document.body.removeChild(inp);
        };
        inp.click();
    }

    function readAndInsertImage(area, editor, file) {
        C.readAndInsertImage(file, {
            editor: editor,
            alt: '笔记图片',
            mark: 'noteImg',
            insert: function (img) { insertNodeAtCursor(editor, img); },
            tip: function () { showTip('图片已插入 · 点图片可调尺寸，选「压缩」再点应用会真的压小'); }
        });
    }

    /* ======================= K. 观察页面，自动挂载 ========================= */
    function scan() {
        document.querySelectorAll('.card-note-area').forEach(attach);
    }

    /* ============ 笔记编辑态显示 LaTeX 原文 ======================
       笔记框一个框两用（编辑态 + 查看态）。进编辑态若不还原，看到的是
       KaTeX 拼出来的一堆 span，想改公式根本无从下手。现在：
         · 进编辑态 → 把已渲染的公式还原成 $...$ 源码，直接改；
         · 退出编辑（失焦 / 保存后）→ 再渲染回公式。
       · 光标尽量落在你点的地方：点普通文字原地不动，点公式则落到该公式源码末尾。
       · 已经还原过（没有 .katex-host）直接跳过，不会反复折腾。
       · 没留源码的老公式（无 data-tex）不动，免得丢内容。 */
    function hookEditSource() {
        var pendingRange = null;   /* 这一次点击落在哪，进编辑态后用来摆光标 */

        function pointRange(x, y) {
            try {
                if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
            } catch (e) {}
            if (document.caretPositionFromPoint) {
                var p = document.caretPositionFromPoint(x, y);
                if (!p) return null;
                var r = document.createRange();
                r.setStart(p.offsetNode, p.offset);
                r.collapse(true);
                return r;
            }
            return null;
        }

        /* 点下去时先记位置：此刻还是渲染态，但位置信息等下要用 */
        document.addEventListener('click', function (e) {
            var ed = e.target && e.target.closest ? e.target.closest('.note-editor') : null;
            if (!ed || ed.getAttribute('contenteditable') === 'true') { pendingRange = null; return; }
            var r = pointRange(e.clientX, e.clientY);
            pendingRange = (r && r.startContainer && ed.contains(r.startContainer)) ? r : null;
        }, true);

        /* 还原公式为源码，返回每个公式生成的文本节点（顺序与 .katex-host 一致） */
        function deflateTracked(root) {
            var out = [];
            root.querySelectorAll('.katex-host').forEach(function (host) {
                var tex = host.getAttribute('data-tex');
                if (!tex) { out.push(null); return; }   /* 占位，保证与 .katex-host 的索引一一对应 */
                var disp = host.getAttribute('data-disp') === '1';
                var txt = document.createTextNode(disp ? ('$$' + tex + '$$') : ('$' + tex + '$'));
                if (host.parentNode) { host.parentNode.replaceChild(txt, host); out.push(txt); }
            });
            return out;
        }

        function locate(ed, r) {
            if (!r || !r.startContainer || !ed.contains(r.startContainer)) return null;
            var hosts = ed.querySelectorAll('.katex-host');
            for (var i = 0; i < hosts.length; i++) {
                if (hosts[i].contains(r.startContainer)) return { host: i };
            }
            return { node: r.startContainer, offset: r.startOffset };
        }

        function putCaret(node, offset) {
            if (!node || !node.parentNode) return;
            try {
                var len = node.nodeValue ? node.nodeValue.length : 0;
                var r = document.createRange();
                r.setStart(node, Math.max(0, Math.min(offset, len)));
                r.collapse(true);
                var sel = window.getSelection();
                if (!sel) return;
                sel.removeAllRanges();
                sel.addRange(r);
            } catch (e) {}
        }

        document.addEventListener('focusin', function (e) {
            var ed = e.target && e.target.closest ? e.target.closest('.note-editor') : null;
            if (!ed) return;
            /* 子页的处理是先设 contenteditable 再 focus，走到这里应该已经是 true */
            if (ed.getAttribute('contenteditable') !== 'true') return;
            if (!ed.querySelector('.katex-host')) { pendingRange = null; return; }
            var info = locate(ed, pendingRange);
            pendingRange = null;
            var made = deflateTracked(ed);
            if (!info) return;
            if (info.host !== undefined) {
                var t = made[info.host];
                if (t) putCaret(t, t.nodeValue.length);   /* 点在公式里 → 光标落到源码末尾 */
            } else {
                putCaret(info.node, info.offset);         /* 点在普通文字 → 原地不动 */
            }
        }, true);

        document.addEventListener('focusout', function (e) {
            var ed = e.target && e.target.closest ? e.target.closest('.note-editor') : null;
            if (!ed) return;
            /* 子页的 focusout 处理（把 contenteditable 设回 false）在冒泡阶段跑，等它跑完 */
            setTimeout(function () {
                if (ed.getAttribute('contenteditable') !== 'true') renderMathIn(ed);
            }, 60);
        }, true);
    }

    function start() {
        scan();
        hookEditSource();
        var mo = new MutationObserver(function () { scan(); });
        mo.observe(document.body, { childList: true, subtree: true });
        /* 老笔记里的公式也渲染一遍 */
        setTimeout(function () {
            document.querySelectorAll('.note-editor').forEach(function (ed) {
                if (ed.getAttribute('contenteditable') !== 'true') renderMathIn(ed);
            });
        }, 400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    KB.RichNote = {
        attach: attach,
        renderMathIn: renderMathIn,
        openViewer: openViewer,
        /* 给「自动保存」用。把一段 HTML 里的已渲染公式还原成 $...$ 源码，
           但在离屏副本上做，不动页面上的编辑器（动了还要再渲染回来，容易闪）。 */
        deflateMathHtml: function (html) {
            try {
                var div = document.createElement('div');
                div.innerHTML = String(html || '');
                deflateMath(div);
                return div.innerHTML;
            } catch (e) { return String(html || ''); }
        }
    };
})();
