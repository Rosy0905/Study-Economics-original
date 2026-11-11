/* 个人数据层：笔记与题目改动。
   两者都只存本机，不回写 data/ 下的数据文件；渲染时覆盖上去，
   所以刷新、换设备打开都能看到自己改过的样子，原始数据始终没被碰过。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  var moduleId = null;
  var notes = {};
  var edits = {};

  function init(id) {
    moduleId = id;
    notes = KB.Store.get(id, 'notes', {}) || {};
    edits = KB.Store.get(id, 'edits', {}) || {};
  }

  function noteOf(id) {
    return notes[id] || '';
  }

  /* 存编辑器内容本身，不存纯文本：二期加图片时不用迁移已有笔记 */
  function setNote(id, html) {
    var v = String(html == null ? '' : html).trim();
    if (v && v !== '<br>') notes[id] = v;
    else delete notes[id];
    KB.Store.set(moduleId, 'notes', notes);
    return !!notes[id];
  }

  function clearNote(id) {
    delete notes[id];
    KB.Store.set(moduleId, 'notes', notes);
  }

  /* 记录的是原始文本，不是排版后的 HTML：
     排版会把 ** 和 $$ 变成样式，再取文本时就丢了标记，一保存样式就降级。 */
  function setEdit(id, question, answer) {
    edits[id] = { question: String(question), answer: String(answer) };
    KB.Store.set(moduleId, 'edits', edits);
  }

  /* 渲染前套用：只覆盖真被改过的字段，其余字段原样带过去 */
  function apply(card) {
    var ed = edits[card.id];
    if (!ed) return card;

    var out = {};
    Object.keys(card).forEach(function (k) {
      out[k] = card[k];
    });
    if (typeof ed.question === 'string' && ed.question) out.question = ed.question;
    if (typeof ed.answer === 'string' && ed.answer) out.answer = ed.answer;
    return out;
  }

  function applyAll(list) {
    return list.map(apply);
  }

  KB.UserData = {
    init: init,
    noteOf: noteOf,
    setNote: setNote,
    clearNote: clearNote,
    setEdit: setEdit,
    apply: apply,
    applyAll: applyAll
  };
})(window);
