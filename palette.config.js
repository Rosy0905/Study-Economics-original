/* 全站配色板：项目级一份，所有页面共用。
   主页模块卡与板块串连导航圆钮取的是同一份数据，改这里两边一起变。
   每套 10 色同一调性（亮色＝主色混白 36%、底色＝混白 90%），套与套之间是色相编排的差异。
   home.palette 指定未选色模块从哪套轮取；color 填任意套的色名都能用（跨套全局查），
   也接受单个 hex（如 '#D95F5F'）自动衍生亮色与底色。
   页面在加载自己的 config 之前先加载本文件。 */
window.HOME_PALETTES = {
  /* 多彩：主页默认的 10 色 */
  default: [
    { name: 'green',  c: '#3FAE8C', c2: '#7FD1B0', soft: '#EAF8F2' },
    { name: 'blue',   c: '#5A96DE', c2: '#8FBCEC', soft: '#EAF2FD' },
    { name: 'gold',   c: '#D0A44E', c2: '#EBCB86', soft: '#FDF7E9' },
    { name: 'pink',   c: '#D9739F', c2: '#EF9FC0', soft: '#FCEFF5' },
    { name: 'cyan',   c: '#3FAFC2', c2: '#7BD0DD', soft: '#E9F7F9' },
    { name: 'violet', c: '#7E70D6', c2: '#A99EEA', soft: '#F1EFFC' },
    { name: 'orange', c: '#E0785A', c2: '#F0A288', soft: '#FDF1EC' },
    { name: 'grape',  c: '#9B6BC4', c2: '#C096DD', soft: '#F7EFFB' },
    { name: 'lime',   c: '#6BA84F', c2: '#9CCF7E', soft: '#F0F8EA' },
    { name: 'steel',  c: '#4E9AA8', c2: '#85C4CE', soft: '#EAF5F7' }
  ],
  /* 浓郁色相：10 个更沉的色相，同一调性 */
  vivid: [
    { name: 'red',    c: '#D95F5F', c2: '#EC9C9C', soft: '#FCEEEE' },
    { name: 'brick',  c: '#BE5F44', c2: '#DA9683', soft: '#FAF0EC' },
    { name: 'brown',  c: '#A17A50', c2: '#C9AC85', soft: '#F9F3EA' },
    { name: 'navy',   c: '#4E74AC', c2: '#8FA9CF', soft: '#EDF2F9' },
    { name: 'forest', c: '#4E8D62', c2: '#8CB99A', soft: '#EDF6F0' },
    { name: 'olive',  c: '#8C9C42', c2: '#B4C07E', soft: '#F5F8E9' },
    { name: 'slate',  c: '#6E80A6', c2: '#A3B0CA', soft: '#F0F3F8' },
    { name: 'plum',   c: '#B05688', c2: '#D191B4', soft: '#F9EEF4' },
    { name: 'stone',  c: '#94887B', c2: '#BCB2A6', soft: '#F5F2EE' },
    { name: 'cloud',  c: '#7E8C9A', c2: '#ADB8C2', soft: '#F0F3F5' }
  ],
  /* 奶彩系：马卡龙糖感，明度高饱和中，色相铺开 */
  pastel: [
    { name: 'sakura', c: '#F2A6BC', c2: '#F7C6D4', soft: '#FEF6F8' },
    { name: 'apri',   c: '#F7BC94', c2: '#FAD4BB', soft: '#FEF8F4' },
    { name: 'lemon',  c: '#EFD98A', c2: '#F5E7B4', soft: '#FDFBF3' },
    { name: 'matcha', c: '#B8D8A0', c2: '#D2E6C2', soft: '#F8FBF6' },
    { name: 'mint',   c: '#9ADBC8', c2: '#BEE8DC', soft: '#F5FBFA' },
    { name: 'sky',    c: '#A8CCF0', c2: '#C7DEF5', soft: '#F6FAFE' },
    { name: 'taro',   c: '#C3B4EC', c2: '#D9CFF3', soft: '#F9F8FD' },
    { name: 'berry',  c: '#E2A9D8', c2: '#ECC8E6', soft: '#FCF6FB' },
    { name: 'latte',  c: '#D4BCA2', c2: '#E3D4C3', soft: '#FBF8F6' },
    { name: 'salt',   c: '#B9C8CF', c2: '#D2DCE0', soft: '#F8FAFA' }
  ],
  /* 暖秋系：纸感灰调，温度统一偏暖，色相从红跨到紫 */
  autumn: [
    { name: 'maple',  c: '#C06A5A', c2: '#D7A095', soft: '#F9F0EF' },
    { name: 'persim', c: '#D08A54', c2: '#E1B492', soft: '#FAF3EE' },
    { name: 'turmer', c: '#C9A24E', c2: '#DCC38E', soft: '#FAF6ED' },
    { name: 'camel',  c: '#B98F68', c2: '#D2B79E', soft: '#F8F4F0' },
    { name: 'coffee', c: '#9A7B5E', c2: '#BEAB98', soft: '#F5F2EF' },
    { name: 'straw',  c: '#97A05E', c2: '#BCC298', soft: '#F5F6EF' },
    { name: 'moss',   c: '#7E9470', c2: '#ACBBA3', soft: '#F2F4F1' },
    { name: 'misty',  c: '#7E9AA0', c2: '#ACBEC2', soft: '#F2F5F6' },
    { name: 'lotus',  c: '#9C88A6', c2: '#C0B3C6', soft: '#F5F3F6' },
    { name: 'rosewd', c: '#B07080', c2: '#CCA3AE', soft: '#F7F1F2' }
  ]
};
