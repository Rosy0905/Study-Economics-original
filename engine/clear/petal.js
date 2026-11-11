/* 选择器零件：花瓣
   每个模块一片花瓣，按 360/n 均分角度围成一圈。
   花瓣颜色跟随所属模块：边框与选中态用亮色 c2，序号用主色 c，
   底部渐变用 soft。
   想换一套形态，复制本文件改绘制逻辑，换个名字注册即可。 */
(function (global) {
  'use strict';

  var KB = global.KB = global.KB || {};
  if (!KB.ClearPickers) return;

  var esc = KB.escape;

  KB.ClearPickers.register('petal', {
    mount: function (ctx) {
      var layer = ctx.layer;
      var mods = ctx.modules || [];
      var n = mods.length || 1;

      layer.innerHTML = mods.map(function (m, i) {
        var col = ctx.color(i) || {};
        return '<div class="petal" data-idx="' + i + '"' +
          ' style="--i:' + i + ';--angle:' + ((360 / n) * i) + 'deg' +
          ';--pc:' + esc(col.c2) + ';--pcd:' + esc(col.c) + ';--soft:' + esc(col.soft) + '"' +
          ' title="' + esc(m.title) + '">' +
          '<span class="petal-face">' +
          '<span class="petal-num">' + (i + 1) + '</span>' +
          '<span class="petal-ic">' + esc(m.icon) + '</span>' +
          '</span></div>';
      }).join('');

      var els = layer.querySelectorAll('.petal');
      Array.prototype.forEach.call(els, function (p, i) {
        p.addEventListener('click', function (e) {
          e.stopPropagation();
          ctx.toggle(i);
          p.classList.toggle('selected', ctx.isOn(i));
        });
      });

      return {
        reset: function () {
          Array.prototype.forEach.call(els, function (p) { p.classList.remove('selected'); });
        }
      };
    }
  });
})(window);
