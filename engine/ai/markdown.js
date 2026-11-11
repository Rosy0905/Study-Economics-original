/* AI 答疑助手：Markdown 与公式渲染。
   与卡片正文的行分类是两套语法：这边面向对话回复，认代码块、标题、引用、
   表格与 LaTeX 公式；那边面向纯文本答案，认行首标记。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  function create(opt) {
    var util = opt.util;
    var escapeHtml = util.escapeHtml;

    function katexReady() { return !!(global.katex && global.katex.renderToString); }

    function renderFormula(expr, displayMode) {
      var trimmed = expr.trim();
      if (katexReady()) {
        try {
          return global.katex.renderToString(trimmed, {
            displayMode: displayMode,
            throwOnError: false,
            strict: false,
            trust: false,
            output: 'html'
          });
        } catch (e) {}
      }
      var open = displayMode ? '$$' : '$';
      var close = displayMode ? '$$' : '$';
      return '<span class="ai-formula-fallback">' + open + escapeHtml(trimmed) + close + '</span>';
    }

    function inlineMD(text) {
      var t = text;
      t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
      return t;
    }

    function splitTableRow(line) {
      var s = line.trim();
      if (s.charAt(0) === '|') s = s.slice(1);
      if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
      return s.split('|').map(function (c) { return c.trim(); });
    }

    function renderTable(tableLines) {
      if (tableLines.length < 2) return tableLines.join('\n');
      var headerCells = splitTableRow(tableLines[0]);
      var bodyRows = tableLines.slice(2).map(splitTableRow);
      var html = '<div class="ai-table-wrap"><table class="ai-table"><thead><tr>';
      for (var i = 0; i < headerCells.length; i++) {
        html += '<th>' + inlineMD(headerCells[i]) + '</th>';
      }
      html += '</tr></thead><tbody>';
      for (var r = 0; r < bodyRows.length; r++) {
        html += '<tr>';
        for (var c = 0; c < bodyRows[r].length; c++) {
          html += '<td>' + inlineMD(bodyRows[r][c]) + '</td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table></div>';
      return html;
    }

    function renderMD(text) {
      if (!text) return '';
      var t = text;

      var codeBlocks = [];
      t = t.replace(/```[^\n]*\n?([\s\S]*?)```/g, function (m, code) {
        var idx = codeBlocks.length;
        codeBlocks.push(code.replace(/\n$/, ''));
        return '\u0000CB' + idx + '\u0000';
      });

      var formulas = [];
      function pushFormula(expr, display) {
        var idx = formulas.length;
        formulas.push({ expr: expr, display: display });
        return '\u0000FM' + idx + '\u0000';
      }

      t = t.replace(/\$\$([\s\S]+?)\$\$/g, function (m, expr) { return pushFormula(expr, true); });
      t = t.replace(/\\\[([\s\S]+?)\\\]/g, function (m, expr) { return pushFormula(expr, true); });
      t = t.replace(/\$([^\$\n]+?)\$/g, function (m, expr) {
        var e = expr.trim();
        if (!e) return m;
        if (/^[\d\s,\.]+$/.test(e)) return e;
        if (/^[\u4e00-\u9fa5\u3000-\u303f]+$/.test(e)) return e;
        if (e.length > 150) return m;
        return pushFormula(expr, false);
      });
      t = t.replace(/\\\(([\s\S]+?)\\\)/g, function (m, expr) { return pushFormula(expr, false); });

      t = escapeHtml(t);

      var lines = t.split('\n');
      var out = [];
      var i = 0;
      var tableRegex = /^\s*\|.*\|\s*$/;
      var sepRegex = /^\s*\|[\s\-:|]+\|\s*$/;
      var quoteRegex = /^\s*&gt;\s?(.*)$/;

      while (i < lines.length) {
        var line = lines[i];
        if (tableRegex.test(line) && i + 1 < lines.length && sepRegex.test(lines[i + 1])) {
          var tableLines = [line, lines[i + 1]];
          i += 2;
          while (i < lines.length && tableRegex.test(lines[i])) {
            tableLines.push(lines[i]);
            i++;
          }
          out.push(renderTable(tableLines));
          continue;
        }
        if (quoteRegex.test(line)) {
          var quoteLines = [];
          while (i < lines.length && quoteRegex.test(lines[i])) {
            var mm = lines[i].match(quoteRegex);
            if (mm[1].trim()) quoteLines.push(mm[1]);
            i++;
          }
          out.push('<blockquote>' + quoteLines.join('<br>') + '</blockquote>');
          continue;
        }
        if (/^\s*[-*_]{3,}\s*$/.test(line)) { i++; continue; }
        out.push(line);
        i++;
      }
      t = out.join('\n');

      t = t.replace(/^#{4,6}\s+(.+)$/gm, '<h5>$1</h5>');
      t = t.replace(/^###\s+(.+)$/gm, '<h4>$1</h4>');
      t = t.replace(/^##\s+(.+)$/gm, '<h3>$1</h3>');
      t = t.replace(/^#\s+(.+)$/gm, '<h3>$1</h3>');
      t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
      t = t.replace(/^[ \t]*[-*+]\s+(.+)$/gm, '<li>$1</li>');
      t = t.replace(/^[ \t]*\d+\.\s+(.+)$/gm, '<li>$1</li>');
      t = t.replace(/(?:<li>[\s\S]*?<\/li>\s*)+/g, function (m) {
        return '<ul>' + m.replace(/\n+/g, '') + '</ul>';
      });
      t = t.replace(/\n{2,}/g, '</p><p>');
      t = t.replace(/\n/g, '<br>');
      t = '<p>' + t + '</p>';

      t = t.replace(/\u0000FM(\d+)\u0000/g, function (m, idx) {
        var f = formulas[+idx];
        if (!f) return '';
        var rendered = renderFormula(f.expr, f.display);
        return f.display ? '<div class="ai-formula-block">' + rendered + '</div>' : rendered;
      });
      t = t.replace(/\u0000CB(\d+)\u0000/g, function (m, idx) {
        var code = codeBlocks[+idx] || '';
        return '<pre class="ai-code"><code>' + escapeHtml(code) + '</code></pre>';
      });

      t = t.replace(/<p>\s*(<pre|<ul|<ol|<h[3-6]|<blockquote|<div class="ai-formula-block"|<div class="ai-table-wrap")/g, '$1');
      t = t.replace(/(<\/pre>|<\/ul>|<\/ol>|<\/h[3-6]>|<\/blockquote>|<\/div>)\s*<\/p>/g, '$1');
      t = t.replace(/<p>\s*<\/p>/g, '');
      t = t.replace(/(<(?:pre|ul|ol|h[3-6]|blockquote|div)[^>]*>)<br>/g, '$1');
      t = t.replace(/<br>(<\/(?:pre|ul|ol|h[3-6]|blockquote|div)>)/g, '$1');
      t = t.replace(/(<\/(?:pre|ul|ol|h[3-6]|blockquote|div)>)<br>/g, '$1');

      return t;
    }

    return {
      renderMD: renderMD,
      renderFormula: renderFormula,
      inlineMD: inlineMD,
      splitTableRow: splitTableRow,
      renderTable: renderTable,
      katexReady: katexReady
    };
  }

  KB.AIMarkdown = { create: create };
})(window);
