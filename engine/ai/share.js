/* AI 答疑助手：勾选分享、链接编解码、图片导出与只读视图。
   链接格式与原版一致（v2 紧凑格式，旧 v1 链接仍可读）。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  function create(opt) {
    var cfg = opt.cfg;
    var util = opt.util;
    var S = opt.S;
    var D = opt.D;
    var A = opt.A;
    var codec = KB.AICodec;
    var ICONS = util.icons;
    var L = cfg.limits;

    var shareImgBusy = false;
    var shareImgDataUrl = '';

    /* 带 #conv= 打开时还原分享对话，仅查看，不覆盖本地记录。 */
    function loadSharedConv() {
      var m = /(?:^|[#&])conv=([^&]+)/.exec(global.location.hash || '');
      if (!m) return { history: null, shared: false, broken: false };

      /* 接收端也要看守一次：发送端超过 shareLinkMax 就不生成链接了，
         真收到更长的，只可能是在转发时被拼接、被截断后又补了字符，或者根本不是我们的链接 */
      var raw = '';
      try { raw = decodeURIComponent(m[1]); } catch (e) { raw = ''; }
      var limit = (L && L.shareLinkMax) || 16000;
      if (!raw) return { history: null, shared: false, broken: true, reason: 'empty' };
      if (raw.length > limit) return { history: null, shared: false, broken: true, reason: 'too-long' };

      var dec = null;
      try { dec = codec.decodeConv(raw); }
      catch (e) { dec = null; }
      if (dec && dec.length) return { history: dec, shared: true, broken: false };
      return { history: null, shared: false, broken: true, reason: 'truncated' };
    }

    function setSharedReadOnly(on) {
      if (D.headTitle) {
        D.headTitle.textContent = on ? 'AI 答疑助手 · 分享片段' : 'AI 答疑助手';
      }
      /* 输入框、进度条、头部按钮、读卡开关与拖拽手柄由 body 上的类统一隐藏 */
    }

    function countSelectable() {
      return D.msgsEl.querySelectorAll('.ai-msg:not(.sys):not(.err)').length;
    }

    /* 删除／截断 history 后，旧下标会指到别的消息，这两处负责校正。 */
    function pruneSelection() {
      Object.keys(S.selectedSet).forEach(function (k) {
        var i = +k;
        if (!isFinite(i) || i < 0 || i >= S.history.length) delete S.selectedSet[k];
      });
    }
    function shiftSelectionAfter(fromIdx) {
      var old = S.selectedSet;
      S.selectedSet = {};
      Object.keys(old).forEach(function (k) {
        var i = +k;
        if (!isFinite(i) || i === fromIdx) return;
        S.selectedSet[i > fromIdx ? i - 1 : i] = true;
      });
    }

    function updateShareCount() {
      pruneSelection();
      var n = Object.keys(S.selectedSet).length;
      if (D.shareCount) D.shareCount.textContent = '已选 ' + n + ' 条';
      if (D.shareGen) D.shareGen.disabled = n === 0;
      if (D.shareAll) {
        D.shareAll.textContent = (n > 0 && n === countSelectable()) ? '取消全选' : '全选';
      }
    }

    function enterSelectMode() {
      if (!S.history.length) { util.toast('暂无可分享的对话'); return; }
      var firstEnter = !S.selecting;
      if (firstEnter) { S.selecting = true; S.selectedSet = {}; }
      D.msgsEl.classList.add('selecting');
      D.panel.classList.add('ai-selecting');
      D.msgsEl.querySelectorAll('.ai-msg').forEach(function (div) {
        if (div.classList.contains('sys') || div.classList.contains('err')) return;
        if (div.querySelector('.ai-select-box')) return;
        var box = document.createElement('div');
        box.className = 'ai-select-box';
        box.innerHTML = ICONS.CHECK;
        div.appendChild(box);
      });
      updateShareCount();
      if (D.shareBar) D.shareBar.classList.add('show');
      if (firstEnter) util.toast('点选要分享的对话，再点"生成分享"');
    }

    function exitSelectMode() {
      S.selecting = false;
      S.selectedSet = {};
      D.msgsEl.classList.remove('selecting');
      D.panel.classList.remove('ai-selecting');
      D.msgsEl.querySelectorAll('.ai-select-box').forEach(function (b) { b.remove(); });
      D.msgsEl.querySelectorAll('.ai-msg.selected').forEach(function (d) {
        d.classList.remove('selected');
      });
      if (D.shareBar) D.shareBar.classList.remove('show');
      if (D.shareAll) D.shareAll.textContent = '全选';
    }

    function pickedMessages() {
      pruneSelection();
      var picked = [];
      S.history.forEach(function (m, i) { if (S.selectedSet[i]) picked.push(m); });
      return picked;
    }

    function genShareLink() {
      var picked = pickedMessages();
      if (!picked.length) { util.toast('勾选状态已失效，请重新点选要分享的消息'); return; }
      var enc = codec.encodeConv(picked);
      if (!enc) { util.toast('暂无可分享的内容'); return; }
      if (enc.length > L.shareLinkMax) { util.toast('所选内容过长，请减少勾选'); return; }
      var base = global.location.href.split('#')[0].replace(/[^/]*$/, cfg.sharePage);
      var url = base + '#conv=' + encodeURIComponent(enc);
      util.copy(url, function () {
        util.toast('已复制分享链接（仅含所选 ' + picked.length + ' 条）✅');
        exitSelectMode();
      });
    }

    function openShareChoice() {
      if (shareImgBusy) { util.toast('正在生成分享图片，请稍候…'); return; }
      var picked = pickedMessages();
      if (!picked.length) { util.toast('勾选状态已失效，请重新点选要分享的消息'); return; }
      var overlay = document.createElement('div');
      overlay.className = 'ai-share-choice-ov';
      overlay.innerHTML =
        '<div class="ai-share-choice-box">' +
          '<div class="ai-share-choice-title">生成分享</div>' +
          '<div class="ai-share-choice-sub">已选 ' + picked.length + ' 条对话，请选择分享方式：</div>' +
          '<button type="button" class="ai-share-opt" data-mode="link">' +
            '<span class="opt-txt"><span class="opt-tt">🔗生成链接</span><span class="opt-dd">复制一条分享链接，对方打开即可查看所选对话（内容较长时链接也会较长）</span></span>' +
          '</button>' +
          '<button type="button" class="ai-share-opt" data-mode="img">' +
            '<span class="opt-txt"><span class="opt-tt">🖼️生成图片</span><span class="opt-dd">把所选对话渲染成一张图片，保存到相册或下载（适合内容较多时）</span></span>' +
          '</button>' +
          '<button type="button" class="ai-share-choice-cancel">取消</button>' +
        '</div>';
      document.body.appendChild(overlay);
      global.requestAnimationFrame(function () { overlay.classList.add('show'); });
      function closeChoice() {
        overlay.classList.remove('show');
        setTimeout(function () { overlay.remove(); }, 220);
      }
      overlay.addEventListener('click', function (e) {
        var opt = e.target && e.target.closest ? e.target.closest('.ai-share-opt') : null;
        if (opt && !opt.disabled) {
          closeChoice();
          if (opt.dataset.mode === 'link') genShareLink();
          else generateShareImage();
          return;
        }
        if (e.target === overlay || (e.target.closest && e.target.closest('.ai-share-choice-cancel'))) {
          closeChoice();
        }
      });
    }

    function loadHtml2Canvas() {
      if (global.html2canvas) return Promise.resolve(global.html2canvas);
      var urls = cfg.share.html2canvasUrls;
      function tryLoad(i) {
        return new Promise(function (resolve, reject) {
          if (i >= urls.length) { reject(new Error('组件加载失败，请检查网络')); return; }
          var s = document.createElement('script');
          var done = false;
          s.src = urls[i];
          s.onload = function () {
            if (done) return;
            done = true;
            if (global.html2canvas) resolve(global.html2canvas);
            else tryLoad(i + 1).then(resolve, reject);
          };
          s.onerror = function () {
            if (done) return;
            done = true;
            tryLoad(i + 1).then(resolve, reject);
          };
          setTimeout(function () {
            if (done || global.html2canvas) return;
            done = true;
            try { s.remove(); } catch (e) {}
            tryLoad(i + 1).then(resolve, reject);
          }, cfg.share.html2canvasTimeout);
          document.head.appendChild(s);
        });
      }
      return tryLoad(0);
    }

    function cssColor(name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#ffffff';
    }

    function buildShareImage(h2c, picked) {
      return new Promise(function (resolve, reject) {
        var wrap = document.createElement('div');
        wrap.className = 'ai-share-img-wrap';

        var head = document.createElement('div');
        head.className = 'ai-share-img-head';
        head.innerHTML = '<div>🤖 AI 答疑助手 · 分享片段</div>';
        wrap.appendChild(head);

        var body = document.createElement('div');
        body.className = 'ai-share-img-body';
        picked.forEach(function (p) {
          var src = null;
          try { src = D.msgsEl.querySelector('.ai-msg[data-idx="' + p.i + '"]'); } catch (e) {}
          var node;
          if (src) {
            node = src.cloneNode(true);
            node.querySelectorAll('.ai-msg-actions, .ai-select-box, .ai-cursor').forEach(function (n) {
              n.remove();
            });
            node.classList.remove('selected');
          } else {
            node = document.createElement('div');
            node.className = 'ai-msg ' + (p.m.role === 'user' ? 'user' : 'ai');
            if (p.m.role === 'user') node.textContent = p.m.content || '';
            else node.innerHTML = A.markdown.renderMD(p.m.content || '');
          }
          body.appendChild(node);
        });
        wrap.appendChild(body);

        var foot = document.createElement('div');
        foot.className = 'ai-share-img-foot';
        foot.textContent = cfg.share.downloadedTip;
        wrap.appendChild(foot);
        document.body.appendChild(wrap);

        var cleanup = function () { try { wrap.remove(); } catch (e) {} };
        var waitImgs = [];
        wrap.querySelectorAll('img').forEach(function (img) {
          if (img.complete) return;
          waitImgs.push(new Promise(function (res) {
            img.addEventListener('load', res, { once: true });
            img.addEventListener('error', res, { once: true });
          }));
        });
        var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
        Promise.all([fontsReady, Promise.all(waitImgs)]).then(function () {
          return new Promise(function (res) { setTimeout(res, 60); });
        }).then(function () {
          var h = wrap.offsetHeight || 0;
          if (!h) { cleanup(); reject(new Error('渲染失败')); return; }
          if (h > L.shareImageMaxHeight) {
            cleanup();
            reject(new Error('内容过长，建议减少勾选后重试'));
            return;
          }
          var scale = 2;
          if (h * scale > L.shareImageScaleLimit) scale = Math.max(1, L.shareImageScaleLimit / h);
          h2c(wrap, {
            backgroundColor: cssColor('--ai-c001'),
            scale: scale,
            useCORS: true,
            logging: false,
            width: L.shareImageWidth,
            height: h
          }).then(function (canvas) {
            var dataUrl = '';
            try { dataUrl = canvas.toDataURL('image/png'); }
            catch (e) { console.error('[ai-share] toDataURL 失败:', e); }
            cleanup();
            if (dataUrl) resolve(dataUrl);
            else reject(new Error('导出图片失败'));
          }).catch(function (err) { cleanup(); reject(err); });
        }).catch(function (err) { cleanup(); reject(err); });
      });
    }

    function generateShareImage() {
      if (shareImgBusy) return;
      pruneSelection();
      var picked = [];
      S.history.forEach(function (m, i) { if (S.selectedSet[i]) picked.push({ m: m, i: i }); });
      if (!picked.length) { util.toast('勾选状态已失效，请重新点选要分享的消息'); return; }
      /* 勾了但 DOM 里找不到节点时先重绘补齐，否则图片会莫名少几条 */
      if (picked.some(function (p) {
        return !D.msgsEl.querySelector('.ai-msg[data-idx="' + p.i + '"]');
      })) {
        A.messages.renderHistory();
        picked = [];
        S.history.forEach(function (m, i) { if (S.selectedSet[i]) picked.push({ m: m, i: i }); });
        if (!picked.length) { util.toast('请重新点选要分享的消息'); return; }
      }
      shareImgBusy = true;
      util.toast('正在生成分享图片，请稍候…');
      loadHtml2Canvas().then(function (h2c) {
        return buildShareImage(h2c, picked);
      }).then(function (dataUrl) {
        shareImgBusy = false;
        shareImgDataUrl = dataUrl;
        exitSelectMode();
        showShareImgPreview();
      }).catch(function (err) {
        shareImgBusy = false;
        console.error('[ai-share] 生成图片失败:', err);
        util.toast('图片生成失败：' + ((err && err.message) || '请检查网络后重试'));
      });
    }

    function showShareImgPreview() {
      if (!shareImgDataUrl) return;
      var ov = document.createElement('div');
      ov.className = 'ai-share-img-ov';
      ov.innerHTML =
        '<div class="ai-share-img-scroll"><img alt="分享图片" /></div>' +
        '<div class="ai-share-img-tip">✅ 图片已生成 · 长按图片可直接保存；点「保存图片」可保存到相册或下载</div>' +
        '<div class="ai-share-img-btns">' +
          '<button type="button" class="ai-share-img-save">保存图片</button>' +
          '<button type="button" class="ai-share-img-close">关闭</button>' +
        '</div>';
      var img = ov.querySelector('img');
      if (img) img.src = shareImgDataUrl;
      document.body.appendChild(ov);
      global.requestAnimationFrame(function () { ov.classList.add('show'); });
      function closePreview() {
        ov.classList.remove('show');
        setTimeout(function () { try { ov.remove(); } catch (e) {} }, 230);
      }
      var saveBtn = ov.querySelector('.ai-share-img-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', function () {
          saveShareImgToAlbum(saveBtn, closePreview);
        });
      }
      var closeBtn = ov.querySelector('.ai-share-img-close');
      if (closeBtn) closeBtn.addEventListener('click', closePreview);
      ov.addEventListener('click', function (e) { if (e.target === ov) closePreview(); });
    }

    function downloadShareImg(done) {
      try {
        var d = new Date();
        function p(n) { return (n < 10 ? '0' : '') + n; }
        var name = cfg.share.fileNamePrefix + d.getFullYear() +
          p(d.getMonth() + 1) + p(d.getDate()) + '_' +
          p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.png';
        var a = document.createElement('a');
        a.href = shareImgDataUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { try { a.remove(); } catch (e) {} }, 120);
        util.toast('图片已开始下载；若未自动保存，可在预览中长按图片另存');
        if (typeof done === 'function') done();
      } catch (err) {
        console.error('[ai-share] 下载失败:', err);
        util.toast('当前环境不支持自动下载，请长按预览图片保存');
      }
    }

    function saveShareImgToAlbum(btn, done) {
      if (!shareImgDataUrl) { util.toast('图片还没生成好，请稍候'); return; }
      if (global.wusiSaveImage) {
        if (btn) btn.disabled = true;
        util.toast('正在保存到相册…');
        try {
          global.wusiSaveImage(shareImgDataUrl).then(function (result) {
            if (btn) btn.disabled = false;
            if (result && result.status === 'success') {
              util.toast('图片已保存到相册 ✅');
              if (typeof done === 'function') done();
            } else {
              util.toast('保存失败：' + ((result && result.message) || '未知错误'));
            }
          }).catch(function (err) {
            if (btn) btn.disabled = false;
            console.error('[ai-share] 保存相册失败:', err);
            downloadShareImg(done);
          });
        } catch (err) {
          if (btn) btn.disabled = false;
          console.error('[ai-share] 保存相册异常:', err);
          downloadShareImg(done);
        }
      } else {
        downloadShareImg(done);
      }
    }

    function bindEvents() {
      D.msgsEl.addEventListener('click', function (e) {
        if (!S.selecting) return;
        var div = e.target && e.target.closest ? e.target.closest('.ai-msg') : null;
        if (!div) return;
        if (div.classList.contains('sys') || div.classList.contains('err')) return;
        var idx = +div.dataset.idx;
        if (!isFinite(idx) || idx < 0) {
          util.toast('这条还没生成完，等它结束再勾选');
          return;
        }
        if (S.selectedSet[idx]) {
          delete S.selectedSet[idx];
          div.classList.remove('selected');
        } else {
          S.selectedSet[idx] = true;
          div.classList.add('selected');
        }
        updateShareCount();
      });
      if (D.shareGen) D.shareGen.addEventListener('click', openShareChoice);
      if (D.shareCancel) D.shareCancel.addEventListener('click', exitSelectMode);
      if (D.shareAll) {
        D.shareAll.addEventListener('click', function () {
          pruneSelection();
          var allSel = Object.keys(S.selectedSet).length === countSelectable() && countSelectable() > 0;
          D.msgsEl.querySelectorAll('.ai-msg').forEach(function (div) {
            if (div.classList.contains('sys') || div.classList.contains('err')) return;
            var idx = +div.dataset.idx;
            if (!isFinite(idx) || idx < 0) return;
            if (allSel) { delete S.selectedSet[idx]; div.classList.remove('selected'); }
            else { S.selectedSet[idx] = true; div.classList.add('selected'); }
          });
          updateShareCount();
        });
      }
    }

    return {
      loadSharedConv: loadSharedConv,
      setSharedReadOnly: setSharedReadOnly,
      enterSelectMode: enterSelectMode,
      exitSelectMode: exitSelectMode,
      pruneSelection: pruneSelection,
      shiftSelectionAfter: shiftSelectionAfter,
      updateShareCount: updateShareCount,
      genShareLink: genShareLink,
      generateShareImage: generateShareImage,
      bindEvents: bindEvents
    };
  }

  KB.AIShare = { create: create };
})(window);
