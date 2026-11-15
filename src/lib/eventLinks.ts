import type { TimelineEvent } from '@/types';

/**
 * Event ids encode their own year: "1912-001" for 1912 CE, "-1-001" for 1 BCE.
 *
 * Everything that points at another entry — `cross_references` and the year's
 * `graph_edges` — uses that id, which is why a reference can be resolved with a
 * single year file instead of a global search.
 */
const ID_PREFIX = /^\s*(-?\d+-\d{3})/;

export interface EventRef {
  raw: string;
  /** "1912-001", or null when the reference is only a title. */
  id: string | null;
  year: number | null;
  /** What to show: the parenthetical title, or the reference with its id cut. */
  title: string;
}

export function yearOfEventId(id: string): number | null {
  const match = id.match(/^(-?\d+)-\d+$/);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  return Number.isFinite(year) ? year : null;
}

/**
 * "1912-001（第一次巴尔干战争，前奏）" → id, year, title.
 *
 * The old card parsed this with a bare year regex, so the id was thrown away and
 * the button could only move the clock. Keeping the id is the whole point.
 */
export function parseEventRef(raw: string): EventRef {
  const text = String(raw);
  const idMatch = text.match(ID_PREFIX);
  const id = idMatch ? idMatch[1] : null;

  const paren = text.match(/[（(]([^（()）]+)[)）]\s*$/);
  const stripped = text.replace(ID_PREFIX, '').replace(/^[\s（(]+|[)）\s]+$/g, '');
  const title = (paren ? paren[1] : stripped).trim() || text;

  return { raw: text, id, year: id ? yearOfEventId(id) : null, title };
}

export interface EventEdgeLink {
  id: string;
  year: number | null;
  relation: string;
  note: string;
  /** True when this event is the edge's subject rather than its target. */
  outgoing: boolean;
}

/**
 * Edges that touch this event.
 *
 * A year file carries every edge recorded for that year, both directions, so
 * the board has to filter down to the open entry before showing anything.
 */
export function edgeLinksOf(event: TimelineEvent): EventEdgeLink[] {
  const key = event.key;
  const out: EventEdgeLink[] = [];
  const seen = new Set<string>();

  for (const edge of event.graphEdges ?? []) {
    const from = (edge.from ?? '').trim();
    const to = (edge.to ?? '').trim();
    const other = from === key ? to : to === key ? from : '';
    if (!other || other === key) continue;

    // The same pair can be recorded in both years; keep it once.
    const dedupe = `${other}:${edge.relation ?? ''}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    out.push({
      id: other,
      year: yearOfEventId(other),
      relation: (edge.relation ?? '').trim(),
      note: (edge.note ?? '').trim(),
      outgoing: from === key,
    });
  }

  return out;
}
