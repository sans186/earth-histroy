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

/** How many years around the current slider position to load & display. */
export const YEAR_WINDOW = 20;

/** Available step sizes. */
export const STEP_SIZES = [1, 5, 10];
export const DEFAULT_STEP_SIZE = 5;

/** Milliseconds between playback ticks. */
export const PLAYBACK_INTERVAL_MS = 40;

// ── Data ──
/** Maximum number of year-JSON payloads kept in memory. */
export const DATA_CACHE_SIZE = 120;

/** Base path for year JSON files (relative to Vite public dir). */
export const DATA_BASE_URL = '/events/';

// ── Categories ──
/** All known categories from the dataset, mapped to display label + colour. */
export const CATEGORIES = {
  political:     { label: '政治', color: '#e74c3c', bg: '#c0392b' },
  military:      { label: '军事', color: '#3498db', bg: '#2980b9' },
  economic:      { label: '经济', color: '#2ecc71', bg: '#27ae60' },
  cultural:      { label: '文化', color: '#e67e22', bg: '#d35400' },
  exploration:   { label: '探索', color: '#00bcd4', bg: '#0097a7' },
  demographic:   { label: '重要人物事迹', color: '#e91e63', bg: '#c2185b' },
  social:        { label: '社会', color: '#ff9800', bg: '#f57c00' },
  technological: { label: '科技', color: '#9b59b6', bg: '#8e44ad' },
};

/** Categories that are active by default on first load. */
export const DEFAULT_ACTIVE_CATEGORIES = Object.keys(CATEGORIES);
