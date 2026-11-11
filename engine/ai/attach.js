/* AI 答疑助手：附件。选图、文本读取、待发送预览条、气泡内展示、大图与拖放。
   图片压缩与全站图片控件是两套口径：这边按最长边重采样后转 JPEG，
   是发给模型的多模态输入，不进图床。 */

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

    function compressImage(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onerror = function () { reject(new Error('读取失败')); };
        reader.onload = function (ev) {
          var img = new Image();
          img.onerror = function () { reject(new Error('图片解析失败')); };
          img.onload = function () {
            var w = img.naturalWidth || img.width;
            var h = img.naturalHeight || img.height;
            var scale = Math.min(1, L.imgMaxDim / Math.max(w, h));
            var nw = Math.max(1, Math.round(w * scale));
            var nh = Math.max(1, Math.round(h * scale));
            var cv = document.createElement('canvas');
            cv.width = nw; cv.height = nh;
            var ctx = cv.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, nw, nh);
            ctx.drawImage(img, 0, 0, nw, nh);
            var url;
            try { url = cv.toDataURL('image/jpeg', L.imgQuality); }
            catch (e) { url = ev.target.result; }
            resolve({ dataUrl: url, w: nw, h: nh });
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    function readTextFile(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onerror = function () { reject(new Error('读取失败')); };
        reader.onload = function (ev) {
          var t = String(ev.target.result || '');
          if (t.length > L.maxTxtChars) {
            t = t.slice(0, L.maxTxtChars) + '\n\n…（文件过长，已截断）';
          }
          resolve(t);
        };
        reader.readAsText(file, 'utf-8');
      });
    }

    function isImageFile(f) {
      return /^image\//i.test(f.type || '') ||
        /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name || '');
    }

    /* 图片与文本都是异步处理，按传入顺序占位再加进附件栏，保证顺序与选择顺序一致。 */
    function addFiles(fileList) {
      var files = Array.prototype.slice.call(fileList || []);
      if (!files.length) return;
      var slots = [];
      var taken = 0;
      var jobs = [];
      files.forEach(function (f, idx) {
        if (S.pendingAttachments.length + taken >= L.maxFiles) {
          util.toast('最多同时上传 ' + L.maxFiles + ' 个附件');
          return;
        }
        if (isImageFile(f)) {
          if (f.size > L.maxImgBytes) {
            util.toast((f.name || '图片') + ' 超过 12MB，已跳过');
            return;
          }
          taken++;
          jobs.push(compressImage(f).then(function (c) {
            slots[idx] = {
              type: 'image', name: f.name || '粘贴的图片',
              dataUrl: c.dataUrl, w: c.w, h: c.h
            };
          }).catch(function () { util.toast('图片处理失败：' + (f.name || '')); }));
        } else {
          if (f.size > L.maxTxtBytes) {
            util.toast((f.name || '文件') + ' 超过 2MB，已跳过');
            return;
          }
          taken++;
          jobs.push(readTextFile(f).then(function (txt) {
            slots[idx] = { type: 'text', name: f.name || '文本文件', text: txt };
          }).catch(function () { util.toast('文件读取失败：' + (f.name || '')); }));
        }
      });
      if (!jobs.length) return;
      Promise.all(jobs).then(function () {
        var added = 0;
        slots.forEach(function (s) {
          if (s) { S.pendingAttachments.push(s); added++; }
        });
        if (!added) return;
        renderAttachBar();
        util.toast('已添加 ' + added + ' 个附件');
      });
    }

    function renderAttachBar() {
      var bar = D.attachBar;
      if (!bar) return;
      bar.innerHTML = '';
      S.pendingAttachments.forEach(function (a, i) {
        var chip = document.createElement('div');
        chip.className = 'ai-chip';
        if (a.type === 'image') {
          var im = document.createElement('img');
          im.src = a.dataUrl;
          im.alt = a.name || '';
          chip.appendChild(im);
        } else {
          var ic = document.createElement('span');
          ic.className = 'ai-chip-icon';
          ic.textContent = '📄';
          chip.appendChild(ic);
        }
        var nm = document.createElement('span');
        nm.className = 'ai-chip-name';
        nm.textContent = a.name || (a.type === 'image' ? '图片' : '文件');
        nm.title = nm.textContent;
        chip.appendChild(nm);
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'ai-chip-x';
        x.title = '移除';
        x.innerHTML = util.icons.CLOSE_SM;
        x.addEventListener('click', function () {
          S.pendingAttachments.splice(i, 1);
          renderAttachBar();
        });
        chip.appendChild(x);
        bar.appendChild(chip);
      });
    }

    function openLightbox(src) {
      var lb = document.createElement('div');
      lb.className = 'ai-lightbox';
      var img = document.createElement('img');
      img.src = src;
      lb.appendChild(img);
      lb.addEventListener('click', function () { lb.remove(); });
      document.body.appendChild(lb);
      global.requestAnimationFrame(function () { lb.classList.add('show'); });
    }

    function buildAttachView(atts) {
      var wrap = document.createElement('div');
      wrap.className = 'ai-msg-attach';
      (atts || []).forEach(function (a) {
        if (a.type === 'image' && a.dataUrl) {
          var img = document.createElement('img');
          img.src = a.dataUrl;
          img.alt = a.name || '';
          img.title = '点击查看大图';
          img.addEventListener('click', function (e) {
            e.stopPropagation();
            openLightbox(a.dataUrl);
          });
          wrap.appendChild(img);
        } else {
          var f = document.createElement('div');
          f.className = 'ai-file-chip';
          f.textContent = '📄 ' + (a.name || '文件');
          wrap.appendChild(f);
        }
      });
      return wrap;
    }

    /* 构造发给接口的多模态消息：图片按最近优先累计，超出预算的旧图降级成文字。 */
    function buildApiMessages(systemContent, history) {
      var out = [{ role: 'system', content: systemContent }];
      var recent = history.slice(-L.apiRecentMsgs);
      var imgCount = 0;
      var allowImg = [];
      for (var i = recent.length - 1; i >= 0; i--) {
        var m = recent[i];
        allowImg[i] = false;
        if (m.role === 'user' && m.attachments && m.attachments.length) {
          var n = 0;
          m.attachments.forEach(function (a) { if (a.type === 'image') n++; });
          if (n > 0 && imgCount + n <= L.maxImagesReq) {
            allowImg[i] = true;
            imgCount += n;
          }
        }
      }
      recent.forEach(function (m, i) {
        if (m.role === 'user' && m.attachments && m.attachments.length) {
          var parts = [];
          if (m.content) parts.push({ type: 'text', text: m.content });
          m.attachments.forEach(function (a) {
            if (a.type === 'image') {
              if (allowImg[i] && a.dataUrl) {
                parts.push({ type: 'image_url', image_url: { url: a.dataUrl } });
              } else {
                parts.push({ type: 'text', text: '【早前上传的图片：' + (a.name || '图片') + '（为节省上下文已省略图片内容）】' });
              }
            } else if (a.type === 'text') {
              parts.push({ type: 'text', text: '【用户上传的文件：' + (a.name || '文件') + '】\n' + a.text });
            }
          });
          out.push({ role: 'user', content: parts });
        } else if (m.content) {
          out.push({ role: m.role, content: m.content });
        }
      });
      return out;
    }

    function handlePaste(e) {
      var cd = e.clipboardData || global.clipboardData;
      if (!cd) return;
      var imgs = [];
      if (cd.items && cd.items.length) {
        for (var i = 0; i < cd.items.length; i++) {
          var it = cd.items[i];
          if (it.kind === 'file' && /^image\//i.test(it.type || '')) {
            var f = it.getAsFile();
            if (f) imgs.push(f);
          }
        }
      }
      if (!imgs.length && cd.files && cd.files.length) {
        for (var j = 0; j < cd.files.length; j++) {
          if (/^image\//i.test(cd.files[j].type || '')) imgs.push(cd.files[j]);
        }
      }
      if (!imgs.length) return;
      e.preventDefault();
      addFiles(imgs);
    }

    function bindEvents() {
      D.attachBtn.addEventListener('click', function () { D.fileInput.click(); });
      D.fileInput.addEventListener('change', function () {
        addFiles(D.fileInput.files);
        D.fileInput.value = '';
      });
      D.inputEl.addEventListener('paste', handlePaste);
      document.addEventListener('paste', function (e) {
        if (!D.panel.classList.contains('show')) return;
        if (document.activeElement === D.inputEl) return;
        if (!D.panel.contains(e.target)) return;
        handlePaste(e);
      });

      /* 拖放：整页接住，落在面板里才加附件；落在面板外只提示，避免浏览器直接打开文件。 */
      var dropHint = document.createElement('div');
      dropHint.className = 'ai-drop-hint';
      dropHint.innerHTML = '<span class="ai-drop-text">松手添加图片 / 文件</span>';
      (D.panel.querySelector('.ai-input-wrap') || D.panel).appendChild(dropHint);
      var dropTipEl = dropHint.querySelector('.ai-drop-text');
      var dragDepth = 0;
      var dropOn = false;
      var dropCount = -1;

      function canDrop() {
        return D.panel.classList.contains('show') && D.bodyEl &&
          !D.bodyEl.classList.contains('hide');
      }
      function isFileDrag(e) {
        var dt = e.dataTransfer;
        if (!dt || !dt.types) return false;
        for (var i = 0; i < dt.types.length; i++) {
          if (dt.types[i] === 'Files') return true;
        }
        return false;
      }
      function setDropHint(on, count) {
        if (on && dropTipEl && count !== dropCount) {
          dropCount = count;
          dropTipEl.textContent = count > 1 ? '松手添加 ' + count + ' 个文件' : '松手添加图片 / 文件';
        }
        if (!on) dropCount = -1;
        if (on === dropOn) return;
        dropOn = on;
        dropHint.classList.toggle('show', on);
        D.panel.classList.toggle('drop-active', on);
      }

      document.addEventListener('dragenter', function (e) {
        if (!D.panel.classList.contains('show') || !isFileDrag(e)) return;
        dragDepth++;
      });
      document.addEventListener('dragover', function (e) {
        if (!D.panel.classList.contains('show') || !isFileDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (canDrop() && D.panel.contains(e.target)) {
          setDropHint(true, e.dataTransfer.items ? e.dataTransfer.items.length : 0);
        } else {
          setDropHint(false);
        }
      });
      document.addEventListener('dragleave', function (e) {
        if (!D.panel.classList.contains('show') || !isFileDrag(e)) return;
        dragDepth--;
        if (dragDepth <= 0) { dragDepth = 0; setDropHint(false); }
      });
      document.addEventListener('drop', function (e) {
        if (!D.panel.classList.contains('show') || !isFileDrag(e)) return;
        e.preventDefault();
        dragDepth = 0;
        setDropHint(false);
        var files = e.dataTransfer.files;
        if (!files || !files.length) return;
        if (!canDrop()) { util.toast('先填好 API 配置，再拖文件进来'); return; }
        if (!D.panel.contains(e.target)) {
          util.toast('把文件拖到 AI 答疑助手的窗口里');
          return;
        }
        addFiles(files);
      });
    }

    return {
      addFiles: addFiles,
      renderAttachBar: renderAttachBar,
      buildAttachView: buildAttachView,
      openLightbox: openLightbox,
      buildApiMessages: buildApiMessages,
      bindEvents: bindEvents
    };
  }

  KB.AIAttach = { create: create };
})(window);
