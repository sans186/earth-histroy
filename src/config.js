/**
 * Application-wide constants.
 * All hard-coded configuration lives here so downstream modules stay clean.
 */

// ── Cesium ──
export const CESIUM_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1YzRiYzZmOS1jMDliLTRjZTQtOTc5YS05NGQ2Nzk5MGI0ZDAiLCJpZCI6NDUwMjE4LCJzdWIiOiLml6DmlYzlpKfluJ1zYW5zIiwiaXNzIjoiaHR0cHM6Ly9hcGkuY2VzaXVtLmNvbSIsImF1ZCI6Im1haW4iLCJpYXQiOjE3ODI3MTI0MDl9.dBzxCgGCKLAN-fsJWQZ5tnwsXeTQPlISWq3LeMnWWB0';

/** Initial camera: centered over China at a high altitude. */
export const INITIAL_VIEW = {
  lon: 105,
  lat: 32,
  height: 12000000, // meters above ellipsoid
};

// ── Timeline ──
export const YEAR_MIN = -3100;
export const YEAR_MAX = 2025;
/** Initial year on page load. */
export const DEFAULT_YEAR = YEAR_MAX;

// ── Non-linear timeline mapping ──
/**
 * Piecewise-linear segments that map slider position to real years.
 * Each segment: [yearStart, yearEnd, sliderStart, sliderEnd]
 *
 * The slider spans 0–10000. Ancient years are compressed into a small
 * portion of the track (sparse data), while modern years are stretched
 * across a larger portion (dense data), giving fine-grained control
 * where it matters most.
 *
 * Segment        Years   Slider units   yrs / slider-unit
 *   Ancient      2600      1000  (10%)     2.60
 *   Classical    1000      1500  (15%)     0.67
 *   Medieval     1000      2000  (20%)     0.50
 *   EarlyModern   300      1500  (15%)     0.20
 *   Modern        150      2000  (20%)     0.075
 *   Contemporary   75      2000  (20%)     0.0375
 */
const TIMELINE_SEGMENTS = [
  [-3100, -500,     0,  1000],
  [ -500,  500,  1000,  2500],
  [  500, 1500,  2500,  4500],
  [ 1500, 1800,  4500,  6000],
  [ 1800, 1950,  6000,  8000],
  [ 1950, 2025,  8000, 10000],
];

export const SLIDER_MIN = 0;
export const SLIDER_MAX = 10000;

/** Map a slider position (0–10000) to a real year via piecewise interpolation. */
export function sliderToYear(sliderValue) {
  if (sliderValue <= SLIDER_MIN) return YEAR_MIN;
  if (sliderValue >= SLIDER_MAX) return YEAR_MAX;
  for (const [ys, ye, ss, se] of TIMELINE_SEGMENTS) {
    if (sliderValue >= ss && sliderValue <= se) {
      const t = (sliderValue - ss) / (se - ss);
      return Math.round(ys + t * (ye - ys));
    }
  }
  return YEAR_MAX;
}

/** Map a real year to a slider position (0–10000) via piecewise interpolation. */
export function yearToSlider(year) {
  if (year <= YEAR_MIN) return SLIDER_MIN;
  if (year >= YEAR_MAX) return SLIDER_MAX;
  for (const [ys, ye, ss, se] of TIMELINE_SEGMENTS) {
    if (year >= ys && year <= ye) {
      const t = (year - ys) / (ye - ys);
      return Math.round(ss + t * (se - ss));
    }
  }
  return SLIDER_MAX;
}

/** How many years around the current slider position to load & display. */
export const YEAR_WINDOW = 20;

/** Available step sizes. */
export const STEP_SIZES = [1, 5, 10];
export const DEFAULT_STEP_SIZE = 5;

/** Milliseconds between playback ticks. */
export const PLAYBACK_INTERVAL_MS = 40;

/**
 * Historical eras dividing the full timeline.
 * Each era has a name, year range (inclusive start, exclusive end), and a theme color.
 * Earlier eras span more years (sparser data), later eras are finer-grained.
 */
export const ERAS = [
  { id: 'bronze',      name: '青铜时代', nameEn: 'Bronze Age',      start: -3100, end: -1046, color: '#B8860B' },
  { id: 'iron',        name: '铁器时代', nameEn: 'Iron Age',        start: -1046, end: -221,  color: '#6B7B8D' },
  { id: 'classical',   name: '古典时代', nameEn: 'Classical',       start: -221,  end: 581,   color: '#4A7C59' },
  { id: 'medieval',    name: '中古时代', nameEn: 'Medieval',        start: 581,   end: 1368,  color: '#8B4513' },
  { id: 'earlyModern', name: '近世',     nameEn: 'Early Modern',    start: 1368,  end: 1840,  color: '#4A6FA5' },
  { id: 'modern',      name: '近代',     nameEn: 'Modern',          start: 1840,  end: 1912,  color: '#7B4A6B' },
  { id: 'republican',  name: '民国时期', nameEn: 'Republican Era',  start: 1912,  end: 1949,  color: '#9B59B6' },
  { id: 'contemporary',name: '当代',     nameEn: 'Contemporary',    start: 1949,  end: 2026,  color: '#C0392B' },
];

/** Get the era for a given year. */
export function getEra(year) {
  return ERAS.find((e) => year >= e.start && year < e.end) ?? ERAS[ERAS.length - 1];
}

// ── Data ──
/** Maximum number of year-JSON payloads kept in memory. */
export const DATA_CACHE_SIZE = 120;

/** Base path for year JSON files (relative to Vite public dir). */
export const DATA_BASE_URL_ZH = '/events/';
export const DATA_BASE_URL_EN = '/英文event/';

// ── Categories ──
/**
 * Display categories shown in the filter bar.
 * Each groups one or more raw data categories (see CATEGORY_MERGE_MAP).
 */
export const CATEGORIES = {
  political:     { label: '政治', labelEn: 'Political',   color: '#e74c3c', bg: '#c0392b' },
  military:      { label: '军事', labelEn: 'Military',    color: '#3498db', bg: '#2980b9' },
  economic:      { label: '经济', labelEn: 'Economic',    color: '#2ecc71', bg: '#27ae60' },
  cultural:      { label: '文化', labelEn: 'Cultural',    color: '#e67e22', bg: '#d35400' },
  technological: { label: '科技', labelEn: 'Technology',  color: '#9b59b6', bg: '#8e44ad' },
  exploration:   { label: '探索', labelEn: 'Exploration', color: '#00bcd4', bg: '#0097a7' },
};

/**
 * Maps raw data categories (from JSON event files) to display category keys above.
 * An event is shown when its data category maps to an active display category.
 */
export const CATEGORY_MERGE_MAP = {
  political:     ['political', 'legal', 'demographic', 'social', '政治', 'administrative', 'diplomatic'],
  military:      ['military', '军事'],
  economic:      ['economic', '经济'],
  cultural:      ['cultural', 'religious', '文化', 'archaeological', 'migration'],
  technological: ['technological', 'scientific'],
  exploration:   ['exploration', 'environmental', '环境', 'criminal'],
};

/** Categories that are active by default on first load. */
export const DEFAULT_ACTIVE_CATEGORIES = Object.keys(CATEGORIES);
