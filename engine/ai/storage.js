/* AI 答疑助手：配置、历史、面板尺寸的读写。
   配置与面板尺寸留在 localStorage（几十字节，同步读最省事，含 api key）。
   对话历史 26/11/10 起改存 IndexedDB 内容层，键 kb:{项目}:ai:history；
   抽屉里那份兼容裸键只在升级时读一次，搬进库以后就删掉。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  function create(opt) {
    var cfg = opt.cfg;
    var util = opt.util;
    var S = opt.S;
    var st = cfg.storage || {};
    var proj = (global.PROJECT_CONFIG || {});
    var prefix = st.framePrefix || proj.storagePrefix || 'kb';
    var pid = st.projectId || proj.projectId || 'demo';

    function frameKey(kind) {
      return [prefix, pid, 'ai', kind].join(':');
    }
    function legacyKey(kind) {
      return st['legacy' + kind.charAt(0).toUpperCase() + kind.slice(1)] || '';
    }
    function readRaw(k) {
      try { return global.localStorage.getItem(k); } catch (e) { return null; }
    }
    function readJson(k, dft) {
      try {
        var raw = readRaw(k);
        return raw ? (JSON.parse(raw) || dft) : dft;
      } catch (e) { return dft; }
    }
    function writeRaw(k, v) {
      try { global.localStorage.setItem(k, v); return true; } catch (e) { return false; }
    }

    function loadCfg() {
      var d = Object.assign({}, cfg.defaults, { system: cfg.systemDefault });
      var got = readJson(frameKey(st.cfg || 'cfg'), null) ||
                readJson(legacyKey('cfg'), null);
      if (!got || typeof got !== 'object') return d;
      return Object.assign(d, got);
    }

    function saveCfg(c) {
      return writeRaw(frameKey(st.cfg || 'cfg'), JSON.stringify(c));
    }

    /* 提示词版本不符时强制套用当前默认文案，已有配置其余字段不动。 */
    function autoUpgradeSystem(c) {
      try {
        var k = frameKey(st.systemVersion || 'sysver');
        var legacy = legacyKey('sysVer');
        var saved = readRaw(k) || (legacy ? readRaw(legacy) : null);
        if (saved !== cfg.systemVersion) {
          c.system = cfg.systemDefault;
          saveCfg(c);
          writeRaw(k, cfg.systemVersion);
          if (legacy) writeRaw(legacy, cfg.systemVersion);
        }
      } catch (e) {}
      return c;
    }

    /* 历史属内容类，跟笔记、卡片一样进 IndexedDB：容量由库承担，
       不受抽屉 5MB 约束，写入无字符预算、无逐级降级。页面装配前已等过
       KB.Store.ready()，镜像已灌满，这里仍是同步读，调用方一行都不用改。 */
    function loadHistory() {
      var fk = frameKey(st.history || 'history');
      var idb = !!(KB.Store && KB.Store.idbActive && KB.Store.idbActive());

      /* 库不可用：只读抽屉，一个键都不动——那可能是唯一一份 */
      if (!idb) {
        var h0 = readJson(fk, null);
        if (!Array.isArray(h0)) {
          var lk0 = legacyKey('history');
          h0 = lk0 ? readJson(lk0, []) : [];
        }
        return Array.isArray(h0) ? h0 : [];
      }

      /* 抽屉里还留着框架键，说明迁移没跑成（库不可用导致）。
         这里补搬一次，搬成功才清副本 */
      var pending = readJson(fk, null);
      if (Array.isArray(pending)) {
        if (!pending.length) { dropLegacyCopies(); return pending; }
        if (KB.Store.set('ai', 'history', pending)) dropLegacyCopies();
        return pending;
      }

      var inStore = KB.Store.get('ai', 'history', null);
      if (Array.isArray(inStore)) { dropLegacyCopies(); return inStore; }

      /* 只剩更早的兼容裸键：搬一次，搬成就删掉 */
      var lk = legacyKey('history');
      var v = lk ? readJson(lk, null) : null;
      if (!Array.isArray(v)) return [];
      if (v.length && KB.Store.set('ai', 'history', v)) dropLegacyCopies();
      return v;
    }

    /* 库里已是主源，抽屉里的副本不清掉既白占空间，
       也会让还按旧键读的代码读到过期内容 */
    function dropLegacyCopies() {
      var lk = legacyKey('history');
      if (lk) { try { global.localStorage.removeItem(lk); } catch (e) {} }
      var fk = frameKey(st.history || 'history');
      try {
        if (global.localStorage.getItem(fk) != null) global.localStorage.removeItem(fk);
      } catch (e) {}
    }

    /* 进库以后没有字符预算，也没有四级降级：历史保持完整、不被裁短。
       写不进去只剩一种可能——本机存储真的满了，由存储层明确报出来。 */
    function saveHistory(history) {
      if (S.isSharedView) return false;
      var list = Array.isArray(history) ? history : [];
      if (KB.Store) {
        return KB.Store.set('ai', 'history', list, {
          quotaMsg: '⚠️ 对话历史没能保存，本机存储空间可能满了，建议先导出备份'
        });
      }
      try {
        global.localStorage.setItem(frameKey(st.history || 'history'), JSON.stringify(list));
        return true;
      } catch (e) {
        util.toast('⚠️ 对话历史无法保存（存储空间不足）');
        return false;
      }
    }

    function applySavedSize(panel) {
      if (util.isMobile(cfg)) return;
      var s = readJson(frameKey(st.size || 'size'), null) ||
              (legacyKey('size') ? readJson(legacyKey('size'), null) : null);
      if (s && s.w && s.h) {
        panel.style.setProperty('--ai-panel-w', Math.min(s.w, global.innerWidth - 20) + 'px');
        panel.style.setProperty('--ai-panel-h', Math.min(s.h, global.innerHeight - 20) + 'px');
      }
    }

    function saveSize(panel) {
      if (util.isMobile(cfg)) return;
      var w = Math.round(panel.offsetWidth || panel.getBoundingClientRect().width);
      var h = Math.round(panel.offsetHeight || panel.getBoundingClientRect().height);
      var payload = JSON.stringify({ w: w, h: h });
      writeRaw(frameKey(st.size || 'size'), payload);
      if (legacyKey('size')) writeRaw(legacyKey('size'), payload);
    }

    return {
      frameKey: frameKey,
      legacyKey: legacyKey,
      loadCfg: loadCfg,
      saveCfg: saveCfg,
      autoUpgradeSystem: autoUpgradeSystem,
      loadHistory: loadHistory,
      saveHistory: saveHistory,
      applySavedSize: applySavedSize,
      saveSize: saveSize
    };
  }

  KB.AIStorage = { create: create };
})(window);
