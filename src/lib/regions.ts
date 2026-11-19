import type { Locale, TimelineEvent } from '@/types';

/**
 * Regions used by the comparison view.
 *
 * Assignment is keyword-first where it matters: when the coarse boxes overlap,
 * the free-text `region` / title decides which one the event belongs to.
 * Coordinates remain the positional fallback (and the only signal for rows
 * that name no region).
 */
export interface Region {
  id: string;
  zh: string;
  en: string;
  bbox: { west: number; south: number; east: number; north: number };
  keywords: readonly string[];
}

export const REGIONS: readonly Region[] = [
  {
    id: 'eastAsia',
    zh: '东亚',
    en: 'East Asia',
    bbox: { west: 95, south: 15, east: 150, north: 52 },
    keywords: ['中国', '日本', '朝鲜', '韩国', '蒙古', '台湾', 'china', 'japan', 'korea', 'mongol', 'taiwan'],
  },
  {
    id: 'mediterranean',
    zh: '地中海',
    en: 'Mediterranean',
    bbox: { west: -12, south: 26, east: 45, north: 48 },
    keywords: ['地中海', '意大利', '希腊', '罗马', '西班牙', '葡萄牙', '摩洛哥', '利比亚', 'italy', 'greece', 'rome', 'spain', 'morocco', 'libya'],
  },
  {
    id: 'europe',
    zh: '欧洲',
    en: 'Europe',
    bbox: { west: -14, south: 36, east: 42, north: 72 },
    keywords: ['欧洲', '英国', '法国', '德国', '俄国', '俄罗斯', '波兰', '北欧', 'england', 'britain', 'france', 'german', 'russia', 'poland', 'europe'],
  },
  {
    id: 'middleEast',
    zh: '中东',
    en: 'Middle East',
    bbox: { west: 24, south: 12, east: 64, north: 42 },
    keywords: ['中东', '波斯', '伊朗', '阿拉伯', '两河', '伊拉克', '叙利亚', '奥斯曼', '土耳其', 'persia', 'iran', 'arab', 'mesopotamia', 'iraq', 'syria', 'ottoman', 'turkey'],
  },
  {
    id: 'southAsia',
    zh: '南亚',
    en: 'South Asia',
    bbox: { west: 60, south: 4, east: 95, north: 38 },
    keywords: ['印度', '巴基斯坦', '孟加拉', '斯里兰卡', '印度次大陆', 'india', 'pakistan', 'bengal', 'ceylon'],
  },
  {
    id: 'africa',
    zh: '非洲',
    en: 'Africa',
    bbox: { west: -20, south: -36, east: 52, north: 37 },
    keywords: ['非洲', '埃塞俄比亚', '尼日利亚', '南非', '刚果', '埃及', 'africa', 'ethiopia', 'nigeria', 'congo', 'zulu', 'egypt'],
  },
  {
    id: 'americas',
    zh: '美洲',
    en: 'Americas',
    bbox: { west: -170, south: -56, east: -30, north: 72 },
    keywords: ['美洲', '美国', '墨西哥', '巴西', '秘鲁', '阿根廷', '加拿大', 'american', 'united states', 'mexic', 'brazil', 'peru', 'argentin', 'canada', 'inca', 'maya', 'aztec'],
  },
  {
    id: 'oceania',
    zh: '大洋洲',
    en: 'Oceania',
    bbox: { west: 110, south: -50, east: 180, north: 0 },
    keywords: ['大洋洲', '澳大利', '新西兰', '波利尼西亚', 'australia', 'new zealand', 'polynesia'],
  },
];

export function regionLabel(region: Region, locale: Locale) {
  return locale === 'zh' ? region.zh : region.en;
}

export function findRegion(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id);
}

/**
 * Keyword first, coordinates second, null if neither can place it.
 *
 * The boxes overlap at the edges of Europe: the Mediterranean box reaches
 * 45°E / 48°N, which swallows Crimea's 33.8°E / 44.5°N. When several boxes fit,
 * the free-text region therefore decides first ("克里米亚，俄罗斯帝国" names
 * Russia, so the event is European); the first box is only the tie-break. This
 * also keeps Italy and Spain in the Mediterranean, since their own names are
 * Mediterranean keywords. Rows outside every box still fall back to keywords.
 */
export function regionOf(event: TimelineEvent): string | null {
  const haystack = `${event.region} ${event.title}`.toLowerCase();

  if (event.lon !== null && event.lat !== null) {
    const lon = event.lon;
    const lat = event.lat;
    const boxes = REGIONS.filter((region) => {
      const { west, south, east, north } = region.bbox;
      return lon >= west && lon <= east && lat >= south && lat <= north;
    });
    if (boxes.length) {
      const named = boxes.find((region) => region.keywords.some((k) => haystack.includes(k)));
      return (named ?? boxes[0]).id;
    }
  }

  for (const region of REGIONS) {
    if (region.keywords.some((k) => haystack.includes(k))) return region.id;
  }
  return null;
}

/** Total angular distance between two region centres, in kilometres. */
export function regionDistanceKm(a: Region, b: Region): number {
  const cx = (r: Region) => (r.bbox.west + r.bbox.east) / 2;
  const cy = (r: Region) => (r.bbox.south + r.bbox.north) / 2;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(cy(b) - cy(a));
  const dLon = toRad(cx(b) - cx(a));
  const lat1 = toRad(cy(a));
  const lat2 = toRad(cy(b));
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h))));
}
