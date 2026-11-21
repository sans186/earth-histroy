/**
 * Copy for the story picker. Cover art is resolved from
 * `src/assets/stories/<story id>.jpg` (3:2 landscape recommended); a missing
 * file falls back to a typographic plate, so photos can be added one at a time.
 */
export interface StoryCover {
  /** One or two sentences shown under the title in the picker. */
  intro: string;
  introEn: string;
}

export const STORY_COVERS: Record<string, StoryCover> = {
  'silk-road': {
    intro: '一条连接长安与地中海的商路。丝绸、香料与信仰沿着绿洲和驿站往来两千年，也把东西方的城市连成一张网。',
    introEn:
      'A trade road linking Chang’an to the Mediterranean. For two thousand years silk, spices and faith moved between oasis towns, tying the cities of East and West into one network.',
  },
  'age-of-discovery': {
    intro: '从里斯本出发的船队绕过非洲、横渡大西洋与太平洋。人类第一次把各大洲画进同一张完整的世界地图。',
    introEn:
      'Fleets left Lisbon, rounded Africa and crossed the Atlantic and Pacific, drawing every continent onto one complete map of the world for the first time.',
  },
  'world-wars': {
    intro: '从萨拉热窝的一声枪响到柏林的废墟，两次全球冲突把帝国、边界与普通人的生活一起改写。',
    introEn:
      'From a shot at Sarajevo to the ruins of Berlin, two global conflicts rewrote empires, borders and the lives of ordinary people.',
  },
  'alexander-conquest': {
    intro: '马其顿国王亚历山大用十年东进至印度河，把希腊世界的城市、语言与制度带到埃及、波斯和中亚。',
    introEn:
      'In ten years Alexander of Macedon marched east to the Indus, carrying Greek cities, language and institutions into Egypt, Persia and Central Asia.',
  },
  'mongol-westward': {
    intro: '蒙古骑兵三次西进，从草原直抵中欧与中东，缔造了历史上陆上疆域最辽阔的帝国之一。',
    introEn:
      'Three Mongol campaigns swept from the steppe into Central Europe and the Middle East, forging one of the largest land empires in history.',
  },
  'crusades': {
    intro: '欧洲骑士以信仰之名两百年间反复东征，在地中海东岸建立十字军国家，也改变了东西方的往来方式。',
    introEn:
      'For two centuries European knights marched east under the cross, founding Crusader states on the Levantine coast and reshaping exchange between East and West.',
  },
  'islamic-expansion': {
    intro: '七世纪从阿拉伯半岛出发，阿拉伯军队与商队向东、向西推进，建立起横跨亚非欧的庞大帝国。',
    introEn:
      'From seventh-century Arabia, armies and caravans advanced east and west, building an empire that stretched across Asia, Africa and Europe.',
  },
  'renaissance': {
    intro: '佛罗伦萨的画室与威尼斯的印坊里，人重新成为艺术与思想的中心，古典文化在欧洲悄然复活。',
    introEn:
      'In Florentine workshops and Venetian presses the human figure returned to the centre of art and thought as classical learning revived.',
  },
  'industrial-revolution': {
    intro: '蒸汽机、纺织厂与铁路从英国出发，把农业社会推向机器与城市主导的现代世界。',
    introEn:
      'Steam engines, textile mills and railways spread from Britain, carrying an agrarian world toward machines and cities.',
  },
  'american-revolution': {
    intro: '十三个殖民地自波士顿起身反抗征税与王权，在约克镇赢下独立，建立了一个新的共和国。',
    introEn:
      'Thirteen colonies rose from Boston against taxation and royal rule, won independence at Yorktown and founded a new republic.',
  },
  'french-revolution': {
    intro: '1789 年巴士底狱被攻陷，旧制度在王权与等级中崩塌，革命与共和国由此震荡整个欧洲。',
    introEn:
      'In 1789 the Bastille fell. The old order of crown and estate collapsed, and revolution and republic shook Europe.',
  },
  'world-war-i': {
    intro: '萨拉热窝的一声枪响把欧洲拖入堑壕与总体战，四个帝国在四年间相继瓦解。',
    introEn:
      'A shot at Sarajevo drew Europe into trenches and total war; four empires collapsed within four years.',
  },
  'world-war-ii-europe': {
    intro: '从闪击波兰到柏林陷落，欧洲在六年战争中经历占领、屠杀与解放，战后秩序由此重建。',
    introEn:
      'From the invasion of Poland to the fall of Berlin, Europe endured six years of occupation, atrocity and liberation.',
  },
  'world-war-ii-pacific': {
    intro: '珍珠港之后，航母与岛屿争夺决定太平洋战局，直到东京湾的投降仪式。',
    introEn:
      'After Pearl Harbor, carriers and island campaigns decided the Pacific war until the surrender in Tokyo Bay.',
  },
  'cold-war': {
    intro: '雅尔塔之后，美苏两大阵营以核武、同盟与代理人战争对峙四十年，柏林墙成为整个时代的符号。',
    introEn:
      'After Yalta, two blocs faced each other through nuclear arms, alliances and proxy wars for forty years, with the Berlin Wall as its symbol.',
  },
};

export function coverFor(storyId: string): StoryCover | undefined {
  return STORY_COVERS[storyId];
}
