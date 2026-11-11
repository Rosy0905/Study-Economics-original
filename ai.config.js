/* AI 答疑助手：服务商、提示词、上限、存储键与页面适配。
   换项目只改这一份，引擎不认识具体科目与页面结构。 */

window.AI_CONFIG = {
  /* 面板挂载到哪些页面由各页自己决定，这里只给分享页与我的卡片页的相对路径。 */
  sharePage: 'share.html',
  myCardsPage: 'mycards.html',
  myCardsOpenInNewTab: true,

  /* 存储：框架键带项目 id，兼容键供按原版键名读取的模块使用。
     对话历史、尺寸、提示词版本双写；配置只写框架键，读取时框架键优先、兼容键兜底。
     AI 是全站共享组件，项目 id 在这里固定，不跟随单页的 PROJECT_CONFIG，
     否则各页会各存一份历史、存卡也会落到别的项目的键上。 */
  storage: {
    framePrefix: 'kb',
    projectId: 'eco',
    cfg: 'cfg',
    history: 'history',
    size: 'size',
    systemVersion: 'sysver',
    legacyHistory: 'ai_assistant_history_v1',
    legacyCfg: 'ai_assistant_cfg_v1',
    legacySize: 'ai_assistant_size_v1',
    legacySysVer: 'ai_assistant_sys_ver',
    cardsLastCfg: 'ai_cards_last_cfg'
  },

  systemVersion: 'v7',

  presets: {
    deepseek: { name: 'DeepSeek（推荐）', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', hint: '便宜好用 → platform.deepseek.com' },
    zhipu:    { name: '智谱 GLM',       base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', hint: 'glm-4-flash 免费；看图填 glm-4v → open.bigmodel.cn' },
    qwen:     { name: '通义千问',       base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', hint: '阿里云 → dashscope.aliyun.com；看图填 qwen-vl-max' },
    moonshot: { name: 'Kimi (Moonshot)', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', hint: '长文本 → platform.moonshot.cn' },
    custom:   { name: '自定义（OpenAI 兼容）', base: '', model: '', hint: '兼容 /chat/completions 的接口' }
  },

  defaults: {
    preset: 'deepseek',
    base: '',
    model: '',
    key: '',
    readCard: true
  },

  systemDefault: [
    '你是南开大学经济学考研（847经济学）的专属答疑助手，只讲微观经济学和宏观经济学两门课。',
    '',
    '【覆盖范围】',
    '微观：消费者行为、生产者行为、完全竞争/垄断/垄断竞争/寡头、博弈论、要素市场、一般均衡与福利经济学、市场失灵。',
    '宏观：宏观经济数据、IS-LM、AD-AS、开放经济、失业与通胀、菲利普斯曲线、经济增长、宏观经济政策争论、宏观流派、消费与投资微观基础。',
    '',
    '【回答方式】',
    '（1）概念类：先给精准定义，再讲经济学直觉，必要时画图或列式，最后给考研答题要点。',
    '（2）推导类：分步推导，每步标注依据，关键结论加粗。',
    '（3）计算类：按"列式 → 求解 → 说明经济含义"三步走，标注易错点。',
    '（4）对比类：必须用表格。',
    '（5）答题类：按"总—分—总"给框架。',
    '',
    '【关于用户上传的图片与文件】',
    '用户可能上传题目截图、手写笔记照片、讲义图片或文本文件。',
    '请先看清图片/文件里的题目原文再作答，不要凭猜测编题。',
    '若图片模糊、被截断或关键信息缺失，直接说明"这里看不清/缺了哪一部分"，请用户补充，不要硬答。',
    '若图片内容与页面卡片题目相关，可结合卡片上下文一起回答。',
    '',
    '【卡片指代规则】',
    '提到用户在看的内容时，一律用卡片的【标签】指代。',
    '若上下文里出现"焦点已切换"，说明用户已经换题，直接按新的标签回答。用户说“看这张”默认是目前标签的卡片。',
    '',
    '【格式要求】',
    '· 所有数学公式用 LaTeX：行内 $...$，独立 $$...$$，不要用 Unicode 符号拼公式',
    '· 对比、分类、总结类信息用 Markdown 表格',
    '· 小标题一级用 `##`、二级用 `###`；正文分点层级固定为第一层 `（1）`、第二层 `①`、第三层 `a.`（任何层级都不得使用 `-`、`*`、`+`！），关键词用 **加粗**',
    '· 不要输出 --- 分割线，用空行或小标题分隔章节即可',
    '· 题目出现含根号的无理数结果，不需要主动化为小数',
    '',
    '【学习辅助】',
    '- 遇到容易混淆的概念，主动做对比',
    '- 遇到高频考点，主动提醒"这是高频考点，结论要背下来"',
    '',
    '【风格】',
    '简洁、直击要点、有分寸感。不啰嗦、不注水、不重复用户的话。学术严谨，但语气亲切。'
  ].join('\n'),

  /* 读卡开关的三种状态提示，拼在 system 提示末尾。 */
  prompts: {
    offToggle:
      '【★★★ 读卡开关刚刚关闭（本条优先于上文所有与卡片相关的规则）★★★】\n'
      + '用户刚刚关掉了读卡。本轮你不会收到任何卡片内容，也不知道用户在看哪一张卡。\n'
      + '因此上文【卡片指代规则】，以及「可结合卡片上下文一起回答」等涉及卡片的规则，一律不适用。\n'
      + '不要猜测、不要编造，也不要复述之前对话里出现过的卡片标签或题目，那些内容已作废。\n'
      + '若用户问「这张卡/这道题怎么答」而你手头没有题目原文，直接告诉他读卡已关闭、'
      + '请他把题目发你或点开读卡，不要硬答。\n'
      + '只依据用户本条消息的文字与上传的图片/文件作答。\n',
    offSteady:
      '【★★★ 读卡开关：已关闭（本条优先于上文所有与卡片相关的规则）★★★】\n'
      + '本轮不附带任何卡片内容，也不知道用户在看哪一张卡。上文【卡片指代规则】等涉及卡片的规则一律不适用，'
      + '不要猜、不要编、不要引用之前对话里的卡片内容。\n'
      + '用户问「这张卡怎么答」而没有题目原文时，直接告诉他读卡已关闭、请他把题目发你或点开读卡；'
      + '只依据用户本条文字与图片/文件作答。',
    contextHead: '===== 当前页面上下文 =====',
    uniqueRule:
      '【★★★ 唯一判定标准：下面「当前卡片」就是用户此刻屏幕上正在看的那张，以它的【标签】为准。'
      + '对话历史里出现过的任何其他标签、题号、"第N张"一律作废，绝对不要再说"还在看第几张"。★★★】'
  },

  /* 页面上下文：选择器与适配器都由配置注入，引擎不认识具体页面类名。 */
  context: {
    titleSelector: '.app-header h1, header h1, h1',
    cardSelectors: ['.card-item', '[class*="card-item"]', '.question-card', '[data-card]'],
    questionSelector: '.q-text',
    labelSelector: '.card-header .label',
    answerSelector: '.card-answer.open .answer-inner',
    noteSelector: '.card-note-area .note-editor',
    notePlaceholder: '点击写下笔记',
    openSelector: '.card-answer.open, .card-note-area.open',
    maskSelector: '.st-mask',
    questionClickSelector: '.card-question',
    cardSelector: '.card-item',
    /* 筛选器由页面配置生成，首项的值为空串；allValue 写 'all' 即兼容旧口径。 */
    filterSelectors: [
      { key: 'select[data-key="subject"]', label: '筛选·专业', allValue: '' },
      { key: 'select[data-key="paper"]', label: '筛选·套卷', allValue: '' }
    ],
    budgetTotal: 10000,
    questionLimit: 1200,
    answerMin: 2000,
    answerMax: 9000,
    noteLimit: 1500,
    otherCards: 2,
    otherQuestionChars: 60,
    adapter: null,
    focusProvider: null
  },

  limits: {
    maxFiles: 6,
    maxImgBytes: 12 * 1024 * 1024,
    maxTxtBytes: 2 * 1024 * 1024,
    maxTxtChars: 20000,
    imgMaxDim: 1200,
    imgQuality: 0.82,
    maxImagesReq: 6,
    apiRecentMsgs: 20,
    temperature: 0.6,
    mobileWidth: 640,
    minW: 300,
    minH: 240,
    navGap: 14,
    typeStep: 30,
    shareLinkMax: 16000,
    shareImageWidth: 720,
    shareImageMaxHeight: 14000,
    shareImageScaleLimit: 13000
  },

  /* 本地 vendor 缺失时按原版口径退到同一 CDN；vendor 完好或离线时不会触发。 */
  katexCdn: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/',

  share: {
    /* 本地副本优先，离线也能出图；两个 CDN 只在本地文件缺失时兜底 */
    html2canvasUrls: [
      'vendor/html2canvas/html2canvas.min.js',
      'https://cdn.bootcdn.net/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
      'https://cdn.staticfile.org/html2canvas/1.4.1/html2canvas.min.js'
    ],
    html2canvasTimeout: 12000,
    fileNamePrefix: 'AI分享_',
    downloadedTip: '由 AI 答疑助手生成 · 仅供学习交流'
  },

  features: {
    saveAsCard: true,
    saveAsCardDefaultSubject: '微观'
  },

  messages: {
    empty: '有什么想问的？',
    sharedBanner: '📖 这是分享的对话片段（仅含对方选中的部分，只读）',
    requestFailed: '❌ 请求失败：',
    failureReasons: '<br><br>常见原因：<br>· API Key 错误或余额不足<br>· Base URL 或模型名填错<br>· 网络无法访问该接口<br>· 服务商未开放浏览器直连（需换服务商或走代理）<br>· 上传了图片但当前模型不支持视觉（请换 qwen-vl-max / glm-4v / gpt-4o 等）',
    noReply: '未收到回复，请检查 API Key、模型名称或账户余额。'
  }
};
