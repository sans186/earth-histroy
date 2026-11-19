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
        caption:
          '汉武帝设敦煌郡，玉门关与阳关扼守西域门户。商队与僧侣在此补给、译经，莫高窟的灯火延续千年。',
        captionEn:
          'Emperor Wu of Han established Dunhuang Commandery; the Yumen and Yangguan passes guarded the gateway to the Western Regions. Caravans and monks resupplied and translated sutras here, and the lamps of Mogao burned for a thousand years.',
        duration: 4200,
      },
      {
        year: -128,
        lon: 66.9,
        lat: 39.6,
        height: 1200000,
        title: '撒马尔罕',
        titleEn: 'Samarkand',
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
        caption:
          '阿拔斯王朝营建巴格达，底格里斯河畔的圆形之城成为西段商路枢纽，东方货物经波斯湾与陆路在此集散。',
        captionEn:
          'The Abbasids founded Baghdad; the Round City on the Tigris became the hub of the western route, gathering eastern goods via the Persian Gulf and the overland roads.',
        duration: 4400,
      },
      {
        year: 330,
        lon: 28.9,
        lat: 41.0,
        height: 1150000,
        title: '君士坦丁堡',
        titleEn: 'Constantinople',
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
        caption:
          '图拉真时代的罗马帝国臻于极盛。东方的丝绸被视作奢侈品，元老院曾屡次下令限制其消费。',
        captionEn:
          'Under Trajan the Roman Empire reached its height. Eastern silk was a luxury in Rome, and the Senate repeatedly tried to restrict its consumption.',
        duration: 4200,
      },
      {
        year: 1271,
        lon: 12.3,
        lat: 45.4,
        height: 1200000,
        title: '威尼斯',
        titleEn: 'Venice',
        caption:
          '马可·波罗自威尼斯启程东行。这座潟湖城邦凭借舰队与商站网络，将丝路贸易推向后世的高峰。',
        captionEn:
          "Marco Polo set out east from Venice. With its fleet and trading stations, the lagoon city carried Silk Road commerce toward its later peak.",
        duration: 4300,
      },
      {
        year: 661,
        lon: 36.3,
        lat: 33.5,
        height: 1250000,
        title: '大马士革',
        titleEn: 'Damascus',
        caption:
          '倭马亚王朝定都大马士革。商队从这里出发，连接地中海港口与两河流域，再向东通往中亚与长安。',
        captionEn:
          "The Umayyads made Damascus their capital. Caravans left here to link Mediterranean ports with Mesopotamia, and onward to Central Asia and Chang'an.",
        duration: 4500,
      },
    ],
  },
];
