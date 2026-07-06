/**
 * Small pure-utility functions used across modules.
 */

/**
 * Format a numeric year for display.
 *   -3000 → "3000 BC", 0 → "1 AD", 2025 → "2025 AD"
 */
export function formatYear(y) {
  if (y < 0) return `${Math.abs(y)} BC`;
  if (y === 0) return '1 AD';
  return `${y} AD`;
}

/**
 * Parse a coordinate string into [lat, lon].
 *
 * Handles all known formats in the dataset:
 *   "41.9, 12.5"               plain decimal
 *   "29.9°N, 31.1°E"           degree symbol + cardinal
 *   "40°N, 7°W"                cardinal for sign (7°W → lon = -7)
 *   "17.0°N, -89.5°W"          mix: explicit minus + cardinal
 *   "32.2°N, 48.3°E (Susa)"    trailing parens stripped
 *   "37.97, 23.73 (Athens)"    trailing parens stripped
 */
export function parseCoords(coordStr) {
  if (!coordStr || typeof coordStr !== 'string') return [0, 0];

  // Strip trailing parenthesised notes and take first location
  let cleaned = coordStr.replace(/\([^)]*\)/g, '').trim();

  // If there's a semicolon (multiple locations), take the first
  const semiIdx = cleaned.indexOf(';');
  if (semiIdx > -1) cleaned = cleaned.substring(0, semiIdx).trim();

  const parts = cleaned.split(',').map((s) => s.trim());
  if (parts.length < 2) return [0, 0];

  const latRaw = parts[0];
  const lonRaw = parts[1];

  // Extract numeric value and optional cardinal direction
  function parseComponent(raw, positiveDir, negativeDir) {
    const num = parseFloat(raw);
    if (isNaN(num)) return 0;
    const upper = raw.toUpperCase();
    if (upper.includes(negativeDir)) return -Math.abs(num);
    if (upper.includes(positiveDir)) return Math.abs(num);
    return num;
  }

  const lat = parseComponent(latRaw, 'N', 'S');
  const lon = parseComponent(lonRaw, 'E', 'W');

  return [lat, lon];
}

/**
 * Throttle a function – at most one call every `delay` ms.
 */
export function throttle(fn, delay) {
  let timer = null;
  let lastArgs = null;
  return function (...args) {
    lastArgs = args;
    if (timer) return;
    timer = setTimeout(() => {
      fn(...lastArgs);
      timer = null;
      lastArgs = null;
    }, delay);
  };
}

/**
 * Debounce a function – fires only after `delay` ms of inactivity.
 */

import { CATEGORIES, CATEGORY_MERGE_MAP } from './config.js';

/**
 * Map a raw data category (from JSON) to its display category key.
 * Handles exact match, merge-map lookup, composite ("A | B") split,
 * and trimmed variants.
 */
export function getDisplayCategory(rawCategory) {
  if (!rawCategory || typeof rawCategory !== 'string') return null;
  const cat = rawCategory.trim();
  if (!cat) return null;

  // Direct match with a display key
  if (CATEGORIES[cat]) return cat;

  // Look up in merge map
  for (const [displayCat, sources] of Object.entries(CATEGORY_MERGE_MAP)) {
    if (sources.includes(cat)) return displayCat;
  }

  // Composite categories e.g. "political | military" → take first part
  if (cat.includes(' | ')) {
    const first = cat.split(' | ')[0].trim();
    return getDisplayCategory(first);
  }

  // Fallback – won't match any active filter
  return cat;
}

/**
 * Check whether an event with the given data category should be visible
 * when the given set of display-category filters is active.
 */
export function isEventVisible(rawCategory, activeFilters) {
  if (!activeFilters || activeFilters.size === 0) return false;
  const displayCat = getDisplayCategory(rawCategory);
  return displayCat != null && activeFilters.has(displayCat);
}
export function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Reduce vertices in a closed ring using uniform stride sampling.
 * Preserves the closure (first === last). Input: array of [lon, lat] pairs.
 */
export function simplifyRing(ring, maxVerts) {
  if (ring.length <= maxVerts + 1) return ring;
  const closed = ring[0][0] === ring[ring.length - 1][0] &&
                 ring[0][1] === ring[ring.length - 1][1];
  const interior = closed ? ring.slice(0, -1) : ring;
  const step = interior.length / maxVerts;
  const result = [];
  for (let i = 0; i < interior.length; i += step) {
    result.push(interior[Math.floor(i)]);
  }
  if (closed && result.length > 0) result.push(result[0].slice());
  return result;
}

/**
 * Recursively simplify coordinate arrays for Polygon/MultiPolygon.
 */
export function simplifyCoords(coords, maxVerts) {
  if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
    return simplifyRing(coords, maxVerts);
  }
  return coords.map((c) => simplifyCoords(c, maxVerts));
}
