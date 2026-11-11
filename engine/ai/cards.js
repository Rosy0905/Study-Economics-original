/* AI 答疑助手：把回答存成卡片（可选组件）。
    Markdown 转富文本走全站 KB.Editor 内核，与「从 AI 对话导入」同一套规则；
    落库写的是本项目的卡片键，存完广播一次变更事件。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  function create(opt) {
    var cfg = opt.cfg;
    var util = opt.util;
    var S = opt.S;
    var D = opt.D;
    var isCardsPage = !!opt.isCardsPage;
    var saveHistoryFn = opt.saveHistory;
    var CARD_ICON = util.icons.CARD;
    var ICONS = util.icons;

    /* 分类清单与「我的卡片」页共用一份配置，换站改配置后存卡弹层同步跟着变 */
    function subjects() {
      var c = global.MYCARDS_CONFIG;
      if (c && Array.isArray(c.subjects) && c.subjects.length) return c.subjects;
      if (S.subjects && S.subjects.length) return S.subjects;
      return ['微观', '宏观'];
    }

    function safeText(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function uid() {
      return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }
    /* 卡片键按全站固定的项目 id 拼，不取当前页 KB.Store 的 setup：
       挂 AI 的页面各有自己的项目 id，卡片却只有「我的卡片」页那一份。 */
    function cardKey(kind) {
      return [cfg.storage.framePrefix, cfg.storage.projectId, 'cards', kind].join(':');
    }
    function readJson(k, dft) {
      try {
        var raw = global.localStorage.getItem(k);
        return raw ? (JSON.parse(raw) || dft) : dft;
      } catch (e) { return dft; }
    }
    /* 卡片数据与「我的卡片」页同源走 KB.Store（IndexedDB + 内存镜像）；
       KB.Store 缺席时回落旧的抽屉读写。判定前要先等 KB.Store.ready()。 */
    function storeReady() {
      return KB.Store ? KB.Store.ready() : Promise.resolve();
    }
    function readCards() {
      if (KB.Store) {
        var v = KB.Store.get('cards', 'items', []);
        return Array.isArray(v) ? v : [];
      }
      var list = readJson(cardKey('items'), []);
      return Array.isArray(list) ? list : [];
    }
    function readChapters() {
      var ch = KB.Store ? KB.Store.get('cards', 'chapters', null)
                        : readJson(cardKey('chapters'), null);
      if (!ch || typeof ch !== 'object' || Array.isArray(ch)) ch = {};
      var out = {};
      subjects().forEach(function (s) {
        out[s] = Array.isArray(ch[s]) ? ch[s] : [];
      });
      return out;
    }
    function writeCards(list) {
      if (KB.Store) return KB.Store.set('cards', 'items', list);
      try {
        global.localStorage.setItem(cardKey('items'), JSON.stringify(list));
        return true;
      } catch (e) { return false; }
    }
    function buildChapterOptions(subject, selected) {
      var list = readChapters()[subject] || [];
      var html = '<option value="">不选章节</option>';
      list.forEach(function (ch) {
        html += '<option value="' + safeText(ch) + '"' +
          (ch === selected ? ' selected' : '') + '>' + safeText(ch) + '</option>';
      });
      return html;
    }
    function sanitizePreview(html) {
      var box = document.createElement('div');
      box.innerHTML = String(html || '');
      box.querySelectorAll('script,style,img,video,iframe').forEach(function (n) {
        var tag = document.createElement('span');
        tag.textContent = '［' + (n.tagName === 'IMG' ? '图片' : '媒体') + '］';
        n.parentNode && n.parentNode.replaceChild(tag, n);
      });
      return box.innerHTML;
    }

    function mdToHtml(md) {
      var src = (KB.Editor && KB.Editor.normalizeMathBlocks)
        ? KB.Editor.normalizeMathBlocks(md) : md;
      if (KB.Editor && KB.Editor.mdToHtml) {
        return KB.Editor.mdToHtml(src, { paraJoin: '\n' });
      }
      /* 内核缺席时只做转义与换行，保证按钮不致报错 */
      return '<p>' + util.escapeHtml(src).replace(/\n/g, '<br>') + '</p>';
    }
    function mdPlain(s) {
      return String(s || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s*>\s?/gm, '')
        .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
        .replace(/\*\*|__|~~|`/g, '').replace(/[*_]/g, '');
    }

    function notifyChanged(type, id) {
      try {
        global.dispatchEvent(new CustomEvent('mycards:changed', {
          detail: { type: type, id: id || '' }
        }));
      } catch (e) {}
    }

    function saveCard(question, answerHtml, subject, chapter, originalQuestion) {
      var cards = readCards();
      var q = util.oneLine(question) || util.oneLine(mdPlain(answerHtml)).slice(0, 60) || '（AI 回答）';
      var all = subjects();
      var subj = all.indexOf(subject) >= 0 ? subject : all[0];
      var dup = cards.some(function (c) {
        return c && String(c.answerHtml || '') === answerHtml &&
          (c.question === q || c.originalQuestion === q || (!c.originalQuestion && c.question === q));
      });
      if (dup) { util.cardsToast('这张卡片已经有了'); return false; }
      var newId = uid();
      cards.push({
        id: newId,
        subject: subj,
        chapter: String(chapter || '').trim(),
        qid: '',
        hasImage: /<img/i.test(answerHtml),
        question: q,
        originalQuestion: util.oneLine(originalQuestion || question) || q,
        answerHtml: answerHtml,
        fav: false,
        created: Date.now()
      });
      if (!writeCards(cards)) {
        util.cardsToast('存不下了，去「我的卡片」里导出清理一下');
        return false;
      }
      notifyChanged('add', newId);
      return { ok: true, id: newId };
    }

    /* 存卡时把卡片 id 记到对话消息上并随历史持久化；此后已存与否只看
       那张卡还在不在——改题目、改答案都不影响判定，删卡才解除关联。
       旧消息没有记录，回落按内容比对一次。 */
    function linkCard(idx, id) {
      if (idx === undefined || idx === null || idx === '') return;
      var m = S.history && S.history[+idx];
      if (!m) return;
      m.cardId = id;
      if (saveHistoryFn) saveHistoryFn();
    }
    function unlinkCard(idx) {
      if (idx === undefined || idx === null || idx === '') return;
      var m = S.history && S.history[+idx];
      if (m && m.cardId) {
        delete m.cardId;
        if (saveHistoryFn) saveHistoryFn();
      }
    }

    function removeCard(idx, q, ans) {
      var cards = readCards();
      var before = cards.length;
      var cid = (idx !== undefined && idx !== null && idx !== '' && S.history && S.history[+idx])
        ? S.history[+idx].cardId : null;
      cards = cid
        ? cards.filter(function (c) { return !(c && c.id === cid); })
        : cards.filter(function (c) {
            if (!c || String(c.answerHtml || '') !== ans) return true;
            if (c.originalQuestion && c.originalQuestion === q) return false;
            return c.question !== q;
          });
      if (cards.length === before) { util.cardsToast('卡片已不存在'); return false; }
      if (!writeCards(cards)) { util.cardsToast('移除失败，存储受限'); return false; }
      unlinkCard(idx);
      notifyChanged('remove');
      return true;
    }

    function isSaved(idx, q, ans) {
      var cards = readCards();
      var cid = (idx !== undefined && idx !== null && idx !== '' && S.history && S.history[+idx])
        ? S.history[+idx].cardId : null;
      if (cid) return cards.some(function (c) { return c && c.id === cid; });
      return cards.some(function (c) {
        if (!c || String(c.answerHtml || '') !== ans) return false;
        if (c.originalQuestion && c.originalQuestion === q) return true;
        return c.question === q;
      });
    }

    var confirmOv = null;
    function closeConfirm() {
      if (!confirmOv) return;
      var el = confirmOv;
      confirmOv = null;
      el.classList.remove('show');
      setTimeout(function () { try { el.remove(); } catch (e) {} }, 200);
    }

    function askSave(question, answerHtml) {
      return new Promise(function (resolve) {
        closeConfirm();
        var qText = util.oneLine(question) || '（AI 回答）';
        var preview = sanitizePreview(answerHtml);
        var subject = cfg.features.saveAsCardDefaultSubject || subjects()[0];
        var lastChapter = '';
        try {
          var last = JSON.parse(global.localStorage.getItem(cfg.storage.cardsLastCfg) || '{}');
          if (last.subject) subject = last.subject;
          if (last.chapter) lastChapter = last.chapter;
        } catch (e) {}

        confirmOv = document.createElement('div');
        confirmOv.className = 'mycards-confirm-ov';
        confirmOv.innerHTML =
          '<div class="mycards-confirm-box">' +
            '<div class="mycards-confirm-title">存成卡片</div>' +
            '<div class="mycards-confirm-row">' +
              '<label>分类</label>' +
              '<select class="mycards-select mycards-subject">' +
                subjects().map(function (s) {
                  return '<option value="' + safeText(s) + '">' + safeText(s) + '</option>';
                }).join('') + '</select>' +
              '<label>章节</label>' +
              '<select class="mycards-select mycards-chapter"></select>' +
            '</div>' +
            '<div class="mycards-confirm-sub">题目（可直接编辑）</div>' +
            '<div class="mycards-confirm-q" contenteditable="plaintext-only" spellcheck="false"></div>' +
            '<div class="mycards-confirm-sub">答案预览</div>' +
            '<div class="mycards-confirm-a"></div>' +
            '<div class="mycards-confirm-btns">' +
              '<button type="button" class="mycards-btn mycards-btn-cancel">取消</button>' +
              '<button type="button" class="mycards-btn mycards-btn-ok">存入</button>' +
            '</div>' +
          '</div>';
        document.body.appendChild(confirmOv);
        var subjSel = confirmOv.querySelector('.mycards-subject');
        var chapSel = confirmOv.querySelector('.mycards-chapter');
        var qBox = confirmOv.querySelector('.mycards-confirm-q');
        var aBox = confirmOv.querySelector('.mycards-confirm-a');
        subjSel.value = subject;
        chapSel.innerHTML = buildChapterOptions(subject, lastChapter);
        subjSel.addEventListener('change', function () {
          var prev = chapSel.value;
          chapSel.innerHTML = buildChapterOptions(subjSel.value, prev);
        });
        qBox.textContent = qText;
        aBox.innerHTML = preview || '<span>（空内容）</span>';
        qBox.addEventListener('paste', function (e) {
          e.preventDefault();
          var text = '';
          try { text = (e.clipboardData || global.clipboardData).getData('text/plain'); } catch (err) {}
          document.execCommand('insertText', false, text);
        });
        global.requestAnimationFrame(function () {
          if (confirmOv) confirmOv.classList.add('show');
        });
        function finish(v) { closeConfirm(); resolve(v); }
        confirmOv.querySelector('.mycards-btn-cancel').addEventListener('click', function () {
          finish({ ok: false });
        });
        confirmOv.querySelector('.mycards-btn-ok').addEventListener('click', function () {
          try {
            global.localStorage.setItem(cfg.storage.cardsLastCfg,
              JSON.stringify({ subject: subjSel.value, chapter: chapSel.value }));
          } catch (e) {}
          finish({
            ok: true,
            question: qBox.textContent || qText,
            originalQuestion: qText,
            answerHtml: answerHtml,
            subject: subjSel.value,
            chapter: chapSel.value
          });
        });
        confirmOv.addEventListener('click', function (e) {
          if (e.target === confirmOv) finish({ ok: false });
        });
      });
    }

    function askRemove(question) {
      return new Promise(function (resolve) {
        closeConfirm();
        var qText = util.oneLine(question) || '这条回答';
        confirmOv = document.createElement('div');
        confirmOv.className = 'mycards-confirm-ov';
        confirmOv.innerHTML =
          '<div class="mycards-confirm-box">' +
            '<div class="mycards-confirm-title">移出卡片</div>' +
            '<div class="mycards-confirm-sub">题目</div>' +
            '<div class="mycards-confirm-q"></div>' +
            '<div class="mycards-confirm-btns">' +
              '<button type="button" class="mycards-btn mycards-btn-cancel">取消</button>' +
              '<button type="button" class="mycards-btn mycards-btn-ok mycards-btn-remove">移出</button>' +
            '</div>' +
          '</div>';
        document.body.appendChild(confirmOv);
        confirmOv.querySelector('.mycards-confirm-q').textContent = qText;
        global.requestAnimationFrame(function () {
          if (confirmOv) confirmOv.classList.add('show');
        });
        function finish(v) { closeConfirm(); resolve(v); }
        confirmOv.querySelector('.mycards-btn-cancel').addEventListener('click', function () { finish(false); });
        confirmOv.querySelector('.mycards-btn-ok').addEventListener('click', function () { finish(true); });
        confirmOv.addEventListener('click', function (e) {
          if (e.target === confirmOv) finish(false);
        });
      });
    }

    function getMsgContent(div) {
      var ans = '';
      var idx = div.dataset.idx;
      if (idx !== undefined && idx !== '') {
        var m = S.history[+idx];
        if (m && String(m.content || '').trim() &&
            (m.role === 'assistant' || m.role === 'ai')) {
          ans = mdToHtml(m.content);
        }
      }
      if (!ans) {
        var clone = div.cloneNode(true);
        clone.querySelectorAll('.ai-msg-actions, .ai-select-box, .ai-cursor').forEach(function (n) {
          n.remove();
        });
        clone.querySelectorAll('.ai-table-wrap').forEach(function (n) {
          while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n);
          n.parentNode.removeChild(n);
        });
        ans = clone.innerHTML;
      }
      var q = '';
      var prev = div.previousElementSibling;
      while (prev) {
        if (prev.classList.contains('user')) { q = prev.textContent || ''; break; }
        if (prev.classList.contains('ai')) break;
        prev = prev.previousElementSibling;
      }
      return { q: q, ans: ans, idx: idx };
    }

    function decorate(div) {
      if (!div || div.classList.contains('sys') || div.classList.contains('err')) return;
      if (!div.classList.contains('ai')) return;
      var wrap = div.querySelector('.ai-msg-actions');
      if (!wrap) {
        if (div.__mycardsWaiter) return;
        var mo = new MutationObserver(function (muts, observer) {
          if (div.querySelector('.ai-msg-actions')) {
            observer.disconnect();
            div.__mycardsWaiter = null;
            decorate(div);
          }
        });
        mo.observe(div, { childList: true, subtree: false });
        div.__mycardsWaiter = mo;
        return;
      }
      if (wrap.querySelector('.mycards-act')) return;
      var c = getMsgContent(div);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-act-btn mycards-act';
      btn.title = '存成一张卡片';
      btn.innerHTML = CARD_ICON;
      /* 按钮先挂出来，状态等存储就绪后校准，避免镜像未灌时误判 */
      storeReady().then(function () {
        var saved = isSaved(c.idx, c.q, c.ans);
        btn.classList.toggle('saved', saved);
        btn.title = saved ? '已存成卡片，点击可移出' : '存成一张卡片';
      });
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        /* 点击时实时核对，不信渲染那一刻的旧标记 */
        var c2 = getMsgContent(div);
        storeReady().then(function () {
          var now = isSaved(c2.idx, c2.q, c2.ans);
          btn.classList.toggle('saved', now);
          btn.title = now ? '已存成卡片，点击可移出' : '存成一张卡片';
          if (now) {
            askRemove(c2.q).then(function (yes) {
              if (!yes) return;
              if (removeCard(c2.idx, c2.q, c2.ans)) {
                btn.classList.remove('saved');
                btn.title = '存成一张卡片';
                util.cardsToast('已从「我的卡片」移出');
              }
            });
          } else {
            askSave(c2.q, c2.ans).then(function (res) {
              if (!res || !res.ok) return;
              var r = saveCard(res.question, res.answerHtml, res.subject, res.chapter, res.originalQuestion);
              if (r && r.ok) {
                linkCard(c2.idx, r.id);
                btn.classList.add('saved');
                btn.title = '已存成卡片，点击可移出';
                util.cardsToast('已存进「我的卡片」');
              }
            });
          }
        });
      });
      wrap.appendChild(btn);
    }

    function mount() {
      if (!D.panel) return false;
      var headR = D.panel.querySelector('.ai-head-r');
      if (headR && !isCardsPage && !headR.querySelector('.mycards-entry')) {
        var entry = document.createElement('button');
        entry.type = 'button';
        entry.className = 'mycards-entry';
        entry.id = 'mycardsEntry';
        entry.title = '打开「我的卡片」';
        entry.innerHTML = CARD_ICON;
        entry.addEventListener('click', function (e) {
          e.stopPropagation();
          var url = cfg.myCardsPage;
          if (cfg.myCardsOpenInNewTab) global.open(url, '_blank');
          else global.location.href = url;
        });
        headR.insertBefore(entry, headR.firstChild);
      }
      if (D.msgsEl) {
        D.msgsEl.querySelectorAll('.ai-msg.ai').forEach(decorate);
        if (!D.msgsEl.__mycardsObserver) {
          var mo = new MutationObserver(function (muts) {
            muts.forEach(function (mu) {
              Array.prototype.forEach.call(mu.addedNodes, function (n) {
                if (!n || n.nodeType !== 1) return;
                if (n.classList && n.classList.contains('ai-msg')) decorate(n);
                if (n.querySelectorAll) n.querySelectorAll('.ai-msg.ai').forEach(decorate);
              });
            });
          });
          mo.observe(D.msgsEl, { childList: true, subtree: true });
          D.msgsEl.__mycardsObserver = mo;
        }
      }
      return true;
    }

    /* 面板打开、切回标签页时重算全部按钮：卡片数据是共享的，另一边改过这边要知道 */
    function refreshSavedStates() {
      if (!D.msgsEl) return;
      var pre = (KB.Store && KB.Store.refresh) ? KB.Store.refresh() : Promise.resolve();
      pre.then(function () { return storeReady(); }).then(function () {
        D.msgsEl.querySelectorAll('.ai-msg.ai').forEach(function (div) {
          var btn = div.querySelector('.mycards-act');
          if (!btn) return;
          var c = getMsgContent(div);
          var saved = isSaved(c.idx, c.q, c.ans);
          btn.classList.toggle('saved', saved);
          btn.title = saved ? '已存成卡片，点击可移出' : '存成一张卡片';
        });
      });
    }

    if (global.document) {
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'visible') refreshSavedStates();
      });
    }

    return { mount: mount, decorate: decorate, refreshSavedStates: refreshSavedStates };
  }

  KB.AICards = { create: create };
})(window);
