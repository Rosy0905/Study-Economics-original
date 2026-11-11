/* 卡片渲染：把一条数据渲染成一张卡的 HTML。
   只读契约里的字段，缺字段按空处理，不推断、不补默认值。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  /* 渲染器只看 math（页面配置），跟配色预设无关：
     配色是「公式要不要底色」，渲染是「公式交给谁排」，两件事分开。 */
  function pickRenderer(math) {
    return math === 'latex' ? KB.Renderer.latex : KB.Renderer.unicode;
  }

  /* 题号前后缀按页配置，各页本来就不一样：
     写字符串就是全页统一，写成对象就按 variant 分——
     7 页正是说明卡 U、其余 Q，同一页里两套。
     真题页数据存纯数字，靠前缀 "第" 与后缀 "题" 拼成 "第1题"；
     不写就原样输出，1/2/3/4 页都是这种。 */
  function partOf(spec, card) {
    if (typeof spec === 'string') return spec;
    if (spec && typeof spec === 'object') {
      return spec[card.variant] !== undefined ? spec[card.variant] : spec['default'] || '';
    }
    return '';
  }

  function qidText(card, prefix, suffix) {
    return partOf(prefix, card) + (card.qid == null ? '' : card.qid) + partOf(suffix, card);
  }

  function renderCard(card, ctx) {
    var r = pickRenderer(ctx.math);
    var esc = KB.escape;
    var id = esc(card.id);
    var feat = ctx.features || {};

    var cls = ['card-item'];
    if (ctx.favorited) cls.push('favorited');
    if (card.variant) cls.push('variant-' + esc(card.variant));

    var head = [];

    head.push('<div class="card-header"><div class="label">');
    /* 头部徽标：默认取 section。配置可以按字段指定 tone（主色／blue／sand），
       不写就按出现顺序取——第 1 枚主色、第 2 枚蓝、第 3 枚起沙色。
       单张卡也可以自带 tags 覆盖配置（说明卡只挂专业和套卷，不挂题型）。 */
    var TONE = ['', 'tag-blue', 'tag-sand'];
    var tags = (card.tags && card.tags.length
      ? card.tags
      : (ctx.tags && ctx.tags.length ? ctx.tags : ['section']));
    tags.forEach(function (t, i) {
      var key = typeof t === 'string' ? t : t.key;
      if (!key || !card[key]) return;
      var fallback = TONE[i] !== undefined ? TONE[i] : 'tag-sand';
      var tone = typeof t === 'string' || t.tone === undefined ? fallback : t.tone;
      head.push('<span class="' + (tone ? 'tag ' + tone : 'tag') + '">' + esc(card[key]) + '</span>');
    });
    /* 说明卡也输出题号：前缀与题号色按 variant 取，不排除 note */
    if (card.qid) head.push('<span class="qid">' + esc(qidText(card, ctx.qidPrefix, ctx.qidSuffix)) + '</span>');
    if (card.hasImage) head.push('<span class="has-img">📐 有图示</span>');
    head.push('</div>');

    head.push('<div class="card-actions" data-id="' + id + '">');
    head.push(
      '<button class="btn-fav' +
        (ctx.favorited ? ' active' : '') +
        '" data-id="' +
        id +
        '" title="收藏">' +
        (ctx.favorited ? '⭐' : '☆') +
        '</button>'
    );

    if (feat.notes) {
      head.push(
        '<button class="btn-note' +
          (ctx.hasNote ? ' active' : '') +
          '" data-id="' + id + '" title="笔记">📝</button>'
      );
    }

    if (feat.edit) {
      head.push('<button class="btn-edit" data-id="' + id + '" title="编辑题目和答案">✏️</button>');
    }

    /* 答案册深链：配了 answerBook 才出。题目卡落到 #题目 id，
       说明卡落到 #s-学科（本学科答案册那一节）。 */
    var ab = ctx.answerBook;
    if (ab && ab.page) {
      var isNote = card.variant === 'note';
      var anchor = isNote
        ? 's-' + encodeURIComponent(card.subject || '')
        : encodeURIComponent(card.id);
      head.push(
        '<a class="btn-ans" href="' +
          esc(ab.page + '#' + anchor) +
          '" target="_blank" rel="noopener" title="' +
          (isNote ? '查看本学科答案册' : '查看参考答案') +
          '">📖</a>'
      );
    }

    head.push('</div></div>');

    var body = [];

    /* 答案在答案册的模块（answerMode: 'book'）不在卡片里出答案区，
       点题目展开的是作答区，参考答案走答案册入口 */
    var bookMode = ctx.answerMode === 'book';

    body.push('<div class="card-question" data-id="' + id + '">');
    /* 题干：两种页面走同一条渲染路——认空格对齐的表格、认行首 $$ 的整行公式，
       行内 $…$ 交给渲染器。与答案区共用同一套公式语法。 */
    body.push('<span class="q-text">' + KB.Html.stem(card.question, r) + '</span>');
    /* 说明卡整张就是一段说明，没有可展开的东西，不给提示字 */
    if (card.variant !== 'note') {
      body.push('<span class="toggle-hint">' + (bookMode ? '(点击展开作答区)' : '(点击展开答案)') + '</span>');
    }
    body.push('</div>');

    if (!bookMode) {
      body.push('<div class="card-answer" data-id="' + id + '">');
      body.push('<div class="answer-inner">' + r.block(card.answer) + '</div>');
      body.push('</div>');
    }

    if (feat.notes) {
      /* 空笔记带 data-empty，占位提示由样式里的 ::before 画，编辑器本身保持为空。
         保存／清空入口在富文本工具栏上，底栏不放重复入口。 */
      var noteHtml = ctx.note || '';
      body.push('<div class="card-note-area" data-id="' + id + '">');
      body.push(
        '<div class="note-editor"' +
          (noteHtml ? '' : ' data-empty="1"') +
          ' contenteditable="false" data-id="' + id + '">' +
          noteHtml +
          '</div>'
      );
      body.push('</div>');
    }

    return '<div class="' + cls.join(' ') + '" data-id="' + id + '">' + head.join('') + body.join('') + '</div>';
  }

  function renderList(cards, ctx) {
    var ud = KB.UserData;
    return cards
      .map(function (card) {
        return renderCard(
          card,
          Object.assign({}, ctx, {
            favorited: (ctx.favorites || []).indexOf(card.id) !== -1,
            hasNote: !!ud.noteOf(card.id),
            note: ud.noteOf(card.id)
          })
        );
      })
      .join('');
  }

  /* 收藏只动当前这一张卡，不重绘列表。
     重绘会把展开态、滚动位置和悬停态一起重建，看着像闪了一下；
     收藏与否本来就只影响这一张卡的类和按钮。 */
  function applyFavorite(listEl, id, on) {
    var sel = '[data-id="' + id + '"]';
    var card = listEl.querySelector('.card-item' + sel);
    if (card) card.classList.toggle('favorited', on);

    var btn = listEl.querySelector('.btn-fav' + sel);
    if (btn) {
      btn.classList.toggle('active', on);
      btn.textContent = on ? '⭐' : '☆';
    }
  }

  KB.Card = {
    renderCard: renderCard,
    renderList: renderList,
    applyFavorite: applyFavorite
  };
})(window);
