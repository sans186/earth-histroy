<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { INITIAL_VIEW, YEAR_MIN, YEAR_MAX } from '@/config';
import { STORIES } from '@/data/stories';
import type { CompareSubject } from '@/lib/compare';
import type { EventRef } from '@/lib/eventLinks';
import { makePolityScope, withRecordedSpan, type PolityScope } from '@/lib/polityScope';
import type { StoryStep, Story } from '@/types/story';
import { useGlobeData } from '@/composables/useGlobeData';
import {
  findEventById,
  findPolityLifecycle,
  loadPlaceHistory,
  loadPolityLifecycles,
  NE_FILES,
} from '@/services/data';
import { globe } from '@/services/globe';
import { map2d } from '@/services/map2d';
import { useLayersStore } from '@/stores/layers';
import { usePeopleStore } from '@/stores/people';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';
import { useWarsStore } from '@/stores/wars';
import type { PolityFeature, StageMode, TimelineEvent } from '@/types';
import AppHead from './components/AppHead.vue';
import AboutPage from './components/AboutPage.vue';
import AtlasBoard from './components/AtlasBoard.vue';
import CompareBoard from './components/CompareBoard.vue';
import EventCard from './components/EventCard.vue';
import ErrorNotice from './components/ErrorNotice.vue';
import GlobeStage from './components/GlobeStage.vue';
import MapStage from './components/MapStage.vue';
import PersonCard from './components/PersonCard.vue';
import PolityCard from './components/PolityCard.vue';
import SidePanel from './components/SidePanel.vue';
import StoryPicker from './components/StoryPicker.vue';
import StoryPlayer from './components/StoryPlayer.vue';
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
/** Guided story mode: a scripted tour with the sidebar folded away. */
const storyOpen = ref(false);
/** The chooser appears first; the player opens only once a story is picked. */
const storyPickerOpen = ref(false);
const story = ref<Story>(STORIES[0]);
/** The step the story player is currently showing, so the region can be re-plotted. */
const storyStep = ref<StoryStep | null>(null);
/** The story player instance, so App can hand control back after a route animation. */
const playerRef = ref<InstanceType<typeof StoryPlayer> | null>(null);
/**
 * True while a route transition is handing the finished leg back to the player.
 * The step's own camera move would undo the framing that just landed, so it is
 * skipped for that one step.
 */
let arrivingFromTransition = false;
/** Data sources, licences and the AI-content disclaimer. */
const aboutOpen = ref(false);
/** Year and camera to put back when the story closes. */
let storyReturn: {
  year: number;
  camera: { lon: number; lat: number; height?: number; zoom?: number };
} | null = null;
/** The renderer the reader was on before a story forced 3D, restored on close. */
let prevStage: StageMode | null = null;
/** The year's own appraisal, opened from the index heading. */
const yearOpen = ref(false);
/** The side panel can be folded away to give the globe the full width. */
const panelCollapsed = ref(false);
/**
 * The open polity, kept in the UI store.
 *
 * Three list panels filter by it now, so a component-local ref would have meant
 * threading the feature through every path that can select one. This computed
 * keeps the existing template and handlers working unchanged.
 */
const selectedPolity = computed({
  get: () => ui.polityScope?.feature ?? null,
  set: (feature: PolityFeature | null) => {
    if (!feature) {
      ui.setPolityScope(null);
      return;
    }
    const scope = makePolityScope(feature, data.polityNames.value);
    ui.setPolityScope(scope);
    void widenPolitySpan(scope);
  },
});

/**
 * Give the scope the polity's recorded span.
 *
 * A tile in `polities_*.json` covers one century, so its FromYear/ToYear are the
 * slice's bounds — the 1911 tile of the Qing dynasty reads 1911–1911. Filtering
 * on that would hide every earlier war and person, so the span comes from
 * `polity_lifecycles.json`, which aggregates every slice the polity appears in.
 */
async function widenPolitySpan(scope: PolityScope) {
  const raw = scope.feature.properties?.Name ?? '';
  if (!raw) return;
  const lifecycles = await loadPolityLifecycles();
  const life = findPolityLifecycle(raw, lifecycles);
  if (!life) return;
  // The reader may have picked another polity while this was loading.
  if (ui.polityScope?.key !== scope.key) return;
  ui.setPolityScope(withRecordedSpan(scope, life.firstYear, life.lastYear));
}
/** Either column can hold a region or a polity pinned from the map. */
const subjectA = ref<CompareSubject>({ kind: 'region', id: 'eastAsia' });
const subjectB = ref<CompareSubject>({ kind: 'region', id: 'mediterranean' });
const bordersLoaded = ref(false);

/**
 * A `?place=` link can arrive before the renderer exists. The coordinate is
 * parked here and flown to once the stage reports ready.
 */
let deepLinkCamera: { lon: number; lat: number } | null = null;

/**
 * The reader's camera, parked when a story closed across a stage switch (2D →
 * forced 3D → back to 2D). The remounted renderer isn't ready yet, so it is
 * flown to from `onStageReady`.
 */
let restoreCamera: { lon: number; lat: number; height?: number; zoom?: number } | null = null;

/**
 * Which comparison column already holds the open polity.
 *
 * The card's two buttons used to look like a mode switch; showing "already in
 * column A" is what makes them read as "put this polity there".
 */
const pinnedSide = computed<'A' | 'B' | null>(() => {
  const name = selectedPolity.value?.properties?.Name;
  if (!name) return null;
  const holds = (subject: CompareSubject) =>
    subject.kind === 'polity' && subject.feature.properties?.Name === name;
  if (holds(subjectA.value)) return 'A';
  if (holds(subjectB.value)) return 'B';
  return null;
});

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

function onStageReady() {
  globeReady.value = true;
  // A stage switch remounts the renderer, which drops any plotted story region;
  // re-plot it now that the new renderer is up.
  if (storyOpen.value && storyStep.value) showStoryRegion(storyStep.value);
  // A story that closed across a stage switch parked the reader's camera here.
  if (restoreCamera) {
    const c = restoreCamera;
    restoreCamera = null;
    if (ui.stage === '3d') globe.flyTo(c.lon, c.lat, c.height ?? 1_200_000);
    else map2d.flyTo(c.lon, c.lat, c.zoom);
  }
  void (async () => {
    // Events first so the map is useful immediately; the heavy polity files
    // follow on their own without competing for the same bandwidth.
    await data.refreshEvents();
    // A ?place= link asked for a camera move before the renderer existed.
    if (deepLinkCamera) {
      flyTo(deepLinkCamera.lon, deepLinkCamera.lat, 1_200_000);
      deepLinkCamera = null;
    }
    // The flat map loads its own polity geometry as a GeoJSON source, so this
    // 3D-only pass would be pure waste there.
    if (ui.stage === '3d') {
      data.paintEvents();
      await data.refreshPolities();
    }
  })();
}

function onViewSettled() {
  // Culling is a 3D concern; the flat map draws every feature it has.
  if (ui.stage === '3d') data.onViewSettled();
}

/** One entry point for both renderers. */
function resetStage() {
  if (ui.stage === '3d') globe.resetView();
  else map2d.resetView();
}

/** The shared error banner's Retry action. */
function onDataRetry() {
  void data.retryData();
}

function flyTo(lon: number, lat: number, height: number) {
  if (ui.stage === '3d') return globe.flyTo(lon, lat, height);
  return map2d.flyTo(lon, lat);
}

/** The current camera, in whichever renderer is mounted. */
function currentCamera() {
  if (ui.stage === '3d') return globe.cameraView();
  return map2d.cameraView() ?? { lon: INITIAL_VIEW.lon, lat: INITIAL_VIEW.lat, zoom: 2 };
}

/* ── story mode ────────────────────────────────────────────────────────── */

function openStoryPicker() {
  // The chooser replaces a running tour rather than stacking on top of it.
  if (storyOpen.value) closeStory();
  storyPickerOpen.value = true;
}

function startStory(next: Story) {
  storyPickerOpen.value = false;
  openStory(next);
}

function openStory(next: Story = STORIES[0]) {
  if (storyOpen.value) return;
  story.value = next;
  storyReturn = { year: timeline.year, camera: currentCamera() };
  // The route arcs only read as flights on the globe, so pin the story to 3D
  // and remember where the reader was so closing puts them back.
  prevStage = ui.stage;
  storyOpen.value = true;
  if (ui.stage !== '3d') ui.setStage('3d');

  // The tour owns the screen: no detail card, and the map must be visible.
  ui.selectedEvent = null;
  selectedPolity.value = null;
  people.closePerson();
  void wars.select(null);
  yearOpen.value = false;
  ui.view = 'explore';

  // Camera inertia would keep drifting against the next scripted flyTo.
  if (ui.stage === '3d') globe.setCameraInertia(false);
}

/** Highlight the story step's region in whichever renderer is mounted. */
function showStoryRegion(step: StoryStep) {
  if (ui.stage === '3d') globe.showStoryRegion(step);
  else map2d.showStoryRegion(step);
}

function clearStoryRegion() {
  if (ui.stage === '3d') globe.clearStoryRegion();
  else map2d.clearStoryRegion();
}

async function onStoryStep(step: StoryStep) {
  storyStep.value = step;
  timeline.setYear(step.year);
  // Tear down the previous highlight before the camera leaves, then draw the
  // new one only once the flight has arrived.
  clearStoryRegion();
  // A transition has already framed and flown to this step; flying again would
  // yank the camera back out and undo that framing.
  if (arrivingFromTransition) {
    arrivingFromTransition = false;
    showStoryRegion(step);
    return;
  }
  await flyTo(step.lon, step.lat, step.height ?? 1_200_000);
  // The story may have closed or moved on while the camera was flying.
  if (!storyOpen.value || storyStep.value !== step) return;
  showStoryRegion(step);
}

/**
 * Animate the route from one step to the next, then hand the player back.
 *
 * The route mode belongs to the step being reached, so a sea leg reads as a sea
 * leg in both directions. The map call owns every camera move and the route
 * line; the player only resumes its clock once the flight has landed.
 */
async function onStoryTransition({ from, to }: { from: StoryStep; to: StoryStep }) {
  const mode = to.route ?? 'air';
  if (ui.stage === '3d') {
    await globe.animateStoryRoute(from, to, mode);
  } else {
    await map2d.animateStoryRoute(from, to, mode);
  }

  // Flag the handoff so the step's own camera move is skipped for this one step.
  arrivingFromTransition = true;
  playerRef.value?.finishTransition();
  arrivingFromTransition = false;
}

function closeStory() {
  if (!storyOpen.value) return;
  // Any route line still growing must be torn down before the view resets.
  globe.cancelStoryRoute();
  map2d.cancelStoryRoute();
  clearStoryRegion();
  storyStep.value = null;
  storyOpen.value = false;
  if (ui.stage === '3d') globe.setCameraInertia(true);

  // Put the reader back on their original renderer, unless they switched it
  // themselves while the tour was open.
  const switchedStage = prevStage !== null && prevStage !== '3d' && ui.stage === '3d';
  if (switchedStage) ui.setStage(prevStage!);
  prevStage = null;

  const back = storyReturn;
  storyReturn = null;
  if (!back) return;

  // Restore the cursor first, then the camera that framed it.
  timeline.setYear(back.year);
  if (switchedStage) {
    // The remounted renderer isn't ready yet; onStageReady flies it.
    restoreCamera = { lon: back.camera.lon, lat: back.camera.lat, zoom: back.camera.zoom };
  } else if (ui.stage === '3d') {
    globe.flyTo(back.camera.lon, back.camera.lat, back.camera.height ?? 1_200_000);
  } else {
    map2d.flyTo(back.camera.lon, back.camera.lat, back.camera.zoom);
  }
}

/* The flat map subscribes to the stores directly, so these 3D-only passes are
 * gated in one place instead of at every call site. */
function paintEvents3d() {
  if (ui.stage === '3d' && globeReady.value) data.paintEvents();
}

function refreshPolities3d() {
  if (ui.stage === '3d' && globeReady.value) void data.refreshPolities();
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
  flyTo(event.lon, event.lat, 1_200_000);
}

function jumpToYear(year: number) {
  timeline.setYear(Math.min(YEAR_MAX, Math.max(YEAR_MIN, year)));
}

/**
 * Follow a cross reference to the entry it names.
 *
 * The reference carries the target's id ("1912-001"), whose prefix is the year
 * the entry is filed under, so the card can open exactly that event instead of
 * only moving the clock to its year. Falls back to the year when the entry is
 * not in the shipped data.
 */
async function openEventRef(ref: EventRef) {
  if (ref.id) {
    const found = await findEventById(ref.id, ui.locale);
    if (found) {
      jumpToYear(found.year);
      onPickEvent(found);
      return;
    }
  }
  if (ref.year !== null) jumpToYear(ref.year);
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
/**
 * Filter the three lists (and the globe's events) by the open polity.
 *
 * Turning it on also unfolds the side panel: the switch lives on the card, but
 * what it changes is only visible in the lists.
 */
function onScopeToPolity() {
  if (!ui.polityScope) return;
  ui.toggleScopeToPolity();
  if (ui.scopeToPolity) panelCollapsed.value = false;
}

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
  flyTo(loc.lon, loc.lat, 3_200_000);
}

/** Fly to a life stage of the open person. */
function flyToStage(at: { lon: number; lat: number }) {
  flyTo(at.lon, at.lat, 900_000);
}

/**
 * Draw the open person's route.
 *
 * The coordinates were always in the profile; nothing drew them, so "轨迹" meant
 * a list of places the card could fly to one at a time. Consecutive stages often
 * share a city (Ada Lovelace never left London), so repeats are collapsed before
 * drawing — otherwise the line has no shape and the nodes pile up.
 */
function paintTrajectory() {
  const points = [...(people.profile?.points ?? [])].sort((a, b) => a.year - b.year);
  const stops: Array<{ lon: number; lat: number }> = [];
  let last = '';
  for (const point of points) {
    if (!point.coords) continue;
    const [lon, lat] = point.coords;
    const key = `${lon.toFixed(2)},${lat.toFixed(2)}`;
    if (key === last) continue;
    stops.push({ lon, lat });
    last = key;
  }

  if (!stops.length) {
    globe.clearTrajectory();
    map2d.clearTrajectory();
    return;
  }
  if (ui.stage === '3d') globe.renderTrajectory(stops);
  else map2d.renderTrajectory(stops);
}

/* ── watchers ──────────────────────────────────────────────────────────── */

const refreshForYear = debounce(() => {
  /*
   * A drag on the scale rewrites `year` on every pointer move, so this debounce
   * never gets its quiet period and each tick queues another window of files.
   * Nothing is loaded until the reader lets go; the release watcher below runs
   * the single refresh that matters.
   */
  if (timeline.scrubbing) return;
  void data.refreshEvents().then(() => paintEvents3d());
  refreshPolities3d();
}, 140);

watch(() => timeline.year, refreshForYear);

watch(
  () => timeline.scrubbing,
  (scrubbing) => {
    if (scrubbing) return;
    refreshForYear();
  },
);

watch(
  () => data.filteredEvents.value,
  () => {
    paintEvents3d();
  },
);

watch(
  () => [layers.showEvents, layers.showLabels] as const,
  () => {
    paintEvents3d();
  },
);

watch(
  () => layers.showPolities,
  () => {
    refreshPolities3d();
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

watch(aboutOpen, (open) => {
  if (!open) return;
  ui.selectedEvent = null;
  selectedPolity.value = null;
  people.closePerson();
  void wars.select(null);
  yearOpen.value = false;
});

/*
 * The route follows the open profile, and is redrawn when the reader swaps
 * between the globe and the flat map — the two renderers keep separate scenes,
 * so a route painted in one is invisible in the other.
 */
watch(() => people.profile, paintTrajectory);
watch(() => ui.stage, paintTrajectory);

watch(
  () => ui.locale,
  () => {
    data.resetCaches();
    void data.refreshEvents().then(() => paintEvents3d());
  },
);

/* ── keyboard ──────────────────────────────────────────────────────────── */

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;

  // The About overlay owns the keyboard while it is open.
  if (aboutOpen.value) {
    if (event.key === 'Escape') aboutOpen.value = false;
    return;
  }

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
  // The About overlay has its own close affordances.
  if (aboutOpen.value) return;
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

/* ── places ────────────────────────────────────────────────────────────── */

/** The「地点」tab asked to frame a place. */
function onPlaceLocate(at: { lon: number; lat: number }) {
  flyTo(at.lon, at.lat, 900_000);
}

/**
 * `?place=<id>&year=<year>` — the shareable form of "this place, this year".
 *
 * The place list is the authority on coordinates, so the id is resolved there
 * rather than duplicated in the URL.
 */
async function applyDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const yearRaw = params.get('year');
  if (yearRaw && /^-?\d+$/.test(yearRaw)) jumpToYear(Number(yearRaw));

  const id = params.get('place');
  if (!id) return;
  const history = await loadPlaceHistory();
  const city = history?.cities.find((c) => c.id === id);
  if (!city) return;

  ui.setPlaceFocus({ id: city.id, lon: city.lon, lat: city.lat });
  if (globeReady.value) flyTo(city.lon, city.lat, 900_000);
  else deepLinkCamera = { lon: city.lon, lat: city.lat };
}

// Keep the address bar shareable without adding a router for two parameters.
watch(
  () => ui.placeFocus,
  (focus) => {
    const url = new URL(window.location.href);
    if (focus) url.searchParams.set('place', focus.id);
    else url.searchParams.delete('place');
    window.history.replaceState(null, '', url);
  },
);

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('pointerdown', onGlobalPointerDown, true);
  void applyDeepLink();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('pointerdown', onGlobalPointerDown, true);
});
</script>

<template>
  <div class="app" :class="{ presentation, 'story-mode': storyOpen }">
    <AppHead
      v-if="!presentation"
      @reset-view="resetStage"
      @open-story="openStoryPicker"
      @open-about="aboutOpen = true"
    />

    <main :class="{ 'panel-closed': panelCollapsed }">
      <div class="slot">
        <GlobeStage
          v-if="ui.stage === '3d'"
          v-show="ui.view === 'explore'"
          @ready="onStageReady"
          @view-settled="onViewSettled"
          @pick-event="onPickEvent"
          @pick-polity="onPickPolity"
          @pick-war="onPickWar"
        />
        <MapStage
          v-else
          v-show="ui.view === 'explore'"
          :events="data.filteredEvents.value"
          :names="data.polityNames.value"
          @ready="onStageReady"
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
          :names="data.polityNames.value"
          @select="onPickEvent"
        />
        <AtlasBoard
          v-if="ui.view === 'atlas'"
          :names="data.polityNames.value"
          @pick-polity="onPickPolity"
          @pick-war="onPickWar"
        />

        <EventCard
          v-if="ui.selectedEvent && !people.selectedId"
          :event="ui.selectedEvent"
          :order="selectedOrder"
          :total="borderCount"
          @close="ui.selectedEvent = null"
          @fly-to="flyToEvent"
          @jump-to-year="jumpToYear"
          @open-ref="openEventRef"
        />

        <PolityCard
          v-if="selectedPolity && !people.selectedId"
          :feature="selectedPolity"
          :names="data.polityNames.value"
          :pinned="pinnedSide"
          @close="selectedPolity = null"
          @pin="onPinPolity"
          @scope="onScopeToPolity"
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

        <ErrorNotice @retry="onDataRetry" />
      </div>

      <SidePanel
        v-if="!presentation && !storyOpen && !panelCollapsed"
        :events="data.filteredEvents.value"
        :total-before-filter="borderCount"
        :certainty-counts="data.certaintyCounts.value"
        @select="onPickEvent"
        @open-year="openYearCard"
        @collapse="panelCollapsed = true"
        @locate="onPlaceLocate"
        @polity="onPickPolity"
      />
      <button
        v-else-if="!presentation && !storyOpen"
        class="panel-open"
        :title="ui.t('panel.expand')"
        :aria-label="ui.t('panel.expand')"
        @click="panelCollapsed = false"
      >
        ‹
      </button>
    </main>

    <TimeScale v-if="!presentation" />

    <AboutPage v-if="aboutOpen" @close="aboutOpen = false" />

    <StoryPicker
      v-if="storyPickerOpen"
      :stories="STORIES"
      @select="startStory"
      @close="storyPickerOpen = false"
    />

    <StoryPlayer
      v-if="storyOpen"
      ref="playerRef"
      :story="story"
      @step="onStoryStep"
      @transition="onStoryTransition"
      @close="closeStory"
    />

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

/* Story mode gives the map the full width. The panel is also unmounted in the
   template; this keeps the grid honest for the transition frame. */
.app.story-mode main {
  grid-template-columns: minmax(0, 1fr);
}
.app.story-mode :deep(.player) {
  bottom: calc(var(--foot-h) + 16px);
}

main {
  display: grid;
  /* The side column carries the tab strip, the year heading and full event
   * titles; 304px clipped two-line titles and squeezed the tab labels. */
  grid-template-columns: minmax(0, 1fr) 348px;
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
