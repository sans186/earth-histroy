<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { INITIAL_VIEW, YEAR_MIN, YEAR_MAX } from '@/config';
import { STORIES } from '@/data/stories';
import type { EventRef } from '@/lib/eventLinks';
import { makePolityScope, withRecordedSpan, type PolityScope } from '@/lib/polityScope';
import { buildTrailScene, recordedSpan } from '@/lib/trajectory';
import { MOBILE_NOTICE_QUERY } from '@/lib/viewport';
import type { StoryStep, Story } from '@/types/story';
import { useGlobeData } from '@/composables/useGlobeData';
import {
  findEventById,
  findPolityLifecycle,
  loadPlaceHistory,
  loadPolityFile,
  loadPolityIndex,
  loadPolityLifecycles,
  loadPolityNames,
  NE_FILES,
  pickCenturyFiles,
} from '@/services/data';
import { polityKey } from '@/lib/polityKey';
import type { SearchHit } from '@/lib/search';
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
import EventCard from './components/EventCard.vue';
import ErrorNotice from './components/ErrorNotice.vue';
import GlobeStage from './components/GlobeStage.vue';
import MapStage from './components/MapStage.vue';
import MobileNotice from './components/MobileNotice.vue';
import PersonCard from './components/PersonCard.vue';
import PersonTrajectory from './components/PersonTrajectory.vue';
import PolityCard from './components/PolityCard.vue';
import SearchPanel from './components/SearchPanel.vue';
import SidePanel from './components/SidePanel.vue';
import SettingsDrawer from './components/SettingsDrawer.vue';
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
/** The full-screen life-trail overlay, opened from the person card. */
const trailOpen = ref(false);
/** The unified settings drawer; it replaced the side panel's「图层」tab. */
const settingsOpen = ref(false);
/** The site-wide search palette, opened from the header. */
const searchOpen = ref(false);

/**
 * Narrow touch screens get a notice instead of the atlas.
 *
 * A desktop window may be just as narrow but still has a fine pointer, so the
 * query requires both — see `lib/viewport.ts`.
 */
const mobileNotice = ref(false);
let mobileQuery: MediaQueryList | null = null;

function onMobileQueryChange(event: MediaQueryListEvent) {
  mobileNotice.value = event.matches;
}

/** About now lives inside the drawer, so opening it puts the drawer away first. */
function openAboutFromSettings() {
  settingsOpen.value = false;
  aboutOpen.value = true;
}
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
  // Only the wars running in the current year are plotted; the open war is
  // always kept, so opening one from the panel never shows a card with no
  // marker after the year has moved past its span. With the layer off, the
  // open war is the only thing that stays.
  const list = layers.showWars ? [...wars.locatedThisYear] : [];
  const open = wars.located.find((w) => w.warId === wars.selectedId);
  if (open && !list.some((w) => w.warId === open.warId)) list.push(open);
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

/* ── search results ────────────────────────────────────────────────────── */

/** Open an event by id, reusing the card's normal entry point. */
async function openSearchEvent(id: string) {
  const found = await findEventById(id, ui.locale);
  if (!found) return;
  jumpToYear(found.year);
  onPickEvent(found);
}

/** Open a person, dismissing the card when the id is not in the shipped data. */
async function openSearchPerson(id: string) {
  await people.openPerson(id);
  if (!people.profile) people.closePerson();
}

/** Open a war, after checking the id against the war index. */
async function openSearchWar(id: string) {
  await wars.ensureIndex();
  if (!wars.index.some((war) => war.warId === id)) return;
  onPickWar(id);
}

/**
 * Open a polity card by its lifecycle key.
 *
 * The tile that owns the requested year carries the geometry, so the century
 * file for that year is searched for a feature with the same normalised name.
 * Lifecycle keys and feature names come from the same source, so this is a
 * lookup rather than a fuzzy match.
 */
async function openSearchPolity(name: string, year: number): Promise<boolean> {
  if (!Object.keys(data.polityNames.value).length) {
    try {
      data.polityNames.value = await loadPolityNames();
    } catch {
      // Names are decorative; the English key still identifies the polity.
    }
  }
  const target = polityKey(name);
  const index = await loadPolityIndex();
  const candidates = pickCenturyFiles(index, year);
  const current = candidates.find((entry) => year >= entry.start && year < entry.end);
  const ordered = current
    ? [current, ...candidates.filter((entry) => entry !== current)]
    : candidates;
  for (const entry of ordered) {
    const collection = await loadPolityFile(entry, 'lod');
    const feature = collection?.features.find(
      (candidate) => polityKey(candidate.properties?.Name ?? '') === target,
    );
    if (!feature) continue;
    jumpToYear(year);
    onPickPolity(feature);
    return true;
  }
  return false;
}

/** The search palette picked a row: move the clock, then open its card. */
async function onSearchSelect(hit: SearchHit) {
  searchOpen.value = false;
  const { id, type, year } = hit.item;
  if (year !== null) jumpToYear(year);
  if (type === 'event') await openSearchEvent(id);
  else if (type === 'person') await openSearchPerson(id);
  else if (type === 'war') await openSearchWar(id);
  else await openSearchPolity(id, year ?? timeline.year);
}

/** Fly to a life stage of the open person. */
function flyToStage(at: { lon: number; lat: number }) {
  flyTo(at.lon, at.lat, 900_000);
}

/**
 * Draw the open person's route.
 *
 * The year is the app's own cursor: the route grows as the reader drags the
 * scale, so borders, events and footprints are always from the same moment.
 * A leg that straddles the cursor is drawn halfway rather than hidden.
 */
function paintTrajectory(focus = false) {
  const profile = people.profile;
  const subjects = profile
    ? [
        {
          personId: profile.personId,
          points: profile.points,
          name: profile.name,
          nameEn: profile.nameEn,
        },
        ...people.trailCompare.map((person) => ({
          personId: person.personId,
          points: person.points,
          name: person.name,
          nameEn: person.nameEn,
        })),
      ]
    : [];
  const scene = subjects.length ? buildTrailScene(subjects, timeline.year) : null;

  if (ui.stage === '3d') globe.renderTrajectory(scene, ui.locale);
  else map2d.renderTrajectory(scene);

  if (!scene?.bounds) {
    framedTrail = null;
    return;
  }

  const trailKey = subjects.map((subject) => subject.personId).join('|');
  const isNew = focus || framedTrail !== trailKey;
  if (!isNew) return;
  framedTrail = trailKey;

  if (ui.stage === '3d') {
    globe.fitTrail(scene.bounds);
  } else {
    map2d.fitTrail(scene.bounds, {
      top: 90,
      // Leave the drawer and the time scale clear of the framed ground.
      bottom: Math.round(window.innerHeight * (trailOpen.value ? 0.46 : 0.1)),
      left: 376,
      right: 90,
    });
  }
}

/** Person whose route the camera was last framed for. */
let framedTrail: string | null = null;

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
  () => wars.locatedThisYear,
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
watch(
  () => people.profile,
  (profile) => {
    if (profile) {
      const [first, last] = recordedSpan(profile.points);
      // A life that has not started yet at the current year would draw nothing.
      if (last !== 0 && (timeline.year < first || timeline.year > last)) {
        timeline.setYear(last);
      }
    }
    framedTrail = null;
    paintTrajectory(true);
  },
);
watch(
  () => people.trailCompare.map((person) => person.personId).join('|'),
  () => {
    // A comparison the current year predates would draw nothing; show its end.
    const lasts = people.trailCompare
      .map((person) => recordedSpan(person.points)[1])
      .filter((year) => year !== 0);
    if (lasts.length && timeline.year < Math.min(...lasts)) {
      timeline.setYear(Math.max(...lasts));
    }
    framedTrail = null;
    paintTrajectory(true);
  },
);
watch(
  () => ui.stage,
  () => paintTrajectory(true),
);
// The trail grows with the shared year, like the borders and the events.
watch(() => timeline.year, () => paintTrajectory());
// The drawer changes how much of the viewport the route has to stay above.
watch(trailOpen, () => paintTrajectory(true));

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

  // The search palette owns the keyboard while it is open.
  if (searchOpen.value) {
    if (event.key === 'Escape') searchOpen.value = false;
    return;
  }

  // The About overlay owns the keyboard while it is open.
  if (aboutOpen.value) {
    if (event.key === 'Escape') aboutOpen.value = false;
    return;
  }

  // The settings drawer closes on Escape before anything else reacts.
  if (settingsOpen.value) {
    if (event.key === 'Escape') settingsOpen.value = false;
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
  // The trail overlay covers the whole viewport and has its own dismissals;
  // letting this run would close the card underneath it and take the trail with it.
  if (trailOpen.value) return;
  // The settings drawer sits above the cards; a click inside it is not a dismissal.
  if (settingsOpen.value) return;
  // The search palette has its own veil and dismissal.
  if (searchOpen.value) return;
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
 * Restore a shared state from the URL.
 *
 * Parameters: `year`, `view` (explore/atlas), `stage` (3d/2d), `event`,
 * `person`, `war`, `polity`, `place`. Unknown values are ignored, so a broken
 * link still lands on the default view. Cards open only after the year is set.
 */
async function applyDeepLink() {
  const params = new URLSearchParams(window.location.search);

  const view = params.get('view');
  if (view === 'explore' || view === 'atlas') ui.setView(view);
  const stage = params.get('stage');
  if (stage === '3d' || stage === '2d') ui.setStage(stage);

  const yearRaw = params.get('year');
  if (yearRaw && /^-?\d+$/.test(yearRaw)) jumpToYear(Number(yearRaw));

  const eventId = params.get('event');
  if (eventId) await openSearchEvent(eventId);

  const personId = params.get('person');
  if (personId) await openSearchPerson(personId);

  const warId = params.get('war');
  if (warId) await openSearchWar(warId);

  const polity = params.get('polity');
  if (polity) await openSearchPolity(polity, timeline.year);

  const id = params.get('place');
  if (!id) return;
  const history = await loadPlaceHistory();
  const city = history?.cities.find((c) => c.id === id);
  if (!city) return;

  ui.setPlaceFocus({ id: city.id, lon: city.lon, lat: city.lat });
  if (globeReady.value) flyTo(city.lon, city.lat, 900_000);
  else deepLinkCamera = { lon: city.lon, lat: city.lat };
}

/**
 * Mirror the shareable state into the address bar.
 *
 * `replaceState`, never `pushState`: scrubbing the timeline or opening a card
 * should not fill the back button with intermediate frames.
 */
function syncUrl() {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  params.set('year', String(timeline.year));
  params.set('view', ui.view);
  params.set('stage', ui.stage);

  const eventId = ui.selectedEvent?.key ?? null;
  if (eventId) params.set('event', eventId);
  else params.delete('event');

  if (people.selectedId) params.set('person', people.selectedId);
  else params.delete('person');

  if (wars.selectedId) params.set('war', wars.selectedId);
  else params.delete('war');

  const polity = ui.polityScope?.key ?? null;
  if (polity) params.set('polity', polity);
  else params.delete('polity');

  if (ui.placeFocus) params.set('place', ui.placeFocus.id);
  else params.delete('place');

  window.history.replaceState(null, '', url);
}

/** URL mirroring waits until the incoming link has been applied. */
let urlSyncReady = false;

watch(
  () => [
    timeline.year,
    ui.view,
    ui.stage,
    ui.selectedEvent?.key ?? null,
    people.selectedId,
    wars.selectedId,
    ui.polityScope?.key ?? null,
    ui.placeFocus?.id ?? null,
  ] as const,
  () => {
    if (urlSyncReady) syncUrl();
  },
);

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('pointerdown', onGlobalPointerDown, true);
  mobileQuery = window.matchMedia(MOBILE_NOTICE_QUERY);
  mobileNotice.value = mobileQuery.matches;
  mobileQuery.addEventListener('change', onMobileQueryChange);
  void applyDeepLink()
    .catch(() => undefined)
    .finally(() => {
      urlSyncReady = true;
      syncUrl();
    });
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('pointerdown', onGlobalPointerDown, true);
  mobileQuery?.removeEventListener('change', onMobileQueryChange);
  mobileQuery = null;
});
</script>

<template>
  <MobileNotice v-if="mobileNotice" />
  <div v-else class="app" :class="{ presentation, 'story-mode': storyOpen }">
    <AppHead
      v-if="!presentation"
      @reset-view="resetStage"
      @open-story="openStoryPicker"
      @open-settings="settingsOpen = true"
      @open-search="searchOpen = true"
    />
    <SearchPanel :open="searchOpen" @close="searchOpen = false" @select="onSearchSelect" />

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
        <AtlasBoard
          v-if="ui.view === 'atlas'"
          :names="data.polityNames.value"
          @pick-polity="onPickPolity"
          @pick-war="onPickWar"
          @pick-event="onPickEvent"
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
          @close="selectedPolity = null"
          @scope="onScopeToPolity"
        />

        <WarCard
          v-if="wars.selectedId"
          @close="wars.select(null)"
          @fly-to-theatre="flyToTheatre"
        />

        <PersonCard
          v-if="people.selectedId && !trailOpen"
          @close="people.closePerson()"
          @fly-to="flyToStage"
          @open-trail="trailOpen = true"
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

    <PersonTrajectory v-if="trailOpen" @close="trailOpen = false" />

    <SettingsDrawer
      :open="settingsOpen"
      :certainty-counts="data.certaintyCounts.value"
      @open-about="openAboutFromSettings"
      @close="settingsOpen = false"
    />

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
