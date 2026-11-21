<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { formatYearCompact, truncate } from '@/lib/format';
import { buildLanes, ticksBetween } from '@/lib/trajectory';
import { loadPersonProfile } from '@/services/data';
import { globe } from '@/services/globe';
import { map2d } from '@/services/map2d';
import { usePeopleStore } from '@/stores/people';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';
import type { PersonIndexItem, PersonPoint, PersonProfile } from '@/types';

const emit = defineEmits<{ close: [] }>();

const ui = useUiStore();
const people = usePeopleStore();
const timeline = useTimelineStore();

/** Primary comes from the open card; comparisons are loaded on demand. */
const primary = computed(() => people.profile);
/** The map paints the same list, so it lives in the store, not here. */
const compare = computed(() => people.trailCompare);
const allPeople = computed<PersonProfile[]>(() => {
  const p = primary.value;
  return p ? [p, ...compare.value] : [];
});

const axisMode = ref<'auto' | 'year' | 'age'>('auto');

/** Same three colours the main-map trail uses, per person. */
const COLORS = ['var(--rust)', 'var(--indigo)', 'var(--teal)'] as const;

function displayName(person: PersonProfile): string {
  return ui.locale === 'zh' ? person.name : person.nameEn || person.name;
}

function lifespanOf(person: PersonProfile | null): string {
  if (!person) return '';
  const born =
    person.birth === null ? ui.t('people.unknown') : formatYearCompact(person.birth, ui.locale);
  if (person.death === null) return `${born} –`;
  return `${born} – ${formatYearCompact(person.death, ui.locale)}`;
}

function placeOf(point: PersonPoint): string {
  const value = ui.locale === 'zh' ? point.place : point.placeEn || point.place;
  return value || ui.t('trail.unknownPlace');
}

function titleOf(point: PersonPoint): string {
  return ui.locale === 'zh' ? point.title : point.titleEn || point.title;
}

function textOf(point: PersonPoint): string {
  return ui.locale === 'zh' ? point.description : point.descriptionEn || point.description;
}

function rangeLabel(from: number, to: number): string {
  const a = formatYearCompact(from, ui.locale);
  if (to === from) return a;
  return `${a} – ${formatYearCompact(to, ui.locale)}`;
}

/* ── Tooltip ────────────────────────────────────────────────────────────── */

const sheetRef = ref<HTMLElement | null>(null);

interface TipState {
  left: number;
  top: number;
  color: string;
  person: string;
  place: string;
  years: string;
  stay: string;
  title: string;
  text: string;
}

const tip = ref<TipState | null>(null);
const tipRef = ref<HTMLElement | null>(null);
/** A clicked stop keeps its card open until the reader clicks elsewhere. */
const pinned = ref(false);
let tipAnchor = { x: 0, y: 0 };

function positionTip(event: MouseEvent): { left: number; top: number } {
  tipAnchor = { x: event.clientX, y: event.clientY };
  return { left: tipAnchor.x + 16, top: tipAnchor.y + 16 };
}

/**
 * Keep the card on screen once its real size is known.
 *
 * The height depends on how long the biography is, so measuring after render
 * is the only way to stop the last lines from falling off the viewport. The
 * card floats above the drawer rather than inside it, so a long account can
 * use the empty map area instead of being clipped to the sheet.
 */
async function clampTip() {
  await nextTick();
  const element = tipRef.value;
  if (!element) return;
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  let left = tipAnchor.x + 16;
  /*
   * A long account is nearly as tall as the drawer itself. Below the cursor it
   * would bury the lifeline it describes, so tall cards open upwards over the
   * map; short ones stay next to the pointer.
   */
  const above = height > 150;
  const sheetTop = sheetRef.value?.getBoundingClientRect().top ?? window.innerHeight;
  // Tops out above the drawer, so the lifeline stays readable while reading.
  let top = above
    ? Math.min(tipAnchor.y - 16 - height, sheetTop - 10 - height)
    : tipAnchor.y + 16;
  if (left + width > window.innerWidth - 12) left = tipAnchor.x - 16 - width;
  if (top + height > window.innerHeight - 12) top = window.innerHeight - 12 - height;
  if (top < 12) top = Math.min(tipAnchor.y + 16, window.innerHeight - 12 - height);
  element.style.left = `${Math.max(12, left)}px`;
  element.style.top = `${Math.max(12, top)}px`;
}

function showTip(
  event: MouseEvent,
  person: PersonProfile,
  point: PersonPoint,
  color: string,
  pin = false,
) {
  if (pinned.value && !pin) return;
  pinned.value = pin;
  const end = point.yearEnd === null || point.yearEnd === undefined ? point.year : point.yearEnd;
  const span = Math.max(0, end - point.year);
  const at = positionTip(event);
  tip.value = {
    ...at,
    color,
    person: displayName(person),
    place: placeOf(point),
    years: rangeLabel(point.year, end),
    stay: span > 0 ? ui.tf('trail.stay', { n: span }) : '',
    title: titleOf(point),
    text: textOf(point),
  };
  void clampTip();
}

function hideTip() {
  if (pinned.value) return;
  tip.value = null;
}

function unpin() {
  pinned.value = false;
  tip.value = null;
}

/* ── Comparison ─────────────────────────────────────────────────────────── */

const query = ref('');
/** The search box only appears after clicking the compare button. */
const adding = ref(false);
const queryInput = ref<HTMLInputElement | null>(null);

async function openAdder() {
  adding.value = true;
  await nextTick();
  queryInput.value?.focus();
}

function closeAdder() {
  adding.value = false;
  query.value = '';
}

const suggestions = computed<PersonIndexItem[]>(() => {
  const needle = query.value.trim().toLowerCase();
  if (!needle) return [];
  const taken = new Set(allPeople.value.map((p) => p.personId));
  return people.index
    .filter((p) => !taken.has(p.personId))
    .filter(
      (p) =>
        p.name.toLowerCase().includes(needle) || p.nameEn.toLowerCase().includes(needle),
    )
    .slice(0, 8);
});

function indexBirth(item: PersonIndexItem): string {
  return item.birth === null ? ui.t('people.unknown') : formatYearCompact(item.birth, ui.locale);
}

async function addCompare(item: PersonIndexItem) {
  closeAdder();
  if (compare.value.some((p) => p.personId === item.personId)) return;
  const profile = await loadPersonProfile(item.personId);
  if (!profile) return;
  people.addTrailCompare(profile);
}

function removeCompare(personId: string) {
  people.removeTrailCompare(personId);
}

// A different primary person starts a fresh comparison (the store drops it).
watch(
  () => primary.value?.personId,
  () => {
    closeAdder();
    unpin();
  },
);

// Changing the axis invalidates a pinned card.
watch(axisMode, () => unpin());

// The card that opened the overlay has been dismissed underneath it.
watch(
  () => people.selectedId,
  (id) => {
    if (!id) emit('close');
  },
);

/* ── Map bridge ─────────────────────────────────────────────────────────── */

/** One flat, dated list per person, in the same colour the map paints them. */
const listGroups = computed(() =>
  allPeople.value.map((person, index) => ({
    id: person.personId,
    name: displayName(person),
    color: COLORS[index % COLORS.length],
    points: [...person.points].sort((a, b) => a.year - b.year),
  })),
);

/**
 * Drive the shared timeline, then put the main map on the recorded place.
 *
 * The trail on the map is drawn from `timeline.year`, so moving the cursor is
 * all that is needed to redraw the route; the camera move just frames the stop.
 */
function focusPoint(point: PersonPoint) {
  timeline.setYear(point.year);
  if (!point.coords) return;
  const [lon, lat] = point.coords;
  if (ui.stage === '3d') void globe.flyTo(lon, lat, 900_000);
  else void map2d.flyTo(lon, lat, 5);
}

/* ── Lifeline ───────────────────────────────────────────────────────────── */

const LANE_H = 26;
const BLOCK_HEAD = 46;
const BLOCK_GAP = 20;
const PLOT_LEFT = 142;
const PLOT_RIGHT = 22;
const AXIS_H = 34;

const lifeHost = ref<HTMLElement | null>(null);
const lifeWidth = ref(760);
let resizeObserver: ResizeObserver | null = null;

interface LifeStop {
  index: number;
  point: PersonPoint;
  x1: number;
  x2: number;
  cx: number;
  cy: number;
}

interface LifeLane {
  key: string;
  label: string;
  short: string;
  row: number;
}

interface LifeBlock {
  id: string;
  profile: PersonProfile;
  color: string;
  name: string;
  span: string;
  count: string;
  top: number;
  height: number;
  laneTop: number;
  lanes: LifeLane[];
  stops: LifeStop[];
  line: string;
}

interface LifeLayout {
  mode: 'year' | 'age';
  width: number;
  totalH: number;
  plotL: number;
  plotR: number;
  from: number;
  to: number;
  ticks: number[];
  people: LifeBlock[];
}

/** Age is measured from birth, falling back to the first recorded year. */
function anchorYear(person: PersonProfile): number {
  if (person.birth !== null) return person.birth;
  if (!person.points.length) return 0;
  return Math.min(...person.points.map((point) => point.year));
}

const birthGap = computed(() => {
  const list = allPeople.value;
  if (list.length < 2) return 0;
  const anchors = list.map(anchorYear);
  return Math.max(...anchors) - Math.min(...anchors);
});

const effectiveMode = computed<'year' | 'age'>(() => {
  if (axisMode.value === 'year') return 'year';
  if (axisMode.value === 'age') return 'age';
  return birthGap.value > 100 ? 'age' : 'year';
});

const autoAge = computed(() => axisMode.value === 'auto' && effectiveMode.value === 'age');

const life = computed<LifeLayout | null>(() => {
  const list = allPeople.value.filter((person) => person.points.length > 0);
  if (!list.length) return null;

  const width = Math.max(560, lifeWidth.value);
  const plotL = PLOT_LEFT;
  const plotR = Math.max(plotL + 90, width - PLOT_RIGHT);
  const plotW = plotR - plotL;
  const mode = effectiveMode.value;

  const bases = new Map<string, number>();
  for (const person of list) bases.set(person.personId, anchorYear(person));

  let d0 = Infinity;
  let d1 = -Infinity;
  for (const person of list) {
    const base = bases.get(person.personId) ?? 0;
    for (const point of person.points) {
      const end = point.yearEnd === null || point.yearEnd === undefined ? point.year : point.yearEnd;
      const from = mode === 'age' ? point.year - base : point.year;
      const to = mode === 'age' ? end - base : end;
      d0 = Math.min(d0, from, to);
      d1 = Math.max(d1, from, to);
    }
  }
  if (!Number.isFinite(d0) || !Number.isFinite(d1)) return null;

  if (d1 - d0 < 2) d1 = d0 + 2;
  const pad = (d1 - d0) * 0.02;
  d0 = mode === 'age' ? Math.max(0, d0 - pad) : d0 - pad;
  d1 += pad;

  const xFor = (value: number) =>
    plotL + ((value - d0) / (d1 - d0)) * plotW;

  const ticks = ticksBetween(d0, d1, Math.max(4, Math.floor(plotW / 90)));

  let cursor = AXIS_H + 12;
  const peopleBlocks: LifeBlock[] = list.map((person, index) => {
    const color = COLORS[index % COLORS.length];
    const base = bases.get(person.personId) ?? 0;
    const lanes = buildLanes(person.points);
    const laneTop = cursor + BLOCK_HEAD;

    const stops: LifeStop[] = [];
    lanes.forEach((lane, row) => {
      for (const stop of lane.stops) {
        const from = mode === 'age' ? stop.year - base : stop.year;
        const to = mode === 'age' ? stop.yearEnd - base : stop.yearEnd;
        const x1 = Math.max(plotL, xFor(from));
        const x2 = Math.max(x1 + 4, xFor(Math.max(from, to)));
        const cy = laneTop + row * LANE_H + LANE_H / 2;
        stops.push({
          index: stop.index,
          point: stop.point,
          x1,
          x2,
          cx: (x1 + x2) / 2,
          cy,
        });
      }
    });
    stops.sort((a, b) => a.point.year - b.point.year || a.index - b.index);

    const height = BLOCK_HEAD + lanes.length * LANE_H + 12;
    const block: LifeBlock = {
      id: person.personId,
      profile: person,
      color,
      name: displayName(person),
      span: lifespanOf(person),
      count: ui.tf('trail.points', { n: person.points.length }),
      top: cursor,
      height,
      laneTop,
      lanes: lanes.map((lane, row) => ({
        key: lane.key,
        label: lane.label || lane.labelEn || ui.t('trail.unknownPlace'),
        short: truncate(lane.label || lane.labelEn || ui.t('trail.unknownPlace'), 10),
        row,
      })),
      stops,
      line: stops.map((stop) => `${(stop.x1 + 1).toFixed(1)},${stop.cy}`).join(' '),
    };
    cursor += height + BLOCK_GAP;
    return block;
  });

  return {
    mode,
    width,
    totalH: cursor + 6,
    plotL,
    plotR,
    from: d0,
    to: d1,
    ticks,
    people: peopleBlocks,
  };
});

/** Value on the shared axis -> pixel. One source for ticks and grid lines. */
function plotX(value: number): number {
  const layout = life.value;
  if (!layout) return 0;
  const span = layout.to - layout.from;
  if (span === 0) return layout.plotL;
  return layout.plotL + ((value - layout.from) / span) * (layout.plotR - layout.plotL);
}

function tickLabel(value: number): string {
  if (life.value?.mode === 'age') return String(Math.round(value));
  return formatYearCompact(Math.round(value), ui.locale);
}

function showLifeTip(event: MouseEvent, block: LifeBlock, stop: LifeStop, pin = false) {
  showTip(event, block.profile, stop.point, block.color, pin);
}

/** A click fixes the account card in place and walks the map to that year. */
function selectStop(event: MouseEvent, block: LifeBlock, stop: LifeStop) {
  showLifeTip(event, block, stop, true);
  focusPoint(stop.point);
}

/** Where the shared timeline year lands inside one person's block. */
function cursorX(block: LifeBlock): number | null {
  const layout = life.value;
  if (!layout) return null;
  const base = layout.mode === 'age' ? anchorYear(block.profile) : 0;
  const x = plotX(timeline.year - base);
  if (x < layout.plotL - 1 || x > layout.plotR + 1) return null;
  return x;
}

/* ── Lifecycle ──────────────────────────────────────────────────────────── */

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => {
  void people.ensureIndex();
  window.addEventListener('keydown', onKey);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  resizeObserver?.disconnect();
  resizeObserver = null;
});

// The lifeline is only in the DOM while its tab is active.
watch(
  lifeHost,
  (element) => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (!element) return;
    lifeWidth.value = Math.max(560, Math.round(element.clientWidth));
    resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) lifeWidth.value = Math.max(560, Math.round(width));
    });
    resizeObserver.observe(element);
  },
  { flush: 'post' },
);
</script>

<template>
  <div
    class="scrim"
    role="dialog"
    aria-modal="true"
    :aria-label="ui.t('trail.title')"
    @click.self="emit('close')"
  >
    <article ref="sheetRef" class="sheet">
      <header class="head">
        <div class="who">
          <span class="cap">{{ ui.t('trail.subtitle') }}</span>
          <h2 class="serif">{{ primary ? displayName(primary) : ui.t('trail.title') }}</h2>
          <p class="lead">
            <span class="mono">{{ lifespanOf(primary) }}</span>
            <template v-if="primary">
              <span class="sep">·</span>
              <!-- The heading names one person, so the count must be theirs. -->
              <span>{{ ui.tf('trail.points', { n: primary.points.length }) }}</span>
            </template>
          </p>
        </div>
        <div class="head-tools">
          <span class="cursor-chip mono">
            {{ ui.tf('trail.cursor', { year: formatYearCompact(timeline.year, ui.locale) }) }}
          </span>
          <button class="close" :aria-label="ui.t('trail.close')" @click="emit('close')">✕</button>
        </div>
      </header>

      <div class="compare">
        <div class="chips">
          <span v-if="primary" class="chip main">
            <i class="dot" :style="{ background: COLORS[0] }" aria-hidden="true" />
            {{ displayName(primary) }}
            <em>{{ ui.t('trail.compare.main') }}</em>
          </span>
          <span v-for="(person, i) in compare" :key="person.personId" class="chip">
            <i class="dot" :style="{ background: COLORS[(i + 1) % COLORS.length] }" aria-hidden="true" />
            {{ displayName(person) }}
            <button
              type="button"
              class="unpin"
              :aria-label="ui.t('trail.compare.remove')"
              @click="removeCompare(person.personId)"
            >
              ✕
            </button>
          </span>
        </div>
        <button v-if="!adding" type="button" class="add-person" @click="openAdder">
          ＋ {{ ui.t('trail.compare') }}
        </button>
        <div v-else class="adder">
          <input
            ref="queryInput"
            v-model="query"
            type="search"
            :placeholder="ui.t('trail.compare.search')"
            :aria-label="ui.t('trail.compare.search')"
            autocomplete="off"
            @keydown.esc="closeAdder"
          />
          <ul v-if="query.trim()" class="suggest">
            <li v-if="!suggestions.length">{{ ui.t('trail.compare.none') }}</li>
            <li v-for="item in suggestions" :key="item.personId">
              <button type="button" @mousedown.prevent="addCompare(item)">
                <span>{{ item.name }}</span>
                <span class="s-meta mono">{{ indexBirth(item) }}</span>
              </button>
            </li>
          </ul>
        </div>
        <span v-if="allPeople.length >= 3" class="limit">{{ ui.t('trail.compare.limit') }}</span>
        <span class="grow" />
        <!-- The axis switch shares this row: a separate bar cost 36px of map. -->
        <div class="seg">
          <button
            v-for="mode in (['auto', 'year', 'age'] as const)"
            :key="mode"
            type="button"
            :class="{ on: axisMode === mode }"
            @click="axisMode = mode"
          >
            {{ ui.t(`trail.axis.${mode}`) }}
          </button>
        </div>
        <span v-if="autoAge" class="note">{{ ui.t('trail.axis.autoNote') }}</span>
      </div>

      <div class="panel life-panel">
        <div class="life-body">
          <div v-if="!life" class="empty">{{ ui.t('trail.life.empty') }}</div>

          <div v-else ref="lifeHost" class="life-scroll" @scroll="hideTip">
          <svg
            class="life"
            :width="life.width"
            :height="life.totalH"
            :viewBox="`0 0 ${life.width} ${life.totalH}`"
            @click="unpin"
          >
            <g class="axis" aria-hidden="true">
              <line :x1="life.plotL" :x2="life.plotR" :y1="AXIS_H - 8" :y2="AXIS_H - 8" />
              <text
                v-for="tick in life.ticks"
                :key="tick"
                :x="plotX(tick)"
                :y="12"
                text-anchor="middle"
              >
                {{ tickLabel(tick) }}
              </text>
              <line
                v-for="tick in life.ticks"
                :key="`g${tick}`"
                :x1="plotX(tick)"
                :x2="plotX(tick)"
                :y1="AXIS_H - 2"
                :y2="life.totalH - 4"
                class="grid-line"
              />
            </g>

            <g v-for="block in life.people" :key="block.id">
              <rect
                class="block-band"
                x="0"
                :y="block.top"
                :width="life.width"
                :height="block.height"
              />
              <text class="block-name" x="12" :y="block.top + 20">{{ block.name }}</text>
              <text class="block-meta mono" x="12" :y="block.top + 37">
                {{ block.span }} · {{ block.count }}
              </text>

              <line
                v-if="cursorX(block) !== null"
                class="now-line"
                :x1="cursorX(block) ?? 0"
                :x2="cursorX(block) ?? 0"
                :y1="block.top + 4"
                :y2="block.top + block.height - 4"
              />

              <g v-for="lane in block.lanes" :key="lane.key">
                <text
                  class="lane-label"
                  :x="life.plotL - 12"
                  :y="block.laneTop + lane.row * LANE_H + LANE_H / 2 + 4"
                  text-anchor="end"
                >
                  {{ lane.short }}
                  <title>{{ lane.label }}</title>
                </text>
                <line
                  class="lane-rule"
                  :x1="life.plotL"
                  :x2="life.plotR"
                  :y1="block.laneTop + lane.row * LANE_H + LANE_H / 2"
                  :y2="block.laneTop + lane.row * LANE_H + LANE_H / 2"
                />
              </g>

              <polyline
                v-if="block.stops.length > 1"
                class="connector"
                :points="block.line"
                :stroke="block.color"
              />

              <g v-for="stop in block.stops" :key="stop.index">
                <rect
                  class="stop"
                  :x="stop.x1"
                  :y="stop.cy - 5"
                  :width="stop.x2 - stop.x1"
                  height="10"
                  :fill="block.color"
                />
                <rect
                  class="stop-hit"
                  :x="stop.x1 - 3"
                  :y="stop.cy - 11"
                  :width="stop.x2 - stop.x1 + 6"
                  height="22"
                  @mouseenter="showLifeTip($event, block, stop)"
                  @mouseleave="hideTip"
                  @click.stop="selectStop($event, block, stop)"
                />
              </g>
            </g>
          </svg>
          </div>

          <aside class="ledger" :aria-label="ui.t('trail.list')">
            <p class="ledger-cap cap">
              {{ ui.t('trail.list') }}
              <em>{{ ui.t('trail.list.hint') }}</em>
            </p>
            <div v-for="group in listGroups" :key="group.id" class="ledger-group">
              <p class="ledger-name">
                <i class="dot" :style="{ background: group.color }" aria-hidden="true" />
                {{ group.name }}
              </p>
              <button
                v-for="point in group.points"
                :key="`${group.id}-${point.year}-${point.title}`"
                type="button"
                class="entry"
                :class="{ on: point.year === timeline.year }"
                @click="focusPoint(point)"
              >
                <span class="entry-year mono">{{ rangeLabel(point.year, point.yearEnd ?? point.year) }}</span>
                <span class="entry-place">{{ placeOf(point) }}</span>
                <span class="entry-title">{{ titleOf(point) }}</span>
              </button>
            </div>
          </aside>
        </div>
      </div>
    </article>

    <div
      v-if="tip"
      ref="tipRef"
      class="tip"
      :style="{ left: `${tip.left}px`, top: `${tip.top}px`, borderLeftColor: tip.color }"
      role="tooltip"
    >
      <p class="tip-top">
        <span class="tip-place">{{ tip.place }}</span>
        <span class="tip-years mono">{{ tip.years }}</span>
      </p>
      <p v-if="allPeople.length > 1" class="tip-person">{{ tip.person }}</p>
      <p class="tip-title">{{ tip.title }}</p>
      <p v-if="tip.stay" class="tip-stay mono">{{ tip.stay }}</p>
      <p class="tip-text">{{ tip.text }}</p>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 35;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 0 var(--foot-h);
  pointer-events: none;
}

.sheet {
  position: relative;
  width: min(1280px, 100%);
  height: 36vh;
  max-height: 400px;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  background: var(--card);
  border: 1px solid var(--rule-2);
  border-bottom: 0;
  border-radius: 10px 10px 0 0;
  box-shadow: 0 -10px 30px color-mix(in srgb, var(--ink) 12%, transparent);
  animation: rise 200ms var(--ease);
  /* The comparison suggestions start inside the sheet and finish below it.
     Every scrolling area clips itself, so let them escape the sheet. */
  overflow: visible;
  pointer-events: auto;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

/* ── head ───────────────────────────────────────────────────────────────── */

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--rule);
}

.who {
  min-width: 0;
}

.who h2 {
  margin: 2px 0 0;
  font-size: var(--fs-h1);
  line-height: 1.15;
}

.lead {
  margin: 5px 0 0;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}

.sep {
  margin: 0 6px;
  color: var(--ink-4);
}

.head-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
}

.close {
  width: 30px;
  height: 30px;
  font-size: 14px;
  color: var(--ink-2);
  background: transparent;
  border: 1px solid var(--rule-2);
  cursor: pointer;
}

.close:hover {
  color: var(--rust);
  border-color: var(--rust);
}

/* ── compare bar ────────────────────────────────────────────────────────── */

.compare {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 20px;
  border-bottom: 1px solid var(--rule);
  background: color-mix(in srgb, var(--paper-2) 45%, transparent);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  font-size: var(--fs-sm);
  color: var(--ink);
  border: 1px solid var(--rule-2);
  background: var(--card);
}

.chip.main {
  border-color: var(--rust);
}

.chip em {
  font-style: normal;
  font-size: 10px;
  padding: 0 4px;
  color: var(--card);
  background: var(--rust);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.unpin {
  padding: 0 2px;
  font-size: 10px;
  color: var(--ink-3);
  background: transparent;
  border: 0;
  cursor: pointer;
}

.unpin:hover {
  color: var(--rust);
}

.adder {
  position: relative;
  flex: none;
  width: 190px;
}

/* The comparison entry point has to read as an action, not as a search box. */
.add-person {
  flex: none;
  padding: 4px 10px;
  font-size: var(--fs-sm);
  color: var(--ink-2);
  background: transparent;
  border: 1px dashed var(--rule-2);
  cursor: pointer;
}

.add-person:hover {
  color: var(--rust);
  border-color: var(--rust);
}

.adder input {
  width: 100%;
  padding: 5px 8px;
  font-size: var(--fs-sm);
  color: var(--ink);
  background: var(--card);
  border: 1px solid var(--rule-2);
}

.adder input:focus {
  outline: none;
  border-color: var(--ink-2);
}

.suggest {
  position: absolute;
  z-index: 6;
  top: calc(100% + 4px);
  left: 0;
  width: 240px;
  max-height: 260px;
  overflow: auto;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: var(--card);
  border: 1px solid var(--rule-2);
  box-shadow: var(--shadow-1);
}

.suggest li {
  padding: 0;
  font-size: var(--fs-sm);
  color: var(--ink-3);
}

.suggest li > button {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 6px 10px;
  font-size: var(--fs-sm);
  text-align: left;
  color: var(--ink);
  background: transparent;
  border: 0;
  cursor: pointer;
}

.suggest li > button:hover {
  background: var(--paper-2);
}

.s-meta {
  color: var(--ink-3);
}

.limit {
  margin: 0;
  font-size: var(--fs-label);
  color: var(--ink-3);
}

/* ── panels ─────────────────────────────────────────────────────────────── */

.panel {
  position: relative;
  flex: 1;
  min-height: 0;
}

.empty {
  display: grid;
  place-items: center;
  padding: 40px 20px;
  font-size: var(--fs-sm);
  color: var(--ink-3);
}

/* ── lifeline ───────────────────────────────────────────────────────────── */

.life-panel {
  display: flex;
  flex-direction: column;
}

.grow {
  flex: 1;
}

.seg {
  display: flex;
  border: 1px solid var(--rule-2);
}

.seg button {
  padding: 3px 10px;
  font-size: var(--fs-label);
  color: var(--ink-2);
  background: transparent;
  border: 0;
  cursor: pointer;
}

.seg button + button {
  border-left: 1px solid var(--rule-2);
}

.seg button.on {
  color: var(--card);
  background: var(--ink-2);
}

.note {
  font-size: var(--fs-label);
  color: var(--ink-3);
}

.life-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--paper);
}

.life {
  display: block;
}

.axis text {
  font-family: var(--font-mono);
  font-size: 10px;
  fill: var(--ink-3);
}

.axis line {
  stroke: var(--rule-2);
  stroke-width: 1;
}

.grid-line {
  stroke: var(--rule);
  stroke-width: 1;
  stroke-dasharray: 2 4;
  opacity: 0.8;
}

.block-band {
  fill: color-mix(in srgb, var(--paper-2) 55%, transparent);
}

.block-name {
  font-family: var(--font-display);
  font-size: 13px;
  fill: var(--ink);
}

.block-meta {
  font-size: 10px;
  fill: var(--ink-3);
}

.lane-label {
  font-family: var(--font-sans);
  font-size: 10.5px;
  fill: var(--ink-2);
}

.lane-rule {
  stroke: var(--rule);
  stroke-width: 1;
}

.connector {
  fill: none;
  stroke-width: 1.2;
  stroke-linejoin: round;
  opacity: 0.5;
}

.stop {
  opacity: 0.9;
}

.stop-hit {
  fill: transparent;
  cursor: pointer;
}

/* ── tooltip ────────────────────────────────────────────────────────────── */

.tip {
  position: fixed;
  z-index: 36;
  width: 340px;
  /* A long account may use the empty map above the drawer; only the truly
     enormous ones scroll, and then they can actually be scrolled. */
  max-height: calc(100vh - 24px);
  overflow: auto;
  overscroll-behavior: contain;
  padding: 10px 12px;
  background: var(--card);
  border: 1px solid var(--rule-2);
  border-left: 3px solid var(--rust);
  box-shadow: var(--shadow-2);
  pointer-events: auto;
}

.tip p {
  margin: 0;
}

.tip-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.tip-place {
  font-size: var(--fs-sm);
  color: var(--ink);
}

.tip-years {
  font-size: var(--fs-label);
  color: var(--ink-3);
  flex: none;
}

.tip-person {
  margin-top: 2px !important;
  font-size: var(--fs-label);
  color: var(--rust);
}

.tip-title {
  margin-top: 6px !important;
  font-family: var(--font-display);
  font-size: var(--fs-h3);
  line-height: 1.3;
  color: var(--ink);
}

.tip-stay {
  margin-top: 2px !important;
  font-size: var(--fs-label);
  color: var(--ink-3);
}

.tip-text {
  margin-top: 7px !important;
  font-size: var(--fs-sm);
  line-height: 1.6;
  color: var(--ink-2);
}

/* ── drawer: shared cursor and the dated ledger ─────────────────────────── */

.cursor-chip {
  padding: 4px 9px;
  font-size: var(--fs-label);
  color: var(--ink-2);
  background: var(--paper-2);
  border: 1px solid var(--rule);
}

.life-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  flex: 1;
  min-height: 0;
}

.now-line {
  stroke: var(--rust);
  stroke-width: 1.5;
  stroke-dasharray: 3 3;
}

.ledger {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 10px 12px 16px;
  overflow: auto;
  border-left: 1px solid var(--rule);
  background: color-mix(in srgb, var(--paper-2) 40%, var(--card));
}

.ledger-cap {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
}

.ledger-cap em {
  font-style: normal;
  font-size: 10px;
  color: var(--ink-3);
}

.ledger-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ledger-name {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 4px;
  font-size: var(--fs-sm);
  color: var(--ink);
}

.entry {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 1px 8px;
  width: 100%;
  padding: 5px 6px;
  text-align: left;
  background: transparent;
  border: 0;
  border-left: 2px solid transparent;
  cursor: pointer;
}

.entry:hover {
  background: var(--paper-2);
}

.entry.on {
  border-left-color: var(--rust);
  background: var(--paper-2);
}

.entry-year {
  grid-row: 1 / span 2;
  font-size: 10px;
  color: var(--ink-3);
}

.entry-place {
  font-size: var(--fs-sm);
  color: var(--ink);
}

.entry-title {
  font-size: var(--fs-label);
  color: var(--ink-2);
}

@media (max-width: 820px) {
  .life-body {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr) auto;
  }

  .ledger {
    max-height: 38%;
    border-left: 0;
    border-top: 1px solid var(--rule);
  }
}
</style>
