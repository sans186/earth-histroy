<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CATEGORIES, YEAR_MAX, YEAR_MIN, type CategoryKey } from '@/config';
import {
  battlesInWindow,
  featurePath,
  hullPath,
  makeProjection,
  median,
  sharedScale,
  type AtlasBattle,
  type AtlasProjection,
} from '@/lib/atlas';
import { bboxIntersects } from '@/lib/geo';
import { formatArea, formatYearCompact, formatYearRange } from '@/lib/format';
import { zhPolityName } from '@/lib/names';
import { labelAnchor } from '@/lib/polityScope';
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
}>();

const ui = useUiStore();
const timeline = useTimelineStore();
const layers = useLayersStore();

/* ── plate frame ───────────────────────────────────────────────────────── */

const VIEW_W = 520;
const VIEW_H = 404;
const PAD = 26;

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

const regions = computed(() => [
  findRegion(regionA.value) ?? REGIONS[0],
  findRegion(regionB.value) ?? REGIONS[1],
]);

const regionOptions = computed(() =>
  REGIONS.map((r) => ({ id: r.id, label: regionLabel(r, ui.locale) })),
);

const projections = computed(() => {
  const rects = regions.value.map((r) => r.bbox);
  const k = sharedScale(rects, VIEW_W, VIEW_H, PAD);
  return rects.map((rect) => makeProjection(rect, k, VIEW_W, VIEW_H));
});

const decade = computed(() => Math.floor(timeline.year / 10) * 10);

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

const slices = computed(() => {
  const year = timeline.year;
  return regions.value.map((region) =>
    prepared.value.filter(
      (p) =>
        year >= p.fromYear && year <= p.toYear && bboxIntersects(p.bbox, region.bbox),
    ),
  );
});

/* Paths depend on the projection, not the year: cache per pane so scrubbing
 * the scale does not re-serialise the same geometry every step. */
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

function anchorFor(feature: PolityFeature): [number, number] | null {
  if (anchorCache.has(feature)) return anchorCache.get(feature) ?? null;
  const at = labelAnchor(feature);
  anchorCache.set(feature, at);
  return at;
}

watch(regionA, () => pathCaches[0].clear());
watch(regionB, () => pathCaches[1].clear());

function polityLabel(p: PreparedPolity): string {
  return ui.locale === 'zh' ? (zhPolityName(p.name, props.names) ?? p.name) : p.name;
}

/* ── war records for the decade ────────────────────────────────────────── */

const battles = ref<AtlasBattle[]>([]);
const warLoading = ref(false);
let warLoaded = Number.NaN;
let warPending = Number.NaN;
const warDecadeCache = new Map<number, AtlasBattle[]>();

async function ensureWars() {
  const d = decade.value;
  if (warLoaded === d || warPending === d) return;
  const cached = warDecadeCache.get(d);
  if (cached) {
    battles.value = cached;
    warLoaded = d;
    return;
  }

  warPending = d;
  warLoading.value = true;
  try {
    const index = await loadWarIndex();
    const candidates = index
      .filter((w) => Number.isFinite(w.startYear) && Number.isFinite(w.endYear))
      .filter((w) => (w.startYear as number) <= d + 9 && (w.endYear as number) >= d)
      .sort((a, b) => (b.totalBattles ?? 0) - (a.totalBattles ?? 0))
      .slice(0, 18);

    const profiles = await Promise.all(candidates.map((w) => loadWarProfile(w.warId)));
    const out = profiles.flatMap((p) => battlesInWindow(p, d, d + 9));
    warDecadeCache.set(d, out);
    if (warPending === d) {
      battles.value = out;
      warLoaded = d;
    }
  } catch {
    // A failed profile load leaves the previous decade's marks in place.
  } finally {
    if (warPending === d) {
      warPending = Number.NaN;
      warLoading.value = false;
    }
  }
}

/* ── entries for the decade ────────────────────────────────────────────── */

const decadeEvents = ref<TimelineEvent[]>([]);
const eventLoading = ref(false);
let eventKey = '';
const eventDecadeCache = new Map<string, TimelineEvent[]>();

function inRect(rect: Region['bbox'], lon: number, lat: number) {
  return lon >= rect.west && lon <= rect.east && lat >= rect.south && lat <= rect.north;
}

const paneEvents = computed(() =>
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

const warVisible = computed(() => layer.value === 'all' || layer.value === 'war');
const recordsVisible = computed(() => layer.value === 'all' || layer.value === 'records');

function refreshLayers() {
  if (warVisible.value) void ensureWars();
  if (recordsVisible.value) void ensureEvents();
}

watch([layer, decade, () => ui.locale], refreshLayers, { immediate: true });

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
}

interface WarRow {
  warId: string;
  name: string;
  nameEn: string;
  count: number;
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

interface Pane {
  region: Region;
  shapes: PlateShape[];
  labels: PlateLabel[];
  battleDots: BattleDot[];
  hulls: string[];
  campaigns: string[];
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
    for (const p of ranked.slice(0, 8)) {
      const at = anchorFor(p.feature);
      if (!at) continue;
      const x = proj.x(at[0]);
      const y = proj.y(at[1]);
      if (x < 6 || x > VIEW_W - 6 || y < 12 || y > VIEW_H - 12) continue;
      labels.push({ x, y, text: polityLabel(p), feature: p.feature });
      if (labels.length >= 4) break;
    }

    const regionBattles = warVisible.value
      ? battles.value.filter((b) => inRect(region.bbox, b.lon, b.lat))
      : [];
    const battleDots: BattleDot[] = regionBattles.map((b) => ({
      x: proj.x(b.lon),
      y: proj.y(b.lat),
      year: b.year,
    }));

    const groups = new Map<string, { row: WarRow; list: AtlasBattle[] }>();
    for (const b of regionBattles) {
      const hit = groups.get(b.warId);
      if (hit) {
        hit.list.push(b);
        hit.row.count += 1;
      } else {
        groups.set(b.warId, {
          row: { warId: b.warId, name: b.name, nameEn: b.nameEn, count: 1 },
          list: [b],
        });
      }
    }
    const ordered = [...groups.values()].sort((a, b) => b.row.count - a.row.count);
    const wars = ordered.map((g) => g.row);

    const hulls = ordered
      .filter((g) => g.list.length >= 4)
      .map((g) => hullPath(g.list, proj))
      .filter(Boolean)
      .slice(0, 6);

    const campaigns = ordered
      .filter((g) => g.list.length >= 2)
      .map((g) =>
        [...g.list]
          .sort((a, b) => a.year - b.year)
          .map((b) => `${proj.x(b.lon).toFixed(1)},${proj.y(b.lat).toFixed(1)}`)
          .join(' '),
      )
      .slice(0, 6);

    const warLabels: PlateLabel[] = [];
    for (const g of ordered) {
      if (g.list.length < 2) continue;
      const x = g.list.reduce((sum, b) => sum + proj.x(b.lon), 0) / g.list.length;
      const y = g.list.reduce((sum, b) => sum + proj.y(b.lat), 0) / g.list.length;
      if (x < 18 || x > VIEW_W - 18 || y < 14 || y > VIEW_H - 14) continue;
      warLabels.push({ x, y, text: warName(g.row), warId: g.row.warId });
      if (warLabels.length >= 3) break;
    }

    const records: RecordDot[] = recordsVisible.value
      ? paneEvents.value[i].map((e) => ({
          x: proj.x(e.lon as number),
          y: proj.y(e.lat as number),
          css: eventCss(e),
          year: e.year,
          title: e.title,
        }))
      : [];

    const { lonLines, latLines } = gridFor(proj, region.bbox);
    const headline =
      layer.value === 'war'
        ? `${battleDots.length} ${ui.t('atlas.battles')}`
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
      campaigns,
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

const plateItems = computed(() => [...slices.value[0], ...slices.value[1]]);

const plateBattles = computed(() =>
  battles.value.filter((b) => regions.value.some((r) => inRect(r.bbox, b.lon, b.lat))),
);

const plateRecords = computed(() => [...paneEvents.value[0], ...paneEvents.value[1]]);

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

const figures = computed(() => {
  const items = plateItems.value;
  const areas = items.map((p) => p.area).filter((a) => a > 0);
  const largest = items.reduce<PreparedPolity | null>(
    (best, p) => (p.area > (best?.area ?? 0) ? p : best),
    null,
  );

  if (layer.value === 'war') {
    const years = plateBattles.value.map((b) => b.year);
    const peak = busiest(plateBattles.value);
    return [
      { k: ui.t('atlas.battles'), v: String(plateBattles.value.length) },
      {
        k: ui.t('atlas.wars'),
        v: String(new Set(plateBattles.value.map((b) => b.warId)).size),
      },
      {
        k: ui.t('atlas.warSpan'),
        v: years.length
          ? formatYearRange(Math.min(...years), Math.max(...years), ui.locale)
          : '—',
      },
      {
        k: ui.t('atlas.peakYear'),
        v: peak === null ? '—' : formatYearCompact(peak, ui.locale),
      },
    ];
  }

  if (layer.value === 'records') {
    const events = plateRecords.value;
    const peak = busiest(events);
    return [
      { k: ui.t('atlas.records'), v: String(events.length) },
      {
        k: ui.t('atlas.located'),
        v: `${events.length} / ${decadeEvents.value.length}`,
      },
      { k: ui.t('atlas.peakYear'), v: peak === null ? '—' : formatYearCompact(peak, ui.locale) },
      { k: ui.t('atlas.polities'), v: String(items.length) },
    ];
  }

  if (layer.value === 'units') {
    const parts = items.reduce(
      (sum, p) =>
        sum +
        (p.feature.geometry.type === 'MultiPolygon'
          ? (p.feature.geometry.coordinates as number[][][][]).length
          : 1),
      0,
    );
    return [
      { k: ui.t('atlas.units'), v: String(items.length) },
      { k: ui.t('atlas.parts'), v: String(parts) },
      { k: ui.t('atlas.smallUnits'), v: String(items.filter((p) => p.area < 1_000_000).length) },
      { k: ui.t('atlas.medianArea'), v: formatArea(median(areas), ui.locale) },
    ];
  }

  return [
    { k: ui.t('atlas.polities'), v: String(items.length) },
    {
      k: ui.t('atlas.totalArea'),
      v: formatArea(areas.reduce((sum, a) => sum + a, 0), ui.locale),
    },
    { k: ui.t('atlas.largest'), v: largest ? polityLabel(largest) : '—', name: true },
    { k: ui.t('atlas.medianArea'), v: formatArea(median(areas), ui.locale) },
  ];
});

const rhythm = computed(() => {
  const rows = [0, 1].map((i) => ({
    tag: regionLabel(regions.value[i], ui.locale),
    bars: Array.from({ length: 10 }, (_, step) => {
      const year = decade.value + step;
      return { year, count: paneEvents.value[i].filter((e) => e.year === year).length };
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

onMounted(() => {
  void ensurePolities();
});

onBeforeUnmount(() => {
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
        <span class="lock"><span class="box">=</span>{{ ui.t('atlas.sameScale') }}</span>
        <span class="sep">·</span>
        <span class="note">{{ ui.t('atlas.scaleNote') }}</span>
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
      <span class="layer-hint">{{ ui.t(LAYERS.find((l) => l.id === layer)?.hint ?? 'atlas.layer.all.hint') }}</span>
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
                :key="`wash-${bi}`"
                :cx="dot.x"
                :cy="dot.y"
                :r="index === 0 ? 26 : 26"
                :fill="`url(#atlas-wash-${index})`"
              />
            </g>

            <g v-if="warVisible" class="campaigns">
              <polyline v-for="(line, ci) in pane.campaigns" :key="`campaign-${ci}`" :points="line" />
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
                :r="2.1"
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
          </svg>

          <p v-if="pane.empty" class="empty-note">{{ ui.t('atlas.noPolity') }}</p>
        </div>

        <ul v-if="warVisible" class="war-list">
          <li v-if="!pane.wars.length" class="war-empty">{{ ui.t('atlas.noWar') }}</li>
          <li v-for="row in pane.wars.slice(0, 4)" :key="row.warId">
            <button @click="pickWar(row.warId)">
              <span class="war-name">{{ warName(row) }}</span>
              <span class="war-count mono">{{ ui.tf('atlas.battleCount', { n: row.count }) }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="plate-note">{{ ui.t('atlas.clickPolity') }}</p>
      </figure>
    </div>

    <div v-if="recordsVisible" class="rhythm">
      <div class="rhythm-head">
        <span class="cap">{{ ui.t('atlas.rhythm') }}</span>
        <span class="rhythm-hint">{{ ui.t('atlas.rhythmHint') }}</span>
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

    <div class="figures">
      <div v-for="(figure, fi) in figures" :key="fi" class="fig">
        <span class="k">{{ figure.k }}</span>
        <span class="v mono" :class="{ name: 'name' in figure && figure.name }">{{ figure.v }}</span>
      </div>
    </div>

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
  padding: 10px 0 10px 16px;
  font-size: 11.5px;
  color: var(--ink-3);
  white-space: nowrap;
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

/* ── rhythm ────────────────────────────────────────────────────────────── */

.rhythm {
  padding: 9px 22px 11px;
  border-top: 1px solid var(--rule);
}
.rhythm-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 5px;
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
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 2px solid var(--ink-3);
  background: var(--paper-2);
}
.fig {
  padding: 7px 12px 8px;
  border-right: 1px solid var(--rule);
  min-width: 0;
}
.fig:last-child {
  border-right: 0;
}
.fig .k {
  display: block;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-4);
}
.fig .v {
  display: block;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fig .v.name {
  font-family: var(--font-sans);
  font-size: 13.5px;
  font-weight: 600;
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
