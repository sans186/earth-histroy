/**
 * Portrait lookup for person cards.
 *
 * Portraits live in one small JSON keyed by personId, produced by
 * `scripts/data/fetch-people-images.mjs`. It is loaded once per session and
 * cached, because a card must never wait on the network to render its text —
 * and most sessions never open a person whose portrait exists.
 *
 * A failed load is *not* cached: the old version stored `{}` forever, so one
 * dropped request silently removed every portrait for the rest of the session.
 */
import { fetchOptionalJson } from '@/services/http';

interface PortraitRecord {
  url: string | null;
  title?: string;
  page?: string;
  width?: number;
  height?: number;
}

const IMAGES_URL = '/people/images.json';

let cache: Record<string, PortraitRecord> | null = null;
let pending: Promise<Record<string, PortraitRecord>> | null = null;

function loadAll(): Promise<Record<string, PortraitRecord>> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetchOptionalJson<Record<string, PortraitRecord>>(IMAGES_URL, {}, {
      allowMissing: true,
    }).then(({ data, ok }) => {
      if (ok) cache = data;
      pending = null;
      return data;
    });
  }
  return pending;
}

/** Portrait URL for a person, or null when there is none or it failed to load. */
export async function personImageUrl(personId: string | null | undefined): Promise<string | null> {
  if (!personId) return null;
  const all = await loadAll();
  return all[personId]?.url ?? null;
}
