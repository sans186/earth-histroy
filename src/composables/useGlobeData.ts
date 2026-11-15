import { computed, ref, watch } from 'vue';
import { YEAR_WINDOW } from '@/config';
import { scopeHasPoint, scopeOverlapsYears } from '@/lib/polityScope';
import {
  clearEventCache,
  clearPolityCache,
  loadEventWindow,
  loadPolityFile,
  loadPolityIndex,
  loadPolityNames,
  pickCenturyFiles,
  type PolityTier,
} from '@/services/data';
import { filterPolities, globe, prepareFeature } from '@/services/globe';
import { useLayersStore } from '@/stores/layers';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';
import type { CenturyEntry, PreparedPolity, TimelineEvent } from '@/types';

/**
 * Keeps the globe in sync with the stores.
 *
 * Two rules matter here:
 *   1. every async load carries a generation counter, so a slow polity file
 *      that resolves after the user moved on cannot paint stale geometry;
 *   2. the year's own century is rendered first and its neighbours follow in
 *      the background — the shipped polity files are tens of megabytes, and
 *      blocking the whole interface on them would be dishonest about the cost.
 */
/**
 * A cheap, order-sensitive fingerprint of a render input.
 *
 * The renderer tears down and rebuilds every Cesium primitive it owns, so it
 * is only worth calling when the input actually changed. These lists run to a
 * few thousand entries and the check happens on every camera settle, so the
 * keys are folded with FNV-1a rather than materialised into one long string.
 */
function fingerprint<T>(list: T[], key: (item: T) => string): string {
  let hash = 2166136261;
  for (const item of list) {
    const text = key(item);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `${list.length}:${(hash >>> 0).toString(36)}`;
}

/** What determines an event marker's appearance: identity plus position. */
function eventKey(ev: TimelineEvent): string {
  return `${ev.key}\u0001${ev.lon},${ev.lat}`;
}

/** What determines a polity polygon: identity plus its span. Geometry itself
 *  is immutable per file, and the tier is folded in separately. */
function polityKey(item: PreparedPolity): string {
  return `${item.name}\u0001${item.fromYear}`;
}

export function useGlobeData() {
  const timeline = useTimelineStore();
  const layers = useLayersStore();
  const ui = useUiStore();

  const windowEvents = ref<TimelineEvent[]>([]);
  const polityNames = ref<Record<string, string>>({});

  /*
   * Pull the English→Chinese name map at start-up, not from the polity render
   * path. It used to be fetched only inside `refreshPolities`, so anything that
   * needed Chinese polity names before the layer had painted — the comparison
   * column headers above all — fell back to the English original and stayed
   * there, which is exactly the "still English in Chinese mode" bug.
   */
  void ensurePolityNames();

  /**
   * Prepared geometry, keyed by tier and century file, shared across renders.
   *
   * Both tiers stay cached on purpose: the camera crosses the LOD threshold on
   * every deep zoom, and re-parsing the geometry each time would give back the
   * seconds the LOD tier exists to save.
   */
  const preparedByFile = new Map<string, PreparedPolity[]>();

  let eventGen = 0;
  let polityGen = 0;
  let eventAbort: AbortController | null = null;
  /** Set once a window has landed, so later loads stop veiling the interface. */
  let eventsLoadedOnce = false;
  /** Tier currently drawn; `null` until the first polity load finishes. */
  let activeTier: PolityTier | null = null;
  /**
   * Fingerprints of what is currently on the globe.
   *
   * A camera settle used to rebuild every entity whether or not the visible
   * set had changed — which, at world zoom, is the common case. Comparing
   * these first turns most settles into a no-op.
   */
  let lastEventSignature = '';
  let lastPolitySignature = '';

  const filteredEvents = computed(() => {
    const list = windowEvents.value.filter((e) => layers.isActive(e.category));

    /*
     * Filtering by the open polity also trims the globe, not just the sidebar:
     * a reader who scopes the panel to one empire expects the map to agree with
     * it. Events carry coordinates, so this is the one list where the spatial
     * test is exact rather than a name guess.
     */
    const scope = ui.scopeToPolity ? ui.polityScope : null;
    if (!scope) return list;
    return list.filter(
      (e) => scopeHasPoint(scope, e.lon, e.lat) && scopeOverlapsYears(scope, e.year, e.year),
    );
  });

  const locatedCount = computed(
    () => filteredEvents.value.filter((e) => e.lon !== null && e.lat !== null).length,
  );

  /* ── events ───────────────────────────────────────────────────────────── */

  async function refreshEvents() {
    const gen = ++eventGen;
    eventAbort?.abort();
    const controller = new AbortController();
    eventAbort = controller;

    /*
     * Only the first load is allowed to veil the interface. Later ones happen
     * on every timeline move; blocking there is what made a drag feel like a
     * page reload rather than a scrub.
     */
    const done = ui.beginTask('loading.events', !eventsLoadedOnce);
    try {
      const result = await loadEventWindow(
        timeline.year,
        ui.locale,
        YEAR_WINDOW,
        controller.signal,
      );
      if (gen !== eventGen) return;
      windowEvents.value = result.events;
      eventsLoadedOnce = true;
      ui.setError(null);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      if (gen !== eventGen) return;
      ui.setError((err as Error).message || String(err));
    } finally {
      // Always released: each call incremented its own task counter, so gating
      // this on the generation leaked one blocking task per superseded reload
      // and left the veil up for good.
      done();
    }
  }

  function paintEvents() {
    const list = layers.showEvents ? filteredEvents.value : [];
    // Only the renderer caps labels (MAX_LABELS). Gating on `list.length <= 60`
    // here as well meant the switch did nothing in any busy year — which is
    // every year a reader is likely to look at.
    const signature = `${layers.showLabels ? 'L' : '-'}|${fingerprint(list, eventKey)}`;
    if (signature !== lastEventSignature) {
      globe.renderEvents(list, { labels: layers.showLabels });
      lastEventSignature = signature;
    }
    layers.eventCount = list.length;
    layers.locatedCount = locatedCount.value;
  }

  /* ── polities ─────────────────────────────────────────────────────────── */

  async function ensurePolityNames() {
    if (Object.keys(polityNames.value).length > 0) return;
    polityNames.value = await loadPolityNames();
  }

  async function preparedFor(entry: CenturyEntry, tier: PolityTier): Promise<PreparedPolity[]> {
    const key = `${tier}:${entry.file}`;
    const cached = preparedByFile.get(key);
    if (cached) return cached;
    const collection = await loadPolityFile(entry, tier);
    if (!collection) return [];
    const list: PreparedPolity[] = [];
    for (const feature of collection.features) {
      const item = prepareFeature(feature);
      if (item) list.push(item);
    }
    preparedByFile.set(key, list);
    return list;
  }

  function paintPolities(pool: PreparedPolity[], year: number) {
    // Second gate: a stale async paint must never resurrect a hidden layer.
    if (!layers.showPolities) return;
    const cap = globe.currentPolityCap();
    const { shown, matched } = filterPolities(pool, year, globe.visibleRect(), cap);

    // The tier belongs in the identity: one feature carries different geometry
    // in each tier, so a tier switch must never be mistaken for a no-op.
    // The tier and the language both change what the layer must draw; the label
    // switch does not, since names are toggled in place.
    const signature = `${activeTier ?? ''}|${ui.locale}|${fingerprint(shown, polityKey)}`;
    if (signature !== lastPolitySignature) {
      globe.renderPolities(shown.map((s) => s.feature), polityNames.value, {
        labels: layers.showPolityNames,
        locale: ui.locale,
      });
      lastPolitySignature = signature;
    }

    layers.polityStatus = {
      year,
      shown: shown.length,
      matched,
      cap,
      hidden: Math.max(0, matched - shown.length),
      partsHidden: globe.withheldPartCount(),
      loading: false,
      ready: true,
    };
  }

  async function refreshPolities() {
    if (!layers.showPolities) {
      // Bump the generation as well: without it a load already in flight stays
      // "current" and paints onto a layer the reader has just switched off.
      polityGen += 1;
      activeTier = null;
      // The globe is empty now, so the fingerprint that described the previous
      // render must not survive — otherwise switching back on would compare
      // equal and draw nothing.
      lastPolitySignature = '';
      globe.clearPolities();
      layers.polityStatus = {
        ...layers.polityStatus,
        shown: 0,
        matched: 0,
        hidden: 0,
        partsHidden: 0,
        loading: false,
        ready: false,
      };
      return;
    }

    const gen = ++polityGen;
    const year = timeline.year;
    // The tier is sampled once per load, so a camera move mid-flight cannot
    // make one refresh mix two levels of detail.
    const tier = globe.polityTier();
    activeTier = tier;
    const done = ui.beginTask('loading.polities', false);

    layers.polityStatus = { ...layers.polityStatus, loading: true, year };

    try {
      const index = await loadPolityIndex();
      if (gen !== polityGen) return;

      const entries = pickCenturyFiles(index, year);
      if (!entries.length) {
        lastPolitySignature = '';
        globe.clearPolities();
        return;
      }

      await ensurePolityNames();

      // Pass 1 — the century the current year actually belongs to.
      const own = entries.find((e) => year >= e.start && year < e.end) ?? entries[0];
      const ownList = await preparedFor(own, tier);
      if (gen !== polityGen) return;
      paintPolities(ownList, year);

      // Pass 2 — neighbouring centuries. Opt-in only: these files run to tens
      // of megabytes each, and pulling them unprompted would stall the globe.
      const rest = layers.adjacentCenturies
        ? entries.filter((e) => e.file !== own.file)
        : [];
      if (!rest.length) {
        done();
        return;
      }
      const others = (await Promise.all(rest.map((entry) => preparedFor(entry, tier)))).flat();
      if (gen !== polityGen) return;
      paintPolities([...ownList, ...others], year);
    } catch (err) {
      if (gen !== polityGen) return;
      // Polities are an enhancement: report the failure, keep events alive.
      ui.setError((err as Error).message || String(err));
      layers.polityStatus = { ...layers.polityStatus, loading: false, ready: false };
    } finally {
      if (gen === polityGen) done();
    }
  }

  /** After the camera settles, re-cull with the new cap and viewport. */
  function onViewSettled() {
    if (!layers.showPolities) return;

    const tier = globe.polityTier();
    if (activeTier !== null && tier !== activeTier) {
      // The camera crossed the LOD threshold, so different geometry has to be
      // fetched — culling alone cannot produce detail that was never loaded.
      void refreshPolities();
      return;
    }

    // Only the active tier: both are cached, and painting them together would
    // draw every polity twice.
    const pool: PreparedPolity[] = [];
    for (const [key, list] of preparedByFile) {
      if (key.startsWith(`${tier}:`)) pool.push(...list);
    }
    if (!pool.length) return;
    paintPolities(pool, timeline.year);
  }

  function resetCaches() {
    clearEventCache();
    clearPolityCache();
    preparedByFile.clear();
    activeTier = null;
    // Caches are gone, so anything the globe still holds is no longer described
    // by these fingerprints.
    lastEventSignature = '';
    lastPolitySignature = '';
    windowEvents.value = [];
    eventsLoadedOnce = false;
  }

  // Toggling names is a visibility change, not new geometry.
  watch(
    () => layers.showPolityNames,
    (on) => globe.setPolityLabelsVisible(on),
  );

  return {
    windowEvents,
    filteredEvents,
    locatedCount,
    polityNames,
    refreshEvents,
    refreshPolities,
    paintEvents,
    onViewSettled,
    resetCaches,
  };
}
