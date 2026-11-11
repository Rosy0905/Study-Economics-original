/* AI 答疑助手：分享链接编解码。
   纯函数，不碰 DOM，v2 紧凑格式与 v1 旧链接都能读。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  /* UTF-16 双字节打包 + base64url：中文从每字 3 字节降到 2 字节，
     输出不含 + / =，链接里零额外膨胀。 */
  function packConv(str) {
    var n = str.length;
    var bytes = new Uint8Array(n * 2);
    for (var i = 0; i < n; i++) {
      var code = str.charCodeAt(i);
      bytes[i * 2] = code >> 8;
      bytes[i * 2 + 1] = code & 0xFF;
    }
    var bin = '';
    for (var j = 0; j < bytes.length; j += 0x4000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(j, j + 0x4000));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function unpackConv(s) {
    var t = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    var bin = atob(t);
    var out = '';
    for (var i = 0; i + 1 < bin.length; i += 2) {
      out += String.fromCharCode((bin.charCodeAt(i) << 8) | bin.charCodeAt(i + 1));
    }
    return out;
  }

  /* 清掉会和分隔符（0x01）/ 终止符（0x02）冲突的控制字符，其余原样保留 */
  function stripCtrl(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var cc = text.charCodeAt(i);
      out += (cc === 9 || cc === 10 || cc === 13 || cc >= 32) ? text.charAt(i) : ' ';
    }
    return out;
  }

  function encodeConv(h) {
    try {
      var parts = [];
      (h || []).forEach(function (m) {
        if (!m) return;
        var c = stripCtrl((m.content || '').replace(/<img[^>]*>/gi, ''));
        parts.push((m.role === 'user' ? 'u' : 'a') + c);
      });
      if (!parts.length) return '';
      return packConv(String.fromCharCode(2) + '2' +
        parts.join(String.fromCharCode(1)) + String.fromCharCode(2));
    } catch (e) {
      console.error('[share] encode error:', e);
      return '';
    }
  }

  function decodeConv(s) {
    if (!s) return [];
    try {
      var u = unpackConv(s);
      if (u.length > 2 && u.charCodeAt(0) === 2 && u.charAt(1) === '2' &&
          u.charCodeAt(u.length - 1) === 2) {
        var segs = u.slice(2, u.length - 1).split(String.fromCharCode(1));
        var arr2 = [];
        for (var i = 0; i < segs.length; i++) {
          if (!segs[i]) continue;
          arr2.push({
            role: segs[i].charAt(0) === 'u' ? 'user' : 'assistant',
            content: segs[i].slice(1)
          });
        }
        if (arr2.length) return arr2;
      }
    } catch (e) { /* 不是 v2，继续按旧格式尝试 */ }

    try {
      var json = decodeURIComponent(escape(atob(s)));
      var arr = JSON.parse(json);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.error('[share] decode error:', e);
      return [];
    }
  }

  KB.AICodec = {
    packConv: packConv,
    unpackConv: unpackConv,
    stripCtrl: stripCtrl,
    encodeConv: encodeConv,
    decodeConv: decodeConv
  };
})(window);
