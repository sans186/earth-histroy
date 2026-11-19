import type { CategoryKey } from '@/config';

export type Locale = 'zh' | 'en';
export type ViewMode = 'explore' | 'compare';
/** How the explore view is drawn: the globe, or the flat map. */
export type StageMode = '3d' | '2d';

export interface RawSource {
  name?: string;
  type?: string;
  contemporary?: boolean;
  url?: string;
}

export interface RawEvent {
  id?: string;
  title?: string;
  region?: string;
  coordinates_approx?: unknown;
  category?: string;
  description?: string;
  key_figures?: string[];
  sources?: RawSource[];
  certainty?: string;
  certainty_note?: string;
  cross_references?: string[];
}

/**
 * Year-level relation edge. 5225 of the 5226 year files carry these and the
 * interface has never shown them.
 */
export interface RawGraphEdge {
  from?: string;
  to?: string;
  relation?: string;
  note?: string;
}

export interface YearFile {
  year?: number;
  year_label?: string;
  era_context?: string;
  documentation_level?: string;
  events?: RawEvent[];
  historiographic_note?: string;
  disconfirming_evidence?: string | string[];
  geographic_coverage_gaps?: string[];
  graph_edges?: RawGraphEdge[];
}

/** Normalised event used by every view. */
export interface TimelineEvent {
  /** Stable key: source year + index. */
  key: string;
  year: number;
  title: string;
  region: string;
  category: CategoryKey;
  rawCategory: string;
  description: string;
  certainty: string;
  certaintyNote: string;
  sources: RawSource[];
  figures: string[];
  /** Free-text cross references from the dataset, e.g. "1912-001（中华民国成立）". */
  crossReferences: string[];
  lon: number | null;
  lat: number | null;

  /*
   * Everything below is a property of the *year file*, not of the individual
   * event — every event of a given year shares these values. The card labels
   * them as year-level so the scope is never ambiguous.
   */
  /** How well the year is documented, as a free-text string in the corpus. */
  documentationLevel: string;
  /** Narrative context for the year. */
  eraContext: string;
  /** Source-bias appraisal for the year. */
  historiographicNote: string;
  /** Counter-evidence and scholarly revision for the year. */
  disconfirmingEvidence: string;
  /** Regions the year's record does not cover. */
  coverageGaps: string[];
  /** Relations between this year's entries and other years'. */
  graphEdges: RawGraphEdge[];
}

// ── Polities ───────────────────────────────────────────────────────────────
export interface PolityProperties {
  Name?: string;
  FromYear?: number;
  ToYear?: number;
  Area?: number;
  Type?: string;
  Wikipedia?: string;
  SeshatID?: string;
  MemberOf?: string;
  Components?: string;
}

export interface PolityFeature {
  type: 'Feature';
  properties: PolityProperties;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

export interface PolityCollection {
  type: 'FeatureCollection';
  properties?: { window_start?: number; window_end?: number; feature_count?: number };
  features: PolityFeature[];
}

export interface CenturyEntry {
  file: string;
  start: number;
  end: number;
  count: number;
}

export interface PolityFileIndex {
  centuries: CenturyEntry[];
}

/** A feature plus its cached bounding box, computed once per century file. */
export interface PreparedPolity {
  feature: PolityFeature;
  /** [west, south, east, north] in degrees. */
  bbox: [number, number, number, number];
  name: string;
  fromYear: number;
  toYear: number;
  area: number;
}

export interface PolityStatus {
  year: number;
  shown: number;
  matched: number;
  cap: number;
  hidden: number;
  /** Polygon parts skipped in the last render because the camera was too far. */
  partsHidden: number;
  loading: boolean;
  ready: boolean;
}

export interface PolityInfo {
  name: string;
  fromYear: number | null;
  toYear: number | null;
  area: number | null;
  type: string;
  wikipedia: string;
  zhName: string | null;
}

// ── Wars ───────────────────────────────────────────────────────────────────
export interface WarTags {
  warfareType?: string[];
  geopolitical?: string[];
  scale?: string;
  cause?: string[];
}

export interface WarIndexItem {
  warId: string;
  name: string;
  nameEn?: string;
  startYear?: number;
  endYear?: number;
  type?: string;
  category?: string;
  tags?: WarTags;
  summary?: string;
  totalBattles?: number;
}

/** One theatre centroid per war — `public/wars/profiles/war_locations.json`. */
export interface WarLocation {
  lon: number;
  lat: number;
  battles: number;
}

export interface WarBattle {
  battleId?: string;
  name?: string;
  nameEn?: string;
  /** Current schema: the battle's first year. Profiles before it used `year`. */
  startYear?: number;
  endYear?: number;
  /** Legacy single-year field, still present in a handful of profiles. */
  year?: number;
  /** One profile stores its first year under this misspelt key. */
  nameYear?: number;
  /**
   * Approximate `[lon, lat]` centroid. A few profiles store it as a string or a
   * bare number, so it stays untyped instead of claiming an array it is not.
   */
  coords?: unknown;
  /** Current schema: the theatre/place name. Older profiles used `location`. */
  theater?: string;
  location?: string;
  context?: string;
  description?: string;
  /** Current schema: battle result. Older profiles used `outcome`. */
  result?: string;
  outcome?: string;
  significance?: string;
  casualties?: Record<string, string>;
  forces?: Record<string, string>;
  commanders?: { name?: string; role?: string; side?: string }[];
}

export interface WarPhase {
  name?: string;
  nameEn?: string;
  startYear?: number;
  endYear?: number;
  /** Legacy display range, e.g. "-334--333". */
  years?: string;
  summary?: string;
  /** Legacy prose field, used by the phases that predate `summary`. */
  description?: string;
  battles?: WarBattle[];
}

export interface WarTimelineEntry {
  year?: number;
  event?: string;
  type?: string;
  description?: string;
  impact?: string;
}

export interface WarCommander {
  name?: string;
  role?: string;
  bio?: string;
}

export interface WarSide {
  name?: string;
  nameEn?: string;
  countries?: string[];
  commanders?: WarCommander[];
  /** How the force was raised — volunteers, conscription, feudal levy… */
  militarySystem?: string;
  /** Order of battle before the shooting started; often a prose figure. */
  preWarStrength?: string;
  equipment?: string;
  totalCasualties?: string | Record<string, string>;
  propaganda?: string;
  politicalLeaders?: (string | WarCommander)[];
}

/** Full profile from `public/wars/profiles/{warId}.json`. */
export interface WarProfile extends WarIndexItem {
  alternativeNames?: string[];
  theaters?: string[];
  background?: Record<string, string>;
  belligerents?: { sideA?: WarSide; sideB?: WarSide };
  outcome?: {
    result?: string;
    victoryAnalysis?: Record<string, string>;
    treaty?: Record<string, string>;
    territorialChanges?: string;
    demographicImpact?: string;
  };
  legacy?: {
    significance?: string;
    immediateConsequences?: string;
    longTermImpact?: Record<string, string>;
  };
  warProcess?: { phases?: WarPhase[] };
  timeline?: WarTimelineEntry[];
  sources?: { name?: string; type?: string; contemporary?: boolean }[];
}

/** A battle flattened out of its phase, for list rendering. */
export interface FlatBattle {
  name: string;
  year: number | null;
  location: string;
  description: string;
  outcome: string;
  phase: string;
}

// ── People ─────────────────────────────────────────────────────────────────
/** A bilingual string pair, the shape most people-data fields use. */
export interface LocalisedText {
  zh?: string;
  en?: string;
}

/** One row of `public/people/profiles/index.json`. */
export interface PersonIndexItem {
  personId: string;
  name: string;
  nameEn: string;
  birth: number | null;
  death: number | null;
  nationality: string;
  nationalityEn: string;
  totalPoints: number;
  era: string;
}

/** One life stage: where the person was, and what happened there. */
export interface PersonPoint {
  year: number;
  yearEnd: number | null;
  place: string;
  placeEn: string;
  /** [longitude, latitude] */
  coords: [number, number] | null;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
}

/** The dataset's three-sided appraisal of a person. */
export interface PersonEvaluation {
  supporter?: LocalisedText;
  critic?: LocalisedText;
  objective?: LocalisedText;
  /**
   * Optional per-view sources. The shipped profiles do not carry any yet, so
   * every appraisal is treated as unsourced and hidden by default. Adding a
   * list here is enough to make that view eligible for display again.
   */
  sources?: Partial<Record<'supporter' | 'critic' | 'objective', RawSource[]>>;
}

export interface PersonQuotes {
  self?: LocalisedText;
  others?: LocalisedText;
}

/** Full profile from `public/people/profiles/{personId}.json`. */
export interface PersonProfile {
  personId: string;
  name: string;
  nameEn: string;
  birth: number | null;
  death: number | null;
  nationality: string;
  nationalityEn: string;
  totalPoints: number;
  points: PersonPoint[];
  evaluation?: PersonEvaluation;
  quotes?: PersonQuotes;
  othersBy?: string;
  othersByEn?: string;
  image?: string;
}
