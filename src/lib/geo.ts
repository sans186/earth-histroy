/**
 * Coordinate parsing.
 *
 * The event dataset stores `coordinates_approx` as a free-form string in the
 * order "latitude, longitude" (e.g. "30.5, 114.3" = Wuhan). Some rows carry
 * compass suffixes, some are objects, some are absent entirely. Everything
 * funnels through `parseCoordinates` so the rest of the app never guesses.
 */

export interface LonLat {
  lon: number;
  lat: number;
}

const LAT_OK = (v: number) => v >= -90 && v <= 90;
const LON_OK = (v: number) => v >= -180 && v <= 180;

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v.replace(/[^\d.\-+]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fromObject(raw: Record<string, unknown>): LonLat | null {
  const lat = toNumber(raw.lat ?? raw.latitude ?? raw.Lat ?? raw.LAT);
  const lon = toNumber(raw.lon ?? raw.lng ?? raw.long ?? raw.longitude ?? raw.Lon ?? raw.LON);
  if (lat === null || lon === null) return null;
  if (!LAT_OK(lat) || !LON_OK(lon)) return null;
  return { lon, lat };
}

/**
 * Parse a coordinate string. Handles:
 *   "30.5, 114.3"      -> lat 30.5, lon 114.3   (dataset convention)
 *   "30.5N, 114.3E"    -> compass suffixes win
 *   "-33.9, 151.2"     -> southern/western values
 *   "151.2, -33.9"     -> heuristically detected as lon-first
 */
function fromString(raw: string): LonLat | null {
  const text = raw.trim();
  if (!text) return null;

  // Explicit compass suffixes take precedence: 30.5N / 114.3E / 30.5°S
  const withDir = text.match(/(\d+(?:\.\d+)?)\s*°?\s*([NSEWnsew])/g);
  if (withDir && withDir.length >= 2) {
    let lon: number | null = null;
    let lat: number | null = null;
    for (const token of withDir) {
      const m = token.match(/(\d+(?:\.\d+)?)\s*°?\s*([NSEWnsew])/);
      if (!m) continue;
      const value = Number.parseFloat(m[1]);
      const dir = m[2].toUpperCase();
      if (dir === 'N') lat = value;
      else if (dir === 'S') lat = -value;
      else if (dir === 'E') lon = value;
      else if (dir === 'W') lon = -value;
    }
    if (lat !== null && lon !== null && LAT_OK(lat) && LON_OK(lon)) {
      return { lon, lat };
    }
  }

  const nums = text.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;

  const a = Number.parseFloat(nums[0]);
  const b = Number.parseFloat(nums[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  // Unambiguous cases first.
  if (Math.abs(a) > 90 && LON_OK(a) && LAT_OK(b)) return { lon: a, lat: b };
  if (Math.abs(b) > 90 && LON_OK(b) && LAT_OK(a)) return { lon: b, lat: a };

  // Ambiguous: the dataset leads with latitude.
  if (LAT_OK(a) && LON_OK(b)) return { lon: b, lat: a };
  return null;
}

export function parseCoordinates(raw: unknown): LonLat | null {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) {
    const a = toNumber(raw[0]);
    const b = toNumber(raw[1]);
    if (a === null || b === null) return null;
    if (Math.abs(a) > 90 && LON_OK(a) && LAT_OK(b)) return { lon: a, lat: b };
    if (LAT_OK(a) && LON_OK(b)) return { lon: b, lat: a };
    return null;
  }
  if (typeof raw === 'object') return fromObject(raw as Record<string, unknown>);
  if (typeof raw === 'string') return fromString(raw);
  return null;
}

/** Bounding box of a ring set, used for cheap viewport culling. */
export function ringBBox(
  rings: number[][][],
): [number, number, number, number] | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const ring of rings) {
    for (const point of ring) {
      const lon = point[0];
      const lat = point[1];
      if (typeof lon !== 'number' || typeof lat !== 'number') continue;
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  }
  if (!Number.isFinite(w)) return null;
  return [w, s, e, n];
}

/** True when the bbox touches the rectangle, ignoring antimeridian subtleties. */
export function bboxIntersects(
  bbox: [number, number, number, number],
  rect: { west: number; south: number; east: number; north: number },
): boolean {
  const [w, s, e, n] = bbox;
  if (e < rect.west || w > rect.east) return false;
  if (n < rect.south || s > rect.north) return false;
  return true;
}
