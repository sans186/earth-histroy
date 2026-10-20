<script setup lang="ts">
import { computed } from 'vue';
import { CATEGORIES } from '@/config';
import { subjectEvents, subjectLabel, subjectSpan, type CompareSubject } from '@/lib/compare';
import { certaintyInfo, formatYear } from '@/lib/format';
import { REGIONS, findRegion, regionDistanceKm, regionLabel } from '@/lib/regions';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';
import type { TimelineEvent } from '@/types';

const props = defineProps<{
  events: TimelineEvent[];
  subjectA: CompareSubject;
  subjectB: CompareSubject;
}>();

const emit = defineEmits<{
  'update:subjectA': [CompareSubject];
  'update:subjectB': [CompareSubject];
  select: [TimelineEvent];
}>();

const ui = useUiStore();
const timeline = useTimelineStore();

type CategoryKey = keyof typeof CATEGORIES;

interface ColumnStats {
  subject: CompareSubject;
  label: string;
  /** A polity knows its own dates; a region does not. */
  span: string | null;
  events: TimelineEvent[];
  military: number;
  figures: number;
  high: number;
}

function statsFor(subject: CompareSubject): ColumnStats {
  const events = subjectEvents(props.events, subject).sort((a, b) => a.year - b.year);
  const figures = new Set<string>();
  for (const e of events) for (const f of e.figures) figures.add(f);
  return {
    subject,
    label: subjectLabel(subject, ui.locale),
    span: subjectSpan(subject, ui.locale),
    events,
    military: events.filter((e) => e.category === 'military').length,
    figures: figures.size,
    high: events.filter((e) => certaintyInfo(e.certainty, ui.locale).level === 'high').length,
  };
}

const a = computed(() => statsFor(props.subjectA));
const b = computed(() => statsFor(props.subjectB));

/** Only meaningful when both columns are regions with a known centre. */
const distance = computed(() => {
  if (props.subjectA.kind !== 'region' || props.subjectB.kind !== 'region') return null;
  const ra = findRegion(props.subjectA.id);
  const rb = findRegion(props.subjectB.id);
  if (!ra || !rb) return null;
  return regionDistanceKm(ra, rb);
});

const rows = computed(() => [
  {
    key: 'events',
    label: ui.locale === 'zh' ? '收录事件' : 'Events',
    a: a.value.events.length,
    b: b.value.events.length,
  },
  {
    key: 'military',
    label: ui.locale === 'zh' ? '军事事件' : 'Military',
    a: a.value.military,
    b: b.value.military,
  },
  {
    key: 'figures',
    label: ui.locale === 'zh' ? '涉及人物' : 'Figures',
    a: a.value.figures,
    b: b.value.figures,
  },
  {
    key: 'certainty',
    label: ui.locale === 'zh' ? '高可信条目' : 'Well attested',
    a: a.value.high,
    b: b.value.high,
  },
]);

/**
 * Category structure, which the four headline numbers cannot show.
 *
 * Two regions with the same event count can be having very different centuries:
 * one all battles, the other all institutions. This is that difference.
 */
const categories = computed(() => {
  const tally = (list: TimelineEvent[]) => {
    const map = new Map<string, number>();
    for (const e of list) map.set(e.category, (map.get(e.category) ?? 0) + 1);
    return map;
  };
  const tallyA = tally(a.value.events);
  const tallyB = tally(b.value.events);
  const keys = new Set([...tallyA.keys(), ...tallyB.keys()]);
  return [...keys]
    .map((key) => {
      const meta = CATEGORIES[key as CategoryKey];
      return {
        key,
        label: meta ? (ui.locale === 'zh' ? meta.zh : meta.en) : key,
        cssVar: meta ? meta.cssVar : '--ink-3',
        a: tallyA.get(key) ?? 0,
        b: tallyB.get(key) ?? 0,
      };
    })
    .filter((row) => row.a || row.b)
    .sort((x, y) => y.a + y.b - (x.a + x.b))
    .slice(0, 4);
});

const available = computed(() =>
  REGIONS.map((r) => ({ id: r.id, label: regionLabel(r, ui.locale) })),
);

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

function barWidth(value: number, max: number) {
  return `${Math.round((value / Math.max(1, max)) * 82)}px`;
}

function catOf(ev: TimelineEvent) {
  const meta = CATEGORIES[ev.category as CategoryKey];
  return `var(${meta ? meta.cssVar : '--ink-3'})`;
}
</script>

<template>
  <section class="board">
    <header class="bar">
      <span class="cap">{{ ui.t('compare.title') }}</span>
      <div class="pickers">
        <template v-if="props.subjectA.kind === 'polity'">
          <span class="chip" :title="a.label">{{ a.label }}</span>
          <button class="clear" :title="ui.t('compare.clear')" @click="clearToRegion('A')">✕</button>
        </template>
        <select
          v-else
          :value="props.subjectA.id"
          @change="setRegion('A', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="r in available" :key="r.id" :value="r.id">{{ r.label }}</option>
        </select>

        <button class="swap" :title="ui.t('compare.swap')" @click="swap">⟷</button>

        <template v-if="props.subjectB.kind === 'polity'">
          <span class="chip" :title="b.label">{{ b.label }}</span>
          <button class="clear" :title="ui.t('compare.clear')" @click="clearToRegion('B')">✕</button>
        </template>
        <select
          v-else
          :value="props.subjectB.id"
          @change="setRegion('B', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="r in available" :key="r.id" :value="r.id">{{ r.label }}</option>
        </select>
      </div>
      <span class="lock">
        <i class="box" aria-hidden="true">✓</i>
        {{ ui.t('compare.lock') }}
      </span>
    </header>

    <div class="columns">
      <div class="col">
        <div class="col-head">
          <h2 class="serif">{{ a.label }}</h2>
          <span v-if="a.span" class="span mono">{{ a.span }}</span>
          <span class="cnt mono">{{ a.events.length }} {{ ui.t('status.events') }}</span>
        </div>
        <ul class="stream">
          <li v-for="ev in a.events" :key="ev.key" @click="emit('select', ev)">
            <span class="dot" :style="{ background: catOf(ev) }" />
            <span class="y mono">{{ ev.year }}</span>
            <span class="t">{{ ev.title }}</span>
            <span class="reg">{{ ev.region }}</span>
          </li>
          <li v-if="!a.events.length" class="none">{{ ui.t('empty.year') }}</li>
        </ul>
      </div>

      <div class="centre">
        <div class="porthole">
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <radialGradient id="cmpSph" cx="34%" cy="27%" r="80%">
                <stop offset="0%" stop-color="#fefdfa" />
                <stop offset="58%" stop-color="#e6e0d2" />
                <stop offset="100%" stop-color="#bdb5a2" />
              </radialGradient>
              <clipPath id="cmpClip"><circle cx="100" cy="100" r="100" /></clipPath>
            </defs>
            <circle cx="100" cy="100" r="100" fill="url(#cmpSph)" />
            <g clip-path="url(#cmpClip)" fill="var(--globe-land)" opacity=".62">
              <path d="M100 34c17-5 34 4 40 20 5 15 1 30-5 45-5 13-7 28-16 41-6 11-15 17-22 12-6-4-4-19-6-35-3-19-6-35-5-52 2-15 5-27 14-31z" />
              <path d="M50 46c9-5 15 3 13 14-2 11-9 18-11 32-2 13 2 27 0 40-2 10-8 17-12 12-4-4-2-17-3-30-2-15 2-30 3-44 1-11 4-19 10-24z" />
              <path d="M152 130c9-5 18 0 21 9 3 7-4 15-12 14-8-1-13-7-12-14 0-4 1-7 3-9z" />
            </g>
            <g clip-path="url(#cmpClip)" fill="none" stroke="var(--globe-grid)" stroke-width=".6" opacity=".55">
              <ellipse cx="100" cy="100" rx="100" ry="27" />
              <ellipse cx="100" cy="100" rx="100" ry="55" />
              <ellipse cx="100" cy="100" rx="100" ry="82" />
              <ellipse cx="100" cy="100" rx="27" ry="100" />
              <ellipse cx="100" cy="100" rx="55" ry="100" />
              <ellipse cx="100" cy="100" rx="82" ry="100" />
            </g>
            <circle cx="100" cy="100" r="99.5" fill="none" stroke="var(--rule-3)" stroke-width="1" />
          </svg>
        </div>
        <div class="year">
          <span class="b serif"><small v-if="timeline.isBCE">BCE</small>{{ timeline.absYear }}</span>
          <span class="s cap">{{ formatYear(timeline.year, ui.locale) }}</span>
        </div>
        <div class="divider" />
        <p v-if="distance" class="dist">
          {{ ui.locale === 'zh' ? '两地相距' : 'Regions are' }}
          <b class="mono">{{ distance.toLocaleString() }} km</b>
        </p>
        <p class="hint">{{ ui.t('compare.hint') }}</p>
      </div>

      <div class="col">
        <div class="col-head">
          <h2 class="serif">{{ b.label }}</h2>
          <span v-if="b.span" class="span mono">{{ b.span }}</span>
          <span class="cnt mono">{{ b.events.length }} {{ ui.t('status.events') }}</span>
        </div>
        <ul class="stream">
          <li v-for="ev in b.events" :key="ev.key" @click="emit('select', ev)">
            <span class="dot" :style="{ background: catOf(ev) }" />
            <span class="y mono">{{ ev.year }}</span>
            <span class="t">{{ ev.title }}</span>
            <span class="reg">{{ ev.region }}</span>
          </li>
          <li v-if="!b.events.length" class="none">{{ ui.t('empty.year') }}</li>
        </ul>
      </div>
    </div>

    <footer class="strip">
      <div class="strip-head">
        <span class="cap">{{ ui.t('compare.metrics') }}</span>
        <span class="dim mono">{{ formatYear(timeline.year, ui.locale) }}</span>
      </div>
      <table>
        <tbody>
          <tr v-for="row in rows" :key="row.key">
            <td class="lbl">{{ row.label }}</td>
            <td>
              <span class="v mono">{{ row.a }}</span>
              <span
                class="bar-fill"
                :style="{ width: barWidth(row.a, Math.max(row.a, row.b)), background: 'var(--indigo)' }"
              />
            </td>
            <td>
              <span class="v mono">{{ row.b }}</span>
              <span
                class="bar-fill"
                :style="{ width: barWidth(row.b, Math.max(row.a, row.b)), background: 'var(--rust)' }"
              />
            </td>
          </tr>
          <tr v-if="categories.length" class="sep">
            <td class="lbl" colspan="3">{{ ui.t('compare.breakdown') }}</td>
          </tr>
          <tr v-for="row in categories" :key="`cat-${row.key}`">
            <td class="lbl">
              <span class="swatch" :style="{ background: `var(${row.cssVar})` }" />{{ row.label }}
            </td>
            <td>
              <span class="v mono">{{ row.a }}</span>
              <span
                class="bar-fill"
                :style="{ width: barWidth(row.a, Math.max(row.a, row.b)), background: `var(${row.cssVar})` }"
              />
            </td>
            <td>
              <span class="v mono">{{ row.b }}</span>
              <span
                class="bar-fill"
                :style="{ width: barWidth(row.b, Math.max(row.a, row.b)), background: `var(${row.cssVar})` }"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </footer>
  </section>
</template>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--paper-2);
}

.bar {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--rule-2);
  background: var(--paper);
}
.pickers {
  display: flex;
  align-items: center;
  gap: 6px;
}
select {
  border: 1px solid var(--rule-2);
  background: var(--card);
  font-family: var(--font-display);
  font-size: 13px;
  padding: 4px 8px;
  color: var(--ink);
}
/* A polity column narrows the whole point of the picker, so it gets a chip
   rather than a select that would silently drop the polity. */
.chip {
  border: 1px solid var(--rule-2);
  background: var(--card);
  font-family: var(--font-display);
  font-size: 13px;
  padding: 4px 8px;
  color: var(--ink);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pickers .clear {
  border: 1px solid var(--rule-2);
  width: 26px;
  height: 27px;
  color: var(--ink-3);
  background: var(--card);
}
.pickers .clear:hover {
  color: var(--rust);
}
.swap {
  border: 1px solid var(--rule-2);
  width: 26px;
  height: 27px;
  color: var(--ink-3);
  background: var(--card);
}
.swap:hover {
  color: var(--rust);
}
.lock {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10.5px;
  color: var(--ink-3);
}
.lock .box {
  width: 13px;
  height: 13px;
  border: 1px solid var(--rule-3);
  display: grid;
  place-items: center;
  font-size: 9px;
  font-style: normal;
  color: var(--rust);
}

.columns {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 272px 1fr;
}
.col {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.col:first-child {
  border-right: 1px solid var(--rule);
}
.col:last-child {
  border-left: 1px solid var(--rule);
}
.col-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 13px 20px 11px;
  border-bottom: 1px solid var(--rule-2);
}
.col-head h2 {
  font-size: 19px;
}
.col-head .span {
  font-size: 10px;
  color: var(--ink-3);
}
.col-head .cnt {
  margin-left: auto;
  font-size: 10px;
  color: var(--ink-3);
}

.stream {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  flex: 1;
}
.stream li {
  display: grid;
  grid-template-columns: 8px 46px 1fr;
  gap: 10px;
  align-items: baseline;
  padding: 9px 20px;
  border-bottom: 1px solid var(--rule);
  cursor: pointer;
}
.stream li:hover {
  background: var(--card);
}
.stream .dot {
  width: 7px;
  height: 7px;
  display: block;
  transform: translateY(-1px);
}
.stream .y {
  font-size: 10px;
  color: var(--ink-4);
}
.stream .t {
  font-size: var(--fs-sm);
  line-height: 1.5;
  color: var(--ink);
}
.stream .reg {
  grid-column: 3;
  font-size: 10px;
  color: var(--ink-4);
}
.stream .none {
  display: block;
  padding: 26px 20px;
  font-size: var(--fs-sm);
  color: var(--ink-4);
  cursor: default;
}
.stream .none:hover {
  background: transparent;
}

.centre {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 22px 18px;
  background: var(--paper);
}
.porthole {
  position: relative;
  width: 168px;
  height: 168px;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: var(--shadow-1);
}
.porthole svg {
  display: block;
  width: 100%;
  height: 100%;
}
.year {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.year .b {
  font-size: 34px;
  font-weight: 600;
  line-height: 1;
}
.year .b small {
  font-family: var(--font-sans);
  font-size: 10px;
  letter-spacing: 0.18em;
  color: var(--ink-3);
  margin-right: 4px;
}
.year .s {
  color: var(--ink-3);
}
.divider {
  width: 40px;
  height: 1px;
  background: var(--rule-2);
}
.dist {
  font-size: 11px;
  color: var(--ink-2);
  text-align: center;
}
.dist b {
  color: var(--rust);
}
.hint {
  font-size: 10px;
  line-height: 1.7;
  color: var(--ink-4);
  text-align: center;
  max-width: 190px;
}

.strip {
  border-top: 1px solid var(--rule-2);
  background: var(--card);
  max-height: 40%;
  overflow: auto;
}
.strip-head {
  display: flex;
  align-items: center;
  padding: 8px 20px;
  border-bottom: 1px solid var(--rule);
}
.strip-head .dim {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--ink-4);
}
table {
  width: 100%;
  border-collapse: collapse;
}
td {
  padding: 7px 20px;
  border-bottom: 1px solid var(--rule);
  vertical-align: middle;
}
tr:last-child td {
  border-bottom: 0;
}
td.lbl {
  font-size: 11px;
  color: var(--ink-3);
  width: 120px;
}
/* Hairline between the headline numbers and the category breakdown. */
tr.sep td {
  padding-top: 11px;
  padding-bottom: 4px;
  font-size: 9.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-4);
  background: var(--paper-2);
  border-bottom: 1px solid var(--rule-2);
}
.swatch {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  vertical-align: middle;
}
.v {
  font-size: 13px;
  color: var(--ink-2);
  display: inline-block;
  min-width: 22px;
}
/* Was `.bar`, the same class as the header row above — the second declaration
   won and flattened the header to a 5px strip. */
.bar-fill {
  display: inline-block;
  height: 5px;
  vertical-align: middle;
  margin-left: 8px;
  opacity: 0.5;
}
</style>
