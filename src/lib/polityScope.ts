import { bboxOfFeature, type BBox } from '@/lib/compare';
import { zhPolityName } from '@/lib/names';
import type { PolityFeature } from '@/types';

/**
 * Filtering the lists by "the polity the reader clicked".
 *
 * Two obstacles shape this module. Polities carry no id, so name plus dates is
 * the identity. And nothing else in the dataset points at a polity — events and
 * wars have coordinates and free-text regions, people only have a nationality —
 * so a match is made from two weaker signals: the point falls inside the
 * polity's extent, and the item's dates intersect the polity's lifetime.
 */

const EN_SUFFIX =
  /\s+(?:dynasty|empire|kingdom|republic|caliphate|khanate|sultanate|principality|duchy|grand duchy|tsardom|confederation|federation|state|league|city-state|polity)s?$/i;
const ZH_SUFFIX =
  /(王朝|帝国|王国|共和国|苏丹国|汗国|公国|大公国|城邦|联邦|联盟|哈里发国|沙皇国|朝代|朝)$/;

/** "Qing dynasty" → "Qing", "罗马共和国" → "罗马". */
function coreOf(name: string): string {
  let core = name.trim();
  for (let i = 0; i < 3; i += 1) {
    const next = core.replace(EN_SUFFIX, '').replace(ZH_SUFFIX, '').trim();
    if (next === core) break;
    core = next;
  }
  return core;
}

export interface PolityScope {
  feature: PolityFeature;
  /** Polities have no id, so name + lifespan is what identifies one. */
  key: string;
  /** Localised name, for the chip that says what is being filtered. */
  label: string;
  from: number | null;
  to: number | null;
  box: BBox | null;
  /** Spellings to look for in free text (English, Chinese, and their cores). */
  needles: string[];
}

export function makePolityScope(
  feature: PolityFeature,
  zhNames?: Record<string, string>,
): PolityScope {
  const props = feature.properties ?? {};
  const raw = (props.Name ?? '').trim();
  const zh = (zhPolityName(raw, zhNames) ?? '').trim();
  const needles = [...new Set([raw, zh, coreOf(raw), coreOf(zh)].filter((n) => n.length >= 2))];

  return {
    feature,
    key: `${raw}:${props.FromYear ?? ''}-${props.ToYear ?? ''}`,
    label: zh || raw || '—',
    from: typeof props.FromYear === 'number' ? props.FromYear : null,
    to: typeof props.ToYear === 'number' ? props.ToYear : null,
    box: bboxOfFeature(feature),
    needles,
  };
}

/**
 * Where to pin a polity's name.
 *
 * The bounding-box centre is the obvious anchor and wrong often enough to
 * matter: on a crescent-shaped empire it lands in the sea or in the neighbour.
 * The centre is tried first, then a few points spread across the box, and the
 * polity is skipped when none of them falls inside the outline.
 */
export function labelAnchor(feature: PolityFeature): [number, number] | null {
  const box = bboxOfFeature(feature);
  if (!box) return null;

  const spanX = box.east - box.west;
  const spanY = box.north - box.south;
  const midX = (box.west + box.east) / 2;
  const midY = (box.south + box.north) / 2;
  const candidates: [number, number][] = [
    [midX, midY],
    [box.west + spanX * 0.3, midY],
    [box.west + spanX * 0.7, midY],
    [midX, box.south + spanY * 0.35],
    [midX, box.south + spanY * 0.65],
    [box.west + spanX * 0.35, box.south + spanY * 0.35],
  ];

  for (const [lon, lat] of candidates) {
    if (pointInPolity(feature, lon, lat)) return [lon, lat];
  }
  return null;
}

/**
 * Replace the dates with the polity's real lifespan.
 *
 * A tile in `polities_*.json` is cut per century, so its `FromYear`/`ToYear`
 * describe only the slice it belongs to: the 1911 tile of the Qing dynasty says
 * 1911–1911, not 1645–1911. Filtering on that would hide every earlier war and
 * person, so the caller widens the scope once `polity_descriptions.json` — which
 * carries the true span — has loaded.
 */
export function withLifespan(scope: PolityScope, from: number, to: number): PolityScope {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return scope;
  return { ...scope, from, to };
}

/** Does any of this free text name the polity? */
export function scopeMentions(
  scope: PolityScope,
  ...texts: (string | null | undefined)[]
): boolean {
  const hay = texts.filter(Boolean).join(' ').toLowerCase();
  if (!hay) return false;
  return scope.needles.some((needle) => hay.includes(needle.toLowerCase()));
}

type Ring = number[][];

/** Ray casting, the standard test for "is this point inside this outline". */
function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = Number(ring[i][0]);
    const yi = Number(ring[i][1]);
    const xj = Number(ring[j][0]);
    const yj = Number(ring[j][1]);
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
    if (!Number.isFinite(xj) || !Number.isFinite(yj)) continue;

    const crosses = yi > lat !== yj > lat;
    if (crosses && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon: number, lat: number, rings: Ring[]): boolean {
  if (!rings.length) return false;
  if (!pointInRing(lon, lat, rings[0])) return false;
  // Rings after the first are holes (lakes, enclaves).
  for (let i = 1; i < rings.length; i += 1) {
    if (pointInRing(lon, lat, rings[i])) return false;
  }
  return true;
}

/**
 * Real outline test, not the bounding box.
 *
 * The box was enough for the comparison board, which counts events per column
 * and can live with a few extra. Here the answer is shown as "these are the
 * people / wars of this polity", and the Qing dynasty's box contains northern
 * India: without the outline, the Mughal emperors were listed as Qing figures.
 */
export function pointInPolity(
  feature: PolityFeature,
  lon: number,
  lat: number,
): boolean | null {
  const geometry = feature.geometry as unknown as { type?: string; coordinates?: unknown };
  const coordinates = geometry?.coordinates as Ring[] | Ring[][] | undefined;
  if (!coordinates) return null;

  if (geometry?.type === 'Polygon') return pointInPolygon(lon, lat, coordinates as Ring[]);
  if (geometry?.type === 'MultiPolygon') {
    return (coordinates as Ring[][]).some((polygon) => pointInPolygon(lon, lat, polygon));
  }
  return null;
}

/**
 * Is the point inside the polity's extent?
 *
 * The box rejects almost everything cheaply; the outline decides the rest, and
 * the box is the fallback when the geometry is a shape this cannot read.
 */
export function scopeHasPoint(
  scope: PolityScope,
  lon: number | null,
  lat: number | null,
): boolean {
  if (lon === null || lat === null) return false;
  const box = scope.box;
  const inBox =
    box !== null &&
    lon >= box.west &&
    lon <= box.east &&
    lat >= box.south &&
    lat <= box.north;
  if (!inBox) return false;

  return pointInPolity(scope.feature, lon, lat) ?? true;
}

/**
 * Do the item's dates intersect the polity's?
 *
 * Items with no dates are kept: the spatial match already carries the meaning,
 * and dropping undated people would hide most of the roster.
 */
export function scopeOverlapsYears(
  scope: PolityScope,
  from: number | null,
  to: number | null,
): boolean {
  if (from === null && to === null) return true;
  if (scope.from === null && scope.to === null) return true;

  const start = from ?? (to as number);
  const end = to ?? (from as number);
  return end >= (scope.from ?? Number.NEGATIVE_INFINITY) && start <= (scope.to ?? Number.POSITIVE_INFINITY);
}
