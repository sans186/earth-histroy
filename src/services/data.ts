import {
  DATA_BASE_EN,
  DATA_BASE_ZH,
  DATA_CACHE_SIZE,
  NE_BASE,
  PEOPLE_BASE,
  PEOPLE_COORDS,
  POLITIES_BASE,
  YEAR_WINDOW,
  resolveCategory,
} from '@/config';
import { yearOfEventId } from '@/lib/eventLinks';
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

function abortError(): Error {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
}

/**
 * Lets one caller stop waiting without cancelling the shared request.
 *
 * The fetch itself is deliberately not abortable. Every caller within a time
 * window awaits the same in-flight promise, so passing one caller's signal into
 * `fetch` meant that aborting it (the next timeline tick) rejected the promise
 * for *every* waiter — the following window then failed with AbortError and the
 * panel kept showing the previous year. Here the request always runs to
 * completion and lands in the cache; only the wait is cancelled.
 */
function abortable<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return task;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    task.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

async function fetchYearFile(
  year: number,
  locale: Locale,
  signal?: AbortSignal,
): Promise<YearFile | null> {
  const base = locale === 'zh' ? DATA_BASE_ZH : DATA_BASE_EN;
  const key = `${locale}:${year}`;

  const cached = yearCache.get(key);
  if (cached !== undefined) return cached;

  const pending = inflight.get(key);
  if (pending) return abortable(pending, signal);

  const task = (async () => {
    try {
      const res = await fetch(`${base}${year}.json`);
      if (!res.ok) {
        cachePut(key, null);
        return null;
      }
      const json = (await res.json()) as YearFile;
      cachePut(key, json);
      return json;
    } catch {
      cachePut(key, null);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return abortable(task, signal);
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

/**
 * Resolve one event by its id.
 *
 * Cross references and relation edges address entries as "1912-001", and the id
 * carries its year, so a single year file answers the lookup. That file is
 * usually already cached — the globe loads the whole window around the clock.
 */
export async function findEventById(
  id: string,
  locale: Locale,
): Promise<TimelineEvent | null> {
  const year = yearOfEventId(id);
  if (year === null) return null;

  const file = await fetchYearFile(year, locale);
  const raw = file?.events?.find((e) => (e.id ?? '') === id);
  if (!raw) return null;

  const index = file!.events!.indexOf(raw);
  return normalise(raw, year, index, metaFrom(file));
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
   Polity reference card data
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Flag / capital / population for a *modern* country, keyed by its English
 * name in `polity_assets.json`.
 *
 * Cliopatria itself carries no such fields — this file was fetched separately
 * from mledoze's country list. Historical polities (Song dynasty, Achaemenid
 * Empire) simply have no entry, so every field is optional and the card hides
 * what is missing.
 */
export interface PolityAsset {
  flag: string | null;
  flagSvg: string | null;
  shield: string | null;
  capital: string | null;
  population: number | null;
  area: number | null;
  currencies: string[];
  languages: string[];
  cca2: string | null;
  /** Long form ("People's Republic of China"); the map between tile and asset. */
  nameOfficial?: string | null;
  nameZh: string | null;
  continent: string | null;
}

/** A Chinese Wikipedia extract for one polity, keyed by the Cliopatria name. */
export interface PolityDescription {
  name: string;
  from: number;
  to: number;
  zh: { title: string; extract: string; thumbnail: string | null };
}

/**
 * Generated social profile of one polity — `public/ne/polity_facts.json`.
 *
 * Nothing in the source data has these fields, so every value is a model's
 * reading of the same Wikipedia extract the card already shows. The card labels
 * the block accordingly; `generatedBy` records which model wrote it.
 *
 * No percentages anywhere, by design: ethnic or language shares do not exist in
 * the record for most of these polities, and a generated 62% would be fiction
 * dressed as a statistic.
 */
export interface PolityFacts {
  government: string | null;
  structure: string | null;
  capital: string | null;
  languages: {
    official: string | null;
    spoken: string[];
    family: string | null;
  };
  ethnicGroups: string[];
  religion: string | null;
  script: string | null;
  currency: string | null;
  population: string | null;
  modernCountries: string[];
  predecessors: string[];
  successors: string[];
  /**
   * Why there is no `religion`.
   *
   * The first generation run filled this field with party ideology for 21
   * states ("马克思主义/共产主义"). The audit moved that text here instead of
   * deleting it, so the card can say what the state actually claims without
   * calling it a faith.
   */
  religionNote?: string | null;
  /** Wikipedia pages the record was written from; empty means unverified. */
  sources?: { title: string; url: string }[];
  confidence?: 'high' | 'medium' | 'low';
  generatedBy?: string;
}

/** Official published area, used where the tile's geometry disagrees. */
export interface PolityAreaOverride {
  area: number;
  source: string;
  note?: string;
}

let polityAreaCache: Record<string, PolityAreaOverride> | null = null;
let polityAreaInflight: Promise<Record<string, PolityAreaOverride>> | null = null;

export async function loadPolityAreaOverrides(): Promise<Record<string, PolityAreaOverride>> {
  if (polityAreaCache) return polityAreaCache;
  if (polityAreaInflight) return polityAreaInflight;
  polityAreaInflight = (async () => {
    try {
      const res = await fetch(`${NE_BASE}polity_area_overrides.json`);
      const json = res.ok ? ((await res.json()) as Record<string, unknown>) : {};
      const clean: Record<string, PolityAreaOverride> = {};
      for (const [key, value] of Object.entries(json)) {
        if (key.startsWith('_')) continue;
        const item = value as PolityAreaOverride;
        if (item && Number.isFinite(item.area)) clean[key] = item;
      }
      polityAreaCache = clean;
    } catch {
      polityAreaCache = {};
    }
    polityAreaInflight = null;
    return polityAreaCache;
  })();
  return polityAreaInflight;
}

/**
 * Flags for historical polities — `public/ne/polity_flags.json`.
 *
 * Ancient and medieval polities generally had no flag; only a handful adopted a
 * documented one before the modern era. This file therefore holds a short,
 * explicit list rather than pretending every polity can be illustrated.
 */
let polityFlagsCache: Record<string, string> | null = null;
let polityFlagsInflight: Promise<Record<string, string>> | null = null;

export async function loadPolityFlags(): Promise<Record<string, string>> {
  if (polityFlagsCache) return polityFlagsCache;
  if (polityFlagsInflight) return polityFlagsInflight;
  polityFlagsInflight = (async () => {
    try {
      const res = await fetch(`${NE_BASE}polity_flags.json`);
      const json = res.ok ? ((await res.json()) as Record<string, string>) : {};
      polityFlagsCache = Object.fromEntries(
        Object.entries(json).filter(([key]) => !key.startsWith('_')),
      );
    } catch {
      polityFlagsCache = {};
    }
    polityFlagsInflight = null;
    return polityFlagsCache;
  })();
  return polityFlagsInflight;
}

let polityAssetsCache: Record<string, PolityAsset> | null = null;
let polityAssetsInflight: Promise<Record<string, PolityAsset>> | null = null;

export async function loadPolityAssets(): Promise<Record<string, PolityAsset>> {
  if (polityAssetsCache) return polityAssetsCache;
  if (polityAssetsInflight) return polityAssetsInflight;
  polityAssetsInflight = (async () => {
    try {
      const res = await fetch(`${NE_BASE}polity_assets.json`);
      polityAssetsCache = res.ok ? ((await res.json()) as Record<string, PolityAsset>) : {};
    } catch {
      polityAssetsCache = {};
    }
    polityAssetsInflight = null;
    return polityAssetsCache;
  })();
  return polityAssetsInflight;
}

let polityDescCache: Record<string, PolityDescription> | null = null;
let polityDescInflight: Promise<Record<string, PolityDescription>> | null = null;

export async function loadPolityDescriptions(): Promise<Record<string, PolityDescription>> {
  if (polityDescCache) return polityDescCache;
  if (polityDescInflight) return polityDescInflight;
  polityDescInflight = (async () => {
    try {
      const res = await fetch(`${NE_BASE}polity_descriptions.json`);
      polityDescCache = res.ok ? ((await res.json()) as Record<string, PolityDescription>) : {};
    } catch {
      polityDescCache = {};
    }
    polityDescInflight = null;
    return polityDescCache;
  })();
  return polityDescInflight;
}

/**
 * Tile names that no stripping rule can reach, mapped to the asset key.
 *
 * Each entry is a name that differs from the modern state's common name by more
 * than a political form: a typo in the source data, an obsolete official name, or
 * a partial name. Keeping them in one table is honest about what they are —
 * exceptions, not a rule.
 */
const ASSET_ALIASES: Record<string, string> = {
  'argentine republic': 'Argentina',
  'former yugoslav republic of macedonia': 'North Macedonia',
  'iragi republic': 'Iraq',
  'libyan arab republic': 'Libya',
  'saint kitts': 'Saint Kitts and Nevis',
  'saint vincent': 'Saint Vincent and the Grenadines',
  'turkish republic of northern cyprus': 'Cyprus',
};

/**
 * The name itself, the same name without a trailing parenthetical, and the same
 * name with its political form stripped.
 *
 * "People's Republic of China" used to survive untouched because the old rule
 * only accepted a bare "Republic of ..." at the start — which is why the PRC
 * card had no flag. The forms below cover the long official names that the
 * modern tiles actually use.
 */
const FORM_PREFIX =
  "(people's|socialist|federal|federated|democratic|islamic|arab|oriental|argentine|united|communist|second|first|state|sultanate|grand)";
const BODY =
  '(republic|kingdom|empire|sultanate|state|union|federation|confederation|commonwealth|emirate|khanate|caliphate|principality|duchy|tsardom)';

function stripForm(raw: string): string {
  return raw
    .trim()
    .replace(/^the\s+/i, '')
    .replace(new RegExp(`^${FORM_PREFIX}\\s+${BODY}\\s+of\\s+(the\\s+)?`, 'i'), '')
    .replace(new RegExp(`^${BODY}\\s+of\\s+(the\\s+)?`, 'i'), '')
    .replace(/^communist\s+/i, '')
    .replace(/\s+(dynasty|empire|kingdom|republic|caliphate|sultanate|khanate)$/i, '')
    .trim();
}

function nameCores(raw: string): string[] {
  const base = raw.trim();
  /*
   * Two shapes appear in the tiles: a trailing qualifier — "Republic of China
   * (1912-1949)" — and a fully wrapped name — "(Kingdom of Sweden)". The first
   * strip handles the second shape, the second strip the first; without both,
   * 14 modern states lost their flag for no better reason than a pair of
   * brackets.
   */
  const unwrapped = base
    .replace(/^\s*[（(]\s*/, '')
    .replace(/\s*[）)]\s*$/, '')
    .replace(/\s*[（(][^）)]*[）)]\s*$/, '')
    .trim();
  return [
    ...new Set([base, unwrapped, stripForm(base), stripForm(unwrapped)].filter(Boolean)),
  ];
}

/**
 * Lookups are fuzzy on purpose: the asset file indexes "Ecuador" while the
 * polity is called "Republic of Ecuador", and the description file indexes
 * "Zhou dynasty" while the same polity may be "Zhou Dynasty" (case differs
 * between the two datasets — the JSON even holds both spellings).
 */
export function findPolityAsset(
  name: string,
  assets: Record<string, PolityAsset>,
): PolityAsset | null {
  for (const core of nameCores(name)) {
    const hit = assets[core];
    if (hit) return hit;
  }
  const lowered = nameCores(name).map((c) => c.toLowerCase());

  for (const core of lowered) {
    const alias = ASSET_ALIASES[core];
    if (alias && assets[alias]) return assets[alias];
  }

  for (const [key, value] of Object.entries(assets)) {
    if (lowered.includes(key.toLowerCase())) return value;
  }

  /*
   * Official long names.
   *
   * The tiles call the state "People's Republic of China" while the asset file
   * indexes it under "China", and `nameCores` cannot bridge that: it only strips
   * a leading "Republic of ...". Every modern state therefore lost its flag and
   * capital unless the two names happened to coincide — which is why the PRC card
   * showed no flag at all. `nameOfficial` is the field that maps one to the other.
   */
  for (const value of Object.values(assets)) {
    const official = (value.nameOfficial ?? '').toLowerCase().trim();
    if (official && lowered.includes(official)) return value;
  }
  return null;
}

export function findPolityDescription(
  name: string,
  descriptions: Record<string, PolityDescription>,
): PolityDescription | null {
  for (const core of nameCores(name)) {
    const hit = descriptions[core];
    if (hit) return hit;
  }
  const lowered = nameCores(name).map((c) => c.toLowerCase());
  for (const [key, value] of Object.entries(descriptions)) {
    if (lowered.includes(key.toLowerCase())) return value;
  }
  return null;
}

let polityFactsCache: Record<string, PolityFacts> | null = null;
let polityFactsInflight: Promise<Record<string, PolityFacts>> | null = null;

export async function loadPolityFacts(): Promise<Record<string, PolityFacts>> {
  if (polityFactsCache) return polityFactsCache;
  if (polityFactsInflight) return polityFactsInflight;
  polityFactsInflight = (async () => {
    try {
      const res = await fetch(`${NE_BASE}polity_facts.json`);
      polityFactsCache = res.ok ? ((await res.json()) as Record<string, PolityFacts>) : {};
    } catch {
      polityFactsCache = {};
    }
    polityFactsInflight = null;
    return polityFactsCache;
  })();
  return polityFactsInflight;
}

/**
 * Same fuzzy lookup as the descriptions, plus one extra step.
 *
 * The tiles label a polity "(Qing Dynasty)" while the fact file may hold
 * "Qing dynasty"; the parentheses come from the upstream data and mean nothing,
 * so they are stripped before comparing.
 */
const withoutParens = (value: string) => value.replace(/[()]/g, '').toLowerCase().trim();

export function findPolityFacts(
  name: string,
  facts: Record<string, PolityFacts>,
): PolityFacts | null {
  for (const core of nameCores(name)) {
    const hit = facts[core];
    if (hit) return hit;
  }
  const wanted = nameCores(name).flatMap((core) => [core.toLowerCase(), withoutParens(core)]);
  for (const [key, value] of Object.entries(facts)) {
    const candidate = key.toLowerCase();
    if (wanted.includes(candidate) || wanted.includes(withoutParens(key))) return value;
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   People
   ══════════════════════════════════════════════════════════════════════════ */

let peopleIndexCache: PersonIndexItem[] | null = null;
let peopleIndexInflight: Promise<PersonIndexItem[]> | null = null;

/**
 * The 410-row index ships as one ~100 KB file, so it is fetched whole and
 * filtered in memory. Individual profiles are only fetched when one is opened.
 */
/**
 * Life-stage coordinates for every person, keyed by id.
 *
 * Generated by `scripts/data/build-people-coords.mjs` from the profiles: the
 * index itself has no geography, and fetching 414 profiles just to answer "who
 * lived inside this empire" would cost megabytes for one checkbox.
 */
let peopleCoordsCache: Record<string, [number, number][]> | null = null;
let peopleCoordsInflight: Promise<Record<string, [number, number][]>> | null = null;

export async function loadPeopleCoords(): Promise<Record<string, [number, number][]>> {
  if (peopleCoordsCache) return peopleCoordsCache;
  if (peopleCoordsInflight) return peopleCoordsInflight;
  peopleCoordsInflight = (async () => {
    try {
      const res = await fetch(`${PEOPLE_COORDS}`);
      if (!res.ok) return {};
      const json = (await res.json()) as Record<string, [number, number][]>;
      peopleCoordsCache = json && typeof json === 'object' ? json : {};
      return peopleCoordsCache;
    } catch {
      return {};
    } finally {
      peopleCoordsInflight = null;
    }
  })();
  return peopleCoordsInflight;
}

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
