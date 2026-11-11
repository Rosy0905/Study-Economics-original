/* 图床：笔记图片的 Blob 仓库（IndexedDB）。

   - 库名 kb-blobs-v1，改名必须换版本号，否则备份对不上号
   - 写事务必须挂 onabort：连接被关、页面卸载这类中止不走 onerror，
     不挂的话 Promise 永不 settle，调用方无声卡死
   - 别的标签页升级库时本连接自动失效，onversionchange 自清重开
   - 出入证（objectURL）按图缓存：每张图整个会话只开一张证、处处复用，
     页签关闭由浏览器统一回收。不做「离开视口逐张 revoke」——
     卡片重渲染频繁，逐张开关既费又容易把还挂着的图收成裂图
   - 图床不可用（隐私模式、IDB 被禁）时所有入口安静降级：
     插图退回 base64 内联，功能不受阻，只是存储变胖 */
(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  var NAME = 'kb-blobs-v1';
  var STORE = 'blobs';
  var VERSION = 1;

  var cached = null;    /* 单连接：开一次，全程复用 */
  var urlCache = {};    /* id → objectURL */
  var sizeCache = {};   /* id → 字节数（压缩提示要用，避免为算体积反复读库） */

  /* 图片归属：键跟 localStorage 用同一套命名 —— kb:{项目}:{子页}:img:{随机}。
     归属写在键里、不另存元数据表：导出按扫描到的引用取图、清数据按前缀回收、
     孤儿按全站引用对账，三件事都只认这一个来源，和笔记文字完全同步。
     没调 setScope（老页面或独立页面）时退回 img-{随机} 老格式，旧数据照样读得出。 */
  var bootCfg = global.PROJECT_CONFIG || {};
  var scope = {
    prefix: bootCfg.storagePrefix || 'kb',
    projectId: bootCfg.projectId || 'default',
    moduleId: ''
  };

  function setScope(o) {
    if (!o) return;
    if (o.prefix) scope.prefix = o.prefix;
    if (o.projectId) scope.projectId = o.projectId;
    scope.moduleId = o.moduleId || '';
  }

  /* 当前子页的键前缀，形如 kb:demo:demo: */
  function scopePrefix() {
    return scope.prefix + ':' + scope.projectId + ':' + scope.moduleId + ':';
  }

  function open() {
    if (cached) return Promise.resolve(cached);
    return new Promise(function (res, rej) {
      var r;
      try { r = indexedDB.open(NAME, VERSION); }
      catch (e) { rej(e); return; }
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      r.onsuccess = function () {
        cached = r.result;
        cached.onclose = function () { cached = null; };
        cached.onversionchange = function () {
          try { cached.close(); } catch (e) {}
          cached = null;
        };
        res(cached);
      };
      r.onerror = function () { rej(r.error); };
      r.onblocked = function () { rej(new Error('图床被其他标签页占用')); };
    });
  }

  function close() {
    if (!cached) return Promise.resolve();
    try { cached.close(); } catch (e) {}
    cached = null;
    return Promise.resolve();
  }

  /* 写事务：run 往 store 上发请求，事务整体完成才 resolve */
  function tx(mode, run) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t;
        try { t = db.transaction(STORE, mode); }
        catch (e) { rej(e); return; }
        var out;
        try { out = run(t.objectStore(STORE)); }
        catch (e) { try { t.abort(); } catch (e2) {} rej(e); return; }
        t.oncomplete = function () { res(out); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error || new Error('事务被中止')); };
      });
    });
  }

  /* 读请求：值挂在请求自己的 success 回调上，不能等 oncomplete 再反查
     （IDRRequest 自己也有 result 属性，反查会拿到请求对象本身） */
  function rq(mode, run) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t;
        try { t = db.transaction(STORE, mode); }
        catch (e) { rej(e); return; }
        var r = run(t.objectStore(STORE));
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
        t.onabort = function () { rej(t.error || new Error('事务被中止')); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }

  /* ---------- 对外：put / get / del ---------- */

  function put(id, blob) {
    if (!id || !blob) return Promise.resolve(false);
    sizeCache[id] = blob.size;
    return tx('readwrite', function (st) { st.put(blob, id); })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  function get(id) {
    return rq('readonly', function (st) { return st.get(id); })
      .then(function (b) { return b || null; })
      .catch(function () { return null; });
  }

  /* 删库要能回答删没删成：失败原因直接返回，不静默吞掉 */
  function del(id) {
    delete urlCache[id];
    delete sizeCache[id];
    return tx('readwrite', function (st) { st.delete(id); })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  /* 清仓（清除数据用）：连缓存里的证一起收 */
  function drop() {
    Object.keys(urlCache).forEach(function (id) {
      try { URL.revokeObjectURL(urlCache[id]); } catch (e) {}
    });
    urlCache = {};
    sizeCache = {};
    return tx('readwrite', function (st) { st.clear(); }).catch(function () {});
  }

  /* ---------- 出入证 ---------- */

  function urlOf(id) {
    if (urlCache[id]) return Promise.resolve(urlCache[id]);
    return get(id).then(function (blob) {
      if (!blob) return null;
      sizeCache[id] = blob.size;
      var u = URL.createObjectURL(blob);
      urlCache[id] = u;
      return u;
    });
  }

  /* 压缩重编码后同一张图换了内容：换发新证、收回旧证 */
  function replaceUrl(id, blob) {
    if (urlCache[id]) {
      try { URL.revokeObjectURL(urlCache[id]); } catch (e) {}
      delete urlCache[id];
    }
    sizeCache[id] = blob ? blob.size : 0;
    if (!blob) return Promise.resolve(null);
    var u = URL.createObjectURL(blob);
    urlCache[id] = u;
    return Promise.resolve(u);
  }

  /* ---------- 图片引用与正文互转 ---------- */

  function newId() {
    var rnd = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    return scope.moduleId ? scopePrefix() + 'img:' + rnd : 'img-' + rnd;
  }

  function dataUrlToBlob(dataUrl) {
    try {
      var parts = String(dataUrl).split(',');
      var mime = (String(parts[0]).match(/data:([^;]+)/) || [])[1] || 'image/png';
      var bin = atob(parts[1]);
      var u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new Blob([u8], { type: mime });
    } catch (e) { return null; }
  }

  /* 当前文件的真实字节数：blob: 证查缓存，data: 按编码长度折算 */
  function bytesOf(img) {
    var id = img.dataset && img.dataset.blobId;
    if (id && sizeCache[id] != null) return sizeCache[id];
    var src = img.getAttribute('src') || '';
    if (src.indexOf('data:') === 0) return Math.round(src.length * 0.75);
    return 0;
  }

  /* 落盘前把 DOM 里的 blob: 证换回 idb: 引用（同步，保存路径都是同步的）。
     从别的笔记粘过来的图可能只带证没带号 —— 反查缓存把号补上 */
  function serializeHtml(html) {
    var s = String(html || '');
    if (s.indexOf('blob:') === -1 && s.indexOf('idb:') === -1) return s;
    var box = document.createElement('div');
    box.innerHTML = s;
    var changed = false;
    var rev = null;
    box.querySelectorAll('img').forEach(function (img) {
      var src = img.getAttribute('src') || '';
      if (src.indexOf('blob:') === 0) {
        var id = img.dataset.blobId;
        if (!id) {
          if (!rev) {
            rev = {};
            Object.keys(urlCache).forEach(function (k) { rev[urlCache[k]] = k; });
          }
          id = rev[src];
        }
        if (id) {
          img.setAttribute('src', 'idb:' + id);
          img.dataset.blobId = id;
          changed = true;
        }
      } else if (src.indexOf('idb:') === 0) {
        img.dataset.blobId = src.slice(4);
      }
    });
    return changed ? box.innerHTML : s;
  }

  /* ---------- 孤儿回收 ---------- */

  /* 从一段文本里取出所有 idb: 引用。
     传 into 时并进同一个集合，便于连着扫多个键 */
  function refsIn(text, into) {
    var out = into || {};
    /* 键可能带归属前缀（kb:demo:demo:img:xxx），也可能是不带前缀的老 key（img-xxx） */
    var re = /idb:([A-Za-z0-9_:-]+)/g;
    var m;
    while ((m = re.exec(String(text || '')))) out[m[1]] = true;
    return out;
  }

  /* 全站所有值里出现过的引用，「这张图还有没有别人在用」就靠它判断 */
  function refsAll() {
    var out = {};
    try {
      for (var i = 0; i < global.localStorage.length; i++) {
        var k = global.localStorage.key(i);
        if (!k) continue;
        /* 影子与落库时刻属内部状态，里面那份正文副本不该算作「还有人用」 */
        if (KB.Store && KB.Store.isInternalKey && KB.Store.isInternalKey(k)) continue;
        var v = global.localStorage.getItem(k) || '';
        if (v.indexOf('idb:') !== -1) refsIn(v, out);
      }
    } catch (e) {}
    /* 内容类正文在库里，镜像里那份才是最新的，不扫会误判成没人用 */
    if (KB.Store && KB.Store.dump) {
      try {
        var d = KB.Store.dump() || {};
        Object.keys(d).forEach(function (key) {
          if (d[key].indexOf('idb:') !== -1) refsIn(d[key], out);
        });
      } catch (e) {}
    }
    return out;
  }

  /* 笔记保存后对账：旧引用有、新引用没有的图，确认全站没有别的笔记再用，才删。
     删除是异步的，失败静默 —— 孤儿最多占点空间，不影响正确性 */
  function syncNoteRefs(oldHtml, newHtml) {
    var oldIds = refsIn(oldHtml);
    var newIds = refsIn(newHtml);
    var gone = Object.keys(oldIds).filter(function (id) { return !newIds[id]; });
    if (!gone.length) return;
    /* 图也可能被别的笔记、我的卡片引用，全站带 idb: 的值都要算进去，
       否则会误删别人还在用的图 */
    var others = refsAll();
    gone.forEach(function (id) {
      if (others[id]) return;
      del(id);
    });
  }

  /* ---------- 渲染注水：idb: 引用 → 出入证 ---------- */

  /* 图床里找不到这张图时给一次可见提示；同一会话只提示一次，避免重绘刷屏 */
  var missingImageNotified = false;
  function reportMissingImage() {
    if (missingImageNotified) return;
    missingImageNotified = true;
    try {
      if (global.KB && global.KB.UI && global.KB.UI.toast) {
        global.KB.UI.toast('⚠️ 有图片没能读出来，可能是备份没带图片，可重新导入备份试试');
      }
    } catch (e) {}
  }

  /* 缺图占位：常驻显示，不是一块空白、不是转瞬即逝的提示。
     占位本身是内联 SVG，不依赖外链、不依赖样式表，任何页面都能显示 */
  var MISSING_SRC = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120" viewBox="0 0 360 120">' +
    '<rect x="1.5" y="1.5" width="357" height="117" rx="10" fill="var(--miss-bg,#f7faf7)" stroke="var(--miss-line,#cfe0d4)" stroke-width="3" stroke-dasharray="7 6"/>' +
    '<text x="180" y="56" text-anchor="middle" font-family="PingFang SC,Microsoft YaHei,sans-serif" font-size="13" fill="var(--miss-fg,#5f7d66)">图片没能读出来</text>' +
    '<text x="180" y="78" text-anchor="middle" font-family="PingFang SC,Microsoft YaHei,sans-serif" font-size="11" fill="var(--miss-fg2,#96ab9b)">点一下重试</text>' +
    '</svg>'
  );

  /* 重试只重解一次出入证，不改正文，也不写库 */
  function retryImage(img, id) {
    urlOf(id).then(function (u) {
      if (!u || !img.isConnected) return;
      delete img.dataset.imgMissing;
      img.classList.remove('kb-img-missing');
      img.removeAttribute('title');
      img.style.cursor = '';
      img.src = u;
    });
  }

  function markMissing(img, id) {
    img.dataset.imgMissing = '1';
    img.classList.add('kb-img-missing');
    img.setAttribute('title', '这张图在图床里找不到，点一下重试');
    img.style.cursor = 'pointer';
    if (img.getAttribute('src') !== MISSING_SRC) img.src = MISSING_SRC;
    reportMissingImage();
    if (!img.dataset.retryBound) {
      img.dataset.retryBound = '1';
      img.addEventListener('click', function () {
        if (img.dataset.imgMissing !== '1') return;
        retryImage(img, id);
      });
    }
    /* 自动重试一次：导入回库可能比这次注水晚一步 */
    if (!img.dataset.retried) {
      img.dataset.retried = '1';
      setTimeout(function () {
        if (img.isConnected && img.dataset.imgMissing === '1') retryImage(img, id);
      }, 1500);
    }
  }

  /* 卡片列表每次重建后调一次；面板开合不重建内容，不用重复跑 */
  function hydrate(root, selector) {
    if (!root || !root.querySelectorAll) return;
    /* 不传 selector 时沿用笔记区口径；其它容器（答案区、编辑器）自行指定 */
    root.querySelectorAll(selector || '.note-editor img').forEach(function (img) {
      var src = img.getAttribute('src') || '';
      var id = null;
      if (src.indexOf('idb:') === 0) id = src.slice(4);
      else if (img.dataset.blobId) id = img.dataset.blobId;
      if (!id) return;
      img.dataset.blobId = id;
      if (urlCache[id]) { img.src = urlCache[id]; return; }
      urlOf(id).then(function (u) {
        /* 注水是异步的，等回来时卡片可能已被重绘换掉 —— 只认还挂着的 */
        if (u && img.isConnected) { img.src = u; return; }
        if (!u && img.isConnected) markMissing(img, id);
      });
    });
    /* 渲染统一入口：图片组件在时把历史绝对 px 换成容器百分比，幂等 */
    if (global.KB && global.KB.ImgCtl && global.KB.ImgCtl.normalize) {
      global.KB.ImgCtl.normalize(root, 'img');
    }
  }

  /* ---------- 导出 / 导入（S1-C 备份用） ---------- */

  function entries() {
    return rq('readonly', function (st) { return st.getAllKeys(); }).then(function (keys) {
      return rq('readonly', function (st) { return st.getAll(); }).then(function (vals) {
        return (keys || []).map(function (k, i) { return { id: k, blob: vals[i] }; });
      });
    });
    /* 读失败不吞成空数组：调用方要能区分「库里确实没图」与「图床读不出来」 */
  }

  function putMany(items) {
    return tx('readwrite', function (st) {
      (items || []).forEach(function (it) { st.put(it.blob, it.id); });
    }).then(function () { return (items || []).length; }).catch(function () { return 0; });
  }

  /* 启动探测：图床能不能用，一次定论，后面所有降级都看这个。
     加载即探，isUsable() 从此有准话，插图/序列化的降级不靠猜 */
  var usable = null;
  function ready() {
    if (usable !== null) return Promise.resolve(usable);
    return open().then(function () { usable = true; return true; })
      .catch(function () { usable = false; return false; });
  }

  function isUsable() { return usable !== false; }

  ready();

  KB.Blobs = {
    NAME: NAME,
    ready: ready,
    isUsable: isUsable,
    put: put,
    get: get,
    del: del,
    drop: drop,
    urlOf: urlOf,
    replaceUrl: replaceUrl,
    newId: newId,
    setScope: setScope,
    scopePrefix: scopePrefix,
    refsIn: refsIn,
    refsAll: refsAll,
    dataUrlToBlob: dataUrlToBlob,
    bytesOf: bytesOf,
    serializeHtml: serializeHtml,
    syncNoteRefs: syncNoteRefs,
    hydrate: hydrate,
    entries: entries,
    putMany: putMany
  };
})(window);
