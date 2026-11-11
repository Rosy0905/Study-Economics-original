/* 笔记：卡片下方一块可写区域。
   默认只读，点文本框才进入编辑，移出焦点或保存后回到只读，
   避免"点过笔记的卡一打开就在编辑态"。

   占位提示用伪元素画，不往编辑器里塞占位节点，保存时就不用再把它剔除。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  function cardOf(listEl, id) {
    return listEl.querySelector('.card-item[data-id="' + id + '"]');
  }

  function isEmptyHtml(html) {
    var v = String(html || '').replace(/\s+/g, '');
    return !v || v === '<br>' || v === '<div><br></div>';
  }

  /* 空态挂在 data-empty 上，样式里配一条 ::before 显示提示 */
  function syncEmpty(editor) {
    if (isEmptyHtml(editor.innerHTML)) editor.setAttribute('data-empty', '1');
    else editor.removeAttribute('data-empty');
  }

  function editorOf(listEl, id) {
    var card = cardOf(listEl, id);
    return card ? card.querySelector('.note-editor') : null;
  }

  function toggle(listEl, id) {
    var card = cardOf(listEl, id);
    if (!card) return;

    var area = card.querySelector('.card-note-area');
    var btn = card.querySelector('.btn-note');
    var editor = card.querySelector('.note-editor');
    var open = !area.classList.contains('open');

    area.classList.toggle('open', open);

    if (open) {
      btn.classList.add('active');
      syncEmpty(editor);
    } else {
      /* 收起只回到只读，不动内容；按钮跟面板一起灭，与答案收起时同一条规则 */
      editor.setAttribute('contenteditable', 'false');
      btn.classList.remove('active');
    }
  }

  /* 答案展开/收起时笔记跟着走：
     有笔记的卡展开答案，笔记一并露面；收起答案，笔记一并收走。
     没有笔记的卡展开时不弹一个空面板出来。 */
  function followAnswer(listEl, id, open) {
    var card = cardOf(listEl, id);
    if (!card) return;

    var area = card.querySelector('.card-note-area');
    if (!area) return;

    var btn = card.querySelector('.btn-note');

    if (open) {
      if (!KB.UserData.noteOf(id)) return;
      area.classList.add('open');
      if (btn) btn.classList.add('active');
      var editor = card.querySelector('.note-editor');
      if (editor) syncEmpty(editor);
    } else {
      area.classList.remove('open');
      if (btn) btn.classList.remove('active');
    }
  }

  /* 三处落盘共用这一段：写库、对账图床、点亮按钮。
     工具栏保存、自动保存（停手／失焦／切标签／关窗口）、图片「应用」都走它。 */
  function writeNote(editor) {
    if (!editor || !editor.dataset.id) return false;

    var id = editor.dataset.id;
    var oldRaw = KB.UserData.noteOf(id);
    var next = serialize(editor);
    var has = KB.UserData.setNote(id, next);
    /* 保存后对账：正文里删掉的图，图床里跟着清掉 */
    if (KB.Blobs) KB.Blobs.syncNoteRefs(oldRaw, next);

    /* 老笔记里还留着内联图时补一次票：图搬进图床、正文换引用。
       先按原样落盘保证不丢字，补票回来只在内容没再变过时替换；
       期间又编辑过就放弃这次，交给下一次保存继续补 */
    if (KB.ImageStore && next.indexOf('data:image/') !== -1) {
      KB.ImageStore.migrateHtml(next).then(function (migrated) {
        if (!migrated || migrated === next) return;
        if (serialize(editor) !== next) return;
        var now = KB.UserData.noteOf(id);
        if (now !== next) return;
        KB.UserData.setNote(id, migrated);
        if (KB.Blobs) KB.Blobs.syncNoteRefs(now, migrated);
      }).catch(function () {});
    }

    var card = editor.closest('.card-item');
    var btn = card && card.querySelector('.btn-note');
    if (btn) btn.classList.toggle('active', has);
    return has;
  }

  function save(listEl, id) {
    var card = cardOf(listEl, id);
    if (!card) return;

    var editor = card.querySelector('.note-editor');
    var has = writeNote(editor);

    editor.setAttribute('contenteditable', 'false');
    editor.blur();
    syncEmpty(editor);
    /* 存上了就保持展开让你看一眼；没存东西不动面板 —— 空手点保存不该把开着的作答区合上 */
    if (has) card.querySelector('.card-note-area').classList.add('open');
  }

  function clear(listEl, id) {
    KB.UI.confirm({
      title: '清空笔记',
      message: '确定要清空这条笔记吗？',
      okText: '清空',
      danger: true
    }).then(function (yes) {
      if (!yes) return;

      var card = cardOf(listEl, id);
      if (!card) return;

      var oldRaw = KB.UserData.noteOf(id);
      KB.UserData.clearNote(id);
      /* 清空后正文里引用的图在图床里也一并清掉 */
      if (KB.Blobs) KB.Blobs.syncNoteRefs(oldRaw, '');
      card.querySelector('.note-editor').innerHTML = '';
      syncEmpty(card.querySelector('.note-editor'));
      card.querySelector('.btn-note').classList.remove('active');
      card.querySelector('.card-note-area').classList.remove('open');
      KB.UI.toast('🗑️ 笔记已清空');
    });
  }

  /* 落盘前还原公式为源码；blob: 地址换回 idb: 引用，保证下次打开仍能取到图。 */
  function serialize(editor) {
    var html = String(editor.innerHTML || '').trim();
    if (KB.RichNote && KB.RichNote.deflateMathHtml) html = KB.RichNote.deflateMathHtml(html).trim();
    if (html === '<br>') html = '';
    if (KB.Blobs && KB.Blobs.isUsable()) html = KB.Blobs.serializeHtml(html);
    return html;
  }

  function touch(listEl, id) {
    var card = cardOf(listEl, id);
    if (!card) return;
    var editor = card.querySelector('.note-editor');
    if (!editor) return;
    /* 图片尺寸条开着时不落盘：拖动只是预览，没点「应用」就不算数。
       四条自动保存路径都汇到这里，拦一次就全拦住 */
    if (editor.__imgCtlActive) return;

    writeNote(editor);
  }

  /* 给富文本模块用的主动落盘入口：图片点「应用」后立刻存最终状态 */
  function saveNow(editor) {
    writeNote(editor);
  }

  /* 事件全委托在列表上，重绘后不需要重新绑定 */
  function bind(listEl) {
    var timer = null;
    var pendingId = null;

    function flush() {
      if (!pendingId) return;
      clearTimeout(timer);
      touch(listEl, pendingId);
      pendingId = null;
    }

    listEl.addEventListener('click', function (e) {
      var noteBtn = e.target.closest('.btn-note');
      if (noteBtn) {
        e.stopPropagation();
        toggle(listEl, noteBtn.dataset.id);
        return;
      }

      /* 保存／清空的入口在富文本工具栏（KB.Notes.save／clear），不挂在卡片上 */

      var editor = e.target.closest('.note-editor');
      if (editor && editor.getAttribute('contenteditable') === 'false') {
        editor.setAttribute('contenteditable', 'true');
        syncEmpty(editor);
        editor.focus();
      }
    });

    listEl.addEventListener('input', function (e) {
      var editor = e.target.closest && e.target.closest('.note-editor');
      if (!editor) return;
      syncEmpty(editor);

      var id = editor.dataset.id;
      pendingId = id;
      clearTimeout(timer);
      timer = setTimeout(function () {
        touch(listEl, id);
        pendingId = null;
      }, 900);
    });

    /* 切到别的标签页、锁屏、关窗口都走这里：把还没到点的这一笔立刻存掉，
       比弹一个「确定离开吗」可靠得多 */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);

    /* 上一层兜底：输入之后 900ms 内直接关窗口，改动还没落盘，提示一下再走。
       平时上面两个事件会先存掉，这条几乎不触发；只在这段空档里才会弹。 */
    window.addEventListener('beforeunload', function (e) {
      if (!pendingId) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });

    /* 失焦回只读，并立刻存掉未到防抖时点的改动 */
    listEl.addEventListener('focusout', function (e) {
      var editor = e.target.closest && e.target.closest('.note-editor');
      if (!editor) return;
      editor.setAttribute('contenteditable', 'false');
      clearTimeout(timer);
      touch(listEl, editor.dataset.id);
      pendingId = null;
    });
  }

  KB.Notes = {
    bind: bind,
    followAnswer: followAnswer,
    editorOf: editorOf,
    isEmptyHtml: isEmptyHtml,
    saveNow: saveNow,
    save: save,
    clear: clear
  };
})(window);
