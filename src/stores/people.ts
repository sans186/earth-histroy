import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
  scopeHasPoint,
  scopeMentions,
  scopeOverlapsYears,
  type PolityScope,
} from '@/lib/polityScope';
import {
  clearPeopleCache,
  loadPeopleCoords,
  loadPeopleIndex,
  loadPersonProfile,
} from '@/services/data';
import { useUiStore } from '@/stores/ui';
import type { PersonIndexItem, PersonProfile } from '@/types';

export type PeopleSort = 'birth' | 'stages' | 'name';

/**
 * "孙中山（革命同盟会领袖）" -> "孙中山".
 *
 * The dataset writes key figures as a name followed by a parenthetical role,
 * which never matches a profile name verbatim.
 */
export function figureName(raw: string): string {
  return String(raw)
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[·・]/g, '')
    .trim();
}

/** Same name with separators removed, for cross-dataset spelling differences. */
export function tightName(raw: string): string {
  return figureName(raw).replace(/[-\s]/g, '').toLowerCase();
}

export const usePeopleStore = defineStore('people', () => {
  const ui = useUiStore();
  const index = ref<PersonIndexItem[]>([]);
  const indexing = ref(false);
  const indexLoaded = ref(false);

  const query = ref('');
  const era = ref('all');
  const sort = ref<PeopleSort>('birth');
  /** Restrict to people alive in `aliveYear` — normally the timeline year. */
  const aliveOnly = ref(false);
  const aliveYear = ref(1911);

  const selectedId = ref<string | null>(null);
  const profile = ref<PersonProfile | null>(null);
  const loadingProfile = ref(false);
  /**
   * Extra people drawn alongside the open profile on the main map.
   *
   * Lives in the store rather than in the drawer because the map paints it:
   * the drawer only edits the list, `App.vue` reads it to build one scene.
   * Two is the ceiling — three lines on one lifeline is the readable limit.
   */
  const trailCompare = ref<PersonProfile[]>([]);

  let indexTask: Promise<void> | null = null;

  async function ensureIndex(): Promise<void> {
    if (indexLoaded.value) return;
    if (indexTask) return indexTask;
    indexing.value = true;
    indexTask = (async () => {
      try {
        index.value = await loadPeopleIndex();
        indexLoaded.value = true;
      } finally {
        indexing.value = false;
        indexTask = null;
      }
    })();
    return indexTask;
  }

  const eras = computed(() => {
    const seen = new Set<string>();
    for (const person of index.value) if (person.era) seen.add(person.era);
    return [...seen];
  });

  /** Unknown birth and death are treated as "possibly alive" rather than hidden. */
  function aliveIn(person: PersonIndexItem, year: number): boolean {
    if (person.birth !== null && year < person.birth) return false;
    if (person.death !== null && year > person.death) return false;
    return true;
  }

  /** personId → life-stage points; fetched the first time a polity is scoped. */
  const coords = ref<Record<string, [number, number][]>>({});

  async function ensureCoords() {
    if (Object.keys(coords.value).length) return;
    coords.value = await loadPeopleCoords();
  }

  watch(
    () => (ui.scopeToPolity ? (ui.polityScope?.key ?? null) : null),
    (key) => {
      if (key) void ensureCoords();
    },
    { immediate: true },
  );

  /**
   * Two ways to belong to a polity. The nationality string is the cheap one, but
   * the datasets disagree on epoch ("中国" for a Qing official), so the tie-breaker
   * is where the person actually lived: `coords.json` holds every life stage's
   * point, generated from the profiles by `build-people-coords.mjs`.
   */
  function matchesScope(person: PersonIndexItem, scope: PolityScope): boolean {
    if (!scopeOverlapsYears(scope, person.birth, person.death)) return false;
    if (scopeMentions(scope, person.nationality, person.nationalityEn)) return true;
    const points = coords.value[person.personId];
    return Boolean(points?.some(([lon, lat]) => scopeHasPoint(scope, lon, lat)));
  }

  /** How many people belong to a polity — used by the card's related counts. */
  async function countInScope(scope: PolityScope): Promise<number> {
    await ensureIndex();
    await ensureCoords();
    return index.value.filter((person) => matchesScope(person, scope)).length;
  }

  const filtered = computed(() => {
    const needle = query.value.trim().toLowerCase();
    let list = index.value;

    if (era.value !== 'all') list = list.filter((p) => p.era === era.value);
    if (aliveOnly.value) list = list.filter((p) => aliveIn(p, aliveYear.value));

    const scope = ui.scopeToPolity ? ui.polityScope : null;
    if (scope) list = list.filter((p) => matchesScope(p, scope));
    if (needle) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.nameEn.toLowerCase().includes(needle) ||
          p.nationality.toLowerCase().includes(needle) ||
          p.nationalityEn.toLowerCase().includes(needle),
      );
    }

    const out = [...list];
    if (sort.value === 'birth') {
      out.sort((a, b) => (a.birth ?? Number.MAX_SAFE_INTEGER) - (b.birth ?? Number.MAX_SAFE_INTEGER));
    } else if (sort.value === 'stages') {
      out.sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0));
    } else {
      out.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    }
    return out;
  });

  /**
   * Lookup table for linking event key figures to a profile. Profiles are the
   * only place in the dataset with a life narrative, so this is what turns a
   * name in an event card into something openable.
   *
   * Exact names are registered first so they always win; aliases are added
   * afterwards only where nothing claimed the key yet. The aliases matter
   * because the two datasets disagree on name length — the profile is
   * "阿尔伯特·爱因斯坦" while events say "爱因斯坦", and matching on the tail
   * segment alone takes the linkable names from 60 to 192.
   */
  const byName = computed(() => {
    const map = new Map<string, PersonIndexItem>();
    const add = (key: string, person: PersonIndexItem, overwrite: boolean) => {
      const k = key.trim();
      if (!k) return;
      if (overwrite) map.set(k, person);
      else if (!map.has(k)) map.set(k, person);
    };

    for (const person of index.value) add(String(person.name ?? ''), person, true);
    for (const person of index.value) add(String(person.nameEn ?? '').toLowerCase(), person, true);

    for (const person of index.value) {
      const zh = String(person.name ?? '');
      if (zh) {
        add(zh.replace(/[·・]/g, ''), person, false);
        // 纳拉姆辛 / 纳拉姆-辛 are the same king; the two datasets disagree on
        // the hyphen, so both spellings have to resolve.
        add(tightName(zh), person, false);
        const tail = zh.split(/[·・]/).pop() ?? '';
        if (tail && tail !== zh) add(tail, person, false);
      }
      const en = String(person.nameEn ?? '');
      if (en) {
        add(tightName(en), person, false);
        const last = en.split(/\s+/).pop() ?? '';
        if (last && last !== en) add(last.toLowerCase(), person, false);
      }
    }
    return map;
  });

  function findByName(raw: string): PersonIndexItem | null {
    const clean = figureName(raw);
    if (!clean) return null;
    return (
      byName.value.get(clean) ??
      byName.value.get(clean.toLowerCase()) ??
      byName.value.get(tightName(clean)) ??
      null
    );
  }

  async function openPerson(personId: string): Promise<void> {
    // A different primary starts a fresh comparison.
    if (personId !== selectedId.value) trailCompare.value = [];
    selectedId.value = personId;
    profile.value = null;
    loadingProfile.value = true;
    const found = await loadPersonProfile(personId);
    // A slower earlier request must not overwrite a newer selection.
    if (selectedId.value !== personId) return;
    profile.value = found;
    loadingProfile.value = false;
  }

  async function openByName(raw: string): Promise<boolean> {
    await ensureIndex();
    const hit = findByName(raw);
    if (!hit) return false;
    await openPerson(hit.personId);
    return true;
  }

  function closePerson() {
    selectedId.value = null;
    profile.value = null;
    loadingProfile.value = false;
    trailCompare.value = [];
  }

  function addTrailCompare(person: PersonProfile) {
    const next = trailCompare.value.filter((p) => p.personId !== person.personId);
    next.push(person);
    // The oldest comparison leaves once a third would make the lifeline crowded.
    while (next.length > 2) next.shift();
    trailCompare.value = next;
  }

  function removeTrailCompare(personId: string) {
    trailCompare.value = trailCompare.value.filter((p) => p.personId !== personId);
  }

  function setAliveYear(year: number) {
    aliveYear.value = year;
  }

  /** Re-fetch the index after a failed load; see the shared data error banner. */
  function resetForRetry() {
    clearPeopleCache();
    indexLoaded.value = false;
    indexTask = null;
    index.value = [];
    coords.value = {};
    void ensureIndex();
  }

  return {
    index,
    indexing,
    indexLoaded,
    query,
    era,
    sort,
    aliveOnly,
    aliveYear,
    selectedId,
    profile,
    loadingProfile,
    trailCompare,
    eras,
    filtered,
    aliveIn,
    findByName,
    countInScope,
    ensureIndex,
    resetForRetry,
    openPerson,
    openByName,
    closePerson,
    addTrailCompare,
    removeTrailCompare,
    setAliveYear,
  };
});
