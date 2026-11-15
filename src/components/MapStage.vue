<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CATEGORIES } from '@/config';
import { rendererError } from '@/lib/appError';
import { NE_FILES, loadPolityFile, loadPolityIndex, pickCenturyFiles } from '@/services/data';
import type { HoverInfo } from '@/services/globe';
import { map2d } from '@/services/map2d';
import { useLayersStore } from '@/stores/layers';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';
import { useWarsStore } from '@/stores/wars';
import type { PolityFeature, TimelineEvent } from '@/types';
import LoadingVeil from './LoadingVeil.vue';

const props = defineProps<{
  events: TimelineEvent[];
  /** English → Chinese polity names, for the hover card on a region. */
  names: Record<string, string>;
}>();

const emit = defineEmits<{
  ready: [];
  viewSettled: [];
  pickEvent: [TimelineEvent | null];
  pickPolity: [PolityFeature | null];
  pickWar: [string];
}>();

const ui = useUiStore();
const layers = useLayersStore();
const timeline = useTimelineStore();
const wars = useWarsStore();

const host = ref<HTMLElement | null>(null);
const hover = shallowRef<HoverInfo | null>(null);

const yearText = computed(() => String(timeline.absYear));
const eraText = computed(() => (ui.locale === 'zh' ? timeline.era.name : timeline.era.nameEn));
const cats = computed(() =>
  Object.entries(CATEGORIES).map(([key, meta]) => ({
    key,
    label: ui.locale === 'zh' ? meta.zh : meta.en,
    color: `var(${meta.cssVar})`,
  })),
);

/**
 * Polities for the flat map.
 *
 * The 3D path loads through `useGlobeData` because it needs prepared geometry
 * and camera-aware culling. Here the data is a GeoJSON source, so the century
 * file is read directly at the light LOD and filtered by year; a stale response
 * is dropped by generation rather than aborted, since the fetch is cached and
 * cheap to reuse.
 */
let polityGen = 0;
async function paintPolities() {
  const gen = ++polityGen;
  if (!layers.showPolities) {
    map2d.clearPolities();
    return;
  }
  try {
    const index = await loadPolityIndex();
    if (gen !== polityGen) return;
    const entries = pickCenturyFiles(index, timeline.year);
    const own = entries.find((e) => timeline.year >= e.start && timeline.year < e.end) ?? entries[0];
    if (!own) {
      map2d.clearPolities();
      return;
    }
    const collection = await loadPolityFile(own, 'lod');
    if (gen !== polityGen || !collection) return;

    const year = timeline.year;
    const features = collection.features.filter((feature) => {
      const from = feature.properties?.FromYear;
      const to = feature.properties?.ToYear;
      if (from !== undefined && from > year) return false;
      if (to !== undefined && to < year) return false;
      return Boolean(feature.geometry);
    });

    map2d.renderPolities(features as PolityFeature[], props.names, {
      labels: layers.showPolityNames,
      locale: ui.locale,
    });
    layers.polityStatus = {
      ...layers.polityStatus,
      year,
      shown: features.length,
      matched: features.length,
      ready: true,
      loading: false,
    };
  } catch {
    // The 2D map is an enhancement; a failed polity load must not blank it.
  }
}

let yearTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePolities() {
  // A drag rewrites the year every frame; re-filtering the century file each
  // time is wasted work that the release handler repeats once anyway.
  if (timeline.scrubbing) return;
  if (yearTimer) clearTimeout(yearTimer);
  yearTimer = setTimeout(() => void paintPolities(), 180);
}

/* ── reference layers ──────────────────────────────────────────────────── */

/**
 * Modern borders and war theatres.
 *
 * On the globe both are driven from `App.vue`, which gates every 3D pass on
 * `globeReady`. The flat map owns the two layers itself, so the switches behave
 * the same in both views instead of only working in 3D.
 */
const bordersLoaded = ref(false);

async function paintBorders() {
  if (!layers.showBorders) {
    map2d.setModernBordersVisible(false);
    return;
  }
  if (!bordersLoaded.value) {
    bordersLoaded.value = await map2d.loadModernBorders(
      NE_FILES.countries110m,
      NE_FILES.borders50m,
    );
  }
  map2d.setModernBordersVisible(layers.showBorders);
}

function paintWars() {
  const all = wars.located;
  // Same rule as the globe: the open war stays plotted even with the layer off,
  // otherwise opening one would show a card with no marker.
  const list = layers.showWars ? all : all.filter((w) => w.warId === wars.selectedId);
  if (!list.length) {
    map2d.clearWars();
    return;
  }
  map2d.renderWars(list, wars.selectedId, layers.showLabels);
}

onMounted(() => {
  if (!host.value) return;
  try {
    map2d.init(host.value, {
      onPickEvent: (ev) => emit('pickEvent', ev ?? null),
      onHoverEvent: (info) => {
        hover.value = info;
      },
      onPickPolity: (feature) => emit('pickPolity', feature),
      onPickWar: (warId) => emit('pickWar', warId),
      onViewChange: () => emit('viewSettled'),
    });
  } catch (err) {
    ui.setError(rendererError(ui.locale, (err as Error)?.message ?? err));
    return;
  }
  map2d.renderEvents(props.events, { labels: true });
  emit('ready');
  void paintPolities();
  void paintBorders();
  if (layers.showWars) void wars.ensureIndex().then(paintWars);
  else paintWars();
});

onBeforeUnmount(() => {
  if (yearTimer) clearTimeout(yearTimer);
  map2d.destroy();
});

watch(
  () => props.events,
  (list) => map2d.renderEvents(list, { labels: true }),
);
watch(() => props.names, schedulePolities);
watch(() => timeline.year, schedulePolities);
watch(() => layers.showPolities, schedulePolities);
// Toggling the names is a visibility change, not new data — no reload needed.
watch(() => layers.showPolityNames, (on) => map2d.setPolityLabels(on));
// The language switch changes the text itself, so the labels are rebuilt.
watch(() => ui.locale, schedulePolities);
/** The shared banner's Retry action re-issues this view's own enhancement loads. */
watch(
  () => ui.retryToken,
  () => {
    void paintPolities();
    void paintBorders();
  },
);
watch(
  () => layers.base,
  (kind) => map2d.setBase(kind),
);
watch(() => layers.showBorders, () => void paintBorders());
watch(
  () => layers.showWars,
  (on) => {
    // Turning the layer on is the first time the war index may be needed, and
    // the side panel may never have been opened.
    if (on) void wars.ensureIndex().then(paintWars);
    else paintWars();
  },
);
watch(() => [layers.showLabels, wars.selectedId] as const, paintWars);
watch(() => wars.located, paintWars);
watch(
  () => timeline.scrubbing,
  (scrubbing) => {
    if (!scrubbing) schedulePolities();
  },
);
</script>

<template>
  <section class="stage">
    <div ref="host" class="canvas" />

    <div class="ghost serif" aria-hidden="true">{{ yearText }}</div>
    <span class="era-v">{{ eraText }}</span>

    <div v-if="layers.showPolities" class="status">
      <template v-if="layers.polityStatus.ready">
        <span class="mono">{{ layers.polityStatus.shown }}</span>
        <span class="cap">{{ ui.t('status.polities') }}</span>
      </template>
      <template v-else>
        <span class="cap">{{ ui.t('panel.polity') }}</span>
        <span class="dim">· {{ ui.t('loading.polities') }}</span>
      </template>
    </div>

    <div class="legend">
      <span class="cap">{{ ui.t('panel.legend') }}</span>
      <div class="rows">
        <span v-for="c in cats" :key="c.key" class="entry">
          <i :style="{ background: c.color }" />
          {{ c.label }}
        </span>
      </div>
    </div>

    <div class="hint cap">{{ ui.t('hint.map2d') }}</div>

    <div
      v-if="hover"
      class="tip"
      :style="{ left: `${hover.x + 14}px`, top: `${hover.y + 14}px` }"
    >
      <i :style="{ background: `var(${hover.categoryVar})` }" />
      <span class="t">{{ hover.title }}</span>
      <span v-if="hover.subtitle" class="s">{{ hover.subtitle }}</span>
    </div>

    <LoadingVeil />
  </section>
</template>

<style scoped>
.stage {
  position: relative;
  min-width: 0;
  overflow: hidden;
  background: var(--paper);
}
.canvas {
  position: absolute;
  inset: 0;
}

.ghost {
  position: absolute;
  right: 30px;
  top: 8px;
  font-size: 118px;
  font-weight: 700;
  line-height: 0.82;
  letter-spacing: -0.02em;
  color: var(--ink);
  opacity: 0.045;
  pointer-events: none;
  user-select: none;
}
.era-v {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  writing-mode: vertical-rl;
  font-family: var(--font-display);
  font-size: var(--fs-sm);
  letter-spacing: 0.42em;
  color: var(--ink-2);
  pointer-events: none;
}
.status {
  position: absolute;
  left: 16px;
  top: 14px;
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 5px 9px;
  border: 1px solid var(--rule);
  background: color-mix(in srgb, var(--card) 82%, transparent);
  pointer-events: none;
}
.status .mono {
  font-size: var(--fs-sm);
  color: var(--ink);
}
.dim {
  font-size: 12.5px;
  color: var(--ink-4);
}
.legend {
  position: absolute;
  left: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 9px 11px;
  border: 1px solid var(--rule);
  background: color-mix(in srgb, var(--card) 82%, transparent);
  pointer-events: none;
}
.legend .rows {
  display: grid;
  grid-template-columns: auto auto;
  gap: 4px 14px;
}
.legend .entry {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: var(--ink-2);
}
.legend i {
  width: 12px;
  height: 3px;
  display: block;
}
.hint {
  position: absolute;
  right: 16px;
  bottom: 16px;
  color: var(--ink-4);
  pointer-events: none;
}
.tip {
  position: absolute;
  z-index: 12;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 9px;
  border: 1px solid var(--rule-2);
  background: var(--card);
  box-shadow: var(--shadow-1);
  pointer-events: none;
  white-space: nowrap;
  max-width: 340px;
}
.tip i {
  width: 8px;
  height: 8px;
  display: block;
  flex: none;
}
.tip .t {
  font-size: var(--fs-sm);
  color: var(--ink);
}
.tip .s {
  font-size: 12px;
  color: var(--ink-3);
}
</style>
