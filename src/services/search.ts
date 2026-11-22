/**
 * Lazy loader for the prebuilt search index.
 *
 * Nothing here runs at boot: the first search panel open triggers the one
 * fetch, and the result is cached for the session. A failure is surfaced to the
 * panel as a retry state, and the request layer also records it for the
 * diagnostics banner — search is an enhancement and must never block the map.
 *
 * The request goes through `services/http.ts` like every other shipped JSON.
 * The bare `fetch` this used to call had no timeout, so a stalled connection
 * left the panel on its loading state until the tab was reloaded.
 */

import type { SearchIndexData } from '@/lib/search';
import { fetchJson } from '@/services/http';

const INDEX_URL = '/search-index.json';

/**
 * The index is ~6 MB — between a year file and a century file — so the default
 * budget is too tight on a slow link and the century budget is generous.
 */
const INDEX_TIMEOUT_MS = 20_000;

let cache: SearchIndexData | null = null;
let pending: Promise<SearchIndexData> | null = null;

export function loadSearchIndex(): Promise<SearchIndexData> {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;

  let task: Promise<SearchIndexData>;
  task = (async () => {
    const json = await fetchJson<SearchIndexData>(INDEX_URL, {
      timeoutMs: INDEX_TIMEOUT_MS,
      // A missing index is a deployment problem the panel reports itself; it
      // must not raise the global failure banner.
      allowMissing: true,
    });
    if (!json || !Array.isArray(json.items) || !json.tokens || typeof json.tokens !== 'object') {
      throw new Error('Search index is malformed');
    }
    cache = json;
    return json;
  })().finally(() => {
    // Only clear our own entry: clearSearchIndexCache() may already have dropped
    // it, and a later attempt may have registered a new one. Clearing that one
    // would leave the next caller without deduplication — and without the
    // failure state that lets Retry work.
    if (pending === task) pending = null;
  });

  pending = task;
  return task;
}

/** Drop the cache so Retry can issue a fresh request. */
export function clearSearchIndexCache(): void {
  cache = null;
  pending = null;
}
