/* 索引在后台线程里加载、解析与匹配：主线程只发关键词、收结果，不接触索引本体。
   索引是 JSON.stringify 的产物，直接 JSON.parse 比执行脚本更快，
   也不用把三兆对象搬回主线程再做一次结构化克隆。 */

'use strict';

importScripts('search-core.js');

var CORE = self.KB_SEARCH_CORE;
var idx = null;
var pending = null;
var mine = [];

function loadIndex(url) {
  if (idx) return Promise.resolve(idx);
  if (pending) return pending;
  pending = fetch(url, { credentials: 'same-origin' })
    .then(function (r) {
      if (!r.ok) throw new Error('索引读取失败');
      return r.text();
    })
    .then(function (text) {
      var json = text
        .replace(/^\s*(?:window|self)\.SITE_INDEX\s*=\s*/, '')
        .replace(/;\s*$/, '');
      idx = JSON.parse(json);
      return idx;
    })
    .catch(function (err) {
      pending = null;
      throw err;
    });
  return pending;
}

/* 索引里的模块在前，运行时读到的我的卡片补一组在后 */
function modList() {
  var list = (idx && idx.mods) ? idx.mods.slice() : [];
  if (mine.length) {
    list.push({ key: '9my-cards', name: '我的卡片', url: 'mycards.html', n: mine.length, cards: mine });
  }
  return list;
}

self.onmessage = function (e) {
  var d = e.data || {};

  if (d.type === 'mine') {
    mine = Array.isArray(d.cards) ? d.cards : [];
    return;
  }

  if (d.type === 'load') {
    loadIndex(d.url).then(function (i) {
      self.postMessage({ type: 'ready', n: (i && i.n) || 0 });
    }).catch(function (err) {
      self.postMessage({ type: 'error', message: String((err && err.message) || err) });
    });
    return;
  }

  if (d.type === 'search') {
    loadIndex(d.url).then(function () {
      if (Array.isArray(d.mine)) mine = d.mine;
      var res = CORE.runMods(modList(), d.kw, d.limit || 0);
      self.postMessage({ type: 'result', id: d.id, kw: d.kw, total: res.total, groups: res.groups });
    }).catch(function (err) {
      self.postMessage({ type: 'error', id: d.id, message: String((err && err.message) || err) });
    });
    return;
  }

  if (d.type === 'expand') {
    loadIndex(d.url).then(function () {
      var m = null;
      modList().forEach(function (x) { if (x.key === d.key) m = x; });
      var hits = [];
      if (m) {
        var one = CORE.runMods([m], d.kw, 0);
        if (one.groups.length) hits = one.groups[0].hits;
      }
      self.postMessage({ type: 'expanded', id: d.id, key: d.key, hits: hits });
    }).catch(function (err) {
      self.postMessage({ type: 'error', id: d.id, message: String((err && err.message) || err) });
    });
  }
};
