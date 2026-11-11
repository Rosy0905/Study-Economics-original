/* 模块配置：一个模块一页，这份只管「论述专项」。 */

window.MODULE_CONFIG = {
  id: "7essay",
  title: "论述专项",
  /* 页头长标题：与模块名分开，页头与入口卡可以各用各的文案 */
  pageTitle: "南开经济学 · 论述题记忆卡",
  icon: "📝",
  /* 标签页标题：整句直接用，不再拼后缀 */
  tab: "论述题 · 记忆卡",

  answerMode: "inline",

  dataFile: "data/7essay.js",

  qidPrefix: {"default":"Q","note":"U"},
  /* 小问标题自动加粗：本项目数据没适配，整条规则关掉 */
  subHeading: false,

  /* 筛选维度：key 是卡片字段名，parent 声明上级，fav 是收藏状态 */
  filters: [
    {
      "key": "section",
      "label": "专项",
      "labelMap": {
        "使用说明": "使用说明",
        "微观·第一类": "第一类 · 课本知识类",
        "微观·第二类": "第二类 · 材料分析类",
        "宏观·第一层次": "第一层次 · 政策手段类",
        "宏观·第二层次": "第二层次 · 内外交织类",
        "宏观·第三层次": "第三层次 · 发展改革类"
      },
      "groups": [
        {
          "label": "微观部分（共18道）",
          "members": [
            "微观·第一类",
            "微观·第二类"
          ]
        },
        {
          "label": "宏观部分（共24道）",
          "members": [
            "宏观·第一层次",
            "宏观·第二层次",
            "宏观·第三层次"
          ]
        }
      ]
    },
    {
      "key": "fav",
      "label": "⭐ 收藏",
      "type": "fav"
    }
  ]
};
