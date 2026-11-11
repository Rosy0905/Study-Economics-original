/* 富文本公共内核：两份编辑器共用的纯算法与可注入能力。
   页面外壳负责 DOM、状态与保存时机；页面差异通过 opt 注入，这里不按页面分叉。 */
(function (global) {
    'use strict';

    var KB = global.KB || (global.KB = {});
    var doc = global.document;

    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function isTableRow(s) { return /^\s*\|.*\|\s*$/.test(s); }
    function isTableSep(s) { return /^\s*\|?[\s:\-|]+\|[\s:\-|]*$/.test(s) && /-/.test(s); }
    function splitRow(s) {
        return s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (x) { return x.trim(); });
    }

    /* 行内标记转换：先保护 $...$ / $$...$$，避免 * 斜体破坏 LaTeX 结构 */
    function inlineMd(s) {
        var t = escapeHtml(s), maths = [];
        t = t.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, function (m) {
            maths.push(m);
            return '\u0000M' + (maths.length - 1) + '\u0000';
        });
        t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
        t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
        t = t.replace(/~~([^~]+)~~/g, '<s>$1</s>');
        t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        t = t.replace(/\u0000M(\d+)\u0000/g, function (_, i) { return maths[+i]; });
        return t;
    }

    /* 记下的选区边界点可能已随 DOM 重绘脱离文档，用之前先判一次 */
    function rangeIsStale(range) {
        if (!range) return false;
        try {
            if (doc.body.contains(range.startContainer) && doc.body.contains(range.endContainer)) return false;
        } catch (e) {}
        return true;
    }

    /* 系统抖动产生的空光标不算真实选区：点工具栏或触摸时会清掉选区再塞回一个 */
    function liveCaretIsBogus(opt) {
        var o = opt || {};
        var sel = global.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        var r;
        try { r = sel.getRangeAt(0); } catch (e) { return false; }
        if (!r.collapsed) return false;
        if (!o.savedRange) return false;
        if (!o.savedRange.collapsed) return true;
        return Date.now() < (o.pressUntil || 0);
    }

    function syncFormatButtons(bar, activeClass) {
        if (!bar) return;
        ['bold', 'italic', 'underline'].forEach(function (cmd) {
            var b = bar.querySelector('button[data-cmd="' + cmd + '"]');
            if (!b) return;
            var on = false;
            try { on = doc.queryCommandState(cmd); } catch (e) {}
            b.classList.toggle(activeClass || 'on', !!on);
        });
    }

    /* 插图共用流程：瘦身与入库排队执行，页面只注入容器、插入方式与提示 */
    function readAndInsertImage(file, opt) {
        var o = opt || {};
        if (!file) return;
        /* 与 AI 附件同口径：超大图在瘦身完成前会以完整 base64 待在内存里 */
        var maxBytes = o.maxBytes || 12 * 1024 * 1024;
        if (file.size && file.size > maxBytes) {
            if (KB.UI && KB.UI.toast) KB.UI.toast('⚠️ 图片超过 12MB，请先压缩后再插入');
            return;
        }
        if (KB.Store && KB.Store.warnIfLow) KB.Store.warnIfLow();
        var reader = new FileReader();
        reader.onload = function (ev) {
            var img = doc.createElement('img');
            img.src = ev.target.result;
            img.alt = o.alt || '图片';
            img.__origSrc = ev.target.result;
            if (o.mark) img.dataset[o.mark] = 'true';
            var probe = new Image();
            probe.onload = function () {
                img.__pxW = probe.naturalWidth || 0;
                img.__pxH = probe.naturalHeight || 0;
                /* 显示宽度存占容器的百分比，编辑器与卡片答案区各按自己的容器算 */
                KB.ImgCtl.setRatio(img, KB.ImgCtl.insertRatio(o.editor, img.__pxW));
            };
            probe.src = ev.target.result;
            KB.ImgCtl.shrink(img, ev.target.result).then(function () { return KB.ImgCtl.store(img); });
            o.insert(img);
            if (o.tip) o.tip();
        };
        reader.readAsDataURL(file);
    }

    /* 整段 Markdown 转 HTML。页面差异只剩两个口径：段落换行与空引用行是否保留 */
    function mdToHtml(md, opt) {
        var o = opt || {};
        var paraJoin = o.paraJoin || '<br>';
        var skipEmptyQuote = !!o.skipEmptyQuote;
        var src = String(md || '').replace(/\r\n?/g, '\n');
        var fences = [];
        src = src.replace(/```[^\n]*\n([\s\S]*?)```/g, function (m, code) {
            fences.push('<pre><code>' + escapeHtml(code.replace(/\n+$/, '')) + '</code></pre>');
            return '\n\u0000F' + (fences.length - 1) + '\u0000\n';
        });
        var lines = src.split('\n'), out = [], i = 0;
        while (i < lines.length) {
            var line = lines[i];
            if (!line.trim()) { i++; continue; }
            var fm = line.trim().match(/^\u0000F(\d+)\u0000$/);
            if (fm) { out.push(fences[+fm[1]] || ''); i++; continue; }

            if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
                var head = splitRow(line); i += 2; var rows = [];
                while (i < lines.length && isTableRow(lines[i])) { rows.push(splitRow(lines[i])); i++; }
                out.push('<table><thead><tr>' +
                    head.map(function (h) { return '<th>' + inlineMd(h) + '</th>'; }).join('') +
                    '</tr></thead><tbody>' +
                    rows.map(function (r) {
                        return '<tr>' + head.map(function (_, ci) { return '<td>' + inlineMd(r[ci] || '') + '</td>'; }).join('') + '</tr>';
                    }).join('') + '</tbody></table>');
                continue;
            }
            var h = line.match(/^(#{1,6})\s+(.*)$/);
            if (h) { var lv = Math.min(6, h[1].length); out.push('<h' + lv + '>' + inlineMd(h[2]) + '</h' + lv + '>'); i++; continue; }
            if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { out.push('<hr>'); i++; continue; }
            if (/^\s*>\s?/.test(line)) {
                var q = [];
                while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                    var qc = lines[i].replace(/^\s*>\s?/, '');
                    if (!skipEmptyQuote || qc.trim()) q.push(qc);
                    i++;
                }
                out.push('<blockquote>' + q.map(inlineMd).join('<br>') + '</blockquote>');
                continue;
            }
            if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
                var ordered = /^\s*\d+[.)]\s+/.test(line), items = [];
                while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
                    items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '')); i++;
                }
                out.push('<' + (ordered ? 'ol' : 'ul') + '>' +
                    items.map(function (t) { return '<li>' + inlineMd(t) + '</li>'; }).join('') +
                    '</' + (ordered ? 'ol' : 'ul') + '>');
                continue;
            }
            var para = [];
            while (i < lines.length && lines[i].trim() &&
                   !/^\s*>\s?/.test(lines[i]) &&
                   !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) &&
                   !/^#{1,6}\s+/.test(lines[i]) &&
                   !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1])) &&
                   !/^\u0000F\d+\u0000$/.test(lines[i].trim())) {
                para.push(lines[i]); i++;
            }
            if (!para.length) { i++; continue; }
            out.push('<p>' + para.map(inlineMd).join(paraJoin) + '</p>');
        }
        return out.join('');
    }

    /* 公式定界归一：模型回复常把行间公式写成 \[...\]，行内写成 \(...\)，
       卡片渲染只认 $ 定界符，这里先统一。\[1\] 这类纯数字是文献标记，不当公式。
       块内空行会把 $$...$$ 切成多个段落节点，渲染时匹配不到，顺手压成单换行。 */
    function normalizeMathBlocks(s) {
        return String(s == null ? '' : s)
            .replace(/\\\[([\s\S]+?)\\\]/g, function (m, expr) {
                var t = expr.trim();
                if (!t || t.indexOf('$') >= 0 || /^[\d\s,.\-]+$/.test(t)) return m;
                return '$$' + expr + '$$';
            })
            .replace(/\\\(([\s\S]+?)\\\)/g, function (m, expr) {
                var t = expr.trim();
                if (!t || t.indexOf('$') >= 0 || /^[\d\s,.\-]+$/.test(t)) return m;
                return '$' + expr + '$';
            })
            .replace(/\$\$([\s\S]+?)\$\$/g, function (m, expr) {
                var body = expr.replace(/\n[ \t]*\n+/g, '\n').trim();
                return body ? '$$' + body + '$$' : m;
            });
    }

    /* 粘贴内容是否像 Markdown：两处判据不同，按 mode 选择，不各自维护一份正则 */
    function looksLikeMarkdown(s, opt) {
        var mode = (opt && opt.mode) || 'card';
        if (mode === 'note') {
            return /(^|\n)\s{0,3}#{1,6}\s+/.test(s) ||
                /\*\*[^*\n]+\*\*/.test(s) ||
                /(^|\n)\s*([-*+]|\d+[.)])\s+/.test(s) ||
                /(^|\n)\s*\|.+\|\s*$/.test(s) ||
                /^\s*>\s?/m.test(s);
        }
        return /(^|\n)\s{0,3}#{1,6}\s/.test(s) ||
            /\*\*|__/.test(s) ||
            /\$\$/.test(s) ||
            /(^|\n)[^\n]*\|[^\n]*\|/.test(s) ||
            /(^|\n)\s*[-*+]\s+\S/.test(s) ||
            /(^|\n)\s*\d+[.)]\s+\S/.test(s) ||
            /```/.test(s);
    }

    /* 粘贴清洗：外部网页的 HTML 会带来源页的配色、字号与背景，留在编辑器里
       会让后续输入的文字继承底色。这里只保留结构标签与图片尺寸，样式一律剥掉。
       图片显示宽度存在 style="width:65%"，data-insw 是还原基准，两者都必须留住。 */
    var DROP_TAG = /^(STYLE|META|LINK|TITLE|SCRIPT|HEAD|BASE|XML|IFRAME|OBJECT|EMBED|FORM|INPUT|BUTTON|TEXTAREA|SELECT)$/;
    var KEEP_STYLE = /^(width|height|max-width|min-width)$/i;
    var KEEP_ATTR = /^(src|href|alt|width|height|colspan|rowspan|target|rel)$/i;

    function sanitizePastedHtml(html) {
        var raw = String(html || '');
        if (!raw.trim()) return '';
        var parsed;
        try { parsed = new DOMParser().parseFromString(raw, 'text/html'); }
        catch (e) { return ''; }
        var root = parsed.body;
        if (!root) return '';

        var showAll = global.NodeFilter ? global.NodeFilter.SHOW_ALL : -1;
        var nodes = [], walker = parsed.createTreeWalker(root, showAll, null, false), node;
        while ((node = walker.nextNode())) nodes.push(node);

        nodes.forEach(function (n) {
            if (n.nodeType === 8) {
                if (n.parentNode) n.parentNode.removeChild(n);
                return;
            }
            if (n.nodeType !== 1) return;
            var tag = n.tagName.toUpperCase();
            /* 来源页的样式定义、命名空间标签与 Office 私有标签整段删掉 */
            if (DROP_TAG.test(tag) || tag.indexOf(':') >= 0) {
                if (n.parentNode) n.parentNode.removeChild(n);
                return;
            }
            var names = [], i;
            for (i = 0; i < n.attributes.length; i++) names.push(n.attributes[i].name);
            names.forEach(function (name) {
                var low = name.toLowerCase();
                if (low === 'style') {
                    var kept = [];
                    (n.getAttribute(name) || '').split(';').forEach(function (decl) {
                        var p = decl.indexOf(':');
                        if (p < 0) return;
                        if (KEEP_STYLE.test(decl.slice(0, p).trim())) kept.push(decl.trim());
                    });
                    if (kept.length) n.setAttribute('style', kept.join('; '));
                    else n.removeAttribute('style');
                } else if (KEEP_ATTR.test(low) || low.indexOf('data-') === 0) {
                    /* 结构属性与图片基准数据保留 */
                    if ((low === 'src' || low === 'href') && /^\s*javascript:/i.test(n.getAttribute(name) || '')) {
                        n.removeAttribute(name);
                    }
                } else {
                    n.removeAttribute(name);
                }
            });
        });
        return root.innerHTML;
    }

    /* 统一门面：页面装配层只认 KB.Editor，不直接摸内核实现 */
    KB.Editor = KB.EditorCore = {
        escapeHtml: escapeHtml,
        isTableRow: isTableRow,
        isTableSep: isTableSep,
        splitRow: splitRow,
        inlineMd: inlineMd,
        mdToHtml: mdToHtml,
        normalizeMathBlocks: normalizeMathBlocks,
        looksLikeMarkdown: looksLikeMarkdown,
        rangeIsStale: rangeIsStale,
        liveCaretIsBogus: liveCaretIsBogus,
        syncFormatButtons: syncFormatButtons,
        readAndInsertImage: readAndInsertImage,
        sanitizePastedHtml: sanitizePastedHtml
    };
})(window);
