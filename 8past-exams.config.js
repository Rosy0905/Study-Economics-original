/* 真题页的页面级覆盖：项目身份沿用 project.config.js，
   本页只覆盖跟别人不一样的几项。 */

window.PROJECT_CONFIG = Object.assign({}, window.PROJECT_CONFIG || {}, {
  features: { notes: true, edit: false, selftest: true },
  stats: [
    { key: 'total', icon: '📚', label: '总题' },
    { key: 'fav', icon: '⭐', label: '收藏' },
    { key: 'learned', icon: '🧩', label: '已做', hidden: true }
  ]
});

/* 模块配置：一个模块一页，这份只管「历年真题」。 */

window.MODULE_CONFIG = {
  id: "8past-exams",
  title: "历年真题",
  /* 页头长标题：与模块名分开，页头与入口卡可以各用各的文案 */
  pageTitle: "南开经济学 · 历年真题记忆卡",
  icon: "📜",
  /* 标签页标题：整句直接用，不再拼后缀 */
  tab: "历年真题 · 记忆卡",

  answerMode: "book",

  /* 配了答案册才有页头入口与 📖 深链 */
  answerBook: { page: 'answers.html' },

  /* 卡片头部徽标：字段 + 色调 */
  cardTags: [
    { key: 'subject', tone: '' },
    { key: 'paper', tone: 'tag-blue' },
    { key: 'type', tone: 'tag-sand' }
  ],

  dataFile: "data/8past-exams.js",

  qidPrefix: "第",
  qidSuffix: "题",
  /* 小问标题自动加粗：本项目数据没适配，整条规则关掉 */
  subHeading: false,

  /* 筛选维度：key 是卡片字段名，parent 声明上级，fav 是收藏状态 */
  filters: [
    {
      "key": "subject",
      "label": "专业",
      "allLabel": "全部专业"
    },
    {
      "key": "paper",
      "label": "套卷",
      "parent": "subject",
      /* 上级未选时不锁下拉，只按上级取值收窄选项 */
      "requireParent": false,
      "pin": ["真题说明"],
      "allLabel": "全部套卷"
    },
    {
      "key": "type",
      "label": "题型",
      "order": ["说明", "简答", "计算", "计量", "论述"],
      "labelMap": {
        "说明": "真题说明",
        "简答": "简答题",
        "计算": "计算题",
        "计量": "计量题",
        "论述": "论述题"
      },
      "allLabel": "全部题型"
    },
    {
      "key": "fav",
      "label": "⭐ 收藏",
      "type": "fav"
    }
  ]
};
