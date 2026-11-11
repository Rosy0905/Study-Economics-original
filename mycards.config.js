/* 我的卡片页配置：项目身份跟 project.config.js 走。
   页面骨架里不写死项目 id，数据层、筛选记忆、导入导出统一按这里走。 */

window.MYCARDS_CONFIG = {
  /* 板块串连导航：本页不在板块清单里，序号由清单长度顺延 */
  sectionNav: { short: '卡片', name: '我的卡片' },
  projectId: (window.PROJECT_CONFIG && window.PROJECT_CONFIG.projectId) || 'demo',
  storagePrefix: 'kb',
  moduleId: 'cards',
  title: '我的卡片',
  page: {
    title: '我的卡片',
    heading: '📒 我的卡片',
    hint: '点击新建卡片即可添加卡片 · 答案支持富文本（BIU / 图片 / 表格 / 公式）'
  },
  back: { href: 'index.html', label: '主页' },
  subjects: [
    "微观",
    "宏观"
  ]
};
