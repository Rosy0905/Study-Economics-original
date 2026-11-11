/* 模块配置：一个模块一页，这份只管「背诵（宏观）」。 */

window.MODULE_CONFIG = {
  id: "2macro-recitation",
  title: "背诵（宏观）",
  /* 页头长标题：与模块名分开，页头与入口卡可以各用各的文案 */
  pageTitle: "南开经济学 · 宏观背诵手册记忆卡",
  icon: "📘",
  /* 标签页标题：整句直接用，不再拼后缀 */
  tab: "宏观背诵 · 记忆卡",

  answerMode: "inline",

  dataFile: "data/2macro-recitation.js",

  qidPrefix: "",
  /* 小问标题自动加粗：本项目数据没适配，整条规则关掉 */
  subHeading: false,

  /* 筛选维度：key 是卡片字段名，parent 声明上级，fav 是收藏状态。
     章节栏用 sub 还原原版：加粗章节名可点筛整章，下面按该章实际题型挂子项。 */
  filters: [
    {
      "key": "section",
      "label": "章节",
      "sub": [
        { "key": "概念", "type": "重要概念", "text": "　　重要概念" },
        { "key": "简答", "type": "简答/论述题", "text": "　　简答/论述题" }
      ],
      "subField": "type"
    },
    {
      "key": "fav",
      "label": "⭐ 收藏",
      "type": "fav"
    }
  ]
};
