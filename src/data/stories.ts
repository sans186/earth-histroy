import type { Story } from '@/types/story';

/**
 * Guided stories. Coordinates are real city centres; durations are in
 * milliseconds, long enough to read a two-line caption without rushing.
 * Chinese copy is the original; `*En` carries the English translation.
 */
export const STORIES: Story[] = [
  {
    id: 'silk-road',
    title: '丝绸之路',
    titleEn: 'Silk Road',
    subtitle: '从长安到地中海，一条横贯欧亚的商路',
    subtitleEn: "From Chang'an to the Mediterranean, a trade route across Eurasia",
    steps: [
      {
        year: -138,
        lon: 108.9,
        lat: 34.3,
        height: 1200000,
        title: '长安',
        titleEn: "Chang'an",
        route: 'land',
        caption:
          '公元前 138 年，张骞自长安出发西行。此后这里成为丝路东端的起点，丝绸、漆器与文书由此流向河西。',
        captionEn:
          "In 138 BCE Zhang Qian set out west from Chang'an. The city became the eastern terminus of the Silk Road, sending silk, lacquerware and documents into the Hexi Corridor.",
        duration: 4500,
      },
      {
        year: -111,
        lon: 94.7,
        lat: 40.1,
        height: 1150000,
        title: '敦煌',
        titleEn: 'Dunhuang',
        route: 'land',
        caption:
          '汉武帝设敦煌郡，玉门关与阳关扼守西域门户。商队与僧侣在此补给、译经，莫高窟的灯火延续千年。',
        captionEn:
          'Emperor Wu of Han established Dunhuang Commandery; the Yumen and Yangguan passes guarded the gateway to the Western Regions. Caravans and monks resupplied and translated sutras here, and the lamps of Mogao burned for a thousand years.',
        // Rough footprint of the Hexi Corridor between the Qilian mountains and the desert.
        region: [
          [103.5, 38.8],
          [101.5, 36.5],
          [96.0, 37.5],
          [94.0, 39.0],
          [93.5, 40.5],
          [99.0, 41.8],
          [103.0, 40.0],
        ],
        regionLabel: '河西走廊',
        duration: 4200,
      },
      {
        year: -128,
        lon: 66.9,
        lat: 39.6,
        height: 1200000,
        title: '撒马尔罕',
        titleEn: 'Samarkand',
        route: 'land',
        caption:
          '张骞的副使抵达粟特城邦。撒马尔罕的市集上，中国的丝绸与印度的香料、波斯的银器汇于一处。',
        captionEn:
          "Zhang Qian's envoys reached the Sogdian city-states. In Samarkand's bazaar, Chinese silk met Indian spices and Persian silverwork.",
        duration: 4300,
      },
      {
        year: 762,
        lon: 44.4,
        lat: 33.3,
        height: 1200000,
        title: '巴格达',
        titleEn: 'Baghdad',
        route: 'land',
        caption:
          '阿拔斯王朝营建巴格达，底格里斯河畔的圆形之城成为西段商路枢纽，东方货物经波斯湾与陆路在此集散。',
        captionEn:
          'The Abbasids founded Baghdad; the Round City on the Tigris became the hub of the western route, gathering eastern goods via the Persian Gulf and the overland roads.',
        radiusKm: 320,
        duration: 4400,
      },
      {
        year: 330,
        lon: 28.9,
        lat: 41.0,
        height: 1150000,
        title: '君士坦丁堡',
        titleEn: 'Constantinople',
        route: 'land',
        caption:
          '君士坦丁堡成为罗马帝国的新都。博斯普鲁斯海峡扼守欧亚之间，丝绸在此转运，并被课以重税。',
        captionEn:
          'Constantinople became the new capital of the Roman Empire. The Bosphorus held the passage between Europe and Asia, and silk was transshipped here under heavy tariffs.',
        duration: 4300,
      },
      {
        year: 117,
        lon: 12.5,
        lat: 41.9,
        height: 1100000,
        title: '罗马',
        titleEn: 'Rome',
        route: 'land',
        caption:
          '图拉真时代的罗马帝国臻于极盛。东方的丝绸被视作奢侈品，元老院曾屡次下令限制其消费。',
        captionEn:
          'Under Trajan the Roman Empire reached its height. Eastern silk was a luxury in Rome, and the Senate repeatedly tried to restrict its consumption.',
        radiusKm: 320,
        duration: 4200,
      },
      {
        year: 1271,
        lon: 12.3,
        lat: 45.4,
        height: 1200000,
        title: '威尼斯',
        titleEn: 'Venice',
        route: 'land',
        caption:
          '马可·波罗自威尼斯启程东行。这座潟湖城邦凭借舰队与商站网络，将丝路贸易推向后世的高峰。',
        captionEn:
          'Marco Polo set out east from Venice. With its fleet and trading stations, the lagoon city carried Silk Road commerce toward its later peak.',
        duration: 4300,
      },
      {
        year: 661,
        lon: 36.3,
        lat: 33.5,
        height: 1250000,
        title: '大马士革',
        titleEn: 'Damascus',
        route: 'land',
        caption:
          '倭马亚王朝定都大马士革。商队从这里出发，连接地中海港口与两河流域，再向东通往中亚与长安。',
        captionEn:
          "The Umayyads made Damascus their capital. Caravans left here to link Mediterranean ports with Mesopotamia, and onward to Central Asia and Chang'an.",
        duration: 4500,
      },
    ],
  },
  {
    id: 'age-of-discovery',
    title: '大航海',
    titleEn: 'Age of Discovery',
    subtitle: '从里斯本到马尼拉，欧洲人重新画出世界地图',
    subtitleEn: 'From Lisbon to Manila, Europe redraws the map of the world',
    steps: [
      {
        year: 1415,
        lon: -9.14,
        lat: 38.72,
        height: 1200000,
        title: '里斯本',
        titleEn: 'Lisbon',
        route: 'sea',
        caption:
          '15 世纪初，葡萄牙以里斯本为基地探索非洲西岸，恩里克王子资助航海，积累风向与海图知识。',
        captionEn:
          'In the early 15th century Portugal explored West Africa from Lisbon; Prince Henry funded voyages that built up knowledge of winds and sea charts.',
        duration: 4200,
      },
      {
        year: 1415,
        lon: -5.32,
        lat: 35.89,
        height: 1000000,
        title: '休达',
        titleEn: 'Ceuta',
        route: 'sea',
        caption:
          '1415 年葡萄牙攻占休达，控制直布罗陀海峡南岸，第一次把扩张目光投向大西洋与非洲。',
        captionEn:
          'In 1415 Portugal seized Ceuta, controlling the southern shore of the Strait of Gibraltar and turning its ambitions toward the Atlantic and Africa.',
        duration: 4000,
      },
      {
        year: 1420,
        lon: -16.91,
        lat: 32.65,
        height: 1000000,
        title: '马德拉',
        titleEn: 'Madeira',
        route: 'sea',
        caption:
          '葡萄牙殖民马德拉群岛，甘蔗种植与航海补给让这座大西洋岛屿成为远洋探索的试验场。',
        captionEn:
          'Portugal settled Madeira; sugar planting and victualling turned the Atlantic island into a testing ground for ocean voyages.',
        duration: 4000,
      },
      {
        year: 1462,
        lon: -23.51,
        lat: 14.93,
        height: 1300000,
        title: '佛得角',
        titleEn: 'Cape Verde',
        route: 'sea',
        caption:
          '船队抵达佛得角群岛，大西洋航线继续向南延伸，奴隶贸易与糖业由此进入跨洋体系。',
        captionEn:
          'The fleet reached the Cape Verde Islands, pushing the Atlantic route further south and drawing the slave trade and sugar into a transoceanic system.',
        duration: 4100,
      },
      {
        year: 1488,
        lon: 18.47,
        lat: -34.36,
        height: 1500000,
        title: '好望角',
        titleEn: 'Cape of Good Hope',
        route: 'sea',
        caption:
          '1488 年迪亚士绕过好望角，证明大西洋与印度洋相通，为直达印度的航线扫清最后障碍。',
        captionEn:
          'In 1488 Dias rounded the Cape of Good Hope, proving the Atlantic and Indian Oceans connect and clearing the last obstacle to a sea route to India.',
        duration: 4300,
      },
      {
        year: 1492,
        lon: -74.48,
        lat: 24.04,
        height: 1800000,
        title: '圣萨尔瓦多',
        titleEn: 'San Salvador',
        route: 'sea',
        caption:
          '1492 年哥伦布横渡大西洋，在巴哈马群岛登陆，欧洲与美洲自此被纳入同一贸易网络。',
        captionEn:
          'In 1492 Columbus crossed the Atlantic and landed in the Bahamas, binding Europe and the Americas into one trading network.',
        duration: 4500,
      },
      {
        year: 1498,
        lon: 75.78,
        lat: 11.25,
        height: 1400000,
        title: '卡利卡特',
        titleEn: 'Calicut',
        route: 'sea',
        caption:
          '1498 年达伽马抵达印度西海岸的卡利卡特，绕开地中海中间商，香料贸易改由海路直达欧洲。',
        captionEn:
          "In 1498 Vasco da Gama reached Calicut on India's west coast, bypassing Mediterranean middlemen and bringing the spice trade to Europe by sea.",
        duration: 4400,
      },
      {
        year: 1511,
        lon: 102.25,
        lat: 2.19,
        height: 1200000,
        title: '马六甲',
        titleEn: 'Malacca',
        route: 'sea',
        caption:
          '1511 年葡萄牙攻占马六甲，扼住东西方海上咽喉，印度洋与南海的商路被连成一体。',
        captionEn:
          'In 1511 Portugal took Malacca, seizing the maritime choke point between East and West and linking the Indian Ocean and South China Sea routes.',
        duration: 4300,
      },
      {
        year: 1519,
        lon: -5.99,
        lat: 37.39,
        height: 1200000,
        title: '塞维利亚',
        titleEn: 'Seville',
        route: 'sea',
        caption:
          '1519 年麦哲伦船队自塞维利亚出航，向西寻找香料群岛，最终完成人类首次环球航行。',
        captionEn:
          "In 1519 Magellan's fleet sailed from Seville westward for the Spice Islands, completing the first circumnavigation of the globe.",
        duration: 4300,
      },
      {
        year: 1571,
        lon: 120.98,
        lat: 14.6,
        height: 1600000,
        title: '马尼拉',
        titleEn: 'Manila',
        route: 'sea',
        caption:
          '1571 年西班牙建立马尼拉，大帆船把美洲白银运往中国，跨太平洋贸易网由此成形。',
        captionEn:
          'In 1571 Spain founded Manila; the galleons carried American silver to China, bringing a trans-Pacific trade network into being.',
        duration: 4500,
      },
    ],
  },
  {
    id: 'world-wars',
    title: '世界大战',
    titleEn: 'World Wars',
    subtitle: '从萨拉热窝到柏林，两次全球冲突如何改变世界',
    subtitleEn: 'From Sarajevo to Berlin, how two global conflicts remade the world',
    steps: [
      {
        year: 1914,
        lon: 18.41,
        lat: 43.86,
        height: 900000,
        title: '萨拉热窝',
        titleEn: 'Sarajevo',
        caption:
          '1914 年斐迪南大公在萨拉热窝遇刺，同盟体系连锁启动，欧洲在数周内滑入第一次世界大战。',
        captionEn:
          'In 1914 Archduke Franz Ferdinand was assassinated in Sarajevo; alliance commitments cascaded and Europe slid into the First World War within weeks.',
        duration: 4400,
      },
      {
        year: 1914,
        lon: 5.57,
        lat: 50.63,
        height: 850000,
        title: '列日',
        titleEn: 'Liège',
        caption:
          '德军进攻列日要塞，执行施里芬计划借道比利时，英国的参战使战火迅速蔓延为全欧战争。',
        captionEn:
          "Germany attacked the Liège forts, executing the Schlieffen Plan through Belgium; Britain's entry quickly widened the war into a European conflict.",
        duration: 4200,
      },
      {
        year: 1914,
        lon: 3.4,
        lat: 49.05,
        height: 900000,
        title: '马恩河',
        titleEn: 'Marne',
        caption:
          '1914 年马恩河战役阻止德军逼近巴黎，施里芬计划破产，西线从此转入漫长的堑壕战。',
        captionEn:
          'The 1914 Battle of the Marne stopped the German advance on Paris, ruined the Schlieffen Plan and turned the Western Front into long trench warfare.',
        duration: 4300,
      },
      {
        year: 1916,
        lon: 5.38,
        lat: 49.16,
        height: 850000,
        title: '凡尔登',
        titleEn: 'Verdun',
        caption:
          '1916 年凡尔登战役以“绞肉机”闻名，双方伤亡惨重，却未能改变西线的僵持格局。',
        captionEn:
          "Verdun in 1916 became a 'meat grinder'; both sides suffered enormous casualties without changing the stalemate on the Western Front.",
        duration: 4300,
      },
      {
        year: 1916,
        lon: 2.63,
        lat: 50.03,
        height: 900000,
        title: '索姆河',
        titleEn: 'Somme',
        caption:
          '索姆河战役中坦克首次投入战场，密集炮火与巨大伤亡暴露出工业化战争的残酷。',
        captionEn:
          'Tanks first went into battle on the Somme, where massed artillery and huge losses exposed the brutality of industrial warfare.',
        duration: 4200,
      },
      {
        year: 1919,
        lon: 2.13,
        lat: 48.8,
        height: 1000000,
        title: '凡尔赛',
        titleEn: 'Versailles',
        caption:
          '1919 年《凡尔赛条约》在凡尔赛宫签署，重划欧洲版图并严惩德国，埋下新的冲突种子。',
        captionEn:
          'The Treaty of Versailles was signed in 1919, redrawing Europe and punishing Germany, and sowing the seeds of a new conflict.',
        duration: 4400,
      },
      {
        year: 1939,
        lon: 18.65,
        lat: 54.35,
        height: 900000,
        title: '格但斯克',
        titleEn: 'Gdańsk',
        caption:
          '1939 年德国进攻波兰，英法对德宣战，第二次世界大战全面爆发，欧洲再次陷入战火。',
        captionEn:
          'In 1939 Germany invaded Poland and Britain and France declared war, beginning the Second World War across Europe.',
        duration: 4400,
      },
      {
        year: 1940,
        lon: 2.38,
        lat: 51.03,
        height: 850000,
        title: '敦刻尔克',
        titleEn: 'Dunkirk',
        caption:
          '1940 年英法联军从敦刻尔克撤往英国，虽丢弃重装备，却保住了日后反攻的骨干力量。',
        captionEn:
          'In 1940 the British and French armies withdrew from Dunkirk to Britain; they abandoned heavy equipment but saved the core of a future counter-offensive.',
        duration: 4300,
      },
      {
        year: 1941,
        lon: 37.62,
        lat: 55.75,
        height: 1100000,
        title: '莫斯科',
        titleEn: 'Moscow',
        caption:
          '1941 年德军进攻莫斯科受挫，闪电战首次遭遇战略失败，东线战局由此转向长期消耗。',
        captionEn:
          'The German drive on Moscow faltered in 1941, the first strategic failure of blitzkrieg, and the Eastern Front settled into a war of attrition.',
        duration: 4400,
      },
      {
        year: 1941,
        lon: -157.95,
        lat: 21.35,
        height: 2500000,
        title: '珍珠港',
        titleEn: 'Pearl Harbor',
        route: 'sea',
        caption:
          '1941 年日本偷袭珍珠港，美国对日宣战，太平洋战争爆发，反法西斯同盟正式形成。',
        captionEn:
          'In 1941 Japan attacked Pearl Harbor; the United States declared war, the Pacific War began and the anti-fascist alliance took shape.',
        radiusKm: 180,
        duration: 4500,
      },
      {
        year: 1944,
        lon: -0.85,
        lat: 49.36,
        height: 850000,
        title: '诺曼底',
        titleEn: 'Normandy',
        caption:
          '1944 年盟军在诺曼底登陆，开辟欧洲第二战场，德军陷入东西两线夹击的困境。',
        captionEn:
          'In 1944 the Allies landed in Normandy, opening a second front in Europe and trapping Germany between east and west.',
        // Rough footprint of the Normandy coast where the landings took place.
        region: [
          [-1.9, 49.75],
          [0.6, 49.9],
          [1.6, 49.3],
          [-0.1, 48.5],
          [-1.7, 48.4],
        ],
        regionLabel: '诺曼底',
        duration: 4300,
      },
      {
        year: 1945,
        lon: 13.4,
        lat: 52.52,
        height: 900000,
        title: '柏林',
        titleEn: 'Berlin',
        caption:
          '1945 年苏军攻克柏林，希特勒自杀，德国无条件投降，欧洲战场的战争宣告结束。',
        captionEn:
          'In 1945 Soviet forces took Berlin, Hitler took his own life and Germany surrendered unconditionally, ending the war in Europe.',
        duration: 4500,
      },
    ],
  },
];

/**
 * Cheap sanity check for authored data: years inside the timeline's domain,
 * coordinates on the globe, and every story actually has something to show.
 * Reports through `console.error` so a bad record is loud in development.
 */
export function validateStories(stories: Story[] = STORIES): boolean {
  let ok = true;
  const fail = (message: string) => {
    ok = false;
    console.error(`[stories] ${message}`);
  };

  for (const story of stories) {
    if (!story.steps.length) {
      fail(`"${story.id}" has no steps`);
      continue;
    }
    story.steps.forEach((step, i) => {
      const where = `"${story.id}" step ${i + 1} (${step.title})`;
      if (!Number.isFinite(step.year) || step.year < -3200 || step.year > 2026) {
        fail(`${where}: year ${step.year} is outside -3200..2026`);
      }
      if (!Number.isFinite(step.lon) || step.lon < -180 || step.lon > 180) {
        fail(`${where}: longitude ${step.lon} is invalid`);
      }
      if (!Number.isFinite(step.lat) || step.lat < -90 || step.lat > 90) {
        fail(`${where}: latitude ${step.lat} is invalid`);
      }
    });
  }

  return ok;
}

if (import.meta.env.DEV) validateStories(STORIES);
