/* 筛选记忆：把各维度取值与搜索词记下来，下次打开原样还原。
   必须在首次 render 之前还原，否则页面会先画一遍全量再跳成筛选结果。

   存的值在下拉里找不到（章节改名、数据删了）时由筛选项重建负责清空，
   这里不做校验，避免两处判断打架。

   下面六个无参接口给全站搜索落点用：带 ?kw= 进来时搜索框里是借来的临时词，
   整个会话不写进记忆，退出时把进会话前的原件原样写回。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  var timer = null;
  var currentId = null;   /* 装配时由 load 记下，后面的无参接口才知道操作哪个键 */
  var paused = false;      /* suspend 期间整份记忆不写 */
  var textFrozen = false;  /* 只冻结搜索词，下拉照常记 */
  var frozenKeyword = '';  /* 冻结那一刻记忆里存着的词 */

  function load(moduleId, values) {
    currentId = moduleId;
    var saved = KB.Store.get(moduleId, 'filters', null);
    var out = { keyword: '' };
    if (!saved || typeof saved !== 'object') return out;

    /* 兼容旧存储：favOnly 为真时并入 fav 维度 */
    if (saved.favOnly === true && saved.values && typeof saved.values === 'object' &&
        saved.values.fav === undefined) {
      saved.values.fav = '1';
    }

    if (saved.values && typeof saved.values === 'object') {
      Object.keys(values).forEach(function (k) {
        if (typeof saved.values[k] === 'string') values[k] = saved.values[k];
      });
    }

    if (typeof saved.keyword === 'string') out.keyword = saved.keyword;
    return out;
  }

  /* 连续操作只写最后一次。values 是同一个对象，延时里读到的是最新值。 */
  function save(moduleId, values, extra) {
    currentId = moduleId;
    if (paused) return;
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (paused) return;
      var kw = (extra && extra.keyword) || '';
      if (textFrozen) {
        /* 搜索会话期间搜索框里的词是借来的，写回原件里那个词 */
        kw = frozenKeyword;
      } else if (document.documentElement.classList.contains('sj-in-search')) {
        /* 没走会话接口的旧路径：靠页面类名兜住临时词 */
        var prev = KB.Store.get(moduleId, 'filters', null);
        kw = (prev && typeof prev.keyword === 'string') ? prev.keyword : '';
      }
      KB.Store.set(moduleId, 'filters', {
        values: values,
        keyword: kw
      });
    }, 200);
  }

  function clear(moduleId) {
    currentId = moduleId;
    clearTimeout(timer);
    KB.Store.remove(moduleId, 'filters');
  }

  /* ---- 搜索会话接口 ----
     快照是整份记忆的 JSON 字符串，键本来不存在时返回 null，与落点脚本的约定一致。 */

  function snapshot() {
    if (!currentId || !KB.Store) return null;
    var v = KB.Store.get(currentId, 'filters', null);
    if (v == null) return null;
    try { return JSON.stringify(v); } catch (e) { return null; }
  }

  function restore(raw) {
    if (!currentId || !KB.Store) return;
    if (raw === null || raw === undefined) {
      KB.Store.remove(currentId, 'filters');
      return;
    }
    try {
      var v = JSON.parse(raw);
      KB.Store.set(currentId, 'filters', (v && typeof v === 'object') ? v : {});
    } catch (e) {}
  }

  function originalKeyword() {
    if (!currentId || !KB.Store) return '';
    var v = KB.Store.get(currentId, 'filters', null);
    return (v && typeof v.keyword === 'string') ? v.keyword : '';
  }

  KB.FilterMemory = {
    load: load,
    save: save,
    clear: clear,
    suspend: function () { paused = true; clearTimeout(timer); },
    resume: function () { paused = false; },
    freezeText: function () { textFrozen = true; frozenKeyword = originalKeyword(); },
    unfreezeText: function () { textFrozen = false; },
    snapshot: snapshot,
    restore: restore
  };
})(window);
