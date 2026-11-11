/* latex 渲染器：$…$ 行内公式、$$…$$ 块级公式交给 KaTeX。
   对外接口与 unicode 渲染器一致，调用方不需要判断用的是哪一个。
   不含 $ 的内容按 unicode 同样处理，两种写法可以混排。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});
  var Lines = KB.Lines;
  var Html = KB.Html;

  /* 占位符必须不会出现在正文里，用控制字符包住下标 */
  var PLACE = /\u0001(\d+)\u0001/g;

  function renderMath(src, display) {
    if (!global.katex || typeof global.katex.renderToString !== 'function') {
      return '<code class="math-fallback">' + Html.escape(src) + '</code>';
    }
    try {
      return global.katex.renderToString(src, {
        displayMode: display,
        throwOnError: false,
        strict: false,
        output: 'html'
      });
    } catch (err) {
      return '<code class="math-fallback">' + Html.escape(src) + '</code>';
    }
  }

  function inline(text) {
    var store = [];
    var src = String(text == null ? '' : text);

    /* 先取公式，再转义，最后把公式塞回去。
       顺序不能反，否则公式里的 < 会先被转义成实体，KaTeX 收到的是坏的源码。 */
    src = src.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, function (all, block, line) {
      var display = block != null;
      store.push(renderMath(display ? block : line, display));
      return '\u0001' + (store.length - 1) + '\u0001';
    });

    var html = Html.escape(src).replace(/(^|[^\w*])\*\*(.+?)\*\*/g, '$1<strong>$2</strong>');

    return html.replace(PLACE, function (all, i) {
      return store[Number(i)];
    });
  }

  function block(text) {
    return Lines.parse(text)
      .map(function (seg) {
        if (seg.type === 'table') return KB.Table.render(seg.rows, inline);
        /* 行首 $$ 标记出来的整行公式，直接交 KaTeX 排，不再走转义 */
        if (seg.type === 'fm') return '<p class="fm">' + renderMath(seg.text, true) + '</p>';
        if (seg.type === 'detail') return '<p class="detail">' + inline(seg.text) + '</p>';
        if (seg.type === 'fig') return '<p class="fig' + (seg.compact ? ' fig-compact' : '') + '">' + inline(seg.text) + '</p>';
        if (seg.type === 'sub') return Html.openP(seg, 'sub') + inline(seg.text) + '</p>';
        return Html.openP(seg, seg.cont ? 'cont' : '') + inline(seg.text) + '</p>';
      })
      .join('');
  }

  /* 单条块级公式：题干用，交 KaTeX 按显示公式排。
     KaTeX 不可用时退回纯文本 code，不至于把题干开个天窗。 */
  function formula(text) {
    return renderMath(String(text == null ? '' : text), true);
  }

  KB.Renderer = KB.Renderer || {};
  KB.Renderer.latex = { inline: inline, block: block, formula: formula };
})(window);
