/* AI 答疑助手：消息创建、历史重绘与逐条操作。
   勾选分享用的 history 下标写回 DOM，删除／重生成／编辑后同步修正勾选，
   避免下标漂移指向别的消息。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  function create(opt) {
    var cfg = opt.cfg;
    var util = opt.util;
    var S = opt.S;
    var D = opt.D;
    var A = opt.A;
    var escapeHtml = util.escapeHtml;
    var ICONS = util.icons;

    var rafPending = false;

    function scrollToBottom() {
      if (!S.stickBottom || rafPending) return;
      rafPending = true;
      global.requestAnimationFrame(function () {
        rafPending = false;
        D.msgsEl.scrollTop = D.msgsEl.scrollHeight;
      });
    }

    function attachMsgActions(div, rawText, role, idx) {
      if (typeof idx === 'number' && idx >= 0) div.dataset.idx = idx;
      var wrap = document.createElement('div');
      wrap.className = 'ai-msg-actions';

      var copyBtn = document.createElement('button');
      copyBtn.className = 'ai-act-btn ai-act-copy';
      copyBtn.title = '复制';
      copyBtn.innerHTML = ICONS.COPY;
      copyBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        util.copy(rawText || '', function () {
          copyBtn.classList.add('copied');
          copyBtn.innerHTML = ICONS.CHECK;
          copyBtn.title = '已复制';
          setTimeout(function () {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = ICONS.COPY;
            copyBtn.title = '复制';
          }, 1400);
        });
      });
      wrap.appendChild(copyBtn);

      if (!S.isSharedView && (role === 'ai' || role === 'assistant') &&
          typeof idx === 'number' && idx >= 0) {
        var regenBtn = document.createElement('button');
        regenBtn.className = 'ai-act-btn ai-act-regen';
        regenBtn.title = '重新生成';
        regenBtn.innerHTML = ICONS.REGEN;
        regenBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          regenerateFrom(idx);
        });
        wrap.appendChild(regenBtn);
      }
      if (!S.isSharedView && typeof idx === 'number' && idx >= 0) {
        var delBtn = document.createElement('button');
        delBtn.className = 'ai-act-btn ai-act-del';
        delBtn.title = '删除这条消息';
        delBtn.innerHTML = ICONS.DEL;
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          deleteMsgAt(idx);
        });
        wrap.appendChild(delBtn);
      }
      if (!S.isSharedView && role === 'user' && typeof idx === 'number' && idx >= 0) {
        var editBtn = document.createElement('button');
        editBtn.className = 'ai-act-btn ai-act-edit';
        editBtn.title = '编辑';
        editBtn.innerHTML = ICONS.EDIT;
        editBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          editUserMsg(div, idx);
        });
        wrap.appendChild(editBtn);
      }
      div.appendChild(wrap);
    }

    function addMsg(role, text, idx, opts) {
      opts = opts || {};
      var div = document.createElement('div');
      div.className = 'ai-msg ' + role;
      var copyText = text || '';
      if (role === 'ai') {
        div.innerHTML = A.markdown.renderMD(text);
      } else {
        if (opts.attachments && opts.attachments.length) {
          div.appendChild(A.attach.buildAttachView(opts.attachments));
          copyText = (text ? text + '\n' : '') + opts.attachments.map(function (a) {
            return '【附件：' + (a.name || '文件') + '】';
          }).join('\n');
        }
        if (text) {
          var t = document.createElement('div');
          t.className = 'ai-msg-text';
          t.textContent = text;
          div.appendChild(t);
        }
        div.dataset.q = '1';
      }
      if ((role === 'user' || role === 'ai') && typeof idx === 'number' && idx >= 0 && !opts.noActions) {
        attachMsgActions(div, copyText, role, idx);
      }
      D.msgsEl.appendChild(div);
      scrollToBottom();
      return div;
    }

    function renderHistory() {
      D.msgsEl.innerHTML = '';
      if (!S.history.length) {
        var tip = document.createElement('div');
        tip.className = 'ai-msg sys';
        tip.textContent = cfg.messages.empty;
        D.msgsEl.appendChild(tip);
        A.nav.build();
        return;
      }
      if (S.selecting && !S.isSharedView) A.share.pruneSelection();
      S.history.forEach(function (m, i) {
        if (S.isSharedView && i === 0) {
          var banner = document.createElement('div');
          banner.className = 'ai-shared-banner';
          banner.textContent = cfg.messages.sharedBanner;
          D.msgsEl.appendChild(banner);
        }
        var div = document.createElement('div');
        div.className = 'ai-msg ' + (m.role === 'user' ? 'user' : 'ai');
        div.dataset.idx = i;
        var copyText = m.content || '';
        if (m.role === 'user') {
          if (m.attachments && m.attachments.length) {
            div.appendChild(A.attach.buildAttachView(m.attachments));
            copyText = ((m.content || '') ? m.content + '\n' : '') + m.attachments.map(function (a) {
              return '【附件：' + (a.name || '文件') + '】';
            }).join('\n');
          }
          if (m.content) {
            var t = document.createElement('div');
            t.className = 'ai-msg-text';
            t.textContent = m.content;
            div.appendChild(t);
          }
          div.dataset.q = '1';
        } else {
          div.innerHTML = A.markdown.renderMD(m.content);
        }
        attachMsgActions(div, copyText, m.role === 'user' ? 'user' : 'ai', i);
        if (S.selecting && !S.isSharedView) {
          if (S.selectedSet[i]) div.classList.add('selected');
          var sbox = document.createElement('div');
          sbox.className = 'ai-select-box';
          sbox.innerHTML = ICONS.CHECK;
          div.appendChild(sbox);
        }
        D.msgsEl.appendChild(div);
      });
      if (S.isSharedView) {
        try { D.msgsEl.scrollTop = 0; } catch (e) {}
      } else {
        scrollToBottom();
      }
      A.nav.build();
    }

    function deleteMsgAt(idx) {
      if (S.isSharedView) return;
      if (S.isStreaming) { util.toast('正在回复中，请稍候'); return; }
      if (idx < 0 || idx >= S.history.length) return;
      var m = S.history[idx];
      var preview = (m.content || '').replace(/\s+/g, ' ').slice(0, 40);
      var roleName = m.role === 'user' ? '你的提问' : 'AI 回复';
      KB.UI.confirm({
        title: '删除消息',
        message: '删除这条' + roleName + '？\n\n' + preview + ((m.content || '').length > 40 ? '…' : ''),
        okText: '删除', cancelText: '取消', danger: true
      }).then(function (ok) {
        if (!ok) return;
        S.history.splice(idx, 1);
        A.storage.saveHistory(S.history);
        if (S.selecting) A.share.shiftSelectionAfter(idx);
        renderHistory();
        util.toast('已删除该条消息');
      });
    }

    function regenerateFrom(idx) {
      if (S.isSharedView) return;
      if (S.isStreaming) { util.toast('正在回复中，请稍候'); return; }
      var userIdx = -1;
      for (var i = idx - 1; i >= 0; i--) {
        if (S.history[i].role === 'user') { userIdx = i; break; }
      }
      if (userIdx < 0) { util.toast('找不到对应的提问'); return; }
      var userMsg = S.history[userIdx];
      var userText = userMsg.content || '';
      var atts = (userMsg.attachments || []).slice();
      S.history = S.history.slice(0, userIdx);
      A.storage.saveHistory(S.history);
      if (S.selecting) {
        Object.keys(S.selectedSet).forEach(function (k) {
          if (+k >= userIdx) delete S.selectedSet[k];
        });
        A.share.updateShareCount();
      }
      renderHistory();
      D.inputEl.value = userText;
      D.inputEl.style.height = 'auto';
      S.pendingAttachments = atts;
      A.attach.renderAttachBar();
      A.stream.send();
    }

    function editUserMsg(div, idx) {
      if (S.isSharedView || S.isStreaming) {
        if (S.isStreaming) util.toast('正在回复中，请稍候');
        return;
      }
      if (typeof idx !== 'number' || idx < 0 || idx >= S.history.length) return;
      if (div._editing) return;
      var m = S.history[idx];
      if (!m || m.role !== 'user') return;
      div._editing = true;

      var txtNode = div.querySelector('.ai-msg-text');
      var actions = div.querySelector('.ai-msg-actions');
      var attachNode = div.querySelector('.ai-msg-attach');
      var original = m.content || '';

      var origW = div.getBoundingClientRect().width;
      div.style.setProperty('--ai-edit-w', Math.max(origW, 240) + 'px');
      div.classList.add('editing');

      var box = document.createElement('div');
      box.className = 'ai-edit-box';
      var atts = (m.attachments || []).slice();
      if (atts.length) box.appendChild(A.attach.buildAttachView(atts));

      var ta = document.createElement('textarea');
      ta.className = 'ai-edit-textarea';
      ta.value = original;
      var bar = document.createElement('div');
      bar.className = 'ai-edit-bar';
      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'ai-edit-cancel';
      cancelBtn.textContent = '取消';
      var okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'ai-edit-ok';
      okBtn.textContent = '发送';
      bar.appendChild(cancelBtn);
      bar.appendChild(okBtn);
      box.appendChild(ta);
      box.appendChild(bar);

      if (txtNode) txtNode.style.display = 'none';
      if (actions) actions.style.display = 'none';
      if (attachNode) attachNode.style.display = 'none';
      div.appendChild(box);

      function fit() { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight) + 'px'; }
      ta.addEventListener('input', fit);
      global.addEventListener('resize', fit);
      function onFocus() { box.classList.add('focus'); }
      function onBlur() { box.classList.remove('focus'); }
      ta.addEventListener('focus', onFocus);
      ta.addEventListener('blur', onBlur);
      ta.focus();
      fit();
      try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {}

      function cleanup() {
        div._editing = false;
        ta.removeEventListener('input', fit);
        global.removeEventListener('resize', fit);
        ta.removeEventListener('focus', onFocus);
        ta.removeEventListener('blur', onBlur);
        box.remove();
        div.classList.remove('editing');
        div.style.removeProperty('--ai-edit-w');
        if (txtNode) txtNode.style.display = '';
        if (actions) actions.style.display = '';
        if (attachNode) attachNode.style.display = '';
      }
      function cancel() { if (div._editing) cleanup(); }
      function save() {
        if (!div._editing) return;
        var newText = ta.value.trim();
        if (!newText) { util.toast('内容不能为空'); ta.focus(); return; }
        cleanup();
        resendAsEdited(idx, newText, atts);
      }
      okBtn.addEventListener('click', save);
      cancelBtn.addEventListener('click', cancel);
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); }
      });
    }

    function resendAsEdited(idx, newText, atts) {
      if (S.isSharedView || S.isStreaming) return;
      if (idx < 0 || idx >= S.history.length) return;
      S.history = S.history.slice(0, idx);
      A.storage.saveHistory(S.history);
      if (S.selecting) {
        Object.keys(S.selectedSet).forEach(function (k) {
          if (+k >= idx) delete S.selectedSet[k];
        });
        A.share.updateShareCount();
      }
      renderHistory();
      D.inputEl.value = newText;
      D.inputEl.style.height = 'auto';
      S.pendingAttachments = (atts && atts.length) ? atts : [];
      A.attach.renderAttachBar();
      A.stream.send();
    }

    function bindScroll() {
      D.msgsEl.addEventListener('scroll', function () {
        var gap = D.msgsEl.scrollHeight - D.msgsEl.scrollTop - D.msgsEl.clientHeight;
        S.stickBottom = gap < 60;
      });
    }

    return {
      attachMsgActions: attachMsgActions,
      addMsg: addMsg,
      renderHistory: renderHistory,
      scrollToBottom: scrollToBottom,
      deleteMsgAt: deleteMsgAt,
      regenerateFrom: regenerateFrom,
      editUserMsg: editUserMsg,
      resendAsEdited: resendAsEdited,
      bindScroll: bindScroll
    };
  }

  KB.AIMessages = { create: create };
})(window);
