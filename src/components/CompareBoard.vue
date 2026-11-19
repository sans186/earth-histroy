<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CATEGORIES, YEAR_WINDOW } from '@/config';
import {
  dedupeRestatements,
  subjectEvents,
  subjectLabel,
  subjectSpan,
  type CompareSubject,
} from '@/lib/compare';
import { formatYearRange, truncate } from '@/lib/format';
import { REGIONS, findRegion, regionDistanceKm, regionLabel } from '@/lib/regions';
import { loadEventWindow } from '@/services/data';
import { useLayersStore } from '@/stores/layers';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';
import type { TimelineEvent } from '@/types';

const props = defineProps<{
  events: TimelineEvent[];
  subjectA: CompareSubject;
  subjectB: CompareSubject;
  /** English → Chinese polity names, so a column header is not stuck in English. */
  names?: Record<string, string>;
}>();

const emit = defineEmits<{
  'update:subjectA': [CompareSubject];
  'update:subjectB': [CompareSubject];
  select: [TimelineEvent];
}>();

const ui = useUiStore();
const timeline = useTimelineStore();
const layers = useLayersStore();

type CategoryKey = keyof typeof CATEGORIES;

/**
 * The comparison used to read whatever twenty-year window the globe had loaded,
 * which made "compare these two polities" mean "compare them in this one year".
 * The range below is explicit: it starts as that same window (so nothing extra
 * is fetched) and grows only when the reader asks for more.
 */
const MAX_RANGE = 300;
const rangeFrom = ref(timeline.year - YEAR_WINDOW);
const rangeTo = ref(timeline.year + YEAR_WINDOW);
const tooWide = ref(false);
const loading = ref(false);
/** Raw events for a widened range; null means "the globe's own window is enough". */
const rangePool = ref<TimelineEvent[] | null>(null);

let rangeAbort: AbortController | null = null;
let rangeTimer: ReturnType<typeof setTimeout> | undefined;

const pool = computed(() =>
  rangePool.value
    ? rangePool.value.filter((e) => layers.isActive(e.category))
    : props.events,
);

const ranged = computed(() => {
  const a = Math.min(rangeFrom.value, rangeTo.value);
  const b = Math.max(rangeFrom.value, rangeTo.value);
  return pool.value.filter((e) => e.year >= a && e.year <= b);
});

interface ColumnStats {
  subject: CompareSubject;
  label: string;
  /** A polity knows its own dates; a region does not. */
  span: string | null;
  events: TimelineEvent[];
  groups: { year: number; events: TimelineEvent[] }[];
  military: number;
  political: number;
  economic: number;
  cultural: number;
  figures: number;
}

function groupByYear(list: TimelineEvent[]) {
  const map = new Map<number, TimelineEvent[]>();
  for (const e of list) {
    const bucket = map.get(e.year);
    if (bucket) bucket.push(e);
    else map.set(e.year, [e]);
  }
  return [...map.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([year, events]) => ({ year, events }));
}

function statsFor(subject: CompareSubject): ColumnStats {
  const events = dedupeRestatements(
    subjectEvents(ranged.value, subject).sort((a, b) => a.year - b.year),
  );
  const figures = new Set<string>();
  for (const e of events) for (const f of e.figures) figures.add(f);
  const count = (c: CategoryKey) => events.filter((e) => e.category === c).length;
  return {
    subject,
    label: subjectLabel(subject, ui.locale, props.names),
    span: subjectSpan(subject, ui.locale),
    events,
    groups: groupByYear(events),
    military: count('military'),
    political: count('political'),
    economic: count('economic'),
    cultural: count('cultural'),
    figures: figures.size,
  };
}

const a = computed(() => statsFor(props.subjectA));
const b = computed(() => statsFor(props.subjectB));

/** Years where both columns have something: the actual point of a comparison. */
const tiedYears = computed(() => {
  const yearsA = new Set(a.value.events.map((e) => e.year));
  return new Set(b.value.events.filter((e) => yearsA.has(e.year)).map((e) => e.year));
});

const spanLabel = computed(() => {
  const from = Math.min(rangeFrom.value, rangeTo.value);
  const to = Math.max(rangeFrom.value, rangeTo.value);
  return { from, to, width: to - from };
});

/** Only meaningful when both columns are regions with a known centre. */
const distance = computed(() => {
  if (props.subjectA.kind !== 'region' || props.subjectB.kind !== 'region') return null;
  const ra = findRegion(props.subjectA.id);
  const rb = findRegion(props.subjectB.id);
  if (!ra || !rb) return null;
  return regionDistanceKm(ra, rb);
});

const available = computed(() =>
  REGIONS.map((r) => ({ id: r.id, label: regionLabel(r, ui.locale) })),
);

const totals = computed(() => ({
  all: a.value.events.length + b.value.events.length,
  military: a.value.military + b.value.military,
  political: a.value.political + b.value.political,
  economic: a.value.economic + b.value.economic,
  cultural: a.value.cultural + b.value.cultural,
}));

function setRegion(side: 'A' | 'B', id: string) {
  if (!id) return;
  const subject: CompareSubject = { kind: 'region', id };
  if (side === 'A') emit('update:subjectA', subject);
  else emit('update:subjectB', subject);
}

/** Drop back to a region column, the state a polity column starts from. */
function clearToRegion(side: 'A' | 'B') {
  setRegion(side, side === 'A' ? 'eastAsia' : 'mediterranean');
}

function swap() {
  emit('update:subjectA', props.subjectB);
  emit('update:subjectB', props.subjectA);
}

function catOf(ev: TimelineEvent) {
  const meta = CATEGORIES[ev.category as CategoryKey];
  return `var(${meta ? meta.cssVar : '--ink-3'})`;
}

function catLabel(ev: TimelineEvent) {
  const meta = CATEGORIES[ev.category as CategoryKey];
  return meta ? (ui.locale === 'zh' ? meta.zh : meta.en) : ev.category;
}

function barWidth(value: number, max: number) {
  return `${Math.min(100, Math.round((value / Math.max(1, max)) * 100))}%`;
}

/**
 * Fetch the widened range.
 *
 * `loadEventWindow` takes a centre and a half-width, so the request is the
 * smallest window that still contains [from, to]; anything it returns outside
 * the requested range is filtered out afterwards.
 */
async function syncRange() {
  // `v-model.number` yields an empty string while a field is being cleared.
  const rawFrom = Number(rangeFrom.value);
  const rawTo = Number(rangeTo.value);
  if (!Number.isFinite(rawFrom) || !Number.isFinite(rawTo)) return;
  const from = Math.min(rawFrom, rawTo);
  const to = Math.max(rawFrom, rawTo);
  if (to - from < 1) return;

  tooWide.value = to - from > MAX_RANGE;
  if (tooWide.value) return;

  // The globe already holds this window, so the comparison can start instantly.
  if (from >= timeline.year - YEAR_WINDOW && to <= timeline.year + YEAR_WINDOW) {
    rangeAbort?.abort();
    rangeAbort = null;
    rangePool.value = null;
    loading.value = false;
    return;
  }

  rangeAbort?.abort();
  const controller = new AbortController();
  rangeAbort = controller;
  loading.value = true;

  try {
    const half = Math.ceil((to - from) / 2);
    const centre = Math.round((from + to) / 2);
    const result = await loadEventWindow(centre, ui.locale, half, controller.signal);
    if (controller.signal.aborted) return;
    rangePool.value = result.events;
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return;
    rangePool.value = [];
  } finally {
    if (!controller.signal.aborted) loading.value = false;
  }
}

function scheduleRange() {
  if (rangeTimer) clearTimeout(rangeTimer);
  rangeTimer = setTimeout(() => void syncRange(), 420);
}

watch([rangeFrom, rangeTo], scheduleRange);
// A locale switch changes descriptions, so the widened pool has to be re-read.
watch(() => ui.locale, scheduleRange);
// The watchers only fire on edits; a range that already sits outside the
// globe's window on first paint has to be fetched here.
onMounted(() => void syncRange());
onBeforeUnmount(() => {
  if (rangeTimer) clearTimeout(rangeTimer);
  rangeAbort?.abort();
});
</script>

<template>
  <section class="board">
    <!-- Broadsheet masthead: one headline, one dateline, everything else below. -->
    <header class="masthead">
      <div class="mast-top">
        <span class="kicker">
          {{ ui.t('head.folio') }} {{ timeline.year }} ·
          {{ ui.locale === 'zh' ? timeline.era.name : timeline.era.nameEn }}
        </span>
        <span class="edition">{{ ui.t('compare.edition') }}</span>
      </div>
      <h1 class="serif">{{ ui.t('compare.headline') }}</h1>
      <p class="standfirst">{{ ui.t('compare.standfirst') }}</p>

      <div class="dateline">
        <label class="range">
          <span>{{ ui.t('compare.range') }}</span>
          <input v-model.number="rangeFrom" class="mono" inputmode="numeric" />
          <i>—</i>
          <input v-model.number="rangeTo" class="mono" inputmode="numeric" />
        </label>
        <span class="sep">·</span>

        <template v-if="props.subjectA.kind === 'polity'">
          <span class="chip" :title="a.label">{{ a.label }}</span>
          <button class="mini" :title="ui.t('compare.clear')" @click="clearToRegion('A')">✕</button>
        </template>
        <select
          v-else
          :value="props.subjectA.id"
          @change="setRegion('A', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="r in available" :key="r.id" :value="r.id">{{ r.label }}</option>
        </select>

        <button class="mini" :title="ui.t('compare.swap')" @click="swap">⟷</button>

        <template v-if="props.subjectB.kind === 'polity'">
          <span class="chip" :title="b.label">{{ b.label }}</span>
          <button class="mini" :title="ui.t('compare.clear')" @click="clearToRegion('B')">✕</button>
        </template>
        <select
          v-else
          :value="props.subjectB.id"
          @change="setRegion('B', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="r in available" :key="r.id" :value="r.id">{{ r.label }}</option>
        </select>

        <span v-if="distance" class="aside mono">{{ distance.toLocaleString() }} km</span>
        <span class="lock"><i class="box" aria-hidden="true">✓</i>{{ ui.t('compare.lock') }}</span>
      </div>

      <p v-if="tooWide" class="warn">{{ ui.t('compare.tooWide') }}</p>
      <p v-else-if="loading" class="warn loading">{{ ui.t('compare.loading') }}</p>
    </header>

    <div class="spread">
      <section class="col">
        <div class="colhead">
          <span class="side">A</span>
          <h2 class="serif">{{ a.label }}</h2>
          <p class="meta">
            <template v-if="a.span">{{ a.span }} · </template>
            {{ a.events.length }} {{ ui.t('compare.entries') }}
          </p>
        </div>

        <div v-for="group in a.groups" :key="`a-${group.year}`" class="yeargroup">
          <div class="yr">
            <span class="mono">{{ group.year }}</span>
            <i v-if="tiedYears.has(group.year)" class="tie">{{ ui.t('compare.sameYear') }}</i>
          </div>
          <article v-for="ev in group.events" :key="ev.key" class="entry" @click="emit('select', ev)">
            <h3 class="serif">{{ ev.title }}</h3>
            <p v-if="ev.description" class="lead">{{ truncate(ev.description, 96) }}</p>
            <div class="foot">
              <span class="cat"><i :style="{ background: catOf(ev) }" />{{ catLabel(ev) }}</span>
              <span class="reg">{{ ev.region }}</span>
            </div>
          </article>
        </div>

        <p v-if="!a.events.length" class="none">{{ ui.t('compare.emptyRange') }}</p>
      </section>

      <div class="gutter" />

      <section class="col">
        <div class="colhead">
          <span class="side">B</span>
          <h2 class="serif">{{ b.label }}</h2>
          <p class="meta">
            <template v-if="b.span">{{ b.span }} · </template>
            {{ b.events.length }} {{ ui.t('compare.entries') }}
          </p>
        </div>

        <div v-for="group in b.groups" :key="`b-${group.year}`" class="yeargroup">
          <div class="yr">
            <span class="mono">{{ group.year }}</span>
            <i v-if="tiedYears.has(group.year)" class="tie">{{ ui.t('compare.sameYear') }}</i>
          </div>
          <article v-for="ev in group.events" :key="ev.key" class="entry" @click="emit('select', ev)">
            <h3 class="serif">{{ ev.title }}</h3>
            <p v-if="ev.description" class="lead">{{ truncate(ev.description, 96) }}</p>
            <div class="foot">
              <span class="cat"><i :style="{ background: catOf(ev) }" />{{ catLabel(ev) }}</span>
              <span class="reg">{{ ev.region }}</span>
            </div>
          </article>
        </div>

        <p v-if="!b.events.length" class="none">{{ ui.t('compare.emptyRange') }}</p>
      </section>
    </div>

    <footer class="figures">
      <div class="fig">
        <span class="k">{{ ui.t('compare.total') }}</span>
        <span class="v">{{ totals.all }}<small>{{ ui.t('compare.entries') }}</small></span>
        <div class="pair">
          <span><i class="sw a" />{{ a.label }} {{ a.events.length }}</span>
          <span><i class="sw b" />{{ b.label }} {{ b.events.length }}</span>
        </div>
      </div>
      <div class="fig">
        <span class="k">{{ ui.t('compare.tieYears') }}</span>
        <span class="v">{{ tiedYears.size }}<small>{{ ui.t('compare.years') }}</small></span>
        <div class="pair">
          <span>{{ ui.t('compare.pointOfIt') }}</span>
        </div>
      </div>
      <div class="fig">
        <span class="k">{{ ui.t('compare.politicsMilitary') }}</span>
        <span class="v">{{ totals.political }} / {{ totals.military }}</span>
        <div class="bars">
          <span class="track"><i :style="{ width: barWidth(totals.political, Math.max(totals.political, totals.military)), background: 'var(--indigo)' }" /></span>
          <span class="track"><i :style="{ width: barWidth(totals.military, Math.max(totals.political, totals.military)), background: 'var(--rust)' }" /></span>
        </div>
      </div>
      <div class="fig">
        <span class="k">{{ ui.t('compare.economyCulture') }}</span>
        <span class="v">{{ totals.economic }} / {{ totals.cultural }}</span>
        <div class="bars">
          <span class="track"><i :style="{ width: barWidth(totals.economic, Math.max(totals.economic, totals.cultural)), background: 'var(--olive)' }" /></span>
          <span class="track"><i :style="{ width: barWidth(totals.cultural, Math.max(totals.economic, totals.cultural)), background: 'var(--ochre)' }" /></span>
        </div>
      </div>
      <div class="fig">
        <span class="k">{{ ui.t('compare.span') }}</span>
        <span class="v">{{ spanLabel.width }}<small>{{ ui.t('compare.years') }}</small></span>
        <div class="pair mono">{{ formatYearRange(spanLabel.from, spanLabel.to, ui.locale) }}</div>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--paper);
}

/* ── masthead ──────────────────────────────────────────────────────────── */
.masthead {
  padding: 16px 22px 12px;
  border-bottom: 3px double var(--ink-3);
  background: var(--paper);
}
.mast-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
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
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px solid var(--rule);
  font-size: 12.5px;
  color: var(--ink-2);
}
.range {
  display: flex;
  align-items: center;
  gap: 6px;
}
.range i {
  font-style: normal;
  color: var(--ink-4);
}
.range input {
  width: 64px;
  padding: 3px 5px;
  border: 1px solid var(--rule-2);
  background: var(--card);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 12.5px;
  text-align: center;
}
.sep {
  color: var(--ink-4);
}
select {
  border: 1px solid var(--rule-2);
  background: var(--card);
  font-family: var(--font-display);
  font-size: 13px;
  padding: 3px 6px;
  color: var(--ink);
  max-width: 150px;
}
/* A polity column narrows the whole point of the picker, so it gets a chip
   rather than a select that would silently drop the polity. */
.chip {
  border: 1px solid var(--rule-2);
  background: var(--card);
  font-family: var(--font-display);
  font-size: 13px;
  padding: 3px 7px;
  color: var(--ink);
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini {
  border: 1px solid var(--rule-2);
  width: 24px;
  height: 24px;
  color: var(--ink-3);
  background: var(--card);
  line-height: 1;
}
.mini:hover {
  color: var(--rust);
}
.aside {
  color: var(--ink-3);
  font-size: 11.5px;
}
.lock {
  margin-left: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--ink-3);
}
.lock .box {
  width: 12px;
  height: 12px;
  border: 1px solid var(--rule-3);
  display: grid;
  place-items: center;
  font-size: 10px;
  font-style: normal;
  color: var(--rust);
}
.warn {
  margin: 7px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--rust);
}
.warn.loading {
  color: var(--ink-3);
}

/* ── spread ────────────────────────────────────────────────────────────── */
.spread {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1px 1fr;
  overflow: hidden;
}
.gutter {
  background: var(--rule-2);
}
.col {
  min-height: 0;
  overflow-y: auto;
  padding: 0 20px 18px;
}
.colhead {
  padding: 14px 0 8px;
  border-bottom: 1px solid var(--ink-3);
  position: sticky;
  top: 0;
  background: var(--paper);
  z-index: 2;
}
.colhead .side {
  font-size: 10.5px;
  letter-spacing: 0.2em;
  color: var(--ink-4);
}
.colhead h2 {
  margin: 1px 0 2px;
  font-size: 25px;
  font-weight: 600;
  line-height: 1.2;
}
.colhead .meta {
  margin: 0;
  font-size: 12px;
  color: var(--ink-3);
}

.yeargroup {
  margin-top: 12px;
}
.yr {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  letter-spacing: 0.14em;
  color: var(--ink-3);
}
.yr::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--rule);
}
.yr .tie {
  font-style: normal;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--ochre);
  border: 1px solid color-mix(in srgb, var(--ochre) 45%, transparent);
  padding: 0 4px;
}

.entry {
  padding: 9px 0 10px;
  border-bottom: 1px dotted var(--rule);
  cursor: pointer;
}
.entry:hover h3 {
  color: var(--accent);
}
.entry h3 {
  margin: 0;
  font-size: 17px;
  line-height: 1.35;
  font-weight: 600;
}
.lead {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.68;
  color: var(--ink-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.foot {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--ink-3);
}
.foot .cat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.foot .cat i {
  width: 7px;
  height: 7px;
}
.none {
  margin: 18px 0;
  font-size: 13px;
  color: var(--ink-3);
}

/* ── figures ───────────────────────────────────────────────────────────── */
.figures {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  border-top: 2px solid var(--ink-3);
  background: var(--paper-2);
}
.fig {
  padding: 9px 14px 10px;
  border-right: 1px solid var(--rule);
  min-width: 0;
}
.fig:last-child {
  border-right: none;
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
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: 19px;
  font-weight: 600;
  color: var(--ink);
}
.fig .v small {
  font-size: 10.5px;
  font-weight: 400;
  color: var(--ink-3);
  margin-left: 3px;
}
.pair {
  display: flex;
  gap: 10px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--ink-3);
  flex-wrap: wrap;
}
.pair .sw {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 4px;
}
.pair .sw.a {
  background: var(--indigo);
}
.pair .sw.b {
  background: var(--rust);
}
.bars {
  margin-top: 5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.bars .track {
  height: 3px;
  background: var(--paper-3);
  position: relative;
  display: block;
}
.bars .track i {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  display: block;
}
</style>
