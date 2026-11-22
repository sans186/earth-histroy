import type { Story } from '@/types/story';

/**
 * Modern guided stories: early modern to the twentieth century.
 * Coordinates are real city centres; durations are in milliseconds.
 * Chinese copy is the original; `*En` carries the English translation.
 */
export const MODERN_STORIES: Story[] = [
  {
    id: 'reformation',
    title: '宗教改革',
    titleEn: 'The Reformation',
    subtitle: '一份九十五条论纲裂开了拉丁基督教世界，也催生了印刷时代的争论',
    subtitleEn:
      'Ninety-five theses split Latin Christendom and opened an age of printed argument',
    steps: [
      {
        year: 1517,
        lon: 12.65,
        lat: 51.87,
        height: 1000000,
        title: '维滕贝格',
        titleEn: 'Wittenberg',
        route: 'land',
        caption:
          '1517 年，维滕贝格大学神学教授马丁·路德就赎罪券提出九十五条论纲，质疑教会出售赦罪的做法。论纲以拉丁文写成，本为学术辩论之用，被印坊翻印后数年间传遍德意志各邦与欧洲主要城市。围绕赎罪券的争论由此演变为对教廷权威的公开质疑。',
        captionEn:
          'In 1517 Martin Luther, a theology professor at Wittenberg, published ninety-five theses against the sale of indulgences. Written for academic debate, they were reprinted and circulated across Germany within a few years, turning a dispute over indulgences into an open challenge to papal authority.',
        duration: 4600,
      },
      {
        year: 1534,
        lon: 7.63,
        lat: 51.96,
        height: 1000000,
        title: '明斯特',
        titleEn: 'Münster',
        route: 'land',
        caption:
          '1534 年，重洗派信徒进入明斯特，驱逐主教并建立公社，实行财产共有与成人再洗礼。主教联合邻近诸侯围城，城内饥荒与内斗加剧，1535 年城破，起义者被处死。此役之后，重洗派在德意志的公开活动受到严厉压制，各地城市加强了对宗教异见的管控。',
        captionEn:
          'In 1534 Anabaptists took over Münster, expelled the bishop and set up a communal order with adult rebaptism. The bishop and neighbouring princes besieged the city; it fell in 1535 and the leaders were executed, after which Anabaptist public activity in Germany was harshly suppressed.',
        duration: 4500,
      },
      {
        year: 1536,
        lon: 6.14,
        lat: 46.2,
        height: 1100000,
        title: '日内瓦',
        titleEn: 'Geneva',
        route: 'land',
        caption:
          '1536 年，加尔文途经日内瓦被挽留，随即参与城市的宗教改革，同年在巴塞尔刊行《基督教要义》初版。日内瓦议会采纳其教会法规，设立牧师、长老与执事，并对市民的信仰与日常行为加以约束。此后数十年，日内瓦成为归正宗的教育与印刷中心，法语、英语与意大利语译本由此流向欧洲各地。',
        captionEn:
          'Calvin was persuaded to stay in Geneva in 1536 and helped reform the city; his Institutes of the Christian Religion appeared in Basel the same year. Geneva adopted his church ordinances and became a centre for Reformed teaching and printing, sending French, English and Italian editions across Europe.',
        radiusKm: 200,
        duration: 4700,
      },
      {
        year: 1545,
        lon: 11.12,
        lat: 46.07,
        height: 1000000,
        title: '特伦托',
        titleEn: 'Trento',
        route: 'land',
        caption:
          '1545 年，特伦托会议召开，以回应新教挑战并整顿教会。会议断续进行至 1563 年，确认拉丁文通俗译本与七项圣事，重申教义立场，同时规定神学院制度、禁止滥售赎罪券并整顿主教驻节。会后天主教会逐步推行改革，欧洲的教派分界也更趋固定。',
        captionEn:
          'The Council of Trent opened in 1545 and sat, on and off, until 1563. It reaffirmed Catholic doctrine and the seven sacraments, required seminaries for clergy and curbed abuses in the sale of indulgences, hardening the confessional divide across Europe.',
        duration: 4700,
      },
      {
        year: 1618,
        lon: 14.44,
        lat: 50.08,
        height: 1000000,
        title: '布拉格',
        titleEn: 'Prague',
        route: 'land',
        caption:
          '1618 年，波希米亚新教贵族闯入布拉格城堡，将两名皇帝委任的官员掷出窗外，史称布拉格掷出窗外事件。波希米亚随即推举新教君主，与哈布斯堡开战，冲突沿帝国境内的教派与领地矛盾扩散。三十年战争由此爆发，战火先后波及德意志、丹麦、瑞典与法国。',
        captionEn:
          'In 1618 Protestant nobles in Prague threw two imperial officials out of a castle window. Bohemia rose against the Habsburgs, and the dispute widened along confessional and territorial lines into the Thirty Years War, drawing in Denmark, Sweden and France.',
        duration: 4600,
      },
      {
        year: 1648,
        lon: 7.63,
        lat: 51.96,
        height: 1000000,
        title: '明斯特',
        titleEn: 'Münster',
        route: 'land',
        caption:
          '1648 年，威斯特伐利亚和约在明斯特与奥斯纳布吕克签订，结束三十年战争。和约确认加尔文宗的合法地位，规定各邦可自行决定其领地宗教，并以条约而非教廷裁决处理帝国争端。此后欧洲的外交逐步以多国条约与势力均衡为常态。',
        captionEn:
          'The Peace of Westphalia, signed at Münster and Osnabrück in 1648, ended the Thirty Years War. It recognised Calvinism, left each territory to settle its own confession and handled imperial disputes by treaty rather than papal ruling, a pattern that shaped later European diplomacy.',
        duration: 4800,
      },
    ],
  },
  {
    id: 'napoleon',
    title: '拿破仑战争',
    titleEn: 'The Napoleonic Wars',
    subtitle: '从革命将军到皇帝，拿破仑的军队把欧洲拖入全面战争',
    subtitleEn:
      'From revolutionary general to emperor, Napoleon drew Europe into total war',
    steps: [
      {
        year: 1799,
        lon: 2.35,
        lat: 48.86,
        height: 1100000,
        title: '巴黎',
        titleEn: 'Paris',
        route: 'land',
        caption:
          '1799 年，拿破仑自埃及返回巴黎，参与雾月政变，推翻督政府，出任第一执政。新政权集中行政权，与教会和解，并整顿财政与法典。此后数年间，法国在与第二次反法同盟的战争中取得优势，拿破仑的军政权力不断扩大。',
        captionEn:
          'Napoleon returned from Egypt in 1799 and joined the coup of 18 Brumaire, overthrowing the Directory and becoming First Consul. The new regime centralised administration, reached a settlement with the Church and reformed finance and law, while victories against the Second Coalition widened his power.',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: 1805,
        lon: 16.76,
        lat: 49.13,
        height: 1400000,
        title: '奥斯特里茨',
        titleEn: 'Austerlitz',
        route: 'land',
        caption:
          '1805 年 12 月，拿破仑在奥斯特里茨附近迎战俄奥联军，以诱敌分兵之计击破其中路。联军伤亡与被俘者逾万，第三次反法同盟随之瓦解，奥地利割地求和。法国此后在德意志西部组建莱茵邦联，神圣罗马帝国于次年解体。',
        captionEn:
          'In December 1805 Napoleon met the Russian and Austrian armies near Austerlitz and broke their centre by deliberately weakening his own right flank. The Third Coalition collapsed and Austria sued for peace; France then organised the Confederation of the Rhine, and the Holy Roman Empire dissolved the following year.',
        duration: 4600,
      },
      {
        year: 1812,
        lon: 37.62,
        lat: 55.75,
        height: 1800000,
        title: '莫斯科',
        titleEn: 'Moscow',
        route: 'land',
        caption:
          '1812 年 6 月，拿破仑率大军渡过涅曼河进入俄国，9 月在博罗季诺与俄军激战，随后进入莫斯科。俄军放弃城市并纵火，法军补给断绝，10 月起撤退，冬季行军与俄军追击造成大量减员。此役之后，法国在东欧的军事优势明显削弱。',
        captionEn:
          'In June 1812 Napoleon crossed the Niemen into Russia, fought the Russians at Borodino in September and entered Moscow. The city burned, supplies ran out and the army retreated from October; winter and pursuit destroyed much of it, and French dominance in eastern Europe began to fall away.',
        radiusKm: 200,
        duration: 4700,
      },
      {
        year: 1813,
        lon: 12.37,
        lat: 51.34,
        height: 1800000,
        title: '莱比锡',
        titleEn: 'Leipzig',
        route: 'land',
        caption:
          '1813 年 10 月，普鲁士、俄国、奥地利与瑞典联军在莱比锡附近与法军会战，史称民族大会战。萨克森军队临阵倒戈，法军撤退时桥梁被炸，损失惨重。战后德意志诸邦脱离法国控制，联军于次年攻入法国本土。',
        captionEn:
          'In October 1813 Prussian, Russian, Austrian and Swedish forces fought Napoleon at Leipzig. Saxon troops changed sides, and the French retreat ended in a premature bridge explosion and heavy losses. Germany slipped from French control, and the allies invaded France the next year.',
        duration: 4600,
      },
      {
        year: 1814,
        lon: 10.4,
        lat: 42.78,
        height: 1100000,
        title: '厄尔巴岛',
        titleEn: 'Elba',
        route: 'sea',
        caption:
          '1814 年 4 月，巴黎陷落后拿破仑退位，依枫丹白露条约保留皇帝称号，被流放至厄尔巴岛。波旁王朝在法国复辟，路易十八颁布宪章。拿破仑留居岛上不足一年，仍关注法国的政局与复辟政府的处境。',
        captionEn:
          'After Paris fell in April 1814 Napoleon abdicated under the Treaty of Fontainebleau and was exiled to Elba, keeping the title of emperor. The Bourbons returned under Louis XVIII and issued a charter, while Napoleon spent less than a year on the island watching French politics.',
        duration: 4500,
      },
      {
        year: 1815,
        lon: 4.41,
        lat: 50.68,
        height: 1100000,
        title: '滑铁卢',
        titleEn: 'Waterloo',
        route: 'land',
        caption:
          '1815 年 3 月，拿破仑离岛登陆法国，重返巴黎，建立百日王朝。6 月，法军在滑铁卢与威灵顿指挥的英荷联军交战，普鲁士布吕歇尔部赶到战场，法军溃败。拿破仑再度退位，被流放至圣赫勒拿岛，战后的维也纳体系得以维持。',
        captionEn:
          'Napoleon landed in France in March 1815 and returned to Paris for the Hundred Days. In June his army met Wellington near Waterloo; Blücher\'s Prussians arrived late in the day and the French line broke. Napoleon abdicated again and was sent to Saint Helena, leaving the Vienna settlement intact.',
        duration: 4700,
      },
    ],
  },
  {
    id: 'latin-america',
    title: '拉丁美洲独立',
    titleEn: 'Latin American Independence',
    subtitle: '玻利瓦尔与圣马丁南北并进，西属美洲在十五年内独立',
    subtitleEn:
      'Bolívar and San Martín advance from north and south, and Spanish America wins independence within fifteen years',
    steps: [
      {
        year: 1810,
        lon: -66.9,
        lat: 10.48,
        height: 1200000,
        title: '加拉加斯',
        titleEn: 'Caracas',
        route: 'land',
        caption:
          '1810 年 4 月，加拉加斯市政议会罢黜西班牙都督，成立执政委员会，次年宣布委内瑞拉独立。玻利瓦尔参与其中，此后率军辗转于委内瑞拉与哥伦比亚之间。独立战争在平原与海岸反复拉锯，城市数度易手。',
        captionEn:
          'In April 1810 Caracas removed the Spanish captain-general and set up a junta, declaring Venezuelan independence the following year. Bolívar took part and then fought back and forth across Venezuela and New Granada, as towns changed hands repeatedly.',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: 1816,
        lon: -58.38,
        lat: -34.6,
        height: 1800000,
        title: '布宜诺斯艾利斯',
        titleEn: 'Buenos Aires',
        route: 'sea',
        caption:
          '1816 年 7 月，图库曼议会宣布拉普拉塔联合省独立，布宜诺斯艾利斯成为革命政府的中心。圣马丁此前已着手组建安第斯军，筹划翻越山脉进攻秘鲁。此后数年，阿根廷的独立政府一边应对内陆与保王派的冲突，一边为远征筹备粮秣与骡马。',
        captionEn:
          'In July 1816 the Congress of Tucumán declared the United Provinces of the Río de la Plata independent, with Buenos Aires as the centre of the revolutionary government. San Martín had already begun organising the Army of the Andes, and the province spent the following years supplying an expedition across the mountains.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: 1819,
        lon: -74.07,
        lat: 4.71,
        height: 1800000,
        title: '波哥大',
        titleEn: 'Bogotá',
        route: 'land',
        caption:
          '1819 年，玻利瓦尔率军自委内瑞拉平原出发，翻越安第斯山进入新格拉纳达，在博亚卡河畔击败保王派军队。8 月，革命军进入波哥大，随后宣布成立大哥伦比亚共和国，辖委内瑞拉、新格拉纳达与基多。此后独立战争的重心转向南方。',
        captionEn:
          'In 1819 Bolívar marched from the Venezuelan plains over the Andes into New Granada and defeated royalist forces at the Boyacá bridge. His army entered Bogotá in August, and the Republic of Gran Colombia was proclaimed to join Venezuela, New Granada and Quito.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: 1821,
        lon: -77.04,
        lat: -12.05,
        height: 1200000,
        title: '利马',
        titleEn: 'Lima',
        route: 'land',
        caption:
          '1821 年 7 月，圣马丁率安第斯军与舰队进抵利马，西班牙总督弃城退往山区。圣马丁在利马宣布秘鲁独立，并就政体形式与当地精英商议。保王派军队仍控制内地，战争并未结束，此后数年战事转入安第斯山区。',
        captionEn:
          'In July 1821 San Martín brought his army and fleet to Lima; the Spanish viceroy abandoned the city for the highlands. San Martín proclaimed Peruvian independence and consulted local elites on a form of government, but royalist forces still held the interior and the war continued in the Andes.',
        radiusKm: 200,
        duration: 4500,
      },
      {
        year: 1821,
        lon: -99.13,
        lat: 19.43,
        height: 2400000,
        title: '墨西哥城',
        titleEn: 'Mexico City',
        route: 'air',
        caption:
          '1821 年 9 月，伊图尔维德率军进入墨西哥城，依据伊瓜拉计划宣布墨西哥独立，并组建摄政政府。此前十余年，墨西哥各地已爆发多轮起义与镇压，地方武装与保王派军队反复交战。独立后政局未定，1822 年伊图尔维德称帝，次年即被推翻。',
        captionEn:
          'In September 1821 Iturbide entered Mexico City and declared independence under the Plan of Iguala, forming a regency. More than a decade of revolts and royalist counter-insurgency preceded this; the political order remained unsettled when Iturbide took the throne in 1822 and was overthrown the next year.',
        radiusKm: 200,
        duration: 4700,
      },
      {
        year: 1822,
        lon: -79.92,
        lat: -2.17,
        height: 1400000,
        title: '瓜亚基尔',
        titleEn: 'Guayaquil',
        route: 'sea',
        caption:
          '1822 年 7 月，玻利瓦尔与圣马丁在瓜亚基尔会晤，商谈秘鲁战事与南美独立后的政治安排，会谈内容未留下正式记录。会晤后圣马丁辞去保护者职务并离开秘鲁，玻利瓦尔继续率军作战。此后数年间，西班牙军队在秘鲁与上秘鲁相继被击败。',
        captionEn:
          'In July 1822 Bolívar and San Martín met at Guayaquil to discuss the Peruvian campaign and the political future of the continent; no official record of their talks survives. San Martín resigned his protectorate and left Peru, while Bolívar carried on the war until Spanish forces were defeated in Peru and Upper Peru.',
        duration: 4700,
      },
    ],
  },
  {
    id: 'meiji',
    title: '明治维新',
    titleEn: 'The Meiji Restoration',
    subtitle: '黑船叩关后，日本用一代人的时间完成工业化与国家重建',
    subtitleEn:
      'After the black ships arrived, Japan industrialised and rebuilt the state within a generation',
    steps: [
      {
        year: 1853,
        lon: 139.68,
        lat: 35.24,
        height: 900000,
        title: '浦贺',
        titleEn: 'Uraga',
        route: 'sea',
        caption:
          '1853 年 7 月，美国东印度舰队司令佩里率舰抵达浦贺，要求日本开国通商，幕府以需请示天皇为由暂缓答复。次年舰队再次来航，幕府在压力下签订日美亲善条约，开放下田与函馆。通商口岸的开放引发物价波动与政治争论，尊王攘夷运动随之兴起。',
        captionEn:
          'In July 1853 Commodore Perry arrived at Uraga with an American squadron and demanded that Japan open its ports. The shogunate stalled, but after a second visit it signed a treaty in 1854 opening Shimoda and Hakodate. Trade brought inflation and political conflict, and the movement to expel the foreigners and restore imperial rule gathered force.',
        duration: 4500,
      },
      {
        year: 1868,
        lon: 135.77,
        lat: 35.01,
        height: 900000,
        title: '京都',
        titleEn: 'Kyoto',
        route: 'land',
        caption:
          '1868 年 1 月，明治天皇颁布王政复古大号令，宣布废除幕府，要求将军德川庆喜辞官纳地，戊辰战争随即爆发。同年 4 月，新政府发布五条誓文，提出广兴会议、上下同心与求知识于世界。此后倒幕各藩的军队沿东海道东进，幕府势力节节败退。',
        captionEn:
          'In January 1868 the young Meiji emperor issued a decree restoring imperial rule and abolishing the shogunate; the Boshin War broke out soon afterwards. In April the new government issued the Charter Oath, promising deliberative assemblies and the pursuit of knowledge worldwide, as anti-shogunate forces moved east along the Tokaido.',
        duration: 4600,
      },
      {
        year: 1869,
        lon: 139.69,
        lat: 35.68,
        height: 900000,
        title: '东京',
        titleEn: 'Tokyo',
        route: 'land',
        caption:
          '1869 年，江户改名东京，天皇自京都迁居至此，东京成为实际的政治中心。同年，各藩主在压力下上表奉还版籍，藩主改任知藩事。1871 年废藩置县，旧藩界被府县取代，中央政府的税收与人事权由此确立。',
        captionEn:
          'Edo was renamed Tokyo in 1869, and the emperor moved there from Kyoto, making it the political centre. The same year the daimyo were pressed to return their domains to the throne, and in 1871 the domains were replaced by prefectures, giving the central government control over taxation and appointments.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: 1872,
        lon: 139.64,
        lat: 35.44,
        height: 900000,
        title: '横滨',
        titleEn: 'Yokohama',
        route: 'land',
        caption:
          '1872 年，新桥至横滨的铁路开通，为日本第一条铁路，初期由英国工程师参与修建。同年政府颁布学制，划分学区，推行小学义务教育，并陆续设立工部省所属的官营工厂与矿山。交通、教育与产业的改造自此同步推进。',
        captionEn:
          'In 1872 Japan opened its first railway, linking Shimbashi and Yokohama with British engineering help. That year the government also issued an education system establishing school districts and elementary schooling, alongside state-run factories and mines, so transport, schooling and industry were reshaped together.',
        duration: 4500,
      },
      {
        year: 1877,
        lon: 130.56,
        lat: 31.6,
        height: 1400000,
        title: '鹿儿岛',
        titleEn: 'Kagoshima',
        route: 'sea',
        caption:
          '1877 年 2 月，西乡隆盛在鹿儿岛起兵，反抗新政府的废刀与改革措施，西南战争爆发。政府军以征募兵与新式装备应战，经数月激战于 9 月平定，西乡战死。此役之后，士族武装反抗基本结束，征兵制军队成为国家军事力量的主体。',
        captionEn:
          'In February 1877 Saigo Takamori raised troops in Kagoshima against the new government, beginning the Satsuma Rebellion. Conscript troops with modern equipment defeated the samurai after months of fighting; Saigo died in September. Armed samurai resistance largely ended, and the conscript army became the core of the state forces.',
        duration: 4600,
      },
      {
        year: 1889,
        lon: 139.69,
        lat: 35.68,
        height: 1200000,
        title: '东京',
        titleEn: 'Tokyo',
        route: 'land',
        caption:
          '1889 年 2 月，明治天皇颁布大日本帝国宪法，确立立宪君主制，设帝国议会，众议院议员由纳税额达标的男性选举产生。宪法规定天皇统帅军队、臣民在法律范围内享有权利，内阁对天皇负责。此后议会政治与藩阀、军部之间的权力关系成为日本政局的主要线索。',
        captionEn:
          'In February 1889 the emperor promulgated the Constitution of the Empire of Japan, creating a constitutional monarchy with a bicameral Diet whose lower house was elected by propertied men. The emperor commanded the military and the cabinet answered to him, so parliamentary politics, oligarchic factions and the armed services shaped the decades that followed.',
        radiusKm: 200,
        duration: 4800,
      },
    ],
  },
  {
    id: 'scramble-africa',
    title: '非洲瓜分',
    titleEn: 'The Scramble for Africa',
    subtitle: '柏林会议后的三十年，欧洲列强用地图和军队瓜分非洲',
    subtitleEn:
      'In the thirty years after the Berlin Conference, European powers divided Africa with maps and armies',
    steps: [
      {
        year: 1882,
        lon: 31.24,
        lat: 30.04,
        height: 1200000,
        title: '开罗',
        titleEn: 'Cairo',
        route: 'land',
        caption:
          '1882 年，英国以保护苏伊士运河与本国债权为由出兵埃及，在泰勒凯比尔击败埃及军队后占领开罗，此后长期驻军。埃及名义上仍属奥斯曼帝国，实际由英国领事与顾问主导财政与外交。运河与尼罗河航路由此纳入英国的帝国交通体系。',
        captionEn:
          'In 1882 Britain intervened in Egypt to protect the Suez Canal and its creditors, defeated the Egyptian army at Tel el-Kebir and occupied Cairo, keeping troops there for decades. Egypt remained nominally Ottoman but British consuls and advisers controlled its finances and foreign policy, and the canal became part of an imperial route.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: 1884,
        lon: 13.4,
        lat: 52.52,
        height: 1800000,
        title: '柏林',
        titleEn: 'Berlin',
        route: 'air',
        caption:
          '1884 年 11 月至 1885 年 2 月，柏林会议在俾斯麦主持下召开，英、法、德、葡、比等十四国参加，非洲代表缺席。会议就刚果河流域的贸易自由、航行自由与有效占领原则达成协议，并划定部分边界。会后列强加速向内陆推进，以条约、军事远征与公司特许状确立控制。',
        captionEn:
          'From November 1884 to February 1885 Bismarck hosted a conference in Berlin with fourteen powers, including Britain, France, Germany, Portugal and Belgium, but no African representatives. It agreed on free trade and navigation in the Congo basin and on the principle of effective occupation, and the powers then pressed inland through treaties, expeditions and chartered companies.',
        radiusKm: 200,
        duration: 4800,
      },
      {
        year: 1896,
        lon: 38.74,
        lat: 9.03,
        height: 2400000,
        title: '亚的斯亚贝巴',
        titleEn: 'Addis Ababa',
        route: 'air',
        caption:
          '1896 年 3 月，埃塞俄比亚皇帝孟尼利克二世在阿杜瓦击败意大利远征军，意大利承认埃塞俄比亚独立，双方随后划定边界。亚的斯亚贝巴作为都城在此前后扩建，成为帝国行政与外交的中心。埃塞俄比亚由此成为瓜分时期少数保持独立地位的非洲国家。',
        captionEn:
          'In March 1896 Emperor Menelik II defeated an Italian expeditionary force at Adwa, and Italy recognised Ethiopian independence, with a boundary settled shortly afterwards. Addis Ababa was being expanded as the imperial capital and centre of diplomacy, and Ethiopia remained one of the few African states to keep its independence during the scramble.',
        radiusKm: 200,
        duration: 4700,
      },
      {
        year: 1899,
        lon: 28.19,
        lat: -25.75,
        height: 2400000,
        title: '比勒陀利亚',
        titleEn: 'Pretoria',
        route: 'air',
        caption:
          '1899 年 10 月，英国与德兰士瓦、奥兰治自由邦的战争爆发，史称第二次布尔战争。布尔人先期围攻英军据点，英国随后调集大批军队并采取焦土与集中营政策。1902 年战争以布尔方投降结束，两个共和国并入英国殖民地，1910 年又与开普、纳塔尔合并为南非联邦。',
        captionEn:
          'In October 1899 war broke out between Britain and the Transvaal and Orange Free State, the Second Boer War. Boer forces besieged British garrisons before large imperial reinforcements arrived and adopted scorched-earth tactics and concentration camps. The republics surrendered in 1902 and were absorbed into the British colonies, later joining the Union of South Africa in 1910.',
        radiusKm: 200,
        duration: 4700,
      },
      {
        year: 1903,
        lon: 8.52,
        lat: 12.0,
        height: 2400000,
        title: '卡诺',
        titleEn: 'Kano',
        route: 'air',
        caption:
          '1903 年 2 月，英国军队攻占卡诺，随后进入索科托，索科托哈里发国战败，其领土被并入北尼日利亚保护地。英国在此推行间接统治，保留酋长与伊斯兰法庭，同时由驻节官掌控税收与司法终审。卡诺的商路与手工业由此被纳入殖民地经济。',
        captionEn:
          'In February 1903 British troops took Kano and then Sokoto, defeating the Sokoto Caliphate and incorporating its lands into the Protectorate of Northern Nigeria. Britain ruled indirectly through emirs and Islamic courts while residents controlled taxation and final appeals, tying Kano\'s trade and crafts to a colonial economy.',
        duration: 4700,
      },
      {
        year: 1914,
        lon: 3.39,
        lat: 6.45,
        height: 1200000,
        title: '拉各斯',
        titleEn: 'Lagos',
        route: 'land',
        caption:
          '1914 年，英国将北尼日利亚保护地与南尼日利亚殖民地合并为尼日利亚殖民地和保护国，以拉各斯为行政中心。同年第一次世界大战爆发，英国与德国在非洲的殖民地相互开战，喀麦隆、多哥、德属东非与西南非洲相继成为战场。战争结束后，原德国殖民地以委任统治形式转交协约国。',
        captionEn:
          'In 1914 Britain merged the Protectorate of Northern Nigeria with the Colony and Protectorate of Southern Nigeria, with Lagos as the administrative centre. When the First World War broke out that year, British and German colonies fought in Africa, making Kamerun, Togoland, German East Africa and South West Africa battlegrounds; after the war the German colonies became mandates.',
        radiusKm: 200,
        duration: 4800,
      },
    ],
  },
  {
    id: 'decolonization',
    title: '去殖民化',
    titleEn: 'Decolonization',
    subtitle: '二战后三十余年，亚非国家相继独立，重画了世界政治地图',
    subtitleEn:
      'In the three decades after the Second World War, Asian and African states won independence and redrew the political map',
    steps: [
      {
        year: 1947,
        lon: 77.21,
        lat: 28.61,
        height: 1100000,
        title: '德里',
        titleEn: 'Delhi',
        route: 'land',
        caption:
          '1947 年 8 月，英国结束对印度的统治，印度与巴基斯坦分别独立，分治引发大规模人口迁移与教派暴力。新德里成为印度首都，两国随即因克什米尔归属爆发第一次印巴战争。此后数十年，南亚的政治格局围绕分治遗产与边界争端展开。',
        captionEn:
          'In August 1947 British rule in India ended and India and Pakistan became independent; partition set off mass migration and communal violence. New Delhi became the capital of India, and the two states fought over Kashmir within months. The legacy of partition and disputed borders shaped South Asian politics for decades.',
        radiusKm: 200,
        duration: 4600,
      },
      {
        year: 1954,
        lon: 105.85,
        lat: 21.03,
        height: 1800000,
        title: '河内',
        titleEn: 'Hanoi',
        route: 'air',
        caption:
          '1954 年 5 月，越盟在奠边府战役中击败法国军队，日内瓦会议随即召开，与会各方签署协议，法国撤出印度支那，越南沿北纬十七度线暂时分治。河内成为越南民主共和国的首都。分治条款规定 1956 年举行统一选举，选举未举行，南北对峙延续。',
        captionEn:
          'In May 1954 the Viet Minh defeated the French at Dien Bien Phu, and the Geneva Conference that followed provided for a French withdrawal and a temporary division of Vietnam at the seventeenth parallel. Hanoi became the capital of the Democratic Republic of Vietnam; the promised unification elections of 1956 were never held and the division endured.',
        radiusKm: 200,
        duration: 4700,
      },
      {
        year: 1955,
        lon: 107.6,
        lat: -6.9,
        height: 1400000,
        title: '万隆',
        titleEn: 'Bandung',
        route: 'sea',
        caption:
          '1955 年 4 月，二十九个亚非国家与地区的代表在万隆举行会议，讨论反殖民、经济发展与和平共处，通过万隆会议十项原则。会议未设常设机构，但为不结盟运动与南南合作提供了舆论与组织经验。与会国在冷战格局中寻求独立于两大阵营的立场。',
        captionEn:
          'In April 1955 delegates from twenty-nine Asian and African states and territories met at Bandung to discuss decolonisation, economic development and peaceful coexistence, adopting ten principles. The conference created no permanent body, but it gave the Non-Aligned Movement and South-South cooperation a platform, as participants sought positions independent of the Cold War blocs.',
        duration: 4600,
      },
      {
        year: 1957,
        lon: -0.19,
        lat: 5.6,
        height: 2400000,
        title: '阿克拉',
        titleEn: 'Accra',
        route: 'air',
        caption:
          '1957 年 3 月，黄金海岸在恩克鲁玛领导下独立，改名加纳，成为撒哈拉以南非洲第一个摆脱殖民统治的独立国家。新政府推行义务教育与基础设施计划，并支持非洲大陆的反殖民运动。此后十年，法属与英属非洲殖民地陆续通过谈判或武装斗争取得独立。',
        captionEn:
          'In March 1957 the Gold Coast became independent as Ghana under Kwame Nkrumah, the first colony in sub-Saharan Africa to win freedom. The new government expanded schooling and infrastructure and supported anti-colonial movements elsewhere, and within a decade French and British territories across Africa followed through negotiation or armed struggle.',
        radiusKm: 200,
        duration: 4700,
      },
      {
        year: 1962,
        lon: 3.06,
        lat: 36.75,
        height: 1800000,
        title: '阿尔及尔',
        titleEn: 'Algiers',
        route: 'air',
        caption:
          '1962 年 3 月，法国与阿尔及利亚民族解放阵线签署埃维昂协议，7 月阿尔及利亚经公投宣布独立，结束自 1954 年起的战争。独立前后，大批欧洲裔居民迁离，土地与产业的所有权随之转移。阿尔及尔成为新国家首都，北非的政治版图在此后数年继续变动。',
        captionEn:
          'In March 1962 France and the National Liberation Front signed the Evian Accords, and Algeria declared independence after a July referendum, ending a war that had begun in 1954. Large numbers of European settlers left before and after independence, and ownership of land and industry changed hands. Algiers became the capital of the new state as North Africa continued to shift.',
        radiusKm: 200,
        duration: 4700,
      },
      {
        year: 1975,
        lon: 32.57,
        lat: -25.97,
        height: 2400000,
        title: '马普托',
        titleEn: 'Maputo',
        route: 'air',
        caption:
          '1975 年 6 月，莫桑比克解放阵线宣布独立，结束葡萄牙近五百年的殖民统治，马普托成为首都。同年，安哥拉、佛得角、圣多美和普林西比相继独立，葡属非洲帝国瓦解。独立后的莫桑比克与安哥拉随即陷入长期内战，战事与冷战阵营的介入相互交织。',
        captionEn:
          'In June 1975 Frelimo declared Mozambican independence, ending nearly five centuries of Portuguese rule, with Maputo as the capital. Angola, Cape Verde and Sao Tome and Principe became independent the same year, and the Portuguese African empire dissolved. Mozambique and Angola then fell into long civil wars that became entangled with Cold War alignments.',
        radiusKm: 200,
        duration: 4800,
      },
    ],
  },
];
