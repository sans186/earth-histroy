/**
 * Shared gazetteer for story steps: a display name plus a real-world
 * coordinate for every place a guided story visits. Stories read
 * `PLACES.xxx.lon` / `PLACES.xxx.lat` instead of repeating magic numbers.
 */
export const PLACES: Record<string, { name: string; lon: number; lat: number }> = {
  // Silk Road & the Eurasian crossroads
  changan: { name: '长安', lon: 108.9, lat: 34.3 },
  dunhuang: { name: '敦煌', lon: 94.7, lat: 40.1 },
  samarkand: { name: '撒马尔罕', lon: 66.9, lat: 39.6 },
  baghdad: { name: '巴格达', lon: 44.4, lat: 33.3 },
  constantinople: { name: '君士坦丁堡', lon: 28.9, lat: 41.0 },
  damascus: { name: '大马士革', lon: 36.3, lat: 33.5 },
  jerusalem: { name: '耶路撒冷', lon: 35.2, lat: 31.8 },
  acre: { name: '阿卡', lon: 35.1, lat: 32.9 },
  antioch: { name: '安条克', lon: 36.2, lat: 36.2 },
  nicaea: { name: '尼西亚', lon: 29.7, lat: 40.4 },
  clermont: { name: '克莱蒙', lon: 3.1, lat: 45.8 },

  // Alexander the Great's campaign
  pella: { name: '佩拉', lon: 22.5, lat: 40.8 },
  troy: { name: '特洛伊', lon: 26.2, lat: 39.9 },
  issus: { name: '伊苏斯', lon: 36.2, lat: 36.8 },
  tyre: { name: '推罗', lon: 35.2, lat: 33.3 },
  alexandria: { name: '亚历山大港', lon: 29.9, lat: 31.2 },
  babylon: { name: '巴比伦', lon: 44.4, lat: 32.5 },
  indus: { name: '印度河', lon: 72.8, lat: 33.9 },

  // The Mongol western campaigns
  karakorum: { name: '哈拉和林', lon: 102.8, lat: 47.2 },
  kyiv: { name: '基辅', lon: 30.5, lat: 50.5 },
  legnica: { name: '莱格尼察', lon: 16.2, lat: 51.2 },
  vienna: { name: '维也纳', lon: 16.4, lat: 48.2 },

  // The Islamic expansion
  medina: { name: '麦地那', lon: 39.6, lat: 24.5 },
  carthage: { name: '迦太基', lon: 10.3, lat: 36.9 },
  cordoba: { name: '科尔多瓦', lon: -4.8, lat: 37.9 },

  // Age of Discovery & the Atlantic
  rome: { name: '罗马', lon: 12.5, lat: 41.9 },
  venice: { name: '威尼斯', lon: 12.3, lat: 45.4 },
  lisbon: { name: '里斯本', lon: -9.1, lat: 38.7 },
  seville: { name: '塞维利亚', lon: -6.0, lat: 37.4 },
  capeOfGoodHope: { name: '好望角', lon: 18.5, lat: -34.4 },
  malacca: { name: '马六甲', lon: 102.3, lat: 2.2 },

  // East Asia
  guangzhou: { name: '广州', lon: 113.3, lat: 23.1 },
  quanzhou: { name: '泉州', lon: 118.6, lat: 24.9 },
  kyoto: { name: '京都', lon: 135.8, lat: 35.0 },
  tokyo: { name: '东京', lon: 139.7, lat: 35.7 },
  beijing: { name: '北京', lon: 116.4, lat: 39.9 },
  hiroshima: { name: '广岛', lon: 132.5, lat: 34.4 },

  // Europe
  london: { name: '伦敦', lon: -0.1, lat: 51.5 },
  paris: { name: '巴黎', lon: 2.3, lat: 48.9 },
  berlin: { name: '柏林', lon: 13.4, lat: 52.5 },
  moscow: { name: '莫斯科', lon: 37.6, lat: 55.8 },
  amsterdam: { name: '阿姆斯特丹', lon: 4.9, lat: 52.4 },
  madrid: { name: '马德里', lon: -3.7, lat: 40.4 },
  athens: { name: '雅典', lon: 23.7, lat: 37.98 },
  sarajevo: { name: '萨拉热窝', lon: 18.4, lat: 43.9 },
  normandy: { name: '诺曼底', lon: -0.6, lat: 49.3 },
  stalingrad: { name: '斯大林格勒', lon: 44.5, lat: 48.7 },

  // The Americas & the Pacific
  washington: { name: '华盛顿', lon: -77.0, lat: 38.9 },
  newYork: { name: '纽约', lon: -74.0, lat: 40.7 },
  pearlHarbor: { name: '珍珠港', lon: -157.9, lat: 21.3 },
  midway: { name: '中途岛', lon: -177.4, lat: 28.2 },

  // North Africa & the Middle East
  cairo: { name: '开罗', lon: 31.2, lat: 30.0 },
};
