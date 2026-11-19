import { formatYearRange } from '@/lib/format';
import { zhPolityName } from '@/lib/names';
import { findRegion, regionLabel, regionOf } from '@/lib/regions';
import type { Locale, PolityFeature, TimelineEvent } from '@/types';

/**
 * What one comparison column is looking at.
 *
 * The board used to compare two hard-coded regions on the current year, while
 * the polity card shipped a "compare" button wired to a no-op. A column can now
 * be a polity too, and a polity column filters events by that polity's own
 * extent rather than by a continent-sized box.
 */
export type CompareSubject =
  | { kind: 'region'; id: string }
  | { kind: 'polity'; feature: PolityFeature };

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Extent of a polity, tolerant of both Polygon and MultiPolygon.
 *
 * Deliberately a plain lon/lat box: polities that straddle the antimeridian
 * (Russia, the Pacific empires) get a box that wraps the wrong way and will
 * over-select events. The dataset's own region boxes have the same limitation,
 * so this stays consistent with how the rest of the app places events.
 */
export function bboxOfFeature(feature: PolityFeature): BBox | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates) return null;

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const visit = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      const lon = node[0] as number;
      const lat = node[1] as number;
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      return;
    }
    for (const child of node) visit(child);
  };

  visit(coordinates);
  return Number.isFinite(west) ? { west, south, east, north } : null;
}

/**
 * `names` is the English → Chinese polity map. Cliopatria stores only English
 * names, so without it a Chinese interface still printed "Song dynasty" in the
 * comparison header — the polity card had been localised, the board had not.
 */
export function subjectLabel(
  subject: CompareSubject,
  locale: Locale,
  names?: Record<string, string>,
): string {
  if (subject.kind === 'region') {
    const region = findRegion(subject.id);
    return region ? regionLabel(region, locale) : subject.id;
  }
  const raw = subject.feature.properties?.Name ?? '—';
  return locale === 'zh' ? (zhPolityName(raw, names) ?? raw) : raw;
}

/** Events that fall inside the subject: region box, or the polity's own extent. */
export function subjectEvents(
  events: TimelineEvent[],
  subject: CompareSubject,
): TimelineEvent[] {
  if (subject.kind === 'region') return events.filter((e) => regionOf(e) === subject.id);

  const box = bboxOfFeature(subject.feature);
  if (!box) return [];
  return events.filter(
    (e) =>
      e.lon !== null &&
      e.lat !== null &&
      e.lon >= box.west &&
      e.lon <= box.east &&
      e.lat >= box.south &&
      e.lat <= box.north,
  );
}

/**
 * Dedupe key for the yearly restatements that fill the corpus.
 *
 * The same event is often repeated in consecutive year files (Taiping forces
 * taking Yangzhou appear in 1852, 1853 and 1854). Those repeats belong in the
 * timeline, but counting each one inflates the comparison's intensity, so the
 * statistics collapse titles that differ only in spacing, case or punctuation.
 */
export function eventTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[：:；;，,。.、！!？?（）()《》〈〉「」『』“”"'‘’\-—_·]/g, '');
}

/**
 * Stable identity for an event row, used only by the comparison statistics.
 *
 * The same event is often repeated in consecutive year files (Taiping forces
 * taking Yangzhou appear in 1852, 1853 and 1854). Those repeats belong in the
 * timeline, but counting each one inflates the comparison's intensity. The key
 * is the normalised title plus category and rounded coordinates: title alone
 * would merge genuinely different battles that happen to share a name
 * (Fontenoy 841 and 1745), while coordinates alone would merge different
 * events at the same place.
 */
export function eventKey(event: TimelineEvent): string {
  const lon = event.lon === null ? '' : event.lon.toFixed(2);
  const lat = event.lat === null ? '' : event.lat.toFixed(2);
  return `${eventTitleKey(event.title)}|${event.category}|${lon},${lat}`;
}

/**
 * Collapse yearly restatements before comparison statistics run.
 * The earliest occurrence wins; event files themselves stay untouched.
 */
export function dedupeRestatements(events: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = eventKey(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The polity's own dates, which a region column simply does not have. */
export function subjectSpan(subject: CompareSubject, locale: Locale): string | null {
  if (subject.kind !== 'polity') return null;
  const from = subject.feature.properties?.FromYear;
  const to = subject.feature.properties?.ToYear;
  if (from === undefined && to === undefined) return null;
  return formatYearRange(from, to, locale);
}
