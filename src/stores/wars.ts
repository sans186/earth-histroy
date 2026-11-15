import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getEra } from '@/config';
import { scopeHasPoint, scopeOverlapsYears, type PolityScope } from '@/lib/polityScope';
import { battleList, clearWarCache, loadWarIndex, loadWarLocations, loadWarProfile } from '@/services/war-data';
import { useTimelineStore } from '@/stores/timeline';
import { useUiStore } from '@/stores/ui';
import type { WarIndexItem, WarLocation, WarProfile } from '@/types';

export type WarSort = 'start' | 'battles' | 'name';

export const useWarsStore = defineStore('wars', () => {
  const timeline = useTimelineStore();
  const ui = useUiStore();

  const index = ref<WarIndexItem[]>([]);
  const locations = ref<Record<string, WarLocation>>({});
  const loaded = ref(false);

  const selectedId = ref<string | null>(null);
  const profile = ref<WarProfile | null>(null);

  const query = ref('');
  const sort = ref<WarSort>('start');
  /** Only wars whose span overlaps the current year window. */
  const onlyNearYear = ref(false);

  const loadingIndex = ref(false);
  const loadingProfile = ref(false);

  const selected = computed(
    () => index.value.find((w) => w.warId === selectedId.value) ?? null,
  );

  const battles = computed(() => battleList(profile.value));

  /**
   * A war is attached to a polity by its theatre centroid plus its span. The
   * index has no geography of its own, but `war_locations.json` gives every war
   * one point — the same point the map draws.
   */
  function matchesScope(war: WarIndexItem, scope: PolityScope): boolean {
    const loc = locations.value[war.warId];
    if (!loc) return false;
    return (
      scopeHasPoint(scope, loc.lon, loc.lat) &&
      scopeOverlapsYears(scope, war.startYear ?? null, war.endYear ?? null)
    );
  }

  /** How many wars fall inside a polity — used by the card's related counts. */
  async function countInScope(scope: PolityScope): Promise<number> {
    await ensureIndex();
    return index.value.filter((war) => matchesScope(war, scope)).length;
  }

  const filtered = computed(() => {
    const q = query.value.trim().toLowerCase();
    let list = index.value;

    if (q) {
      list = list.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          (w.nameEn ?? '').toLowerCase().includes(q) ||
          (w.category ?? '').toLowerCase().includes(q),
      );
    }

    if (onlyNearYear.value) {
      const from = timeline.year - 15;
      const to = timeline.year + 15;
      const overlapping = list.filter((w) => {
        const start = w.startYear ?? 0;
        const end = w.endYear ?? start;
        return end >= from && start <= to;
      });
      // Never leave the panel inexplicably empty: fall back to the full list.
      if (overlapping.length) list = overlapping;
    }

    const scope = ui.scopeToPolity ? ui.polityScope : null;
    if (scope) list = list.filter((war) => matchesScope(war, scope));

    const sorted = [...list];
    if (sort.value === 'start') {
      sorted.sort((a, b) => (a.startYear ?? 0) - (b.startYear ?? 0));
    } else if (sort.value === 'battles') {
      sorted.sort((a, b) => (b.totalBattles ?? 0) - (a.totalBattles ?? 0));
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    }
    return sorted;
  });

  async function ensureIndex() {
    if (loaded.value || loadingIndex.value) return;
    loadingIndex.value = true;
    try {
      const [list, locs] = await Promise.all([loadWarIndex(), loadWarLocations()]);
      index.value = list;
      locations.value = locs;
      loaded.value = true;
    } finally {
      loadingIndex.value = false;
    }
  }

  async function select(warId: string | null) {
    if (warId === null) {
      selectedId.value = null;
      profile.value = null;
      return;
    }
    // A war can be picked straight off the globe, with the panel never opened,
    // so the index is not guaranteed to be loaded yet.
    await ensureIndex();
    selectedId.value = warId;
    profile.value = null;
    loadingProfile.value = true;
    try {
      const doc = await loadWarProfile(warId);
      // Guard against a slow response for a war the user has already left.
      if (selectedId.value === warId) profile.value = doc;
    } finally {
      loadingProfile.value = false;
    }
  }

  /** Wars with a known theatre centroid, for the globe layer. */
  const located = computed(() =>
    index.value
      .map((w) => {
        const loc = locations.value[w.warId];
        if (!loc || typeof loc.lon !== 'number' || typeof loc.lat !== 'number') return null;
        return {
          warId: w.warId,
          name: w.name,
          lon: loc.lon,
          lat: loc.lat,
          battles: loc.battles ?? w.totalBattles ?? 0,
          startYear: w.startYear ?? null,
          endYear: w.endYear ?? null,
          eraColor: getEra(w.startYear ?? 0).color,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  );

  function clear() {
    selectedId.value = null;
    profile.value = null;
    query.value = '';
  }

  /**
   * Re-issue the two index requests after a failed load. `ensureIndex` gates on
   * `loaded`, which used to stay false but with an empty cache: without this,
   * Retry could not bring the war layer back at all.
   */
  async function resetForRetry() {
    clearWarCache();
    loaded.value = false;
    index.value = [];
    locations.value = {};
    await ensureIndex();
  }

  return {
    index,
    locations,
    loaded,
    selectedId,
    selected,
    profile,
    battles,
    query,
    sort,
    onlyNearYear,
    loadingIndex,
    loadingProfile,
    filtered,
    countInScope,
    located,
    ensureIndex,
    resetForRetry,
    select,
    clear,
  };
});
