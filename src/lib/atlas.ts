import type { PolityFeature, WarProfile } from '@/types';
import { parseCoordinates, type LonLat } from '@/lib/geo';
import { battleYear } from '@/services/war-data';

/**
 * Geometry helpers for the plate view.
 *
 * The plate puts two regions side by side at one scale. That rules out a
 * per-panel "fit to box": each region is projected with the same pixels per
 * degree, so a 1,000 km bar is the same length on both. Longitude is multiplied
 * by the cosine of the region's mid-latitude, otherwise the east–west axis is
 * stretched by 1/cos(lat) and the two panels are only nominally co-scaled.
 */

export interface AtlasRect {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface AtlasProjection {
  /** Pixels per degree of latitude. Identical across every panel on the plate. */
  k: number;
  cos: number;
  x: (lon: number) => number;
  y: (lat: number) => number;
  /** Pixels spanned by `km` kilometres at this scale. */
  km: (km: number) => number;
}

/** Kilometres in one degree of latitude; close enough at any latitude. */
const KM_PER_DEG = 111.32;

function midCos(rect: AtlasRect): number {
  const midLat = (rect.south + rect.north) / 2;
  return Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
}

/**
 * One pixels-per-degree value that fits every region inside the frame.
 *
 * The smallest region therefore leaves more paper around it — that is the
 * visible, honest cost of a shared scale, and the plate says so in its dateline.
 */
export function fitScale(rect: AtlasRect, width: number, height: number, pad: number): number {
  const innerW = Math.max(40, width - pad * 2);
  const innerH = Math.max(40, height - pad * 2);
  const sx = Math.max(1e-4, (rect.east - rect.west) * midCos(rect));
  const sy = Math.max(1e-4, rect.north - rect.south);
  return Math.min(innerW / sx, innerH / sy);
}

export function sharedScale(
  rects: AtlasRect[],
  width: number,
  height: number,
  pad: number,
): number {
  const innerH = Math.max(40, height - pad * 2);
  let k = Infinity;
  for (const rect of rects) k = Math.min(k, fitScale(rect, width, height, pad));
  return Number.isFinite(k) ? k : innerH / 30;
}

/** Smallest box containing every input box. Used by the shared-window framing. */
export function unionRect(rects: AtlasRect[]): AtlasRect {
  return {
    west: Math.min(...rects.map((r) => r.west)),
    south: Math.min(...rects.map((r) => r.south)),
    east: Math.max(...rects.map((r) => r.east)),
    north: Math.max(...rects.map((r) => r.north)),
  };
}

export function lerpRect(a: AtlasRect, b: AtlasRect, t: number): AtlasRect {
  const at = (x: number, y: number) => x + (y - x) * t;
  return {
    west: at(a.west, b.west),
    south: at(a.south, b.south),
    east: at(a.east, b.east),
    north: at(a.north, b.north),
  };
}

/**
 * SVG matrix that carries points projected under one framing onto another.
 *
 * Both framings share the same projection family (`makeProjection`), so the
 * change is affine: a scale plus a translation. Animating this matrix lets the
 * geometry that is already cached stay untouched for the whole transition — only
 * the wrapper `<g>` moves — and the real paths are rebuilt once at the end.
 */
export function rectMatrix(
  from: AtlasRect,
  kFrom: number,
  to: AtlasRect,
  kTo: number,
  width: number,
  height: number,
): string {
  const cosFrom = midCos(from);
  const cosTo = midCos(to);
  const sx = (cosTo * kTo) / (cosFrom * kFrom);
  const sy = kTo / kFrom;
  const cxFrom = (from.west + from.east) / 2;
  const cyFrom = (from.south + from.north) / 2;
  const cxTo = (to.west + to.east) / 2;
  const cyTo = (to.south + to.north) / 2;
  const tx = (width / 2) * (1 - sx) + (cxFrom - cxTo) * cosTo * kTo;
  const ty = (height / 2) * (1 - sy) + (cyTo - cyFrom) * kTo;
  return `matrix(${sx.toFixed(5)} 0 0 ${sy.toFixed(5)} ${tx.toFixed(2)} ${ty.toFixed(2)})`;
}

export function makeProjection(
  rect: AtlasRect,
  k: number,
  width: number,
  height: number,
): AtlasProjection {
  const cx = (rect.west + rect.east) / 2;
  const cy = (rect.south + rect.north) / 2;
  const cos = midCos(rect);
  return {
    k,
    cos,
    x: (lon) => width / 2 + (lon - cx) * cos * k,
    y: (lat) => height / 2 - (lat - cy) * k,
    km: (km) => (km * k) / KM_PER_DEG,
  };
}

/** SVG path for one feature. Exterior rings only; holes are not drawn. */
export function featurePath(feature: PolityFeature, proj: AtlasProjection): string {
  const polys: number[][][][] =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates as number[][][]]
      : (feature.geometry.coordinates as number[][][][]);

  let d = '';
  for (const poly of polys) {
    const ring = poly[0];
    if (!ring || ring.length < 4) continue;
    let lx = Number.NaN;
    let ly = Number.NaN;
    let started = false;
    for (const point of ring) {
      const lon = point[0];
      const lat = point[1];
      if (typeof lon !== 'number' || typeof lat !== 'number') continue;
      const x = proj.x(lon);
      const y = proj.y(lat);
      // Sub-pixel steps add nothing at this size and bloat the DOM string.
      if (started && Math.abs(x - lx) < 0.45 && Math.abs(y - ly) < 0.45) continue;
      d += `${started ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      lx = x;
      ly = y;
      started = true;
    }
    if (started) d += 'Z';
  }
  return d;
}

/** Convex hull of a battle set, as a path. The "extent" is derived, not drawn. */
export function hullPath(points: LonLat[], proj: AtlasProjection): string {
  if (points.length < 3) return '';
  const pts = points
    .map((p) => [proj.x(p.lon), proj.y(p.lat)] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const hull = [...lower, ...upper];
  if (hull.length < 3) return '';
  return `M${hull.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}Z`;
}

export interface AtlasBattle {
  lon: number;
  lat: number;
  year: number;
  warId: string;
  name: string;
  nameEn: string;
}

/**
 * Battle coordinates, read as `[longitude, latitude]`.
 *
 * The war archive stores `coords` as a two-number array in lon/lat order —
 * `[4.9, 50.3]` is 4.9°E / 50.3°N (the Battle of the Frontiers) — while the
 * event dataset writes strings in lat/lon order. `parseCoordinates` resolves the
 * ambiguity by preferring lat/lon, which put every European battle in the
 * Indian Ocean, so war rows get their own reader: arrays are always lon first,
 * and anything out of range is dropped rather than guessed at. String and
 * object forms keep the shared parser.
 */
function battleCoords(raw: unknown): LonLat | null {
  if (Array.isArray(raw)) {
    const lon = Number(raw[0]);
    const lat = Number(raw[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
    return { lon, lat };
  }
  return parseCoordinates(raw);
}

/**
 * Battles recorded inside a year window.
 *
 * These are archive positions, not a front line: a battle only appears if the
 * profile lists it and carries coordinates. The plate repeats that caveat rather
 * than letting a filled polygon imply a measured area of destruction.
 */
export function battlesInWindow(
  profile: WarProfile | null,
  from: number,
  to: number,
): AtlasBattle[] {
  if (!profile) return [];
  const out: AtlasBattle[] = [];
  for (const phase of profile.warProcess?.phases ?? []) {
    for (const battle of phase.battles ?? []) {
      const year = battleYear(battle);
      if (year === null || year < from || year > to) continue;
      const at = battleCoords(battle.coords);
      if (!at) continue;
      out.push({
        lon: at.lon,
        lat: at.lat,
        year,
        warId: profile.warId,
        name: profile.name,
        nameEn: profile.nameEn ?? profile.name,
      });
    }
  }
  return out;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
