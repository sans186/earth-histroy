/**
 * Portrait lookup for person cards.
 *
 * Portraits live in one small JSON keyed by personId, produced by
 * `scripts/data/fetch-people-images.mjs`. It is loaded once per session and
 * cached, because a card must never wait on the network to render its text —
 * and most sessions never open a person whose portrait exists.
 */

interface PortraitRecord {
  url: string | null;
  title?: string;
  page?: string;
  width?: number;
  height?: number;
}

const IMAGES_URL = '/people/images.json';

let pending: Promise<Record<string, PortraitRecord>> | null = null;

function loadAll(): Promise<Record<string, PortraitRecord>> {
  if (!pending) {
    pending = fetch(IMAGES_URL)
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
  }
  return pending;
}

/** Portrait URL for a person, or null when there is none or it failed to load. */
export async function personImageUrl(personId: string | null | undefined): Promise<string | null> {
  if (!personId) return null;
  const all = await loadAll();
  return all[personId]?.url ?? null;
}
