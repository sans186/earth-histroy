/**
 * Client-side search: tokenisation, matching and ranking.
 *
 * The index is built ahead of time by `scripts/data/build-search-index.mjs`
 * and fetched lazily by `services/search.ts`. Everything here is a pure
 * function of plain data, so it runs in Node under vitest with no DOM and no
 * network.
 *
 * Chinese has no spaces, so CJK runs are cut into overlapping bigrams
 * ("秦始皇" -> "秦始" + "始皇"). Latin runs are lower-cased words. A one-character
 * CJK query still works because the matcher also scans the names directly.
 */

export type SearchKind = 'event' | 'person' | 'war' | 'polity';

export interface SearchItem {
  id: string;
  type: SearchKind;
  /** Chinese name; may be empty when the source only has an English one. */
  zh: string;
  /** English name; may be empty. */
  en: string;
  /** Representative year (event year, birth year, war start, polity start). */
  year: number | null;
  /** Present only when the source carries a usable point. */
  lon?: number | null;
  lat?: number | null;
}

export interface SearchIndexData {
  version: number;
  generatedAt?: string;
  items: SearchItem[];
  /** Token -> indexes into `items`. */
  tokens: Record<string, number[]>;
}

export interface SearchHit {
  item: SearchItem;
  score: number;
}

export const SEARCH_KINDS: SearchKind[] = ['event', 'person', 'war', 'polity'];

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/** Kind order is also the order results are grouped in. */
const KIND_RANK: Record<SearchKind, number> = {
  event: 0,
  person: 1,
  war: 2,
  polity: 3,
};

function isCjk(ch: string): boolean {
  return CJK.test(ch);
}

/** Tokenise a string the same way the build script indexes it. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const value = String(text ?? '').normalize('NFKC').toLowerCase();
  let latin = '';
  let cjk = '';

  const flushLatin = () => {
    if (latin) {
      out.push(latin);
      latin = '';
    }
  };
  const flushCjk = () => {
    if (!cjk) return;
    if (cjk.length === 1) out.push(cjk);
    else for (let i = 0; i < cjk.length - 1; i += 1) out.push(cjk.slice(i, i + 2));
    cjk = '';
  };

  for (const ch of value) {
    if (isCjk(ch)) {
      flushLatin();
      cjk += ch;
    } else if (/[a-z0-9]/.test(ch)) {
      flushCjk();
      latin += ch;
    } else {
      flushLatin();
      flushCjk();
    }
  }
  flushLatin();
  flushCjk();
  return out;
}

/** Build an index in memory. Runtime uses the prebuilt JSON; tests use this. */
export function buildSearchIndex(items: SearchItem[]): SearchIndexData {
  const tokens: Record<string, number[]> = Object.create(null);
  items.forEach((item, index) => {
    const seen = new Set(tokenize(`${item.zh} ${item.en}`));
    for (const token of seen) {
      if (!tokens[token]) tokens[token] = [];
      tokens[token].push(index);
    }
  });
  return { version: 1, items, tokens };
}

const TOKEN_KEYS = new WeakMap<SearchIndexData, string[]>();

/** Sorted token list, cached per index object, for prefix lookup. */
function tokenKeys(index: SearchIndexData): string[] {
  let keys = TOKEN_KEYS.get(index);
  if (!keys) {
    keys = Object.keys(index.tokens).sort();
    TOKEN_KEYS.set(index, keys);
  }
  return keys;
}

/** Call `visit` for every token starting with `prefix` (binary-search bound). */
function forEachPrefix(
  keys: string[],
  prefix: string,
  tokens: Record<string, number[]>,
  visit: (postings: number[]) => void,
) {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < keys.length && keys[i].startsWith(prefix); i += 1) {
    visit(tokens[keys[i]]);
  }
}

/**
 * Match `query` against the index and return scored hits.
 *
 * Scoring layers:
 *   exact name > name prefix > name substring > token hits > prefix hits.
 * Empty or whitespace-only queries return nothing so the panel can show its
 * idle state instead of dumping the whole corpus.
 */
export function searchItems(index: SearchIndexData, query: string, limit = 40): SearchHit[] {
  const q = String(query ?? '').trim().normalize('NFKC').toLowerCase();
  if (!q || !index?.items?.length) return [];

  const scores = new Map<number, number>();
  const bump = (i: number, score: number) => scores.set(i, (scores.get(i) ?? 0) + score);

  const queryTokens = tokenize(q);

  for (const token of queryTokens) {
    const postings = index.tokens[token];
    if (postings) for (const i of postings) bump(i, token.length >= 2 ? 6 : 3);
  }

  // "qin" should reach "Qing dynasty" and "Qin Shi Huang" through its prefix.
  const keys = tokenKeys(index);
  for (const token of queryTokens) {
    if (!/^[a-z0-9]/.test(token) || token.length < 2) continue;
    forEachPrefix(keys, token, index.tokens, (postings) => {
      for (const i of postings) bump(i, 2);
    });
  }

  // Direct name matching also covers one-character CJK queries, which the
  // bigram index alone cannot resolve.
  const hasCjk = CJK.test(q);
  for (let i = 0; i < index.items.length; i += 1) {
    const item = index.items[i];
    const zh = item.zh.toLowerCase();
    const en = item.en.toLowerCase();
    if (zh === q || en === q) bump(i, 1000);
    else if (zh.startsWith(q) || en.startsWith(q)) bump(i, 400);
    else if ((hasCjk || q.length >= 2) && (zh.includes(q) || en.includes(q))) bump(i, 200);
  }

  const hits: SearchHit[] = [];
  for (const [i, score] of scores) {
    if (score <= 0) continue;
    const item = index.items[i];
    if (!item) continue;
    hits.push({ item, score });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const kind = KIND_RANK[a.item.type] - KIND_RANK[b.item.type];
    if (kind !== 0) return kind;
    return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0;
  });

  return hits.slice(0, Math.max(0, limit));
}

/** Group hits by kind, in `SEARCH_KINDS` order. Empty groups are dropped. */
export function groupHits(hits: SearchHit[]): { kind: SearchKind; hits: SearchHit[] }[] {
  return SEARCH_KINDS.map((kind) => ({
    kind,
    hits: hits.filter((hit) => hit.item.type === kind),
  })).filter((group) => group.hits.length > 0);
}
