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
          '公元前 138 年，张骞奉汉武帝之命自长安西行，欲联络大月氏共击匈奴，以断其右臂。使团取道陇西进入河西，为匈奴所扣，滞留多年，据载前后十余年方得东归。汉朝随后经营河西、设郡置关，长安遂成丝路东端的起点，丝绸、漆器与文书由此西传。',
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
          '公元前 111 年，汉武帝分置敦煌郡，玉门关与阳关控扼西域门户，河西四郡至此完备。商队出关需验传符、补给粮秣，僧人亦在此驻足译经。莫高窟自十六国时期开凿，壁画与经卷累积千年，敦煌成为丝路上宗教与商贸交汇的枢纽。',
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
          '公元前 128 年前后，张骞的副使抵达粟特城邦。据载，撒马尔罕一带的市集上可见来自中国的丝帛与邛竹杖，印度的香料与波斯的银器亦汇于此。粟特商人往来于草原与绿洲之间，充当货物与消息的中介，其商站网络绵延至长安。',
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
          '762 年，阿拔斯哈里发曼苏尔在底格里斯河畔营建巴格达，以圆形城墙环护宫殿与清真寺。城市地处两河与波斯湾航路之间，东方货物可经海路入港，再由陆路转往叙利亚与地中海。巴格达遂成西段商路枢纽，丝绸、瓷器与香料在此集散。',
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
          '330 年，君士坦丁大帝将帝国新都定于博斯普鲁斯海峡西岸，以自己之名命名。城市扼守欧亚之间的水路，黑海的粮食与东方的货物皆须经此转运。丝绸在此被课以重税，朝廷设专门机构控制紫色丝料，丝路西端的贸易秩序由此确立。',
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
          '117 年，图拉真在位末期，罗马帝国版图达到极盛，地中海几乎成为内海。东方丝绸经帕提亚与红海航路运抵罗马，价格极为高昂，据载与同等重量的黄金相当。元老院曾多次下令限制男子穿着丝绸，以遏制金银外流，然禁令收效有限。',
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
          '1271 年，马可·波罗随父亲与叔父自威尼斯启程东行，取道地中海东岸与蒙古驿路前往上都。威尼斯凭舰队与商站网络控制亚得里亚海贸易，并从埃及与黑海两路转运东方货物。此后数百年，这座潟湖城邦长期居于欧洲与东方贸易的前列。',
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
          '661 年，穆阿维叶在大马士革被拥立为哈里发，倭马亚王朝自此定都于此。商队由城中出发，西连地中海港口，东经两河流域通往中亚与长安，南北则接阿拉伯半岛的商路。沿途驿站相继设立，货物与钱币随之流通，大马士革成为东西贸易的重要中转站。',
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
          '15 世纪初，葡萄牙以里斯本为基地探索非洲西岸，恩里克王子主持航海事务，资助船队南下。航海者在马德拉、亚速尔与几内亚湾积累风向、洋流与海图知识。里斯本由此成为大西洋航行的情报与补给中心，为后来的远洋探索奠定基础。',
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
          '1415 年，葡萄牙国王若昂一世率军攻占北非的休达，控制直布罗陀海峡南岸，并在此修筑城防。此役被视为葡萄牙海外扩张的开端，王室由此获得北非贸易与十字军声望。随后船队沿非洲西岸南下，寻找通往西非黄金与香料产地的新航路。',
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
          '1420 年前后，葡萄牙航海者抵达马德拉群岛并开始殖民，在岛上试种甘蔗与葡萄，引入牲畜与作物。甘蔗种植需要大量劳力与水源，灌溉渠与种植园制度随之建立。马德拉的糖与葡萄酒成为王室收入来源，也为大西洋岛屿的殖民经营提供了范本。',
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
          '1462 年前后，葡萄牙船队抵达佛得角群岛并建立据点，大西洋航线继续向南延伸。群岛地处几内亚湾航路要冲，成为贩运西非黄金、象牙与奴隶的中转站，葡萄牙王室在此设立商站并课税。甘蔗种植与奴隶贸易由此进入跨洋体系，大西洋经济开始成形。',
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
          '1488 年，迪亚士率船队自葡萄牙南下，遭遇风暴后绕过非洲南端，命名风暴角，后由国王改称好望角。此行证明大西洋与印度洋相通，为直达印度的航线扫清了最后障碍。达伽马十年后沿此航路抵达卡利卡特，欧洲与印度洋的直航自此建立。',
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
          '1492 年，哥伦布率船队横渡大西洋，在巴哈马群岛登陆，随后在伊斯帕尼奥拉岛建立据点。此行的目标本是寻找通往亚洲的西航路，却将美洲纳入欧洲的视野。此后西班牙以美洲为基地开采白银、经营种植园，欧洲与美洲被纳入同一贸易网络。',
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
          '1498 年，达伽马绕过好望角抵达印度西海岸的卡利卡特，与当地统治者商谈通商，因关税与礼物之争未果。葡萄牙人绕开地中海与阿拉伯中间商，直接采购胡椒与香料，触动了旧有的贸易格局。此后葡萄牙在科钦、果阿设立商站，以舰队维持海上优势。',
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
          '1511 年，葡萄牙将领阿尔布克尔克攻占马六甲，控制东西方海上咽喉。马六甲素为印度洋与南海商路的交汇处，货物在此转运、征税。葡萄牙据城设防，向过往商船征收关税，招徕各地商人经营贸易，印度洋与南海商路被连成一体。',
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
          '1519 年，麦哲伦船队自塞维利亚出航，经大西洋南下，沿南美东岸寻找海峡，绕过南美大陆进入太平洋，向西寻找香料群岛。途中麦哲伦死于菲律宾，部分船员被当地人所杀，船队由埃尔卡诺带领继续西行。1522 年余部返回西班牙，完成人类首次环球航行。',
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
          '1571 年，西班牙人莱加斯皮在吕宋岛建立马尼拉城，以其为统治菲律宾的中心。大帆船每年自阿卡普尔科运来美洲白银，换取中国的丝绸、瓷器与东南亚的香料。跨太平洋贸易网由此成形，白银大量流入中国，也改变了东亚的货币与市场格局。',
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
          '1914 年，奥匈帝国皇储斐迪南大公在萨拉热窝遇刺，凶手为波斯尼亚塞族青年普林西普，刺杀由塞尔维亚的秘密组织策动。奥匈在德国支持下向塞尔维亚发出最后通牒，俄国随即动员，同盟体系连锁启动。数周之内，欧洲主要国家相继动员、宣战，战火遍及全欧。',
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
          '1914 年，德军进攻比利时列日要塞，执行施里芬计划，意图取道比利时直取巴黎。列日要塞据险坚守，迟滞德军推进数日，英国的参战使战火迅速蔓延为全欧战争。德军随后攻占比利时大部，直抵法国边境，但原定时间表已被打乱。',
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
          '1914 年，德军逼近巴黎，法军与英国远征军在马恩河一线发起反攻，即第一次马恩河战役。联军利用德军右翼兵力削弱、战线过长的空隙，迫使其后撤，施里芬计划宣告破产。西线从此转入漫长的堑壕战，双方沿阵地长期对峙，反复争夺。',
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
          '1916 年，德军选择凡尔登为进攻目标，意图消耗法军主力，使法国流尽鲜血，战役以密集炮火与反复争夺著称。法军由贝当指挥，沿唯一可用的补给公路持续增援，弹药与兵员昼夜不绝。数月鏖战后战线几乎未变，凡尔登成为“绞肉机”的代名词。',
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
          '1916 年，英法联军在索姆河一线发起进攻，以牵制凡尔登方向的德军。英军先以密集炮火摧毁德军阵地，随后步兵在炮火掩护下推进，收效有限。坦克首次投入战场，因数量与战术所限仍未打破僵局，巨大的伤亡暴露出工业化战争的残酷。',
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
          '1919 年，《凡尔赛条约》在凡尔赛宫镜厅签署，战胜国依据各自的利益重划欧洲版图。德国被要求承担战争责任、割让领土、限制军备并支付赔款，莱茵兰实行非军事化。条约埋下新的冲突种子，也深刻影响了此后二十年的欧洲秩序与民族关系。',
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
          '1939 年，德国军队进攻波兰，但泽与波兰走廊的归属成为导火索，德军以装甲部队与空军协同推进，实施闪击战。英法依约对德宣战，苏联亦自东面出兵，波兰在数周内陷落，政府流亡海外。欧洲再次陷入战火，第二次世界大战全面爆发。',
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
          '1940 年，德军装甲部队切断英法联军退路，将联军压缩在敦刻尔克海滨的狭小地带。英国动员军舰与民用船只参与救援，据载约三十万人撤回本土，其中多为英军。联军虽丢弃重装装备，却保住了日后反攻的骨干力量，士气得以维系。',
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
          '1941 年，德军发动对莫斯科的进攻，代号台风，装甲部队一度推进至城郊。苏军依托纵深防御与预备队反击，加之冬季严寒与补给困难，德军的闪电战首次遭遇战略失败。东线战局由此转向长期消耗，苏军随后在斯大林格勒一线展开反攻。',
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
          '1941 年，日本海军机动部队自北方航线隐蔽接近，偷袭珍珠港，港内舰船与飞机损失严重。次日美国对日宣战，德国与意大利随即对美宣战，太平洋战争全面爆发。反法西斯同盟正式形成，战争的规模扩至全球，美国由此全面卷入。',
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
          '1944 年，盟军渡过英吉利海峡，在诺曼底海滩登陆，行动代号霸王，开辟欧洲第二战场。登陆前盟军实施空中轰炸与欺骗行动，以分散德军注意力，登陆后逐步扩大滩头阵地。德军陷入东西两线夹击的困境，西线的态势由此逆转，巴黎随后获得解放。',
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
          '1945 年，苏军发起柏林战役，突破德军外围防线后攻入城区，巷战在废墟间持续多日。希特勒在总理府地下室自杀，德国随后签署无条件投降书，欧洲战场的战争宣告结束。战后德国由盟国分区占领，欧洲格局重新划定，德国的分裂与冷战对峙由此埋下伏笔。',
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
          '公元前 336 年，腓力二世遇刺身亡，其子亚历山大在马其顿首都佩拉即位。他迅即平定希腊诸邦的反抗，并镇压底比斯的反叛，以科林斯同盟的名义取得联军统帅之权。随后他筹划东征波斯，借口为希腊城邦复仇，集结马其顿与盟邦军队准备渡海。',
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
          '公元前 334 年，亚历山大率军渡过赫勒斯滂海峡，在特洛伊故地祭祀，宣示对波斯的战争。波斯总督在小亚细亚西北的格拉尼库斯河列阵迎击，马其顿骑兵突破其阵线。此战之后，小亚细亚西部诸希腊城邦相继归附，波斯在该地区的统治瓦解。',
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
          '公元前 333 年，亚历山大与波斯国王大流士三世在伊苏斯平原交战，波斯军据河列阵。马其顿方阵正面推进，骑兵从右翼突击，击穿波斯阵线，大流士弃阵而逃。此役使波斯王室辎重尽失，通往叙利亚与埃及的道路洞开，腓尼基与巴勒斯坦诸城随之动摇。',
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
          '公元前 332 年，亚历山大围攻腓尼基海港推罗，推罗依据海岛与城墙顽强抵抗，久攻不下。马其顿军修筑跨海堤道，并以舰队封锁海面，据载围城数月方得破城。推罗陷落后，亚历山大控制腓尼基海港，切断波斯海军在地中海的补给与兵源。',
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
          '公元前 331 年，亚历山大在尼罗河口选址建城，以自己之名命名，史称亚历山大港。城市位于海港与内陆之间，规划棋盘式街道与防波堤，兼得海陆之利，并借尼罗河支流连接内陆。此后托勒密王朝经营此地，亚历山大港成为地中海东部的学术与商贸中心。',
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
          '公元前 331 年，高加米拉战役后，亚历山大率军进入巴比伦，接受当地祭司与贵族的归附。波斯帝国的核心区域被纳入马其顿版图，亚历山大沿用波斯的行省与驿站制度。此后他继续东进，经波斯波利斯追逐大流士三世，直至其被部下所杀。',
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
          '公元前 326 年，马其顿军队抵达印度河，在希达斯皮斯河与波罗斯王交战，渡河取胜。因士卒疲惫、雨季将至，加之军中思归，亚历山大停止继续东进，在河边筑坛后班师。此次远征奠定希腊化世界在东方的影响范围，也打通了印度与地中海之间的商路。',
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
          '1219 年，成吉思汗以蒙古高原为基地兴兵西征，讨伐中亚的花剌子模。此前花剌子模守将杀害蒙古商队与使者，成吉思汗遣使交涉未果。蒙古军分路西进，草原上的驿站与牧场为大军提供了补给，中亚诸城相继陷落，铁骑由此踏入西方。',
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
          '1220 年，蒙古军围攻花剌子模重镇撒马尔罕，先以俘获的百姓与工匠充作前驱。守军抵抗数日后投降，城内的工匠与艺人被迁往东方，城市遭到严重破坏。河中地区自此被纳入蒙古统治，商路与灌溉系统逐步恢复，撒马尔罕仍是中亚的商贸中心。',
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
          '1258 年，旭烈兀率蒙古军攻陷巴格达，阿拔斯哈里发被杀，历时数百年的哈里发政权灭亡。蒙古军入城后纵掠，图书馆与清真寺遭到严重破坏，两河流域人口与经济大受打击。蒙古在伊朗与两河设立伊儿汗国，两河流域的灌溉农业长期未能复原。',
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
          '1240 年，拔都率蒙古军攻破城墙，基辅罗斯的核心城市遭到严重破坏，政治中心自此衰落。城中的教堂与修道院多被焚毁，工匠与居民或被杀或被掳。此后东欧诸公国长期向金帐汗国称臣纳贡，蒙古的统治深刻改变了当地的权力格局与商路走向。',
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
          '1241 年，蒙古军在莱格尼察与波兰、德意志联军交战，以骑兵佯退诱敌，再以弓骑与重骑合围取胜。此役震动西欧，各地纷纷加紧修筑城防，教皇亦呼吁组织抵抗。蒙古军随后南下与匈牙利主力会合，西欧各国直面来自东方的军事压力，此后欧洲诸国长期关注蒙古的动向。',
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
          '1242 年，蒙古军进抵维也纳附近，侦察骑兵一度抵达维也纳新城，中欧为之震动。窝阔台汗去世的消息传来，拔都率军东归，中欧暂避兵锋。此后金帐汗国定都萨莱，控制东欧商路与罗斯诸公国，蒙古的势力在西方长期留存，其影响延续数百年。',
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
          '1095 年，教宗乌尔班二世在克莱蒙宗教会议上号召远征东方，许诺参战者赦罪。法国与德意志的贵族、骑士与民众相继响应，许多人变卖家产，沿陆路向东进发。这次号召开启了延续近两百年的十字军运动，也改变了地中海东岸的政治格局。',
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
          '1097 年，各路十字军陆续抵达君士坦丁堡，拜占庭皇帝阿莱克修斯一世要求他们宣誓效忠。双方在领土归属上争执不下，十字军随后渡过博斯普鲁斯海峡，进入小亚细亚腹地。沿途缺粮与疾病造成损失，部队在尼西亚城下与塞尔柱军队首次交锋。',
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
          '1097 年，十字军围攻塞尔柱人控制的尼西亚，拜占庭军队随行并提供补给。守军在城破前向拜占庭投降，十字军未能入城劫掠，与拜占庭的嫌隙由此加深。尼西亚重回拜占庭之手，通往小亚细亚内陆的道路被打开，为十字军南下叙利亚提供了通道。',
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
          '1098 年，十字军经长时间围困攻占安条克，随即遭到摩苏尔总督率领的援军反围困。守城者在城头苦战，据载因圣枪的发现而士气大振，最终突围击败援军。此后十字军在此建立安条克公国，成为东征初期的主要据点，控制叙利亚北部的商路。',
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
          '1099 年，十字军攻陷耶路撒冷，城内居民遭到屠杀，圣墓教堂被改为拉丁礼仪。十字军随后建立耶路撒冷王国，戈弗雷出任圣墓守护者，次年由鲍德温一世称王。地中海东岸由此出现一系列十字军国家，与周围的穆斯林政权长期对峙。',
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
          '1191 年，第三次十字军经长期围攻攻占阿卡，狮心王理查与法王腓力二世共同统军。城破后守军投降，俘虏的处置引发争议，理查下令处决战俘。阿卡取代耶路撒冷，成为十字军国家在黎凡特的主要港口与据点，并修筑城墙与防御工事。',
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
          '622 年，穆罕默德自麦加迁往麦地那，是为希吉拉，伊斯兰历由此纪元。他在当地订立法典，联合迁士与辅士，建立以信仰为纽带的穆斯林社群，并制定饮食与婚姻的规约。麦地那的宪章规定了各部落的权利与义务，为此后的阿拉伯统一奠定基础。',
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
          '635 年，穆斯林军队攻占大马士革，拜占庭在叙利亚的统治开始动摇。阿拉伯将领哈立德·本·瓦利德主持战事，军队沿沙漠边缘推进，与当地部落结盟。叙利亚大部分地区随后纳入阿拉伯帝国的版图，大马士革日后成为倭马亚王朝的首都。',
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
          '638 年，穆斯林军队攻占耶路撒冷，哈里发欧麦尔亲赴城中，与宗主教索弗罗尼乌斯商定受降条件。据载，欧麦尔允诺保护居民的生命、财产与教堂，不强迫其改宗。此后耶路撒冷成为伊斯兰教的圣地，阿克萨清真寺与圆顶清真寺相继建立。',
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
          '641 年，阿拉伯军队在阿慕尔·本·阿斯率领下征服埃及，在尼罗河东岸建立福斯塔特营地。当地科普特人缴纳人丁税，保留信仰与教堂，行政与税收沿用拜占庭旧制。开罗一带由此成为阿拉伯帝国的重要行省，福斯塔特逐渐发展为商贸城市。',
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
          '698 年，阿拉伯军队攻占迦太基，罗马在北非的统治终结，城中居民多被迁走，港口一度废弃。阿拉伯人随后在内陆建立突尼斯城，以此为基础经营地中海西部的航路与贸易。北非沿岸被纳入帝国，柏柏尔部落陆续归附，并成为此后进军伊比利亚的主力。',
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
          '711 年，阿拉伯军队在塔里克·本·齐亚德率领下渡过直布罗陀海峡，击败西哥特国王罗德里克的军队。科尔多瓦开城归附，成为安达卢斯的统治中心，穆斯林与当地居民订立契约。此后伊比利亚半岛大部分地区纳入伊斯兰政权，科尔多瓦发展为学术与贸易重镇。',
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
          '1401 年，佛罗伦萨圣母百花大教堂为洗礼堂青铜门举行竞标，吉贝尔蒂击败布鲁内莱斯基中标。美第奇家族等富商出资赞助艺术与建筑，人文主义者整理古典文献。新的写实手法与透视法由此传播，文艺复兴在佛罗伦萨逐渐成形。',
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
          '1508 年，米开朗基罗受教宗尤利乌斯二世之命，开始绘制西斯廷教堂天顶画。他设计构图与脚手架，与助手历时数年完成《创世纪》诸场景，并反复试验壁画技法。罗马汇聚布拉曼特、拉斐尔等艺术家，教廷的赞助使这座城市成为文艺复兴盛期的艺术中心。',
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
          '1516 年，提香受威尼斯共和国任命为官方画师，接手乔尔乔内未完成的画作，成为威尼斯画派的核心人物。他运用油彩的层次与色彩，为教堂与贵族绘制祭坛画和肖像，订单遍及欧洲宫廷。威尼斯凭借绘画与阿尔杜斯印刷所，把文艺复兴的成果传播到欧洲各地。',
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
          '1498 年，达·芬奇在米兰完成《最后的晚餐》，绘于圣玛利亚感恩教堂的餐厅墙面。他尝试干壁画的颜料配比，画面在后世屡经剥落与修复，仍被视为构图与人物心理描写的典范。他在米兰期间还研究解剖、机械与水利，留下大量手稿。',
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
          '1515 年，弗朗索瓦一世即位后延揽意大利艺术家，达·芬奇晚年应邀来到法国，并定居昂布瓦斯。国王扩建枫丹白露宫，召集罗索、普里马蒂乔等人装饰厅室，形成枫丹白露画派。法国宫廷的赞助使文艺复兴风格在建筑、绘画与装饰艺术中传播开来。',
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
          '1599 年，伦敦环球剧场在泰晤士河南岸落成，莎士比亚所属的宫内大臣剧团在此演出。剧场为木结构八角形，观众分层购票，露天站席与楼座并存。莎士比亚的悲剧与历史剧在此上演，英国文艺复兴的戏剧成就由此达到高峰，剧作随后刊行传世。',
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
          '1785 年前后，瓦特改良的蒸汽机开始用于棉纺织业，曼彻斯特的纱厂沿河而建。工厂集中机器与工人，以水力与蒸汽动力取代家庭手工，产量迅速上升。棉纺织业把这座城镇变成工业中心，人口与厂房不断扩张，矿区与仓库由运河连接起来。',
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
          '1830 年，利物浦至曼彻斯特铁路通车，由史蒂芬森设计的机车牵引，这是世界首条城际铁路。铁路以蒸汽机车运输棉花、煤炭与旅客，较运河与马车更为快捷，运费与时间大幅下降。铁路时代由此来临，英国各地相继铺设线路，工厂与港口连成一体。',
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
          '1851 年，伦敦海德公园的水晶宫举办万国工业博览会，由阿尔伯特亲王主持筹备。展馆以铁与玻璃预制构件建成，各国展出机器、纺织品与工艺品。博览会吸引了大量观众，英国以机器制造展示工业实力，自由贸易的主张随之推广。',
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
          '1889 年，巴黎举办世界博览会，为纪念大革命百年而建的埃菲尔铁塔落成。铁塔以锻铁构件装配，高约三百米，成为当时最高的建筑，起初曾遭艺术家联名反对。工业技术开始成为国家实力的象征，钢铁与电力在博览会上集中展示。',
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
          '1861 年，克虏伯钢铁厂在埃森迅速扩张，以焦炭炼铁并铸造钢制火炮。工厂为铁路、军备与机械提供钢材，雇佣的工人数以万计，厂区与住宅连成一片。鲁尔区凭借煤铁资源与铁路网崛起为德国工业的心脏地带，并带动煤矿与运输业。',
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
          '1896 年，柏林举办工业博览会，西门子与通用电气等企业展出电机、电车与照明设备。德国统一后统一币制与关税，铁路与银行体系为工业提供了市场与资本。电气与钢铁产业迅速扩张，化工与光学仪器亦居前列，德国由此跃居欧洲工业前列。',
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
          '1773 年，波士顿倾茶事件爆发，抗议者据载化装为莫霍克人，登船将东印度公司的茶叶倒入港口。此前英国议会通过《茶税法》，赋予该公司茶叶专卖权，殖民地商人深受冲击。英国随后颁布强制法案，关闭波士顿港，殖民地反抗情绪迅速蔓延。',
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
          '1775 年，英军自波士顿前往康科德查抄军火，在莱克星顿与民兵遭遇，双方交火，英军继续西进康科德。北美殖民地与英国的武装冲突由此开始，消息传开后各地民兵集结。第二次大陆会议随后决定组建大陆军，并推举华盛顿为总司令，战争的规模随之扩大。',
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
          '1776 年，英军进攻纽约，华盛顿率大陆军防守长岛与曼哈顿，战败后向北撤退至哈莱姆高地。英军占据纽约港，以此为基地控制哈得孙河与沿海城市，封锁殖民地的海上贸易。大陆军损失惨重，冬季退守宾夕法尼亚，独立战争进入最艰难的阶段。',
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
          '1776 年，第二届大陆会议在费城通过《独立宣言》，杰斐逊起草，富兰克林与亚当斯参与修订。宣言援引自然权利与人民主权，列举英王的种种弊政，宣布北美殖民地脱离英国独立。此后各州着手制定宪法，邦联条例亦在讨论之中，独立战争获得明确的目标。',
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
          '1777 年，英军自加拿大南下，在萨拉托加被美军围困，伯戈因率部投降，据载五千余人放下武器。此役成为独立战争的转折点，促使法国与美国订立同盟并公开参战。西班牙与荷兰随后加入对英战争，英国在北美与海上同时陷入困境，战略主动权逐渐丧失。',
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
          '1781 年，美法联军在约克镇围困康沃利斯所部，法国舰队封锁切萨皮克湾，切断英军退路。英军突围失败，康沃利斯率部投降，独立战争的决定性战役结束，北美战事基本停息。此后英美在巴黎议和，1783 年签订条约，英国承认美国独立，并将阿巴拉契亚山以西的土地划归新国家。',
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
          '1789 年，三级会议在凡尔赛召开，第三等级代表因表决方式之争退出，另在网球场宣誓，要求制定宪法。国王调集军队，巴黎局势随之紧张，制宪的诉求获得市民支持。此后国民议会自称代表国民，旧制度的等级会议走向终结，革命的组织中心转向巴黎。',
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
          '1789 年 7 月，巴黎民众攻占巴士底狱，守军投降，国王被迫承认市民武装，并召回内克。制宪议会随后通过《八月法令》，废除封建特权，并颁布《人权宣言》，宣布自由与平等原则。革命由此从巴黎扩散到外省，农民抗租与城市暴动相继发生，旧制度的等级秩序开始瓦解。',
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
          '1791 年，国王路易十六携王室出逃，在瓦雷讷被认出并押回巴黎，君主制的信用进一步动摇。制宪议会虽保留王位，但国王的威信大损，共和派的主张开始获得支持。革命由此转向激进，各派围绕战争与王权展开争论，俱乐部与报刊成为舆论阵地。',
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
          '1792 年，法国对奥地利与普鲁士宣战，普奥联军与流亡贵族向巴黎推进。革命军在瓦尔密高地列阵炮击，击退普军，共和国由此转危为安。此役被视为革命军队的首次胜利，随后国民公会宣布废除君主制，法兰西第一共和国成立。',
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
          '1793 年，路易十六在巴黎被送上断头台，雅各宾派在救国委员会的推动下掌权，恐怖统治随之展开。革命法庭加快审判，嫌疑犯法令授权逮捕贵族与反对者，地方爆发旺代叛乱。欧洲各国结成第一次反法同盟，法国在内外两线同时作战。',
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
          '1793 年，拿破仑在土伦战役中指挥炮兵，协助共和军收复港口，开始崭露头角。他提出先夺取控制港湾的制高点，以炮火迫使英国舰队撤离，城防随之瓦解。此役之后，拿破仑被提升为准将，并进入共和军的指挥层，为其后来的崛起奠定基础。',
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
          '1914 年，斐迪南大公在萨拉热窝遇刺，奥匈帝国以此为由向塞尔维亚发出最后通牒，随后宣战。俄国动员支持塞尔维亚，德国对俄、对法宣战，英国参战后欧洲主要国家相继卷入。西线在比利时与法国北部陷入堑壕对峙，战事很快扩展到中东、非洲与海上。',
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
          '1914 年，奥匈帝国军队进攻塞尔维亚并炮击贝尔格莱德，巴尔干战线全面展开。塞尔维亚军队依托山地抵抗，一度夺回贝尔格莱德，随后在德军与保加利亚军队的压力下撤退。巴尔干的战事牵制了奥匈的兵力，也加剧了帝国的内部危机。',
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
          '1914 年，德军执行施里芬计划，经比利时攻入法国北部，直逼巴黎，比利时军队的抵抗迟滞了推进。法英联军在马恩河一线发起反攻，迫使德军分兵，德军右翼后撤，速胜计划破产。西线从此转入漫长的堑壕战，双方沿阵地长期对峙，机枪与炮火使进攻代价高昂。',
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
          '1916 年，德军以凡尔登为目标发起进攻，意图消耗法军主力，迫使其放弃阵地。法军由贝当指挥，沿补给公路持续增援，双方在要塞群周围反复争夺，战线几乎未变。此役以“绞肉机”闻名，成为西线消耗战的象征，也让各国重新审视进攻战术与工事的作用。',
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
          '1916 年，英法联军为牵制凡尔登方向的德军，在索姆河一线发起进攻，先以密集炮火轰击德军阵地。步兵随后越过无人地带推进，遭机枪与铁丝网阻滞，战线仅前移有限距离。英军在此役首次使用坦克，因数量稀少、故障频出，未能突破防线，此役遂成西线消耗战的象征。',
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
          '1919 年，巴黎和会在凡尔赛宫召开，美、英、法、意四国主导，战败国未参与谈判。会议签署《凡尔赛条约》，规定德国割让阿尔萨斯与洛林、限制军备、承担赔款，莱茵兰划为非军事区，其海外殖民地由国联委任统治。条约重划东欧版图，波兰与捷克斯洛伐克复国，欧洲秩序由此重建。',
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
          '1939 年，德国从柏林下达进攻波兰的命令，依据《苏德互不侵犯条约》的密约划分势力范围。德军以装甲师与空军协同突进，波兰军队在两面受敌下节节后退。英法随即对德宣战，欧洲战场的第二次世界大战由此爆发，波兰不久被德苏两国瓜分。',
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
          '1939 年，德军以闪击战进攻波兰，装甲部队与俯冲轰炸机协同推进，华沙在围城与轰炸后投降。苏联依据密约从东部出兵，波兰被德苏两国分割占领。英法虽已宣战，却未在西线发动有效进攻，波兰流亡政府在伦敦继续组织抵抗。',
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
          '1940 年，德军绕过马奇诺防线经阿登突入法国，英法联军被围于敦刻尔克海岸。英国动员驱逐舰与民用船只，在空军掩护下将部队经海路撤回本土，部分法军亦随之撤离。撤退虽弃置大量装备，却保住了日后反攻的骨干兵员，被称为“救援的奇迹”。',
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
          '1942 年，德军进攻斯大林格勒，企图切断伏尔加河运输并夺取高加索油田。苏军依托城市废墟逐屋抵抗，随后发起反攻，合围德军第六集团军。保卢斯最终投降，德军首次整建制覆灭，此役成为欧洲战场的转折点，苏军由此转入战略反攻。',
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
          '1944 年，盟军渡过英吉利海峡，在诺曼底海滩实施登陆，空降部队先期夺取内陆要道。登陆部队在滩头遭遇猛烈火力，仍建立起桥头堡，随后突破德军防线向法国内地推进。第二战场由此开辟，德军陷入东西两线夹击，巴黎不久获得解放。',
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
          '1945 年，苏军发起柏林战役，自奥得河一线突入城区，逐街逐楼争夺。希特勒在总理府地下室自杀，德军守备部队投降，柏林陷落。德国随后签署无条件投降书，欧洲战场的战争宣告结束，同盟国开始分区占领德国并清算纳粹政权。',
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
          '1941 年，日本御前会议决定对美英开战，联合舰队从东京发出偷袭珍珠港的命令。日本意图以突然打击摧毁美国太平洋舰队，为南进夺取东南亚资源争取时间。袭击虽重创美军战列舰，却未击中航母，美国次日对日宣战，太平洋战争全面爆发。',
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
          '1941 年，日本海军航空兵偷袭珍珠港，美军战列舰与机场遭到重创，美国太平洋舰队一度瘫痪。美军航母恰在海上，未受攻击；美国国会次日通过对日宣战决议，随后德国与意大利也对美宣战。此役使美国正式卷入世界大战，太平洋战场的攻守态势由此改变。',
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
          '1942 年，日本联合舰队进攻中途岛，企图诱歼美国航母编队。美军凭破译的密码掌握日军动向，趁日军航母更换舰载机之际发起俯冲轰炸，击沉四艘主力航母。日本海军由此丧失进攻能力，太平洋战场的攻守态势逆转，美军开始转入反攻。',
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
          '1942 年，美军登陆瓜达尔卡纳尔岛，夺取日军正在修建的机场，岛上战事由此展开。双方在丛林与海面上反复争夺，日军补给困难，最终撤离该岛。美军由此获得南太平洋的立足点，开始沿所罗门群岛逐岛反攻，日本的外围防线逐步瓦解。',
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
          '1945 年，美军进攻冲绳，日军依托岛上的洞穴与地下工事抵抗，战斗持续数月，日军守备部队大部被歼。日本海军以神风特攻队撞击美军舰艇，美军舰队损失多艘舰船。冲绳失守后，美军获得进攻日本本土的基地，日本的败局已定。',
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
          '1945 年，美国在广岛投下原子弹，城市在爆炸与火灾中大面积损毁，市区建筑几乎被毁，大量平民死伤。数日后长崎再遭核击，苏联同时对日宣战并出兵中国东北。日本天皇宣布接受《波茨坦公告》，随后签署投降书，第二次世界大战至此结束。',
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
          '1945 年，罗斯福、丘吉尔与斯大林在雅尔塔会晤，商定战后欧洲的安排。会议确定德国分区占领与去纳粹化，波兰边界西移，苏联承诺在欧洲战事结束后对日作战。会议同时筹划联合国，确立安理会大国一致原则，欧洲的分野由此初见轮廓。',
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
          '1948 年，西方盟国在西占区推行货币改革，苏联封锁通往西柏林的陆路通道。美国与英国组织空运，向西柏林运送粮食、煤炭与药品，空运持续近一年，市民赖此过冬。苏联最终解除封锁，柏林危机缓和，却促成北约的成立与德国的分裂。',
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
          '1949 年，美国与加拿大、英国等十二国在华盛顿签署《北大西洋公约》，成立北约。公约规定对缔约国的武装攻击视为对全体的攻击，成员国据此建立联合军事机构。北约的成立标志西方军事同盟成形，苏联随后组建华约与之对峙。',
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
          '1955 年，苏联与东欧国家在莫斯科签署《华沙条约》，成立华约组织。此前西德加入北约，苏联遂以集体防御为名整合东欧军队，并设立联合司令部，东德随后加入华约。两大军事集团的对峙格局由此确立，欧洲的分裂线沿易北河固定下来。',
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
          '1961 年，肯尼迪与赫鲁晓夫在维也纳会晤，商讨柏林地位与核试验问题。会谈未达成协议，赫鲁晓夫重申对西柏林的立场，要求西方撤军，肯尼迪坚持西方权利。此后东德修筑柏林墙，美苏关系再度紧张，核军备竞赛与代理人冲突继续扩大。',
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
          '1962 年，美国发现苏联在古巴部署导弹，肯尼迪宣布海上封锁，美苏走向核战边缘。赫鲁晓夫最终同意撤出导弹，美国则承诺不入侵古巴并撤走部署在土耳其的导弹。危机虽以妥协收场，却促使双方建立热线，军备控制谈判由此起步。',
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
