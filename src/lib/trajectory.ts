/**
 * Trajectory geometry for the person footprint overlay.
 *
 * Pure functions only: projection, lane packing, tick spacing and basemap path
 * building. The view layer owns zoom, hover state and typography.
 */

import type { PersonPoint } from '@/types';

/** Equirectangular world canvas. Two units per degree of longitude. */
export const MAP_W = 2000;
export const MAP_H = 1000;

export function projectX(lon: number): number {
  return ((lon + 180) * MAP_W) / 360;
}

export function projectY(lat: number): number {
  return ((90 - lat) * MAP_H) / 180;
}

/** A point with coordinates, ordered and ready to draw. */
export interface PlottedPoint {
  /** Index in the original `points` array — stable key for the template. */
  index: number;
  point: PersonPoint;
  x: number;
  y: number;
  year: number;
  yearEnd: number;
  /** Dot radius in world units, larger for a longer stay. */
  radius: number;
  stage: LifeStage;
}

export type LifeStage = 'single' | 'early' | 'middle' | 'late';

/**
 * Life stages are inferred, not shipped.
 *
 * The dataset has no stage field, and keyword guessing over 2,186 free-text
 * titles would mislabel more than it fixed. Thirds of each person's *recorded*
 * life are deterministic and honest: they mean "first third of the life we can
 * document", which is exactly what the bands are labelled as.
 */
export function stageOf(year: number, first: number, last: number): LifeStage {
  const span = last - first;
  if (span <= 12) return 'single';
  const t = (year - first) / span;
  if (t < 1 / 3) return 'early';
  if (t < 2 / 3) return 'middle';
  return 'late';
}

/** Chronological span covered by a person's points, ignoring gaps. */
export function recordedSpan(points: PersonPoint[]): [number, number] {
  let first = Infinity;
  let last = -Infinity;
  for (const point of points) {
    const start = point.year;
    const end = point.yearEnd === null || point.yearEnd === undefined ? point.year : point.yearEnd;
    if (start < first) first = start;
    if (end > last) last = end;
  }
  if (!Number.isFinite(first) || !Number.isFinite(last)) return [0, 0];
  return [first, last];
}

/** Points that carry coordinates, sorted by year. */
export function plottedPoints(points: PersonPoint[]): PlottedPoint[] {
  const [first, last] = recordedSpan(points);
  const mapped: { index: number; point: PersonPoint; year: number; yearEnd: number }[] = [];
  points.forEach((point, index) => {
    if (!point.coords) return;
    const [lon, lat] = point.coords;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    const yearEnd = point.yearEnd === null || point.yearEnd === undefined ? point.year : point.yearEnd;
    mapped.push({ index, point, year: point.year, yearEnd });
  });
  mapped.sort((a, b) => a.year - b.year || a.index - b.index);
  return mapped.map((row) => {
    const [lon, lat] = row.point.coords as [number, number];
    return {
      index: row.index,
      point: row.point,
      x: projectX(lon),
      y: projectY(lat),
      year: row.year,
      yearEnd: row.yearEnd,
      radius: 6.5 + Math.min(7, Math.max(0, row.yearEnd - row.year) / 6),
      stage: stageOf(row.year, first, last),
    };
  });
}

/* ── Lifeline lanes ─────────────────────────────────────────────────────── */

export interface LaneStop {
  /** Index in the original `points` array. */
  index: number;
  point: PersonPoint;
  year: number;
  yearEnd: number;
}

export interface Lane {
  key: string;
  label: string;
  labelEn: string;
  stops: LaneStop[];
}

/**
 * One lane per distinct place, in first-visit order.
 *
 * Revisited places return to their own lane rather than spawning a duplicate,
 * so the step line reads as a commute instead of a list.
 */
export function buildLanes(points: PersonPoint[]): Lane[] {
  const lanes: Lane[] = [];
  const byKey = new Map<string, Lane>();
  points.forEach((point, index) => {
    const label = (point.place || '').trim();
    const labelEn = (point.placeEn || '').trim();
    const key = label || labelEn || '_unknown';
    let lane = byKey.get(key);
    if (!lane) {
      lane = { key, label: label || labelEn || '', labelEn: labelEn || label, stops: [] };
      byKey.set(key, lane);
      lanes.push(lane);
    }
    const yearEnd = point.yearEnd === null || point.yearEnd === undefined ? point.year : point.yearEnd;
    lane.stops.push({ index, point, year: point.year, yearEnd });
  });
  for (const lane of lanes) lane.stops.sort((a, b) => a.year - b.year || a.index - b.index);
  return lanes;
}

/* ── Scales ─────────────────────────────────────────────────────────────── */

/** 1 / 2 / 5 × 10ⁿ, the smallest step that keeps the tick count near target. */
export function niceStep(span: number, target: number): number {
  if (!Number.isFinite(span) || span <= 0 || target <= 0) return 1;
  const raw = span / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const mult of [1, 2, 2.5, 5, 10]) {
    if (mult * power >= raw) return mult * power;
  }
  return 10 * power;
}

/** Tick values inside [from, to]; both ends stay inside the domain. */
export function ticksBetween(from: number, to: number, target: number): number[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [from];
  const step = niceStep(to - from, target);
  const out: number[] = [];
  const start = Math.ceil(from / step) * step;
  for (let v = start; v <= to + step * 0.001; v += step) out.push(Math.round(v));
  return out;
}

/** One decimal of a world unit — invisible at full zoom, half the file size. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/* ── Basemap ────────────────────────────────────────────────────────────── */

interface GeoGeometry {
  type?: string;
  coordinates?: unknown;
}

interface GeoFeature {
  geometry?: GeoGeometry | null;
}

function ringPath(raw: unknown): string {
  if (!Array.isArray(raw)) return '';
  let started = false;
  let d = '';
  for (const item of raw) {
    if (!Array.isArray(item)) continue;
    const lon = Number(item[0]);
    const lat = Number(item[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const x = round1(projectX(lon));
    const y = round1(projectY(lat));
    d += `${started ? 'L' : 'M'}${x} ${y}`;
    started = true;
  }
  return started ? `${d}Z` : '';
}

function polygonPath(raw: unknown): string {
  if (!Array.isArray(raw)) return '';
  let d = '';
  for (const ring of raw) d += ringPath(ring);
  return d;
}

/**
 * Merge a Natural Earth countries file into one path string.
 *
 * One combined path keeps the DOM tiny and lets the whole landmass share a
 * hairline stroke, which is what the printed-atlas look needs.
 */
export function countriesToPath(raw: unknown): string {
  const collection = raw as { features?: unknown } | null;
  if (!collection || !Array.isArray(collection.features)) return '';
  let d = '';
  for (const feature of collection.features as GeoFeature[]) {
    const geometry = feature?.geometry;
    if (!geometry) continue;
    if (geometry.type === 'Polygon') d += polygonPath(geometry.coordinates);
    else if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
      for (const poly of geometry.coordinates) d += polygonPath(poly);
    }
  }
  return d;
}

/* ── Main-map trail ─────────────────────────────────────────────────────── */

/**
 * Colours for the map renderers, in hex.
 *
 * MapLibre and Cesium paint in canvas/WebGL, where `var(--rust)` means nothing,
 * so the palette is repeated here. Keep these in step with the stylesheet.
 */
export const TRAIL_PERSON_COLORS = ['#b0522d', '#26406b', '#3f6a78'] as const;

export const TRAIL_STAGE_COLORS: Record<LifeStage, string> = {
  single: '#b0522d',
  early: '#7d8a6a',
  middle: '#9a7434',
  late: '#b0522d',
};

/** One leg of the route, cut at the time cursor when the life continues. */
export interface TrailSegment {
  personId: string;
  color: string;
  coords: [[number, number], [number, number]];
  /** True when the leg ends at the cursor rather than at a recorded station. */
  partial: boolean;
}

/** One recorded station that is visible at the time cursor. */
export interface TrailNode {
  personId: string;
  personIndex: number;
  /** Name, so a stop on a shared route still says whose life it belongs to. */
  personName: string;
  personNameEn: string;
  /** Index in the profile's `points` array — stable for hover and selection. */
  index: number;
  lon: number;
  lat: number;
  year: number;
  yearEnd: number;
  place: string;
  placeEn: string;
  title: string;
  titleEn: string;
  /** Screen pixels. Longer stays read larger. */
  radius: number;
  color: string;
  /** The last station at or before the cursor. */
  current: boolean;
}

/** Where the person was at the cursor, between two stations. */
export interface TrailHead {
  personId: string;
  lon: number;
  lat: number;
  color: string;
}

export interface TrailPersonInput {
  personId: string;
  points: PersonPoint[];
  name?: string;
  nameEn?: string;
}

export interface TrailScene {
  people: Array<{ personId: string; color: string }>;
  segments: TrailSegment[];
  nodes: TrailNode[];
  heads: TrailHead[];
  /** Bounds of every recorded station, independent of the cursor. */
  bounds: [[number, number], [number, number]] | null;
  /** How many recorded stations the cursor hides. */
  hidden: number;
}

const RAMP_FROM = [63, 106, 120] as const;
const RAMP_TO = [154, 116, 52] as const;

/** Teal at the start of a life, warm gold at the end. */
export function rampColor(t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const parts = RAMP_FROM.map((from, i) => Math.round(from + (RAMP_TO[i] - from) * k));
  return `#${parts.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function lerp(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Position at the cursor: the last station, or a point along the next leg. */
function headAt(
  points: PlottedPoint[],
  year: number,
): [number, number] | null {
  if (!points.length || year < points[0].year) return null;
  const last = points[points.length - 1];
  if (year >= last.year) {
    const c = last.point.coords;
    return c ? [c[0], c[1]] : null;
  }
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    const a = prev.point.coords;
    const b = next.point.coords;
    if (!a || !b) continue;
    if (year <= next.year) {
      const span = next.year - prev.year || 1;
      return lerp([a[0], a[1]], [b[0], b[1]], (year - prev.year) / span);
    }
  }
  return null;
}

/**
 * Turn one or more lives into everything the main map needs to draw.
 *
 * The cursor is a year, not an index: a leg that started before the cursor but
 * ends after it is drawn halfway, which is what makes dragging the shared
 * timeline read as movement rather than as dots switching on and off.
 */
export function buildTrailScene(people: TrailPersonInput[], year: number): TrailScene {
  const single = people.length === 1;
  const segments: TrailSegment[] = [];
  const nodes: TrailNode[] = [];
  const heads: TrailHead[] = [];
  let hidden = 0;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  people.forEach((person, personIndex) => {
    const plotted = plottedPoints(person.points);
    if (!plotted.length) return;
    const color = single ? null : TRAIL_PERSON_COLORS[personIndex % TRAIL_PERSON_COLORS.length];

    for (const row of plotted) {
      const c = row.point.coords;
      if (!c) continue;
      west = Math.min(west, c[0]);
      east = Math.max(east, c[0]);
      south = Math.min(south, c[1]);
      north = Math.max(north, c[1]);
    }

    const visible = plotted.filter((row) => row.year <= year);
    hidden += plotted.length - visible.length;

    const firstYear = plotted[0].year;
    const lastYear = plotted[plotted.length - 1].year;
    const life = lastYear - firstYear || 1;

    visible.forEach((row, i) => {
      const c = row.point.coords;
      if (!c) return;
      nodes.push({
        personId: person.personId,
        personIndex,
        personName: person.name ?? '',
        personNameEn: person.nameEn ?? '',
        index: row.index,
        lon: c[0],
        lat: c[1],
        year: row.year,
        yearEnd: row.yearEnd,
        place: row.point.place,
        placeEn: row.point.placeEn,
        title: row.point.title,
        titleEn: row.point.titleEn,
        radius: Math.min(13, Math.max(5, row.radius)),
        color: color ?? TRAIL_STAGE_COLORS[row.stage],
        current: i === visible.length - 1,
      });
    });

    for (let i = 1; i < plotted.length; i += 1) {
      const prev = plotted[i - 1];
      const next = plotted[i];
      const a = prev.point.coords;
      const b = next.point.coords;
      if (!a || !b) continue;
      if (prev.year > year) break;

      const legColor = color ?? rampColor((prev.year - firstYear) / life);
      if (next.year <= year) {
        segments.push({
          personId: person.personId,
          color: legColor,
          coords: [
            [a[0], a[1]],
            [b[0], b[1]],
          ],
          partial: false,
        });
        continue;
      }

      const span = next.year - prev.year || 1;
      const t = Math.min(1, Math.max(0, (year - prev.year) / span));
      if (t <= 0) break;
      segments.push({
        personId: person.personId,
        color: legColor,
        coords: [
          [a[0], a[1]],
          lerp([a[0], a[1]], [b[0], b[1]], t),
        ],
        partial: true,
      });
      break;
    }

    const head = headAt(plotted, year);
    if (head) {
      heads.push({
        personId: person.personId,
        lon: head[0],
        lat: head[1],
        color: color ?? rampColor(1),
      });
    }
  });

  return {
    people: people.map((person, index) => ({
      personId: person.personId,
      color: single
        ? TRAIL_STAGE_COLORS.single
        : TRAIL_PERSON_COLORS[index % TRAIL_PERSON_COLORS.length],
    })),
    segments,
    nodes,
    heads,
    bounds: Number.isFinite(west)
      ? [
          [west, south],
          [east, north],
        ]
      : null,
    hidden,
  };
}
