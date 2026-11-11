/* 答案册配置：项目身份沿用 project.config.js，
   同一个 projectId，收藏与熟悉度标记才跟题库页对得上。 */

window.ANSWER_CONFIG = {
  title: "真题答案册",
  
  back: { href: "8past-exams.html", label: '题库' },

  /* 与题库页用同一个模块 id，两页看到同一份标记 */
  moduleId: "8past-exams",

  search: { placeholder: "搜全部真题的题干 / 答案…" },
  selftest: { label: '熟悉度', hint: '熟悉度：给每道题标一下掌握程度' }
};
