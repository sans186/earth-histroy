import type { FlatBattle, WarIndexItem, WarLocation, WarProfile } from '@/types';

/**
 * War module data access.
 *
 * Three separate files, cached independently:
 *   index.json         the list — always fetched first, drives the panel
 *   war_locations.json one theatre centroid per war, drives the globe layer
 *   {warId}.json       the full profile, fetched only when a war is opened
 *
 * Profiles run 20-80 KB each, so they are never prefetched.
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
      const res = await fetch(`${BASE}index.json`);
      if (!res.ok) throw new Error(`index.json ${res.status}`);
      const json = (await res.json()) as WarIndexItem[];
      indexCache = Array.isArray(json) ? json.filter((w) => w?.warId && w?.name) : [];
    } catch {
      indexCache = [];
    } finally {
      indexPromise = null;
    }
    return indexCache ?? [];
  })();

  return indexPromise;
}

export async function loadWarLocations(): Promise<Record<string, WarLocation>> {
  if (locationsCache) return locationsCache;
  if (locationsPromise) return locationsPromise;

  locationsPromise = (async () => {
    try {
      const res = await fetch(`${BASE}war_locations.json`);
      if (!res.ok) throw new Error(`war_locations.json ${res.status}`);
      const json = (await res.json()) as Record<string, WarLocation>;
      locationsCache =
        json && typeof json === 'object' && !Array.isArray(json) ? json : {};
    } catch {
      locationsCache = {};
    } finally {
      locationsPromise = null;
    }
    return locationsCache ?? {};
  })();

  return locationsPromise;
}

export async function loadWarProfile(warId: string): Promise<WarProfile | null> {
  if (profileCache.has(warId)) return profileCache.get(warId) ?? null;

  try {
    const res = await fetch(`${BASE}${warId}.json`);
    if (!res.ok) {
      profileCache.set(warId, null);
      return null;
    }
    const json = (await res.json()) as WarProfile;
    profileCache.set(warId, json);
    return json;
  } catch {
    profileCache.set(warId, null);
    return null;
  }
}

/** Every battle across all phases, flattened and sorted by year. */
export function battleList(profile: WarProfile | null): FlatBattle[] {
  const out: FlatBattle[] = [];
  for (const phase of profile?.warProcess?.phases ?? []) {
    for (const battle of phase.battles ?? []) {
      out.push({
        name: battle.name ?? '',
        year: typeof battle.year === 'number' ? battle.year : null,
        location: battle.location ?? '',
        description: battle.description ?? '',
        outcome: battle.outcome ?? '',
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
  profileCache.clear();
}
