/**
 * Lazy loader for the prebuilt search index.
 *
 * Nothing here runs at boot: the first search panel open triggers the one
 * fetch, and the result is cached for the session. A failure is surfaced to the
 * panel as a retry state rather than the global error banner, because search is
 * an enhancement and must never block the map.
 */

import type { SearchIndexData } from '@/lib/search';

const INDEX_URL = '/search-index.json';

let cache: SearchIndexData | null = null;
let pending: Promise<SearchIndexData> | null = null;

export function loadSearchIndex(): Promise<SearchIndexData> {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;

  pending = (async () => {
    const res = await fetch(INDEX_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Search index request failed (${res.status})`);
    const json = (await res.json()) as SearchIndexData;
    if (!json || !Array.isArray(json.items) || !json.tokens || typeof json.tokens !== 'object') {
      throw new Error('Search index is malformed');
    }
    cache = json;
    return json;
  })().finally(() => {
    pending = null;
  });

  return pending;
}

/** Drop the cache so Retry can issue a fresh request. */
export function clearSearchIndexCache(): void {
  cache = null;
  pending = null;
}
