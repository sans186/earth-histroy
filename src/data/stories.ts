import type { Story } from '@/types/story';

/**
 * Guided stories. Coordinates are real city centres; durations are in
 * milliseconds, long enough to read a two-line caption without rushing.
 */
export const STORIES: Story[] = [
  {
    id: 'silk-road',
    title: '丝绸之路',
    subtitle: '从长安到地中海，一条横贯欧亚的商路',
    steps: [
      {
        year: -138,
        lon: 108.9,
        lat: 34.3,
        height: 1200000,
        title: '长安',
        caption:
          '公元前 138 年，张骞自长安出发西行。此后这里成为丝路东端的起点，丝绸、漆器与文书由此流向河西。',
        duration: 4500,
      },
      {
        year: -111,
        lon: 94.7,
        lat: 40.1,
        height: 1150000,
        title: '敦煌',
        caption:
          '汉武帝设敦煌郡，玉门关与阳关扼守西域门户。商队与僧侣在此补给、译经，莫高窟的灯火延续千年。',
        duration: 4200,
      },
      {
        year: -128,
        lon: 66.9,
        lat: 39.6,
        height: 1200000,
        title: '撒马尔罕',
        caption:
          '张骞的副使抵达粟特城邦。撒马尔罕的市集上，中国的丝绸与印度的香料、波斯的银器汇于一处。',
        duration: 4300,
      },
      {
        year: 762,
        lon: 44.4,
        lat: 33.3,
        height: 1200000,
        title: '巴格达',
        caption:
          '阿拔斯王朝营建巴格达，底格里斯河畔的圆形之城成为西段商路枢纽，东方货物经波斯湾与陆路在此集散。',
        duration: 4400,
      },
      {
        year: 330,
        lon: 28.9,
        lat: 41.0,
        height: 1150000,
        title: '君士坦丁堡',
        caption:
          '君士坦丁堡成为罗马帝国的新都。博斯普鲁斯海峡扼守欧亚之间，丝绸在此转运，并被课以重税。',
        duration: 4300,
      },
      {
        year: 117,
        lon: 12.5,
        lat: 41.9,
        height: 1100000,
        title: '罗马',
        caption:
          '图拉真时代的罗马帝国臻于极盛。东方的丝绸被视作奢侈品，元老院曾屡次下令限制其消费。',
        duration: 4200,
      },
      {
        year: 1271,
        lon: 12.3,
        lat: 45.4,
        height: 1200000,
        title: '威尼斯',
        caption:
          '马可·波罗自威尼斯启程东行。这座潟湖城邦凭借舰队与商站网络，将丝路贸易推向后世的高峰。',
        duration: 4300,
      },
      {
        year: 661,
        lon: 36.3,
        lat: 33.5,
        height: 1250000,
        title: '大马士革',
        caption:
          '倭马亚王朝定都大马士革。商队从这里出发，连接地中海港口与两河流域，再向东通往中亚与长安。',
        duration: 4500,
      },
    ],
  },
];
