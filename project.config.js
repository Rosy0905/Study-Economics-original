/* 项目配置：由生成器按配置产出。改这里可以改站名、模块入口、功能开关。
   模块自己的东西在各自的 <页面名>.config.js 里，不在这里。
   页面加载顺序：palette.config.js → project.config.js → 模块配置 → 数据。 */

window.PROJECT_CONFIG = {
  /* 存储键的第一段。部署在同一域名下的两个站必须不同，否则数据互相覆盖。 */
  projectId: "eco",
  storagePrefix: 'kb',

  icon: {
    "preset": "purple-gold",
    "petal": "",
    "line": "",
    "core": "",
    "bg": "",
    "themeColor": "",
    "name": "南开经济学 · 知识库",
    "shortName": "经济学"
  },

  math: "unicode",
  formulaAlign: "center",

  /* 模块页左上角的返回键 */
  back: { href: 'index.html', label: '主页' },

  features: {
    "notes": true,
    "edit": true,
    "selftest": true
  },

  stats: [
    { key: 'total', icon: '📚', label: '总卡' },
    { key: 'fav', icon: '⭐', label: '收藏' },
    { key: 'learned', icon: '🧩', label: '已学', hidden: true }
  ],

  home: {
    title: "南开经济学 · 知识库",
    subtitle: "八大模块 · 一站式学习 · 构建经济学知识框架",
    footer: [
      "© 南开经济学备考知识库",
      "数据仅保存在本机浏览器，换设备或清理缓存会丢失"
    ],
    search: 'search.html',
    modules: [
      {
        "id": "1micro-recitation",
        "icon": "📗",
        "title": "背诵（微观）",
        "desc": "微观背诵手册 · 概念与简答",
        "count": 110,
        "url": "./1micro-recitation.html",
        "color": "#3FAE8C"
      },
      {
        "id": "2macro-recitation",
        "icon": "📘",
        "title": "背诵（宏观）",
        "desc": "宏观背诵手册 · 概念与简答",
        "count": 100,
        "url": "./2macro-recitation.html",
        "color": "#5A96DE"
      },
      {
        "id": "3calc-keypoints",
        "icon": "🧮",
        "title": "计算要点",
        "desc": "十五个专题 · 知识点与例题",
        "count": 84,
        "url": "./3calc-keypoints.html",
        "color": "#D0A44E"
      },
      {
        "id": "4calc-special",
        "icon": "📐",
        "title": "计算专项",
        "desc": "微观/宏观 · 题型突破",
        "count": 216,
        "url": "./4calc-special.html",
        "color": "#D9739F"
      },
      {
        "id": "5micro-short-answer",
        "icon": "✏️",
        "title": "简答专项（微观）",
        "desc": "微观简答题 · 分专题训练",
        "count": 108,
        "url": "./5micro-short-answer.html",
        "color": "#3FAFC2"
      },
      {
        "id": "6macro-short-answer",
        "icon": "✒️",
        "title": "简答专项（宏观）",
        "desc": "宏观简答题 · 分专题训练",
        "count": 103,
        "url": "./6macro-short-answer.html",
        "color": "#7E70D6"
      },
      {
        "id": "7essay",
        "icon": "📝",
        "title": "论述专项",
        "desc": "微观/宏观 · 答题思路",
        "count": 50,
        "url": "./7essay.html",
        "color": "#E0785A"
      },
      {
        "id": "8past-exams",
        "icon": "📜",
        "title": "历年真题",
        "desc": "应用经济学 / 理论经济学 / 金融学",
        "count": 466,
        "url": "./8past-exams.html",
        "color": "#9B6BC4",
        "answerBook": {
          "page": "./answers.html",
          "label": "答案册"
        }
      }
    ],
    myCards: {
      "style": "bar",
      "icon": "📒",
      "title": "我的卡片",
      "desc": "自己整理与收藏的卡片",
      "url": "./mycards.html"
    },
    palette: "default",
    clear: { picker: 'petal', label: '清除' },
    sync: { label: '同步', fileName: '南开经济学知识库-备份', texts: {} },
    readme: { docs: [{ name: 'help', path: '_docs/help.md' }, { name: 'log', path: '_docs/log.md' }] }
  }
};

/* 图标配色预设：同一朵五瓣花，20 套参考配色。 */
window.ICON_PRESETS = {
  'purple-gold': { name: '紫金 · 经济学', bg: '#E0D1EF', petal: '#A86FD1', line: '#6A2C91', core: '#F2C14E' },
  'pink-blue':   { name: '粉蓝 · 英语',   bg: '#F3D3E1', petal: '#EE7FA9', line: '#B84C77', core: '#B9DFF2' },
  'mint':        { name: '青碧 · 薄荷',   bg: '#D6F0EA', petal: '#4FB3A5', line: '#1F6F66', core: '#FFD166' },
  'citrus':      { name: '暖阳 · 柑橘',   bg: '#FDECD8', petal: '#F0854B', line: '#8C3B12', core: '#FFE7A0' },
  'indigo':      { name: '靛蓝 · 星夜',   bg: '#DDE4F7', petal: '#5C6BC0', line: '#2A3577', core: '#FFD54F' },
  'moss':        { name: '森绿 · 苔原',   bg: '#E3F0D9', petal: '#7CB342', line: '#33691E', core: '#FFF59D' },
  'crimson':     { name: '绯红 · 焰',     bg: '#FBE3E1', petal: '#E63946', line: '#8C1C13', core: '#F9C74F' },
  'morandi':     { name: '莫兰迪 · 灰紫', bg: '#EAE5E0', petal: '#A99BB5', line: '#5C5268', core: '#E8C9A0' },
  'cocoa':       { name: '可可 · 抹茶',   bg: '#F2E8DC', petal: '#8D6E63', line: '#4E342E', core: '#A5D6A7' },
  'seasalt':     { name: '海盐 · 晴空',   bg: '#E3F2F7', petal: '#6FB5D8', line: '#2B6E8F', core: '#FFF3B8' },
  'lemon':       { name: '柠檬 · 苏打',   bg: '#FBF6D9', petal: '#F2D74E', line: '#B08A1E', core: '#7EC8E3' },
  'peach':       { name: '蜜桃 · 乌龙',   bg: '#FDE8D7', petal: '#F4A26B', line: '#A85B2E', core: '#FFF1C1' },
  'haze':        { name: '雾霾 · 蓝',     bg: '#E4EAF2', petal: '#8FA8C8', line: '#3F5A78', core: '#F5D491' },
  'sakura':      { name: '樱花 · 吹雪',   bg: '#FCE8EF', petal: '#F7B2C8', line: '#C2708F', core: '#FFF6E5' },
  'avocado':     { name: '牛油果 · 奶昔', bg: '#EFF6E2', petal: '#A8C97F', line: '#5A7D3A', core: '#F9E27A' },
  'grape':       { name: '葡萄 · 气泡',   bg: '#EFE4F7', petal: '#9B6BC4', line: '#5B3A7E', core: '#F7D9E3' },
  'sunset':      { name: '落日 · 珊瑚',   bg: '#FFE8E0', petal: '#FF8A73', line: '#B54A3A', core: '#FFE9A8' },
  'turquoise':   { name: '松石 · 绿',     bg: '#DFF3F0', petal: '#4FBFA8', line: '#1F7A6B', core: '#FFE08A' },
  'oat':         { name: '燕麦 · 拿铁',   bg: '#F3EDE3', petal: '#C9A47A', line: '#7A5A3A', core: '#F7E8C8' },
  'lavender':    { name: '薰衣草 · 田',   bg: '#EAE6F8', petal: '#9B8BD9', line: '#55408F', core: '#FFD9A0' }
};
