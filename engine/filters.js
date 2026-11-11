/* 筛选：维度由配置声明，实现只有一份。
   选项永远从数据自动生成，不手写。
   维度之间用 parent 声明上下级：下级写 parent: "上级 key"，上级一变，下级选项重算、值清空。

   维度分两类：
   - 默认取卡片同名字段，卡片里有什么值就出什么选项；
   - `type: 'fav'` 取收藏状态，选项固定，供题库类页面挂「仅收藏」一栏。
   卡片里一个值都没有的维度整栏不出——同一份实现套不同结构的题库，
   配置里多写一维不会在页面上留个空下拉。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});
  var esc = function (s) { return KB.escape(s); };

  /* 分组标题也做成可选项，选中就等于选该组全部成员。
     <optgroup> 浏览器不允许选中，点了没反应，所以不走那条路。 */
  var GRP = '__grp__';
  /* 复合子项分隔符：章节值 + 子项键，如「一、消费者行为理论|概念」。
     仅当维度声明了 sub 时启用，不影响普通维度与计算专项页。 */
  var SUBSEP = '|';

  function groupOf(filter, value) {
    return (filter.groups || []).filter(function (g) { return g.label === value; })[0];
  }

  /* 复合子项里子键到题型的映射，供筛选时反查 */
  function subTypeFor(filter, subkey) {
    var subs = filter.sub || [];
    for (var i = 0; i < subs.length; i++) {
      if (subs[i].key === subkey) return subs[i];
    }
    return null;
  }

  function isField(f) {
    return !f.type || f.type === 'field';
  }

  function hasField(cards, key) {
    if (!cards.length) return true;
    return cards.some(function (c) {
      var v = c[key];
      return v !== undefined && v !== null && v !== '';
    });
  }

  function activeFilters(config, cards) {
    return config.filters.filter(function (f) {
      return !isField(f) || hasField(cards, f.key);
    });
  }

  /* ---- 取值与匹配 ---- */

  function valueMatch(filter, card, value) {
    if (!value) return true;
    if (value.indexOf(GRP) === 0) {
      var name = value.slice(GRP.length);
      var g = groupOf(filter, name);
      if (g) return g.members.indexOf(card[filter.key]) !== -1;
      /* 复合子项模式：GRP+章节名 = 选中整章 */
      if (filter.sub) return card[filter.key] === name;
      return false;
    }
    if (value.indexOf(SUBSEP) !== -1) {
      var parts = value.split(SUBSEP);
      var chap = parts[0];
      var subkey = parts[1];
      if (card[filter.key] !== chap) return false;
      var sub = subTypeFor(filter, subkey);
      if (!sub) return false;
      var fld = filter.subField || 'type';
      return card[fld] === sub.type;
    }
    return card[filter.key] === value;
  }

  function hit(filter, card, value, ctx) {
    if (!value) return true;
    if (filter.type === 'fav') {
      var favs = (ctx && ctx.favs) || [];
      return favs.indexOf(card.id) !== -1;
    }
    return valueMatch(filter, card, value);
  }

  function childrenOf(config, key) {
    return config.filters
      .filter(function (f) { return f.parent === key; })
      .map(function (f) { return f.key; });
  }

  /* 自己 + 所有下级，用于「重算选项时排除哪些维度」和「改上级时清哪些值」 */
  function subtree(config, key) {
    var out = [key];
    childrenOf(config, key).forEach(function (k) {
      out = out.concat(subtree(config, k));
    });
    return out;
  }

  function optionsOf(cards, key) {
    var seen = Object.create(null);
    var out = [];
    cards.forEach(function (c) {
      var v = c[key];
      if (!v || seen[v]) return;
      seen[v] = 1;
      out.push(v);
    });
    return out;
  }

  /* 统一成 { value, label }：字段维度的两者相同，收藏维度由配置给标签。
     配置里的 pin 列出要置顶的取值（如卷首说明那一类），置顶项标签前带 📌。
     labelMap 只改显示名、不改 value，筛选与级联仍拿原值比对。
     写对象是值到文案的映射，写函数则按值现算，两者都按需配，不配就原样输出。
     order 固定选项顺序：列出来的按 order 排，没列到的留在后面并保持数据顺序。 */
  function optionsFor(filter, cards) {
    if (filter.type === 'fav') {
      return filter.options || [{ value: '1', label: '仅收藏' }];
    }
    var pin = filter.pin || [];
    var map = filter.labelMap;
    var values = optionsOf(cards, filter.key);
    if (filter.order && filter.order.length) {
      var ord = filter.order;
      values = ord.filter(function (v) { return values.indexOf(v) !== -1; })
        .concat(values.filter(function (v) { return ord.indexOf(v) === -1; }));
    }
    var head = pin.filter(function (v) { return values.indexOf(v) !== -1; });
    var rest = values.filter(function (v) { return head.indexOf(v) === -1; });
    function labelOf(v) {
      if (typeof map === 'function') {
        var made = map(v);
        return made == null ? v : String(made);
      }
      if (map && Object.prototype.hasOwnProperty.call(map, v)) return String(map[v]);
      return v;
    }
    return head.concat(rest).map(function (v) {
      var text = labelOf(v);
      return { value: v, label: head.indexOf(v) !== -1 ? '📌 ' + text : text };
    });
  }

  /* 满足除 skip 之外所有维度的卡，用来算某个下拉还剩哪些选项 */
  function candidates(config, cards, values, skip, ctx) {
    return cards.filter(function (c) {
      return config.filters.every(function (f) {
        if (skip.indexOf(f.key) !== -1) return true;
        return hit(f, c, values[f.key], ctx);
      });
    });
  }

  /* 检索面由模块配置 search.fields 指定，默认题干与答案，不搜笔记。
     题库页的答案不在卡片上，只配题干；卷名、专业名不进检索面。 */
  function hitKeyword(card, keyword, config) {
    var kw = String(keyword || '').trim().toLowerCase();
    if (!kw) return true;
    var fields = (config && config.search && config.search.fields) || ['question', 'answer'];
    var hay = fields
      .map(function (k) { return String(card[k] == null ? '' : card[k]); })
      .join('\n');
    return hay.toLowerCase().indexOf(kw) !== -1;
  }

  function match(card, config, values, keyword, ctx) {
    if (!hitKeyword(card, keyword, config)) return false;
    return config.filters.every(function (f) {
      return hit(f, card, values[f.key], ctx);
    });
  }

  function apply(cards, config, values, keyword, ctx) {
    return cards.filter(function (c) { return match(c, config, values, keyword, ctx); });
  }

  function emptyValues(config) {
    var v = {};
    config.filters.forEach(function (f) { v[f.key] = ''; });
    return v;
  }

  function fillSelect(sel, options, current, filter, cards) {
    var groups = (filter && filter.groups) || [];
    var subs = (filter && filter.sub) || [];
    var subField = (filter && filter.subField) || 'type';

    /* 单个 option：value / 显示文案 / 是否加粗（组或章节标题）/ 是否缩进 */
    function opt(value, label, bold, indent) {
      return (
        '<option value="' + esc(value) + '"' +
        (value === current ? ' selected' : '') +
        (bold ? ' style="font-weight:600;"' : '') +
        '>' + (indent ? '　　' : '') + esc(label) + '</option>'
      );
    }

    var html = '<option value="">' + esc((filter && filter.allLabel) || '全部') + '</option>';

    /* 复合子项模式：每个章节先出加粗可点的标题（筛整章），
       再按该章数据里实际存在的题型挂子项，缺哪类就不挂哪类。 */
    if (subs.length) {
      options.forEach(function (o) {
        html += opt(GRP + o.value, o.label, true, false);
        subs.forEach(function (s) {
          var has = cards.some(function (c) {
            return c[filter.key] === o.value && c[subField] === s.type;
          });
          if (has) html += opt(o.value + SUBSEP + s.key, s.text, false, false);
        });
      });
      sel.innerHTML = html;
      return;
    }

    /* 原有 groups 逻辑：遍历到某组首个成员才插入组标题，未分组的项留在原位。 */
    var grpOf = Object.create(null);
    groups.forEach(function (g, gi) {
      g.members.forEach(function (m) { grpOf[m] = gi; });
    });
    var opened = Object.create(null);

    options.forEach(function (o) {
      var gi = grpOf[o.value];
      if (gi === undefined) {
        html += opt(o.value, o.label, false, false);
        return;
      }
      var g = groups[gi];
      if (!opened[gi]) {
        opened[gi] = 1;
        html += opt(GRP + g.label, g.label, true, false);
      }
      html += opt(o.value, o.label, false, true);
    });

    sel.innerHTML = html;
  }

  /* 已选值在当前选项里还存不存在：组标题看成员是否还在；
     复合子项看章节在且那章确有该题型；普通值看字面在不在。 */
  function valueAlive(filter, value, options, cards) {
    if (value.indexOf(GRP) === 0) {
      var name = value.slice(GRP.length);
      var g = groupOf(filter, name);
      if (g) return g.members.some(function (m) {
        return options.some(function (o) { return o.value === m; });
      });
      if (filter.sub) return options.some(function (o) { return o.value === name; });
      return false;
    }
    if (value.indexOf(SUBSEP) !== -1) {
      var parts = value.split(SUBSEP);
      var chap = parts[0];
      var subkey = parts[1];
      var sub = subTypeFor(filter, subkey);
      if (!sub) return false;
      var fld = filter.subField || 'type';
      return options.some(function (o) { return o.value === chap; }) &&
        cards.some(function (c) { return c[filter.key] === chap && c[fld] === sub.type; });
    }
    return options.some(function (o) { return o.value === value; });
  }

  function refreshOptions(barEl, config, cards, values, ctx) {
    activeFilters(config, cards).forEach(function (f) {
      var sel = barEl.querySelector('select[data-key="' + f.key + '"]');
      if (!sel) return;

      /* 有上级的下级，照原版专题页的规矩判能不能点：
         上级没选、上级选的是组标题、或这一项底下压根没有细分值，都锁住。
         只有选中具体一项且它确实带细分时才解锁。
         某一栏要全程放开自由选，显式写 requireParent: false。 */
      var pval = values[f.parent] || '';
      var parentIsGroup = pval.indexOf(GRP) === 0;
      var pool = candidates(config, cards, values, subtree(config, f.key), ctx);
      var childOpts = parentIsGroup ? [] : optionsFor(f, pool);
      var locked = !!(
        f.parent && f.requireParent !== false &&
        (!pval || parentIsGroup || !childOpts.length)
      );
      var options = locked ? [] : childOpts;

      /* 上级改动后当前值可能已经不存在，清掉而不是留一个空白的选中项。
         组标题与复合子项都不在 options 里，按各自规则单独判。 */
      var cur = values[f.key];
      if (cur && !valueAlive(f, cur, options, cards)) values[f.key] = '';

      fillSelect(sel, options, values[f.key] || '', f, cards);
      sel.disabled = locked;
      sel.title = locked ? '先选上一栏' : '';
    });
  }

  function render(barEl, config, cards, values, onChange, ctx) {
    barEl.innerHTML = '';

    activeFilters(config, cards).forEach(function (f) {
      var label = document.createElement('label');
      label.textContent = f.label;
      barEl.appendChild(label);

      var sel = document.createElement('select');
      sel.dataset.key = f.key;
      sel.addEventListener('change', function () {
        /* 选完就收光圈，手机上任选完不会一直挂着一圈高亮 */
        sel.blur();
        onChange(f.key, sel.value);
      });
      barEl.appendChild(sel);
    });

    refreshOptions(barEl, config, cards, values, ctx);
  }

  KB.Filters = {
    apply: apply,
    render: render,
    refreshOptions: refreshOptions,
    activeFilters: activeFilters,
    emptyValues: emptyValues,
    subtree: subtree
  };
})(window);
