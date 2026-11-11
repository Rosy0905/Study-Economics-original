/* HTML 公共件：转义、段落开标签。
   两个公式渲染器与页面组件都要用，但它不属于任何一边，所以单独一份——
   换渲染器、加新组件都不用复制这两段。

   加载顺序：必须排在 ui.js 与 render/ 之前。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  /* 先解码再转义：数据里混着裸的 < 和已经写成 &lt; 的实体，同一个句子里都可能两种混用。
     直接转义会把 &lt; 变成 &amp;lt;，浏览器显示成字面的 &lt;。 */
  function decodeEntities(s) {
    return String(s == null ? '' : s)
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* 纯文本一律走这里：题干、答案、公式源码、提示文案 */
  function safeText(s) {
    if (s === null || s === undefined) return '';
    return escapeHtml(decodeEntities(s));
  }

  /* 段落开标签：把行类型和「行首全角标点」一起挂成类。
     后者只用来减一截首行缩进（见 components.css 的 p.hang），不改别的。 */
  function openP(seg, base) {
    var cls = base || '';
    if (!seg.cont && KB.Lines && KB.Lines.hang && KB.Lines.hang(seg.text)) {
      cls = cls ? cls + ' hang' : 'hang';
    }
    return '<p' + (cls ? ' class="' + cls + '"' : '') + '>';
  }

  /* 题干排版：纯文本原样，空格对齐的表格换成真表格，行首 $$ 的整行出块级公式。
     题干和答案共用同一套公式语法（$…$ 行内、行首 $$ 整行），只是题干不分段、
     保留原文的换行，所以这里把几段直接拼回一条文本，不包 <p>。
     卡片与答案册都用这一份。 */
  function stemHtml(text, r) {
    return KB.Lines.parseStem(text)
      .map(function (seg) {
        if (seg.type === 'table') return KB.Table.render(seg.rows, r.inline);
        if (seg.type === 'fm') return r.formula(seg.text, true);
        return r.inline(seg.text);
      })
      .join('');
  }

  /* 全站只认这一个转义出口；旧名 KB.escape 保留给各模块的 `var esc = KB.escape`。
     escape 是纯文本语义（先解码再转义），纯转义另留 escapeRaw 给已确认无实体的场景。 */
  KB.escape = safeText;
  KB.Html = {
    escape: safeText,
    escapeRaw: escapeHtml,
    decode: decodeEntities,
    openP: openP,
    stem: stemHtml
  };
})(window);
