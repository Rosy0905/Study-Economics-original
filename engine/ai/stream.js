/* AI 答疑助手：流式请求、打字机与暂停／继续状态机。
   每一轮流带唯一 token，旧流的所有回调在新流开始后全部失效。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  function create(opt) {
    var cfg = opt.cfg;
    var util = opt.util;
    var S = opt.S;
    var D = opt.D;
    var A = opt.A;
    var L = cfg.limits;
    var ICONS = util.icons;
    var escapeHtml = util.escapeHtml;

    function updateInputPlaceholder() {
      /* 暂停提示优先；分享视图只读，一律用原本占位文字。 */
      if (S.isStreaming && S.isPaused) {
        D.inputEl.placeholder = '当前回答已暂停：输入新问题会截断它；直接 Enter 继续生成';
        return;
      }
      var mobile = util.isMobile(cfg);
      var base = mobile
        ? '输入问题…（回车换行）'
        : '输入问题…（Enter 发送/暂停，Shift+Enter 换行，可直接粘贴图片）';
      var label = '';
      if (!S.isSharedView && S.cfg && S.cfg.readCard !== false) {
        label = A.context.currentCardLabel();
      }
      if (!label) { D.inputEl.placeholder = base; return; }
      /* 桌面按原占位文字的单行显示宽度放宽到 30 字，窄屏另收一档。 */
      var max = mobile ? 14 : 30;
      if (label.length > max) label = label.slice(0, max) + '…';
      D.inputEl.placeholder = '当前卡片：' + label;
    }

    function setSendBtn(streaming, paused) {
      if (!streaming || paused) {
        D.sendBtn.classList.remove('stop', 'paused');
        D.sendBtn.disabled = false;
        D.sendBtn.innerHTML = ICONS.SEND;
        D.sendBtn.title = paused ? '发送新消息（会截断当前回答）' : '发送';
      } else {
        D.sendBtn.classList.remove('paused');
        D.sendBtn.classList.add('stop');
        D.sendBtn.disabled = false;
        D.sendBtn.innerHTML = ICONS.PAUSE;
        D.sendBtn.title = '暂停生成';
      }
    }

    function tickType() {
      if (S.isPaused) return;
      var st = S.typeState;
      if (st.shown.length >= st.target.length) {
        if (st.timer) { clearInterval(st.timer); st.timer = null; }
        if (S.streamFinished && S.isStreaming) finalizeStream();
        return;
      }
      var remain = st.target.length - st.shown.length;
      var step = remain > 200 ? 6 : remain > 60 ? 3 : 1;
      st.shown = st.target.slice(0, st.shown.length + step);
      st.el.innerHTML = A.markdown.renderMD(st.shown);
      /* 公式渲染器迟到时先把土黄源码换成排好版的公式，流式期间不整屏重绘 */
      if (A.markdown.katexReady() && st.el.querySelector('.ai-formula-fallback')) {
        st.el.innerHTML = A.markdown.renderMD(st.shown);
      }
      if (st.cursor) st.el.appendChild(st.cursor);
      A.messages.scrollToBottom();
    }

    function ensureTyping() {
      if (S.typeState.timer) return;
      S.typeState.timer = setInterval(tickType, L.typeStep);
    }

    function removeContinueButton() {
      var btn = S.typeState.continueBtn;
      if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
      S.typeState.continueBtn = null;
    }

    function showContinueButton() {
      removeContinueButton();
      if (S.isSharedView) return;
      var el = S.typeState.el;
      if (!el || !el.parentNode) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-continue-btn';
      btn.innerHTML = ICONS.PLAY + '<span>继续生成</span>';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        resumeStream();
      });
      var parent = el.parentNode;
      if (el.nextSibling) parent.insertBefore(btn, el.nextSibling);
      else parent.appendChild(btn);
      S.typeState.continueBtn = btn;
      A.messages.scrollToBottom();
    }

    function pauseStream() {
      if (!S.isStreaming || S.isPaused) return;
      S.isPaused = true;
      if (S.typeState.timer) { clearInterval(S.typeState.timer); S.typeState.timer = null; }
      if (S.typeState.cursor) S.typeState.cursor.style.display = 'none';
      setSendBtn(true, true);
      showContinueButton();
      updateInputPlaceholder();
    }

    function resumeStream() {
      if (!S.isStreaming || !S.isPaused) return;
      S.isPaused = false;
      removeContinueButton();
      if (S.typeState.cursor) S.typeState.cursor.style.display = '';
      setSendBtn(true, false);
      updateInputPlaceholder();
      if (S.streamFinished && S.typeState.shown.length >= S.typeState.target.length) {
        finalizeStream();
      } else {
        ensureTyping();
      }
    }

    function abortCurrentStream() {
      if (!S.isStreaming) return;
      S.streamToken++;
      if (S.controller) { try { S.controller.abort(); } catch (e) {} }
      finalizeStream({ name: 'AbortError' });
    }

    function finalizeStream(error) {
      if (!S.isStreaming) return;
      var st = S.typeState;
      removeContinueButton();
      if (st.timer) { clearInterval(st.timer); st.timer = null; }

      if (st.shown.length < st.target.length) {
        st.shown = st.target;
        st.el.innerHTML = A.markdown.renderMD(st.shown);
      }
      if (st.cursor && st.cursor.parentNode) st.cursor.remove();

      if (error) {
        if (error.name === 'AbortError') {
          if (st.acc.trim()) {
            S.history.push({ role: 'assistant', content: st.acc });
            A.storage.saveHistory(S.history);
            A.messages.attachMsgActions(st.el, st.acc, 'ai', S.history.length - 1);
            A.nav.build();
          } else {
            st.el.remove();
          }
        } else {
          st.el.className = 'ai-msg err';
          st.el.innerHTML = cfg.messages.requestFailed +
            escapeHtml(error.message || '未知错误') + cfg.messages.failureReasons;
        }
      } else if (!st.acc.trim()) {
        st.el.className = 'ai-msg err';
        st.el.textContent = cfg.messages.noReply;
      } else {
        S.history.push({ role: 'assistant', content: st.acc });
        A.storage.saveHistory(S.history);
        A.messages.attachMsgActions(st.el, st.acc, 'ai', S.history.length - 1);
        A.nav.build();
      }

      S.isStreaming = false;
      S.isPaused = false;
      S.streamFinished = false;
      S.controller = null;
      setSendBtn(false);
      updateInputPlaceholder();
      A.messages.scrollToBottom();
      A.nav.build();
      if (S.katexPendingRerender) {
        S.katexPendingRerender = false;
        A.messages.renderHistory();
      }
    }

    function send() {
      if (S.isSharedView) return;
      if (S.isStreaming && !S.isPaused) return;
      var text = D.inputEl.value.trim();
      if (!text && !S.pendingAttachments.length) return;
      if (!A.core.hasValidCfg()) { A.core.showConfig(); return; }
      if (S.isStreaming && S.isPaused) abortCurrentStream();

      D.inputEl.value = '';
      D.inputEl.style.height = 'auto';
      var atts = S.pendingAttachments.slice();
      S.pendingAttachments = [];
      A.attach.renderAttachBar();

      var sys = D.msgsEl.querySelector('.ai-msg.sys');
      if (sys) sys.remove();

      S.history.push({
        role: 'user', content: text,
        attachments: atts.length ? atts : undefined
      });
      A.storage.saveHistory(S.history);

      S.stickBottom = true;
      S.savedScrollTop = null;
      A.messages.addMsg('user', text, S.history.length - 1, { attachments: atts });

      var pageCtx = (S.cfg.readCard === false) ? '' : A.context.buildPageContext(true);
      var readCardNote = A.context.takeReadCardNote(A.context.pickCardLabel(pageCtx));
      var systemContent = S.cfg.system +
        (pageCtx ? '\n\n' + cfg.prompts.contextHead + '\n' + pageCtx : '');
      if (readCardNote) systemContent += '\n\n' + readCardNote;
      var messages = A.attach.buildApiMessages(systemContent, S.history);

      var aiDiv = document.createElement('div');
      aiDiv.className = 'ai-msg ai';
      D.msgsEl.appendChild(aiDiv);
      var cursor = document.createElement('span');
      cursor.className = 'ai-cursor';
      aiDiv.appendChild(cursor);

      var st = S.typeState;
      st.target = ''; st.shown = ''; st.timer = null;
      st.el = aiDiv; st.cursor = cursor; st.acc = ''; st.continueBtn = null;

      S.isStreaming = true;
      S.isPaused = false;
      S.streamFinished = false;
      setSendBtn(true, false);
      updateInputPlaceholder();

      var myToken = ++S.streamToken;
      S.controller = new AbortController();
      var url = S.cfg.base.replace(/\/+$/, '') + '/chat/completions';
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + S.cfg.key
        },
        body: JSON.stringify({
          model: S.cfg.model,
          messages: messages,
          stream: true,
          temperature: L.temperature
        }),
        signal: S.controller.signal
      }).then(function (res) {
        if (myToken !== S.streamToken) throw new Error('__stale_stream__');
        if (!res.ok) {
          return res.text().then(function (txt) {
            var errMsg = 'HTTP ' + res.status;
            try {
              var j = JSON.parse(txt);
              errMsg = (j.error && j.error.message) || j.message || txt;
            } catch (e) { errMsg = txt || errMsg; }
            throw new Error(errMsg);
          });
        }
        if (!res.body) throw new Error('当前浏览器不支持流式响应');
        var reader = res.body.getReader();
        var decoder = new TextDecoder('utf-8');
        var buffer = '';
        function pump() {
          return reader.read().then(function (r) {
            if (myToken !== S.streamToken) return;
            if (r.done) return;
            buffer += decoder.decode(r.value, { stream: true });
            var lines = buffer.split('\n');
            buffer = lines.pop();
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              if (!line || line.indexOf('data:') !== 0) continue;
              var data = line.slice(5).trim();
              if (data === '[DONE]') continue;
              try {
                var json = JSON.parse(data);
                var delta = (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) ||
                  (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
                if (delta) {
                  S.typeState.acc += delta;
                  S.typeState.target += delta;
                  if (!S.isPaused) ensureTyping();
                }
              } catch (e) {}
            }
            return pump();
          });
        }
        return pump();
      }).then(function () {
        if (myToken !== S.streamToken) return;
        S.streamFinished = true;
        if (!S.isPaused) {
          if (S.typeState.shown.length >= S.typeState.target.length) finalizeStream();
          else ensureTyping();
        }
      }).catch(function (err) {
        if (myToken !== S.streamToken) return;
        if (err.message === '__stale_stream__') return;
        S.streamFinished = true;
        S.isPaused = false;
        finalizeStream(err);
      });
    }

    function stopStream() {
      S.streamToken++;
      if (S.controller) { try { S.controller.abort(); } catch (e) {} S.controller = null; }
      S.isStreaming = false;
      S.isPaused = false;
      S.streamFinished = false;
      removeContinueButton();
      if (S.typeState.timer) { clearInterval(S.typeState.timer); S.typeState.timer = null; }
      setSendBtn(false);
      updateInputPlaceholder();
    }

    function bindEvents() {
      D.sendBtn.addEventListener('click', function () {
        if (S.isStreaming) {
          if (!S.isPaused) { pauseStream(); return; }
          var hasContent = D.inputEl.value.trim().length > 0 || S.pendingAttachments.length > 0;
          if (hasContent) { send(); return; }
          resumeStream();
          return;
        }
        send();
      });
      D.inputEl.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || e.isComposing) return;
        if (util.isMobile(cfg) || e.shiftKey) return;
        e.preventDefault();
        if (S.isStreaming) {
          if (!S.isPaused) { pauseStream(); return; }
          var hasContent = D.inputEl.value.trim().length > 0 || S.pendingAttachments.length > 0;
          if (hasContent) { send(); return; }
          resumeStream();
          return;
        }
        send();
      });
      D.inputEl.addEventListener('input', function () {
        D.inputEl.style.height = 'auto';
        D.inputEl.style.height = Math.min(D.inputEl.scrollHeight, 140) + 'px';
      });
    }

    return {
      send: send,
      finalizeStream: finalizeStream,
      stopStream: stopStream,
      pauseStream: pauseStream,
      resumeStream: resumeStream,
      abortCurrentStream: abortCurrentStream,
      setSendBtn: setSendBtn,
      updateInputPlaceholder: updateInputPlaceholder,
      ensureTyping: ensureTyping,
      bindEvents: bindEvents
    };
  }

  KB.AIStream = { create: create };
})(window);
