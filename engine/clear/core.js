/* 清除数据 · 核心
   职责（不随样式改变）：
     · 打开 / 收起 / 金钮 ✓ 状态
     · 记住选了哪几个模块
     · 确认弹层内容与确认后按前缀清存储
     · 点外部收起、Escape 逐层关闭
     · 展开时回调 opt.onOpen，由外部处理与同步球的互斥

   选择器本身是可替换零件，由 KB.ClearPickers 注册：
     KB.ClearPickers.register('名字', { mount(ctx) { ... } });
   project.config.js 里用 home.clear.picker 点名，或用 home.clear.byCount
   按模块数分派。未注册的名字会退回 petal。

   mount(ctx) 里能拿到：
     ctx.layer     选择器挂载容器
     ctx.modules   模块数组（含 title / icon）
     ctx.color(i)  第 i 个模块的配色 { c, c2, soft }
     ctx.isOn(i)   第 i 个是否已选中
     ctx.toggle(i) 切换第 i 个的选中态（只改数据，视觉自己更新）
     ctx.close()   收起整个选择器
     ctx.opts      byCount 里给该形态的附加参数
   返回 { reset() } 可选：收起时清理自己的选中视觉。 */
(function (global) {
  'use strict';

  var KB = global.KB = global.KB || {};

  var esc = KB.escape;

  /* ---------- 选择器注册表 ---------- */
  var pickers = {};
  KB.ClearPickers = {
    register: function (name, def) {
      if (name && def && typeof def.mount === 'function') pickers[name] = def;
    },
    has: function (name) { return Object.prototype.hasOwnProperty.call(pickers, name); },
    names: function () { return Object.keys(pickers); }
  };

  /* ---------- 核心 ---------- */
  KB.Clear = {
    mount: function (opt) {
      var section = opt.section;
      var layer = opt.layer;
      var btn = opt.btn;
      var label = opt.label;
      var overlay = opt.overlay;
      var list = opt.list;
      var okBtn = opt.okBtn;
      var cancelBtn = opt.cancelBtn;
      if (!layer || !section || !btn || !overlay) return null;

      var mods = opt.modules || [];
      var cfg = opt.config || {};
      var selected = {};
      var isOpen = false;
      var picker = null;

      function colorAt(i) {
        return (opt.colorAt && opt.colorAt(i)) || {};
      }

      /* 分派：byCount 精确命中 → '13+' 这类区间命中 → 默认 picker */
      function resolve() {
        var n = mods.length;
        var by = cfg.byCount || {};
        var hit = Object.prototype.hasOwnProperty.call(by, n) ? by[n] : null;
        if (hit == null) {
          var keys = Object.keys(by);
          for (var i = 0; i < keys.length; i++) {
            var m = /^(\d+)\s*\+$/.exec(keys[i]);
            if (m && n >= Number(m[1])) { hit = by[keys[i]]; break; }
          }
        }
        if (hit == null) hit = cfg.picker || 'petal';
        if (typeof hit === 'string') return { name: hit, opts: {} };
        return { name: hit.picker || 'petal', opts: hit.opts || hit };
      }

      function buildPicker() {
        var r = resolve();
        var def = pickers[r.name] || pickers.petal;
        if (!def) return;
        layer.innerHTML = '';
        picker = def.mount({
          layer: layer,
          modules: mods,
          color: colorAt,
          isOn: function (i) { return !!selected[i]; },
          toggle: function (i) {
            if (selected[i]) delete selected[i];
            else selected[i] = true;
          },
          close: function () { resetAll(); },
          opts: r.opts || {}
        }) || null;
      }

      function resetAll() {
        isOpen = false;
        selected = {};
        section.classList.remove('open');
        if (label) label.textContent = opt.labelText || '清除';
        btn.classList.remove('check-mode');
        if (picker && picker.reset) picker.reset();
        overlay.classList.remove('show');
      }

      function pickedIndexes() {
        return Object.keys(selected).map(Number).sort(function (a, b) { return a - b; });
      }

      /* 按 {prefix}:{projectId}:{模块id}: 前缀清镜像、库、localStorage 与
         sessionStorage；home 前缀（学习进度、语速记忆）无条件随清。
         全站搜索的会话缓存不挂项目前缀，单独点名一起清。 */
      function clearStorage(items) {
        var base = (opt.storagePrefix || 'kb') + ':' + (opt.projectId || 'default') + ':';
        var prefixes = [base + 'home:'];
        items.forEach(function (i) {
          var id = mods[i] && mods[i].id;
          if (id) prefixes.push(base + id + ':');
        });
        var navPrefixes = ['site_search_', 'sj_scroll:'];
        var all = prefixes.concat(navPrefixes);

        function hit(k) {
          for (var i = 0; i < all.length; i++) {
            if (k.indexOf(all[i]) === 0) return true;
          }
          return false;
        }

        /* 删之前先记下这批键引用到的图。内容类正文在库里，
           引用要同时看镜像与 localStorage，只看一处会漏。 */
        var refs = {};
        try {
          var snapshot = (KB.Store && KB.Store.dump) ? (KB.Store.dump() || {}) : {};
          Object.keys(snapshot).forEach(function (k) {
            if (hit(k) && KB.Blobs && KB.Blobs.refsIn) KB.Blobs.refsIn(snapshot[k], refs);
          });
        } catch (e) {}
        try {
          var ls = global.localStorage;
          for (var i = 0; i < ls.length; i++) {
            var k = ls.key(i);
            if (k && hit(k) && KB.Blobs && KB.Blobs.refsIn) {
              KB.Blobs.refsIn(ls.getItem(k) || '', refs);
            }
          }
        } catch (e) {}

        if (KB.Store && KB.Store.removeByPrefix) {
          KB.Store.removeByPrefix(all);
        } else {
          try {
            var ls2 = global.localStorage;
            for (var m = ls2.length - 1; m >= 0; m--) {
              var lk = ls2.key(m);
              if (lk && hit(lk)) ls2.removeItem(lk);
            }
          } catch (e) {}
          try {
            var ss = global.sessionStorage;
            for (var n = ss.length - 1; n >= 0; n--) {
              var sk = ss.key(n);
              if (sk && hit(sk)) ss.removeItem(sk);
            }
          } catch (e) {}
        }

        /* 全站还有别的键在引用就留着（图可能被别的子页的笔记共用），
           没人用了才真从图床删掉 */
        var ids = Object.keys(refs);
        if (ids.length && KB.Blobs && KB.Blobs.del && KB.Blobs.refsAll) {
          var still = KB.Blobs.refsAll();
          ids.forEach(function (id) {
            if (still[id]) return;
            KB.Blobs.del(id);
          });
        }

        /* 数据已经删干净，代号跟着加一：还开着本页的旧标签页据此判自己过期，
           不会把清空前的内容写回来。只在整站清除这一处加，按模块清卡不算 */
        if (KB.Store && KB.Store.bumpEpoch) KB.Store.bumpEpoch();
      }

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!isOpen) {
          isOpen = true;
          section.classList.add('open');
          if (label) label.textContent = '✓';
          btn.classList.add('check-mode');
          /* 通知外部：花瓣展开。靠它跟同步球互斥，本模块不认识同步模块 */
          if (opt.onOpen) opt.onOpen();
          return;
        }
        var items = pickedIndexes();
        if (!items.length) { resetAll(); return; }
        list.innerHTML = items.map(function (i) {
          return '<li><span class="li-dot" style="color:' + esc(colorAt(i).c2) + '"></span>' +
            '第 ' + (i + 1) + ' 项 · ' + esc(mods[i].title) + '</li>';
        }).join('');
        overlay.classList.add('show');
      });

      document.addEventListener('click', function (e) {
        if (!isOpen) return;
        if (section.contains(e.target)) return;
        if (overlay.classList.contains('show')) return;
        resetAll();
      });

      if (cancelBtn) {
        cancelBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          overlay.classList.remove('show');
        });
      }
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.classList.remove('show');
      });

      if (okBtn) {
        okBtn.addEventListener('click', function () {
          var items = pickedIndexes();
          clearStorage(items);
          var names = items.map(function (i) { return mods[i].title; }).join('、');
          if (opt.onCleared) opt.onCleared(items);
          resetAll();
          if (opt.toast) opt.toast(names ? '已清除：' + names : '已清除数据');
        });
      }

      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || !isOpen) return;
        if (overlay.classList.contains('show')) overlay.classList.remove('show');
        else resetAll();
      });

      if (label) label.textContent = opt.labelText || '清除';   /* 首屏就按配置显示，别等收起一次才变 */
      buildPicker();

      return {
        reset: resetAll,
        /* 模块或配置变了可重新挂载选择器 */
        rebuild: function () { selected = {}; buildPicker(); }
      };
    }
  };
})(window);
