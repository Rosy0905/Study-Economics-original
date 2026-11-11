/* AI 答疑助手：装配门面。
   页面只留一行 KB.AI.mount()，DOM 骨架、事件绑定与状态机都在这里；
   能力分层在 engine/ai/ 其余模块，配置在 ai.config.js。 */

(function (global) {
  'use strict';

  var KB = global.KB || (global.KB = {});

  /* 骨架与原版逐字一致：类名与 id 是外部组件（存卡桥、返顶按钮）的契约。 */
  var HTML = ''
    + '<button class="ai-fab" id="aiFab" title="AI 答疑助手">'
    +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    +     '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
    +     '<circle cx="9" cy="10" r="1" fill="currentColor"/>'
    +     '<circle cx="15" cy="10" r="1" fill="currentColor"/>'
    +   '</svg>'
    + '</button>'
    + '<div class="ai-panel" id="aiPanel">'
    +   '<div class="ai-resize" id="aiResize" title="拖动调整大小"></div>'
    +   '<div class="ai-head">'
    +     '<div class="ai-head-l"><span class="ai-dot"></span><span id="aiHeadTitle">AI 答疑助手</span><button id="aiReadCard" class="ai-readcard" title="读取当前卡片"><span class="ai-rc-txt">读卡</span><svg class="ai-rc-on" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 10h6"/><path d="M7 14h4"/></svg><svg class="ai-rc-off" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 10h6"/><path d="M7 14h4"/><path d="M4 4l16 16"/></svg></button></div>'
    +     '<div class="ai-head-r">'
    +       '<button id="aiClear" title="清空对话"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>'
    +       '<button id="aiSetting" title="设置"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>'
    +       '<button id="aiShare" title="分享对话"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>'
    +       '<button id="aiClose" title="关闭"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>'
    +     '</div>'
    +   '</div>'
    +   '<div class="ai-config" id="aiConfig">'
    +     '<div class="ai-cfg-title">🔧 首次使用，先配置 API</div>'
    +     '<div class="ai-cfg-desc">所有配置仅保存在你自己的浏览器本地。</div>'
    +     '<div class="ai-cfg-field"><label>服务商</label><select id="cfgPreset"></select><div class="ai-cfg-hint" id="cfgPresetHint"></div></div>'
    +     '<div class="ai-cfg-field"><label>API 地址（Base URL）</label><input type="text" id="cfgBase" placeholder="https://api.deepseek.com/v1" /></div>'
    +     '<div class="ai-cfg-field"><label>模型名称</label><input type="text" id="cfgModel" placeholder="deepseek-chat" /><div class="ai-cfg-hint">💡 想让它“看懂图片”，请填支持视觉的模型：qwen-vl-max、glm-4v、gpt-4o 等</div></div>'
    +     '<div class="ai-cfg-field"><label>API Key</label><input type="text" id="cfgKey" class="ai-cfg-key" placeholder="sk-..." autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore="true" data-form-type="other" /><div class="ai-cfg-hint">🔒 只存在你本地浏览器</div></div>'
    +     '<div class="ai-cfg-field"><label>系统提示词（可改）</label><textarea id="cfgSystem" rows="10"></textarea></div>'
    +     '<button class="ai-save" id="aiSaveCfg">保存并开始使用</button>'
    +   '</div>'
    +   '<div class="ai-body hide" id="aiBody">'
    +     '<div class="ai-msgs" id="aiMsgs"></div>'
    +     '<div class="ai-progress" id="aiProgress">'
    +       '<div class="ai-progress-list" id="aiProgressList"></div>'
    +       '<div class="ai-progress-panel" id="aiProgressPanel">'
    +         '<div class="ai-progress-panel-inner" id="aiProgressPanelInner"></div>'
    +       '</div>'
    +     '</div>'
    +     '<div class="ai-input-wrap">'
    +       '<div class="ai-attach-bar" id="aiAttachBar"></div>'
    +       '<div class="ai-input-row">'
    +         '<textarea id="aiInput" rows="1" placeholder="输入问题…"></textarea>'
    +         '<button class="ai-attach-btn" id="aiAttachBtn" type="button" title="上传图片或文件（也可直接 Ctrl+V 粘贴、或把文件拖进来）">'
    +           '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    +             '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'
    +           '</svg>'
    +         '</button>'
    +         '<button class="ai-send" id="aiSend" type="button" title="发送"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></button>'
    +       '</div>'
    +       '<input type="file" id="aiFileInput" multiple accept="image/*,.txt,.md,.markdown,.csv,.json,.log,.tex,.py,.js,.ts,.c,.cpp,.java,.html,.css" style="display:none" />'
    +     '</div>'
    +   '</div>'
    +   '<div class="ai-share-bar" id="aiShareBar">'
    +     '<span class="ai-share-count" id="aiShareCount">已选 0 条</span>'
    +     '<button type="button" class="ai-share-all" id="aiShareAll">全选</button>'
    +     '<button type="button" class="ai-share-gen" id="aiShareGen" disabled>生成分享</button>'
    +     '<button type="button" class="ai-share-cancel" id="aiShareCancel">取消</button>'
    +   '</div>'
    + '</div>';

  function $(id) { return document.getElementById(id); }

  function mergeConfig(base, extra) {
    var out = Object.assign({}, base);
    Object.keys(extra || {}).forEach(function (k) {
      var v = extra[k];
      if (v && typeof v === 'object' && !Array.isArray(v) &&
          base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        out[k] = Object.assign({}, base[k], v);
      } else {
        out[k] = v;
      }
    });
    return out;
  }

  function mount(userConfig) {
    if (KB.__aiMounted) return KB.AI.instance;
    /* 配置与对话历史走内容层，读盘异步；没读完就挂会拿到空配置 */
    if (KB.Store && !KB.Store.isReady()) {
      KB.Store.ready().then(function () { mount(userConfig); });
      return null;
    }
    KB.__aiMounted = true;

    var cfg = mergeConfig(global.AI_CONFIG || {}, userConfig || {});
    /* 页面级覆盖：项目 id、卡片页判定、适配器、分类表 */
    cfg.storage = Object.assign({}, cfg.storage);

    var holder = document.createElement('div');
    holder.innerHTML = HTML;
    while (holder.firstChild) document.body.appendChild(holder.firstChild);

    var D = {
      fab: $('aiFab'), panel: $('aiPanel'), resizeHandle: $('aiResize'),
      closeBtn: $('aiClose'), clearBtn: $('aiClear'), settingBtn: $('aiSetting'),
      shareBtn: $('aiShare'), readCardBtn: $('aiReadCard'),
      configEl: $('aiConfig'), bodyEl: $('aiBody'), msgsEl: $('aiMsgs'),
      inputEl: $('aiInput'), sendBtn: $('aiSend'),
      attachBtn: $('aiAttachBtn'), fileInput: $('aiFileInput'),
      attachBar: $('aiAttachBar'), headTitle: $('aiHeadTitle'),
      cfgPreset: $('cfgPreset'), cfgPresetHint: $('cfgPresetHint'),
      cfgBase: $('cfgBase'), cfgModel: $('cfgModel'),
      cfgKey: $('cfgKey'), cfgSystem: $('cfgSystem'), saveCfgBtn: $('aiSaveCfg'),
      progress: $('aiProgress'), progressList: $('aiProgressList'),
      progressPanel: $('aiProgressPanel'), progressPanelInner: $('aiProgressPanelInner'),
      shareBar: $('aiShareBar'), shareCount: $('aiShareCount'),
      shareAll: $('aiShareAll'), shareGen: $('aiShareGen'), shareCancel: $('aiShareCancel')
    };

    var util = KB.AIUtil;
    var S = {
      cfg: null,
      history: [],
      isSharedView: false,
      sharedLinkBroken: false,
      sharedLinkReason: '',
      selecting: false,
      selectedSet: {},
      isStreaming: false,
      isPaused: false,
      streamFinished: false,
      streamToken: 0,
      controller: null,
      stickBottom: true,
      savedScrollTop: null,
      katexPendingRerender: false,
      pendingAttachments: [],
      subjects: (global.MYCARDS_CONFIG && Array.isArray(global.MYCARDS_CONFIG.subjects)
        ? global.MYCARDS_CONFIG.subjects
        : (global.MY_CARDS_SUBJECTS || ['微观', '宏观'])),
      typeState: {
        target: '', shown: '', timer: null, el: null,
        cursor: null, acc: '', continueBtn: null
      }
    };

    var A = {};
    var api = {};
    A.core = api;

    /* 分享链接先还原，再决定用哪份历史；分享视图不写本地记录。 */
    var shared = KB.AIShare.create({ cfg: cfg, util: util, S: S, D: D, A: A })
      .loadSharedConv();
    if (shared.history) S.history = shared.history;
    S.isSharedView = shared.shared;
    S.sharedLinkBroken = shared.broken;
    S.sharedLinkReason = shared.reason || '';
    if (S.isSharedView) {
      document.body.classList.add('shared-ai-view');
      document.title = '来自分享的对话';
      if (D.cfgKey) D.cfgKey.remove();
    }

    A.storage = KB.AIStorage.create({ cfg: cfg, util: util, S: S });
    S.cfg = A.storage.loadCfg();
    A.storage.autoUpgradeSystem(S.cfg);
    if (!S.isSharedView) S.history = A.storage.loadHistory();

    A.markdown = KB.AIMarkdown.create({ util: util });
    A.context = KB.AIContext.create({ cfg: cfg, util: util, S: S });
    A.attach = KB.AIAttach.create({ cfg: cfg, util: util, S: S, D: D, A: A });
    A.nav = KB.AINav.create({ cfg: cfg, util: util, D: D });
    A.messages = KB.AIMessages.create({ cfg: cfg, util: util, S: S, D: D, A: A });
    A.stream = KB.AIStream.create({ cfg: cfg, util: util, S: S, D: D, A: A });
    A.share = KB.AIShare.create({ cfg: cfg, util: util, S: S, D: D, A: A });

    /* ---------- 配置界面 ---------- */
    function initPresetSelect() {
      D.cfgPreset.innerHTML = Object.keys(cfg.presets).map(function (k) {
        return '<option value="' + k + '">' + cfg.presets[k].name + '</option>';
      }).join('');
      D.cfgPreset.value = S.cfg.preset || cfg.defaults.preset;
    }
    D.cfgPreset.addEventListener('change', function () {
      var p = cfg.presets[D.cfgPreset.value];
      if (!p) return;
      D.cfgBase.value = p.base || '';
      D.cfgModel.value = p.model || '';
      D.cfgPresetHint.textContent = p.hint || '';
    });
    function fillConfigForm() {
      D.cfgPreset.value = S.cfg.preset || cfg.defaults.preset;
      var p = cfg.presets[D.cfgPreset.value] || {};
      D.cfgBase.value = S.cfg.base || p.base || '';
      D.cfgModel.value = S.cfg.model || p.model || '';
      if (D.cfgKey) D.cfgKey.value = S.cfg.key || '';
      D.cfgSystem.value = S.cfg.system || cfg.systemDefault;
      D.cfgPresetHint.textContent = p.hint || '';
    }
    function hasValidCfg() { return S.cfg.key && S.cfg.base && S.cfg.model; }

    function showConfig() {
      if (S.isSharedView) return;
      try { S.savedScrollTop = D.msgsEl.scrollTop; } catch (e) {}
      D.configEl.classList.remove('hide');
      D.bodyEl.classList.add('hide');
      D.headTitle.textContent = 'AI 答疑助手 · 设置';
      fillConfigForm();
    }
    function showChat() {
      D.configEl.classList.add('hide');
      D.bodyEl.classList.remove('hide');
      D.headTitle.textContent = 'AI 答疑助手';
      S.stickBottom = false;
      A.messages.renderHistory();
      global.requestAnimationFrame(function () {
        setTimeout(function () {
          try {
            if (S.isSharedView) {
              D.msgsEl.scrollTop = 0;
            } else {
              D.msgsEl.scrollTop = D.msgsEl.scrollHeight;
              if (S.savedScrollTop !== null) {
                D.msgsEl.scrollTop = Math.min(S.savedScrollTop,
                  Math.max(0, D.msgsEl.scrollHeight - D.msgsEl.clientHeight));
              }
            }
            var gap = D.msgsEl.scrollHeight - D.msgsEl.scrollTop - D.msgsEl.clientHeight;
            S.stickBottom = gap < 60;
          } catch (e) {}
          A.nav.build();
          if (!S.isSharedView) D.inputEl.focus({ preventScroll: true });
        }, 60);
      });
    }

    /* ---------- 面板开关与尺寸 ---------- */
    var lockedScrollY = 0;
    function lockBodyScroll() {
      lockedScrollY = global.scrollY || document.documentElement.scrollTop || 0;
      document.body.style.setProperty('--ai-lock-y', (-lockedScrollY) + 'px');
      document.body.classList.add('ai-lock-scroll');
    }
    function unlockBodyScroll() {
      document.body.classList.remove('ai-lock-scroll');
      document.body.style.removeProperty('--ai-lock-y');
      global.scrollTo(0, lockedScrollY);
    }

    /* 关窗后浮球延迟恢复可点，避免紧接着点页面右下角时把窗口重新打开。 */
    var fabRevealTimer = null;

    function openPanel() {
      if (fabRevealTimer !== null) { clearTimeout(fabRevealTimer); fabRevealTimer = null; }
      D.panel.classList.add('show');
      D.fab.classList.add('hidden');
      if (!S.isSharedView && util.isMobile(cfg)) lockBodyScroll();
      if (!S.isSharedView) A.storage.applySavedSize(D.panel);
      if (S.isSharedView || hasValidCfg()) showChat();
      else showConfig();
      A.share.setSharedReadOnly(S.isSharedView);
      A.stream.updateInputPlaceholder();
      if (A.cards && A.cards.refreshSavedStates) A.cards.refreshSavedStates();
      setTimeout(function () { A.nav.build(); }, 260);
    }

    function closePanel() {
      /* 生成中关窗不等于作废：把已收到的部分存成一条完整消息。 */
      if (S.isStreaming) {
        S.streamToken++;
        if (S.controller) { try { S.controller.abort(); } catch (e) {} S.controller = null; }
        A.stream.finalizeStream({ name: 'AbortError' });
      } else {
        A.stream.stopStream();
      }
      D.panel.classList.remove('show');
      if (fabRevealTimer !== null) clearTimeout(fabRevealTimer);
      fabRevealTimer = setTimeout(function () {
        fabRevealTimer = null;
        if (!D.panel.classList.contains('show')) D.fab.classList.remove('hidden');
      }, 300);
      if (!S.isSharedView && util.isMobile(cfg)) unlockBodyScroll();
      try { S.savedScrollTop = D.msgsEl.scrollTop; } catch (e) {}
    }

    function startResize(e) {
      if (util.isMobile(cfg)) return;
      e.preventDefault();
      e.stopPropagation();
      var rect = D.panel.getBoundingClientRect();
      var startX = e.clientX, startY = e.clientY;
      var startW = rect.width, startH = rect.height;
      var minW = cfg.limits.minW, minH = cfg.limits.minH;
      D.resizeHandle.classList.add('dragging');
      document.body.classList.add('ai-resizing');
      function onMove(ev) {
        var dx = ev.clientX - startX;
        var dy = ev.clientY - startY;
        var w = Math.max(minW, Math.min(startW - dx, global.innerWidth - 20));
        var h = Math.max(minH, Math.min(startH - dy, global.innerHeight - 20));
        D.panel.style.setProperty('--ai-panel-w', w + 'px');
        D.panel.style.setProperty('--ai-panel-h', h + 'px');
      }
      function onUp() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        D.resizeHandle.classList.remove('dragging');
        document.body.classList.remove('ai-resizing');
        A.storage.saveSize(D.panel);
        setTimeout(function () { A.nav.build(); }, 50);
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    }

    /* ---------- 头部按钮 ---------- */
    D.fab.addEventListener('click', openPanel);
    D.closeBtn.addEventListener('click', function () {
      if (!S.isSharedView) closePanel();
    });
    D.settingBtn.addEventListener('click', function () {
      if (S.isSharedView) return;
      if (D.configEl.classList.contains('hide')) showConfig();
      else if (hasValidCfg()) showChat();
    });
    D.clearBtn.addEventListener('click', function () {
      if (S.isSharedView || !S.history.length) return;
      KB.UI.confirm({
        title: '清空对话',
        message: '确定清空所有对话记录吗？此操作不可恢复。',
        okText: '清空', cancelText: '取消', danger: true
      }).then(function (ok) {
        if (!ok) return;
        S.history = [];
        A.storage.saveHistory(S.history);
        A.messages.renderHistory();
        util.toast('已清空对话');
      });
    });
    D.shareBtn.addEventListener('click', function () {
      if (S.isSharedView) { util.toast('分享链接为只读，无法再分享'); return; }
      A.share.enterSelectMode();
    });
    A.context.syncReadCardUI(D.readCardBtn);
    D.readCardBtn.addEventListener('click', function () {
      if (S.isSharedView) return;
      S.cfg.readCard = (S.cfg.readCard === false);
      A.storage.saveCfg(S.cfg);
      A.context.syncReadCardUI(D.readCardBtn);
      A.context.setPending(S.cfg.readCard ? 'on' : 'off');
      if (S.cfg.readCard === false) A.context.resetFocus();
      A.stream.updateInputPlaceholder();
      util.toast(S.cfg.readCard ? '已开启读卡 · 会读取当前卡片' : '已关闭读卡 · 只按你说的话和截图回答');
    });

    D.saveCfgBtn.addEventListener('click', function () {
      var base = D.cfgBase.value.trim().replace(/\/+$/, '');
      var model = D.cfgModel.value.trim();
      var key = D.cfgKey ? D.cfgKey.value.trim() : S.cfg.key;
      var system = D.cfgSystem.value.trim() || cfg.systemDefault;
      if (!base) { alert('请填写 API 地址'); return; }
      if (!model) { alert('请填写模型名称'); return; }
      if (!key) { alert('请填写 API Key'); return; }
      Object.assign(S.cfg, {
        preset: D.cfgPreset.value, base: base, model: model, key: key,
        system: system, readCard: S.cfg.readCard !== false
      });
      A.storage.saveCfg(S.cfg);
      showChat();
      util.toast('配置已保存 ✓');
    });

    D.resizeHandle.addEventListener('pointerdown', startResize);
    global.addEventListener('resize', function () {
      if (util.isMobile(cfg)) {
        D.panel.style.removeProperty('--ai-panel-w');
        D.panel.style.removeProperty('--ai-panel-h');
      } else {
        var rect = D.panel.getBoundingClientRect();
        if (rect.width > global.innerWidth - 20) {
          D.panel.style.setProperty('--ai-panel-w', (global.innerWidth - 20) + 'px');
        }
        if (rect.height > global.innerHeight - 20) {
          D.panel.style.setProperty('--ai-panel-h', (global.innerHeight - 20) + 'px');
        }
      }
      A.nav.syncNavMetrics();
      A.stream.updateInputPlaceholder();
    });

    /* 页面滚动会改变可见卡片，读卡标签跟着刷新；面板关着时不算，滚动期间合并到 120ms 一次。 */
    var labelScrollTimer = null;
    global.addEventListener('scroll', function () {
      if (!D.panel.classList.contains('show') || S.isSharedView) return;
      if (labelScrollTimer !== null) return;
      labelScrollTimer = setTimeout(function () {
        labelScrollTimer = null;
        A.stream.updateInputPlaceholder();
      }, 120);
    }, { passive: true });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || S.isSharedView) return;
      var lb = document.querySelector('.ai-lightbox');
      if (lb) { lb.remove(); return; }
      if (document.querySelector('.kb-confirm-mask')) return;
      if (D.panel.classList.contains('show')) closePanel();
    });

    /* ---------- 初始化 ---------- */
    A.context.bindFocusTracking();
    A.attach.bindEvents();
    A.nav.bindEvents();
    A.stream.bindEvents();
    A.share.bindEvents();
    A.messages.bindScroll();

    initPresetSelect();
    fillConfigForm();
    A.attach.renderAttachBar();
    A.stream.updateInputPlaceholder();

    /* 可选组件：存成卡片。缺门面时安静跳过，不影响聊天。 */
    if (cfg.features.saveAsCard && !S.isSharedView) {
      A.cards = KB.AICards.create({
        cfg: cfg, util: util, S: S, D: D,
        isCardsPage: !!(userConfig && userConfig.isCardsPage),
        saveHistory: function () { try { A.storage.saveHistory(S.history); } catch (e) {} }
      });
      A.cards.mount();
    }

    /* 公式渲染器迟到时补渲染；流式期间只记一笔，收尾后整屏重绘。 */
    global.__AI_RERENDER__ = function () {
      if (S.isStreaming) { S.katexPendingRerender = true; return; }
      A.messages.renderHistory();
    };

    /* 本地 vendor 缺失时按原版口径退 CDN，加载完成后走补渲染钩子换掉土黄源码。
       vendor 完好时不进这段，离线时 CDN 请求自然失败，公式维持 fallback。 */
    (function ensureKatex() {
      if (global.katex || !cfg.katexCdn) return;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cfg.katexCdn + 'katex.min.css';
      document.head.appendChild(link);
      var s = document.createElement('script');
      s.src = cfg.katexCdn + 'katex.min.js';
      s.onload = function () {
        if (global.__AI_RERENDER__) global.__AI_RERENDER__();
      };
      document.head.appendChild(s);
    })();

    global.__AI_SEES__ = function () {
      var pageCtx = (S.cfg.readCard === false) ? '' : A.context.buildPageContext(false);
      var note = A.context.takeReadCardNote(A.context.pickCardLabel(pageCtx), true);
      var s = S.cfg.system +
        (pageCtx ? '\n\n' + cfg.prompts.contextHead + '\n' + pageCtx : '') +
        (note ? '\n\n' + note : '');
      console.log(s);
      return s;
    };
    global.__AI_DIAG__ = function () {
      var t = A.context.buildPageContext();
      console.log(t);
      return t;
    };

    if (S.isSharedView) openPanel();
    if (S.sharedLinkBroken) {
      openPanel();
      util.toast(S.sharedLinkReason === 'too-long'
        ? '⚠️ 分享链接超长，转发时多半被截断了，请让对方重新生成'
        : '⚠️ 分享链接不完整，可能转发时被截断了，请让对方重新生成');
    }

    Object.assign(api, {
      openPanel: openPanel,
      closePanel: closePanel,
      showConfig: showConfig,
      showChat: showChat,
      hasValidCfg: hasValidCfg,
      send: A.stream.send,
      renderHistory: A.messages.renderHistory,
      state: S,
      dom: D,
      modules: A
    });
    KB.AI.instance = api;
    return api;
  }

  KB.AI = { mount: mount, instance: null };
})(window);
