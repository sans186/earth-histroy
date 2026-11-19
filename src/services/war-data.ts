import type { FlatBattle, WarBattle, WarIndexItem, WarLocation, WarProfile } from '@/types';
import { DataFetchError, fetchJson, fetchOptionalJson } from '@/services/http';

/**
 * War module data access.
 *
 * Three separate files, cached independently:
 *   index.json         the list — always fetched first, drives the panel
 *   war_locations.json one theatre centroid per war, drives the globe layer
 *   {warId}.json       the full profile, fetched only when a war is opened
 *
 * Profiles run 20-80 KB each, so they are never prefetched.
 *
 * All three go through the shared request layer. A failed load degrades the
 * panel to an empty list but is reported to the diagnostics banner, and the
 * empty result is NOT cached — otherwise the first network hiccup permanently
 * erased the war layer for the rest of the session.
 */

const BASE = '/wars/profiles/';

let indexCache: WarIndexItem[] | null = null;
let indexPromise: Promise<WarIndexItem[]> | null = null;

let locationsCache: Record<string, WarLocation> | null = null;
let locationsPromise: Promise<Record<string, WarLocation>> | null = null;

const profileCache = new Map<string, WarProfile | null>();

export async function loadWarIndex(): Promise<WarIndexItem[]> {
  if (indexCache) return indexCache;
  if (indexPromise) return indexPromise;

  indexPromise = (async () => {
    try {
      const { data, ok } = await fetchOptionalJson<WarIndexItem[]>(`${BASE}index.json`, []);
      const list = Array.isArray(data) ? data.filter((w) => w?.warId && w?.name) : [];
      if (ok) indexCache = list;
      return list;
    } finally {
      indexPromise = null;
    }
  })();

  return indexPromise;
}

export async function loadWarLocations(): Promise<Record<string, WarLocation>> {
  if (locationsCache) return locationsCache;
  if (locationsPromise) return locationsPromise;

  locationsPromise = (async () => {
    try {
      const { data, ok } = await fetchOptionalJson<Record<string, WarLocation>>(
        `${BASE}war_locations.json`,
        {},
      );
      const list = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
      if (ok) locationsCache = list;
      return list;
    } finally {
      locationsPromise = null;
    }
  })();

  return locationsPromise;
}

export async function loadWarProfile(warId: string): Promise<WarProfile | null> {
  if (profileCache.has(warId)) return profileCache.get(warId) ?? null;

  try {
    const json = await fetchJson<WarProfile>(`${BASE}${warId}.json`, { allowMissing: true });
    profileCache.set(warId, json);
    return json;
  } catch (err) {
    if (err instanceof DataFetchError && err.record.status === 404) {
      profileCache.set(warId, null);
    }
    // A transient failure is left uncached so reopening the card retries.
    return null;
  }
}

/**
 * Read a battle's date, place and result across both schema generations.
 *
 * Current profiles use `startYear` / `theater` / `result`; seven older ones
 * still use `year` / `location` / `outcome`. The UI used to read only the old
 * spelling, which blanked ~95% of the 894 battles.
 */
export function battleYear(battle: WarBattle): number | null {
  if (typeof battle.startYear === 'number') return battle.startYear;
  if (typeof battle.nameYear === 'number') return battle.nameYear;
  return typeof battle.year === 'number' ? battle.year : null;
}

export function battlePlace(battle: WarBattle): string {
  return battle.theater || battle.location || '';
}

export function battleResult(battle: WarBattle): string {
  return battle.result || battle.outcome || '';
}

/** Every battle across all phases, flattened and sorted by year. */
export function battleList(profile: WarProfile | null): FlatBattle[] {
  const out: FlatBattle[] = [];
  for (const phase of profile?.warProcess?.phases ?? []) {
    for (const battle of phase.battles ?? []) {
      out.push({
        name: battle.name ?? '',
        year: battleYear(battle),
        location: battlePlace(battle),
        description: battle.description ?? '',
        outcome: battleResult(battle),
        phase: phase.name ?? '',
      });
    }
  }
  out.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  return out;
}

export function clearWarCache() {
  indexCache = null;
  locationsCache = null;
  indexPromise = null;
  locationsPromise = null;
  profileCache.clear();
}
