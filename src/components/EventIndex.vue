<script setup lang="ts">
import { computed } from 'vue';
import { CATEGORIES } from '@/config';
import { certaintyInfo } from '@/lib/format';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';
import type { TimelineEvent } from '@/types';

const props = defineProps<{
  events: TimelineEvent[];
  /** total matched before filtering, to explain an empty list honestly */
  totalBeforeFilter: number;
}>();

const emit = defineEmits<{ select: [TimelineEvent]; openYear: [] }>();

const ui = useUiStore();
const timeline = useTimelineStore();

const selectedKey = computed(() => ui.selectedEvent?.key ?? null);

const current = computed(() =>
  props.events.filter((e) => e.year === timeline.year).length,
);

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
        <small v-if="timeline.isBCE">BCE</small>{{ timeline.absYear }}
      </div>
      <div class="sub">
        <span>{{ ui.locale === 'zh' ? timeline.era.name : timeline.era.nameEn }}</span>
        <span class="mono">{{ props.events.length }} {{ ui.t('status.events') }}</span>
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
        v-for="(ev, i) in props.events"
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
  font-size: 30px;
  font-weight: 600;
  line-height: 1;
}
.year-head .y small {
  font-family: var(--font-sans);
  font-size: 10px;
  letter-spacing: 0.18em;
  color: var(--ink-3);
  margin-right: 5px;
}
.year-head .sub {
  margin-top: 8px;
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.year-head .sub .mono {
  margin-left: auto;
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
  font-size: 10px;
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
  font-size: 9.5px;
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
  font-size: 10px;
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
  font-size: 9.5px;
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
  font-size: 10.5px;
  color: var(--ink-4);
  line-height: 1.7;
}

.foot {
  display: flex;
  justify-content: space-between;
  padding: 8px 18px;
  border-top: 1px solid var(--rule-2);
  font-size: 9.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-4);
}
</style>
