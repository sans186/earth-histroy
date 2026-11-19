/**
 * Application constants. Anything hard-coded belongs here.
 */

// ── Cesium ─────────────────────────────────────────────────────────────────
/**
 * Ionic access token. Set VITE_CESIUM_TOKEN in `.env`; never commit a real
 * token. Without it, Cesium falls back to its own default imagery, which is
 * fine for local development.
 */
export const CESIUM_TOKEN = (import.meta.env.VITE_CESIUM_TOKEN as string | undefined) ?? '';

export const INITIAL_VIEW = { lon: 105, lat: 32, height: 13_000_000 };
export const MAX_ZOOM_DISTANCE = 20_000_000;

// ── Basemaps ───────────────────────────────────────────────────────────────
export type BaseKind = 'standard' | 'satellite';

/**
 * Raster basemaps, shared by the globe and the flat map.
 *
 * The OSM tile server is not reachable from mainland networks — every request
 * hangs until it times out, which left both views showing nothing but paper.
 * Esri's ArcGIS endpoints answer from the same networks and serve Web-Mercator
 * tiles in {z}/{y}/{x} order, so a single template works for MapLibre's raster
 * source and Cesium's UrlTemplateImageryProvider alike.
 */
export const BASEMAPS: Record<
  BaseKind,
  { url: string; attribution: string; maxzoom: number }
> = {
  standard: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri World Topo Map',
    maxzoom: 18,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri World Imagery',
    maxzoom: 18,
  },
};

// ── Timeline ───────────────────────────────────────────────────────────────
export const YEAR_MIN = -3100;
/**
 * The last year with a shipped event file.
 *
 * Raising this without adding `public/events/<year>.json` (and its English
 * counterpart) leaves the scale pointing at a year that resolves to nothing,
 * which is why 2025 sat at the end for so long after the data had moved on.
 */
export const YEAR_MAX = 2026;
export const DEFAULT_YEAR = 1911;
/**
 * Half-width, in years, of the event window around the timeline cursor.
 *
 * Was 20, which meant 41 year files per refresh: a drag across the scale queued
 * hundreds of requests and the panel sat "loading" for seconds. Five years is
 * also what the list actually reads like — a neighbourhood, not an era.
 */
export const YEAR_WINDOW = 5;

/**
 * Piecewise-linear mapping between the time scale position (0–10000) and real
 * years. Antiquity is compressed, the modern era stretched, because that is
 * where the event density actually is.
 */
const SEGMENTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-3100, -500, 0, 1000],
  [-500, 500, 1000, 2500],
  [500, 1500, 2500, 4500],
  [1500, 1800, 4500, 6000],
  [1800, 1950, 6000, 8000],
  [1950, 2026, 8000, 10000],
];

export const SCALE_MIN = 0;
export const SCALE_MAX = 10000;

export function scaleToYear(scale: number): number {
  if (scale <= SCALE_MIN) return YEAR_MIN;
  if (scale >= SCALE_MAX) return YEAR_MAX;
  for (const [ys, ye, ss, se] of SEGMENTS) {
    if (scale >= ss && scale <= se) {
      return Math.round(ys + ((scale - ss) / (se - ss)) * (ye - ys));
    }
  }
  return YEAR_MAX;
}

export function yearToScale(year: number): number {
  if (year <= YEAR_MIN) return SCALE_MIN;
  if (year >= YEAR_MAX) return SCALE_MAX;
  for (const [ys, ye, ss, se] of SEGMENTS) {
    if (year >= ys && year <= ye) {
      return Math.round(ss + ((year - ys) / (ye - ys)) * (se - ss));
    }
  }
  return SCALE_MAX;
}

// ── Eras ───────────────────────────────────────────────────────────────────
export interface Era {
  id: string;
  name: string;
  nameEn: string;
  start: number;
  end: number;
  color: string;
}

export const ERAS: readonly Era[] = [
  { id: 'bronze', name: '青铜', nameEn: 'Bronze', start: -3100, end: -1046, color: '#8d7a3e' },
  { id: 'iron', name: '铁器', nameEn: 'Iron', start: -1046, end: -221, color: '#6b7a86' },
  { id: 'classical', name: '古典', nameEn: 'Classical', start: -221, end: 581, color: '#5f7d6a' },
  { id: 'medieval', name: '中古', nameEn: 'Medieval', start: 581, end: 1368, color: '#8a6a4a' },
  { id: 'earlyModern', name: '近世', nameEn: 'Early Modern', start: 1368, end: 1840, color: '#6b7fa0' },
  { id: 'modern', name: '近代', nameEn: 'Modern', start: 1840, end: 1949, color: '#96637a' },
  { id: 'contemporary', name: '当代', nameEn: 'Contemporary', start: 1949, end: 2027, color: '#b0522d' },
];

export function getEra(year: number): Era {
  return ERAS.find((e) => year >= e.start && year < e.end) ?? ERAS[ERAS.length - 1];
}

/** Position of an era on the 0–10000 scale, for laying out the era band. */
export function eraSpan(era: Era): { left: number; width: number } {
  const left = yearToScale(era.start);
  const right = yearToScale(era.end);
  return { left: (left / SCALE_MAX) * 100, width: ((right - left) / SCALE_MAX) * 100 };
}

// ── Network ───────────────────────────────────────────────────────────────
/**
 * Every shipped JSON is read through `services/http.ts`. These are the only
 * knobs: a bounded timeout, a bounded retry with exponential backoff, and a
 * global concurrency ceiling so a timeline scrub cannot fan out into hundreds
 * of simultaneous requests.
 *
 * Century files are up to ~18 MB, so they get their own longer budget.
 */
export const NETWORK = {
  timeoutMs: 12_000,
  largeFileTimeoutMs: 30_000,
  retries: 2,
  backoffBaseMs: 350,
  backoffMaxMs: 4_000,
  maxConcurrent: 8,
} as const;

// ── Data ───────────────────────────────────────────────────────────────────
export const DATA_BASE_ZH = '/events/';
export const DATA_BASE_EN = '/en-events/';
export const POLITIES_BASE = '/ne/polities/';
export const NE_BASE = '/ne/';
export const PEOPLE_BASE = '/people/profiles/';
/**
 * Coordinate summary for every person, kept one level above the profile files.
 *
 * It used to sit inside `profiles/`, where the data validator counted it as a
 * person missing from the index, and where any future "one file per person"
 * assumption would trip over it again.
 */
export const PEOPLE_COORDS = '/people/coords.json';
export const WARS_BASE = '/wars/profiles/';
export const PLACES_BASE = '/places/';

/** Parsed year files retained in memory. */
export const DATA_CACHE_SIZE = 260;

// ── Categories ─────────────────────────────────────────────────────────────
export type CategoryKey =
  | 'political'
  | 'military'
  | 'economic'
  | 'cultural'
  | 'technological'
  | 'exploration';

export const CATEGORY_KEYS: readonly CategoryKey[] = [
  'political',
  'military',
  'economic',
  'cultural',
  'technological',
  'exploration',
];

export const CATEGORIES: Record<CategoryKey, { zh: string; en: string; cssVar: string }> = {
  political: { zh: '政治', en: 'Political', cssVar: '--cat-political' },
  military: { zh: '军事', en: 'Military', cssVar: '--cat-military' },
  economic: { zh: '经济', en: 'Economic', cssVar: '--cat-economic' },
  cultural: { zh: '文化', en: 'Cultural', cssVar: '--cat-cultural' },
  technological: { zh: '科技', en: 'Technology', cssVar: '--cat-technological' },
  exploration: { zh: '探索', en: 'Exploration', cssVar: '--cat-exploration' },
};

/** Raw dataset category strings are folded into the six display categories. */
const CATEGORY_ALIASES: Record<CategoryKey, readonly string[]> = {
  political: ['political', 'legal', 'demographic', 'social', 'administrative', 'diplomatic', '政治', '制度', '行政'],
  military: ['military', 'conflict', 'war', '军事', '战争', '冲突'],
  economic: ['economic', 'trade', 'finance', '经济', '贸易'],
  cultural: ['cultural', 'religious', 'religious', 'archaeological', 'migration', 'art', '文化', '宗教', '艺术'],
  technological: ['technological', 'scientific', 'technology', 'science', '科技', '技术', '科学'],
  exploration: ['exploration', 'environmental', 'criminal', 'exploration', '探索', '环境', '探险'],
};

export function resolveCategory(raw?: string): CategoryKey {
  const probe = (raw ?? '').toLowerCase();
  for (const key of CATEGORY_KEYS) {
    if (CATEGORY_ALIASES[key].some((alias) => probe.includes(alias.toLowerCase()))) {
      return key;
    }
  }
  return 'political';
}

// ── Polity rendering ───────────────────────────────────────────────────────
/**
 * Zoom-aware caps. The old build truncated at a flat 800 features, which
 * silently dropped entire regions at every zoom level.
 */
export function polityCapForHeight(height: number): number {
  if (height > 12_000_000) return 600;
  if (height > 6_000_000) return 1100;
  if (height > 2_000_000) return 2000;
  return 3500;
}

/** Boundary lines float slightly above the ellipsoid so they are never
 *  occluded by the surface at grazing angles. */
export const BOUNDARY_ALTITUDE = 1500;

/**
 * Camera height above which the low-detail polity tier is fetched.
 *
 * Raised from 6 Mm. At 6 Mm a pixel spans roughly 20 km, the same order as the
 * LOD's own 0.15° error, so the coarsening was visible exactly where readers
 * spend their time. At 9 Mm the tier is only used at true globe scale, where
 * the difference is under a pixel.
 *
 * Worth being explicit: this is a download trade-off, not a picking one. Hover
 * latency comes from testing a single object per pointer move rather than
 * drill-picking the whole scene, so switching to the full tier costs bandwidth
 * and parse time, not responsiveness.
 */
export const POLITY_LOD_HEIGHT = 9_000_000;
