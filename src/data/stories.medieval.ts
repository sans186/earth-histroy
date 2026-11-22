import type { Story } from '@/types/story';

/**
 * Medieval stories. Coordinates are real city centres; durations are in
 * milliseconds. Chinese copy is the original; `*En` carries the English
 * translation.
 */
export const MEDIEVAL_STORIES: Story[] = [
  {
    id: 'byzantium',
    title: '拜占庭：千年君士坦丁堡',
    titleEn: 'Byzantium: A Thousand Years of Constantinople',
    subtitle: '千年都城在围攻、分裂与复兴中守住罗马的遗产',
    subtitleEn:
      'A thousand-year capital holds on to the Roman inheritance through sieges, division and recovery',
    steps: [
      {
        year: 330,
        lon: 28.98,
        lat: 41.01,
        height: 1200000,
        title: '君士坦丁堡',
        titleEn: 'Constantinople',
        route: 'air',
        caption:
          '330 年，君士坦丁大帝在博斯普鲁斯海峡西岸营建新都，取名新罗马，后世称君士坦丁堡。城市以罗马的元老院、广场与竞技场为模板，并接纳基督教。作为帝国东部的政治中心，它控制黑海与地中海之间的通道，此后千年屡遭围攻而少有易手。',
        captionEn:
          'In 330 Constantine founded his new capital on the European shore of the Bosphorus. Modeled on Rome and open to Christianity, it controlled the passage between the Black Sea and the Mediterranean and remained the seat of government for centuries.',
        radiusKm: 200,
        duration: 4400,
      },
      {
        year: 540,
        lon: 12.2,
        lat: 44.42,
        height: 1000000,
        title: '拉文纳',
        titleEn: 'Ravenna',
        route: 'land',
        caption:
          '540 年，贝利撒留率东罗马军队攻入拉文纳，东哥特国王维蒂吉斯被俘。查士丁尼以恢复西部行省为名发动哥特战争，此前已夺取北非。拉文纳的圣维塔莱教堂与镶嵌画多成于这一时期，记录帝国在意大利重建统治的努力。',
        captionEn:
          'In 540 Belisarius entered Ravenna and the Ostrogothic king was taken prisoner. Justinian\'s Gothic War aimed to restore the western provinces, and the city\'s churches and mosaics record that campaign.',
        duration: 4300,
      },
      {
        year: 1071,
        lon: 42.54,
        lat: 39.15,
        height: 1100000,
        title: '曼齐刻尔特',
        titleEn: 'Manzikert',
        route: 'land',
        caption:
          '1071 年，东罗马皇帝罗曼努斯四世在曼齐刻尔特附近与塞尔柱苏丹阿尔普·阿尔斯兰交战，军队溃败，皇帝被俘。战后安纳托利亚腹地渐为突厥诸部所据，帝国失去主要的兵源与产粮区。此役常被视为东罗马由盛转衰的节点。',
        captionEn:
          'In 1071 the Byzantine army was defeated at Manzikert and Emperor Romanos IV was captured by the Seljuks. Turkic groups spread across central Anatolia, and the empire lost its main recruiting and grain lands.',
        duration: 4300,
      },
      {
        year: 1204,
        lon: 12.32,
        lat: 45.44,
        height: 1000000,
        title: '威尼斯',
        titleEn: 'Venice',
        route: 'sea',
        caption:
          '1204 年，第四次十字军改变路线，攻陷君士坦丁堡，城中遭到劫掠，帝国被拉丁人分割为若干领地。威尼斯取得克里特、优卑亚与沿海港口，成为地中海东部贸易的受益者。东罗马的中央权力由此瓦解，流亡政权在尼西亚、伊庇鲁斯与特拉布宗各自存续。',
        captionEn:
          'In 1204 the Fourth Crusade sacked Constantinople and divided the empire among Latin lords. Venice gained Crete, Euboea and coastal ports, while Byzantine successor states held out at Nicaea, Epirus and Trebizond.',
        radiusKm: 200,
        duration: 4400,
      },
      {
        year: 1261,
        lon: 29.72,
        lat: 40.43,
        height: 1000000,
        title: '尼西亚',
        titleEn: 'Nicaea',
        route: 'sea',
        caption:
          '1261 年，尼西亚帝国的军队趁拉丁守军外出，夺回君士坦丁堡，米海尔八世加冕为帝，巴列奥略王朝开始。首都虽已收复，帝国却面临财政拮据与来自西方、巴尔干和安纳托利亚的多重压力。此后两个世纪，东罗马成为爱琴海世界中一个规模有限的区域政权。',
        captionEn:
          'In 1261 Nicaean forces re-entered Constantinople and Michael VIII was crowned, beginning the Palaiologan dynasty. The recovered capital faced empty coffers and pressure on several fronts.',
        duration: 4300,
      },
      {
        year: 1453,
        lon: 28.98,
        lat: 41.01,
        height: 1200000,
        title: '君士坦丁堡',
        titleEn: 'Constantinople',
        route: 'land',
        caption:
          '1453 年，奥斯曼苏丹穆罕默德二世以火炮轰击君士坦丁堡城墙，经五十余日围攻后破城，末代皇帝君士坦丁十一世阵亡。奥斯曼帝国迁都于此，圣索菲亚大教堂改为清真寺。延续千年的东罗马帝国至此终结。',
        captionEn:
          'In 1453 Mehmed II breached the walls of Constantinople after a siege of some fifty days, and Constantine XI died in the fighting. The Ottomans made the city their capital and the eastern Roman Empire came to an end.',
        radiusKm: 200,
        duration: 4600,
      },
    ],
  },
  {
    id: 'viking-age',
    title: '维京时代',
    titleEn: 'The Viking Age',
    subtitle: '长船从北欧峡湾驶向北大西洋，贸易、劫掠与定居重塑欧洲',
    subtitleEn:
      'Longships carry trade, raiding and settlement from the Nordic fjords across the North Atlantic',
    steps: [
      {
        year: 793,
        lon: -1.8,
        lat: 55.68,
        height: 1100000,
        title: '林迪斯法恩',
        titleEn: 'Lindisfarne',
        route: 'sea',
        caption:
          '793 年，来自北欧的袭击者登上诺森布里亚沿岸的林迪斯法恩岛，劫掠修道院，杀死或掳走修士。此事在同时代的拉丁编年与阿尔昆的书信中被记为灾难。此后数十年，斯堪的纳维亚船队沿不列颠与法兰克海岸频繁活动。',
        captionEn:
          'In 793 raiders from Scandinavia attacked the monastery on Lindisfarne off the Northumbrian coast, killing or carrying off monks. Latin chronicles and Alcuin\'s letters treated it as a disaster, and Scandinavian fleets returned to these coasts for decades.',
        duration: 4300,
      },
      {
        year: 800,
        lon: 17.64,
        lat: 59.86,
        height: 1200000,
        title: '乌普萨拉',
        titleEn: 'Uppsala',
        route: 'sea',
        caption:
          '800 年前后，乌普萨拉成为瑞典中部的宗教与王权中心，古乌普萨拉的王室冢群沿用了数百年。后世编年者记述此地有供奉北欧诸神的祭祀场所，每九年举行一次公共献祭。这里也是船队组织与王位争夺的重要背景。',
        captionEn:
          'Around 800 Uppsala was a centre of cult and royal power in central Sweden, and its burial mounds were used for centuries. Later chroniclers described a sanctuary there with sacrifices held every nine years.',
        duration: 4300,
      },
      {
        year: 866,
        lon: -1.08,
        lat: 53.96,
        height: 1000000,
        title: '约克',
        titleEn: 'York',
        route: 'sea',
        caption:
          '866 年，丹麦大军攻占约克，诺森布里亚王国的统治瓦解。874 年前后，维京首领在约克一带定居，形成后来的约维克王国，当地出现铸币与贸易市集。约克由此成为斯堪的纳维亚人在英格兰的重要据点。',
        captionEn:
          'In 866 a Danish army took York and the kingdom of Northumbria collapsed. Viking leaders settled in the area, and the later kingdom of Jorvik issued its own coinage and held a trading market.',
        duration: 4400,
      },
      {
        year: 885,
        lon: 2.35,
        lat: 48.86,
        height: 950000,
        title: '巴黎',
        titleEn: 'Paris',
        route: 'sea',
        caption:
          '885 年，维京船队沿塞纳河进抵巴黎，围城持续约一年，守军据桥梁与塔楼抵抗。西法兰克国王胖子查理最终以金钱和放行勃艮第换取撤军。此后西法兰克王室着手加固沿海与河口的防御。',
        captionEn:
          'In 885 a Viking fleet reached Paris up the Seine and besieged it for about a year while the defenders held the bridges and towers. Charles the Fat paid the attackers to withdraw, and the West Frankish crown then strengthened its coastal defences.',
        duration: 4300,
      },
      {
        year: 988,
        lon: 30.52,
        lat: 50.45,
        height: 1200000,
        title: '基辅',
        titleEn: 'Kyiv',
        route: 'land',
        caption:
          '988 年前后，基辅大公弗拉基米尔接受拜占庭的基督教，并在第聂伯河为居民施行洗礼。此前瓦良格人沿伏尔加河与第聂伯河建立商路与政权，与拜占庭、可萨和阿拉伯世界往来。基辅由此纳入东正教世界，斯拉夫地区的书写与建筑随之改变。',
        captionEn:
          'Around 988 Vladimir of Kyiv adopted Christianity from Byzantium and had the people baptised in the Dnieper. Varangian traders had already linked the river routes to Byzantium, the Khazars and the Arab world, and the conversion reshaped writing and architecture across the Slavic lands.',
        radiusKm: 200,
        duration: 4400,
      },
      {
        year: 1000,
        lon: -55.53,
        lat: 51.6,
        height: 2100000,
        title: '兰塞奥兹牧草地',
        titleEn: 'L\'Anse aux Meadows',
        route: 'sea',
        caption:
          '1000 年前后，诺斯探险者在纽芬兰北端建立营地，使用时间约数年。20 世纪发掘出草皮屋与铁工坊遗迹，证明这里曾有跨大西洋的航行与居留。这与冰岛萨迦关于文兰的记载相呼应，是欧洲人到达北美已知最早的实物证据之一。',
        captionEn:
          'Around 1000 Norse explorers built a camp at the northern tip of Newfoundland and stayed for a few years. Excavations revealed turf-walled houses and a smithy, the earliest known physical trace of Europeans reaching North America.',
        duration: 4600,
      },
    ],
  },
  {
    id: 'islamic-golden-age',
    title: '伊斯兰黄金时代',
    titleEn: 'The Islamic Golden Age',
    subtitle: '巴格达的翻译运动连接希腊、波斯与印度，科学在伊斯兰世界繁荣',
    subtitleEn:
      'Translation in Baghdad links Greek, Persian and Indian learning, and the sciences flourish across the Islamic world',
    steps: [
      {
        year: 700,
        lon: 36.29,
        lat: 33.51,
        height: 1200000,
        title: '大马士革',
        titleEn: 'Damascus',
        route: 'land',
        caption:
          '700 年前后，倭马亚王朝以大马士革为都，叙利亚、埃及与波斯的学者汇集于此。哈里发宫廷资助翻译与营建，希腊语与叙利亚语的医学、天文学文献开始被译成阿拉伯语。大马士革成为地中海与中亚之间的行政和学术节点之一。',
        captionEn:
          'Around 700 Damascus was the Umayyad capital, drawing scholars from Syria, Egypt and Persia. Court patronage supported translation and building, and Greek and Syriac works on medicine and astronomy began to appear in Arabic.',
        radiusKm: 200,
        duration: 4300,
      },
      {
        year: 762,
        lon: 44.36,
        lat: 33.31,
        height: 1000000,
        title: '巴格达',
        titleEn: 'Baghdad',
        route: 'land',
        caption:
          '762 年，阿拔斯哈里发曼苏尔营建巴格达，城市以圆形城墙环护宫廷与清真寺。此后一个世纪，巴格达的翻译机构与书市汇集译者，希腊、波斯和印度的典籍被译成阿拉伯语。数学、天文与医学由此在阿拉伯语世界中形成新的知识体系。',
        captionEn:
          'In 762 the Abbasid caliph al-Mansur founded Baghdad as a round city on the Tigris. Over the following century translators and booksellers there rendered Greek, Persian and Indian texts into Arabic, giving mathematics, astronomy and medicine a new working language.',
        radiusKm: 200,
        duration: 4400,
      },
      {
        year: 1000,
        lon: -4.78,
        lat: 37.88,
        height: 1900000,
        title: '科尔多瓦',
        titleEn: 'Cordoba',
        route: 'sea',
        caption:
          '1000 年前后，科尔多瓦在后倭马亚王朝治下进入鼎盛，城市人口与市集规模在西欧居于前列。宫廷藏书与学者网络使拉丁语世界得以接触阿拉伯语的天文、医学与哲学著作。后来的托莱多翻译运动即以伊比利亚的这批藏书为基础。',
        captionEn:
          'Around 1000 Cordoba flourished under the Umayyads of al-Andalus, with a population and market unmatched in western Europe. Its libraries and scholars opened Arabic astronomy, medicine and philosophy to Latin readers, above all through the later translators of Toledo.',
        duration: 4500,
      },
      {
        year: 1000,
        lon: 31.24,
        lat: 30.04,
        height: 2000000,
        title: '开罗',
        titleEn: 'Cairo',
        route: 'sea',
        caption:
          '1000 年前后，法蒂玛王朝在开罗修建爱资哈尔清真寺与学府，吸引各地学者前来讲学。尼罗河的水位记录、光学与医学研究在此持续，伊本·海什木曾活动于法蒂玛宫廷。开罗与亚历山大港成为东地中海一侧的学术与贸易中心。',
        captionEn:
          'Around 1000 the Fatimids built al-Azhar in Cairo as a mosque and centre of learning. Research on optics and medicine continued under their patronage, and Cairo with Alexandria became a scholarly and commercial hub of the eastern Mediterranean.',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: 1000,
        lon: 66.96,
        lat: 39.65,
        height: 2000000,
        title: '撒马尔罕',
        titleEn: 'Samarkand',
        route: 'land',
        caption:
          '1000 年前后，撒马尔罕与布哈拉一带在萨曼王朝治下形成学术网络，波斯语与阿拉伯语写作并行。伊本·西那在此完成早期的哲学与医学训练，其《医典》后来传入欧洲的医学院。中亚城市成为印度、波斯与中国知识往来的中转地。',
        captionEn:
          'Around 1000 Samarkand and Bukhara formed a scholarly network under the Samanids, with writing in both Persian and Arabic. Ibn Sina trained here in philosophy and medicine, and his Canon later reached the medical schools of Europe.',
        duration: 4500,
      },
      {
        year: 1258,
        lon: 44.36,
        lat: 33.31,
        height: 1100000,
        title: '巴格达',
        titleEn: 'Baghdad',
        route: 'land',
        caption:
          '1258 年，旭烈兀的蒙古军队攻陷巴格达，阿拔斯哈里发政权终结，城市遭到大规模破坏。底格里斯河沿岸的图书馆、书市与学术机构在战火中损失严重。巴格达作为伊斯兰世界中心城市的地位由此结束。',
        captionEn:
          'In 1258 the Mongol army of Hulegu took Baghdad and ended the Abbasid caliphate, destroying much of the city. Libraries, book markets and schools along the Tigris suffered heavy losses, and Baghdad ceased to be the centre of the Islamic world.',
        radiusKm: 200,
        duration: 4600,
      },
    ],
  },
  {
    id: 'black-death',
    title: '黑死病',
    titleEn: 'The Black Death',
    subtitle: '一艘商船把鼠疫带入地中海，欧亚人口在数年间骤减',
    subtitleEn:
      'A merchant ship carries plague into the Mediterranean, and Eurasian populations fall within a few years',
    steps: [
      {
        year: 1346,
        lon: 35.38,
        lat: 45.03,
        height: 1100000,
        title: '卡法',
        titleEn: 'Kaffa',
        route: 'sea',
        caption:
          '1346 年，金帐汗国的军队围攻黑海北岸的卡法，热那亚商人据城防守。同时代的编年者记载围城期间军中爆发疫病，尸体被抛入城内，随后有商船离港。疫病经黑海航线传入地中海的路径仍有讨论，但卡法常被视作这一轮流行的起点之一。',
        captionEn:
          'In 1346 a Golden Horde army besieged Kaffa on the Black Sea, held by Genoese merchants. Contemporaries described disease in the besieging camp and ships leaving the port, and Kaffa is often treated as one starting point of the pandemic, though the route is still debated.',
        duration: 4400,
      },
      {
        year: 1347,
        lon: 28.98,
        lat: 41.01,
        height: 1000000,
        title: '君士坦丁堡',
        titleEn: 'Constantinople',
        route: 'sea',
        caption:
          '1347 年，疫病随黑海航线抵达君士坦丁堡，城市人口在数月内大量死亡。皇帝约翰六世与拜占庭史家留下了当时的记述。此后帝国的人口与赋税基础进一步削弱，首都长期未能恢复到旧有的规模。',
        captionEn:
          'In 1347 plague reached Constantinople along the Black Sea routes and killed a large part of the population within months. John VI and Byzantine historians described the outbreak, and the empire\'s tax base shrank for years afterwards.',
        radiusKm: 200,
        duration: 4300,
      },
      {
        year: 1347,
        lon: 12.32,
        lat: 45.44,
        height: 1000000,
        title: '威尼斯',
        titleEn: 'Venice',
        route: 'sea',
        caption:
          '1347 年秋，来自黑海的热那亚商船把疫病带到西西里的墨西拿，威尼斯随后出现病例。共和国设立临时卫生机构，限制病船入港，并对患者与货物作出处置。这些措施成为后世港口检疫制度的早期形态之一。',
        captionEn:
          'In the autumn of 1347 Genoese ships from the Black Sea brought the disease to Messina, and Venice recorded cases soon after. The republic set up temporary health offices, barred infected ships and handled patients and cargo, an early form of port quarantine.',
        radiusKm: 200,
        duration: 4300,
      },
      {
        year: 1348,
        lon: 5.37,
        lat: 43.3,
        height: 1000000,
        title: '马赛',
        titleEn: 'Marseille',
        route: 'sea',
        caption:
          '1348 年，疫病经马赛进入法国南部，随后沿罗讷河谷向北扩散。阿维尼翁教廷的医生与编年者记录了大量死亡，城市与乡村都出现劳力短缺。地租与工资关系在此后数十年间发生变化。',
        captionEn:
          'In 1348 plague entered southern France through Marseille and spread north up the Rhone valley. Physicians and chroniclers at the papal court in Avignon recorded heavy mortality, and the resulting labour shortage altered rents and wages for decades.',
        duration: 4300,
      },
      {
        year: 1349,
        lon: -0.13,
        lat: 51.51,
        height: 1100000,
        title: '伦敦',
        titleEn: 'London',
        route: 'sea',
        caption:
          '1349 年，疫病在伦敦大规模暴发，教区登记与遗嘱档案留下大量记录。据估计英格兰人口在数年内减少三分之一以上，部分村庄被弃。劳力短缺推动工资上涨，议会随后以法令限制雇工的要价。',
        captionEn:
          'In 1349 the plague struck London in force, leaving dense traces in parish registers and wills. England probably lost more than a third of its people within a few years, some villages were abandoned, and Parliament tried to cap the wages that scarce labour could demand.',
        radiusKm: 200,
        duration: 4400,
      },
      {
        year: 1353,
        lon: 37.62,
        lat: 55.75,
        height: 1400000,
        title: '莫斯科',
        titleEn: 'Moscow',
        route: 'land',
        caption:
          '1353 年，疫病自黑海与伏尔加河中游传至莫斯科，大公谢苗与莫斯科的都主教相继病亡。城市与周边地区人口锐减，莫斯科公国的扩张一度放缓。疫病在东欧的反复流行持续到 14 世纪末。',
        captionEn:
          'In 1353 plague reached Moscow from the Black Sea and the middle Volga, killing Grand Prince Simeon and the metropolitan in succession. The city and its hinterland lost many inhabitants, and outbreaks recurred in eastern Europe until the end of the century.',
        radiusKm: 200,
        duration: 4400,
      },
    ],
  },
  {
    id: 'ottoman-rise',
    title: '奥斯曼崛起',
    titleEn: 'The Rise of the Ottomans',
    subtitle: '从安纳托利亚边陲到维也纳城下，奥斯曼帝国横跨三洲',
    subtitleEn:
      'From a frontier in Anatolia to the walls of Vienna, an empire spanning three continents',
    steps: [
      {
        year: 1326,
        lon: 29.06,
        lat: 40.19,
        height: 1100000,
        title: '布尔萨',
        titleEn: 'Bursa',
        route: 'land',
        caption:
          '1326 年，奥斯曼的军队夺取布尔萨，城市成为奥斯曼公国的第一个重要都城。此前数十年，奥斯曼与其子奥尔汗在拜占庭边境招纳加齐武士，逐步控制安纳托利亚西北。布尔萨的行政与铸币机构为其后的巴尔干扩张提供了基础。',
        captionEn:
          'In 1326 Ottoman forces took Bursa, which became the first major capital of the principality. Osman and his son Orhan had spent decades recruiting frontier fighters along the Byzantine border, and Bursa gave the growing state its administration and mint.',
        radiusKm: 200,
        duration: 4300,
      },
      {
        year: 1453,
        lon: 28.98,
        lat: 41.01,
        height: 1000000,
        title: '君士坦丁堡',
        titleEn: 'Constantinople',
        route: 'land',
        caption:
          '1453 年，穆罕默德二世以火炮攻破君士坦丁堡城墙，东罗马帝国终结。奥斯曼帝国迁都于此，并对城市进行重建，安置希腊、亚美尼亚与犹太居民。圣索菲亚改为清真寺，帝国由此获得连接欧亚的都城。',
        captionEn:
          'In 1453 Mehmed II breached the walls of Constantinople with artillery and ended the eastern Roman Empire. The Ottomans moved their capital there and repopulated the city with Greek, Armenian and Jewish communities, turning Hagia Sophia into a mosque.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: 1517,
        lon: 31.24,
        lat: 30.04,
        height: 1800000,
        title: '开罗',
        titleEn: 'Cairo',
        route: 'sea',
        caption:
          '1517 年，塞利姆一世在叙利亚与埃及击败马穆鲁克军队，末代马穆鲁克苏丹图曼贝伊被处死。埃及与汉志并入奥斯曼版图，哈里发称号随之移至伊斯坦布尔。帝国由此控制红海与地中海东岸的商路。',
        captionEn:
          'In 1517 Selim I defeated the Mamluks in Syria and Egypt and had the last sultan, Tuman Bay, executed. Egypt and the Hejaz passed under Ottoman rule, the caliphate was claimed in Istanbul, and the empire controlled the Red Sea and the Levantine trade routes.',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: 1521,
        lon: 20.45,
        lat: 44.79,
        height: 1100000,
        title: '贝尔格莱德',
        titleEn: 'Belgrade',
        route: 'land',
        caption:
          '1521 年，苏莱曼一世攻占贝尔格莱德，匈牙利在巴尔干中南部的防线被打开。此前该城曾两次击退奥斯曼军队，此次陷落后成为奥斯曼在巴尔干的前进基地。此后数十年，奥斯曼军队向匈牙利腹地推进。',
        captionEn:
          'In 1521 Suleiman I took Belgrade, opening the Hungarian defensive line in the central Balkans. The city had repelled Ottoman armies twice before; once it fell, it became a forward base for advances deeper into Hungary.',
        duration: 4300,
      },
      {
        year: 1541,
        lon: 19.04,
        lat: 47.5,
        height: 950000,
        title: '布达',
        titleEn: 'Budapest',
        route: 'land',
        caption:
          '1541 年，奥斯曼军队占领布达，匈牙利王国被分割为三部分：奥斯曼直辖的中部、哈布斯堡控制的西部与特兰西瓦尼亚公国。布达设省，向伊斯坦布尔缴纳赋税。这一格局延续约一个半世纪。',
        captionEn:
          'In 1541 Ottoman forces occupied Buda and Hungary split into three parts: an Ottoman centre, a Habsburg west and the principality of Transylvania. Buda became a provincial seat paying taxes to Istanbul, and the arrangement lasted some hundred and fifty years.',
        duration: 4400,
      },
      {
        year: 1683,
        lon: 16.37,
        lat: 48.21,
        height: 1300000,
        title: '维也纳',
        titleEn: 'Vienna',
        route: 'land',
        caption:
          '1683 年，奥斯曼军队围攻维也纳约两个月，未能破城，随后在波兰与帝国联军反击下撤退。此役之后，哈布斯堡军队转入反攻，1686 年夺回布达。奥斯曼帝国在中欧的边界自此逐步南移。',
        captionEn:
          'In 1683 Ottoman forces besieged Vienna for about two months without taking it, then withdrew before a relief army of Poles and imperial troops. Habsburg forces went on the offensive and retook Buda in 1686, and the Ottoman frontier in central Europe moved south.',
        radiusKm: 200,
        duration: 4500,
      },
    ],
  },
  {
    id: 'indian-ocean',
    title: '印度洋贸易',
    titleEn: 'Indian Ocean Trade',
    subtitle: '季风把东非、阿拉伯、印度与东南亚的港口连成一张贸易网',
    subtitleEn:
      'Monsoon winds link the ports of East Africa, Arabia, India and Southeast Asia into one trading network',
    steps: [
      {
        year: 100,
        lon: 45.03,
        lat: 12.79,
        height: 1200000,
        title: '亚丁',
        titleEn: 'Aden',
        route: 'sea',
        caption:
          '100 年前后，亚丁成为红海与阿拉伯海之间的转运港。罗马帝国的商船经红海进入印度洋，据《厄立特里亚海航行记》，季风航线已被用于往返印度西南岸。亚丁与穆哈等港口由此连接地中海世界与印度洋贸易。',
        captionEn:
          'Around 100 CE Aden served as a transshipment port between the Red Sea and the Arabian Sea. Roman ships entered the Indian Ocean through the Red Sea, and the Periplus records monsoon routes to the southwest coast of India.',
        duration: 4400,
      },
      {
        year: 1000,
        lon: 45.32,
        lat: 2.05,
        height: 1400000,
        title: '摩加迪沙',
        titleEn: 'Mogadishu',
        route: 'sea',
        caption:
          '1000 年前后，摩加迪沙成为东非沿岸的贸易城市，与阿拉伯半岛、波斯和印度的港口往来。当地商人输出象牙、龟甲、香料与黄金，输入布匹和陶器。伊斯兰教与斯瓦希里语的书写传统随贸易在此扎根。',
        captionEn:
          'Around 1000 Mogadishu was a trading town on the East African coast, in contact with ports in Arabia, Persia and India. Its merchants exported ivory, tortoiseshell, spices and gold in exchange for cloth and ceramics, and Islam and Swahili literacy took root with the trade.',
        radiusKm: 200,
        duration: 4400,
      },
      {
        year: 1300,
        lon: 39.51,
        lat: -8.93,
        height: 1400000,
        title: '基尔瓦',
        titleEn: 'Kilwa',
        route: 'sea',
        caption:
          '1300 年前后，基尔瓦成为东非黄金贸易的中心，基尔瓦苏丹国控制索法拉以南的商路。城中建起大清真寺与宫殿，遗址中出土中国瓷器与玻璃器。伊本·白图泰在 14 世纪到访，记述了这座城市的繁荣。',
        captionEn:
          'Around 1300 Kilwa was the centre of the East African gold trade, and its sultanate controlled the routes south of Sofala. The town built a great mosque and palace, and its ruins hold Chinese porcelain and glass; Ibn Battuta visited in the 14th century and described its prosperity.',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: 1400,
        lon: 75.78,
        lat: 11.25,
        height: 2400000,
        title: '卡利卡特',
        titleEn: 'Calicut',
        route: 'sea',
        caption:
          '1400 年前后，卡利卡特是马拉巴尔海岸的主要港口，胡椒经此运往红海与波斯湾。港口对阿拉伯、中国与东南亚的商船开放，当地统治者以税收维持与商人的关系。郑和船队数次到访该城，随行记录留下了当地市场的描述。',
        captionEn:
          'Around 1400 Calicut was the leading port of the Malabar coast, shipping pepper to the Red Sea and the Persian Gulf. It was open to Arab, Chinese and Southeast Asian ships, and the Zheng He voyages called there several times, leaving descriptions of its markets.',
        duration: 4600,
      },
      {
        year: 1450,
        lon: 102.25,
        lat: 2.19,
        height: 2000000,
        title: '马六甲',
        titleEn: 'Malacca',
        route: 'sea',
        caption:
          '1450 年前后，马六甲苏丹国控制马六甲海峡，港口成为东西方货物交换的中心。印度布匹、中国瓷器与东南亚香料在此交易，季风的时间表决定船期。中国、印度与爪哇商人皆在此设立商站。',
        captionEn:
          'Around 1450 the sultanate of Malacca controlled the strait, and its port became the meeting point for goods from east and west. Indian cloth, Chinese porcelain and Southeast Asian spices changed hands there on a schedule set by the monsoons.',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: 1500,
        lon: 113.26,
        lat: 23.13,
        height: 2000000,
        title: '广州',
        titleEn: 'Guangzhou',
        route: 'sea',
        caption:
          '1500 年前后，广州仍是南海贸易的重要口岸，明朝在此设市舶司管理朝贡与商船。东南亚的香料、木材与印度洋的布匹经海路进入珠江口。葡萄牙船队于 1510 年代抵达中国沿海，印度洋与南海的贸易格局随后改变。',
        captionEn:
          'Around 1500 Guangzhou remained a major port of the South China Sea, with a Ming office regulating tribute missions and merchant shipping. Spices and timber from Southeast Asia and cloth from the Indian Ocean entered the Pearl River estuary, until Portuguese ships arrived in the 1510s and changed the pattern of trade.',
        radiusKm: 200,
        duration: 4600,
      },
    ],
  },
];
