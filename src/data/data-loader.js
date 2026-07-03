/**
 * Data loader with caching, loading-state tracking, and error recovery.
 *
 * Phase 2: loading / error states exposed via core store + events.
 * Phase 3: on-demand windowed loading, LRU cache, request cancellation.
 */

import { DATA_BASE_URL_ZH, DATA_BASE_URL_EN, DATA_CACHE_SIZE } from '../config.js';

/**
 * @param {import('../core/index.js').Core} core
 */
export function createDataLoader(core) {
  const cache = new Map();
  const lru = [];
  const CONCURRENCY = 6;

  let controller = null;

  function touch(year) {
    const idx = lru.indexOf(year);
    if (idx > -1) lru.splice(idx, 1);
    lru.push(year);
  }

  function evictOne() {
    if (lru.length === 0) return;
    cache.delete(lru.shift());
  }

  function getBaseUrl() {
    const locale = core.state.get('locale') ?? 'zh';
    return locale === 'zh' ? DATA_BASE_URL_ZH : DATA_BASE_URL_EN;
  }

  async function fetchYear(year, signal) {
    if (cache.has(year)) {
      touch(year);
      return cache.get(year);
    }
    const url = `${getBaseUrl()}${year}.json`;
    let events;
    try {
      const resp = await fetch(url, { signal });

      // 404 / 304 → no data file for this year (expected for gaps)
      if (resp.status === 404 || resp.status === 304) {
        events = [];
      } else if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} for year ${year}`);
      } else {
        // Guard against HTML fallback (Vite SPA mode) – check content-type
        const ct = resp.headers.get('content-type') || '';
        if (!ct.includes('application/json') && !ct.includes('text/json')) {
          events = []; // not a JSON file, treat as empty
        } else {
          const json = await resp.json();
          events = json.events ?? [];
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      // JSON parse error – probably SPA fallback HTML, treat as no data
      if (err instanceof SyntaxError) {
        events = [];
      } else {
        console.warn(`[data] Failed year ${year}:`, err.message);
        throw err;
      }
    }
    if (cache.size >= DATA_CACHE_SIZE) evictOne();
    cache.set(year, events);
    lru.push(year);
    return events;
  }

  /**
   * Load events in [center - window, center + window].
   * Cancels any prior in-flight request.  Updates core.state with progress.
   */
  async function loadWindow(centerYear, windowSize) {
    if (controller) controller.abort();
    controller = new AbortController();
    const { signal } = controller;

    core.state.set('dataLoading', true);
    core.state.set('dataError', null);
    core.events.emit('data:loading', true);

    const start = centerYear - windowSize;
    const end = centerYear + windowSize;
    const allEvents = [];
    let firstError = null;

    // Build year list
    const years = [];
    for (let y = start; y <= end; y++) years.push(y);

    for (let i = 0; i < years.length; i += CONCURRENCY) {
      if (signal.aborted) break;
      const batch = years.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((y) => fetchYear(y, signal)),
      );
      for (let j = 0; j < results.length; j++) {
        const year = batch[j];
        const res = results[j];
        if (res.status === 'fulfilled') {
          for (const evt of res.value) {
            allEvents.push({ ...evt, _year: year });
          }
        } else if (res.reason?.name !== 'AbortError') {
          firstError = firstError ?? res.reason;
        }
      }
    }

    if (signal.aborted) {
      core.state.set('dataLoading', false);
      core.events.emit('data:loading', false);
      return [];
    }

    core.state.set('dataEvents', allEvents);
    core.state.set('dataLoading', false);
    core.events.emit('data:loading', false);

    if (firstError) {
      core.state.set('dataError', firstError.message);
      core.events.emit('data:error', firstError);
    } else {
      core.state.set('dataError', null);
    }
    core.events.emit('data:loaded', allEvents);
    return allEvents;
  }

  async function retry(centerYear, windowSize) {
    return loadWindow(centerYear, windowSize);
  }

  function preloadRange(startYear, endYear) {
    const ac = new AbortController();
    (async () => {
      for (let y = startYear; y <= endYear; y++) {
        if (cache.has(y)) continue;
        try { await fetchYear(y, ac.signal); } catch { /* ignore */ }
      }
    })();
  }

  function clearCache() { cache.clear(); lru.length = 0; }
  function cacheStats() { return { size: cache.size, max: DATA_CACHE_SIZE }; }

  return { loadWindow, retry, preloadRange, clearCache, cacheStats };
}
