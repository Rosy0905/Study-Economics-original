/* 行分类器：把答案纯文本切成带类型的段落。
   只判断「这一行是什么」，不产出 HTML，也不碰公式排版。
   unicode 与 latex 两个渲染器共用这一份，改规则只改这里。 */

(function (global) {
  'use strict';

  /* 全角标点的字形在字框里自带一段左留白（「（」比「消」往右缩一截），
     行首是这类字符时，缩进要减掉那一段，左边缘才跟正文齐。
     只认括号类 —— 「①」这类带圈数字没有那圈留白，算进来会反过来偏左。 */
  var HANG = /^[（(【［〔〈《「『]/;

  /* 行首可能先写加粗标记（**（1）完备性**），判断要看标记后面的第一个字。
     否则星号挡在前面，这一行就拿不到 hang，编辑态一加粗就跟正文错开。 */
  function hang(text) {
    return HANG.test(String(text == null ? '' : text).replace(/^\*\*/, '').trim());
  }

  /* 小问标题的字数上限 */
  var SUB_MAX = 20;

  /* 出现这些符号就说明是完整句子，不当标题 */
  var SENTENCE_MARKS = /[。；！？：，,、]/;

  /* 小问标题自动加粗开关：项目配置 subHeading: false 时整条规则跳过 */
  var subHeadingOn = true;

  /* 段内小问拆行：编号恰好比上一问大 1，且前一个可见字符是段首或句末标点。
     其余一律视为回指（代入（1）、本题（1）问），不拆行。 */
  var SUB_REF = /[（(](\d{1,2})[）)]/g;
  var STOP_CHARS = /[。；！？：】）)]$/;

  function splitSubBreaks(text) {
    var marks = [];
    var lastNo = 0;
    var m;

    SUB_REF.lastIndex = 0;
    while ((m = SUB_REF.exec(text)) !== null) {
      var n = parseInt(m[1], 10);
      var before = text.slice(0, m.index);
      var atStart = before.trim() === '';
      var afterStop = atStart || STOP_CHARS.test(before.replace(/\s+$/, ''));

      if (n === lastNo + 1) {
        if (afterStop && m.index > 0) marks.push(m.index);
        lastNo = n;
      } else if (atStart && lastNo === 0) {
        lastNo = n;
      }
    }

    if (!marks.length) return [text];

    var out = [];
    var prev = 0;
    marks.forEach(function (i) {
      out.push(text.slice(prev, i));
      prev = i;
    });
    out.push(text.slice(prev));
    return out;
  }

  function classify(line) {
    var raw = String(line || '').trim();
    if (!raw) return null;

    /* 行首 $$ 开头的整行都是公式，两种模式都认：unicode 原样显示，latex 交 KaTeX。
       尾部若误带成对结束符 $（写成 $$…$$ 或 $$…$），一并剥掉，避免 latex 下
       KaTeX 把尾部 $ 当公式源报错、或 unicode 下多露一个 $。 */
    if (raw.indexOf('$$') === 0) {
      return { type: 'fm', text: raw.slice(2).replace(/\$+$/, '').trim() };
    }

    /* 详解标题 */
    if (raw.indexOf('##') === 0) {
      return { type: 'detail', text: raw.slice(2).trim() + '：' };
    }

    /* 提示行：数据里既有 【提示】… 也有 **【提示】**… 两种写法 */
    var bare = raw.replace(/^\*+/, '').trim();

    /* 图占位：答案册写「［此处有图示：…］」，子页写「【此处有图示】」。
       两种都认，整行原文原样保留，不做前缀剥离——答案册那行的文字本身就是内容。 */
    if (/^［\s*此处有(?:图示|表格)/.test(bare)) {
      return { type: 'fig', text: bare };
    }
    /* 纯占位文字单独标记，样式上收成一小块；后面还带说明文字的按原样铺开 */
    if (bare.indexOf('【此处有图示】') === 0) {
      return { type: 'fig', compact: bare === '【此处有图示】', text: bare };
    }

    /* 提示行（**【提示】**…）不单独分类，落进普通段落，
       靠行内 ** 加粗显示。 */

    /* 小问标题：整行字数少且无句读才加粗。
       判的是整行，不截到第一个标点，避免把完整句子拦腰截断。
       行尾冒号先剥掉，「（1）均衡条件：」是标题写法，不是句子。
       行首的加粗标记不参与判断：**（1）完备性** 跟 （1）完备性 是同一种行。
       项目关掉这条规则时（subHeading: false）全部按普通段落走。 */
    if (subHeadingOn) {
      var probe = raw.replace(/^\*\*/, '').trim();
      var sub = /^[（(]\s*(\d{1,2})\s*[）)]\s*([\s\S]*)$/.exec(probe);
      if (sub) {
        var body = sub[2].replace(/^[*\s]+/, '').trim();
        var plain = body.replace(/[*`]/g, '').replace(/[：:]\s*$/, '').trim();
        if (plain.length > 0 && plain.length <= SUB_MAX && !SENTENCE_MARKS.test(plain)) {
          return { type: 'sub', text: raw };
        }
      }
    }

    return { type: 'p', text: raw };
  }

  /* 表格行：整行以 | 开头。连续若干行组成一张表。
     第一行当表头，第一列当行头，单元格之间用 | 分隔，首尾的 | 可有可无。 */
  function isTableRow(line) {
    return /^\s*\|/.test(line);
  }

  /* 行内竖线分隔的候选行：至少两格、格子不空、整行不带句读。
     只作入表候选，能不能成表还要看连续行数与列数是否一致。 */
  function pipeRow(line) {
    var s = String(line == null ? '' : line).trim();
    if (!s || isRuleRow(s)) return null;
    if (/[。；？]/.test(s)) return null;
    var cells = s.split(/\s*\|\s*/);
    if (cells.length < 2) return null;
    if (cells.some(function (c) { return !c || c.length > 24; })) return null;
    return cells;
  }

  function tableCells(line) {
    var s = String(line).trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
    return s.split('|').map(function (c) { return c.trim(); });
  }

  /* 分隔行 |---|---| 只是给人看的，排版时丢掉 */
  function isRuleRow(line) {
    return /^\s*\|[\s\-:|]+\|?\s*$/.test(line);
  }

  /* ---- 空格对齐手打的表格 ----
     有些题干不用竖线，直接拿空格把表格对齐（收益矩阵、汇率表、报酬表）。
     比例字体下这种文本必然错位，认出来交给表格渲染器画成真表。
     判据：连续 ≥2 行、每行有连续空白、列数一致
     （或表头少一列＝缺左上角格）、不含等号／句读／分值括注、
     首列不带冒号逗号、至少两行有两个以上数字型单元格。 */
  var STEM_SP = /[\u3000 ]+/;
  var STEM_NUM = /^[-−]?\d+(?:[.,\/][-−]?\d+)*$|^\(\s*[-−]?\d+\s*,\s*[-−]?\d+\s*\)$/;
  var STEM_PAREN = /[（(][^）)]{0,20}[）)]/g;

  function stemCells(line) {
    return String(line)
      .replace(/^[\s\u3000]+|[\s\u3000]+$/g, '')
      .split(STEM_SP)
      .filter(function (c) { return c; });
  }

  function isStemTable(rows) {
    if (!rows || rows.length < 2) return false;

    var n = rows.map(function (r) { return stemCells(r).length; });
    var same = n.every(function (v) { return v === n[0]; });
    var headShort = n.slice(1).every(function (v) { return v === n[1]; }) && n[0] === n[1] - 1;
    if (!(same || headShort)) return false;
    if (Math.min.apply(null, n) < 2) return false;

    var ok = rows.every(function (r) {
      var cs = stemCells(r);
      if (String(r).replace(STEM_PAREN, '').indexOf('=') > -1) return false;
      if (/[。；？]/.test(r)) return false;
      if (/（\d+分）/.test(r)) return false;
      if (cs.some(function (c) { return c.length > 24; })) return false;
      if (/[：，]/.test(cs[0])) return false;
      return true;
    });
    if (!ok) return false;

    return (
      rows.filter(function (r) {
        return stemCells(r).filter(function (c) { return STEM_NUM.test(c); }).length >= 2;
      }).length >= 2
    );
  }

  /* 表格两种写法都认：
     一、用 ［表格］…［/表格］ 包起来，契约里的原写法，好在能明确边界；
     二、直接连着写管道行，不加包裹，写起来短。 */
  var TABLE_OPEN = /^［\s*表格\s*］$/;
  var TABLE_CLOSE = /^［\s*\/\s*表格\s*］$/;

  function parse(text) {
    var out = [];
    var lines = String(text == null ? '' : text).split('\n');

    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();

      if (TABLE_OPEN.test(trimmed)) {
        var wrapped = [];
        i++;
        while (i < lines.length && !TABLE_CLOSE.test(lines[i].trim())) {
          if (lines[i].trim() && !isRuleRow(lines[i])) wrapped.push(tableCells(lines[i]));
          i++;
        }
        if (wrapped.length) out.push({ type: 'table', rows: wrapped });
        continue;
      }

      if (isTableRow(lines[i])) {
        var rows = [];
        while (i < lines.length && isTableRow(lines[i])) {
          if (!isRuleRow(lines[i])) rows.push(tableCells(lines[i]));
          i++;
        }
        i--;
        if (rows.length) out.push({ type: 'table', rows: rows });
        continue;
      }

      var seg = classify(lines[i]);
      if (!seg) continue;

      if (seg.type === 'p') {
        /* 答案正文一行就是一段，换行只跟着数据里的换行走；
           题干另走 parseStem，按小问编号拆行。 */
        out.push(seg);
        continue;
      }

      out.push(seg);
    }

    return out;
  }

  /* 题干专用：空格对齐的表格换成真表格，其余文本原样成段。
     单独一条路径，不进 parse()——只在题干里认这种表，
     答案正文里的矩阵照旧是文本，两边行为一致。 */
  function parseStem(text) {
    var lines = String(text == null ? '' : text).split('\n');
    var out = [];
    var buf = [];

    function flush() {
      if (!buf.length) return;
      /* 题干同样按小问编号拆行：逐行拆后用换行拼回，q-text 的 pre-wrap 显示成换行 */
      var parts = [];
      buf.forEach(function (line) {
        splitSubBreaks(line).forEach(function (p) { parts.push(p); });
      });
      out.push({ type: 'text', text: parts.join('\n') });
      buf = [];
    }

    var i = 0;
    while (i < lines.length) {
      if (!lines[i].trim()) {
        buf.push(lines[i]);
        i++;
        continue;
      }

      /* 行首 $$ 的整行是公式，判据与答案正文完全同一条（不带结尾符号）。
         题干和答案共用一份规则，数据从哪边搬过来都不会坏。 */
      if (lines[i].trim().indexOf('$$') === 0) {
        flush();
        /* 行首 $$ 开头的整行都是公式；尾部若误带成对结束符 $ 一并剥掉（同上）。 */
        out.push({ type: 'fm', text: lines[i].trim().slice(2).replace(/\$+$/, '').trim() });
        i++;
        continue;
      }

      /* 竖线表格：行首竖线，或行内用「 | 」分隔且连续 ≥2 行、列数一致，
         都画成真表，与答案正文同一套出口；分隔行 |---| 丢掉。
         判不成表时原行原样落回文本。 */
      if (isTableRow(lines[i]) || pipeRow(lines[i])) {
        var pstart = i;
        var prow = [];
        var pj = i;
        while (pj < lines.length && (isTableRow(lines[pj]) || pipeRow(lines[pj]))) {
          if (!isRuleRow(lines[pj])) prow.push(pipeRow(lines[pj]) || tableCells(lines[pj]));
          pj++;
        }
        var okTable = prow.length >= 2 && prow.every(function (r) { return r.length === prow[0].length; });
        flush();
        if (okTable) {
          out.push({ type: 'table', rows: prow });
          i = pj;
        } else {
          while (i < pj) { buf.push(lines[i]); i++; }
        }
        continue;
      }

      var j = i;
      var run = [];
      while (j < lines.length && lines[j].trim() && STEM_SP.test(lines[j].trim())) {
        run.push(lines[j]);
        j++;
      }

      if (run.length >= 2 && isStemTable(run)) {
        flush();
        var grid = run.map(stemCells);
        var width = Math.max.apply(null, grid.map(function (r) { return r.length; }));
        /* 表头少一列时左补空格子，缺的是左上角那格 */
        grid = grid.map(function (r) {
          if (r.length === width) return r;
          var pad = [];
          for (var k = 0; k < width - r.length; k++) pad.push('');
          return pad.concat(r);
        });
        out.push({ type: 'table', rows: grid });
        i = j;
      } else {
        buf.push(lines[i]);
        i++;
      }
    }

    flush();
    return out;
  }

  global.KB = global.KB || {};
  global.KB.Lines = {
    parse: parse,
    parseStem: parseStem,
    classify: classify,
    splitSubBreaks: splitSubBreaks,
    hang: hang,
    isStemTable: isStemTable,
    stemCells: stemCells,
    /* 小问标题加粗开关：页面挂载时按模块配置设置 */
    setSubHeading: function (on) { subHeadingOn = !!on; },
    SUB_MAX: SUB_MAX
  };
})(window);
