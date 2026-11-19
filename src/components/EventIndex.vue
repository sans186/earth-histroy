<script setup lang="ts">
import { computed } from 'vue';
import { CATEGORIES } from '@/config';
import { certaintyInfo, type CertaintyLevel } from '@/lib/format';
import { useLayersStore } from '@/stores/layers';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';
import type { TimelineEvent } from '@/types';

const props = defineProps<{
  events: TimelineEvent[];
  /** total matched before filtering, to explain an empty list honestly */
  totalBeforeFilter: number;
  /** per-level counts of the window after the category/scope gates */
  certaintyCounts: Record<CertaintyLevel, number>;
}>();

const emit = defineEmits<{ select: [TimelineEvent]; openYear: [] }>();

const ui = useUiStore();
const timeline = useTimelineStore();
const layers = useLayersStore();

const certaintyOptions = [
  { level: 'high' as const, key: 'certainty.short.high' as const },
  { level: 'mid' as const, key: 'certainty.short.mid' as const },
  { level: 'low' as const, key: 'certainty.short.low' as const },
];

const selectedKey = computed(() => ui.selectedEvent?.key ?? null);

const current = computed(() =>
  props.events.filter((e) => e.year === timeline.year).length,
);

/**
 * The panel receives the whole time-scale window (current year ±5), so the raw
 * order is chronological: at 1911 the first rows were 1906 entries and the
 * year's own events sat in the middle of the list, which reads as "the list is
 * stuck on the wrong year". Nearest year first keeps the current year on top.
 */
const ordered = computed(() => {
  const year = timeline.year;
  return [...props.events].sort((a, b) => {
    const da = Math.abs(a.year - year);
    const db = Math.abs(b.year - year);
    if (da !== db) return da - db;
    return a.year - b.year || a.title.localeCompare(b.title, 'zh');
  });
});

function catLabel(ev: TimelineEvent) {
  const meta = CATEGORIES[ev.category];
  return ui.locale === 'zh' ? meta.zh : meta.en;
}

/** One or two characters for the certainty marker in the index. */
function certMark(ev: TimelineEvent) {
  return certaintyInfo(ev.certainty, ui.locale).mark;
}
</script>

<template>
  <div class="wrap">
    <div class="year-head">
      <div class="y serif">
        <small v-if="timeline.isBCE">{{ ui.t('unit.bce') }}</small>{{ timeline.absYear }}
      </div>
      <div class="sub">
        <span>{{ ui.locale === 'zh' ? timeline.era.name : timeline.era.nameEn }}</span>
        <!--
          While the scale is being dragged the year runs ahead of the loaded
          list, so the count would read zero next to a full list. Say what is
          actually happening instead.
        -->
        <span v-if="timeline.scrubbing" class="mono drag-hint">{{ ui.t('loading.events') }}…</span>
        <span v-else class="mono">{{ current }} {{ ui.t('status.events') }}</span>
      </div>

      <!--
        The year's own appraisal (documentation level, source bias, gaps) is a
        property of the year, so it opens from the year's heading rather than
        being repeated inside every entry card.
      -->
      <button class="year-open" @click="emit('openYear')">
        <span class="lbl">{{ ui.t('year.open') }}</span>
        <em>{{ ui.t('year.hint') }}</em>
      </button>
    </div>

    <!--
      Same certainty/gating as the layer panel, surfaced next to the list it
      filters. Counts ignore the certainty gate itself so a level can always be
      switched back on from here.
    -->
    <div class="cert-bar cap">
      <span class="cert-title">{{ ui.t('overview.certainty') }}</span>
      <template v-for="(opt, i) in certaintyOptions" :key="opt.level">
        <span v-if="i > 0" class="sep" aria-hidden="true">·</span>
        <button
          class="cert-btn"
          :class="{
            off: !layers.isCertaintyActive(opt.level),
            zero: props.certaintyCounts[opt.level] === 0,
          }"
          :aria-pressed="layers.isCertaintyActive(opt.level)"
          @click="layers.toggleCertainty(opt.level)"
        >
          {{ ui.t(opt.key) }}
          <span class="num mono">{{ props.certaintyCounts[opt.level] }}</span>
        </button>
      </template>
    </div>

    <div v-if="ui.polityScope" class="scope-row">
      <button
        class="scope-chip"
        :class="{ on: ui.scopeToPolity }"
        :title="ui.t('filter.polityHint')"
        @click="ui.toggleScopeToPolity()"
      >
        <i v-if="ui.scopeToPolity">✓</i>
        <span>{{ ui.t('filter.polity') }} · {{ ui.polityScope.label }}</span>
      </button>
    </div>

    <div v-if="props.events.length === 0" class="empty">
      <p class="t">
        {{ props.totalBeforeFilter > 0 ? ui.t('empty.filtered') : ui.t('empty.year') }}
      </p>
      <p class="h">
        {{ props.totalBeforeFilter > 0 ? ui.t('empty.filteredHint') : ui.t('empty.hint') }}
      </p>
    </div>

    <ol v-else class="list">
      <li
        v-for="(ev, i) in ordered"
        :key="ev.key"
        :class="{ on: ev.key === selectedKey, now: ev.year === timeline.year }"
        @click="emit('select', ev)"
      >
        <span class="idx mono">{{ String(i + 1).padStart(2, '0') }}</span>
        <span class="body">
          <span class="title">{{ ev.title }}</span>
          <span class="meta">
            <span class="dot" :style="{ background: `var(${CATEGORIES[ev.category].cssVar})` }" />
            <span>{{ catLabel(ev) }}</span>
            <span v-if="ev.region" class="reg">{{ ev.region }}</span>
            <span v-if="ev.year !== timeline.year" class="yr mono">{{ ev.year }}</span>
          </span>
        </span>
        <span class="cert mono" :class="certaintyInfo(ev.certainty, ui.locale).level">
          {{ certMark(ev) }}
        </span>
      </li>
    </ol>

    <div class="foot">
      <span>{{ ui.t('panel.index') }}</span>
      <span class="mono">{{ current }} / {{ props.events.length }}</span>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.year-head {
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--rule-2);
}
.year-head .y {
  font-size: 32px;
  font-weight: 600;
  line-height: 1;
}
.year-head .y small {
  font-family: var(--font-sans);
  font-size: 12px;
  letter-spacing: 0.18em;
  color: var(--ink-3);
  margin-right: 5px;
}
.year-head .sub {
  margin-top: 8px;
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.year-head .sub .mono {
  margin-left: auto;
}
.year-head .sub .drag-hint {
  color: var(--rust);
  letter-spacing: 0.06em;
  text-transform: none;
}

/* Same type scale as the panel's `.cap` headings; the row never wraps and
   scrolls sideways instead when the sidebar is narrow. */
.cert-bar {
  display: flex;
  align-items: baseline;
  gap: 7px;
  flex: none;
  padding: 8px 18px;
  border-bottom: 1px solid var(--rule);
  white-space: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
}
.cert-bar::-webkit-scrollbar {
  display: none;
}
.cert-title {
  margin-right: 3px;
}
.cert-btn {
  flex: none;
  letter-spacing: inherit;
  text-transform: inherit;
  color: var(--ink-2);
  transition: color var(--dur) var(--ease);
}
.cert-btn:hover {
  color: var(--ink);
}
.cert-btn.off {
  opacity: 0.45;
}
.cert-btn.zero {
  color: var(--ink-4);
}
.cert-btn .num {
  margin-left: 2px;
  letter-spacing: 0.04em;
}
.sep {
  color: var(--ink-4);
}

/* The polity scope sits under the year heading, above the list it filters. */
.scope-row {
  padding: 9px 18px;
  border-bottom: 1px solid var(--rule);
}

.year-open {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  margin-top: 11px;
  padding: 8px 10px;
  text-align: left;
  border: 1px solid var(--rule-2);
  background: var(--card);
  transition: border-color var(--dur) var(--ease);
}
.year-open:hover {
  border-color: var(--rule-3);
}
.year-open .lbl {
  font-size: var(--fs-sm);
  color: var(--rust);
}
.year-open em {
  font-style: normal;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink-4);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  flex: 1;
}
.list li {
  display: grid;
  grid-template-columns: 22px 1fr auto;
  gap: 10px;
  align-items: start;
  padding: 10px 18px;
  border-bottom: 1px solid var(--rule);
  cursor: pointer;
  position: relative;
  transition: background var(--dur) var(--ease);
}
.list li:hover {
  background: var(--paper-2);
}
.list li.on {
  background: var(--card);
}
.list li.on::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--rust);
}
.idx {
  font-size: 11.5px;
  color: var(--ink-4);
  padding-top: 3px;
}
.body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.title {
  font-size: var(--fs-body);
  line-height: 1.4;
  color: var(--ink);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.meta {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--ink-3);
  letter-spacing: 0.06em;
}
.dot {
  width: 6px;
  height: 6px;
  flex: none;
}
.reg {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 110px;
}
.yr {
  margin-left: auto;
  color: var(--ink-4);
}
.cert {
  font-size: 11.5px;
  color: var(--ink-4);
  border: 1px solid var(--rule-2);
  padding: 0 4px;
  line-height: 15px;
}
.cert.high {
  color: var(--indigo);
  border-color: color-mix(in srgb, var(--indigo) 40%, transparent);
}
.cert.mid {
  color: var(--ochre);
  border-color: color-mix(in srgb, var(--ochre) 40%, transparent);
}
.cert.low {
  color: var(--rust);
  border-color: color-mix(in srgb, var(--rust) 40%, transparent);
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 30px 22px;
  text-align: center;
}
.empty .t {
  font-family: var(--font-display);
  font-size: var(--fs-h3);
  color: var(--ink-2);
}
.empty .h {
  font-size: 12.5px;
  color: var(--ink-4);
  line-height: 1.7;
}

.foot {
  display: flex;
  justify-content: space-between;
  padding: 8px 18px;
  border-top: 1px solid var(--rule-2);
  font-size: 11.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-4);
}
</style>
