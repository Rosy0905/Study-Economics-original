/* 答案正文段落层：把一条答案的纯文本切成带类型的段落。
   与卡片的行分类分开——卡片答案只按「这一行是什么」粗分六类；
   答案册还多两层结构：区块（【补充题】【知识梳理】）会改块内的判据，
   整行【标签】、提示栏、公式块、表格块各有自己的写法与样式，
   判据数量与嵌套规则都不是一个量级，所以单独一份，不塞进 lines.js。

   数据侧的写法约定（录入脚本按这个生成）：
   - 行首 `!` 是转录前缀，没有样式含义，剥掉后按常规判
   - 行首 `#` 强制本行按小问标题排（加粗），给字数超判据但确实是标题的行用
   - 行首 `~` 强制本行按正文排（一律不加粗），与 `#` 相对
   - ［表格］…［/表格］ 之间每行一条数据，单元格用半角 | 分隔，首行为表头
   - ［公式］…［/公式］ 之间各行合并成一个公式块，不做逐行判定
   - 【提示】【校注】【注】【命题背景】【命题方式】【热点背景】【补充】属提示栏
   - 只有【补充题】区块内，行首「答／解／证明／证」才成为【答】【解】【证】标签
   - 【知识梳理】【知识总结】里，无标点的短行才是分节标题，块内（1）（2）回归正文 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});
  var esc = function (s) { return KB.escape(s); };

  /* ---- 行首判据 ---- */

  var RE_DA = /^(答|解|证明|证)[:：]\s*/;
  var RE_TIP =
    /^【((?:[^】]{0,12})?(?:提示|校注|注|命题背景|命题方式|热点背景|补充)\s*\d{0,2})】([\s\S]*)$/;
  var RE_AH_LINE = /^\s*【([^【]+?)】\s*$/;
  var RE_TAG_HEAD = /^\s*(【[^】]{1,20}】)\s*(\S.*)$/;
  var RE_NUM = /^(（[0-9一二三四五六七八九十]{1,3}）|[\u2460-\u2469]|第[一二三四五六七八九十]{1,2}，)/;
  var RE_DI = /^第[一二三四五六七八九十]+，/;
  var RE_SUB = /^（[0-9一二三四五六七八九十]{1,3}）/;

  var RE_TBL_OPEN = /^［\s*表格\s*］$/;
  var RE_TBL_CLOSE = /^［\s*\/\s*表格\s*］$/;
  var RE_FM_OPEN = /^［\s*公式\s*］$/;
  var RE_FM_CLOSE = /^［\s*\/\s*公式\s*］$/;

  /* ---- 公式行 ---- */

  /* 纯公式行：长度有限、有关键关系符、整行没有汉字、结尾不是引导句。
     带中文的「当I(t)=…时」「从而…」一律算正文——中文衬线体缺字形，排进色块会缺字。 */
  function isFormula(t) {
    if (!t || t.length > 110) return false;
    /* 分段函数的大括号组首行（X={ / Y={）与后续各行连成一块 */
    if (/^[A-Za-z][A-Za-z0-9_^']*\s*=\s*\{$/.test(t)) return true;
    if (/[：:]$/.test(t)) return false;
    if (!/[=≈≥≤≠<>]/.test(t) && !/^(max|min|s\.t\.)/i.test(t)) return false;
    if (/（[^）]*）[。.]?$/.test(t)) return false;
    if (/[\u4e00-\u9fa5][：:]/.test(t)) return false;
    var cn = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
    if (cn > 0) return false;
    var rest = t.replace(/[\u4e00-\u9fa5\s，。；：、""''（）()【】,]/g, '');
    return rest.length >= 4 && /[A-Za-z0-9]/.test(rest);
  }

  /* 公式块里的中文换回正文字体，行尾残留的顿号逗号去掉 */
  function fmHtml(t) {
    var text = String(t).replace(/[，。；、]+$/, '');
    return esc(text).replace(/([\u4e00-\u9fa5，。；：、]+)/g, '<span class="fm-cn">$1</span>');
  }

  /* ---- 表格块 ---- */

  /* 单元格里的 __x__ 是原书用下划线标出的重点，排成加粗 */
  function cellHtml(text) {
    return esc(text).replace(/__([\s\S]+?)__/g, '<b>$1</b>');
  }

  function tableHtml(rows) {
    if (!rows || !rows.length) return '';
    return KB.Table.render(rows, cellHtml);
  }

  /* ---- 主流程 ---- */

  function render(text) {
    var lines = String(text || '（暂无答案）').split('\n');
    var out = '';
    var gap = false; // 上一行是空行：用来区分「换段」与「换行」
    var bc = false; // 已进入【补充题】：块内解答行首的「答／解／证明／证」成为标签
    var kn = false; // 已进入【知识梳理】：块内（N）不加粗，无序号短行才是分节标题
    var tbl = null; // 正在收集表格行
    var fmBlk = null; // 正在收集公式块

    /* 段间距只加在段与段之间；答案区第一个元素贴「参考答案」标签，不留上边距。
       块级段落（小标题、公式、图示、提示栏）本身自成一段，也带 par。 */
    function emit(cls, html, blk) {
      var isFirst = out === '';
      var c = (cls || '') + ((gap || blk) && !isFirst ? ' par' : '');
      out += '<p' + (c.trim() ? ' class="' + c.trim() + '"' : '') + '>' + html + '</p>';
      gap = false;
    }

    lines.forEach(function (raw) {
      var t = raw.replace(/\s+$/, '');

      /* 表格块：块内空行没有意义，直接跳过，免得被 gap 逻辑打断 */
      if (tbl) {
        if (RE_TBL_CLOSE.test(t.trim())) {
          out += tableHtml(tbl);
          tbl = null;
          gap = false;
          return;
        }
        if (t.trim()) {
          tbl.push(t.split('|').map(function (c) { return c.trim(); }));
        }
        return;
      }

      if (RE_TBL_OPEN.test(t.trim())) {
        tbl = [];
        gap = false;
        return;
      }

      /* 公式块：块内各行合并成一块统一判——纯希腊字母行也该有底色 */
      if (fmBlk) {
        if (RE_FM_CLOSE.test(t.trim())) {
          emit('fm', fmHtml(fmBlk.join('\n')), true);
          fmBlk = null;
          return;
        }
        if (t.trim()) fmBlk.push(t.trim());
        return;
      }

      if (RE_FM_OPEN.test(t.trim())) {
        fmBlk = [];
        gap = false;
        return;
      }

      if (!t.trim()) {
        gap = true;
        return;
      }

      /* 转录前缀「!」：无样式含义，剥掉后按常规判据走 */
      var mBang = t.match(/^!\s*(.+)$/);
      if (mBang) t = mBang[1];

      /* 行首「#」强制按小问标题排 */
      var mForce = t.match(/^#\s*(.+)$/);
      if (mForce) {
        emit('sub', esc(mForce[1].trim()), true);
        return;
      }

      /* 行首「~」强制按正文排 */
      var mPlain = t.match(/^~\s*(.+)$/);
      if (mPlain) {
        var pt = mPlain[1].trim();
        emit(RE_DI.test(pt) ? 'lv3' : '', esc(pt), RE_NUM.test(pt));
        return;
      }

      /* 解答起头：补充题区块内成【答】【解】【证】标签，区块外一律剥掉前缀 */
      var mDa = t.match(RE_DA);
      if (mDa) {
        var kind = mDa[1];
        if (bc && (kind === '证明' || kind === '证')) {
          emit('', '<span class="ah-tag">【证】</span>' + esc(t.slice(mDa[0].length)), true);
          return;
        }
        if (bc && (kind === '解' || kind === '答')) {
          emit('', '<span class="ah-tag">【' + kind + '】</span>' + esc(t.slice(mDa[0].length)), true);
          return;
        }
        t = t.slice(mDa[0].length);
        if (!t.trim()) {
          gap = true;
          return;
        }
      }

      /* 图示／表格占位：同款浅底块。判据与 lines.js 的 classify 同一套，
         两处同步改才不会一边出一类块 */
      if (/^［\s*此处有(?:图示|表格)/.test(t) || /^【此处有图示】/.test(t)) {
        emit(t.trim() === '【此处有图示】' ? 'fig fig-compact' : 'fig', esc(t), true);
        return;
      }

      /* 提示栏：提示、校注、命题背景一类的说明，跟在正文后面，只留一个小标签 */
      var mTip = t.match(RE_TIP);
      if (mTip) {
        emit(
          'ans-tip',
          '<b>【' + esc(mTip[1].replace(/\s+/g, '')) + '】</b>' + esc(mTip[2]),
          true
        );
        return;
      }

      /* 整行只有一个【标签】：它就是区块标题，同时切换块内判据 */
      var mAh = t.match(RE_AH_LINE);
      if (mAh) {
        var tag = mAh[1].replace(/\s+/g, '');
        if (tag === '补充题') {
          bc = true;
          kn = false;
        }
        if (tag === '知识梳理' || tag === '知识总结') {
          kn = true;
          bc = false;
        }
        if (/^(命题背景|命题方式|热点背景|补充[:：]|补充$)/.test(tag)) {
          emit('ans-tip', '<b>【' + esc(mAh[1]) + '】</b>', true);
          return;
        }
        emit('ah', '【' + esc(mAh[1]) + '】');
        return;
      }

      /* 行首【标签】后面还跟着正文：只把标签加粗，正文照排 */
      var mTag = t.match(RE_TAG_HEAD);
      if (mTag) {
        if (/补充题/.test(mTag[1])) {
          bc = true;
          kn = false;
        }
        if (/知识梳理|知识总结/.test(mTag[1])) {
          kn = true;
          bc = false;
        }
        emit('', '<span class="ah-tag">' + esc(mTag[1]) + '</span>' + esc(mTag[2]));
        return;
      }

      /* 一行数据渲染一段，不自动拆行——断行由数据源控制 */
      if (isFormula(t)) {
        emit('fm', fmHtml(t));
        return;
      }

      /* 小问标题：（N）开头、无句读、不长的行。补充题区块内不加粗 */
      if (isSubHead(t)) {
        if (!bc && !kn) {
          emit('sub', esc(t), true);
          return;
        }
      } else if (kn && !/[。！？；：，、]/.test(t) && t.replace(/\s+/g, '').length <= 16) {
        /* 知识梳理里的无序号短行才是分节标题，缩进与正文齐平、不外凸 */
        emit('sub knhead', esc(t), true);
        return;
      }

      emit(RE_DI.test(t.trim()) ? 'lv3' : '', esc(t), RE_NUM.test(t.trim()));
    });

    return out;
  }

  function isSubHead(t) {
    if (!RE_SUB.test(t)) return false;
    var body = t.replace(RE_SUB, '');
    if (!body.trim()) return false;
    if (/[。！？；]/.test(body)) return false;
    return body.length <= 30;
  }

  KB.Answer = { render: render, isFormula: isFormula };
})(window);
