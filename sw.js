/* 站点缓存：索引与静态资源一次取回，复访不再重新下载。
   页面本身走网络优先，保证改版后立刻可见；静态资源走缓存优先并后台更新。
   索引单独走网络优先带超时，避免同一天重建索引后仍读到旧内容。 */

'use strict';

var CACHE = 'kb-shell-20261113a';
var INDEX_RE = /\/search-index\.js$/;
var STATIC_RE = /\.(?:js|css|png|svg|ico|woff2?|webmanifest)$/i;

self.addEventListener('install', function (e) {
  e.waitUntil(precache().then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE && /^kb-/.test(k)) return caches.delete(k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 预缓存清单：固定几项，其余从主页与搜索页的引用里现扫，
   这样带版本参数的资源不用在脚本里维护第二份列表。 */
function assets() {
  var base = [
    './index.html',
    './search.html',
    './manifest.webmanifest',
    './search-index.js',
    './engine/search-worker.js'
  ];
  var pages = ['./index.html', './search.html'];

  return Promise.all(pages.map(function (p) {
    return fetch(p, { cache: 'reload' }).then(function (r) {
      return r.ok ? r.text() : '';
    }).catch(function () { return ''; });
  })).then(function (htmls) {
    var extra = [];
    htmls.forEach(function (h) {
      var re = /(?:src|href)="([^"]+)"/g;
      var m;
      while ((m = re.exec(h))) {
        var u = m[1];
        if (!u || u.charAt(0) === '#') continue;
        if (/^(?:https?:|data:|mailto:|javascript:)/i.test(u)) continue;
        if (extra.indexOf(u) === -1) extra.push(u);
      }
    });
    return base.concat(extra);
  });
}

function precache() {
  return assets().then(function (list) {
    return caches.open(CACHE).then(function (c) {
      return Promise.all(list.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    });
  });
}

function withTimeout(ms, p) {
  return new Promise(function (res, rej) {
    var t = setTimeout(function () { rej(new Error('timeout')); }, ms);
    p.then(function (v) { clearTimeout(t); res(v); },
          function (e) { clearTimeout(t); rej(e); });
  });
}

function put(req, r) {
  if (!r || !r.ok) return r;
  var copy = r.clone();
  caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
  return r;
}

/* 页面：网络优先，断网回缓存，再回主页 */
function navFetch(req) {
  return fetch(req).then(put.bind(null, req)).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || caches.match('./index.html');
    });
  });
}

/* 索引：网络优先带超时，弱网或离线直接读缓存 */
function freshFetch(req) {
  return withTimeout(1500, fetch(req)).then(put.bind(null, req)).catch(function () {
    return caches.match(req).then(function (hit) {
      return hit || new Response('', { status: 503, statusText: 'offline' });
    });
  });
}

/* 静态资源：先用缓存，同时后台取新，下次访问即新版本 */
function staleFetch(req) {
  return caches.match(req).then(function (hit) {
    var net = fetch(req).then(put.bind(null, req)).catch(function () { return null; });
    if (hit) return hit;
    return net.then(function (r) {
      return r || new Response('', { status: 503, statusText: 'offline' });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(navFetch(req));
    return;
  }
  if (INDEX_RE.test(url.pathname)) {
    e.respondWith(freshFetch(req));
    return;
  }
  if (STATIC_RE.test(url.pathname)) {
    e.respondWith(staleFetch(req));
  }
});
