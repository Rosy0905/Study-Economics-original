/* 存储：内容与状态分两层，对外仍是同一套同步方法。

   内容类（笔记正文、单卡编辑、收藏、我的卡片题目答案、章节、配置）进 IndexedDB，
   跟图片同一个库 —— 一条笔记的文字和它的图在同一个库里，删笔记连图一起走，
   备份、清除、换站迁移都只扫一处。启动时一次性读进内存镜像，之后 get 仍是同步的，
   页面首帧不用等异步。

   状态类（筛选记忆、自测开关、滚动位置这类）留 localStorage：丢了重选一次就好，
   数据只有几十字节，留在同步层最省事。

   键格式 {prefix}:{projectId}:{moduleId}:{kind}，项目 id 必须在键里，
   否则两个站部署在同一域名下会互相覆盖。

   两条写路径上的保险：

   影子写（26/11/10）内容类写入时先同步落一份影子到抽屉，落库成功再收回。
   落库是异步的，页面在那几百毫秒里被关掉、崩掉，这一笔就没了；影子是同步写，
   写完立刻生效。抽屉只留最近三篇，按每键自己的落库时刻判新旧，不看数量。
   启动时影子比该键的落库时刻新就补回，然后删掉。

   清空代号（26/11/10）整站清除时把代号加一，代号也是一把钥匙：
   别的标签页还拿着旧代号，落盘前对不上就丢弃这次写入，并提示刷新。
   判据是只在清除时递增的计数器，不是每写一次都刷新的时间戳。

   IndexedDB 不可用（隐私模式、被禁）时整体退回 localStorage，行为与改造前一致。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  var DB_NAME = 'kb-data-v1';
  var STORE = 'kv';
  var MARK = 'migrated-v1';

  /* 内部键：不进备份、不参与旧键搬家、不算数据 */
  var EPOCH = 'epoch';    /* 清空代号，只在整站清除时加一 */
  var SHADOW = 'sh';      /* 写入影子 {k,t,v} */
  var COMMIT = 'cm';      /* 每键最后一次落库成功的毫秒时刻 */
  var RING = 'shring';    /* 影子键名环，最新在前 */
  var SHADOW_MAX = 3;
  var SHADOW_MAX_BYTES = 512 * 1024;   /* 单条超过它就别往抽屉塞，塞了也是白占 */

  /* 走 IndexedDB 的 kind：其余一律留在 localStorage */
  var CONTENT = {
    notes: 1,     /* 笔记正文 */
    edits: 1,     /* 单卡就地编辑后的题目/答案 */
    favs: 1,      /* 收藏的卡片 id */
    items: 1,     /* 我的卡片：题目与答案 */
    chapters: 1,  /* 我的卡片：章节与顺序 */
    cfg: 1,       /* 配置类，AI 的 api key 在这里 */
    history: 1    /* AI 对话历史（26/11/10 起从抽屉搬进来） */
  };

  var setup = { prefix: 'kb', projectId: 'demo' };

  var mem = {};          /* 内容类镜像：完整键 → 已解析的值 */
  var db = null;
  var readyPromise = null;
  var done = false;
  var pendingWrites = 0;     /* 已发起、尚未落定的 IndexedDB 写入数 */
  var pendingRefresh = null; /* 落定前到达的重灌请求，攒到计数归零再执行 */

  function bootCfg() {
    var P = global.PROJECT_CONFIG || {};
    return {
      prefix: P.storagePrefix || 'kb',
      projectId: P.projectId || 'demo'
    };
  }

  function key(moduleId, kind) {
    return [setup.prefix, setup.projectId, moduleId, kind].join(':');
  }

  function isContent(kind) {
    return !!CONTENT[kind];
  }

  function head() { return setup.prefix + ':' + setup.projectId + ':'; }

  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { global.localStorage.removeItem(k); } catch (e) {} }

  /* 影子、落库时刻、代号、迁移标记都是内部状态，不能混进数据 */
  function internalKey(k) {
    if (!k || k.indexOf(head()) !== 0) return false;
    var tail = k.slice(head().length);
    if (tail === MARK || tail === EPOCH || tail === RING) return true;
    return tail.indexOf(SHADOW + ':') === 0 || tail.indexOf(COMMIT + ':') === 0;
  }

  /* ---------- 清空代号 ---------- */

  var epochAtBoot = 0;
  var stale = false;        /* 本页拿的代号已过期：另一个标签页清过数据 */
  var staleWarned = false;

  function epochKey() { return head() + EPOCH; }
  function readEpoch() { return parseInt(lsGet(epochKey()), 10) || 0; }

  function warnStale() {
    if (staleWarned) return;
    staleWarned = true;
    try {
      if (KB.UI && KB.UI.toast) {
        KB.UI.toast('⚠️ 另一个标签页已清空数据，本页内容已过期，请刷新后再编辑');
      }
    } catch (e) {}
  }

  /* 整站清除后调一次。代号加一以后，还拿着旧代号的标签页写入一律丢弃 */
  function bumpEpoch() {
    var n = readEpoch() + 1;
    lsSet(epochKey(), String(n));
    epochAtBoot = n;
    stale = false;
    staleWarned = false;
    clearShadows();
    return n;
  }

  function isStale() { return stale; }

  /* ---------- 写入影子 ---------- */

  function shadowKey(k) { return head() + SHADOW + ':' + k.slice(head().length); }
  function commitKey(k) { return head() + COMMIT + ':' + k.slice(head().length); }

  function readRing() {
    try {
      var a = JSON.parse(lsGet(head() + RING) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function writeRing(list) { lsSet(head() + RING, JSON.stringify(list.slice(0, SHADOW_MAX))); }

  function clearShadows() {
    readRing().forEach(function (sk) { lsDel(sk); });
    /* 环里没有的（过期残留、环本身写失败）一并扫掉 */
    try {
      var ls = global.localStorage;
      var dead = [];
      for (var i = 0; i < ls.length; i++) {
        var k = ls.key(i);
        if (k && internalKey(k) &&
            (k.indexOf(head() + SHADOW + ':') === 0 || k.indexOf(head() + COMMIT + ':') === 0)) {
          dead.push(k);
        }
      }
      dead.forEach(function (k) { ls.removeItem(k); });
    } catch (e) {}
    lsDel(head() + RING);
  }

  function writeShadow(k, value, t) {
    if (!db) return;
    var raw;
    try { raw = JSON.stringify({ k: k, t: t, v: value }); } catch (e) { return; }
    if (!raw || raw.length > SHADOW_MAX_BYTES) return;
    var sk = shadowKey(k);
    if (!lsSet(sk, raw)) return;     /* 抽屉满也不阻断正常保存 */
    var ring = readRing().filter(function (x) { return x !== sk; });
    ring.unshift(sk);
    while (ring.length > SHADOW_MAX) lsDel(ring.pop());
    writeRing(ring);
  }

  function markCommit(k, t) { lsSet(commitKey(k), String(t)); }

  /* 落库成功后收回自己那份；更晚的写入留着，别误删 */
  function dropShadow(k, t) {
    var sk = shadowKey(k);
    var rec = null;
    try { rec = JSON.parse(lsGet(sk) || 'null'); } catch (e) {}
    if (!rec || (rec.t || 0) <= t) {
      lsDel(sk);
      writeRing(readRing().filter(function (x) { return x !== sk; }));
    }
  }

  /* 启动补回：影子比该键最后一次落库时刻新，说明上次没提交完，补进库。
     判据是每键自己的时刻，不看条数、不看全局时间戳。 */
  function recoverShadows() {
    if (!db) { clearShadows(); return 0; }
    var ring = readRing();
    var n = 0;
    ring.forEach(function (sk) {
      var rec = null;
      try { rec = JSON.parse(lsGet(sk) || 'null'); } catch (e) {}
      if (!rec || typeof rec.k !== 'string' || rec.k.indexOf(head()) !== 0) { lsDel(sk); return; }
      var k = rec.k;
      var cm = parseInt(lsGet(commitKey(k)), 10) || 0;
      if ((rec.t || 0) > cm) {
        mem[k] = rec.v;
        idbPut(k, rec.v);
        markCommit(k, rec.t || Date.now());
        n++;
      }
      lsDel(sk);
    });
    lsDel(head() + RING);
    return n;
  }

  function configure(opts) {
    var next = {
      prefix: (opts && opts.prefix) || 'kb',
      projectId: (opts && opts.projectId) || 'demo'
    };
    var changed = next.prefix !== setup.prefix || next.projectId !== setup.projectId;
    setup = next;
    if (changed) {
      mem = {};
      done = false;
      readyPromise = null;
      ready();
    }
  }

  function openDb() {
    return new Promise(function (res) {
      var r;
      try { r = global.indexedDB.open(DB_NAME, 1); } catch (e) { res(null); return; }
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      r.onsuccess = function () {
        db = r.result;
        /* 别的标签页升级库时本连接自动失效，清掉重开 */
        db.onversionchange = function () {
          try { db.close(); } catch (e) {}
          db = null;
          done = false;
        };
        res(db);
      };
      r.onerror = function () { res(null); };
      r.onblocked = function () { res(null); };
    });
  }

  function idbGetAll() {
    if (!db) return Promise.resolve({});
    return new Promise(function (res) {
      var out = {};
      var t;
      try { t = db.transaction(STORE, 'readonly'); } catch (e) { res(out); return; }
      var req = t.objectStore(STORE).openCursor();
      req.onsuccess = function () {
        var cur = req.result;
        if (cur) { out[cur.key] = cur.value; cur.continue(); }
        else res(out);
      };
      req.onerror = function () { res(out); };
      t.onabort = function () { res(out); };
    });
  }

  function idbPut(k, value) {
    if (!db) return Promise.resolve(false);
    return new Promise(function (res) {
      var t;
      try { t = db.transaction(STORE, 'readwrite'); } catch (e) { res(false); return; }
      try { t.objectStore(STORE).put(value, k); } catch (e) { res(false); return; }
      t.oncomplete = function () { res(true); };
      t.onerror = function () { res(false); };
      t.onabort = function () { res(false); };
    });
  }

  function idbDel(k) {
    if (!db) return Promise.resolve(false);
    return new Promise(function (res) {
      var t;
      try { t = db.transaction(STORE, 'readwrite'); } catch (e) { res(false); return; }
      try { t.objectStore(STORE).delete(k); } catch (e) { res(false); return; }
      t.oncomplete = function () { res(true); };
      t.onerror = function () { res(false); };
      t.onabort = function () { res(false); };
    });
  }

  /* 首次接入：把 localStorage 里的内容类键搬进库，搬成功才删旧键。
     任何一步失败都保留旧数据，读的时候自然回落到抽屉。 */
  function migrate() {
    var head = setup.prefix + ':' + setup.projectId + ':';

    /* AI 配置由 ai/storage.js 直写 localStorage，不参与分层。
       库里若有旧值先回写一份，localStorage 已有则不覆盖，
       否则刷新后这份配置读不到。 */
    Object.keys(mem).forEach(function (k) {
      if (!/:ai:cfg$/.test(k)) return;
      try {
        if (global.localStorage.getItem(k) == null) {
          global.localStorage.setItem(k, JSON.stringify(mem[k]));
        }
      } catch (e) {}
    });

    var moved = [];
    try {
      for (var i = 0; i < global.localStorage.length; i++) {
        var k = global.localStorage.key(i);
        if (!k || k.indexOf(head) !== 0) continue;
        if (/:ai:cfg$/.test(k)) continue;
        if (internalKey(k)) continue;
        var kind = k.slice(k.lastIndexOf(':') + 1);
        if (!isContent(kind)) continue;
        moved.push(k);
      }
    } catch (e) { return Promise.resolve(0); }

    var mark = setup.prefix + ':' + setup.projectId + ':' + MARK;
    try {
      if (global.localStorage.getItem(mark) === '1' && !moved.length) return Promise.resolve(0);
    } catch (e) {}

    var jobs = moved.map(function (k) {
      var raw;
      try { raw = global.localStorage.getItem(k); } catch (e) { return Promise.resolve(false); }
      if (raw == null) return Promise.resolve(false);
      var val;
      try { val = JSON.parse(raw); } catch (e) { return Promise.resolve(false); }
      return idbPut(k, val).then(function (ok) {
        if (!ok) return false;
        mem[k] = val;
        try { global.localStorage.removeItem(k); } catch (e) {}
        return true;
      });
    });

    return Promise.all(jobs).then(function (rs) {
      try { global.localStorage.setItem(mark, '1'); } catch (e) {}
      return rs.filter(Boolean).length;
    });
  }

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = openDb()
      .then(function () {
        if (!db) { done = true; return 0; }
        return idbGetAll().then(function (all) {
          Object.keys(all).forEach(function (k) { mem[k] = all[k]; });
          return migrate();
        }).then(function (n) {
          epochAtBoot = readEpoch();
          recoverShadows();
          return n;
        });
      })
      .then(function (n) { done = true; return n; })
      .catch(function () { done = true; return 0; });
    return readyPromise;
  }

  function isReady() { return done; }

  /* 焦点重灌：跨标签页对 IndexedDB 的增删改，本页内存镜像感知不到。
     页面重新可见或消费方主动调用时，等未决写清零后整表重灌。
     只替换镜像内容，不触发任何页面回调。 */
  function drainPending() {
    if (pendingWrites > 0 || !pendingRefresh) return;
    var go = pendingRefresh;
    pendingRefresh = null;
    go();
  }

  function refresh() {
    if (!db || !done) return Promise.resolve();
    return new Promise(function (res) {
      var go = function () {
        idbGetAll().then(function (all) {
          mem = all;
          res();
        }, res);
      };
      if (pendingWrites > 0) { pendingRefresh = go; return; }
      go();
    });
  }

  if (global.document) {
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.visibilityState === 'visible' && done) refresh();
    });
  }

  /* 别的标签页清空数据会改代号，本页据此判自己过期：
     镜像跟着清空，之后任何写入都被 set 里的守卫拦下 */
  if (global.addEventListener) {
    global.addEventListener('storage', function (e) {
      if (!e || e.key !== epochKey()) return;
      var now = readEpoch();
      if (now === epochAtBoot) return;
      epochAtBoot = now;
      stale = true;
      warnStale();
      refresh();
    });
  }

  function get(moduleId, kind, fallback) {
    var k = key(moduleId, kind);
    if (isContent(kind) && Object.prototype.hasOwnProperty.call(mem, k)) return mem[k];
    try {
      var raw = global.localStorage.getItem(k);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  /* 写入前留一份独立快照。镜像与落库都存这份，调用方之后接着改原对象也不影响已存内容；
     只存引用的话，异步事务读到的可能已经是改过的中间态。 */
  function cloneValue(v) {
    try {
      if (global.structuredClone) return global.structuredClone(v);
    } catch (e) {}
    try { return JSON.parse(JSON.stringify(v)); } catch (e2) { return v; }
  }

  /* opts.quotaMsg：单个模块可覆盖配额满时的提示，其它页面不传则沿用全站默认。
     opts.onFail：异步落库两处都失败时回调。同步返回 true 只代表已收下，
     真正落没落盘要等这里；调用方想让提示说真话就传它 */
  function set(moduleId, kind, value, opts) {
    probeQuotaSoon();
    /* 代号对不上：另一个标签页已经清过数据，这一笔写进去就是复活旧内容 */
    if (stale) { warnStale(); return false; }
    if (isContent(kind) && db) {
      var k = key(moduleId, kind);
      var snap = cloneValue(value);
      var t = Date.now();
      writeShadow(k, snap, t);
      mem[k] = snap;
      pendingWrites++;
      idbPut(k, snap).then(function (ok) {
        if (ok) { markCommit(k, t); dropShadow(k, t); return; }
        /* 落库失败退回抽屉；抽屉也写不下时必须说出来，不能让页面照常报「已保存」 */
        try {
          global.localStorage.setItem(k, JSON.stringify(snap));
          markCommit(k, t);
          dropShadow(k, t);
        } catch (e) {
          var full = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
          if (KB.UI && KB.UI.toast) KB.UI.toast(full
            ? ((opts && opts.quotaMsg) || '⚠️ 存储空间不足，这次没能保存！建议先导出备份，再清理不用的笔记与大图。')
            : '⚠️ 保存失败');
          if (opts && opts.onFail) opts.onFail();
        }
      }).catch(function () {
        if (KB.UI && KB.UI.toast) KB.UI.toast('⚠️ 保存失败');
        if (opts && opts.onFail) opts.onFail();
      }).then(function () {
        pendingWrites--;
        drainPending();
      });
      return true;
    }
    try {
      global.localStorage.setItem(key(moduleId, kind), JSON.stringify(value));
      return true;
    } catch (err) {
      var full =
        err &&
        (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014);
      KB.UI && KB.UI.toast && KB.UI.toast(
        full
          ? ((opts && opts.quotaMsg) ||
              '⚠️ 存储空间不足，这次没能保存！建议先导出备份，再清理不用的笔记与大图。')
          : '⚠️ 保存失败'
      );
      return false;
    }
  }

  function remove(moduleId, kind) {
    var k = key(moduleId, kind);
    lsDel(shadowKey(k));
    lsDel(commitKey(k));
    if (isContent(kind)) {
      delete mem[k];
      idbDel(k).catch(function () {});
    }
    try { global.localStorage.removeItem(k); } catch (err) {}
  }

  /* 全项目键值快照，键与值都是字符串，与备份文件里的 data 同构。
     内容类从内存镜像序列化，状态类取 localStorage；同一键两处都有时以镜像为准，
     镜像才是最新写入口。迁移标记属内部状态，不进备份。 */
  function dump() {
    var out = {};
    var head = setup.prefix + ':' + setup.projectId + ':';
    var mark = setup.prefix + ':' + setup.projectId + ':' + MARK;
    try {
      for (var i = 0; i < global.localStorage.length; i++) {
        var k = global.localStorage.key(i);
        if (!k || k.indexOf(head) !== 0 || k === mark || internalKey(k)) continue;
        var raw = global.localStorage.getItem(k);
        if (typeof raw === 'string') out[k] = raw;
      }
    } catch (e) {}
    Object.keys(mem).forEach(function (k) {
      if (k.indexOf(head) !== 0 || k === mark || internalKey(k)) return;
      try { out[k] = JSON.stringify(mem[k]); } catch (e) {}
    });
    return out;
  }

  /* 按键写回。内容类进镜像与库，状态类回 localStorage；
     库不可用时内容类落 localStorage，与读取路径的回落口径一致。
     AI 配置由 ai/storage.js 直写 localStorage，这里保持同一去处。 */
  function restore(data) {
    /* 导入是整块替换：导入前留下的影子都是旧内容，一律作废 */
    clearShadows();
    var jobs = [];
    var total = 0;
    var failed = [];
    var backup = {};

    function markFailed(k) { if (failed.indexOf(k) < 0) failed.push(k); }

    /* 两处都写不下时把镜像退回导入前的样子。导入不该留下「页面显示有、刷新就没了」的中间态 */
    function rollback(k) {
      var b = backup[k];
      if (!b) return;
      if (b.had) mem[k] = b.val;
      else delete mem[k];
    }

    Object.keys(data || {}).forEach(function (k) {
      var raw = data[k];
      if (typeof raw !== 'string') return;
      total++;
      var kind = k.slice(k.lastIndexOf(':') + 1);
      var aiCfg = /:ai:cfg$/.test(k);
      if (isContent(kind) && !aiCfg) {
        var val;
        try { val = JSON.parse(raw); } catch (e) { markFailed(k); return; }
        backup[k] = { had: Object.prototype.hasOwnProperty.call(mem, k), val: mem[k] };
        mem[k] = val;
        if (db) {
          jobs.push(idbPut(k, val).then(function (ok) {
            if (ok) return true;
            try { global.localStorage.setItem(k, raw); return true; }
            catch (e) { rollback(k); markFailed(k); return false; }
          }).catch(function () {
            rollback(k); markFailed(k); return false;
          }));
        } else {
          try { global.localStorage.setItem(k, raw); }
          catch (e) { rollback(k); markFailed(k); }
        }
      } else {
        /* 状态类一直走抽屉。写失败原因直接返回，导入端据此如实报错 */
        try { global.localStorage.setItem(k, raw); }
        catch (e) { markFailed(k); }
      }
    });

    return Promise.all(jobs).then(function () {
      return { total: total, ok: total - failed.length, failed: failed.slice() };
    });
  }

  /* 按前缀删。镜像与库、localStorage、sessionStorage 一起清；
     前缀可以是带项目头的完整前缀，也可以是全站导航键这类裸前缀。 */
  function removeByPrefix(prefixes) {
    clearShadows();
    var list = prefixes || [];
    var removed = [];
    function hit(k) {
      for (var i = 0; i < list.length; i++) if (k.indexOf(list[i]) === 0) return true;
      return false;
    }
    Object.keys(mem).forEach(function (k) {
      if (!hit(k)) return;
      delete mem[k];
      idbDel(k).catch(function () {});
      removed.push(k);
    });
    try {
      for (var i = global.localStorage.length - 1; i >= 0; i--) {
        var lk = global.localStorage.key(i);
        if (lk && hit(lk)) { global.localStorage.removeItem(lk); removed.push(lk); }
      }
    } catch (e) {}
    try {
      for (var j = global.sessionStorage.length - 1; j >= 0; j--) {
        var sk = global.sessionStorage.key(j);
        if (sk && hit(sk)) { global.sessionStorage.removeItem(sk); removed.push(sk); }
      }
    } catch (e) {}
    return removed;
  }

  function list() {
    var head = setup.prefix + ':' + setup.projectId + ':';
    var seen = {};
    var out = [];
    Object.keys(mem).forEach(function (k) {
      if (k.indexOf(head) === 0 && !internalKey(k) && !seen[k]) { seen[k] = 1; out.push(k); }
    });
    try {
      for (var i = 0; i < global.localStorage.length; i++) {
        var k = global.localStorage.key(i);
        if (k && k.indexOf(head) === 0 && !internalKey(k) && !seen[k]) { seen[k] = 1; out.push(k); }
      }
    } catch (err) {}
    return out;
  }

  /* 容量余量探测：写失败之前先给一次可见提醒；不支持该接口的浏览器静默跳过。
     同一会话只提醒一次，写入侧按分钟节流，避免频繁保存时反复估算。 */
  var quotaWarned = false;
  var quotaCheckedAt = 0;
  function warnIfLow(opts) {
    if (quotaWarned) return Promise.resolve(null);
    var nav = global.navigator;
    if (!nav || !nav.storage || !nav.storage.estimate) return Promise.resolve(null);
    var o = opts || {};
    return Promise.resolve().then(function () {
      return nav.storage.estimate();
    }).then(function (e) {
      if (!e || !e.quota || !e.usage) return e || null;
      if (e.usage / e.quota < (o.ratio || 0.8)) return e;
      quotaWarned = true;
      if (KB.UI && KB.UI.toast) {
        KB.UI.toast(o.message || '⚠️ 本机存储空间快满了，建议先导出备份再继续插图');
      }
      return e;
    }).catch(function () { return null; });
  }
  function probeQuotaSoon() {
    if (quotaWarned || Date.now() - quotaCheckedAt < 60000) return;
    quotaCheckedAt = Date.now();
    warnIfLow();
  }

  KB.Store = {
    configure: configure,
    ready: ready,
    refresh: refresh,
    isReady: isReady,
    /* 库真的在用时为真。读历史的代码靠它区分主源与抽屉兜底：
       兜底状态下不能删任何旧键，那可能是唯一一份 */
    idbActive: function () { return !!db; },
    get: get,
    set: set,
    remove: remove,
    list: list,
    dump: dump,
    restore: restore,
    removeByPrefix: removeByPrefix,
    warnIfLow: warnIfLow,
    bumpEpoch: bumpEpoch,
    epoch: readEpoch,
    isStale: isStale,
    isInternalKey: internalKey
  };

  /* 加载即开跑：多数页面 mount 时已经读完，少数慢的由各 mount 自己等 */
  setup = bootCfg();
  ready();
})(window);
