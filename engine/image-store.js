/* 图片存储接线层：把富文本里的图片统一收进 IndexedDB 图床。
   - 只做「图片字节与正文引用」的互转，不认任何页面类名、不碰编辑器 DOM 结构，
     普通子页笔记、我的卡片答案、后续生成器页面都能挂同一套。
   - 正文里存 idb:<图片 id>，渲染时换发 blob: 出入证；DOM 里的 blob: 落盘前收回 idb:。
   - 历史 base64 图在落盘时惰性升级，判据只认 src 以 data:image/ 开头，幂等。
   - 图床不可用时所有入口安静降级成 base64 内联，功能不受阻。 */
(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  function B() { return KB.Blobs; }
  function usable() { return !!(B() && B().isUsable()); }

  function setScope(cfg) {
    if (B() && B().setScope) B().setScope(cfg || {});
  }

  /* 一张 base64 图入库，返回 { id, url }；reuseId 用于压缩后原地更新，避免产生孤儿 */
  function store(dataUrl, reuseId) {
    if (!usable() || !dataUrl || String(dataUrl).indexOf('data:image/') !== 0) {
      return Promise.resolve(null);
    }
    var blob = B().dataUrlToBlob(dataUrl);
    if (!blob) return Promise.resolve(null);
    var id = reuseId || B().newId();
    return B().put(id, blob).then(function (done) {
      if (!done) return null;
      return B().urlOf(id).then(function (u) {
        return u ? { id: id, url: u } : null;
      });
    }).catch(function () { return null; });
  }

  /* 把 DOM 里的一张图收进图床，换成出入证并记下证号 */
  function capture(img) {
    if (!img || !usable()) return Promise.resolve(null);
    var src = img.getAttribute('src') || '';
    if (src.indexOf('data:image/') !== 0) return Promise.resolve(null);
    return store(src, img.getAttribute('data-blob-id') || '').then(function (r) {
      if (!r) return null;
      img.src = r.url;
      img.setAttribute('data-blob-id', r.id);
      return r;
    });
  }

  /* 落盘前：DOM 里的出入证收回引用 */
  function serialize(html) {
    if (!usable()) return String(html || '');
    return B().serializeHtml(html);
  }

  /* 渲染后：引用换发出入证。selector 由页面给，默认扫容器内全部图片 */
  function hydrate(root, selector) {
    if (!usable() || !root) return;
    B().hydrate(root, selector || 'img');
  }

  /* 历史 base64 与新增插图统一在落盘时入库，返回可持久化的正文 */
  function migrateHtml(html) {
    var s = String(html || '');
    if (!usable() || s.indexOf('data:image/') === -1) return Promise.resolve(s);
    var box = document.createElement('div');
    box.innerHTML = s;
    var imgs = Array.prototype.slice.call(box.querySelectorAll('img'));
    return Promise.all(imgs.map(function (img) {
      var src = img.getAttribute('src') || '';
      if (src.indexOf('data:image/') !== 0) return Promise.resolve(false);
      return store(src, img.getAttribute('data-blob-id') || '').then(function (r) {
        if (!r) return false;
        img.setAttribute('src', 'idb:' + r.id);
        img.setAttribute('data-blob-id', r.id);
        return true;
      });
    })).then(function (rs) {
      return rs.some(Boolean) ? box.innerHTML : s;
    }).catch(function () { return s; });
  }

  /* 粘贴进来的网页图文：把正文里残留的 base64 图收进图床，DOM 里换成出入证。
     插入之后再异步做，视觉不变；图床不可用时安静跳过，正文继续用 base64。 */
  function adoptInline(root) {
    if (!usable() || !root) return Promise.resolve({ ok: 0, total: 0 });
    var imgs = Array.prototype.slice.call(root.querySelectorAll('img[src^="data:image/"]'));
    if (!imgs.length) return Promise.resolve({ ok: 0, total: 0 });
    return Promise.all(imgs.map(function (img) {
      return capture(img).then(function (r) { return r ? 1 : 0; }, function () { return 0; });
    })).then(function (rs) {
      var ok = rs.reduce(function (a, b) { return a + b; }, 0);
      /* 收录失败不能静默：图还在正文里，但字节留在了内联，备份与配额都受影响 */
      return { ok: ok, total: imgs.length };
    });
  }

  /* 一次保存的两步：先收回出入证，再把残留 base64 入库 */
  function commit(html) {
    return migrateHtml(serialize(html));
  }

  /* 批量升级卡片/笔记正文，字段由调用方指定 */
  function migrateList(list, key) {
    var k = key || 'answerHtml';
    return Promise.all((list || []).map(function (item) {
      if (!item || typeof item[k] !== 'string') return Promise.resolve(item);
      return migrateHtml(item[k]).then(function (h) { item[k] = h; return item; });
    }));
  }

  /* 保存/删除后对账：只在全站都没有引用时回收图片字节 */
  function reconcile(oldHtml, newHtml) {
    if (!usable()) return;
    try { B().syncNoteRefs(oldHtml, newHtml); } catch (e) {}
  }

  function bytesOf(img) { return usable() ? B().bytesOf(img) : 0; }

  /* 把 idb: 引用换成可直接给 <img> 的地址，看大图时用 */
  function urlFor(src) {
    var s = String(src || '');
    if (s.indexOf('idb:') !== 0 || !usable()) return Promise.resolve(s);
    return B().urlOf(s.slice(4)).then(function (u) { return u || s; })
      .catch(function () { return s; });
  }

  function blobToB64(blob) {
    return new Promise(function (res) {
      try {
        var fr = new FileReader();
        fr.onload = function () {
          var u = String(fr.result || ''), i = u.indexOf(',');
          res(i >= 0 ? u.slice(i + 1) : '');
        };
        fr.onerror = function () { res(''); };
        fr.readAsDataURL(blob);
      } catch (e) { res(''); }
    });
  }

  /* 导出：只带走这批正文引用到的图；形状与整站备份一致 { id, type, data } */
  function exportRefs(htmlList) {
    if (!usable()) return Promise.resolve([]);
    var refs = {};
    (htmlList || []).forEach(function (h) { B().refsIn(h, refs); });
    if (!Object.keys(refs).length) return Promise.resolve([]);
    return B().entries().then(function (items) {
      return Promise.all((items || []).filter(function (it) { return refs[it.id]; })
        .map(function (it) {
          return blobToB64(it.blob).then(function (b64) {
            return b64 ? { id: it.id, type: (it.blob && it.blob.type) || 'image/png', data: b64 } : null;
          });
        }));
    }).then(function (arr) { return arr.filter(Boolean); });
    /* 读取或转码失败不再吞成空数组：让导出明确失败，不产出静默缺图的备份 */
  }

  /* 导入：备份里的图先回库，正文引用才能注水。兼容早期带 dataUrl 的备份 */
  function importBlobs(items) {
    if (!usable() || !items || !items.length) return Promise.resolve(0);
    var arr = [];
    (items || []).forEach(function (it) {
      if (!it || !it.id) return;
      var u = it.dataUrl || (it.data
        ? 'data:' + (it.type || 'image/png') + ';base64,' + it.data : '');
      var b = u ? B().dataUrlToBlob(u) : null;
      if (b) arr.push({ id: it.id, blob: b });
    });
    return arr.length ? B().putMany(arr) : Promise.resolve(0);
  }

  KB.ImageStore = {
    setScope: setScope,
    isUsable: usable,
    store: store,
    capture: capture,
    serialize: serialize,
    hydrate: hydrate,
    migrateHtml: migrateHtml,
    migrateList: migrateList,
    adoptInline: adoptInline,
    commit: commit,
    reconcile: reconcile,
    bytesOf: bytesOf,
    urlFor: urlFor,
    exportRefs: exportRefs,
    importBlobs: importBlobs
  };
})(window);
