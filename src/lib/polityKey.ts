/**
 * How one polity is identified.
 *
 * Cliopatria names the same polity two ways across its slices: next to
 * "Qing Dynasty" there is a "(Qing Dynasty)" feature carrying a byte-for-byte
 * copy of the same geometry. Treated as two polities, a 266-year dynasty reads
 * as two short ones — and the card's "only this polity" filter then drops
 * everything outside the slice it was opened from.
 *
 * Unwrapping the name is therefore the first step of every identity: the scope
 * key, the lifecycle table key, and the derived year span all agree on it.
 * The span is deliberately not part of the key. Every slice is a temporal
 * snapshot of the same polity, so name plus dates would make one polity look
 * like dozens.
 */

/** "(Qing Dynasty)" → "Qing Dynasty"; collapses runs of whitespace. */
export function canonicalPolityName(raw: string | null | undefined): string {
  let name = (raw ?? '').trim();
  const wrapped = /^\(([^()]*)\)$/.exec(name);
  if (wrapped) name = wrapped[1].trim();
  return name.replace(/\s+/g, ' ');
}

/** Identity key for a polity, shared by `PolityScope` and `polity_lifecycles.json`. */
export function polityKey(name: string | null | undefined): string {
  return canonicalPolityName(name);
}
