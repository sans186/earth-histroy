<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CATEGORIES, YEAR_MAX, YEAR_MIN, type CategoryKey } from '@/config';
import {
  battlesInWindow,
  featurePath,
  fitScale,
  hullPath,
  lerpRect,
  makeProjection,
  median,
  rectMatrix,
  unionRect,
  type AtlasBattle,
  type AtlasProjection,
  type AtlasRect,
} from '@/lib/atlas';
import { bboxIntersects } from '@/lib/geo';
import { dedupeRestatements } from '@/lib/compare';
import { formatArea, formatYearCompact, formatYearRange } from '@/lib/format';
import { zhPolityName } from '@/lib/names';
import { pointInPolity } from '@/lib/polityScope';
import { REGIONS, findRegion, regionLabel, type Region } from '@/lib/regions';
import { loadEventWindow, loadPolityFile, loadPolityIndex } from '@/services/data';
import { prepareFeature } from '@/services/globe';
import { loadWarIndex, loadWarProfile } from '@/services/war-data';
import { useLayersStore } from '@/stores/layers';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';
import type { PolityFeature, PreparedPolity, TimelineEvent } from '@/types';

/**
 * The plate: two regions drawn at one scale.
 *
 * The old comparison compared one thing (outlines) at two scales running side
 * by side, which made every difference ambiguous. Here the scale is fixed
 * across both panels and the layers change what is being read — territory,
 * political units, recorded battles, or this decade's entries. Nothing is
 * pre-baked: every layer reads the same files the globe reads.
 */

type LayerKey = 'all' | 'territory' | 'units' | 'war' | 'records';

const props = defineProps<{
  /** English → Chinese polity names, so labels follow the interface language. */
  names?: Record<string, string>;
}>();

const emit = defineEmits<{
  'pick-polity': [PolityFeature];
  'pick-war': [string];
  'pick-event': [TimelineEvent];
}>();

const ui = useUiStore();
const timeline = useTimelineStore();
const layers = useLayersStore();

/* ── plate frame ───────────────────────────────────────────────────────── */

const VIEW_W = 520;
const VIEW_H = 404;
const PAD = 26;
/** Framing swap duration; the prototype used 520 ms and it reads as a "zoom out". */
const FRAME_MS = 520;

const LAYERS = [
  { id: 'all', key: 'atlas.layer.all', hint: 'atlas.layer.all.hint' },
  { id: 'territory', key: 'atlas.layer.territory', hint: 'atlas.layer.territory.hint' },
  { id: 'units', key: 'atlas.layer.units', hint: 'atlas.layer.units.hint' },
  { id: 'war', key: 'atlas.layer.war', hint: 'atlas.layer.war.hint' },
  { id: 'records', key: 'atlas.layer.records', hint: 'atlas.layer.records.hint' },
] as const;

const layer = ref<LayerKey>('all');
const regionA = ref('eastAsia');
const regionB = ref('europe');

/**
 * Framing convention, taken from the scale prototype (its "C" variant):
 *
 *   B — one pixels-per-degree for both panels, each panel framed on its own
 *       region. Comparing the two outlines answers "which is larger".
 *   A — both panels lock to the same centre and zoom (the union window).
 *       Answers "where is one relative to the other", at the cost of detail.
 *
 * B is the default; switching is animated rather than a jump cut.
 */
const scaleMode = ref<'A' | 'B'>('B');

const regions = computed(() => [
  findRegion(regionA.value) ?? REGIONS[0],
  findRegion(regionB.value) ?? REGIONS[1],
]);

const regionOptions = computed(() =>
  REGIONS.map((r) => ({ id: r.id, label: regionLabel(r, ui.locale) })),
);

interface Frame {
  /** Pixels per degree of latitude, shared by both panels. */
  k: number;
  windows: [AtlasRect, AtlasRect];
}

function frameFor(mode: 'A' | 'B'): Frame {
  let windows: [AtlasRect, AtlasRect];
  if (mode === 'A') {
    const union = unionRect(regions.value.map((r) => r.bbox));
    windows = [union, union];
  } else {
    windows = [regions.value[0].bbox, regions.value[1].bbox];
  }
  const k = Math.min(...windows.map((w) => fitScale(w, VIEW_W, VIEW_H, PAD)));
  return { k, windows };
}

const frame = ref<Frame>(frameFor('B'));
const anim = ref<{ from: Frame; to: Frame; t: number } | null>(null);
let raf = 0;

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function lerpFrame(from: Frame, to: Frame, t: number): Frame {
  return {
    k: from.k + (to.k - from.k) * t,
    windows: [
      lerpRect(from.windows[0], to.windows[0], t),
      lerpRect(from.windows[1], to.windows[1], t),
    ],
  };
}

function settle(next: Frame) {
  frame.value = next;
  pathCaches[0].clear();
  pathCaches[1].clear();
  // Anchors choose the largest piece inside the *current* window, so a new
  // framing can pick a different one.
  anchorCaches[0].clear();
  anchorCaches[1].clear();
}

/** Whatever is on screen right now — the animation's midpoint if one is running. */
function shownFrame(): Frame {
  const a = anim.value;
  return a ? lerpFrame(a.from, a.to, easeInOutCubic(a.t)) : frame.value;
}

function stopAnim() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  anim.value = null;
}

function setScaleMode(mode: 'A' | 'B') {
  if (mode === scaleMode.value) return;
  scaleMode.value = mode;
  stopAnim();
  // Freeze the current framing, then animate away from it; the matrix starts at
  // identity, so there is no visible jump even when interrupting a swap.
  const from = shownFrame();
  settle(from);
  const to = frameFor(mode);
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / FRAME_MS);
    if (t < 1) {
      anim.value = { from, to, t };
      raf = requestAnimationFrame(step);
    } else {
      stopAnim();
      settle(to);
    }
  };
  anim.value = { from, to, t: 0 };
  raf = requestAnimationFrame(step);
}

const projections = computed(() =>
  frame.value.windows.map((w) => makeProjection(w, frame.value.k, VIEW_W, VIEW_H)),
);

/**
 * Per-panel matrix for the in-flight framing change. The geometry stays cached
 * in the old framing; only the wrapper group is transformed, and the paths are
 * rebuilt once when the animation lands.
 */
const animMatrices = computed(() => {
  const a = anim.value;
  if (!a) return ['', ''];
  const e = easeInOutCubic(a.t);
  const k = a.from.k + (a.to.k - a.from.k) * e;
  return [0, 1].map((i) =>
    rectMatrix(
      a.from.windows[i],
      a.from.k,
      lerpRect(a.from.windows[i], a.to.windows[i], e),
      k,
      VIEW_W,
      VIEW_H,
    ),
  );
});

const decade = computed(() => Math.floor(timeline.year / 10) * 10);
const decadeEnd = computed(() => decade.value + 9);

/* ── polity slices ─────────────────────────────────────────────────────── */

const prepared = ref<PreparedPolity[]>([]);
const polityLoading = ref(false);
const polityKey = ref('');
let polityPending = '';

async function ensurePolities() {
  const year = timeline.year;
  try {
    const index = await loadPolityIndex();
    if (!index.length) return;
    const sorted = [...index].sort((a, b) => a.start - b.start);
    const entry = sorted.find((c) => year >= c.start && year < c.end) ?? sorted[sorted.length - 1];
    if (entry.file === polityKey.value || entry.file === polityPending) return;

    polityPending = entry.file;
    polityLoading.value = true;
    const collection = await loadPolityFile(entry, 'lod');
    if (polityPending !== entry.file) return;
    polityKey.value = entry.file;
    prepared.value = (collection?.features ?? [])
      .map(prepareFeature)
      .filter((p): p is PreparedPolity => p !== null);
  } catch {
    // Keep the previous century's slices rather than blanking the plate.
  } finally {
    if (polityPending === polityKey.value) polityPending = '';
    polityLoading.value = false;
  }
}

/* The source dump carries the same polity twice, once wrapped in parentheses
 * (`Qing Dynasty` / `(Qing Dynasty)`). Left alone both are counted and both are
 * drawn, which double-counts area and darkens the overlap. */
function bareName(name: string) {
  return name.replace(/^\((.*)\)$/, '$1').trim();
}

function dedupe(items: PreparedPolity[]): PreparedPolity[] {
  const kept = new Map<string, PreparedPolity>();
  for (const item of items) {
    const key = bareName(item.name).toLowerCase();
    const prev = kept.get(key);
    if (!prev) {
      kept.set(key, item);
      continue;
    }
    const prevBare = prev.name === bareName(prev.name);
    const itemBare = item.name === bareName(item.name);
    // Prefer the unwrapped spelling, then the larger slice of the same polity.
    if (itemBare !== prevBare ? itemBare : item.area > prev.area) kept.set(key, item);
  }
  return [...kept.values()];
}

const slices = computed(() => {
  const year = timeline.year;
  return regions.value.map((region) =>
    dedupe(
      prepared.value.filter(
        (p) => year >= p.fromYear && year <= p.toYear && bboxIntersects(p.bbox, region.bbox),
      ),
    ),
  );
});

/* Paths depend on the projection and the framing, not the year: cache per pane
 * so scrubbing the scale does not re-serialise the same geometry every step. */
const pathCaches = [new Map<PolityFeature, string>(), new Map<PolityFeature, string>()];
const anchorCache = new Map<PolityFeature, [number, number] | null>();

function pathFor(feature: PolityFeature, pane: number): string {
  const cache = pathCaches[pane];
  const hit = cache.get(feature);
  if (hit !== undefined) return hit;
  const d = featurePath(feature, projections.value[pane]);
  cache.set(feature, d);
  return d;
}

const anchorCaches = [
  new Map<PolityFeature, PlatePin | null>(),
  new Map<PolityFeature, PlatePin | null>(),
];

/**
 * Where to pin a name, preferring the piece of the polity this plate shows.
 *
 * `labelAnchor` samples the whole outline, which works for a compact state but
 * fails for anything with colonies: France, Britain and Germany all own land in
 * Africa or Asia, so their boxes span oceans, every sample lands in the sea, and
 * the three most important names on a European plate silently disappear. Each
 * polygon is therefore projected first, the largest on-screen piece wins, and
 * only that piece is sampled.
 */
type Pt = [number, number];

/** Sutherland–Hodgman against one edge; the plate is a plain rectangle. */
function clipHalf(points: Pt[], inside: (p: Pt) => boolean, cross: (a: Pt, b: Pt) => Pt): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const cur = points[i];
    const prev = points[(i + points.length - 1) % points.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(cross(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(cross(prev, cur));
    }
  }
  return out;
}

function clipAtX(axis: number): [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt] {
  return [
    (p) => p[0] >= axis,
    (a, b) => {
      const t = (axis - a[0]) / (b[0] - a[0]);
      return [axis, a[1] + t * (b[1] - a[1])];
    },
  ];
}

function clipAtY(axis: number): [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt] {
  return [
    (p) => p[1] >= axis,
    (a, b) => {
      const t = (axis - a[1]) / (b[1] - a[1]);
      return [a[0] + t * (b[0] - a[0]), axis];
    },
  ];
}

function clipMaxX(points: Pt[], axis: number): Pt[] {
  return clipHalf(
    points,
    (p) => p[0] <= axis,
    (a, b) => {
      const t = (axis - a[0]) / (b[0] - a[0]);
      return [axis, a[1] + t * (b[1] - a[1])];
    },
  );
}

function clipMaxY(points: Pt[], axis: number): Pt[] {
  return clipHalf(
    points,
    (p) => p[1] <= axis,
    (a, b) => {
      const t = (axis - a[1]) / (b[1] - a[1]);
      return [a[0] + t * (b[0] - a[0]), axis];
    },
  );
}

function ringArea(points: Pt[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    sum += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  }
  return Math.abs(sum) / 2;
}

/** Pixels of this ring that actually fall on the plate. */
function visibleArea(ring: number[][], proj: AtlasProjection): number {
  const pts: Pt[] = [];
  for (const point of ring) {
    const lon = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    pts.push([proj.x(lon), proj.y(lat)]);
  }
  if (pts.length < 3) return 0;
  let clip = clipHalf(pts, ...clipAtX(0));
  clip = clipMaxX(clip, VIEW_W);
  clip = clipHalf(clip, ...clipAtY(0));
  clip = clipMaxY(clip, VIEW_H);
  return ringArea(clip);
}

function plateAnchor(feature: PolityFeature, proj: AtlasProjection): PlatePin | null {
  const geometry = feature.geometry as unknown as {
    type?: string;
    coordinates?: number[][][][] | number[][][];
  };
  if (!geometry?.coordinates) return null;
  const polys: number[][][][] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as number[][][]]
      : (geometry.coordinates as number[][][][]);

  let best: PlatePin | null = null;
  for (const poly of polys) {
    const ring = poly[0];
    if (!ring || ring.length < 3) continue;
    let w = Infinity;
    let s = Infinity;
    let e = -Infinity;
    let n = -Infinity;
    for (const point of ring) {
      const lon = point[0];
      const lat = point[1];
      if (typeof lon !== 'number' || typeof lat !== 'number') continue;
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
    if (!Number.isFinite(w)) continue;
    // True clipped area, not the box: a long thin state (Norway) has a fat box
    // and little land, and ranking by the box put it above France.
    const visible = visibleArea(ring, proj);
    // A colony outside the frame contributes nothing, which is the point: the
    // anchor must describe the land the reader can see.
    if (visible <= 0 || (best && visible <= best.visible)) continue;

    const spanX = e - w;
    const spanY = n - s;
    const midX = (w + e) / 2;
    const midY = (s + n) / 2;
    const samples: [number, number][] = [
      [midX, midY],
      [w + spanX * 0.3, midY],
      [w + spanX * 0.7, midY],
      [midX, s + spanY * 0.35],
      [midX, s + spanY * 0.65],
      [w + spanX * 0.35, s + spanY * 0.35],
    ];
    for (const [lon, lat] of samples) {
      if (pointInPolity(feature, lon, lat)) {
        best = { at: [lon, lat], visible };
        break;
      }
    }
  }
  return best;
}

function anchorFor(feature: PolityFeature, pane: number): PlatePin | null {
  const cache = anchorCaches[pane];
  if (cache.has(feature)) return cache.get(feature) ?? null;
  const at = plateAnchor(feature, projections.value[pane]);
  cache.set(feature, at);
  return at;
}

// A different region means a different framing: re-fit instantly, no animation.
watch([regionA, regionB], () => {
  stopAnim();
  settle(frameFor(scaleMode.value));
});

function polityLabel(p: PreparedPolity): string {
  const name = bareName(p.name);
  return ui.locale === 'zh' ? (zhPolityName(name, props.names) ?? name) : name;
}

/* ── war records for the year on the plate ─────────────────────────────── */

const battles = ref<AtlasBattle[]>([]);
const warLoading = ref(false);
let warLoaded = Number.NaN;
let warPending = Number.NaN;
const warYearCache = new Map<number, AtlasBattle[]>();

/**
 * All battles fought up to the year in the header, not only that year's.
 *
 * Each archive lists 10–18 key engagements for a war that can run a decade, so
 * the strict one-year window left most years blank and made a war in progress
 * look finished. Earlier battles stay on the plate as hollow dots and the year's
 * own engagements are filled, which reads as a front moving rather than as
 * battles blinking in and out.
 */
async function ensureWars() {
  const year = timeline.year;
  if (warLoaded === year || warPending === year) return;
  const cached = warYearCache.get(year);
  if (cached) {
    battles.value = cached;
    warLoaded = year;
    return;
  }

  warPending = year;
  warLoading.value = true;
  try {
    const index = await loadWarIndex();
    const candidates = index
      .filter((w) => Number.isFinite(w.startYear) && Number.isFinite(w.endYear))
      .filter((w) => (w.startYear as number) <= year && (w.endYear as number) >= year)
      .sort((a, b) => (b.totalBattles ?? 0) - (a.totalBattles ?? 0))
      .slice(0, 18);

    const profiles = await Promise.all(candidates.map((w) => loadWarProfile(w.warId)));
    const out = profiles.flatMap((p) => battlesInWindow(p, Number.NEGATIVE_INFINITY, year));
    warYearCache.set(year, out);
    if (warPending === year) {
      battles.value = out;
      warLoaded = year;
    }
  } catch {
    // A failed profile load leaves the previous year's marks in place.
  } finally {
    if (warPending === year) {
      warPending = Number.NaN;
      warLoading.value = false;
    }
  }
}

/* ── entries ───────────────────────────────────────────────────────────── */

const decadeEvents = ref<TimelineEvent[]>([]);
const eventLoading = ref(false);
let eventKey = '';
const eventDecadeCache = new Map<string, TimelineEvent[]>();

function inRect(rect: Region['bbox'], lon: number, lat: number) {
  return lon >= rect.west && lon <= rect.east && lat >= rect.south && lat <= rect.north;
}

/** The decade is still fetched: the rhythm strip reads all ten years. */
const paneDecadeEvents = computed(() =>
  regions.value.map((region) =>
    decadeEvents.value.filter(
      (e) =>
        e.lon !== null &&
        e.lat !== null &&
        inRect(region.bbox, e.lon, e.lat) &&
        layers.isActive(e.category),
    ),
  ),
);

/** The plate itself only marks the year in the header. */
const paneYearEvents = computed(() =>
  paneDecadeEvents.value.map((list) => list.filter((e) => e.year === timeline.year)),
);

const yearEventTotal = computed(
  () => decadeEvents.value.filter((e) => e.year === timeline.year).length,
);

interface BandRow {
  year: number;
  a: TimelineEvent[];
  b: TimelineEvent[];
  /** Both panels have something to say about this year. */
  tied: boolean;
}

/**
 * 同一十年、同一条年份轴上的双栏事件对照。
 *
 * 两块图版各自只看一个区域，只有并排按年对齐，才能一眼看出"两边同一年
 * 都在发生什么"；两侧都有条目的年份标「同年」。条目与图版上的点同源，
 * 点击即打开卡片。
 */
const eventBand = computed<BandRow[]>(() => {
  const [left, right] = paneDecadeEvents.value.map((list) =>
    dedupeRestatements([...list].sort((x, y) => x.year - y.year)),
  );
  const years = [...new Set([...left, ...right].map((e) => e.year))].sort((x, y) => x - y);
  return years.map((year) => {
    const a = left.filter((e) => e.year === year);
    const b = right.filter((e) => e.year === year);
    return { year, a, b, tied: a.length > 0 && b.length > 0 };
  });
});

async function ensureEvents() {
  const key = `${ui.locale}:${decade.value}`;
  if (eventKey === key) return;
  const cached = eventDecadeCache.get(key);
  if (cached) {
    decadeEvents.value = cached;
    eventKey = key;
    return;
  }

  eventKey = key;
  eventLoading.value = true;
  try {
    const result = await loadEventWindow(decade.value + 5, ui.locale, 5);
    const inDecade = result.events.filter(
      (e) => e.year >= decade.value && e.year <= decade.value + 9,
    );
    eventDecadeCache.set(key, inDecade);
    if (eventKey === key) decadeEvents.value = inDecade;
  } catch {
    eventKey = '';
  } finally {
    eventLoading.value = false;
  }
}

/** Battle marks on top of the overview layer, switchable; the war layer is
 *  itself the switch, so it always draws them. */
const showWars = ref(true);
const warVisible = computed(
  () => layer.value === 'war' || (layer.value === 'all' && showWars.value),
);
const recordsVisible = computed(() => layer.value === 'all' || layer.value === 'records');

function refreshLayers() {
  if (warVisible.value) void ensureWars();
  // 两块图版下方的对照带每一层都在，所以本十年事件始终取；只有图上的点
  // 才受 `recordsVisible` 控制。
  void ensureEvents();
}

watch([layer, showWars, () => timeline.year], refreshLayers, { immediate: true });
watch([() => decade.value, () => ui.locale], refreshLayers);

watch(
  () => timeline.year,
  () => {
    if (!timeline.scrubbing) void ensurePolities();
  },
  { immediate: true },
);
// Scrubbing across a century boundary should not fetch an 8 MB file per step.
watch(
  () => timeline.scrubbing,
  (scrubbing) => {
    if (!scrubbing) void ensurePolities();
  },
);

/* ── panes ─────────────────────────────────────────────────────────────── */

interface PlateShape {
  d: string;
  rank: number;
  feature: PolityFeature;
}

interface PlateLabel {
  x: number;
  y: number;
  text: string;
  feature?: PolityFeature;
  warId?: string;
}

interface BattleDot {
  x: number;
  y: number;
  year: number;
  /** Fought this year; earlier engagements stay as hollow dots. */
  current: boolean;
}

interface WarRow {
  warId: string;
  name: string;
  nameEn: string;
  /** Engagements so far, i.e. all dots the war has on the plate. */
  count: number;
  /** Engagements dated to the year in the header. */
  yearCount: number;
}

interface RecordDot {
  x: number;
  y: number;
  css: string;
  year: number;
  title: string;
}

interface GridLine {
  p: number;
  label: string;
}

/** Screen box `[left, top, right, bottom]` used to keep plate labels apart. */
type Box = [number, number, number, number];

/** A label that survived the threshold, before collision removal. */
interface LabelCandidate {
  feature: PolityFeature;
  text: string;
  w: number;
  x: number;
  y: number;
  /** Projected area of the visible piece, used to rank names on the plate. */
  weight: number;
  /** True when the anchor itself projects inside the plate. */
  inside: boolean;
}

interface PlatePin {
  at: [number, number];
  /** Projected area of the polygon the anchor came from. */
  visible: number;
}

/** Rough width of the 14px label face: CJK is full-width, Latin is not. */
function labelWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 14 : 7.6;
  return w;
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

interface Pane {
  region: Region;
  shapes: PlateShape[];
  labels: PlateLabel[];
  battleDots: BattleDot[];
  hulls: string[];
  warLabels: PlateLabel[];
  wars: WarRow[];
  records: RecordDot[];
  lonLines: GridLine[];
  latLines: GridLine[];
  ruler: number;
  count: number;
  headline: string;
  empty: boolean;
}

function visibleExtent(proj: AtlasProjection, rect: Region['bbox']) {
  const cx = (rect.west + rect.east) / 2;
  const cy = (rect.south + rect.north) / 2;
  const halfLon = VIEW_W / 2 / (proj.cos * proj.k);
  const halfLat = VIEW_H / 2 / proj.k;
  return {
    west: Math.max(-180, cx - halfLon),
    east: Math.min(180, cx + halfLon),
    south: Math.max(-85, cy - halfLat),
    north: Math.min(85, cy + halfLat),
  };
}

function gridFor(proj: AtlasProjection, rect: Region['bbox']) {
  const extent = visibleExtent(proj, rect);
  const lonLines: GridLine[] = [];
  for (let lon = Math.ceil(extent.west / 10) * 10; lon <= extent.east; lon += 10) {
    lonLines.push({ p: proj.x(lon), label: `${lon}°` });
  }
  const latLines: GridLine[] = [];
  for (let lat = Math.ceil(extent.south / 10) * 10; lat <= extent.north; lat += 10) {
    latLines.push({ p: proj.y(lat), label: `${lat}°` });
  }
  return { lonLines, latLines };
}

function eventCss(event: TimelineEvent): string {
  const meta = CATEGORIES[event.category as CategoryKey];
  return meta ? `var(${meta.cssVar})` : 'var(--ink-3)';
}

function warName(row: WarRow): string {
  return ui.locale === 'zh' ? row.name : row.nameEn || row.name;
}

const panes = computed<Pane[]>(() => {
  const showFills = layer.value !== 'units';
  return regions.value.map((region, i) => {
    const proj = projections.value[i];
    const items = slices.value[i];
    const sorted = [...items].sort((a, b) => a.area - b.area);
    const ranked = [...items].sort((a, b) => b.area - a.area);
    const rankOf = new Map(ranked.map((p, index) => [p, index]));
    const draw = sorted.slice(-Math.max(36, showFills ? 60 : 90));

    const shapes: PlateShape[] = draw
      .filter((p) => p.area > 0)
      .map((p) => ({ d: pathFor(p.feature, i), rank: rankOf.get(p) ?? 99, feature: p.feature }))
      .filter((s) => s.d.length > 0);

    const labels: PlateLabel[] = [];
    const boxes: Box[] = [];
    const candidates = ranked
      .slice(0, 30)
      .map((p): LabelCandidate | null => {
        const pin = anchorFor(p.feature, i);
        if (!pin) return null;
        const text = polityLabel(p);
        if (!text) return null;
        const rawX = proj.x(pin.at[0]);
        const rawY = proj.y(pin.at[1]);
        const w = labelWidth(text);
        // The source splits a realm into a metropolitan outline and a
        // parenthesised colonial one. Both cover the same land here, so the
        // plain spelling wins and 1914 Europe reads "法国", not "第二帝国".
        const weight = pin.visible * (p.name === bareName(p.name) ? 1 : 0.85);
        return {
          feature: p.feature,
          text,
          w,
          weight,
          // Anchors near the edge are pulled inside rather than dropped; the old
          // rule silently lost every name whose centre sat outside the frame.
          x: Math.max(8, Math.min(VIEW_W - 8 - w, rawX)),
          y: Math.max(16, Math.min(VIEW_H - 10, rawY)),
          inside: rawX >= 0 && rawX <= VIEW_W && rawY >= 0 && rawY <= VIEW_H,
        };
      })
      .filter((c): c is LabelCandidate => c !== null)
      // Rank by the land this plate actually shows: Scandinavia is big and empty
      // but still deserves a name, while a Portuguese sliver does not.
      .sort((a, b) => b.weight - a.weight);

    const maxWeight = candidates[0]?.weight ?? 0;
    const pick = candidates.filter((c) => maxWeight === 0 || c.weight >= maxWeight * 0.004);

    // One name per patch of land. The source lists the same realm twice under
    // different labels ("西班牙王国" and "西班牙帝国"), and both would otherwise
    // take a seat and print on top of each other.
    const anchorsPlaced: [number, number][] = [];

    const place = (list: LabelCandidate[]) => {
      for (const c of list) {
        if (labels.length >= 10) return;
        if (anchorsPlaced.some(([x, y]) => Math.hypot(x - c.x, y - c.y) < 26)) continue;
        // One nudge up or down beats losing the name: neighbouring states sit a
        // few pixels apart on a plate this small.
        const box = [0, -18, 18, -34, 34]
          .map((dy): Box => [c.x - 2, c.y + dy - 13, c.x + c.w + 2, c.y + dy + 4])
          .find((b) => b[1] >= 2 && b[3] <= VIEW_H - 2 && !boxes.some((o) => boxesOverlap(o, b)));
        if (!box) continue;
        boxes.push(box);
        anchorsPlaced.push([c.x, c.y]);
        labels.push({ x: c.x, y: box[3] - 4, text: c.text, feature: c.feature });
      }
    };

    // Strictly by the land shown. Russia's European half reaches in from the
    // edge and still outranks every Balkan duchy, which is the correct order;
    // splitting the queue into "inside" and "edge" let ten small states fill
    // the plate while Russia and the Ottomans never got a turn.
    place(pick);

    const regionBattles = warVisible.value
      ? battles.value.filter((b) => inRect(region.bbox, b.lon, b.lat))
      : [];
    const year = timeline.year;
    const battleDots: BattleDot[] = regionBattles.map((b) => ({
      x: proj.x(b.lon),
      y: proj.y(b.lat),
      year: b.year,
      current: b.year === year,
    }));

    const groups = new Map<string, { row: WarRow; list: AtlasBattle[] }>();
    for (const b of regionBattles) {
      const hit = groups.get(b.warId);
      if (hit) {
        hit.list.push(b);
        hit.row.count += 1;
        if (b.year === year) hit.row.yearCount += 1;
      } else {
        groups.set(b.warId, {
          row: {
            warId: b.warId,
            name: b.name,
            nameEn: b.nameEn,
            count: 1,
            yearCount: b.year === year ? 1 : 0,
          },
          list: [b],
        });
      }
    }
    const ordered = [...groups.values()].sort((a, b) => b.row.count - a.row.count);
    const wars = ordered.map((g) => g.row);

    // Hulls trace this year's front, not the decade's; a hull around every
    // engagement ever recorded would shade the whole war instead of its line.
    const hulls = ordered
      .map((g) => g.list.filter((b) => b.year === year))
      .filter((list) => list.length >= 4)
      .map((list) => hullPath(list, proj))
      .filter(Boolean)
      .slice(0, 6);

    const warLabels: PlateLabel[] = [];
    for (const g of ordered) {
      if (g.list.length < 2) continue;
      // Anchor on the year's engagements when the war has any, so the caption
      // follows the front instead of drifting to the middle of the whole archive.
      const current = g.list.filter((b) => b.year === year);
      const anchorList = current.length ? current : g.list;
      const cx = anchorList.reduce((sum, b) => sum + proj.x(b.lon), 0) / anchorList.length;
      const cy = anchorList.reduce((sum, b) => sum + proj.y(b.lat), 0) / anchorList.length;
      if (cx < 18 || cx > VIEW_W - 18 || cy < 14 || cy > VIEW_H - 14) continue;
      const text = warName(g.row);
      const w = labelWidth(text);
      // The centre of a war's battles is often the centre of an empire
      // ("第一次世界大战" landed on top of "德意志帝国"), so step away from any
      // name already on the plate. If every offset is taken the caption is still
      // drawn — a listed war may not look like it has vanished from the map; the
      // text carries a paper-coloured halo instead.
      const dy =
        [0, -16, 16, -30].find((d) => {
          const b: Box = [cx - 4, cy + d - 12, cx + w + 4, cy + d + 4];
          return b[1] >= 2 && b[3] <= VIEW_H - 2 && !boxes.some((o) => boxesOverlap(o, b));
        }) ?? 0;
      boxes.push([cx - 4, cy + dy - 12, cx + w + 4, cy + dy + 4]);
      warLabels.push({ x: cx, y: cy + dy, text, warId: g.row.warId });
      if (warLabels.length >= 3) break;
    }

    const records: RecordDot[] = recordsVisible.value
      ? paneYearEvents.value[i].map((e) => ({
          x: proj.x(e.lon as number),
          y: proj.y(e.lat as number),
          css: eventCss(e),
          year: e.year,
          title: e.title,
        }))
      : [];

    const { lonLines, latLines } = gridFor(proj, region.bbox);
    const yearDots = battleDots.filter((d) => d.current).length;
    const headline =
      layer.value === 'war'
        ? ui.tf('atlas.battleHeadline', { n: yearDots, total: battleDots.length })
        : layer.value === 'records'
          ? `${records.length} ${ui.t('atlas.records')}`
          : layer.value === 'units'
            ? `${items.length} ${ui.t('atlas.units')}`
            : `${items.length} ${ui.t('atlas.polities')}`;

    return {
      region,
      shapes,
      labels,
      battleDots,
      hulls,
      warLabels,
      wars,
      records,
      lonLines,
      latLines,
      ruler: Math.min(proj.km(1000), VIEW_W - PAD * 2 - 44),
      count: items.length,
      headline,
      empty: items.length === 0 && (layer.value === 'territory' || layer.value === 'units'),
    };
  });
});

/* ── figures and rhythm ────────────────────────────────────────────────── */

interface FigureRow {
  k: string;
  a: string;
  b: string;
}

/** Per-pane battle lists; every figure below is read off these, never off a merge. */
const paneBattles = computed(() =>
  regions.value.map((region) => battles.value.filter((b) => inRect(region.bbox, b.lon, b.lat))),
);

function tally(items: PreparedPolity[]) {
  const areas = items.map((p) => p.area).filter((a) => a > 0);
  const largest = items.reduce<PreparedPolity | null>(
    (best, p) => (p.area > (best?.area ?? 0) ? p : best),
    null,
  );
  return {
    count: items.length,
    area: areas.reduce((sum, a) => sum + a, 0),
    median: median(areas),
    largest: largest ? polityLabel(largest) : '—',
  };
}

function busiest(items: { year: number }[]): number | null {
  if (!items.length) return null;
  const counts = new Map<number, number>();
  for (const item of items) counts.set(item.year, (counts.get(item.year) ?? 0) + 1);
  let best = -Infinity;
  let bestYear: number | null = null;
  for (const [year, count] of counts) {
    if (count > best) {
      best = count;
      bestYear = year;
    }
  }
  return bestYear;
}

function ratio(part: number, whole: number) {
  if (whole <= 0) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

/**
 * Reads: one column per pane, two panes, no merged total. A sum across the two
 * columns would double-count any polity (and any battle) that both frames
 * cover, so the plate shows the two readings side by side and stops there.
 */
const figureRows = computed<FigureRow[]>(() => {
  const [itemsA, itemsB] = slices.value;

  if (layer.value === 'war') {
    const year = timeline.year;
    const per = paneBattles.value.map((list) => {
      const groups = new Map<string, { name: string; count: number; yearCount: number }>();
      for (const b of list) {
        const hit = groups.get(b.warId);
        const yearHit = b.year === year ? 1 : 0;
        if (hit) {
          hit.count += 1;
          hit.yearCount += yearHit;
        } else {
          groups.set(b.warId, {
            name: warName({ warId: b.warId, name: b.name, nameEn: b.nameEn, count: 1, yearCount: yearHit }),
            count: 1,
            yearCount: yearHit,
          });
        }
      }
      const wars = [...groups.values()].sort((x, y) => y.count - x.count);
      return {
        count: list.length,
        yearCount: list.filter((b) => b.year === year).length,
        wars,
        top: wars[0]?.name ?? '—',
      };
    });
    return [
      { k: ui.t('atlas.battles'), a: String(per[0].yearCount), b: String(per[1].yearCount) },
      { k: ui.t('atlas.battlesTotal'), a: String(per[0].count), b: String(per[1].count) },
      { k: ui.t('atlas.wars'), a: String(per[0].wars.length), b: String(per[1].wars.length) },
      { k: ui.t('atlas.topWar'), a: per[0].top, b: per[1].top },
      { k: ui.t('atlas.avgPerWar'), a: per[0].wars.length ? (per[0].count / per[0].wars.length).toFixed(1) : '—', b: per[1].wars.length ? (per[1].count / per[1].wars.length).toFixed(1) : '—' },
    ];
  }

  if (layer.value === 'records') {
    const yearPer = paneYearEvents.value.map((list) => list.length);
    const decadePer = paneDecadeEvents.value.map((list) => list.length);
    const peakPer = paneDecadeEvents.value.map((list) => busiest(list));
    return [
      {
        k: ui.t('atlas.recordsYear'),
        a: String(yearPer[0]),
        b: String(yearPer[1]),
      },
      {
        k: ui.t('atlas.share'),
        a: ratio(yearPer[0], yearEventTotal.value),
        b: ratio(yearPer[1], yearEventTotal.value),
      },
      {
        k: ui.t('atlas.decadeTotal'),
        a: String(decadePer[0]),
        b: String(decadePer[1]),
      },
      {
        k: ui.t('atlas.peakYearDecade'),
        a: peakPer[0] === null ? '—' : formatYearCompact(peakPer[0], ui.locale),
        b: peakPer[1] === null ? '—' : formatYearCompact(peakPer[1], ui.locale),
      },
    ];
  }

  if (layer.value === 'units') {
    const parts = (items: PreparedPolity[]) =>
      items.reduce(
        (sum, p) =>
          sum +
          (p.feature.geometry.type === 'MultiPolygon'
            ? (p.feature.geometry.coordinates as number[][][][]).length
            : 1),
        0,
      );
    const statA = tally(itemsA);
    const statB = tally(itemsB);
    return [
      {
        k: ui.t('atlas.units'),
        a: String(statA.count),
        b: String(statB.count),
      },
      {
        k: ui.t('atlas.parts'),
        a: String(parts(itemsA)),
        b: String(parts(itemsB)),
      },
      {
        k: ui.t('atlas.smallUnits'),
        a: String(itemsA.filter((p) => p.area < 1_000_000).length),
        b: String(itemsB.filter((p) => p.area < 1_000_000).length),
      },
      {
        k: ui.t('atlas.medianArea'),
        a: formatArea(statA.median, ui.locale),
        b: formatArea(statB.median, ui.locale),
      },
    ];
  }

  const statA = tally(itemsA);
  const statB = tally(itemsB);
  return [
    {
      k: ui.t('atlas.polities'),
      a: String(statA.count),
      b: String(statB.count),
    },
    {
      k: ui.t('atlas.totalArea'),
      a: formatArea(statA.area, ui.locale),
      b: formatArea(statB.area, ui.locale),
    },
    { k: ui.t('atlas.largest'), a: statA.largest, b: statB.largest },
    {
      k: ui.t('atlas.medianArea'),
      a: formatArea(statA.median, ui.locale),
      b: formatArea(statB.median, ui.locale),
    },
  ];
});

const rhythm = computed(() => {
  const rows = [0, 1].map((i) => ({
    tag: regionLabel(regions.value[i], ui.locale),
    bars: Array.from({ length: 10 }, (_, step) => {
      const year = decade.value + step;
      return { year, count: paneDecadeEvents.value[i].filter((e) => e.year === year).length };
    }),
  }));
  const max = Math.max(
    1,
    ...rows.flatMap((row) => row.bars.map((bar) => bar.count)),
  );
  return { rows, max };
});

const loading = computed(
  () => polityLoading.value || warLoading.value || eventLoading.value,
);

/** War and record layers read one year only; say so next to the layer switch. */
const layerHint = computed(() => {
  const base = ui.t(LAYERS.find((l) => l.id === layer.value)?.hint ?? 'atlas.layer.all.hint');
  if (layer.value !== 'war' && layer.value !== 'records') return base;
  return `${ui.tf('atlas.windowOnly', { year: formatYearCompact(timeline.year, ui.locale) })} · ${base}`;
});

const scaleNote = computed(() =>
  ui.t(scaleMode.value === 'A' ? 'atlas.scaleNoteA' : 'atlas.scaleNoteB'),
);

/* ── interactions ──────────────────────────────────────────────────────── */

function setRegion(index: number, id: string) {
  if (!id) return;
  if (index === 0) regionA.value = id;
  else regionB.value = id;
}

function swapRegions() {
  const a = regionA.value;
  regionA.value = regionB.value;
  regionB.value = a;
}

function goYear(year: number) {
  const clamped = Math.min(YEAR_MAX, Math.max(YEAR_MIN, year));
  timeline.setYear(clamped);
}

function pickPolity(feature: PolityFeature) {
  emit('pick-polity', feature);
}

function pickWar(warId: string) {
  emit('pick-war', warId);
}

/** 对照带条目 → 先跳到它的年份，再打开卡片，两屏同时定位。 */
function selectEvent(event: TimelineEvent) {
  goYear(event.year);
  emit('pick-event', event);
}

onMounted(() => {
  void ensurePolities();
});

onBeforeUnmount(() => {
  stopAnim();
  pathCaches[0].clear();
  pathCaches[1].clear();
  anchorCache.clear();
});
</script>

<template>
  <section class="board">
    <header class="masthead">
      <div class="mast-top">
        <span>
          {{ ui.t('head.folio') }} {{ formatYearCompact(timeline.year, ui.locale) }} ·
          {{ ui.locale === 'zh' ? timeline.era.name : timeline.era.nameEn }}
        </span>
        <span>{{ ui.t('atlas.edition') }}</span>
      </div>
      <h1 class="serif">{{ ui.t('atlas.headline') }}</h1>
      <p class="standfirst">{{ ui.t('atlas.standfirst') }}</p>
      <div class="dateline">
        <span class="note">{{ scaleNote }}</span>
      </div>
    </header>

    <div class="layers">
      <button
        v-for="item in LAYERS"
        :key="item.id"
        :class="{ on: layer === item.id }"
        @click="layer = item.id"
      >
        {{ ui.t(item.key) }}
      </button>
      <span class="layer-hint">{{ layerHint }}</span>
      <button
        v-if="layer === 'all'"
        class="war-toggle"
        :class="{ on: showWars }"
        :aria-pressed="showWars"
        :title="ui.t(showWars ? 'atlas.warMarks.hide' : 'atlas.warMarks.show')"
        @click="showWars = !showWars"
      >
        <span class="dot" aria-hidden="true"></span>{{ ui.t('atlas.warMarks') }}
      </button>
      <div class="frame-switch" role="group" :aria-label="ui.t('atlas.modeLabel')">
        <button
          :class="{ on: scaleMode === 'B' }"
          :title="`${ui.t('atlas.mode.b')} · ${ui.t('atlas.mode.bSub')}`"
          @click="setScaleMode('B')"
        >
          {{ ui.t('atlas.frame.own') }}
        </button>
        <button
          :class="{ on: scaleMode === 'A' }"
          :title="`${ui.t('atlas.mode.a')} · ${ui.t('atlas.mode.aSub')}`"
          @click="setScaleMode('A')"
        >
          {{ ui.t('atlas.frame.shared') }}
        </button>
      </div>
    </div>

    <div class="spread">
      <figure v-for="(pane, index) in panes" :key="index" class="plate">
        <figcaption class="plate-head">
          <span class="plate-tag cap">{{ index === 0 ? ui.t('atlas.plateA') : ui.t('atlas.plateB') }}</span>
          <select
            :value="index === 0 ? regionA : regionB"
            @change="setRegion(index, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="option in regionOptions" :key="option.id" :value="option.id">
              {{ option.label }}
            </option>
          </select>
          <button class="swap" :title="ui.t('atlas.sameScale')" @click="swapRegions">⇄</button>
          <span class="plate-frame">{{ scaleMode === 'A' ? ui.t('atlas.frame.shared') : ui.t('atlas.frame.own') }}</span>
          <span class="plate-metric mono">{{ pane.headline }}</span>
        </figcaption>

        <div class="map">
          <svg :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`" role="img" :aria-label="pane.region.en">
            <defs>
              <radialGradient :id="`atlas-wash-${index}`">
                <stop offset="0%" stop-color="#b0522d" stop-opacity="0.34" />
                <stop offset="55%" stop-color="#b0522d" stop-opacity="0.13" />
                <stop offset="100%" stop-color="#b0522d" stop-opacity="0" />
              </radialGradient>
            </defs>

            <rect class="sea" x="0" y="0" :width="VIEW_W" :height="VIEW_H" />

            <!-- Framing swaps animate this wrapper, so cached geometry is never
                 re-serialised frame by frame. -->
            <g :transform="animMatrices[index] || undefined">
              <g class="graticule">
              <g v-for="line in pane.lonLines" :key="`lon-${line.label}`">
                <line :x1="line.p" y1="0" :x2="line.p" :y2="VIEW_H" />
                <text :x="line.p" :y="VIEW_H - 5">{{ line.label }}</text>
              </g>
              <g v-for="line in pane.latLines" :key="`lat-${line.label}`">
                <line x1="0" :y1="line.p" :x2="VIEW_W" :y2="line.p" />
                <text x="4" :y="line.p - 3">{{ line.label }}</text>
              </g>
            </g>

            <g class="polities" :class="layer">
              <path
                v-for="(shape, si) in pane.shapes"
                :key="si"
                :d="shape.d"
                :class="`lead-${Math.min(shape.rank, 3)}`"
              />
            </g>

            <g v-if="warVisible" class="wash">
              <circle
                v-for="(dot, bi) in pane.battleDots"
                v-show="dot.current"
                :key="`wash-${bi}`"
                :cx="dot.x"
                :cy="dot.y"
                :r="26"
                :fill="`url(#atlas-wash-${index})`"
              />
            </g>

            <g v-if="warVisible" class="hulls">
              <path v-for="(hull, hi) in pane.hulls" :key="`hull-${hi}`" :d="hull" />
            </g>

            <g v-if="warVisible" class="battle-dots">
              <circle
                v-for="(dot, bi) in pane.battleDots"
                :key="`battle-${bi}`"
                :cx="dot.x"
                :cy="dot.y"
                :class="{ old: !dot.current }"
                :r="dot.current ? 2.1 : 1.6"
              />
            </g>

            <g v-if="recordsVisible" class="records">
              <circle
                v-for="(dot, ri) in pane.records"
                :key="`record-${ri}`"
                :cx="dot.x"
                :cy="dot.y"
                :r="2.2"
                :style="{ fill: dot.css }"
              />
            </g>

            <g class="plate-labels">
              <text
                v-for="(label, li) in pane.labels"
                :key="`label-${li}`"
                :x="label.x"
                :y="label.y"
                role="button"
                tabindex="0"
                @click="label.feature && pickPolity(label.feature)"
                @keydown.enter="label.feature && pickPolity(label.feature)"
              >
                {{ label.text }}
              </text>
            </g>

            <g v-if="warVisible" class="war-labels">
              <text
                v-for="(label, wi) in pane.warLabels"
                :key="`war-label-${wi}`"
                :x="label.x"
                :y="label.y - 5"
                role="button"
                tabindex="0"
                @click="label.warId && pickWar(label.warId)"
                @keydown.enter="label.warId && pickWar(label.warId)"
              >
                {{ label.text }}
              </text>
            </g>

            <g class="scale-bar" :transform="`translate(${PAD}, ${VIEW_H - 24})`">
              <line x1="0" y1="0" :x2="pane.ruler" y2="0" />
              <line x1="0" y1="-4" x2="0" y2="4" />
              <line :x1="pane.ruler" y1="-4" :x2="pane.ruler" y2="4" />
              <text :x="pane.ruler + 7" y="3">1000 km</text>
            </g>
            </g>
          </svg>

          <p v-if="pane.empty" class="empty-note">{{ ui.t('atlas.noPolity') }}</p>
        </div>

        <ul v-if="warVisible" class="war-list">
          <li v-if="!pane.wars.length" class="war-empty">{{ ui.t('atlas.noWar') }}</li>
          <li v-for="row in pane.wars.slice(0, 4)" :key="row.warId">
            <button @click="pickWar(row.warId)">
              <span class="war-name">{{ warName(row) }}</span>
              <span class="war-count mono">{{ ui.tf('atlas.battleCountSplit', { n: row.yearCount, total: row.count }) }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="plate-note">{{ ui.t('atlas.clickPolity') }}</p>
      </figure>
    </div>

    <div v-if="eventBand.length" class="event-band">
      <div class="band-head">
        <span class="cap">{{ ui.t('atlas.eventCompare') }}</span>
        <span class="band-range mono">
          {{ formatYearCompact(decade, ui.locale) }}–{{ formatYearCompact(decadeEnd, ui.locale) }}
        </span>
        <span class="band-hint">{{ ui.t('atlas.eventCompareHint') }}</span>
      </div>
      <div class="band-body">
        <div
          v-for="row in eventBand"
          :key="row.year"
          class="band-row"
          :class="{ tied: row.tied, on: row.year === timeline.year }"
        >
          <div class="band-side a">
            <button
              v-for="ev in row.a"
              :key="ev.key"
              class="band-ev"
              :title="ev.title"
              @click="selectEvent(ev)"
            >
              <i :style="{ background: eventCss(ev) }" aria-hidden="true" />
              <span>{{ ev.title }}</span>
            </button>
          </div>
          <div class="band-year">
            <button class="mono" :title="String(row.year)" @click="goYear(row.year)">
              {{ formatYearCompact(row.year, ui.locale) }}
            </button>
            <i v-if="row.tied" class="tie">{{ ui.t('compare.sameYear') }}</i>
          </div>
          <div class="band-side b">
            <button
              v-for="ev in row.b"
              :key="ev.key"
              class="band-ev"
              :title="ev.title"
              @click="selectEvent(ev)"
            >
              <i :style="{ background: eventCss(ev) }" aria-hidden="true" />
              <span>{{ ev.title }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="recordsVisible" class="rhythm">
      <div class="rhythm-head">
        <span class="cap">{{ ui.t('atlas.rhythm') }}</span>
        <span class="rhythm-range mono">
          {{ formatYearCompact(decade, ui.locale) }}–{{ formatYearCompact(decadeEnd, ui.locale) }}
        </span>
        <span class="rhythm-unit">{{ ui.t('atlas.rhythmUnit') }}</span>
        <span class="rhythm-hint">
          {{ ui.tf('atlas.rhythmMax', { n: rhythm.max }) }} · {{ ui.t('atlas.rhythmHint') }}
        </span>
      </div>
      <div v-for="row in rhythm.rows" :key="row.tag" class="rhythm-row">
        <span class="rhythm-tag">{{ row.tag }}</span>
        <div class="rhythm-bars">
          <button
            v-for="bar in row.bars"
            :key="bar.year"
            class="rhythm-bar"
            :class="{ on: bar.year === timeline.year }"
            :title="`${formatYearCompact(bar.year, ui.locale)} · ${bar.count}`"
            @click="goYear(bar.year)"
          >
            <i
              :style="{
                height: bar.count ? `${Math.max(8, Math.round((bar.count / rhythm.max) * 100))}%` : '0',
              }"
            />
            <span class="mono">{{ formatYearCompact(bar.year, ui.locale) }}</span>
          </button>
        </div>
      </div>
    </div>

    <table class="figures">
      <thead>
        <tr>
          <th scope="col" class="fig-key">{{ ui.t('atlas.figures') }}</th>
          <th scope="col">{{ ui.t('atlas.plateA') }}</th>
          <th scope="col">{{ ui.t('atlas.plateB') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in figureRows" :key="row.k">
          <th scope="row">{{ row.k }}</th>
          <td class="mono">{{ row.a }}</td>
          <td class="mono">{{ row.b }}</td>
        </tr>
      </tbody>
    </table>
    <p class="fig-note">{{ ui.t('atlas.areaCaveat') }}</p>

    <p class="disclaimer">{{ ui.t('atlas.disclaimer') }}</p>
    <p v-if="loading" class="loading">{{ ui.t('atlas.loading') }}</p>
  </section>
</template>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  background: var(--paper);
}

/* ── masthead ──────────────────────────────────────────────────────────── */

.masthead {
  padding: 16px 22px 12px;
  border-bottom: 3px double var(--ink-3);
}
.mast-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.masthead h1 {
  margin: 6px 0 2px;
  text-align: center;
  font-size: 34px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-indent: 0.22em;
  line-height: 1.15;
}
.standfirst {
  margin: 0 0 4px;
  text-align: center;
  font-size: 12.5px;
  letter-spacing: 0.08em;
  color: var(--ink-2);
}
.dateline {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 7px;
  padding-top: 9px;
  border-top: 1px solid var(--rule);
  font-size: 12.5px;
  color: var(--ink-2);
}
.lock {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-2);
  font-size: 11.5px;
  letter-spacing: 0.08em;
}
.lock .box {
  display: inline-grid;
  place-items: center;
  width: 13px;
  height: 13px;
  border: 1px solid var(--rule-3);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--rust);
}
.sep {
  color: var(--ink-4);
}
.note {
  color: var(--ink-3);
}

/* ── layer switch ──────────────────────────────────────────────────────── */

.layers {
  display: flex;
  align-items: stretch;
  gap: 0;
  flex: 0 0 auto;
  padding: 0 14px;
  background: var(--paper-2);
  border-bottom: 1px solid var(--rule);
  overflow-x: auto;
  position: sticky;
  top: 0;
  z-index: 3;
}
.layers button {
  padding: 9px 13px;
  border-bottom: 2px solid transparent;
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.06em;
  color: var(--ink-3);
  white-space: nowrap;
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.layers button:hover {
  color: var(--ink);
}
.layers button.on {
  color: var(--ink);
  border-bottom-color: var(--rust);
}
.layer-hint {
  margin-left: auto;
  padding: 10px 12px 10px 16px;
  font-size: 11.5px;
  color: var(--ink-3);
  white-space: nowrap;
}

/* Framing is a setting, not a headline: two quiet words in the strip rather
   than a bordered block taking a whole row above the plates. */
.frame-switch {
  display: inline-flex;
  align-items: center;
  align-self: center;
  margin-left: 2px;
  border-left: 1px solid var(--rule);
}
.frame-switch button {
  padding: 4px 6px;
  border-bottom: 0;
  font-family: var(--font-sans);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--ink-4);
  white-space: nowrap;
}
.frame-switch button + button {
  border-left: 1px solid var(--rule);
}
.frame-switch button:hover {
  color: var(--ink-2);
}
.frame-switch button.on {
  color: var(--ink-2);
  border-bottom-color: transparent;
  background: var(--paper-3);
}

/* Battle marks can sit on top of the overview without becoming a layer of
   their own; the dot is the state, the word stays quiet. */
.war-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: center;
  margin-left: 2px;
  padding: 4px 7px;
  border-bottom: 0;
  font-family: var(--font-sans);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--ink-4);
  white-space: nowrap;
}
.war-toggle:hover {
  color: var(--ink-2);
}
.war-toggle .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  border: 1px solid var(--ink-4);
}
.war-toggle.on {
  color: var(--ink-2);
}
.war-toggle.on .dot {
  border-color: var(--rust);
  background: var(--rust);
}

/* ── the plate ─────────────────────────────────────────────────────────── */

.spread {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  flex: 0 0 auto;
}
.plate {
  margin: 0;
  padding: 12px 16px 14px;
  min-width: 0;
}
.plate + .plate {
  border-left: 1px solid var(--rule);
}
.plate-head {
  display: flex;
  align-items: baseline;
  gap: 7px;
  margin-bottom: 8px;
}
.plate-tag {
  color: var(--ink-4);
}
.plate-head select {
  font-family: var(--font-display);
  font-size: 13px;
  padding: 2px 5px;
  border: 1px solid var(--rule-2);
  background: var(--card);
  color: var(--ink);
  max-width: 130px;
}
.swap {
  font-size: 12px;
  color: var(--ink-3);
  padding: 0 2px;
}
.swap:hover {
  color: var(--rust);
}
.plate-frame {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--ink-4);
  border: 1px solid var(--rule-2);
  padding: 1px 4px;
  white-space: nowrap;
}
.plate-metric {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--ink-3);
}

.map {
  position: relative;
  border: 1px solid var(--rule-2);
  background: var(--paper);
}
.map svg {
  display: block;
  width: 100%;
  height: auto;
}

.sea {
  fill: var(--paper);
}
.graticule line {
  stroke: var(--rule);
  stroke-width: 0.6;
}
.graticule text {
  fill: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 9.5px;
}

.polities path {
  fill: var(--paper-3);
  fill-opacity: 0.8;
  stroke: var(--rule-3);
  stroke-width: 0.5;
  vector-effect: non-scaling-stroke;
}
.polities path.lead-0 {
  fill: var(--indigo);
  fill-opacity: 0.22;
}
.polities path.lead-1 {
  fill: var(--indigo);
  fill-opacity: 0.15;
}
.polities path.lead-2 {
  fill: var(--ochre);
  fill-opacity: 0.15;
}
.polities path.lead-3 {
  fill: var(--olive);
  fill-opacity: 0.13;
}
.polities.units path {
  fill: none;
  stroke: var(--rule-3);
}
.polities.units path.lead-0,
.polities.units path.lead-1 {
  fill: var(--indigo);
  fill-opacity: 0.07;
}
.polities.war path,
.polities.records path {
  fill: var(--paper-3);
  fill-opacity: 0.75;
  stroke: var(--rule-3);
}

.wash circle {
  pointer-events: none;
}
.campaigns polyline {
  fill: none;
  stroke: var(--rust);
  stroke-opacity: 0.32;
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.hulls path {
  fill: none;
  stroke: var(--rust);
  stroke-opacity: 0.42;
  stroke-width: 1;
  stroke-dasharray: 3 3;
  vector-effect: non-scaling-stroke;
}
.battle-dots circle {
  fill: var(--rust);
  stroke: var(--paper);
  stroke-width: 1;
}
/* Earlier engagements of a war still in progress: a ring, not a fresh mark. */
.battle-dots circle.old {
  fill: none;
  stroke: var(--rust);
  stroke-opacity: 0.5;
}
.records circle {
  stroke: var(--paper);
  stroke-width: 0.9;
  opacity: 0.86;
}

.plate-labels text,
.war-labels text {
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 600;
  fill: var(--ink);
  paint-order: stroke;
  stroke: var(--paper);
  stroke-width: 3;
  stroke-linejoin: round;
  cursor: pointer;
}
.war-labels text {
  font-size: 12.5px;
  fill: var(--rust);
}

.scale-bar line {
  stroke: var(--ink-3);
  stroke-width: 1;
}
.scale-bar text {
  fill: var(--ink-2);
  font-family: var(--font-mono);
  font-size: 10px;
}

.empty-note {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 12px;
  color: var(--ink-3);
  pointer-events: none;
}

.war-list {
  list-style: none;
  margin: 7px 0 0;
  padding: 0;
}
.war-list li + li {
  margin-top: 1px;
}
.war-list button {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 3px 0;
  font-size: 12.5px;
  color: var(--ink-2);
  border-bottom: 1px dotted var(--rule-2);
  text-align: left;
}
.war-list button:hover {
  color: var(--rust);
}
.war-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.war-count {
  flex: none;
  font-size: 11px;
  color: var(--ink-3);
}
.war-empty,
.plate-note {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--ink-3);
}

/* ── event comparison band ─────────────────────────────────────────────── */

.event-band {
  padding: 9px 22px 12px;
  border-top: 3px double var(--ink-3);
}
.band-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.band-range {
  font-size: 11px;
  color: var(--ink-2);
  letter-spacing: 0.04em;
}
.band-hint {
  font-size: 11px;
  color: var(--ink-3);
}
.band-body {
  display: flex;
  flex-direction: column;
  /* 是一条「带」而不是第二张清单：欧洲十年的条目能排到几十行。 */
  max-height: 216px;
  overflow-y: auto;
  padding-right: 4px;
}
.band-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 74px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  padding: 3px 0;
  border-top: 1px solid var(--rule);
}
.band-row:first-child {
  border-top: 0;
}
.band-row.on {
  background: var(--paper-2);
}
.band-side {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.band-side.a {
  align-items: flex-end;
}
.band-ev {
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font-family: var(--font-sans);
  font-size: 11.5px;
  color: var(--ink-2);
  cursor: pointer;
}
.band-side.a .band-ev {
  flex-direction: row-reverse;
}
.band-ev span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.band-ev:hover span {
  color: var(--rust);
}
.band-ev i {
  flex: none;
  width: 5px;
  height: 5px;
  border-radius: 50%;
}
.band-year {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}
.band-year button {
  border: 0;
  background: none;
  padding: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-3);
  cursor: pointer;
}
.band-year button:hover {
  color: var(--rust);
}
.band-year .tie {
  font-style: normal;
  font-size: 9px;
  line-height: 1.3;
  letter-spacing: 0.08em;
  color: var(--rust);
  border: 1px solid currentColor;
  padding: 0 2px;
}

/* ── rhythm ────────────────────────────────────────────────────────────── */

.rhythm {
  padding: 9px 22px 11px;
  border-top: 1px solid var(--rule);
}
.rhythm-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 5px;
  flex-wrap: wrap;
}
.rhythm-range {
  font-size: 11px;
  color: var(--ink-2);
  letter-spacing: 0.04em;
}
.rhythm-unit {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-4);
}
.rhythm-hint {
  font-size: 11px;
  color: var(--ink-3);
}
.rhythm-row {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 8px;
  align-items: end;
}
.rhythm-row + .rhythm-row {
  margin-top: 3px;
}
.rhythm-tag {
  font-size: 11.5px;
  color: var(--ink-3);
  padding-bottom: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rhythm-bars {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 3px;
  align-items: end;
}
.rhythm-bar {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
  height: 40px;
  padding: 0;
  border-bottom: 1px solid var(--rule-2);
}
.rhythm-bar i {
  display: block;
  width: 100%;
  background: var(--rust);
  opacity: 0.55;
}
.rhythm-bar.on i {
  opacity: 0.95;
}
.rhythm-bar span {
  font-size: 8.5px;
  color: var(--ink-4);
  line-height: 1;
}
.rhythm-bar.on span {
  color: var(--rust);
}

/* ── figures ───────────────────────────────────────────────────────────── */

.figures {
  width: 100%;
  border-top: 2px solid var(--ink-3);
  border-collapse: collapse;
  background: var(--paper-2);
  font-size: 12px;
}
.figures th,
.figures td {
  padding: 6px 12px 7px;
  text-align: left;
  font-weight: 400;
}
.figures thead th {
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-3);
  border-bottom: 1px solid var(--rule-2);
}
.figures tbody th {
  color: var(--ink-3);
  letter-spacing: 0.04em;
}
.figures tbody tr + tr th,
.figures tbody tr + tr td {
  border-top: 1px solid var(--rule);
}
.figures td {
  font-size: 13.5px;
  color: var(--ink);
}
.figures td.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.figures .fig-key {
  width: 34%;
}
.fig-note {
  margin: 0;
  padding: 6px 12px 8px;
  border-top: 1px solid var(--rule);
  background: var(--paper-2);
  font-size: 11px;
  line-height: 1.6;
  color: var(--ink-3);
}

.disclaimer {
  padding: 7px 22px 12px;
  border-top: 1px solid var(--rule);
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--ink-3);
}
.loading {
  padding: 0 22px 12px;
  font-size: 11.5px;
  color: var(--ink-3);
}

@media (max-width: 900px) {
  .spread {
    grid-template-columns: minmax(0, 1fr);
  }
  .plate + .plate {
    border-left: 0;
    border-top: 1px solid var(--rule);
  }
  .layer-hint {
    display: none;
  }
}
</style>
