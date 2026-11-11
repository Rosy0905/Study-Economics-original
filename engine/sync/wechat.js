/* 微信内置浏览器导出 · 分段复制面板
   微信不允许页面直接下载文件，备份改成切成若干段、逐段复制到剪贴板、
   粘到电脑记事本拼起来。独立成文件，改文案、分段长度、交互都不用碰导入导出核心。

   对外只有一个入口：
     KB.SyncWeChat.isWeChat()            是否微信内置浏览器
     KB.SyncWeChat.show(jsonText, name)  弹出分段复制面板

   分段长度 4500 字：微信剪贴板一帖大约这么长，切太短段数翻倍，切太长会被截。 */
(function (global) {
  'use strict';

  var KB = global.KB = global.KB || {};

  var CHUNK = 4500;
  /* 超过这么多段就提示改用纯文字版：到这个量逐段复制已经不现实 */
  var HEAVY = 15;
  /* 硬上限：到这个段数直接不生成列表。逐段复制几十段必然漏，
     与其让人做到一半发现拼不起来，不如提前挡住 */
  var HARD = 40;

  /* 文案缺省值。{n} 换成段数（加粗），{name} 换成备份文件名。
     project.config.js 的 home.sync.texts 里写同名键即可覆盖，没写的项走这里 */
  var DEFAULTS = {
    titleOne: '📋 复制备份数据',
    titleMany: '📋 分段复制备份数据',
    descOne: '微信内置浏览器不支持直接下载文件，已生成备份内容。点下方「复制」，粘贴到电脑记事本里保存为 {name}。',
    descMany: '微信剪贴板一次存不下整份文件，已切成 {n} 段。请<b>按顺序</b>点每段的「复制」，依次粘贴到电脑记事本的<b>同一个文件</b>里，拼好后保存为 {name}。',
    tip: '💡 微信与手机浏览器是两套独立存储，数据不共享。',
    foot: '⚠️ 必须 {n} 段全部复制并拼接完整，否则导入时会失败。',
    hint: '⚠️ 这份备份切成了 {n} 段，逐段复制很费事。导出时取消勾选「笔记图片」可以只导文字版，段数会少很多。',
    block: '⛔ 这份备份要切成 {n} 段，已超过 {hard} 段的硬上限，不再生成逐段列表。这个体量基本是带图对话历史撑着，回到导出面板取消勾选「AI 对话历史」或「笔记图片」，把段数压到 15 段以内再导出。',
    descBlock: '备份体积过大，没有生成分段列表。',
    copy: '复制',
    copied: '✅ 已复制',
    again: '再复制',
    manual: '⚠️ 长按手动复制',
    retry: '重试'
  };

  /* 把 {key} 换成对应值，缺的键留空 */
  function fill(tpl, vars) {
    return String(tpl == null ? '' : tpl).replace(/\{(\w+)\}/g, function (_, k) {
      return vars[k] == null ? '' : String(vars[k]);
    });
  }

  var esc = KB.escape;

  function isWeChat() {
    return /MicroMessenger/i.test((global.navigator && global.navigator.userAgent) || '');
  }

  function show(jsonText, fileName, op) {
    var t = {};
    var custom = (op && op.texts) || {};
    Object.keys(DEFAULTS).forEach(function (k) {
      t[k] = custom[k] == null ? DEFAULTS[k] : custom[k];
    });

    var old = document.getElementById('wxExportOverlay');
    if (old) old.remove();

    var chunks = [];
    for (var i = 0; i < jsonText.length; i += CHUNK) {
      chunks.push(jsonText.slice(i, i + CHUNK));
    }
    var total = chunks.length;
    var single = total === 1;
    var hard = total > HARD;
    var vars = { n: '<b>' + total + '</b>', hard: HARD, name: '<code>' + esc(fileName) + '</code>' };

    var rows = hard ? '' : chunks.map(function (c, i) {
      return '<div class="wx-export-row">' +
        '<div class="idx">' + (i + 1) + '</div>' +
        '<div class="info">' +
          '<div class="lb">第 ' + (i + 1) + ' 段 / 共 ' + total + ' 段</div>' +
          '<div class="sz">' + c.length + ' 字</div>' +
        '</div>' +
        '<button class="btn" type="button" data-idx="' + i + '">' + esc(t.copy) + '</button>' +
        '</div>';
    }).join('');

    var desc = hard
      ? esc(t.descBlock)
      : fill(single ? t.descOne : t.descMany, vars) + '<br>' + esc(t.tip);

    var foot = (single || hard) ? ''
      : '<div class="wx-export-foot">' + fill(t.foot, vars) + '</div>';

    /* 段数超过 15 基本是备份里带了图片（图片转文本体积涨三分之一）。
       逐段复制到这个量已经不现实，先劝退；超过硬上限则直接不生成列表 */
    var heavy = total > HEAVY;
    var hint = hard
      ? '<div class="wx-export-block">' + fill(t.block, vars) + '</div>'
      : (heavy ? '<div class="wx-export-hint">' + fill(t.hint, vars) + '</div>' : '');

    var box = document.createElement('div');
    box.id = 'wxExportOverlay';
    box.className = 'wx-export-overlay';
    box.innerHTML = '<div class="wx-export-box">' +
      '<div class="wx-export-title">' +
        '<span>' + esc(single ? t.titleOne : t.titleMany) + '</span>' +
        '<button class="close" type="button" aria-label="关闭">✕</button>' +
      '</div>' +
      '<div class="wx-export-desc">' + desc + '</div>' +
      hint +
      '<div class="wx-export-list">' + rows + '</div>' +
      foot +
      '</div>';
    document.body.appendChild(box);

    function markDone(btn, row) {
      row.classList.add('done');
      btn.textContent = t.copied;
      setTimeout(function () { btn.textContent = t.again; }, 1800);
    }

    /* clipboard API 在微信老内核里可能没有或被拒，退到 execCommand；
       再不行就把话说明白，让人长按手动选 */
    function fallbackCopy(text, btn, row) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      if (ok) markDone(btn, row);
      else {
        btn.textContent = t.manual;
        setTimeout(function () { btn.textContent = t.retry; }, 2200);
      }
    }

    box.addEventListener('click', function (e) {
      if (e.target === box) box.remove();
    });
    var closeBtn = box.querySelector('.close');
    if (closeBtn) closeBtn.addEventListener('click', function () { box.remove(); });

    Array.prototype.forEach.call(box.querySelectorAll('.btn'), function (btn) {
      btn.addEventListener('click', function () {
        var i = Number(btn.getAttribute('data-idx'));
        var text = chunks[i];
        var row = btn.parentNode;
        if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(text)
            .then(function () { markDone(btn, row); })
            .catch(function () { fallbackCopy(text, btn, row); });
        } else {
          fallbackCopy(text, btn, row);
        }
      });
    });
  }

  KB.SyncWeChat = {
    isWeChat: isWeChat,
    show: show,
    CHUNK: CHUNK,
    HEAVY: HEAVY,
    HARD: HARD
  };
})(window);
