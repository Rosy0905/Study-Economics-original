/* 朗读（TTS）核心：不关心文本从哪来、语速存哪，只管把一段文字读好。
   页面用 KB.TTS.mount({...}) 挂一组控件（喇叭按钮 + 语速滑杆 + 倍速显示），
   返回 { stop }，页面离开时调用或依赖内部 pagehide 自停。

   可复用点：主页现在读学习进度；将来各子页的朗读挂同一核心，传自己的 getText。 */

(function (global) {
  'use strict';

  var KB = global.KB = global.KB || {};

  /* 把整段文字切成"一句一段"；几句拼一段再交给引擎（一段一句的话每个句号
     都要收尾一次，听着卡顿），超长段再按逗号细切。
     分段的根本原因：手机浏览器对 pause()/resume() 支持不可靠（典型是暂停后
     再点播放没反应），分段后 resume 失效也能从当前这句重读，听感是接着往下；
     顺带避开安卓"长句读到 15 秒左右自动断掉"的老问题。 */
  function splitChunks(text) {
    var clean = String(text).replace(/\r?\n+/g, '。').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    var sentences = clean.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [clean];

    var CHUNK = 110;   // 每段目标长度
    var HARD  = 170;   // 单段硬上限，超了才在逗号处切
    var out = [];
    var buf = '';
    sentences.forEach(function (raw) {
      var s = raw.trim();
      if (!s) return;
      if (buf && buf.length + s.length > CHUNK) { out.push(buf); buf = s; }
      else { buf += s; }
    });
    if (buf) out.push(buf);

    var final = [];
    out.forEach(function (piece) {
      while (piece.length > HARD) {
        var cut = -1;
        var marks = ['，', ',', '、', '；', ';', ' '];
        for (var k = 0; k < marks.length; k++) {
          var i = piece.lastIndexOf(marks[k], HARD);
          if (i > HARD * 0.4) { cut = i + 1; break; }
        }
        if (cut < 0) cut = HARD;
        final.push(piece.slice(0, cut));
        piece = piece.slice(cut);
      }
      if (piece) final.push(piece);
    });

    /* 段尾句读符号去掉：引擎对句号会再「收一次尾」，叠上换段自身的间隙，
       听着像愣了半天。！？留着——那是语气，不是停顿。 */
    return final
      .map(function (s) { return s.replace(/[。；;，,、:：]+$/, '').trim() || s; })
      .filter(Boolean);
  }

  function mount(opts) {
    var synth = global.speechSynthesis;
    var supported = !!(synth && typeof global.SpeechSynthesisUtterance === 'function');

    var btn = opts.btn;
    var range = opts.range;
    var val = opts.val;
    var getText = opts.getText || function () { return ''; };
    var emptyTip = opts.emptyTip || '先写点内容，再朗读哦';
    var toast = opts.toast || function () {};
    var getRate = opts.getRate || function () { return null; };
    var setRate = opts.setRate || function () {};

    var ICON = {
      speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.5 3.6a1 1 0 0 0-1.6-.8L6.6 6.4H4A2 2 0 0 0 2 8.4v7.2a2 2 0 0 0 2 2h2.6l4.3 3.6a1 1 0 0 0 1.6-.8z"/><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="M16 8.7a5 5 0 0 1 0 6.6M19 6a9 9 0 0 1 0 12"/></svg>',
      pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.6" y="4" width="4.2" height="16" rx="1.7" fill="currentColor"/><rect x="13.2" y="4" width="4.2" height="16" rx="1.7" fill="currentColor"/></svg>',
      play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.2 5.1v13.8a1 1 0 0 0 1.54.84l10.2-6.9a1 1 0 0 0 0-1.68L9.74 4.26A1 1 0 0 0 8.2 5.1z"/></svg>',
      mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.5 3.6a1 1 0 0 0-1.6-.8L6.6 6.4H4A2 2 0 0 0 2 8.4v7.2a2 2 0 0 0 2 2h2.6l4.3 3.6a1 1 0 0 0 1.6-.8z"/><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="M16.4 9.6l5 4.8M21.4 9.6l-5 4.8"/></svg>'
    };

    if (!supported) {
      btn.disabled = true;
      btn.innerHTML = ICON.mute;
      btn.title = '当前浏览器不支持语音朗读';
      range.disabled = true;
      range.style.opacity = '.45';
      return { stop: function () {}, supported: false };
    }

    var state = 'idle';        // idle | speaking | paused
    var voices = [];
    var token = 0;
    var rateTimer = null;
    var resumeTimer = null;
    var currentRate = 1;
    var chunks = [];
    var cursor = 0;
    var pausedChunk = 0;

    var saved = parseFloat(getRate());
    if (!isNaN(saved) && saved >= 0.5 && saved <= 2) currentRate = Math.round(saved * 10) / 10;

    range.value = currentRate;
    if (val) val.textContent = currentRate.toFixed(1) + '×';

    function refreshVoices() {
      try { voices = synth.getVoices() || []; } catch (e) { voices = []; }
    }
    refreshVoices();
    try { synth.addEventListener('voiceschanged', refreshVoices); }
    catch (e) { synth.onvoiceschanged = refreshVoices; }

    function pickVoice() {
      if (!voices.length) refreshVoices();
      if (!voices.length) return null;
      var zh = voices.filter(function (v) { return /^zh|^cmn/i.test(v.lang || ''); });
      return zh.filter(function (v) { return /zh[-_]?(CN|Hans)/i.test(v.lang); })[0] || zh[0] || null;
    }

    function setState(s) {
      state = s;
      btn.classList.toggle('speaking', s === 'speaking');
      btn.classList.toggle('paused', s === 'paused');
      if (s === 'speaking') { btn.innerHTML = ICON.pause; btn.title = '暂停朗读'; }
      else if (s === 'paused') { btn.innerHTML = ICON.play; btn.title = '继续朗读'; }
      else { btn.innerHTML = ICON.speaker; btn.title = opts.title || '朗读'; }
    }

    function stop() {
      token++;
      clearTimeout(rateTimer);
      clearTimeout(resumeTimer);
      try { synth.cancel(); } catch (e) {}
      try { synth.resume(); } catch (e) {}
      cursor = 0;
      if (state !== 'idle') setState('idle');
    }

    function makeUtterance(text) {
      var u = new SpeechSynthesisUtterance(text);
      var v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'zh-CN'; }
      u.rate = currentRate;
      u.pitch = 1;
      u.volume = 1;
      return u;
    }

    /* 从第 i 段开始读。fresh=false 表示上一段读完自然接下一段——
       这时不能 cancel，否则每个标点都要静音一下。 */
    function speakFrom(i, fresh) {
      clearTimeout(resumeTimer);
      var my = ++token;
      var restart = fresh !== false;
      if (restart) {
        try { synth.cancel(); } catch (e) {}
        /* Chrome 的老毛病：pause 之后 cancel，合成器会卡在 paused，之后 speak 全哑 */
        try { synth.resume(); } catch (e) {}
      }
      if (!chunks.length) { setState('idle'); return; }
      resumeTimer = setTimeout(function () {
        if (my !== token || !chunks.length) return;
        cursor = Math.max(0, Math.min(i, chunks.length - 1));
        var u = makeUtterance(chunks[cursor]);
        u.onend = function () {
          if (my !== token) return;
          /* 暂停期间这一段自己读完了：只推进游标，不开口 */
          if (state === 'paused') {
            if (cursor + 1 < chunks.length) cursor++;
            pausedChunk = cursor;
            return;
          }
          if (cursor + 1 < chunks.length) { cursor++; speakFrom(cursor, false); }
          else { cursor = 0; setState('idle'); }
        };
        u.onerror = function () {
          if (my !== token) return;
          cursor = 0;
          setState('idle');
        };
        try { synth.resume(); } catch (e) {}
        try { synth.speak(u); } catch (e) {}
        setState('speaking');
      }, restart ? 100 : 0);
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (state === 'idle') {
        var text = (getText() || '').trim();
        if (!text) { toast(emptyTip); return; }
        chunks = splitChunks(text);
        if (!chunks.length) { toast(emptyTip); return; }
        speakFrom(0);
      } else if (state === 'speaking') {
        /* 暂停：优先用浏览器自带 pause()，能停在句子中间 */
        try { synth.pause(); } catch (err) {}
        clearTimeout(resumeTimer);
        pausedChunk = cursor;
        setState('paused');
      } else {
        /* 继续：先试自带 resume()；稍后检查真没生效（手机端常见）就从当前句重读 */
        var ok = false;
        try { synth.resume(); ok = true; } catch (err) {}
        setState('speaking');
        if (!ok) { speakFrom(pausedChunk); return; }
        resumeTimer = setTimeout(function () {
          if (state !== 'speaking') return;
          var alive = false;
          try { alive = synth.speaking === true || synth.pending === true || synth.paused === true; } catch (err) {}
          if (!alive) speakFrom(pausedChunk);
        }, 500);
      }
    });

    /* 语速改动：防抖后从当前句重启；暂停态直接停（语速变了接着读没有意义） */
    range.addEventListener('input', function () {
      currentRate = Math.round(parseFloat(range.value) * 10) / 10;
      if (val) val.textContent = currentRate.toFixed(1) + '×';
      setRate(String(currentRate));

      clearTimeout(rateTimer);
      if (state === 'paused') { stop(); return; }
      if (state !== 'speaking') return;
      rateTimer = setTimeout(function () {
        if (state === 'speaking') speakFrom(cursor);
      }, 480);
    });

    range.addEventListener('click', function (e) { e.stopPropagation(); });
    range.addEventListener('pointerdown', function (e) { e.stopPropagation(); });

    /* 文本在朗读中被改动了就停——读的已不是看到的内容 */
    if (opts.textInput) {
      opts.textInput.addEventListener('input', function () {
        if (state !== 'idle') stop();
      });
    }

    global.addEventListener('pagehide', stop);

    setState('idle');
    return { stop: stop, isBusy: function () { return state !== 'idle'; }, supported: true };
  }

  KB.TTS = { mount: mount, splitChunks: splitChunks };
})(window);
