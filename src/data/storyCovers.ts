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
  mesopotamia: {
    intro: '两河之间的城邦用泥板记账、以石碑立律，乌鲁克、乌尔与巴比伦把城市、文字与王权连成一套制度。',
    introEn:
      'Between the Tigris and Euphrates, cities kept accounts on clay and carved law into stone; Uruk, Ur and Babylon bound writing, kingship and urban life into one order.',
  },
  'ancient-egypt': {
    intro: '尼罗河的定期泛滥支撑起三千年的王朝，从吉萨的金字塔到亚历山大港，法老、书吏与神庙维系着河谷的秩序。',
    introEn:
      'The annual flood of the Nile sustained three thousand years of dynasties, from the pyramids at Giza to Alexandria, held together by pharaohs, scribes and temples.',
  },
  'persian-empire': {
    intro: '居鲁士与大流士以行省、御道和驿传治理横跨三洲的帝国，波斯波利斯的浮雕记录着各地使团送来的贡赋。',
    introEn:
      'Cyrus and Darius governed three continents through satrapies, royal roads and relay stations, while the reliefs of Persepolis show delegations bringing tribute.',
  },
  rome: {
    intro: '从驱逐国王的共和国到图拉真时代的极盛版图，军团、道路与法律把一个台伯河城邦变成地中海的主宰。',
    introEn:
      'From a republic that expelled its kings to the widest frontiers under Trajan, legions, roads and law turned a Tiber town into the master of the Mediterranean.',
  },
  'india-classical': {
    intro: '孔雀王朝的阿育王以石柱敕令传播法度，笈多时期的城市与寺院则推动了天文、数学与梵语文学的兴盛。',
    introEn:
      'Ashoka of the Mauryas spread his edicts on stone pillars, and under the Guptas cities and monasteries fostered astronomy, mathematics and Sanskrit literature.',
  },
  'buddhist-path': {
    intro: '从鹿野苑的初转法轮到奈良大佛开眼，佛教沿商路与译经网络东传，落在绿洲、雪域与海岛上。',
    introEn:
      'From the first sermon at Sarnath to the eye-opening of the Nara Buddha, Buddhism travelled east along trade routes and translation networks into oases, highlands and islands.',
  },
  byzantium: {
    intro: '君士坦丁堡扼守博斯普鲁斯海峡一千年，历经围攻、拉丁占领与最终陷落，始终自称罗马。',
    introEn:
      'For a thousand years Constantinople held the Bosphorus through sieges, Latin occupation and final conquest, always calling itself Rome.',
  },
  'viking-age': {
    intro: '长船自北欧峡湾驶出，劫掠修道院也做生意，从约克到基辅，最后把营地扎在纽芬兰海岸。',
    introEn:
      'Longships left the Nordic fjords to raid monasteries and trade, reaching from York to Kyiv and finally setting a camp on the Newfoundland coast.',
  },
  'islamic-golden-age': {
    intro: '大马士革与巴格达的译场把希腊、波斯和印度的典籍译成阿拉伯语，科尔多瓦与开罗的学者再把知识向西传。',
    introEn:
      'Translators in Damascus and Baghdad rendered Greek, Persian and Indian texts into Arabic, and scholars in Cordoba and Cairo carried that learning west.',
  },
  'black-death': {
    intro: '1340 年代，商船把鼠疫从黑海带到地中海，君士坦丁堡、威尼斯与伦敦相继暴发，欧亚人口在数年内锐减。',
    introEn:
      'In the 1340s merchant ships carried plague from the Black Sea into the Mediterranean; Constantinople, Venice and London were struck in turn, and Eurasian populations fell within a few years.',
  },
  'ottoman-rise': {
    intro: '从布尔萨的边陲公国到维也纳城下，奥斯曼以火炮、行省与迁都，把三洲之间的旧秩序重新组织起来。',
    introEn:
      'From a frontier principality at Bursa to the walls of Vienna, the Ottomans reorganised the old order between three continents with artillery, provinces and a new capital.',
  },
  'indian-ocean': {
    intro: '季风按季节改向，商船便在亚丁、摩加迪沙、卡利卡特与马六甲之间往返，瓷器、布匹与香料随季节流动。',
    introEn:
      'Monsoon winds reversed with the seasons, and ships moved between Aden, Mogadishu, Calicut and Malacca, carrying porcelain, cloth and spices on a seasonal rhythm.',
  },
  reformation: {
    intro: '一份关于赎罪券的论纲被印坊翻印，几十年间裂开了拉丁基督教世界，也把欧洲拖入宗教战争。',
    introEn:
      'A set of theses on indulgences was reprinted by the presses, and within decades it split Latin Christendom and drew Europe into wars of religion.',
  },
  napoleon: {
    intro: '从雾月政变到滑铁卢，拿破仑的军队把欧洲各国拖进全面战争，也让法典与行政改革随军旗扩散。',
    introEn:
      'From the coup of Brumaire to Waterloo, Napoleon drew Europe into total war, and his legal code and administrative reforms travelled with the armies.',
  },
  'latin-america': {
    intro: '玻利瓦尔自北方、圣马丁自南方推进，西属美洲在十五年内相继独立，随后又各自寻找新的政治秩序。',
    introEn:
      'Bolívar advanced from the north and San Martín from the south; Spanish America won independence within fifteen years, then each new state searched for its own political order.',
  },
  meiji: {
    intro: '黑船叩开浦贺之后，日本废藩置县、修铁路、办学校，用一代人的时间把旧藩体制换成近代国家。',
    introEn:
      'After the black ships arrived at Uraga, Japan abolished the domains, built railways and opened schools, replacing the old order with a modern state within a generation.',
  },
  'scramble-africa': {
    intro: '柏林会议之后的三十年，欧洲列强用条约、远征与特许公司在地图上瓜分非洲，只留下少数独立国家。',
    introEn:
      'In the thirty years after the Berlin Conference, European powers divided Africa through treaties, expeditions and chartered companies, leaving only a few states independent.',
  },
  decolonization: {
    intro: '二战之后三十余年，从德里到阿克拉再到马普托，亚非殖民地相继独立，重画了世界政治地图。',
    introEn:
      'In the three decades after the Second World War, from Delhi to Accra to Maputo, Asian and African colonies became independent and redrew the political map.',
  },
};

export function coverFor(storyId: string): StoryCover | undefined {
  return STORY_COVERS[storyId];
}
