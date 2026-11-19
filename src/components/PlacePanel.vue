<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { canonicalPolityName } from '@/lib/polityKey';
import { placeSegmentAt, placeSegments } from '@/lib/place';
import { loadPlaceHistory, loadPolityFile, loadPolityIndex, loadPolityNames } from '@/services/data';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';
import type { PlaceCity, PlaceHistoryFile, PolityFeature } from '@/types';
import PlaceBand from './PlaceBand.vue';

const props = defineProps<{ active: boolean }>();
const emit = defineEmits<{
  locate: [at: { lon: number; lat: number }];
  polity: [feature: PolityFeature];
}>();

const ui = useUiStore();
const timeline = useTimelineStore();

/** The six the prototype validated; all of them have long, legible bands. */
const SUGGESTED = ['xian', 'rome', 'istanbul', 'kyoto', 'cairo', 'athens'];

const data = ref<PlaceHistoryFile | null>(null);
const loading = ref(false);
const failed = ref(false);
const query = ref('');
const names = ref<Record<string, string>>({});

async function ensure() {
  if (data.value || loading.value) return;
  loading.value = true;
  failed.value = false;
  try {
    data.value = await loadPlaceHistory();
    failed.value = !data.value;
    if (data.value) names.value = await loadPolityNames();
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

// The tab's data is fetched on first use, not at app start.
watch(
  () => props.active,
  (on) => {
    if (on) void ensure();
  },
  { immediate: true },
);

const cities = computed(() => data.value?.cities ?? []);

const results = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  return cities.value
    .filter((c) => c.zh.includes(q) || c.en.toLowerCase().includes(q) || c.id.includes(q))
    .slice(0, 8);
});

const suggested = computed(
  () => SUGGESTED.map((id) => cities.value.find((c) => c.id === id)).filter(Boolean) as PlaceCity[],
);

const selected = computed<PlaceCity | null>(() => {
  const focus = ui.placeFocus;
  if (!focus) return null;
  return cities.value.find((c) => c.id === focus.id) ?? null;
});

const segments = computed(() => (selected.value ? placeSegments(selected.value) : []));
const current = computed(() =>
  selected.value ? placeSegmentAt(segments.value, timeline.year) : null,
);

const cityName = computed(() =>
  selected.value ? (ui.locale === 'zh' ? selected.value.zh : selected.value.en) : '',
);

function yearLabel(year: number) {
  if (year < 0) return ui.locale === 'zh' ? `前${-year}` : `${-year} BCE`;
  return String(year);
}

function polityLabel(name: string) {
  return ui.locale === 'zh' ? (names.value[name] ?? name) : name;
}

function pick(city: PlaceCity) {
  ui.setPlaceFocus({ id: city.id, lon: city.lon, lat: city.lat });
  query.value = '';
  emit('locate', { lon: city.lon, lat: city.lat });
}

function close() {
  ui.setPlaceFocus(null);
}

function jump(year: number) {
  timeline.setYear(year);
}

/**
 * Open the existing polity card for the band's current segment.
 *
 * The card takes a feature, and a feature lives in a century tile — so this
 * loads the one LOD tile that covers the year and finds the row whose name and
 * dates match the segment. Nothing is re-fetched beyond that tile.
 */
async function openPolity() {
  const seg = current.value;
  if (!seg) return;
  const year = timeline.year;
  const index = await loadPolityIndex();
  const entry = index.find((e) => year >= e.start && year <= e.end);
  if (!entry) return;
  const file = await loadPolityFile(entry, 'lod');
  const feature = (file?.features ?? []).find((f) => {
    const p = f.properties ?? {};
    return (
      canonicalPolityName(p.Name) === seg.name &&
      Number(p.FromYear) <= year &&
      Number(p.ToYear) >= year
    );
  });
  if (feature) emit('polity', feature);
}
</script>

<template>
  <section class="place">
    <div class="search">
      <input
        v-model="query"
        type="search"
        :placeholder="ui.t('place.search')"
        :aria-label="ui.t('place.search')"
      />
    </div>

    <div v-if="loading" class="note">{{ ui.t('place.loading') }}</div>

    <div v-else-if="failed" class="note">
      {{ ui.t('place.failed') }}
      <button class="link" @click="ensure">{{ ui.t('place.retry') }}</button>
    </div>

    <div v-else-if="!selected" class="empty">
      <p>{{ ui.t('place.empty') }}</p>
      <div v-if="results.length" class="list">
        <button v-for="c in results" :key="c.id" class="row" @click="pick(c)">
          <span class="name">{{ ui.locale === 'zh' ? c.zh : c.en }}</span>
          <span class="sub">{{ ui.locale === 'zh' ? c.en : c.zh }}</span>
        </button>
      </div>
      <p v-else-if="query.trim()" class="note">{{ ui.t('place.noMatch') }}</p>
      <div v-if="!query.trim()" class="chips">
        <span class="chips-label">{{ ui.t('place.recommended') }}</span>
        <button v-for="c in suggested" :key="c.id" class="chip" @click="pick(c)">
          {{ ui.locale === 'zh' ? c.zh : c.en }}
        </button>
      </div>
    </div>

    <div v-else class="detail">
      <header class="head">
        <div>
          <h3>{{ cityName }}</h3>
          <p class="sub">{{ ui.locale === 'zh' ? selected.en : selected.zh }}</p>
        </div>
        <button class="close" :title="ui.t('place.close')" @click="close">✕</button>
      </header>

      <h4>{{ ui.t('place.title') }}</h4>
      <PlaceBand
        :city="selected"
        :year="timeline.year"
        :names="names"
        @select="jump"
      />

      <p v-if="current" class="current" aria-live="polite">
        <span class="year">{{ yearLabel(timeline.year) }}</span>
        <span class="polity">{{ polityLabel(current.name) }}</span>
        <span class="span">{{ yearLabel(current.from) }} – {{ yearLabel(current.to) }}</span>
        <button class="link" @click="openPolity">{{ ui.t('place.openPolity') }}</button>
      </p>
      <p v-else class="current miss" aria-live="polite">
        <span class="year">{{ yearLabel(timeline.year) }}</span>
        {{ ui.t('place.noPolity') }} · {{ ui.t('place.noPolityHint') }}
      </p>

      <p v-if="current?.contested" class="warn">{{ ui.t('place.contested') }}</p>

      <p class="meta">
        {{
          ui.tf('place.covered', {
            from: yearLabel(selected.coverage.from),
            to: yearLabel(selected.coverage.to),
            ratio: Math.round(selected.coverage.ratio * 100),
          })
        }}
      </p>
      <p class="meta">{{ ui.t('place.hint') }}</p>
      <p class="meta faint">{{ ui.t('place.boundaryNote') }}</p>
    </div>
  </section>
</template>

<style scoped>
.place {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px 14px;
  overflow-y: auto;
}
.search input {
  width: 100%;
  padding: 7px 9px;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--paper);
  color: var(--ink);
  font-size: 12.5px;
}
.search input:focus {
  outline: none;
  border-color: var(--rust);
}
.note {
  margin-top: 14px;
  font-size: 12px;
  color: var(--ink-3);
}
.empty p {
  margin: 16px 0 10px;
  font-size: 12.5px;
  color: var(--ink-2);
}
.list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--rule);
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 2px;
  border-bottom: 1px solid var(--rule);
  text-align: left;
}
.row:hover {
  background: var(--paper-2);
}
.name {
  font-size: 13px;
  color: var(--ink);
}
.sub {
  font-size: 11.5px;
  color: var(--ink-3);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.chips-label {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-3);
  margin-right: 2px;
}
.chip {
  padding: 4px 9px;
  border: 1px solid var(--rule);
  border-radius: 999px;
  font-size: 12px;
  color: var(--ink-2);
  background: var(--paper);
}
.chip:hover {
  border-color: var(--rust);
  color: var(--ink);
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.head h3 {
  margin: 2px 0 0;
  font-size: 17px;
  letter-spacing: 0.02em;
  color: var(--ink);
}
.head .sub {
  margin: 2px 0 0;
}
.close {
  flex: none;
  width: 24px;
  height: 24px;
  color: var(--ink-3);
  font-size: 13px;
}
.close:hover {
  color: var(--ink);
}
h4 {
  margin: 16px 0 8px;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.current {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 7px;
  margin: 12px 0 0;
  font-size: 12.5px;
  color: var(--ink-2);
}
.current .year {
  font-variant-numeric: tabular-nums;
  color: var(--ink-3);
}
.current .polity {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.current .span {
  font-size: 11.5px;
  color: var(--ink-3);
}
.current.miss {
  color: var(--ink-3);
}
.warn {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--rust);
}
.meta {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--ink-3);
}
.meta.faint {
  color: var(--ink-4, var(--ink-3));
  opacity: 0.75;
}
.link {
  font-size: 11.5px;
  color: var(--rust);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
