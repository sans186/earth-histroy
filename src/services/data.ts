import {
  DATA_BASE_EN,
  DATA_BASE_ZH,
  DATA_CACHE_SIZE,
  NE_BASE,
  PEOPLE_BASE,
  POLITIES_BASE,
  YEAR_WINDOW,
  resolveCategory,
} from '@/config';
import { parseCoordinates } from '@/lib/geo';
import type {
  CenturyEntry,
  Locale,
  PersonIndexItem,
  PersonProfile,
  PolityCollection,
  PolityFileIndex,
  RawEvent,
  RawGraphEdge,
  TimelineEvent,
  YearFile,
} from '@/types';

/* ══════════════════════════════════════════════════════════════════════════
   Events
   ══════════════════════════════════════════════════════════════════════════ */

const yearCache = new Map<string, YearFile | null>();
const inflight = new Map<string, Promise<YearFile | null>>();

function cachePut(key: string, value: YearFile | null) {
  yearCache.set(key, value);
  while (yearCache.size > DATA_CACHE_SIZE) {
    const oldest = yearCache.keys().next().value;
    if (oldest === undefined) break;
    yearCache.delete(oldest);
  }
}

async function fetchYearFile(
  year: number,
  locale: Locale,
  signal?: AbortSignal,
): Promise<YearFile | null> {
  const base = locale === 'zh' ? DATA_BASE_ZH : DATA_BASE_EN;
  const key = `${locale}:${year}`;

  if (yearCache.has(key)) return yearCache.get(key) ?? null;
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    try {
      const res = await fetch(`${base}${year}.json`, { signal });
      if (!res.ok) {
        cachePut(key, null);
        return null;
      }
      const json = (await res.json()) as YearFile;
      cachePut(key, json);
      return json;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      cachePut(key, null);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

function normalise(raw: RawEvent, year: number, index: number, meta: YearMeta): TimelineEvent {
  const coord = parseCoordinates(raw.coordinates_approx);
  return {
    key: raw.id ?? `${year}-${index}`,
    year,
    title: (raw.title ?? '').trim() || '—',
    region: (raw.region ?? '').trim(),
    category: resolveCategory(raw.category),
    rawCategory: (raw.category ?? '').trim(),
    description: (raw.description ?? '').trim(),
    certainty: (raw.certainty ?? '').trim(),
    certaintyNote: (raw.certainty_note ?? '').trim(),
    sources: Array.isArray(raw.sources) ? raw.sources : [],
    figures: Array.isArray(raw.key_figures) ? raw.key_figures : [],
    crossReferences: Array.isArray(raw.cross_references)
      ? raw.cross_references.map((v) => String(v)).filter(Boolean)
      : [],
    lon: coord?.lon ?? null,
    lat: coord?.lat ?? null,
    ...meta,
  };
}

/**
 * The year-level commentary a year file carries.
 *
 * These fields belong to the *year*, not to any single event, but the card
 * shows them in context, so they are copied onto each of the year's events.
 * They are what tells a reader how much the record of that year can be trusted
 * — which is the whole point of the source panel.
 */
interface YearMeta {
  documentationLevel: string;
  eraContext: string;
  historiographicNote: string;
  disconfirmingEvidence: string;
  coverageGaps: string[];
  graphEdges: RawGraphEdge[];
}

function metaFrom(file: YearFile | null | undefined): YearMeta {
  const evidence = file?.disconfirming_evidence;
  return {
    documentationLevel: (file?.documentation_level ?? '').trim(),
    eraContext: (file?.era_context ?? '').trim(),
    historiographicNote: (file?.historiographic_note ?? '').trim(),
    disconfirmingEvidence: Array.isArray(evidence)
      ? evidence.map((v) => String(v)).join(' ')
      : String(evidence ?? '').trim(),
    coverageGaps: Array.isArray(file?.geographic_coverage_gaps)
      ? file.geographic_coverage_gaps.map((v) => String(v)).filter(Boolean)
      : [],
    graphEdges: Array.isArray(file?.graph_edges) ? file.graph_edges : [],
  };
}

export interface WindowResult {
  events: TimelineEvent[];
  /** Years that returned no records, so the UI can say so honestly. */
  missingYears: number[];
}

/** Load the year window around `year` and flatten it into a sorted list. */
export async function loadEventWindow(
  year: number,
  locale: Locale,
  window = YEAR_WINDOW,
  signal?: AbortSignal,
): Promise<WindowResult> {
  const years: number[] = [];
  for (let y = year - window; y <= year + window; y += 1) years.push(y);

  const files = await Promise.all(
    years.map(async (y) => ({ y, file: await fetchYearFile(y, locale, signal) })),
  );

  const events: TimelineEvent[] = [];
  const missingYears: number[] = [];

  for (const { y, file } of files) {
    if (!file || !Array.isArray(file.events)) {
      missingYears.push(y);
      continue;
    }
    const meta = metaFrom(file);
    file.events.forEach((raw, i) => events.push(normalise(raw, y, i, meta)));
  }

  events.sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));

  return { events, missingYears };
}

export function clearEventCache() {
  yearCache.clear();
  inflight.clear();
}

/* ══════════════════════════════════════════════════════════════════════════
   Year context
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Everything a year file says about the year as a whole.
 *
 * This used to be copied onto every event and shown inside the event card,
 * where it read as a claim about that one event. It is the year's own record —
 * how well documented it is, where the surviving sources are biased, and what
 * modern scholarship disputes — so it belongs beside the year, not the entry.
 */
export interface YearContext {
  year: number;
  eraContext: string;
  documentationLevel: string;
  historiographicNote: string;
  disconfirmingEvidence: string;
  coverageGaps: string[];
  eventCount: number;
}

const contextCache = new Map<string, YearContext | null>();

export async function loadYearContext(
  year: number,
  locale: Locale,
  signal?: AbortSignal,
): Promise<YearContext | null> {
  const key = `${locale}:${year}`;
  const cached = contextCache.get(key);
  if (cached !== undefined) return cached;

  // Shares the event cache, so opening a year the globe already loaded is free.
  const file = await fetchYearFile(year, locale, signal);
  if (!file) {
    contextCache.set(key, null);
    return null;
  }
  const meta = metaFrom(file);
  const context: YearContext = {
    year,
    eraContext: meta.eraContext,
    documentationLevel: meta.documentationLevel,
    historiographicNote: meta.historiographicNote,
    disconfirmingEvidence: meta.disconfirmingEvidence,
    coverageGaps: meta.coverageGaps,
    eventCount: Array.isArray(file.events) ? file.events.length : 0,
  };
  contextCache.set(key, context);
  return context;
}

/* ══════════════════════════════════════════════════════════════════════════
   Polities
   ══════════════════════════════════════════════════════════════════════════ */

let polityIndexCache: CenturyEntry[] | null = null;

export async function loadPolityIndex(): Promise<CenturyEntry[]> {
  if (polityIndexCache) return polityIndexCache;
  const res = await fetch(`${POLITIES_BASE}index.json`);
  if (!res.ok) throw new Error(`polity index ${res.status}`);
  const json = (await res.json()) as PolityFileIndex | CenturyEntry[] | RawCentury[];
  const raw = Array.isArray(json) ? json : (json.centuries ?? []);
  // The shipped index only carries start/end/count; the file name is derived.
  polityIndexCache = raw.map((entry) => ({
    start: entry.start,
    end: entry.end,
    count: entry.count ?? 0,
    file: (entry as CenturyEntry).file ?? `polities_${entry.start}_${entry.end}.json`,
  }));
  return polityIndexCache;
}

interface RawCentury {
  start: number;
  end: number;
  count: number;
}

/**
 * Geometry tiers.
 *
 * Each century ships twice: the full file and a `.lod` sibling simplified to
 * roughly a fifth of the size. Which one is correct depends on the camera, not
 * on the data, so the caller chooses (see POLITY_LOD_HEIGHT) and passes it in.
 */
export type PolityTier = 'full' | 'lod';

export function polityFileName(entry: CenturyEntry, tier: PolityTier): string {
  return tier === 'lod' ? entry.file.replace(/\.json$/, '.lod.json') : entry.file;
}

/** Keyed by file name, so the two tiers of one century coexist. A `null` value
 *  records a known miss and stops a missing LOD file being re-fetched. */
const polityCache = new Map<string, PolityCollection | null>();

/** The century file that contains `year`, plus its neighbours. */
export function pickCenturyFiles(index: CenturyEntry[], year: number): CenturyEntry[] {
  const sorted = [...index].sort((a, b) => a.start - b.start);
  const i = sorted.findIndex((c) => year >= c.start && year < c.end);
  if (i === -1) return sorted.length ? [sorted[sorted.length - 1]] : [];
  const out: CenturyEntry[] = [];
  if (sorted[i - 1]) out.push(sorted[i - 1]);
  out.push(sorted[i]);
  if (sorted[i + 1]) out.push(sorted[i + 1]);
  return out;
}

export async function loadPolityFile(
  entry: CenturyEntry,
  tier: PolityTier = 'full',
): Promise<PolityCollection | null> {
  const name = polityFileName(entry, tier);
  if (polityCache.has(name)) return polityCache.get(name) ?? null;

  const res = await fetch(`${POLITIES_BASE}${name}`);
  // A missing LOD file must not blank the layer — fall back to the full tier,
  // which is what the client loaded before the tiers existed. The miss is
  // cached so the 404 is not repeated on every refresh.
  if (!res.ok) {
    const fallback = tier === 'lod' ? await loadPolityFile(entry, 'full') : null;
    polityCache.set(name, fallback);
    return fallback;
  }

  const json = (await res.json()) as PolityCollection;
  polityCache.set(name, json);
  // Keep the cache small: a full-tier file is tens of megabytes.
  while (polityCache.size > 6) {
    const oldest = polityCache.keys().next().value;
    if (oldest === undefined) break;
    polityCache.delete(oldest);
  }
  return json;
}

export function clearPolityCache() {
  polityCache.clear();
  polityIndexCache = null;
}

/* ══════════════════════════════════════════════════════════════════════════
   Reference data
   ══════════════════════════════════════════════════════════════════════════ */

let nameMapCache: Record<string, string> | null = null;

/** English -> Chinese polity names. */
export async function loadPolityNames(): Promise<Record<string, string>> {
  if (nameMapCache) return nameMapCache;
  try {
    const res = await fetch(`${NE_BASE}polity_names_zh.json`);
    nameMapCache = res.ok ? ((await res.json()) as Record<string, string>) : {};
  } catch {
    nameMapCache = {};
  }
  return nameMapCache;
}

export const NE_FILES = {
  countries110m: `${NE_BASE}ne_110m_admin_0_countries.json`,
  borders50m: `${NE_BASE}ne_50m_admin_0_boundary_lines_land.json`,
};

/* ══════════════════════════════════════════════════════════════════════════
   People
   ══════════════════════════════════════════════════════════════════════════ */

let peopleIndexCache: PersonIndexItem[] | null = null;
let peopleIndexInflight: Promise<PersonIndexItem[]> | null = null;

/**
 * The 410-row index ships as one ~100 KB file, so it is fetched whole and
 * filtered in memory. Individual profiles are only fetched when one is opened.
 */
export async function loadPeopleIndex(): Promise<PersonIndexItem[]> {
  if (peopleIndexCache) return peopleIndexCache;
  if (peopleIndexInflight) return peopleIndexInflight;
  peopleIndexInflight = (async () => {
    try {
      const res = await fetch(`${PEOPLE_BASE}index.json`);
      if (!res.ok) return [];
      const json = (await res.json()) as PersonIndexItem[];
      const list = Array.isArray(json) ? json : [];
      peopleIndexCache = list;
      return list;
    } catch {
      return [];
    } finally {
      peopleIndexInflight = null;
    }
  })();
  return peopleIndexInflight;
}

const profileCache = new Map<string, PersonProfile | null>();

export async function loadPersonProfile(personId: string): Promise<PersonProfile | null> {
  const cached = profileCache.get(personId);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(`${PEOPLE_BASE}${encodeURIComponent(personId)}.json`);
    const json = res.ok ? ((await res.json()) as PersonProfile) : null;
    profileCache.set(personId, json);
    return json;
  } catch {
    profileCache.set(personId, null);
    return null;
  }
}

export function clearPeopleCache() {
  peopleIndexCache = null;
  profileCache.clear();
}
