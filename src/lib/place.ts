import type { PlaceCity } from '@/types';

/**
 * Turning a place's polity spans into a readable era band.
 *
 * The build stores one list of spans per polity, which is the honest shape:
 * overlapping polities stay visible instead of being silently resolved. The
 * band, though, needs a single owner per year, so this module picks the most
 * specific one (shortest containing span) and flags the years where more than
 * one polity claimed the point. Nothing is discarded — `contested` is what the
 * UI uses to say "border approximation, overlapping polities".
 */
export interface PlaceSegment {
  from: number;
  to: number;
  name: string;
  contested: boolean;
}

export function placeSegments(city: PlaceCity): PlaceSegment[] {
  const { from: dataFrom, to: dataTo } = city.coverage;
  if (!city.polities.length) return [];

  const owner = new Map<number, { name: string; len: number; count: number }>();
  for (const polity of city.polities) {
    for (const [from, to] of polity.spans) {
      const len = to - from;
      for (let year = from; year <= to; year += 1) {
        const current = owner.get(year);
        if (!current) {
          owner.set(year, { name: polity.name, len, count: 1 });
          continue;
        }
        current.count += 1;
        // The most specific claim wins: the smallest polygon usually is the
        // local one, while the empire is the umbrella.
        if (len < current.len) {
          current.name = polity.name;
          current.len = len;
        }
      }
    }
  }

  const out: PlaceSegment[] = [];
  for (let year = dataFrom; year <= dataTo; year += 1) {
    const hit = owner.get(year);
    if (!hit) continue;
    const last = out[out.length - 1];
    if (last && last.to === year - 1 && last.name === hit.name) {
      last.to = year;
      last.contested = last.contested || hit.count > 1;
    } else {
      out.push({ from: year, to: year, name: hit.name, contested: hit.count > 1 });
    }
  }
  return out;
}

/** The segment containing `year`, or null when no polity covered it. */
export function placeSegmentAt(segments: PlaceSegment[], year: number): PlaceSegment | null {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segments[mid];
    if (year < seg.from) hi = mid - 1;
    else if (year > seg.to) lo = mid + 1;
    else return seg;
  }
  return null;
}
