/* 导入导出 · 核心
   进度条右侧蓝色圆钮「同步」，点开上下各弹一球：上 导入 / 下 导出。
   两件事都在这里，UI 只负责接线与给文案。

   备份文件结构（version 2，加图床后升版）：
     {
       app: 'kb-framework',
       version: 2,
       projectId: 'demo',          // 导入时校验，跨项目拒绝
       exportedAt: ISO 字符串,
       count: 42,                  // localStorage 条数
       blobCount: 4,               // 图片张数
       incomplete: false,          // true = 想带图但图床读不到
       note: '包含：…',
       data: { 'kb:demo:home:progress': '…' },
       blobs: [ { id, type, data: base64 } ] | null
     }

   blobs 为 null 有两种意思，靠 incomplete 区分：
     incomplete: false → 导出时主动选了纯文字版
     incomplete: true  → 想带图但读不到，当次备份不含图片
   两种都绝不写空数组冒充「有图」，免得导入端以为图片是空的。

   导入是按键覆盖：备份里有哪个键就覆盖哪个，
   本机有、备份里没有的键不动；键必须落在本项目的 {前缀}:{项目}: 下，
   别项目的键一律跳过。 */
(function (global) {
  'use strict';

  var KB = global.KB = global.KB || {};

  var esc = KB.escape;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fmtBytes(n) {
    if (!n) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  /* 键值对的 JSON 体积（中文按 UTF-8 三字节估） */
  function roughBytes(str) {
    var n = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    }
    return n;
  }

  function b64ToBlob(b64, type) {
    try {
      var bin = global.atob(String(b64 || ''));
      var u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new global.Blob([u8], { type: type || 'application/octet-stream' });
    } catch (e) { return null; }
  }

  function blobToB64(blob) {
    return new Promise(function (res) {
      try {
        var fr = new global.FileReader();
        fr.onload = function () {
          var s = String(fr.result || '');
          var i = s.indexOf(',');
          res(i < 0 ? null : s.slice(i + 1));
        };
        fr.onerror = function () { res(null); };
        fr.readAsDataURL(blob);
      } catch (e) { res(null); }
    });
  }

  KB.Sync = {
    mount: function (opt) {
      var section = opt.section;
      var btn = opt.btn;
      var orbImport = opt.orbImport;
      var orbExport = opt.orbExport;
      var fileInput = opt.fileInput;
      if (!section || !btn) return null;

      var base = (opt.storagePrefix || 'kb') + ':' + (opt.projectId || 'default') + ':';
      var mods = opt.modules || [];
      var toast = opt.toast || function () {};

      var isOpen = false;
      var imgEntries = null;   /* 导出弹层打开时读到的图片 */
      var imgState = 'idle';   /* idle / loading / ok / off */
      var exportData = null;   /* 开弹层时扫一次本机数据，弹层开着期间复用 */

      /* ---------------- 同步钮开关 ---------------- */

      function openSync() {
        /* 通知外部：同步球展开。靠它跟花瓣互斥，本模块不认识清除模块 */
        if (opt.onOpen) opt.onOpen();
        isOpen = true;
        section.classList.add('open');
        btn.classList.add('open');
      }

      function closeSync() {
        isOpen = false;
        section.classList.remove('open');
        btn.classList.remove('open');
      }

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (isOpen) closeSync(); else openSync();
      });

      document.addEventListener('click', function (e) {
        if (!isOpen) return;
        if (section.contains(e.target)) return;
        closeSync();
      });

      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (opt.exportOverlay && opt.exportOverlay.classList.contains('show')) {
          opt.exportOverlay.classList.remove('show');
          return;
        }
        /* 导入确认是通用弹层，自己处理 Escape */
        if (isOpen) closeSync();
      });

      /* ---------------- 收集本机数据 ---------------- */

      function collectLocal() {
        /* 内容类正文在库里，必须从存储层拿快照；只扫 localStorage 会漏掉
           笔记、单卡编辑、收藏、我的卡片与章节 */
        if (KB.Store && KB.Store.dump) {
          try { return KB.Store.dump() || {}; } catch (e) {}
        }
        var data = {};
        var list = KB.Store ? KB.Store.list() : [];
        list.forEach(function (k) {
          try {
            var v = global.localStorage.getItem(k);
            if (v != null) data[k] = v;
          } catch (e) { /* 单条读不到就跳过，不拿空串充数 */ }
        });
        return data;
      }

      /* 正文里引用到的图 id 集合。图床是全站共用的一个库，
         但备份只该带本项目笔记真正引用到的图 —— 引用是唯一的归属依据，
         不另存元数据，跟笔记文字用同一套键、同一个生命周期。 */
      function refIdsOf(data) {
        var out = {};
        if (!KB.Blobs || !KB.Blobs.refsIn) return out;
        Object.keys(data).forEach(function (k) { KB.Blobs.refsIn(data[k], out); });
        return out;
      }

      /* ---------------- 导出 ---------------- */

      var expOverlay = opt.exportOverlay;
      var expImages = opt.exportImages;
      var expSize = opt.exportSize;
      var expOk = opt.exportOk;
      var expCancel = opt.exportCancel;
      var optImages = opt.optImages;
      var expConfig = opt.exportConfig;
      var expHistory = opt.exportHistory;
      var optConfig = opt.optConfig;
      var optHistory = opt.optHistory;

      /* ---- 导出分项 ----
         AI 配置与对话历史不在「学习数据」里，各自可单独排除：
         历史体积能占到备份的大半，想留个轻量备份就得能去掉它。
         框架键按尾段判，兼容键按全名判，两套都要认。 */
      var AI_HIST_TAILS = [':ai:history'];
      var AI_HIST_NAMES = ['ai_assistant_history_v1'];
      var AI_CFG_TAILS = [':ai:cfg', ':ai:size', ':ai:sysver'];
      var AI_CFG_NAMES = [
        'ai_assistant_cfg_v1', 'ai_assistant_size_v1',
        'ai_assistant_sys_ver', 'ai_cards_last_cfg'
      ];

      function endsWith(s, tail) { return s.length >= tail.length && s.slice(-tail.length) === tail; }

      function bucketOf(k) {
        var i;
        for (i = 0; i < AI_HIST_TAILS.length; i++) if (endsWith(k, AI_HIST_TAILS[i])) return 'aiHistory';
        for (i = 0; i < AI_CFG_TAILS.length; i++) if (endsWith(k, AI_CFG_TAILS[i])) return 'aiConfig';
        if (AI_HIST_NAMES.indexOf(k) >= 0) return 'aiHistory';
        if (AI_CFG_NAMES.indexOf(k) >= 0) return 'aiConfig';
        return 'study';
      }

      /* 导出前剔除两类「看似有数据、其实没动过」的空壳：
         - 我的卡片：没有任何卡片内容时，筛选/排序/章节三个壳子无意义，剔除；
         - AI 配置：未真正接入（base/model/key 全空）时整桶视为未配置，
           让「AI 配置」分类在没接好 API 时不显示为有数据。 */
      function pruneShells(data) {
        var out = {};
        Object.keys(data).forEach(function (k) { out[k] = data[k]; });

        /* 1) 我的卡片：无真正卡片内容 → 剔除筛选/排序/章节空壳 */
        var hasCards = false;
        Object.keys(out).some(function (k) {
          if (/:cards:items$/.test(k)) {
            try { var a = JSON.parse(out[k]); if (Array.isArray(a) && a.length) hasCards = true; } catch (e) {}
            return true;
          }
          return false;
        });
        if (!hasCards) {
          Object.keys(out).forEach(function (k) {
            if (/:cards:(filters|order|chapters)$/.test(k)) delete out[k];
          });
        }

        /* 2) AI 配置：未接入（base/model/key 全空）→ 整桶剔除 */
        var cfgKey = null;
        Object.keys(out).some(function (k) {
          if (/:ai:cfg$/.test(k) || AI_CFG_NAMES.indexOf(k) >= 0) { cfgKey = k; return true; }
          return false;
        });
        if (cfgKey) {
          var configured = false;
          try {
            var o = JSON.parse(out[cfgKey]) || {};
            if ((o.base && String(o.base).trim()) ||
                (o.model && String(o.model).trim()) ||
                (o.key && String(o.key).trim())) configured = true;
          } catch (e) {}
          if (!configured) {
            Object.keys(out).forEach(function (k) {
              if (bucketOf(k) === 'aiConfig') delete out[k];
            });
          }
        }

        /* 3) AI 对话历史：内容为空数组 → 剔除，导出面板不再把它当「有历史可选」 */
        Object.keys(out).forEach(function (k) {
          if (bucketOf(k) !== 'aiHistory') return;
          try {
            var a = JSON.parse(out[k]);
            if (Array.isArray(a) && !a.length) delete out[k];
          } catch (e) {}
        });
        return out;
      }

      function bucketCounts(data) {
        var n = { study: 0, aiConfig: 0, aiHistory: 0 };
        Object.keys(data || {}).forEach(function (k) { n[bucketOf(k)]++; });
        return n;
      }

      /* 按勾选筛出这次真写进文件的那部分 */
      function pickData(data) {
        var useCfg = !expConfig || expConfig.checked;
        var useHis = !expHistory || expHistory.checked;
        var out = {};
        Object.keys(data || {}).forEach(function (k) {
          var b = bucketOf(k);
          if (b === 'aiConfig' && !useCfg) return;
          if (b === 'aiHistory' && !useHis) return;
          out[k] = data[k];
        });
        return out;
      }

      /* 本机没有某类数据时整条禁用并取消勾选，免得勾了个空 */
      function setOptEnabled(label, cb, n) {
        if (!cb) return;
        var none = !n;
        cb.disabled = none;
        cb.checked = !none;
        if (label) label.classList.toggle('disabled', none);
      }

      function syncAiOptions() {
        var n = bucketCounts(exportData || pruneShells(collectLocal()));
        setOptEnabled(optConfig, expConfig, n.aiConfig);
        setOptEnabled(optHistory, expHistory, n.aiHistory);
      }

      function showExport() {
        closeSync();
        var data = pruneShells(collectLocal());
        exportData = data;
        if (!Object.keys(data).length) {
          toast('本机暂无记录，先学一点再导出吧~~');
          return;
        }
        if (!expOverlay) return;

        /* 先开弹层让操作不等图，图片体积异步补上 */
        imgEntries = null;
        imgState = 'loading';
        syncImageOption();   /* 先恢复可点，读完图再按实际张数定 */
        syncAiOptions();     /* AI 两类按本机有无数据定可不可选 */
        expOverlay.classList.add('show');
        refreshSize();
        loadImages();
      }

      function loadImages() {
        if (!KB.Blobs || !KB.Blobs.ready) { imgState = 'off'; syncImageOption(); refreshSize(); return; }
        KB.Blobs.ready().then(function (usable) {
          if (!usable) { imgState = 'off'; syncImageOption(); refreshSize(); return; }
          return KB.Blobs.entries().then(function (list) {
            /* 只留本项目笔记引用到的图：别的项目、以及没人引用的孤儿图都不进备份 */
            var refs = refIdsOf(exportData || collectLocal());
            imgEntries = (list || []).filter(function (it) { return refs[it.id]; });
            imgState = 'ok';
            syncImageOption();
            refreshSize();
          });
        }).catch(function () {
          imgState = 'off';
          syncImageOption();
          refreshSize();
        });
      }

      /* 图床不可用、或库里一张图都没有时，整条禁用并取消勾选 */
      function syncImageOption() {
        var n = (imgEntries || []).length;
        var none = imgState === 'off' || (imgState === 'ok' && n === 0);
        if (!optImages) return;
        optImages.classList.toggle('disabled', none);
        var cb = optImages.querySelector('input');
        if (cb) {
          cb.disabled = none;
          /* 每次开弹层按可用性重置勾选 */
          cb.checked = !none;
        }
      }

      function refreshSize() {
        if (!expSize) return;
        var data = exportData || collectLocal();
        var counts = bucketCounts(data);
        var picked = pickData(data);
        var bytes = 0;
        var hisBytes = 0;
        var hisImgs = 0;
        Object.keys(picked).forEach(function (k) {
          var one = roughBytes(k) + roughBytes(picked[k]);
          bytes += one;
          if (bucketOf(k) !== 'aiHistory') return;
          hisBytes += one;
          /* 对话历史里的图是内联 base64，不走图床，也不进「图片 N 张」的统计。
             这里单独数一次，导出前能看清它到底占了多少 */
          try {
            var arr = JSON.parse(picked[k]);
            if (Array.isArray(arr)) {
              arr.forEach(function (m) {
                if (!m || !m.attachments || !m.attachments.length) return;
                m.attachments.forEach(function (a) { if (a && a.dataUrl) hisImgs++; });
              });
            }
          } catch (e) {}
        });

        var want = !expImages || expImages.checked;
        var parts = ['学习数据 ' + counts.study + ' 条'];
        /* 被排除的那类写「已排除」，比直接消失更清楚，不然会以为统计漏了 */
        if (counts.aiConfig) {
          parts.push(expConfig && !expConfig.checked ? 'AI 配置已排除' : 'AI 配置 ' + counts.aiConfig + ' 条');
        }
        if (counts.aiHistory) {
          parts.push(expHistory && !expHistory.checked
            ? '对话历史已排除'
            : '对话历史 ' + counts.aiHistory + ' 条，约 ' + fmtBytes(hisBytes) + (hisImgs ? '，内含图片 ' + hisImgs + ' 张' : ''));
        }

        /* 先判图床状态再判勾选：图床不可用时勾选是被强制取消的，
           报「不含图片」会让人以为是自己取消的 */
        if (imgState === 'loading') {
          parts.push('图片统计中…');
        } else if (imgState === 'off') {
          parts.push('图片读取不可用');
        } else if (!want) {
          parts.push('不含图片');
        } else {
          var n = (imgEntries || []).length;
          var imgBytes = 0;
          (imgEntries || []).forEach(function (it) { imgBytes += (it.blob && it.blob.size) || 0; });
          bytes += Math.round(imgBytes * 1.37);   /* base64 膨胀约 1/3 */
          parts.push(n ? '图片 ' + n + ' 张' : '无图片');
        }

        /* 超过 8MB 基本是带图历史撑着，微信分段会远超硬上限，导出前先说一句 */
        var heavy = bytes > 8 * 1024 * 1024;
        if (heavy && counts.aiHistory && (!expHistory || expHistory.checked)) {
          parts.push('偏大，建议去掉对话历史再导');
        }

        expSize.innerHTML = '预计文件大小约 <b>' + esc(fmtBytes(bytes)) + '</b>';
        expSize.classList.toggle('over', heavy);
      }

      if (expImages) expImages.addEventListener('change', refreshSize);
      if (expConfig) expConfig.addEventListener('change', refreshSize);
      if (expHistory) expHistory.addEventListener('change', refreshSize);

      function exportName() {
        var d = new Date();
        var head = (opt.fileName || '知识库备份');
        return head + '-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
          '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + '.json';
      }

      function doExport() {
        var data = pickData(pruneShells(collectLocal()));
        /* AI 配置里的 API Key 属本机凭据，不写进备份文件。 */
        Object.keys(data).forEach(function (k) {
          if (!/:ai:cfg$/.test(k)) return;
          try {
            var o = JSON.parse(data[k]);
            if (o && Object.prototype.hasOwnProperty.call(o, 'key')) {
              delete o.key;
              data[k] = JSON.stringify(o);
            }
          } catch (e) {}
        });
        var keys = Object.keys(data);
        var counts = bucketCounts(data);
        var want = !expImages || expImages.checked;
        var refsNow = refIdsOf(data);
        var refCount = Object.keys(refsNow).length;

        var payload = {
          app: 'kb-framework',
          version: 2,
          projectId: opt.projectId || 'default',
          exportedAt: new Date().toISOString(),
          count: keys.length,
          blobCount: 0,
          incomplete: false,
          note: '',
          data: data,
          blobs: null
        };

        var chain;
        /* 排除掉的那类数据里引用的图也不该进备份，这里按最终数据再筛一次 */
        var pool = (imgEntries || []).filter(function (it) { return refsNow[it.id]; });
        if (want && imgState === 'ok' && pool.length) {
          chain = Promise.all(pool.map(function (it) {
            return blobToB64(it.blob).then(function (b64) {
              return b64 ? { id: it.id, type: (it.blob && it.blob.type) || 'image/png', data: b64 } : null;
            });
          })).then(function (list) {
            var ok = list.filter(Boolean);
            payload.blobs = ok;
            payload.blobCount = ok.length;
          });
        } else {
          chain = Promise.resolve();
        }

        chain.then(function () {
          /* 正文引用的图比实际带走的少就算不完整；库里早已没有的图也要计入，
             否则备份会自称完整、导入端也不会提醒 */
          var got = payload.blobs ? payload.blobs.length : 0;
          var wantImg = want || imgState === 'off';   /* 图床不可用是勾选被强制取消，仍算想带 */
          payload.incomplete = wantImg && refCount > 0 && (imgState === 'off' || got < refCount);

          /* 备份文件里的说明按实际勾选写，导入端的摘要靠它说话 */
          var bits = ['学习数据 ' + counts.study + ' 条'];
          if (counts.aiConfig) bits.push('AI 配置 ' + counts.aiConfig + ' 条');
          if (counts.aiHistory) bits.push('对话历史 ' + counts.aiHistory + ' 条');
          if (payload.blobs && payload.blobs.length) bits.push('图片 ' + payload.blobs.length + ' 张');
          else if (payload.incomplete) bits.push('图片读取失败，本次不含图片');
          else bits.push('纯文字版，不含图片');
          payload.note = bits.join('、');
          if (payload.incomplete) payload.note += '（备份不完整）';

          var saved = '导出成功！' + keys.length + ' 条记录已保存';
          if (payload.incomplete) saved += '（不含图片）';
          else if (payload.blobs && payload.blobs.length) saved += '，含 ' + payload.blobs.length + ' 张图片';
          if (download(JSON.stringify(payload))) toast(saved);
        });
      }

      /* 微信内不能下载文件，改走 engine/sync/wechat.js 的分段复制面板 */

      /* 返回 true 表示真的下载了（由调用方给成功提示）；
         微信内改走分段复制面板，面板自己就是反馈，不再叠 toast */
      function download(jsonText) {
        var name = exportName();
        if (KB.SyncWeChat && KB.SyncWeChat.isWeChat()) {
          KB.SyncWeChat.show(jsonText, name, { texts: opt.texts || {} });
          return false;
        }
        var blob, url;
        try {
          blob = new global.Blob([jsonText], { type: 'application/json;charset=utf-8' });
          url = global.URL.createObjectURL(blob);
        } catch (e) {
          toast('导出失败，请换个浏览器试试');
          return false;
        }
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { try { global.URL.revokeObjectURL(url); } catch (e) {} }, 2000);
        return true;
      }

      if (expCancel && expOverlay) {
        expCancel.addEventListener('click', function (e) {
          e.stopPropagation();
          expOverlay.classList.remove('show');
        });
        expOverlay.addEventListener('click', function (e) {
          if (e.target === expOverlay) expOverlay.classList.remove('show');
        });
      }
      if (expOk) {
        expOk.addEventListener('click', function () {
          if (expOverlay) expOverlay.classList.remove('show');
          doExport();
        });
      }
      if (orbExport) {
        orbExport.addEventListener('click', function (e) {
          e.stopPropagation();
          showExport();
        });
        orbExport.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      }

      /* ---------------- 导入 ---------------- */

      function validate(obj) {
        if (!obj || typeof obj !== 'object') return { error: '导入失败：文件内容不是对象' };
        if (obj.app && obj.app !== 'kb-framework') {
          return { error: '导入失败：这不是本框架的备份文件' };
        }
        if (obj.projectId && opt.projectId && obj.projectId !== opt.projectId) {
          return { error: '导入失败：备份属于项目「' + obj.projectId + '」，与本机「' + opt.projectId + '」不匹配' };
        }
        var data = obj.data && typeof obj.data === 'object' ? obj.data : null;
        if (!data) return { error: '导入失败：文件里没有数据' };

        var keys = Object.keys(data).filter(function (k) {
          return typeof data[k] === 'string' && k.indexOf(base) === 0;
        });
        if (!keys.length) return { error: '导入失败：备份里没有本机项目的数据' };

        /* 备份里带的模块，按配置顺序对回「序号·标题」，
           同一 id 出现多次时取第一个（多个入口可能共用一个子页） */
        var byId = {};
        mods.forEach(function (m, i) {
          if (m.id && !byId[m.id]) byId[m.id] = (i + 1) + '·' + m.title;
        });
        var names = [];
        var hasProgress = false;
        keys.forEach(function (k) {
          var rest = k.slice(base.length);
          var id = rest.split(':')[0];
          if (id === 'home') { hasProgress = true; return; }
          var t = byId[id];
          if (t && names.indexOf(t) < 0) names.push(t);
        });

        /* 我的卡片与学习进度是单独在说明里点名的两类 */
        var hasCards = keys.some(function (k) {
          return k.indexOf(base + 'cards') === 0 || k.indexOf('custom_cards_') === 0;
        });

        /* AI 相关两类：键名前缀待 AI 助手接入时定，
           这里先按 kind 段里带不带 ai / history 判断，有就显示那两行 */
        var hasAI = keys.some(function (k) {
          return k.indexOf(':ai:') > -1 && k.indexOf('history') < 0;
        });
        var hasHistory = keys.some(function (k) {
          return k.indexOf(':ai:') > -1 && k.indexOf('history') > -1;
        });

        return {
          data: data,
          keys: keys,
          names: names,
          hasCards: hasCards,
          hasProgress: hasProgress,
          hasAI: hasAI,
          hasHistory: hasHistory,
          blobs: Array.isArray(obj.blobs) ? obj.blobs.filter(function (b) {
            return b && b.id && b.data;
          }) : null,
          incomplete: !!obj.incomplete,
          exportedAt: obj.exportedAt || '',
          note: obj.note || ''
        };
      }

      /* 导入说明：每类数据一行（**加粗**类别名），
         数据段与警告段之间空一行，末尾空一行再问「确定继续吗？」
         **x** 会被转成 <b>，丢了就没有重点 */
      function buildMessage(p) {
        var studyParts = [];
        if (p.names.length) studyParts.push(p.names.length + ' 个模块');
        if (p.hasCards) studyParts.push('我的卡片');
        if (p.hasProgress) studyParts.push('首页学习进度');

        var msg = '即将导入 ' + p.keys.length + ' 条数据。\n';

        if (studyParts.length) {
          msg += '📑 **学习数据**：包含 ' + studyParts.join('、');
          if (p.names.length) msg += '，其中模块内容涵盖 ' + p.names.join('、');
          msg += '。\n';
        }

        /* 笔记图片单独一行，只有备份里真带了图才写；
           0 张时不写这行，交给下面 incomplete 那句 ⚠️ 说明

           ✉️ 🗒️ 🗞️ 🎬 🖼️ */
        if (p.blobs && p.blobs.length) {
          msg += '📋 **笔记图片**：' + p.blobs.length + ' 张，导入后笔记里的图可以正常显示。\n';
        }

        /* 这两行按备份里有没有 AI 数据出现，没有就不写（框架接 AI 助手后自然生效） */
        if (p.hasAI) msg += '⚙️ **AI 配置**：包含提示词等，本机已有的 API Key 会保留。\n';
        if (p.hasHistory) msg += '💭 **AI 对话历史**：包含 AI 答疑助手的全部对话历史。\n';

        msg += '\n⚠️ 导入是整块替换：备份文件里带着哪个模块的内容，本机对应模块的记录就整个换成文件里的，不是逐张比较后合并。\n'
          + '⚠️ 本机有、文件里没有的模块不受影响，如收藏、笔记、编辑、自测标记等，文件里有对应数据的才覆盖，没有的不动。';

        /* 图床单独打包，只有该带没带出来时才多提醒一句 */
        if (p.incomplete) {
          msg += '\n⚠️ 这份备份不含图片，导入后笔记里的图会显示不出来。';
        }

        msg += '\n\n确定继续吗？';
        return msg;
      }

      function handleFile(file) {
        if (!file) return;
        var fr = new global.FileReader();
        fr.onload = function (ev) {
          var obj = null;
          try { obj = JSON.parse(ev.target.result); }
          catch (e) { toast('导入失败：文件不是有效的 JSON'); return; }

          var p = validate(obj);
          if (p.error) { toast(p.error); return; }

          var ask = (KB.UI && KB.UI.confirm)
            ? KB.UI.confirm
            : function (o) { return Promise.resolve(global.confirm(o.message)); };

          Promise.resolve(ask({
            title: '导入数据',
            message: buildMessage(p),
            okText: '导入',
            wide: true
          })).then(function (ok) {
            if (!ok) return;
            doImport(p);
          });
        };
        fr.onerror = function () { toast('导入失败：文件读取错误'); };
        fr.readAsText(file, 'utf-8');
      }

      /* 失败键归个类，提示里说人话，别把原始键名甩出来 */
      function classifyKey(k) {
        if (/:ai:history$/.test(k) || k === 'ai_assistant_history_v1') return 'AI 对话历史';
        if (bucketOf(k) === 'aiConfig') return 'AI 配置';
        if (/:cards:/.test(k)) return '我的卡片';
        if (/:notes$/.test(k)) return '笔记';
        return '学习数据';
      }

      function doImport(p) {
        if (!p) return;
        var write = {};
        p.keys.forEach(function (k) {
          var v = p.data[k];
          /* 备份里没带 API Key 时保留本机已有的，导入不该把凭据抹掉。 */
          if (/:ai:cfg$/.test(k)) {
            try {
              var incoming = JSON.parse(v);
              var existing = JSON.parse(global.localStorage.getItem(k) || '{}');
              if (incoming && !incoming.key && existing && existing.key) {
                incoming.key = existing.key;
                v = JSON.stringify(incoming);
              }
            } catch (e) {}
          }
          write[k] = v;
        });

        var done = Object.keys(write).length;
        var restored;
        try {
          /* 内容类要写回库与镜像，只塞 localStorage 刷新后会被迁移逻辑再搬一次 */
          restored = (KB.Store && KB.Store.restore)
            ? KB.Store.restore(write)
            : Promise.resolve().then(function () {
                Object.keys(write).forEach(function (k) { global.localStorage.setItem(k, write[k]); });
                return done;
              });
        } catch (err) {
          toast('导入中断：浏览器存储空间可能已满');
          return;
        }

        restored.then(function (res) {
          var failed = (res && res.failed) ? res.failed : [];
          var okCount = (res && typeof res.ok === 'number') ? res.ok : done;

          var items = (p.blobs || []).map(function (b) {
            var blob = b64ToBlob(b.data, b.type);
            return blob ? { id: b.id, blob: blob } : null;
          }).filter(Boolean);

          var imgPut = items.length && KB.Blobs && KB.Blobs.putMany
            ? KB.Blobs.putMany(items)
            : Promise.resolve(0);

          imgPut.then(function (n) {
            if (opt.onImporting) opt.onImporting();

            /* 有键没写进去就不报成功，也不自动刷新 —— 刷掉现场就再也说不清了 */
            if (failed.length) {
              var cats = [];
              failed.forEach(function (k) {
                var name = classifyKey(k);
                if (cats.indexOf(name) < 0) cats.push(name);
              });
              toast('⚠️ 有 ' + failed.length + ' 项没写进去：' + cats.join('、') +
                '。多半是存储空间不足，请先导出备份再清理，然后重试导入');
              return;
            }

            var msg = '已导入 ' + okCount + ' 条记录';
            if (n) msg += '、' + n + ' 张图片';
            if (items.length && n < items.length) {
              msg += '（' + (items.length - n) + ' 张图片未回库，笔记里的图可能显示不出来）';
            }
            toast(msg + '，即将刷新~~');
            setTimeout(function () {
              try { global.location.reload(); } catch (e) {}
            }, 900);
          });
        }, function () {
          toast('导入中断：浏览器存储空间可能已满');
        });
      }

      if (orbImport) {
        orbImport.addEventListener('click', function (e) {
          e.stopPropagation();
          closeSync();
          if (!fileInput) return;
          fileInput.value = '';
          fileInput.click();
        });
        orbImport.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      }
      if (fileInput) {
        fileInput.addEventListener('change', function (e) {
          var f = e.target.files && e.target.files[0];
          handleFile(f);
        });
      }

      return {
        open: openSync,
        close: closeSync,
        exportNow: showExport
      };
    }
  };
})(window);
