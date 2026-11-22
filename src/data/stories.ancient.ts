import type { Story } from '@/types/story';

/**
 * Stories from the ancient and classical world. Coordinates are real site and
 * city centres; durations are in milliseconds, long enough to read a
 * two-line caption without rushing.
 */
export const ANCIENT_STORIES: Story[] = [
  {
    id: 'mesopotamia',
    title: '美索不达米亚：城邦与法典',
    titleEn: 'Mesopotamia: Cities and Law',
    subtitle: '从楔形文字到汉谟拉比法典，两河城邦奠定了城市、文字与法律的原型',
    subtitleEn: 'From cuneiform to the Code of Hammurabi, the Tigris and Euphrates gave shape to cities, writing and law',
    steps: [
      {
        year: -3100,
        lon: 45.64,
        lat: 31.32,
        height: 1200000,
        title: '乌鲁克',
        titleEn: 'Uruk',
        route: 'land',
        caption:
          '约公元前 3100 年前后，乌鲁克已筑起城墙，城区面积在同期聚落中居首，埃安纳圣区供奉女神伊南娜。泥板上出现以芦苇笔压出的符号，用于记录粮食、牲畜与劳役，楔形文字由此成形。城市与文字互为支撑，使税收、仓储与工匠分工得以跨年记账。',
        captionEn:
          'By around 3100 BCE Uruk was a walled city with the Eanna sanctuary at its centre. Reed styluses pressed signs into clay to record grain, livestock and labour, and this writing grew into cuneiform.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: -2100,
        lon: 46.1,
        lat: 30.96,
        height: 1100000,
        title: '乌尔',
        titleEn: 'Ur',
        route: 'land',
        caption:
          '约公元前 2100 年，乌尔第三王朝的乌尔纳姆统一两河南部，以乌尔为都，修筑供奉月神南纳的塔庙。乌尔纳姆及其继任者颁布的法典残片留存至今，条文涉及婚姻、赔偿与土地。王朝以中央仓储与劳役制度管理灌溉农业，约百年后为埃兰人所灭。',
        captionEn:
          'Around 2100 BCE the Third Dynasty of Ur ruled southern Mesopotamia from Ur and raised the ziggurat of Nanna. Its law code and central granaries organised irrigation agriculture until the state fell to the Elamites about a century later.',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: -1750,
        lon: 44.42,
        lat: 32.54,
        height: 1200000,
        title: '巴比伦',
        titleEn: 'Babylon',
        route: 'land',
        caption:
          '约公元前 1750 年，巴比伦国王汉谟拉比结束对两河南部的征战，颁布一部刻于玄武岩石碑上的法典。石碑上部为沙马什授法的浮雕，下部列约二百八十条判例，涵盖契约、租佃、婚姻与伤害赔偿。法典区分自由民、平民与奴隶，条文更接近王室裁决的汇编，而非现代意义上的成文法。',
        captionEn:
          'Around 1750 BCE Hammurabi of Babylon issued his laws on a basalt stele, some 282 cases covering contracts, tenancy, marriage and injury. The text separated free citizens, commoners and slaves, and presented royal decisions as precedent.',
        radiusKm: 200,
        duration: 4700,
      },
      {
        year: -700,
        lon: 43.15,
        lat: 36.36,
        height: 1300000,
        title: '尼尼微',
        titleEn: 'Nineveh',
        route: 'land',
        caption:
          '公元前 8 世纪末，亚述国王辛那赫里布将都城迁至尼尼微，引水开渠，营建宫殿与花园。城中王宫藏有大量泥板文书，后世称为亚述巴尼拔图书馆，抄录了《吉尔伽美什史诗》等作品。亚述以军队与驿道维持对两河、叙利亚和埃及的控制，尼尼微成为帝国行政中心。',
        captionEn:
          'At the end of the 8th century BCE Sennacherib moved the Assyrian capital to Nineveh, with canals, palaces and gardens. Its tablets, collected for Ashurbanipal, preserved the Epic of Gilgamesh and much of Mesopotamian literature.',
        radiusKm: 220,
        duration: 4400,
      },
      {
        year: -539,
        lon: 44.42,
        lat: 32.54,
        height: 1200000,
        title: '巴比伦',
        titleEn: 'Babylon',
        route: 'land',
        caption:
          '公元前 539 年，波斯国王居鲁士攻入巴比伦，末代国王那波尼德被俘，新巴比伦王国灭亡。居鲁士以本地神祇之名进入城中，允许被掳的族群返乡，相关举措记于圆柱铭文。巴比伦仍为帝国重要都城，税册、天文记录与神庙经济延续下来。',
        captionEn:
          'In 539 BCE Cyrus of Persia entered Babylon and ended the Neo-Babylonian kingdom. A cylinder inscription presents him as restoring local cults and allowing deported peoples to return; the city kept its temples, archives and astronomers.',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: 200,
        lon: 44.58,
        lat: 33.09,
        height: 1400000,
        title: '泰西封',
        titleEn: 'Ctesiphon',
        route: 'land',
        caption:
          '约公元 200 年，泰西封位于底格里斯河东岸，与塞琉西亚隔河相望，是帕提亚帝国的重要都城。王室在此设置冬宫，商队由波斯湾与叙利亚两路汇入，粮食与丝绸在此转运。帕提亚以重装骑兵与地方王侯维持统治，两河的灌溉农业支撑起帝国东部。',
        captionEn:
          'Around 200 CE Ctesiphon stood on the Tigris opposite Seleucia as a principal Parthian capital. The court wintered here while caravans from the Persian Gulf and Syria exchanged grain and silk.',
        duration: 4300,
      },
    ],
  },
  {
    id: 'ancient-egypt',
    title: '古埃及：尼罗河三千年',
    titleEn: 'Ancient Egypt: Three Thousand Years on the Nile',
    subtitle: '从统一王国到克娄巴特拉，尼罗河滋养了延续三千年的王朝',
    subtitleEn: 'From the first unified kingdom to Cleopatra, the Nile sustained three thousand years of dynasties',
    steps: [
      {
        year: -3100,
        lon: 31.25,
        lat: 29.85,
        height: 1200000,
        title: '孟菲斯',
        titleEn: 'Memphis',
        route: 'land',
        caption:
          '约公元前 3100 年，上埃及的那尔迈，传统上称为美尼斯，统一尼罗河谷与三角洲，在第一瀑布以北建立都城孟菲斯。城市扼守河谷与三角洲的交界，便于征收粮食与调配劳力。王权与书吏制度随之成形，象形文字用于记录王室仪式与赋税。',
        captionEn:
          'Around 3100 BCE Narmer, later remembered as Menes, united the Nile valley and the delta and founded Memphis at their junction. The new capital gathered grain and labour, and hieroglyphs recorded royal ritual and taxation.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: -2560,
        lon: 31.13,
        lat: 29.98,
        height: 900000,
        title: '吉萨',
        titleEn: 'Giza',
        route: 'land',
        caption:
          '约公元前 2560 年，第四王朝法老胡夫在吉萨营建大金字塔，塔高约 146 米，以数百万块石灰岩砌成。工程在尼罗河泛滥季集中征发劳力，由村社与工匠队承担采石、运输与砌筑。金字塔群此后成为法老陵寝的范式，也留下管理大型工程的账簿与工匠聚落。',
        captionEn:
          'Around 2560 BCE Khufu of the Fourth Dynasty raised the Great Pyramid at Giza, some 146 metres high. Seasonal labour levies, quarries and worker settlements left records of how the state organised a vast building project.',
        radiusKm: 200,
        duration: 4400,
      },
      {
        year: -1550,
        lon: 32.64,
        lat: 25.7,
        height: 1200000,
        title: '底比斯',
        titleEn: 'Thebes',
        route: 'land',
        caption:
          '约公元前 1550 年，底比斯的第十七王朝驱除喜克索斯人，雅赫摩斯一世重新统一埃及，新王国自此定都底比斯。东岸的卡纳克与卢克索神庙不断扩大，阿蒙神祭司掌握大量土地与财富。帝国向南推进至努比亚，向东用兵叙利亚，底比斯成为政治与宗教中心。',
        captionEn:
          'Around 1550 BCE Ahmose expelled the Hyksos and reunited Egypt, and Thebes became the capital of the New Kingdom. The temples of Amun at Karnak and Luxor grew rich as the state campaigned in Nubia and Syria.',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: -1350,
        lon: 30.9,
        lat: 27.65,
        height: 1100000,
        title: '阿玛尔纳',
        titleEn: 'Amarna',
        route: 'land',
        caption:
          '约公元前 1350 年，法老阿肯那顿在底比斯以北营建新都阿赫塔顿，即今阿玛尔纳，独尊太阳圆盘阿吞。宫廷艺术一改旧例，人物形象趋向写实，王室档案以外交文书与周边王国往来。改革触动了阿蒙神庙的利益，其继任者图坦卡蒙在位时迁回底比斯，旧信仰逐步恢复。',
        captionEn:
          'Around 1350 BCE Akhenaten built a new capital at Amarna and promoted the worship of the sun disk Aten. Its archives preserve diplomatic letters, while the court style broke with earlier conventions; the move was reversed soon after his death.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: -1279,
        lon: 31.83,
        lat: 30.8,
        height: 1000000,
        title: '培尔拉美西斯',
        titleEn: 'Pi-Ramesses',
        route: 'land',
        caption:
          '公元前 1279 年前后，拉美西斯二世即位，以三角洲东部的培尔拉美西斯为居所与军营。城市临尼罗河支流，靠近西奈与地中海航路，便于对叙利亚用兵和接收贡赋。拉美西斯与赫梯在卡迭石交战，后订立和约，三角洲由此成为新王国后期的主要政治中心。',
        captionEn:
          'Ramesses II came to the throne around 1279 BCE and governed from Pi-Ramesses in the eastern delta. The city sat near the Sinai roads and the Mediterranean, supporting his campaigns against the Hittites and the peace that followed.',
        radiusKm: 200,
        duration: 4400,
      },
      {
        year: -30,
        lon: 29.92,
        lat: 31.2,
        height: 1200000,
        title: '亚历山大港',
        titleEn: 'Alexandria',
        route: 'land',
        caption:
          '公元前 30 年，克娄巴特拉七世在亚历山大港自尽，末代托勒密王国灭亡，埃及成为罗马行省。城市拥有港口与缪斯宫，长期是地中海东部的学术与贸易中心。罗马接管后，埃及的粮食经亚历山大港运往罗马，城市地位延续数百年。',
        captionEn:
          'In 30 BCE Cleopatra VII died at Alexandria and Egypt became a Roman province. The city kept its harbour, scholarly institutions and grain trade, shipping Egyptian wheat to Rome for centuries.',
        radiusKm: 220,
        duration: 4700,
      },
    ],
  },
  {
    id: 'persian-empire',
    title: '波斯帝国：从居鲁士到大流士',
    titleEn: 'The Persian Empire: Cyrus to Darius',
    subtitle: '居鲁士与大流士用行省、御道和宽容统治，把三大洲连成一个帝国',
    subtitleEn: 'Cyrus and Darius bound three continents with satrapies, roads and toleration',
    steps: [
      {
        year: -550,
        lon: 53.18,
        lat: 30.2,
        height: 1200000,
        title: '帕萨尔加德',
        titleEn: 'Pasargadae',
        route: 'land',
        caption:
          '约公元前 550 年，居鲁士二世击败米底国王阿斯提阿格斯，接管其领土，阿契美尼德王朝由此兴起。他在帕萨尔加德营建宫殿与花园，陵墓至今尚存，形制简朴。居鲁士保留各地神庙与地方贵族，以贡赋和军队维系对米底、吕底亚与巴比伦的统治。',
        captionEn:
          'Around 550 BCE Cyrus II defeated the Median king Astyages and took over his realm, founding the Achaemenid empire. At Pasargadae he built palaces and gardens; his modest tomb still stands, and local cults and nobles were kept in place under tribute.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: -539,
        lon: 44.42,
        lat: 32.54,
        height: 1900000,
        title: '巴比伦',
        titleEn: 'Babylon',
        route: 'land',
        caption:
          '公元前 539 年，居鲁士在底格里斯河畔击败那波尼德，进入巴比伦。圆柱铭文记载他修复神庙、归还神像，并允许被掳的犹太人返回耶路撒冷重建圣殿。巴比伦成为帝国西部的行政与税收中心，波斯君主沿用当地的书吏与档案制度。',
        captionEn:
          'In 539 BCE Cyrus defeated Nabonidus and entered Babylon. A cylinder records the restoration of temples and the return of deported peoples, including the Jews to Jerusalem; the city remained an administrative and tax centre.',
        radiusKm: 200,
        duration: 4700,
      },
      {
        year: -518,
        lon: 48.26,
        lat: 32.19,
        height: 1200000,
        title: '苏萨',
        titleEn: 'Susa',
        route: 'land',
        caption:
          '约公元前 518 年，大流士一世在苏萨营建王宫，用巴比伦、埃及与希腊工匠的技艺装饰殿堂。他将帝国分为二十余个行省，设总督、驻军与书吏，征收定额贡赋，并统一金币与银币的铸造。从苏萨通往萨迪斯的御道与驿站网络，使政令和军队能在数周内横穿帝国。',
        captionEn:
          'Around 518 BCE Darius I built his palace at Susa with craftsmen from across the empire. He organised satrapies with governors, garrisons and fixed tribute, standardised coinage, and linked Susa to Sardis by the Royal Road and its relay stations.',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: -500,
        lon: 52.89,
        lat: 29.94,
        height: 1200000,
        title: '波斯波利斯',
        titleEn: 'Persepolis',
        route: 'land',
        caption:
          '约公元前 500 年，大流士在波斯波利斯营建新的礼仪都城，阿帕达纳宫的石阶上刻着各省使团携贡品朝见的浮雕。宫殿群依山而建，用于新年庆典与王权展示，日常行政仍在苏萨与巴比伦。埃兰语泥板记录了工匠的口粮与工资。',
        captionEn:
          'Around 500 BCE Darius began Persepolis, a ceremonial capital whose Apadana reliefs show delegations bringing tribute. Administrative work stayed at Susa and Babylon, while Elamite tablets record rations and wages for the craftsmen.',
        radiusKm: 220,
        duration: 4500,
      },
      {
        year: -480,
        lon: 23.58,
        lat: 37.97,
        height: 2300000,
        title: '萨拉米斯',
        titleEn: 'Salamis',
        route: 'sea',
        caption:
          '公元前 480 年，薛西斯率军渡海西征，在温泉关突破希腊联军后进入阿提卡。希腊舰队将波斯舰队诱入萨拉米斯海峡，以狭窄水道抵消其数量优势，波斯船只混乱溃退。薛西斯退回亚洲，留下陆军次年于普拉塔亚战败，波斯对希腊本土的攻势就此终止。',
        captionEn:
          'In 480 BCE Xerxes crossed into Greece and broke through at Thermopylae. At Salamis the Greek fleet drew the larger Persian navy into narrow waters and defeated it; Xerxes withdrew, and his land army lost at Plataea the next year.',
        duration: 4600,
      },
      {
        year: -330,
        lon: 52.89,
        lat: 29.94,
        height: 2400000,
        title: '波斯波利斯',
        titleEn: 'Persepolis',
        route: 'land',
        caption:
          '公元前 330 年，亚历山大大帝追击大流士三世进入波斯腹地，占领波斯波利斯，夺取王宫财宝。宫殿随后起火，石柱与浮雕残存至今，火因在古代文献中说法不一。阿契美尼德王朝告终，亚历山大沿用波斯的行省与驿道体系治理原帝国领土。',
        captionEn:
          'In 330 BCE Alexander took Persepolis and its treasury while pursuing Darius III. The palace burned, though ancient sources disagree on the cause; the Achaemenid state ended and Alexander kept Persian satrapies and roads.',
        radiusKm: 220,
        duration: 4500,
      },
    ],
  },
  {
    id: 'rome',
    title: '罗马：从共和国到帝国',
    titleEn: 'Rome: Republic to Empire',
    subtitle: '共和制度、军团与道路，让一个台伯河城邦成长为地中海霸主',
    subtitleEn: 'Republican institutions, legions and roads turned a Tiber town into the master of the Mediterranean',
    steps: [
      {
        year: -509,
        lon: 12.5,
        lat: 41.9,
        height: 1100000,
        title: '罗马',
        titleEn: 'Rome',
        route: 'land',
        caption:
          '公元前 509 年，罗马人驱逐末代国王塔克文，废除王政，设两名任期一年的执政官。共和政体以元老院、公民大会与保民官相互制衡，法律与官职向有产公民开放。罗马以同盟与殖民地的网络扩张，逐步控制意大利半岛中部。',
        captionEn:
          'In 509 BCE the Romans expelled their last king and replaced the monarchy with two annually elected consuls. Senate, assemblies and tribunes shared power, and Rome expanded through alliances and colonies across central Italy.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: -202,
        lon: 10.32,
        lat: 36.85,
        height: 1800000,
        title: '迦太基',
        titleEn: 'Carthage',
        route: 'sea',
        caption:
          '公元前 202 年，西庇阿在迦太基城西南的扎马与汉尼拔决战，努米底亚骑兵助罗马取胜。第二次布匿战争以迦太基割地赔款、交出舰队告终，罗马取得西地中海霸权。此后罗马介入希腊与小亚细亚事务，行省制度逐步建立。',
        captionEn:
          'In 202 BCE Scipio defeated Hannibal at Zama, aided by Numidian cavalry. Carthage surrendered its fleet and paid an indemnity; Rome gained the western Mediterranean and soon intervened in Greece and Asia Minor.',
        radiusKm: 200,
        duration: 4700,
      },
      {
        year: -52,
        lon: 4.5,
        lat: 47.54,
        height: 2000000,
        title: '阿莱西亚',
        titleEn: 'Alesia',
        route: 'land',
        caption:
          '公元前 52 年，凯撒在高卢中部的阿莱西亚围困维钦托利，修筑内外两道工事，抵御援军与突围。守军粮尽投降，高卢各部抵抗随之瓦解，凯撒得以完成征服并写下《高卢战记》。此役使军团成为政治资本，为日后内战埋下伏笔。',
        captionEn:
          'In 52 BCE Caesar besieged Vercingetorix at Alesia, building two lines of fortification against both the garrison and a relief army. The surrender ended organised Gallic resistance and left Caesar with a veteran army and a written account of the campaign.',
        duration: 4600,
      },
      {
        year: 117,
        lon: 27.34,
        lat: 37.94,
        height: 2200000,
        title: '以弗所',
        titleEn: 'Ephesus',
        route: 'land',
        caption:
          '117 年，图拉真去世时罗马帝国版图达到极盛，以弗所是亚细亚行省的首府与港口。城市位于卡伊斯特河口，商路连接爱琴海与内陆，神庙、剧场与图书馆相继营建。以弗所向罗马输送税收与粮食，也是行省总督审理案件、发布政令的所在地。',
        captionEn:
          'By 117, the year of Trajan\'s death, Ephesus was the capital and port of the province of Asia. Its harbour linked the Aegean to inland roads, and the city served as the seat of the governor, courts and tax collection.',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: 410,
        lon: 12.5,
        lat: 41.9,
        height: 1900000,
        title: '罗马',
        titleEn: 'Rome',
        route: 'sea',
        caption:
          '410 年，阿拉里克率西哥特人进入罗马，城市在数日内遭劫掠，未能组织有效抵抗。这是八百年来罗马城首次被外敌攻占，消息传至各地引起震动。西部帝国此时已迁都拉文纳，皇帝与军队依赖蛮族将领，行省控制日益松弛。',
        captionEn:
          'In 410 Alaric and the Visigoths entered Rome and plundered it over several days. It was the first capture of the city by an outside enemy in eight centuries, and word of it spread shock across the empire.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: 476,
        lon: 12.2,
        lat: 44.42,
        height: 1100000,
        title: '拉文纳',
        titleEn: 'Ravenna',
        route: 'land',
        caption:
          '476 年，日耳曼将领奥多亚塞在拉文纳废黜末代西罗马皇帝罗慕路斯，将帝国徽章送往君士坦丁堡。拉文纳自 402 年起为西部宫廷驻地，城内教堂与镶嵌画多营建于这一时期。西罗马帝国名义上终结，东罗马仍自称罗马帝国，意大利由奥多亚塞统治。',
        captionEn:
          'In 476 Odoacer deposed Romulus, the last western emperor, at Ravenna and sent the imperial insignia to Constantinople. Ravenna had housed the western court since 402, and its churches and mosaics date from this period; Odoacer ruled Italy in the emperor\'s name.',
        radiusKm: 200,
        duration: 4500,
      },
    ],
  },
  {
    id: 'india-classical',
    title: '印度：孔雀与笈多',
    titleEn: 'India: Maurya and Gupta',
    subtitle: '阿育王以佛法治国，笈多王朝迎来科学与艺术的复兴',
    subtitleEn: 'Ashoka ruled through dharma, and the Guptas presided over a revival of science and art',
    steps: [
      {
        year: -322,
        lon: 85.14,
        lat: 25.61,
        height: 1300000,
        title: '华氏城',
        titleEn: 'Pataliputra',
        route: 'land',
        caption:
          '约公元前 322 年，旃陀罗笈多推翻难陀王朝，建立孔雀帝国，以华氏城为都。据希腊使臣记载，城市沿恒河修筑木栅与壕沟，设委员会分管贸易、税收与军需。帝国设密探、官职与常备军，行政经验被归于顾问考底利耶的《政事论》。',
        captionEn:
          'Around 322 BCE Chandragupta Maurya overthrew the Nanda dynasty and founded the Mauryan empire at Pataliputra. Greek accounts describe a timber-walled river capital administered by boards for trade, taxation and the army.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: -250,
        lon: 83.02,
        lat: 25.38,
        height: 900000,
        title: '鹿野苑',
        titleEn: 'Sarnath',
        route: 'land',
        caption:
          '约公元前 250 年，阿育王在鹿野苑一带立石柱，柱头刻四狮承托法轮，并颁布关于不杀生与宽容的敕令。数十年后，这里的僧团在佛陀初转法轮之地建起塔与寺院。阿育王的法敕遍布帝国各地，多以俗语刻于岩石与石柱之上。',
        captionEn:
          'Around 250 BCE Ashoka raised pillars near Sarnath, their lion capital carrying the wheel of dharma, and issued edicts on non-violence and tolerance. A monastery later grew where the Buddha preached his first sermon.',
        radiusKm: 180,
        duration: 4400,
      },
      {
        year: -100,
        lon: 77.74,
        lat: 23.48,
        height: 1400000,
        title: '桑奇',
        titleEn: 'Sanchi',
        route: 'land',
        caption:
          '约公元前 100 年，桑奇的大塔在巽伽与后来萨塔瓦哈纳王朝的赞助下扩建，砖石塔身覆以石栏与塔门。塔门浮雕描绘本生故事与佛传场景，此时尚未以人形表现佛陀，而以菩提树、法轮与足迹示意。桑奇地处商道附近，僧团依靠过往商旅的布施维持。',
        captionEn:
          'Around 100 BCE the Great Stupa at Sanchi was enlarged with stone railings and gateways under Shunga and later Satavahana patronage. Its reliefs tell Jataka and life stories of the Buddha, shown by symbols such as the bodhi tree and wheel rather than in human form.',
        radiusKm: 180,
        duration: 4500,
      },
      {
        year: 100,
        lon: 72.78,
        lat: 33.75,
        height: 2000000,
        title: '塔克西拉',
        titleEn: 'Taxila',
        route: 'land',
        caption:
          '约公元 100 年，塔克西拉处在贵霜帝国的统治之下，是犍陀罗地区的宗教与商路中心。城市周边寺院林立，佛像雕刻吸收希腊化造型，形成犍陀罗艺术风格。商队由印度河经此通往中亚与帕米尔，塔克西拉也是佛教学者研习阿毗达磨的场所。',
        captionEn:
          'Around 100 CE Taxila lay within the Kushan empire and prospered as a religious and commercial centre of Gandhara. Its monasteries produced Buddha images shaped by Hellenistic models, and caravans passed through toward Central Asia and the Pamirs.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: 400,
        lon: 75.78,
        lat: 23.18,
        height: 1800000,
        title: '邬阇衍那',
        titleEn: 'Ujjain',
        route: 'land',
        caption:
          '约公元 400 年，笈多王朝在旃陀罗笈多二世时期控制北印度，邬阇衍那成为西部的行政与商业城市。城中聚集天文学家与数学家，后世印度天文著作多以邬阇衍那为子午线起点。诗人迦梨陀娑的作品被认为属于这一时期，梵语文学与神庙建筑同时兴盛。',
        captionEn:
          'Around 400 CE, under Chandragupta II, Ujjain served the Gupta empire as an administrative and trading city. Astronomers and mathematicians worked here, and Sanskrit literature and temple building flourished alongside them.',
        radiusKm: 180,
        duration: 4500,
      },
      {
        year: 450,
        lon: 85.44,
        lat: 25.13,
        height: 1800000,
        title: '那烂陀',
        titleEn: 'Nalanda',
        route: 'land',
        caption:
          '约公元 450 年，那烂陀寺院在笈多王室赞助下扩建，形成以僧院与讲堂为中心的学府。学僧研习佛教经论、因明、医方与文法，来自东南亚与中亚的僧侣在此居留。寺院由多座院落组成，依靠村庄地产与王室布施供养，此后数百年一直是印度佛教教育的重要中心。',
        captionEn:
          'Around 450 CE the monastery at Nalanda expanded under Gupta patronage into a complex of courtyards and lecture halls. Monks from across Asia studied Buddhist texts, logic, medicine and grammar, supported by village estates and royal gifts.',
        radiusKm: 180,
        duration: 4600,
      },
    ],
  },
  {
    id: 'buddhist-path',
    title: '佛教之路',
    titleEn: 'The Buddhist Path',
    subtitle: '从鹿野苑到奈良，佛教沿商路与译经网络传遍亚洲',
    subtitleEn: 'From Sarnath to Nara, Buddhism travelled along trade routes and translation networks across Asia',
    steps: [
      {
        year: -528,
        lon: 83.02,
        lat: 25.38,
        height: 1000000,
        title: '鹿野苑',
        titleEn: 'Sarnath',
        route: 'land',
        caption:
          '约公元前 528 年，乔达摩在菩提伽耶悟道后西行至鹿野苑，为五位旧日同伴讲授四谛与中道，史称初转法轮。僧团由此成立，雨季安居、乞食与布萨等制度逐步确立。鹿野苑此后成为佛教圣地，阿育王在此立石柱以纪念。',
        captionEn:
          'Around 528 BCE Gautama, after his awakening, taught the Four Noble Truths and the middle way to five former companions at the deer park near Sarnath. The monastic community took shape there, and Ashoka later marked the site with a pillar.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: -300,
        lon: 72.78,
        lat: 33.75,
        height: 2000000,
        title: '塔克西拉',
        titleEn: 'Taxila',
        route: 'land',
        caption:
          '约公元前 300 年，塔克西拉是印度河上游的商路枢纽，也是孔雀帝国西北的重镇。阿育王在即位前曾在此任总督，据传在城郊兴建窣堵波，僧团随之进入犍陀罗地区。此地连接印度、伊朗与中亚，佛典与商货沿同一条道路往来。',
        captionEn:
          'Around 300 BCE Taxila stood at a crossroads of trade routes on the upper Indus and served as a Mauryan provincial centre. Ashoka governed here before his accession, and tradition credits him with founding a stupa nearby.',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: 366,
        lon: 94.66,
        lat: 40.14,
        height: 2200000,
        title: '敦煌',
        titleEn: 'Dunhuang',
        route: 'land',
        caption:
          '366 年，僧人乐僔行至敦煌鸣沙山，凿下第一所洞窟，莫高窟由此开始营建。敦煌地处河西走廊西端，是中原通往西域的关口，商旅与僧人在此补给。此后各代持续开窟造像，壁画与写经累积成规模宏大的石窟群。',
        captionEn:
          'In 366 the monk Yuezun opened the first cave at Mogao near Dunhuang. The town guarded the western end of the Hexi Corridor, and pilgrims and merchants supplied the monasteries that kept adding caves, murals and manuscripts.',
        radiusKm: 200,
        duration: 4700,
      },
      {
        year: 641,
        lon: 91.14,
        lat: 29.65,
        height: 2000000,
        title: '拉萨',
        titleEn: 'Lhasa',
        route: 'land',
        caption:
          '641 年，唐朝宗室女文成公主入藏，与吐蕃赞普松赞干布成婚，随行工匠与佛经进入逻些。传说她主持修建小昭寺，大昭寺亦在此时奠基，供奉自长安与尼泊尔迎来的佛像。唐蕃之间由此建立官方往来，驿道与使节往返于长安与拉萨之间。',
        captionEn:
          'In 641 Princess Wencheng of Tang married Songtsen Gampo and brought craftsmen and Buddhist texts to Lhasa. Tradition credits her with founding a temple, and official missions began to travel between the Tang court and the Tibetan capital.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: 645,
        lon: 108.94,
        lat: 34.34,
        height: 2200000,
        title: '长安',
        titleEn: 'Chang\'an',
        route: 'land',
        caption:
          '645 年，玄奘自印度归国，携回佛经数百部，抵达长安，受到唐太宗接见。他先后在弘福寺与大慈恩寺主持译场，译出《瑜伽师地论》等经论，并口述《大唐西域记》。长安汇集各地僧人，成为东亚佛典翻译与传播的中心。',
        captionEn:
          'In 645 Xuanzang returned to Chang\'an with hundreds of Buddhist texts and was received by Emperor Taizong. He directed translation teams at Hongfu and Daci\'en temples and dictated a record of his travels, making the city a centre of Buddhist scholarship in East Asia.',
        radiusKm: 220,
        duration: 4700,
      },
      {
        year: 752,
        lon: 135.8,
        lat: 34.69,
        height: 2400000,
        title: '奈良',
        titleEn: 'Nara',
        route: 'sea',
        caption:
          '752 年，奈良东大寺举行大佛开眼仪式，圣武太上皇与各国僧侣出席，印度僧菩提仙那主持。大佛以铜铸成，用去大量铜与金，寺院由朝廷直接支持。奈良汇集来自唐、新罗与印度的僧人，佛教与国家礼仪紧密结合，形成南都佛教的格局。',
        captionEn:
          'In 752 the Great Buddha of Todaiji was consecrated at Nara in a ceremony attended by the retired emperor and monks from abroad. The bronze image was cast with state support, and the capital gathered clergy from Tang China, Silla and India.',
        radiusKm: 200,
        duration: 4700,
      },
    ],
  },
];
