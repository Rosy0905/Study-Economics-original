/* unicode 渲染器：公式当纯文本显示。
   对外只有 inline / block 两个方法，与 latex 渲染器完全一致。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});
  var Lines = KB.Lines;
  var Html = KB.Html;

  /* 加粗只认「前面不是字母数字」的 **。
     答案里的数学记号 Q**、p** 不能被当成加粗的起止符。 */
  function emphasize(escaped) {
    return escaped.replace(/(^|[^\w*])\*\*(.+?)\*\*/g, '$1<strong>$2</strong>');
  }

  function inline(text) {
    return emphasize(Html.escape(text));
  }

  function block(text) {
    return Lines.parse(text)
      .map(function (seg) {
        if (seg.type === 'table') return KB.Table.render(seg.rows, inline);
        if (seg.type === 'fm') return '<p class="fm">' + inline(seg.text) + '</p>';
        if (seg.type === 'fig') return '<p class="fig' + (seg.compact ? ' fig-compact' : '') + '">' + inline(seg.text) + '</p>';
        if (seg.type === 'detail') return '<p class="detail">' + inline(seg.text) + '</p>';
        if (seg.type === 'sub') return Html.openP(seg, 'sub') + inline(seg.text) + '</p>';
        return Html.openP(seg, seg.cont ? 'cont' : '') + inline(seg.text) + '</p>';
      })
      .join('');
  }

  /* 单条块级公式：题库页题干用。unicode 就是原样一段等宽公式文本，
     不带任何底色——题干是白底，压色块只会脏。 */
  function formula(text) {
    return '<span class="q-fm">' + Html.escape(String(text == null ? '' : text)) + '</span>';
  }

  KB.Renderer = KB.Renderer || {};
  KB.Renderer.unicode = { inline: inline, block: block, formula: formula };
})(window);
