<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { YEAR_MIN, YEAR_MAX } from '@/config';
import type { CompareSubject } from '@/lib/compare';
import { useGlobeData } from '@/composables/useGlobeData';
import { NE_FILES } from '@/services/data';
import { globe } from '@/services/globe';
import { useLayersStore } from '@/stores/layers';
import { usePeopleStore } from '@/stores/people';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';
import { useWarsStore } from '@/stores/wars';
import type { PolityFeature, TimelineEvent } from '@/types';
import AppHead from './components/AppHead.vue';
import CompareBoard from './components/CompareBoard.vue';
import EventCard from './components/EventCard.vue';
import GlobeStage from './components/GlobeStage.vue';
import PersonCard from './components/PersonCard.vue';
import PolityCard from './components/PolityCard.vue';
import SidePanel from './components/SidePanel.vue';
import TimeScale from './components/TimeScale.vue';
import WarCard from './components/WarCard.vue';
import YearCard from './components/YearCard.vue';

const ui = useUiStore();
const layers = useLayersStore();
const timeline = useTimelineStore();
const wars = useWarsStore();
const people = usePeopleStore();

const data = useGlobeData();

const globeReady = ref(false);
const presentation = ref(false);
/** The year's own appraisal, opened from the index heading. */
const yearOpen = ref(false);
/** The side panel can be folded away to give the globe the full width. */
const panelCollapsed = ref(false);
const selectedPolity = ref<PolityFeature | null>(null);
/** Either column can hold a region or a polity pinned from the map. */
const subjectA = ref<CompareSubject>({ kind: 'region', id: 'eastAsia' });
const subjectB = ref<CompareSubject>({ kind: 'region', id: 'mediterranean' });
const bordersLoaded = ref(false);

/* ── derived ───────────────────────────────────────────────────────────── */

const selectedOrder = computed(() => {
  const ev = ui.selectedEvent;
  if (!ev) return 0;
  const i = data.filteredEvents.value.findIndex((e) => e.key === ev.key);
  return i === -1 ? 0 : i + 1;
});

const borderCount = computed(() => data.windowEvents.value.length);

/* ── helpers ───────────────────────────────────────────────────────────── */

function debounce<T extends (...args: never[]) => void>(fn: T, wait: number) {
  let timer: number | null = null;
  return (...args: Parameters<T>) => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

/* ── globe wiring ──────────────────────────────────────────────────────── */

function onGlobeReady() {
  globeReady.value = true;
  void (async () => {
    // Events first so the globe is useful immediately; the heavy polity files
    // follow on their own without competing for the same bandwidth.
    await data.refreshEvents();
    data.paintEvents();
    await data.refreshPolities();
  })();
}

function onViewSettled() {
  data.onViewSettled();
}

function onPickEvent(event: TimelineEvent | null) {
  if (!event) {
    if (selectedPolity.value === null) ui.selectedEvent = null;
    return;
  }
  // Only one detail card is shown at a time.
  selectedPolity.value = null;
  people.closePerson();
  void wars.select(null);
  ui.selectedEvent = event;
}

function onPickPolity(feature: PolityFeature | null) {
  if (!feature) return;
  ui.selectedEvent = null;
  people.closePerson();
  selectedPolity.value = feature;
}

function flyToEvent(event: TimelineEvent) {
  if (event.lon === null || event.lat === null) return;
  globe.flyTo(event.lon, event.lat, 1_200_000);
}

function jumpToYear(year: number) {
  timeline.setYear(Math.min(YEAR_MAX, Math.max(YEAR_MIN, year)));
}

/**
 * Open the year's own appraisal.
 *
 * It belongs to the year, not to whichever entry happens to be open, so this
 * closes the entry card instead of stacking two panes in the same corner.
 */
function openYearCard() {
  ui.selectedEvent = null;
  selectedPolity.value = null;
  yearOpen.value = true;
}

/**
 * Send the selected polity into one column of the comparison board.
 *
 * The card's compare button used to emit `pin` into `() => {}` — it did nothing
 * at all. The target side is explicit rather than guessed, because guessing
 * meant a second pin silently overwrote the first column.
 */
function onPinPolity(side: 'A' | 'B') {
  const feature = selectedPolity.value;
  if (!feature) return;
  const subject: CompareSubject = { kind: 'polity', feature };
  if (side === 'A') subjectA.value = subject;
  else subjectB.value = subject;
  selectedPolity.value = null;
  ui.view = 'compare';
}

/**
 * Load the modern borders on first use, then apply the current switch state.
 *
 * Two traps live here. `bordersLoaded` must only flip once the load actually
 * succeeded — it used to be set before the await, so one failed attempt (a
 * slow 1 MB GeoJSON) left the flag true forever and later toggles did nothing.
 * And visibility must be applied even when the sources are already loaded:
 * returning early on the cached flag meant the second toggle-on never called
 * `setModernBordersVisible(true)`.
 */
async function ensureBorders() {
  if (!bordersLoaded.value) {
    bordersLoaded.value = await globe.loadModernBorders(NE_FILES.countries110m, NE_FILES.borders50m);
  }
  globe.setModernBordersVisible(layers.showBorders);
}

/* ── wars ──────────────────────────────────────────────────────────────── */

function paintWars() {
  if (!globeReady.value) return;
  const all = wars.located;
  // With the layer off, the war the reader is currently looking at still stays
  // plotted — otherwise opening a war would show a card with no marker.
  const list = layers.showWars
    ? all
    : all.filter((w) => w.warId === wars.selectedId);
  if (!list.length) {
    globe.clearWars();
    return;
  }
  globe.renderWars(list, wars.selectedId, layers.showLabels);
}

function onPickWar(warId: string) {
  ui.selectedEvent = null;
  selectedPolity.value = null;
  people.closePerson();
  void wars.select(warId).then(() => paintWars());
}

function flyToTheatre(warId: string) {
  const loc = wars.locations[warId];
  if (!loc) return;
  globe.flyTo(loc.lon, loc.lat, 3_200_000);
}

/** Fly to a life stage of the open person. */
function flyToStage(at: { lon: number; lat: number }) {
  globe.flyTo(at.lon, at.lat, 900_000);
}

/* ── watchers ──────────────────────────────────────────────────────────── */

const refreshForYear = debounce(() => {
  void data.refreshEvents().then(() => data.paintEvents());
  void data.refreshPolities();
}, 140);

watch(() => timeline.year, refreshForYear);

watch(
  () => data.filteredEvents.value,
  () => {
    if (globeReady.value) data.paintEvents();
  },
);

watch(
  () => [layers.showEvents, layers.showLabels] as const,
  () => {
    if (globeReady.value) data.paintEvents();
  },
);

watch(
  () => layers.showPolities,
  () => {
    if (globeReady.value) void data.refreshPolities();
  },
);

watch(
  () => layers.base,
  (base) => {
    if (globeReady.value) globe.applyImagery(base);
  },
);

watch(
  () => layers.showBorders,
  (visible) => {
    if (!globeReady.value) return;
    if (visible) void ensureBorders();
    else globe.setModernBordersVisible(false);
  },
);

watch(
  () => layers.showWars,
  (on) => {
    if (!globeReady.value) return;
    // Turning the layer on is the first time the war data may be needed, and
    // the side panel may never have been opened.
    if (on) void wars.ensureIndex().then(() => paintWars());
    else paintWars();
  },
);

watch(
  () => [layers.showLabels, wars.selectedId] as const,
  () => paintWars(),
);

watch(
  () => wars.located,
  () => paintWars(),
);

/*
 * Only one detail card may be open at a time.
 *
 * Each opener used to clear the others by hand, which held until some entry
 * point forgot — the year overview, the war list, a polity pin. The result was
 * two cards stacked in the same corner: the lower one invisible and
 * unreachable, and the war card in particular never appearing at all.
 *
 * Watching the sources makes the rule independent of who opened what. Every
 * watcher only acts when its own source becomes non-null, so the nulls it
 * writes cannot bounce back and clear the card that was just opened.
 */
watch(
  () => wars.selectedId,
  (id) => {
    if (!id) return;
    ui.selectedEvent = null;
    selectedPolity.value = null;
    people.closePerson();
    yearOpen.value = false;
  },
);

watch(
  () => ui.selectedEvent,
  (event) => {
    if (!event) return;
    selectedPolity.value = null;
    people.closePerson();
    void wars.select(null);
    yearOpen.value = false;
  },
);

watch(
  () => people.selectedId,
  (id) => {
    if (!id) return;
    ui.selectedEvent = null;
    selectedPolity.value = null;
    void wars.select(null);
    yearOpen.value = false;
  },
);

watch(selectedPolity, (feature) => {
  if (!feature) return;
  ui.selectedEvent = null;
  people.closePerson();
  void wars.select(null);
  yearOpen.value = false;
});

watch(yearOpen, (open) => {
  if (!open) return;
  ui.selectedEvent = null;
  selectedPolity.value = null;
  people.closePerson();
  void wars.select(null);
});

watch(
  () => ui.locale,
  () => {
    data.resetCaches();
    void data.refreshEvents().then(() => data.paintEvents());
  },
);

/* ── keyboard ──────────────────────────────────────────────────────────── */

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;

  switch (event.key) {
    case 'ArrowLeft':
      timeline.nudge(-1);
      event.preventDefault();
      break;
    case 'ArrowRight':
      timeline.nudge(1);
      event.preventDefault();
      break;
    case 'Escape':
      ui.selectedEvent = null;
      selectedPolity.value = null;
      people.closePerson();
      break;
    case 'p':
      presentation.value = !presentation.value;
      break;
    default:
      break;
  }
}

/**
 * Click-away dismissal for the detail cards.
 *
 * Cards are corner overlays on top of the globe, so a click anywhere outside
 * one should close it — that is what every other map interface does, and it
 * saves reaching for the ✕.
 *
 * Registered in the capture phase so the cards are already closed before the
 * canvas handler runs; a click on a different polity then opens its card
 * instead of racing with this dismissal.
 */
function onGlobalPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  // A click inside a card belongs to that card.
  if (target.closest('.card')) return;

  const anyOpen =
    ui.selectedEvent !== null ||
    selectedPolity.value !== null ||
    people.selectedId !== null ||
    wars.selectedId !== null ||
    yearOpen.value;
  if (!anyOpen) return;

  ui.selectedEvent = null;
  selectedPolity.value = null;
  people.closePerson();
  void wars.select(null);
  yearOpen.value = false;
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('pointerdown', onGlobalPointerDown, true);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('pointerdown', onGlobalPointerDown, true);
});
</script>

<template>
  <div class="app" :class="{ presentation }">
    <AppHead v-if="!presentation" @reset-view="globe.resetView()" />

    <main :class="{ 'panel-closed': panelCollapsed }">
      <div class="slot">
        <GlobeStage
          v-show="ui.view === 'explore'"
          @ready="onGlobeReady"
          @view-settled="onViewSettled"
          @pick-event="onPickEvent"
          @pick-polity="onPickPolity"
          @pick-war="onPickWar"
        />
        <CompareBoard
          v-if="ui.view === 'compare'"
          v-model:subject-a="subjectA"
          v-model:subject-b="subjectB"
          :events="data.filteredEvents.value"
          @select="onPickEvent"
        />

        <EventCard
          v-if="ui.selectedEvent && !people.selectedId"
          :event="ui.selectedEvent"
          :order="selectedOrder"
          :total="borderCount"
          @close="ui.selectedEvent = null"
          @fly-to="flyToEvent"
          @jump-to-year="jumpToYear"
        />

        <PolityCard
          v-if="selectedPolity && !people.selectedId"
          :feature="selectedPolity"
          :names="data.polityNames.value"
          @close="selectedPolity = null"
          @pin="onPinPolity"
        />

        <WarCard
          v-if="wars.selectedId"
          @close="wars.select(null)"
          @fly-to-theatre="flyToTheatre"
        />

        <PersonCard
          v-if="people.selectedId"
          @close="people.closePerson()"
          @fly-to="flyToStage"
        />

        <YearCard v-if="yearOpen" @close="yearOpen = false" />
      </div>

      <SidePanel
        v-if="!presentation && !panelCollapsed"
        :events="data.filteredEvents.value"
        :total-before-filter="borderCount"
        @select="onPickEvent"
        @open-year="openYearCard"
        @collapse="panelCollapsed = true"
      />
      <button
        v-else-if="!presentation"
        class="panel-open"
        :title="ui.t('panel.expand')"
        :aria-label="ui.t('panel.expand')"
        @click="panelCollapsed = false"
      >
        ‹
      </button>
    </main>

    <TimeScale v-if="!presentation" />

    <button
      v-if="presentation"
      class="exit-present"
      title="Esc"
      @click="presentation = false"
    >
      {{ ui.t('nav.explore') }}
    </button>
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  display: grid;
  grid-template-rows: var(--head-h) minmax(0, 1fr) var(--foot-h);
}
.app.presentation {
  grid-template-rows: minmax(0, 1fr);
}

main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 304px;
  min-height: 0;
}
.app.presentation main {
  grid-template-columns: minmax(0, 1fr);
}
/* Folded away: the remaining strip is only the reopen handle. */
main.panel-closed {
  grid-template-columns: minmax(0, 1fr) 26px;
}
.panel-open {
  border-left: 1px solid var(--rule-2);
  background: var(--paper-2);
  color: var(--ink-3);
  font-size: 15px;
  line-height: 1;
}
.panel-open:hover {
  color: var(--ink);
  background: var(--card);
}

.slot {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
}
.slot > :first-child {
  flex: 1;
  min-width: 0;
}

.exit-present {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 30;
  border: 1px solid var(--rule-2);
  background: var(--card);
  padding: 6px 14px;
  font-size: var(--fs-sm);
  color: var(--ink-2);
  box-shadow: var(--shadow-1);
}
</style>
