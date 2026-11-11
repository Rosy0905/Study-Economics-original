/* 表格渲染：结构只在这里生成一次，两种渲染器各自把单元格内容交给自己的 inline。
   单元格里可能有公式或加粗，所以这里只拼 td/th，不碰文字。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  /* rows[0] 是表头；每一行第一格当行头，跟答案册的 td.rh 对应 */
  function render(rows, cell) {
    if (!rows || !rows.length) return '';

    function cellHtml(tag, text, cls) {
      return '<' + tag + (cls ? ' class="' + cls + '"' : '') + '>' + cell(text) + '</' + tag + '>';
    }

    var head = rows[0]
      .map(function (text) { return cellHtml('th', text); })
      .join('');

    var body = rows
      .slice(1)
      .map(function (row) {
        return (
          '<tr>' +
          row
            .map(function (text, i) {
              return i === 0 ? cellHtml('td', text, 'rh') : cellHtml('td', text);
            })
            .join('') +
          '</tr>'
        );
      })
      .join('');

    return (
      '<div class="tb-wrap"><table>' +
      '<thead><tr>' + head + '</tr></thead>' +
      (body ? '<tbody>' + body + '</tbody>' : '') +
      '</table></div>'
    );
  }

  KB.Table = { render: render };
})(window);
