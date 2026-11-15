/**
 * Lookups into the English → Chinese polity name map.
 *
 * `polity_names_zh.json` was generated from two datasets that disagree on
 * capitalisation ("Han dynasty" and "Han Dynasty" are both in the file), so an
 * exact-key lookup silently misses on some polities and the Chinese interface
 * prints the English name. The index built here makes the second attempt
 * case-insensitive, and it is memoised per map object because the map is a
 * single long-lived record.
 */
const lowerIndex = new WeakMap<Record<string, string>, Map<string, string>>();

function indexOf(names: Record<string, string>): Map<string, string> {
  let index = lowerIndex.get(names);
  if (!index) {
    index = new Map();
    for (const [key, value] of Object.entries(names)) {
      const normalised = key.trim().toLowerCase();
      // First spelling wins; the duplicates in the file all share one value.
      if (!index.has(normalised)) index.set(normalised, value);
    }
    lowerIndex.set(names, index);
  }
  return index;
}

/** Chinese name for `raw`, or null when the map has no entry for it. */
export function zhPolityName(raw: string, names?: Record<string, string>): string | null {
  if (!names) return null;
  const direct = names[raw];
  if (direct) return direct;
  const key = raw.trim();
  const trimmed = names[key];
  if (trimmed) return trimmed;
  return indexOf(names).get(key.toLowerCase()) ?? null;
}
