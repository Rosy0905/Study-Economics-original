/* 模块配置：一个模块一页，这份只管「简答专项（微观）」。 */

window.MODULE_CONFIG = {
  id: "5micro-short-answer",
  title: "简答专项（微观）",
  /* 页头长标题：与模块名分开，页头与入口卡可以各用各的文案 */
  pageTitle: "南开经济学 · 微观简答记忆卡",
  icon: "✏️",
  /* 标签页标题：整句直接用，不再拼后缀 */
  tab: "微观简答 · 记忆卡",

  answerMode: "inline",

  dataFile: "data/5micro-short-answer.js",

  qidPrefix: "Q",
  /* 小问标题自动加粗：本项目数据没适配，整条规则关掉 */
  subHeading: false,

  /* 筛选维度：key 是卡片字段名，parent 声明上级，fav 是收藏状态 */
  filters: [
    {
      "key": "section",
      "label": "专项"
    },
    {
      "key": "fav",
      "label": "⭐ 收藏",
      "type": "fav"
    }
  ]
};
