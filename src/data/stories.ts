import type { Story } from '@/types/story';
import { PLACES } from '@/data/storyPlaces';

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
        radiusKm: 220,
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
        radiusKm: 250,
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
        radiusKm: 220,
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
        radiusKm: 220,
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
        radiusKm: 240,
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
        radiusKm: 220,
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
        radiusKm: 200,
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
        // Rough footprint of the Madeira archipelago.
        region: [
          [-17.3, 32.9],
          [-16.6, 32.9],
          [-16.6, 32.6],
          [-17.3, 32.6],
        ],
        regionLabel: '马德拉群岛',
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
        // Rough footprint of the Cape Verde archipelago.
        region: [
          [-25.5, 17.3],
          [-22.6, 17.3],
          [-22.6, 14.7],
          [-25.5, 14.7],
        ],
        regionLabel: '佛得角群岛',
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
        // Rough footprint of the Cape of Good Hope and its approaches.
        region: [
          [18.0, -33.9],
          [19.2, -34.0],
          [19.6, -34.9],
          [18.2, -34.9],
        ],
        regionLabel: '好望角',
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
        // Rough footprint of the Bahamas, where the first landfall was made.
        region: [
          [-78.5, 26.0],
          [-72.0, 26.5],
          [-72.5, 22.5],
          [-78.0, 22.0],
        ],
        regionLabel: '巴哈马群岛',
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
        // Rough footprint of the Malabar coast around Calicut.
        region: [
          [74.6, 12.5],
          [76.4, 12.0],
          [77.0, 10.0],
          [75.0, 9.8],
        ],
        regionLabel: '马拉巴尔海岸',
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
        // Rough footprint of the Strait of Malacca.
        region: [
          [100.0, 3.0],
          [103.5, 2.8],
          [104.0, 1.2],
          [100.5, 1.0],
        ],
        regionLabel: '马六甲海峡',
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
        radiusKm: 220,
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
        // Rough footprint of Manila Bay and its approaches.
        region: [
          [120.5, 14.9],
          [121.4, 15.0],
          [121.6, 14.3],
          [120.6, 14.2],
        ],
        regionLabel: '马尼拉湾',
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
        radiusKm: 200,
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
        radiusKm: 200,
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
        // Rough footprint of the Marne front east of Paris.
        region: [
          [2.2, 49.2],
          [3.8, 49.3],
          [4.0, 48.7],
          [2.3, 48.6],
        ],
        regionLabel: '马恩河',
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
        // Rough footprint of the Verdun salient on the Meuse.
        region: [
          [4.9, 49.4],
          [5.9, 49.4],
          [6.0, 49.0],
          [4.8, 49.0],
        ],
        regionLabel: '凡尔登',
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
        // Rough footprint of the Somme front in Picardy.
        region: [
          [2.0, 50.25],
          [3.5, 50.3],
          [3.6, 49.75],
          [2.0, 49.7],
        ],
        regionLabel: '索姆河',
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
        radiusKm: 200,
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
        radiusKm: 220,
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
        // Rough footprint of the Dunkirk evacuation perimeter.
        region: [
          [2.1, 51.15],
          [2.7, 51.15],
          [2.8, 50.85],
          [2.2, 50.85],
        ],
        regionLabel: '敦刻尔克',
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
        radiusKm: 300,
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
        // Rough footprint of Pearl Harbor on O'ahu.
        region: [
          [-158.1, 21.45],
          [-157.7, 21.45],
          [-157.6, 21.15],
          [-158.0, 21.15],
        ],
        regionLabel: '珍珠港',
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
        radiusKm: 250,
        duration: 4500,
      },
    ],
  },
  {
    id: 'alexander-conquest',
    title: '亚历山大东征',
    subtitle: '从马其顿到印度河，十年间建立横跨三洲的帝国',
    steps: [
      {
        year: -336,
        lon: PLACES.pella.lon,
        lat: PLACES.pella.lat,
        height: 1200000,
        title: PLACES.pella.name,
        route: 'land',
        caption:
          '公元前 336 年，亚历山大在马其顿首都佩拉即位，随即平定希腊各邦，着手筹划东征波斯。',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: -334,
        lon: PLACES.troy.lon,
        lat: PLACES.troy.lat,
        height: 1150000,
        title: PLACES.troy.name,
        route: 'land',
        caption:
          '公元前 334 年，亚历山大率军渡过赫勒斯滂海峡登陆小亚细亚，在格拉尼库斯河首战击败波斯军队。',
        radiusKm: 200,
        duration: 4400,
      },
      {
        year: -333,
        lon: PLACES.issus.lon,
        lat: PLACES.issus.lat,
        height: 1200000,
        title: PLACES.issus.name,
        route: 'land',
        caption:
          '公元前 333 年伊苏斯战役，马其顿军队击败大流士三世，波斯国王弃阵而逃，通往叙利亚与埃及的道路洞开。',
        // Rough footprint of the Issus battlefield near the Pinarus river.
        region: [
          [35.7, 37.1],
          [36.7, 37.1],
          [36.8, 36.5],
          [35.6, 36.5],
        ],
        regionLabel: '伊苏斯',
        duration: 4500,
      },
      {
        year: -332,
        lon: PLACES.tyre.lon,
        lat: PLACES.tyre.lat,
        height: 1200000,
        title: PLACES.tyre.name,
        route: 'land',
        caption:
          '公元前 332 年，亚历山大围攻坚城推罗七个月后破城，控制腓尼基海港，切断波斯海军在地中海的补给。',
        radiusKm: 200,
        duration: 4400,
      },
      {
        year: -331,
        lon: PLACES.alexandria.lon,
        lat: PLACES.alexandria.lat,
        height: 1200000,
        title: PLACES.alexandria.name,
        route: 'land',
        caption:
          '公元前 331 年，亚历山大在尼罗河口建立亚历山大港，这座以他命名的城市日后成为地中海东部的学术与商贸中心。',
        radiusKm: 220,
        duration: 4500,
      },
      {
        year: -331,
        lon: PLACES.babylon.lon,
        lat: PLACES.babylon.lat,
        height: 1200000,
        title: PLACES.babylon.name,
        route: 'land',
        caption:
          '公元前 331 年高加米拉战役后，亚历山大进入巴比伦，波斯帝国的核心区域被纳入马其顿的版图。',
        radiusKm: 320,
        duration: 4500,
      },
      {
        year: -326,
        lon: PLACES.indus.lon,
        lat: PLACES.indus.lat,
        height: 1300000,
        title: PLACES.indus.name,
        route: 'land',
        view: { headingOffset: 30 },
        caption:
          '公元前 326 年，马其顿军队抵达印度河，在希达斯皮斯河战胜波罗斯，因士卒疲惫而停止继续东进。',
        // Rough footprint of the Indus valley around the Hydaspes crossing.
        region: [
          [72.0, 34.4],
          [73.6, 34.5],
          [73.8, 33.3],
          [71.8, 33.2],
        ],
        regionLabel: '印度河',
        duration: 4500,
      },
    ],
  },
  {
    id: 'mongol-westward',
    title: '蒙古西征',
    subtitle: '从蒙古高原到中欧，三次西征震撼欧亚大陆',
    steps: [
      {
        year: 1219,
        lon: PLACES.karakorum.lon,
        lat: PLACES.karakorum.lat,
        height: 1200000,
        title: PLACES.karakorum.name,
        route: 'land',
        caption:
          '1219 年，成吉思汗以蒙古高原为基地兴兵西征，讨伐中亚的花剌子模，蒙古铁骑开始踏入西方。',
        radiusKm: 250,
        duration: 4500,
      },
      {
        year: 1220,
        lon: PLACES.samarkand.lon,
        lat: PLACES.samarkand.lat,
        height: 1200000,
        title: PLACES.samarkand.name,
        route: 'land',
        view: { headingOffset: 30 },
        caption:
          '1220 年，蒙古军围攻并攻陷撒马尔罕，花剌子模的重要城市被毁，河中地区被纳入蒙古统治。',
        radiusKm: 300,
        duration: 4400,
      },
      {
        year: 1258,
        lon: PLACES.baghdad.lon,
        lat: PLACES.baghdad.lat,
        height: 1200000,
        title: PLACES.baghdad.name,
        route: 'land',
        caption:
          '1258 年，旭烈兀率蒙古军攻陷巴格达，阿拔斯哈里发政权灭亡，两河流域遭到严重破坏。',
        radiusKm: 300,
        duration: 4500,
      },
      {
        year: 1240,
        lon: PLACES.kyiv.lon,
        lat: PLACES.kyiv.lat,
        height: 1200000,
        title: PLACES.kyiv.name,
        route: 'land',
        caption:
          '1240 年，拔都率蒙古军攻陷基辅，基辅罗斯的核心城市被毁，东欧进入蒙古统治的时代。',
        radiusKm: 250,
        duration: 4400,
      },
      {
        year: 1241,
        lon: PLACES.legnica.lon,
        lat: PLACES.legnica.lat,
        height: 1100000,
        title: PLACES.legnica.name,
        route: 'land',
        caption:
          '1241 年莱格尼察战役，蒙古军击败波兰与德意志联军，西欧直面来自东方的军事压力。',
        // Rough footprint of the Legnica battlefield in Silesia.
        region: [
          [15.6, 51.5],
          [16.8, 51.5],
          [16.9, 50.9],
          [15.5, 50.9],
        ],
        regionLabel: '莱格尼察',
        duration: 4400,
      },
      {
        year: 1242,
        lon: PLACES.vienna.lon,
        lat: PLACES.vienna.lat,
        height: 1100000,
        title: PLACES.vienna.name,
        route: 'land',
        caption:
          '1242 年，蒙古军进抵维也纳附近，因窝阔台汗去世的消息传来而回师，中欧暂避兵锋。',
        radiusKm: 220,
        duration: 4400,
      },
    ],
  },
  {
    id: 'crusades',
    title: '十字军东征',
    subtitle: '从克莱蒙到阿卡，两百年间东征与十字军国家',
    steps: [
      {
        year: 1095,
        lon: PLACES.clermont.lon,
        lat: PLACES.clermont.lat,
        height: 1200000,
        title: PLACES.clermont.name,
        route: 'air',
        caption:
          '1095 年，教宗乌尔班二世在克莱蒙号召十字军东征，欧洲贵族与民众响应，踏上前往圣地的道路。',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: 1097,
        lon: PLACES.constantinople.lon,
        lat: PLACES.constantinople.lat,
        height: 1150000,
        title: PLACES.constantinople.name,
        route: 'air',
        caption:
          '1097 年，各路十字军陆续抵达君士坦丁堡，随后渡过博斯普鲁斯海峡，进入小亚细亚腹地。',
        radiusKm: 220,
        duration: 4400,
      },
      {
        year: 1097,
        lon: PLACES.nicaea.lon,
        lat: PLACES.nicaea.lat,
        height: 1150000,
        title: PLACES.nicaea.name,
        route: 'air',
        caption:
          '1097 年，十字军围攻尼西亚，塞尔柱守军投降，拜占庭重新控制这座小亚细亚重镇。',
        radiusKm: 200,
        duration: 4400,
      },
      {
        year: 1098,
        lon: PLACES.antioch.lon,
        lat: PLACES.antioch.lat,
        height: 1200000,
        title: PLACES.antioch.name,
        route: 'land',
        caption:
          '1098 年，十字军经长期围困攻占安条克，建立第一次东征中的主要据点，继续向圣地推进。',
        // Rough footprint of the Principality of Antioch.
        region: [
          [35.8, 37.2],
          [36.8, 37.2],
          [37.0, 36.0],
          [35.9, 36.0],
        ],
        regionLabel: '安条克公国',
        duration: 4400,
      },
      {
        year: 1099,
        lon: PLACES.jerusalem.lon,
        lat: PLACES.jerusalem.lat,
        height: 1150000,
        title: PLACES.jerusalem.name,
        route: 'land',
        caption:
          '1099 年，十字军攻陷耶路撒冷，建立耶路撒冷王国，地中海东岸出现一系列十字军国家。',
        // Rough footprint of the Kingdom of Jerusalem.
        region: [
          [34.3, 33.3],
          [35.6, 33.4],
          [35.9, 31.2],
          [34.3, 31.2],
        ],
        regionLabel: '耶路撒冷王国',
        duration: 4500,
      },
      {
        year: 1191,
        lon: PLACES.acre.lon,
        lat: PLACES.acre.lat,
        height: 1100000,
        title: PLACES.acre.name,
        route: 'land',
        caption:
          '1191 年，第三次十字军攻占阿卡，这座港口成为十字军国家在黎凡特的主要据点。',
        radiusKm: 200,
        duration: 4400,
      },
    ],
  },
  {
    id: 'islamic-expansion',
    title: '伊斯兰扩张',
    subtitle: '从麦地那到科尔多瓦，阿拉伯帝国横跨亚非欧',
    steps: [
      {
        year: 622,
        lon: PLACES.medina.lon,
        lat: PLACES.medina.lat,
        height: 1200000,
        title: PLACES.medina.name,
        route: 'land',
        caption:
          '622 年，穆罕默德自麦加迁往麦地那，建立最早的穆斯林社群，伊斯兰历由此纪元。',
        radiusKm: 220,
        duration: 4400,
      },
      {
        year: 635,
        lon: PLACES.damascus.lon,
        lat: PLACES.damascus.lat,
        height: 1200000,
        title: PLACES.damascus.name,
        route: 'land',
        caption:
          '635 年，穆斯林军队攻占大马士革，叙利亚大部分地区随之纳入阿拉伯帝国的版图。',
        radiusKm: 280,
        duration: 4400,
      },
      {
        year: 638,
        lon: PLACES.jerusalem.lon,
        lat: PLACES.jerusalem.lat,
        height: 1200000,
        title: PLACES.jerusalem.name,
        route: 'land',
        caption:
          '638 年，穆斯林军队攻占耶路撒冷，这座城市此后成为伊斯兰教的重要圣地。',
        radiusKm: 240,
        duration: 4400,
      },
      {
        year: 641,
        lon: PLACES.cairo.lon,
        lat: PLACES.cairo.lat,
        height: 1200000,
        title: PLACES.cairo.name,
        route: 'land',
        caption:
          '641 年，阿拉伯军队征服埃及并建立福斯塔特，开罗一带由此成为阿拉伯帝国的重要行省。',
        radiusKm: 250,
        duration: 4400,
      },
      {
        year: 698,
        lon: PLACES.carthage.lon,
        lat: PLACES.carthage.lat,
        height: 1200000,
        title: PLACES.carthage.name,
        route: 'land',
        caption:
          '698 年，阿拉伯军队攻占迦太基，罗马在北非的统治终结，北非沿岸被纳入帝国。',
        radiusKm: 250,
        duration: 4400,
      },
      {
        year: 711,
        lon: PLACES.cordoba.lon,
        lat: PLACES.cordoba.lat,
        height: 1200000,
        title: PLACES.cordoba.name,
        route: 'air',
        caption:
          '711 年，阿拉伯军队渡过直布罗陀海峡进入伊比利亚，科尔多瓦成为安达卢斯的统治中心。',
        // Rough footprint of al-Andalus in the Iberian Peninsula.
        region: [
          [-7.6, 38.2],
          [-2.5, 38.0],
          [-1.5, 37.0],
          [-5.5, 36.2],
          [-7.4, 36.8],
        ],
        regionLabel: '安达卢斯',
        duration: 4500,
      },
    ],
  },
  {
    id: 'renaissance',
    title: '文艺复兴',
    subtitle: '从佛罗伦萨到伦敦，人文主义与艺术革新席卷欧洲',
    steps: [
      {
        year: 1401,
        lon: PLACES.florence.lon,
        lat: PLACES.florence.lat,
        height: 1200000,
        title: PLACES.florence.name,
        route: 'land',
        caption:
          '1401 年，佛罗伦萨圣母百花大教堂青铜门竞标，艺术资助与人文主义在此兴起，文艺复兴由此开端。',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: 1508,
        lon: PLACES.rome.lon,
        lat: PLACES.rome.lat,
        height: 1200000,
        title: PLACES.rome.name,
        route: 'land',
        caption:
          '1508 年，米开朗基罗开始绘制西斯廷教堂天顶画，罗马成为文艺复兴盛期的艺术中心。',
        radiusKm: 250,
        duration: 4400,
      },
      {
        year: 1516,
        lon: PLACES.venice.lon,
        lat: PLACES.venice.lat,
        height: 1200000,
        title: PLACES.venice.name,
        route: 'land',
        caption:
          '1516 年，提香成为威尼斯画派核心，这座城市凭借绘画与印刷业把文艺复兴推向欧洲各地。',
        radiusKm: 220,
        duration: 4400,
      },
      {
        year: 1498,
        lon: PLACES.milan.lon,
        lat: PLACES.milan.lat,
        height: 1150000,
        title: PLACES.milan.name,
        route: 'land',
        caption:
          '1498 年，达·芬奇在米兰完成《最后的晚餐》，他的技法与科学研究影响了后来的欧洲艺术。',
        radiusKm: 220,
        duration: 4400,
      },
      {
        year: 1515,
        lon: PLACES.paris.lon,
        lat: PLACES.paris.lat,
        height: 1150000,
        title: PLACES.paris.name,
        route: 'land',
        caption:
          '1515 年，弗朗索瓦一世即位后大力延揽艺术家，法国宫廷推动文艺复兴风格在法国传播。',
        radiusKm: 240,
        duration: 4400,
      },
      {
        year: 1599,
        lon: PLACES.london.lon,
        lat: PLACES.london.lat,
        height: 1150000,
        title: PLACES.london.name,
        route: 'land',
        caption:
          '1599 年，伦敦环球剧场落成，莎士比亚的剧作在此上演，英国文艺复兴迎来高峰。',
        radiusKm: 240,
        duration: 4500,
      },
    ],
  },
  {
    id: 'industrial-revolution',
    title: '工业革命',
    subtitle: '从曼彻斯特到柏林，机器与铁路重塑欧洲',
    steps: [
      {
        year: 1785,
        lon: PLACES.manchester.lon,
        lat: PLACES.manchester.lat,
        height: 1200000,
        title: PLACES.manchester.name,
        route: 'land',
        caption:
          '1785 年前后，蒸汽动力驱动纺织机在曼彻斯特普及，棉纺织业把这座城镇变成工业中心。',
        radiusKm: 250,
        duration: 4500,
      },
      {
        year: 1830,
        lon: PLACES.liverpool.lon,
        lat: PLACES.liverpool.lat,
        height: 1100000,
        title: PLACES.liverpool.name,
        route: 'land',
        caption:
          '1830 年，利物浦至曼彻斯特铁路通车，这是世界首条城际铁路，标志着铁路时代来临。',
        radiusKm: 200,
        duration: 4400,
      },
      {
        year: 1851,
        lon: PLACES.london.lon,
        lat: PLACES.london.lat,
        height: 1150000,
        title: PLACES.london.name,
        route: 'land',
        caption:
          '1851 年，伦敦水晶宫举办万国工业博览会，展示机器制造的新时代，英国工业实力达到顶峰。',
        radiusKm: 250,
        duration: 4500,
      },
      {
        year: 1889,
        lon: PLACES.paris.lon,
        lat: PLACES.paris.lat,
        height: 1150000,
        title: PLACES.paris.name,
        route: 'land',
        caption:
          '1889 年，巴黎世界博览会与埃菲尔铁塔落成，工业技术开始成为国家实力的象征。',
        radiusKm: 240,
        duration: 4400,
      },
      {
        year: 1861,
        lon: PLACES.essen.lon,
        lat: PLACES.essen.lat,
        height: 1100000,
        title: PLACES.essen.name,
        route: 'land',
        caption:
          '1861 年，克虏伯钢铁厂在埃森迅速扩张，鲁尔区崛起为德国工业的心脏地带。',
        radiusKm: 250,
        duration: 4400,
      },
      {
        year: 1896,
        lon: PLACES.berlin.lon,
        lat: PLACES.berlin.lat,
        height: 1150000,
        title: PLACES.berlin.name,
        route: 'land',
        caption:
          '1896 年，柏林工业博览会召开，统一后的德国凭借电气与钢铁产业跃居欧洲工业前列。',
        radiusKm: 250,
        duration: 4400,
      },
    ],
  },
  {
    id: 'american-revolution',
    title: '美国独立战争',
    subtitle: '从波士顿到约克镇，十三个殖民地赢得独立',
    steps: [
      {
        year: 1773,
        lon: PLACES.boston.lon,
        lat: PLACES.boston.lat,
        height: 1100000,
        title: PLACES.boston.name,
        route: 'land',
        caption:
          '1773 年，波士顿倾茶事件爆发，殖民地民众反对英国征税，反抗情绪迅速蔓延。',
        radiusKm: 220,
        duration: 4400,
      },
      {
        year: 1775,
        lon: PLACES.lexington.lon,
        lat: PLACES.lexington.lat,
        height: 1100000,
        title: PLACES.lexington.name,
        route: 'land',
        view: { rangeScale: 0.8, headingOffset: 15 },
        caption:
          '1775 年，莱克星顿与康科德打响独立战争第一枪，北美殖民地与英国的武装冲突开始。',
        // Rough footprint of the Lexington and Concord battle area.
        region: [
          [-71.4, 42.55],
          [-71.0, 42.55],
          [-70.9, 42.35],
          [-71.3, 42.35],
        ],
        regionLabel: '莱克星顿',
        duration: 4400,
      },
      {
        year: 1776,
        lon: PLACES.newYork.lon,
        lat: PLACES.newYork.lat,
        height: 1150000,
        title: PLACES.newYork.name,
        route: 'land',
        caption:
          '1776 年，英军攻占纽约，华盛顿率大陆军撤退，独立战争进入最艰难的阶段。',
        radiusKm: 240,
        duration: 4400,
      },
      {
        year: 1776,
        lon: PLACES.philadelphia.lon,
        lat: PLACES.philadelphia.lat,
        height: 1150000,
        title: PLACES.philadelphia.name,
        route: 'land',
        caption:
          '1776 年，第二届大陆会议在费城通过《独立宣言》，宣布北美殖民地脱离英国独立。',
        radiusKm: 240,
        duration: 4400,
      },
      {
        year: 1777,
        lon: PLACES.saratoga.lon,
        lat: PLACES.saratoga.lat,
        height: 1150000,
        title: PLACES.saratoga.name,
        route: 'land',
        caption:
          '1777 年，萨拉托加战役中美军迫使英军投降，成为独立战争的转折点，并促成法国参战。',
        // Rough footprint of the Saratoga battles along the Hudson.
        region: [
          [-74.3, 43.3],
          [-73.3, 43.4],
          [-73.1, 42.7],
          [-74.2, 42.6],
        ],
        regionLabel: '萨拉托加',
        duration: 4500,
      },
      {
        year: 1781,
        lon: PLACES.yorktown.lon,
        lat: PLACES.yorktown.lat,
        height: 1150000,
        title: PLACES.yorktown.name,
        route: 'land',
        caption:
          '1781 年，美法联军在约克镇围困并迫使英军主力投降，独立战争的决定性战役结束。',
        // Rough footprint of the Yorktown peninsula where the siege took place.
        region: [
          [-76.9, 37.4],
          [-76.0, 37.5],
          [-75.9, 36.9],
          [-76.8, 36.9],
        ],
        regionLabel: '约克镇',
        duration: 4500,
      },
    ],
  },
  {
    id: 'french-revolution',
    title: '法国大革命',
    subtitle: '从凡尔赛到巴黎，旧制度崩溃与共和国诞生',
    steps: [
      {
        year: 1789,
        lon: PLACES.versailles.lon,
        lat: PLACES.versailles.lat,
        title: PLACES.versailles.name,
        route: 'land',
        caption:
          '1789 年，三级会议在凡尔赛召开，第三等级代表进行网球场宣誓，要求制定宪法。',
        radiusKm: 220,
        duration: 4500,
      },
      {
        year: 1789,
        lon: PLACES.paris.lon,
        lat: PLACES.paris.lat,
        title: PLACES.paris.name,
        route: 'land',
        view: { rangeScale: 0.8, headingOffset: 15 },
        caption:
          '1789 年 7 月，巴黎民众攻占巴士底狱，大革命爆发，随后《人权宣言》宣布自由平等原则。',
        radiusKm: 250,
        duration: 4500,
      },
      {
        year: 1791,
        lon: PLACES.varennes.lon,
        lat: PLACES.varennes.lat,
        title: PLACES.varennes.name,
        route: 'land',
        caption:
          '1791 年，国王路易十六出逃在瓦雷讷被截获押回巴黎，君主制信用进一步动摇。',
        radiusKm: 200,
        duration: 4400,
      },
      {
        year: 1792,
        lon: PLACES.valmy.lon,
        lat: PLACES.valmy.lat,
        title: PLACES.valmy.name,
        route: 'land',
        view: { rangeScale: 0.8, headingOffset: 15 },
        caption:
          '1792 年，法国革命军在瓦尔密击退普鲁士军队，共和国由此转危为安，得以继续存在。',
        // Rough footprint of the Valmy battlefield.
        region: [
          [4.0, 49.3],
          [5.0, 49.3],
          [5.1, 48.9],
          [3.9, 48.9],
        ],
        regionLabel: '瓦尔密',
        duration: 4400,
      },
      {
        year: 1793,
        lon: PLACES.paris.lon,
        lat: PLACES.paris.lat,
        title: PLACES.paris.name,
        route: 'land',
        caption:
          '1793 年，路易十六在巴黎被送上断头台，恐怖统治随之展开，法国进入激进阶段。',
        radiusKm: 250,
        duration: 4400,
      },
      {
        year: 1793,
        lon: PLACES.toulon.lon,
        lat: PLACES.toulon.lat,
        title: PLACES.toulon.name,
        route: 'land',
        caption:
          '1793 年，拿破仑在土伦战役中收复港口，开始崭露头角，为后来的崛起奠定基础。',
        // Rough footprint of the Toulon harbour and its heights.
        region: [
          [5.6, 43.25],
          [6.2, 43.25],
          [6.3, 42.95],
          [5.5, 42.95],
        ],
        regionLabel: '土伦',
        duration: 4400,
      },
    ],
  },
  {
    id: 'world-war-i',
    title: '第一次世界大战',
    subtitle: '从萨拉热窝到巴黎，一场席卷欧洲的总体战',
    steps: [
      {
        year: 1914,
        lon: PLACES.sarajevo.lon,
        lat: PLACES.sarajevo.lat,
        height: 1100000,
        title: PLACES.sarajevo.name,
        route: 'land',
        caption:
          '1914 年，斐迪南大公在萨拉热窝遇刺，奥匈帝国以此为由对塞尔维亚宣战，一战爆发。',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: 1914,
        lon: PLACES.belgrade.lon,
        lat: PLACES.belgrade.lat,
        height: 1100000,
        title: PLACES.belgrade.name,
        route: 'land',
        caption:
          '1914 年，奥匈帝国军队进攻塞尔维亚并炮击贝尔格莱德，巴尔干战线全面展开。',
        radiusKm: 200,
        duration: 4400,
      },
      {
        year: 1914,
        lon: PLACES.marne.lon,
        lat: PLACES.marne.lat,
        height: 1150000,
        title: PLACES.marne.name,
        route: 'land',
        caption:
          '1914 年马恩河战役，法英联军阻止德军逼近巴黎，西线从此转入漫长的堑壕战。',
        // Rough footprint of the Marne front east of Paris.
        region: [
          [2.2, 49.2],
          [3.8, 49.3],
          [4.0, 48.7],
          [2.3, 48.6],
        ],
        regionLabel: '马恩河',
        duration: 4400,
      },
      {
        year: 1916,
        lon: PLACES.verdun.lon,
        lat: PLACES.verdun.lat,
        height: 1150000,
        title: PLACES.verdun.name,
        route: 'land',
        caption:
          '1916 年凡尔登战役以“绞肉机”闻名，法德双方伤亡惨重，战线却几乎未变。',
        // Rough footprint of the Verdun salient on the Meuse.
        region: [
          [4.9, 49.4],
          [5.9, 49.4],
          [6.0, 49.0],
          [4.8, 49.0],
        ],
        regionLabel: '凡尔登',
        duration: 4500,
      },
      {
        year: 1916,
        lon: PLACES.somme.lon,
        lat: PLACES.somme.lat,
        height: 1100000,
        title: PLACES.somme.name,
        route: 'land',
        caption:
          '1916 年索姆河战役中坦克首次投入战场，工业化战争造成巨大伤亡却未打破僵局。',
        // Rough footprint of the Somme front in Picardy.
        region: [
          [2.0, 50.25],
          [3.5, 50.3],
          [3.6, 49.75],
          [2.0, 49.7],
        ],
        regionLabel: '索姆河',
        duration: 4400,
      },
      {
        year: 1919,
        lon: PLACES.paris.lon,
        lat: PLACES.paris.lat,
        height: 1100000,
        title: PLACES.paris.name,
        route: 'land',
        caption:
          '1919 年，巴黎和会召开并签署《凡尔赛条约》，重划欧洲版图并严惩德国，埋下新冲突的种子。',
        radiusKm: 250,
        duration: 4500,
      },
    ],
  },
  {
    id: 'world-war-ii-europe',
    title: '二战欧洲战场',
    subtitle: '从柏林到柏林，欧洲在两次总攻间沉浮',
    steps: [
      {
        year: 1939,
        lon: PLACES.berlin.lon,
        lat: PLACES.berlin.lat,
        height: 1150000,
        title: PLACES.berlin.name,
        route: 'land',
        caption:
          '1939 年，德国从柏林下达进攻波兰的命令，欧洲战场的第二次世界大战由此爆发。',
        radiusKm: 250,
        duration: 4500,
      },
      {
        year: 1939,
        lon: PLACES.warsaw.lon,
        lat: PLACES.warsaw.lat,
        height: 1150000,
        title: PLACES.warsaw.name,
        route: 'land',
        caption:
          '1939 年，德军闪击波兰并攻陷华沙，英法对德宣战，欧洲陷入全面战争。',
        radiusKm: 240,
        duration: 4400,
      },
      {
        year: 1940,
        lon: PLACES.dunkirk.lon,
        lat: PLACES.dunkirk.lat,
        height: 1100000,
        title: PLACES.dunkirk.name,
        route: 'air',
        caption:
          '1940 年，英法联军从敦刻尔克经海路撤往英国，保住了日后反攻的骨干力量。',
        // Rough footprint of the Dunkirk evacuation perimeter.
        region: [
          [2.1, 51.15],
          [2.7, 51.15],
          [2.8, 50.85],
          [2.2, 50.85],
        ],
        regionLabel: '敦刻尔克',
        duration: 4400,
      },
      {
        year: 1942,
        lon: PLACES.stalingrad.lon,
        lat: PLACES.stalingrad.lat,
        height: 1150000,
        title: PLACES.stalingrad.name,
        route: 'land',
        view: { headingOffset: 30 },
        caption:
          '1942 至 1943 年，斯大林格勒战役以德军失败告终，成为欧洲战场的转折点。',
        radiusKm: 250,
        duration: 4500,
      },
      {
        year: 1944,
        lon: PLACES.normandy.lon,
        lat: PLACES.normandy.lat,
        height: 1100000,
        title: PLACES.normandy.name,
        route: 'air',
        caption:
          '1944 年，盟军渡过英吉利海峡在诺曼底登陆，开辟第二战场，德军陷入两线夹击。',
        // Rough footprint of the Normandy coast where the landings took place.
        region: [
          [-1.9, 49.75],
          [0.6, 49.9],
          [1.6, 49.3],
          [-0.1, 48.5],
          [-1.7, 48.4],
        ],
        regionLabel: '诺曼底',
        duration: 4400,
      },
      {
        year: 1945,
        lon: PLACES.berlin.lon,
        lat: PLACES.berlin.lat,
        height: 1100000,
        title: PLACES.berlin.name,
        route: 'land',
        caption:
          '1945 年，苏军攻克柏林，德国无条件投降，欧洲战场的战争宣告结束。',
        radiusKm: 250,
        duration: 4500,
      },
    ],
  },
  {
    id: 'world-war-ii-pacific',
    title: '二战太平洋战场',
    subtitle: '从东京到广岛，太平洋上的岛屿争夺战',
    steps: [
      {
        year: 1941,
        lon: PLACES.tokyo.lon,
        lat: PLACES.tokyo.lat,
        height: 1300000,
        title: PLACES.tokyo.name,
        route: 'air',
        caption:
          '1941 年，日本决定对美开战，从东京发出偷袭珍珠港的命令，太平洋战争一触即发。',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: 1941,
        lon: PLACES.pearlHarbor.lon,
        lat: PLACES.pearlHarbor.lat,
        height: 1500000,
        title: PLACES.pearlHarbor.name,
        route: 'air',
        caption:
          '1941 年，日本海军偷袭珍珠港，美国对日宣战，太平洋战争全面爆发。',
        // Rough footprint of Pearl Harbor on O'ahu.
        region: [
          [-158.1, 21.45],
          [-157.7, 21.45],
          [-157.6, 21.15],
          [-158.0, 21.15],
        ],
        regionLabel: '珍珠港',
        duration: 4500,
      },
      {
        year: 1942,
        lon: PLACES.midway.lon,
        lat: PLACES.midway.lat,
        height: 1500000,
        title: PLACES.midway.name,
        route: 'air',
        caption:
          '1942 年中途岛海战，美军重创日本航母编队，太平洋战场的攻守态势由此逆转。',
        // Rough footprint of Midway Atoll.
        region: [
          [-177.5, 28.3],
          [-177.3, 28.3],
          [-177.2, 28.1],
          [-177.5, 28.1],
        ],
        regionLabel: '中途岛',
        duration: 4400,
      },
      {
        year: 1942,
        lon: PLACES.guadalcanal.lon,
        lat: PLACES.guadalcanal.lat,
        height: 1400000,
        title: PLACES.guadalcanal.name,
        route: 'air',
        caption:
          '1942 至 1943 年瓜岛战役，美军夺取瓜达尔卡纳尔，开始逐岛反攻日本。',
        // Rough footprint of Guadalcanal island.
        region: [
          [159.5, -9.2],
          [160.6, -9.2],
          [160.8, -9.6],
          [160.0, -9.8],
          [159.4, -9.6],
        ],
        regionLabel: '瓜达尔卡纳尔',
        duration: 4400,
      },
      {
        year: 1945,
        lon: PLACES.okinawa.lon,
        lat: PLACES.okinawa.lat,
        height: 1300000,
        title: PLACES.okinawa.name,
        route: 'air',
        caption:
          '1945 年冲绳战役，美军逼近日本本土，双方伤亡惨重，日本败局已定。',
        // Rough footprint of Okinawa island.
        region: [
          [127.5, 26.6],
          [128.0, 26.6],
          [128.2, 26.0],
          [127.6, 26.0],
          [127.4, 26.2],
        ],
        regionLabel: '冲绳',
        duration: 4400,
      },
      {
        year: 1945,
        lon: PLACES.hiroshima.lon,
        lat: PLACES.hiroshima.lat,
        height: 1300000,
        title: PLACES.hiroshima.name,
        route: 'air',
        caption:
          '1945 年，美国在广岛投下原子弹，数日后日本宣布投降，第二次世界大战结束。',
        radiusKm: 220,
        duration: 4500,
      },
    ],
  },
  {
    id: 'cold-war',
    title: '冷战',
    subtitle: '从雅尔塔到哈瓦那，两大阵营的对峙与核危机',
    steps: [
      {
        year: 1945,
        lon: PLACES.yalta.lon,
        lat: PLACES.yalta.lat,
        height: 1200000,
        title: PLACES.yalta.name,
        route: 'land',
        caption:
          '1945 年雅尔塔会议，美英苏三国首脑划定战后欧洲格局，为冷战埋下伏笔。',
        radiusKm: 220,
        duration: 4500,
      },
      {
        year: 1948,
        lon: PLACES.berlin.lon,
        lat: PLACES.berlin.lat,
        height: 1150000,
        title: PLACES.berlin.name,
        route: 'land',
        caption:
          '1948 年，苏联封锁西柏林，西方以空运回应，柏林成为冷战对峙的最前沿。',
        // Rough footprint of divided Berlin during the blockade.
        region: [
          [13.0, 52.7],
          [13.8, 52.7],
          [13.8, 52.3],
          [13.0, 52.3],
        ],
        regionLabel: '柏林',
        duration: 4400,
      },
      {
        year: 1949,
        lon: PLACES.washington.lon,
        lat: PLACES.washington.lat,
        height: 1300000,
        title: PLACES.washington.name,
        route: 'air',
        caption:
          '1949 年，美国等十二国在华盛顿签署条约成立北约，西方阵营由此成形。',
        radiusKm: 250,
        duration: 4400,
      },
      {
        year: 1955,
        lon: PLACES.moscow.lon,
        lat: PLACES.moscow.lat,
        height: 1200000,
        title: PLACES.moscow.name,
        route: 'air',
        caption:
          '1955 年，苏联与东欧国家在莫斯科签署华沙条约，两大军事集团对峙格局确立。',
        radiusKm: 250,
        duration: 4500,
      },
      {
        year: 1961,
        lon: PLACES.vienna.lon,
        lat: PLACES.vienna.lat,
        height: 1150000,
        title: PLACES.vienna.name,
        route: 'land',
        caption:
          '1961 年，肯尼迪与赫鲁晓夫在维也纳会晤，柏林问题与核军备竞赛成为焦点。',
        radiusKm: 200,
        duration: 4400,
      },
      {
        year: 1962,
        lon: PLACES.havana.lon,
        lat: PLACES.havana.lat,
        height: 1300000,
        title: PLACES.havana.name,
        route: 'air',
        caption:
          '1962 年古巴导弹危机，美苏在哈瓦那附近走向核战边缘，随后达成妥协缓和关系。',
        // Rough footprint of Cuba.
        region: [
          [-85.0, 23.3],
          [-74.0, 23.5],
          [-74.2, 19.8],
          [-84.9, 19.8],
        ],
        regionLabel: '古巴',
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
    if (story.steps.length < 6) {
      fail(`"${story.id}" has only ${story.steps.length} steps (need at least 6)`);
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
      if (step.route !== undefined && !['land', 'air', 'sea'].includes(step.route)) {
        fail(`${where}: route "${step.route}" is invalid`);
      }
    });
  }

  return ok;
}

if (import.meta.env.DEV) validateStories(STORIES);
