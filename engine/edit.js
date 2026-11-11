/* 编辑：题目与答案就地改写，存本机。
   进编辑态时填进去的是数据的原始文本，不是排版后的 HTML：
   排版会把 ** 和 $$ 变成样式，再从 DOM 取文本就丢了标记，一保存样式就降级。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  function cardOf(listEl, id) {
    return listEl.querySelector('.card-item[data-id="' + id + '"]');
  }

  function isEditing(listEl, id) {
    var card = cardOf(listEl, id);
    return !!card && card.classList.contains('editing');
  }

  /* 加粗标记的成对星号染淡，中间的正文直接加粗；
     行首的 $$ 和 ## 是整行的写法标记，排版时会被吃掉，这里同样淡着留。
     行首那两个星号额外挂 lead：它们排在行首会让整行往右挪一截，
     CSS 里用负外边距抵掉，行首的字才跟正文在同一条线上。
     看到的样子就是最终排出来的样子，标记又还留在文本里，保存时不会丢。 */
  function markInline(line) {
    var atHead = /^\*\*/.test(line);

    /* 行首星号还没配成对（正在敲）：先当标记显示，一样不占位，
       免得打字打到一半整行往右窜一下 */
    if (atHead && !/^\*\*[^*\n]+\*\*/.test(line)) {
      return '<span class="md-mark lead">**</span>' + KB.escape(line.slice(2));
    }

    var s = KB.escape(line);
    s = s.replace(/^(\$\$|##)/, '<span class="md-mark">$1</span>');

    var took = false;

    return s.replace(/\*\*([^*\n]+)\*\*/g, function (all, body) {
      var lead = atHead && !took;
      took = true;
      return (
        '<span class="md-mark' + (lead ? ' lead' : '') + '">**</span>' +
        '<b class="md-strong">' + body + '</b><span class="md-mark">**</span>'
      );
    });
  }

  /* 小标题的加粗不是星号给的，是行分类器判的（整行字数少、无句读就加粗）。
     数据里这类行本来就没有 **，所以编辑态得跟着分类走，否则进去一看全是平字。
     行首是全角括号时再带上 hang，缩进减掉字形自带的留白，编辑态的左边缘也跟正文齐。
     只借类名，文本一个字不动，保存后重新排版还是同一个结果。 */
  function lineClass(line) {
    var seg = KB.Lines.classify(line);
    var t = seg ? seg.type : 'p';
    var cls = t === 'p' ? '' : t;

    if (KB.Lines.hang && KB.Lines.hang(line) && (t === 'p' || t === 'sub')) {
      cls = cls ? cls + ' hang' : 'hang';
    }

    return cls ? ' class="' + cls + '"' : '';
  }

  /* 一行一个段落：编辑框保留数据的行结构，段距和首行缩进才跟非编辑态一致。
     内容仍是源文本，$$ 和星号都原样留在里面，保存不会丢标记。 */
  function linesToHtml(text) {
    var src = Array.isArray(text) ? text.join('\n') : String(text == null ? '' : text);
    return src
      .split('\n')
      .map(function (line) {
        var t = markInline(line);
        return '<p' + lineClass(line) + '>' + (t || '<br>') + '</p>';
      })
      .join('');
  }

  /* 按段落取回。在框里回车会多出新段落，同样按行读。
     连续空行压成一个，原文里的空行本来只起分隔作用。 */
  function readParagraphs(el) {
    var ps = el.querySelectorAll('p');
    if (!ps.length) return readText(el);

    var out = [];
    Array.prototype.forEach.call(ps, function (p) {
      out.push(String(p.textContent || '').replace(/\u00a0/g, ' '));
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function start(listEl, id, opts) {
    var card = cardOf(listEl, id);
    if (!card || card.classList.contains('editing')) return;

    var data = opts.getCard(id);
    if (!data) return;

    KB.UI.toggleAnswer(listEl, id, true);
    if (opts.onOpen) opts.onOpen(id);
    card.classList.add('editing');

    var qText = card.querySelector('.q-text');
    var qEdit = document.createElement('div');
    qEdit.className = 'q-text editable';
    qEdit.contentEditable = 'true';
    qEdit.spellcheck = false;
    qEdit.textContent = data.question;
    qText.replaceWith(qEdit);

    var inner = card.querySelector('.answer-inner');
    var aEdit = document.createElement('div');
    aEdit.className = 'answer-inner editable';
    aEdit.contentEditable = 'true';
    aEdit.spellcheck = false;
    aEdit.innerHTML = linesToHtml(data.answer);
    inner.replaceWith(aEdit);

    /* 虚线框挂在答案外层，取消时只把这个类摘掉 */
    var box = card.querySelector('.card-answer');
    if (box) box.classList.add('editable');

    /* 取消时直接把这两个原节点换回来：不重绘，卡片就不会重新播一遍展开动画 */
    card.__kbBack = { q: qText, a: inner };

    var btn = card.querySelector('.btn-edit');
    btn.textContent = '💾';
    btn.title = '保存修改';
    btn.classList.add('saving');

    var cancel = document.createElement('button');
    cancel.className = 'btn-edit-cancel';
    cancel.dataset.id = id;
    cancel.textContent = '❌';
    cancel.title = '取消编辑';
    btn.parentNode.insertBefore(cancel, btn.nextSibling);

    KB.UI.toast('✏️ 正在编辑，点 💾 保存 或 ❌ 取消');
  }

  /* 输入框里换行由浏览器插入 div 或 br，innerText 能还原成换行符；
     连续空行压成一个，原文里的空行本来就只起分隔作用。 */
  function readText(el) {
    return String(el.innerText || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function commit(listEl, id, opts) {
    var card = cardOf(listEl, id);
    if (!card || !card.classList.contains('editing')) return;

    var q = card.querySelector('.q-text.editable');
    var a = card.querySelector('.answer-inner.editable');
    if (!q || !a) {
      KB.UI.toast('⚠️ 编辑内容不存在');
      return;
    }

    var question = readText(q);
    var answer = readParagraphs(a);

    if (!question || !answer) {
      KB.UI.toast('⚠️ 题目和答案不能为空');
      (!question ? q : a).focus();
      return;
    }

    KB.UserData.setEdit(id, question, answer);
    opts.onSaved(id);
    KB.UI.toast('✏️ 已保存，重新排版后即可看到效果');
  }

  /* 取消 = 把进编辑前那两个节点原样换回来，不走重绘。
     注意别碰 .card-answer 的 animation 属性：它的淡入只在展开那一次该播，
     一旦在编辑态把它设成 none、取消时再放开，浏览器会当成新动画从头播，
     答案区就会先往上跳 6px 再爬回来 —— 那就是"抖一下"。 */
  function cancel(listEl, id) {
    var card = cardOf(listEl, id);
    if (!card || !card.classList.contains('editing')) return;

    var back = card.__kbBack;
    var qEdit = card.querySelector('.q-text.editable');
    var aEdit = card.querySelector('.answer-inner.editable');

    if (back && qEdit && aEdit) {
      qEdit.replaceWith(back.q);
      aEdit.replaceWith(back.a);
    }

    var box = card.querySelector('.card-answer');
    if (box) box.classList.remove('editable');

    var cancelBtn = card.querySelector('.btn-edit-cancel');
    if (cancelBtn) cancelBtn.remove();

    var btn = card.querySelector('.btn-edit');
    if (btn) {
      btn.textContent = '✏️';
      btn.title = '编辑题目和答案';
      btn.classList.remove('saving');
    }

    card.classList.remove('editing');
    delete card.__kbBack;

    KB.UI.toast('🔙 已取消编辑');
  }

  function bind(listEl, opts) {
    listEl.addEventListener('click', function (e) {
      var editBtn = e.target.closest('.btn-edit');
      if (editBtn) {
        e.stopPropagation();
        if (editBtn.classList.contains('saving')) commit(listEl, editBtn.dataset.id, opts);
        else start(listEl, editBtn.dataset.id, opts);
        return;
      }

      var cancelBtn = e.target.closest('.btn-edit-cancel');
      if (cancelBtn) {
        e.stopPropagation();
        cancel(listEl, cancelBtn.dataset.id, opts);
      }
    });
  }

  KB.Edit = {
    bind: bind,
    isEditing: isEditing
  };
})(window);
