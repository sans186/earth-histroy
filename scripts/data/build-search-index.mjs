/**
 * Build the client-side search index.
 *
 * Everything is derived from the static data already shipped under `public/`:
 * year files (zh + en), the people index and coords, the war index and theatre
 * locations, and the polity lifecycle table. No server, no Elasticsearch — the
 * output is one JSON file the browser fetches lazily the first time search is
 * opened.
 *
 * Tokenisation must stay byte-for-byte compatible with `src/lib/search.ts`:
 *   - CJK runs are cut into overlapping bigrams (a single char stays a unigram);
 *   - Latin runs are lower-cased words.
 * The runtime repeats this algorithm on the query, so the two cannot drift.
 *
 * The output is committed, so it must be a pure function of the input files: the
 * same data has to produce the same bytes, or every `npm run prebuild` shows up
 * as a dirty file in `git status`. That is why there is no build timestamp in
 * the document and why the year files are sorted before being read.
 *
 * Usage: node scripts/data/build-search-index.mjs
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const PUBLIC = resolve(ROOT, 'public');
const OUT = resolve(PUBLIC, 'search-index.json');

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

function isCjk(ch) {
  return CJK.test(ch);
}

/** Keep in sync with `tokenize` in src/lib/search.ts. */
function tokenize(text) {
  const out = [];
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

const LAT_OK = (v) => v >= -90 && v <= 90;
const LON_OK = (v) => v >= -180 && v <= 180;

/** The event dataset writes `coordinates_approx` as free text. */
function parseCoords(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw.trim();

  const directed = text.match(/(\d+(?:\.\d+)?)\s*°?\s*([NSEWnsew])/g);
  if (directed && directed.length >= 2) {
    let lon = null;
    let lat = null;
    for (const token of directed) {
      const m = token.match(/(\d+(?:\.\d+)?)\s*°?\s*([NSEWnsew])/);
      if (!m) continue;
      const value = Number.parseFloat(m[1]);
      switch (m[2].toUpperCase()) {
        case 'N':
          lat = value;
          break;
        case 'S':
          lat = -value;
          break;
        case 'E':
          lon = value;
          break;
        case 'W':
          lon = -value;
          break;
        default:
          break;
      }
    }
    if (lat !== null && lon !== null && LAT_OK(lat) && LON_OK(lon)) return { lon, lat };
  }

  const numbers = text.match(/-?\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length < 2) return null;
  const a = Number.parseFloat(numbers[0]);
  const b = Number.parseFloat(numbers[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  // Dataset convention is "lat, lon"; fall back to the other order when needed.
  if (LAT_OK(a) && LON_OK(b)) return { lon: b, lat: a };
  if (LON_OK(a) && LAT_OK(b)) return { lon: a, lat: b };
  return null;
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

const items = [];

/* ── events ─────────────────────────────────────────────────────────────── */

const eventsDir = resolve(PUBLIC, 'events');
const enEventsDir = resolve(PUBLIC, 'en-events');
// readdirSync order is filesystem-dependent; sorting keeps the item order (and
// therefore every token's postings) stable across machines and rebuilds. Numeric
// so that negative (BCE) years come first instead of sorting as text.
const eventFiles = readdirSync(eventsDir)
  .filter((f) => /^-?\d+\.json$/.test(f))
  .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));

for (const file of eventFiles) {
  const year = Number(file.replace(/\.json$/, ''));
  const zhDoc = readJson(resolve(eventsDir, file), null);
  if (!zhDoc || !Array.isArray(zhDoc.events)) continue;
  const enDoc = readJson(resolve(enEventsDir, file), null);
  const enById = new Map(
    (Array.isArray(enDoc?.events) ? enDoc.events : []).map((ev) => [ev.id, ev.title]),
  );

  zhDoc.events.forEach((ev, index) => {
    const id = ev.id ?? `${year}-${index}`;
    const zh = (ev.title ?? '').trim();
    const en = String(enById.get(ev.id) ?? '').trim();
    if (!zh && !en) return;
    const coords = parseCoords(ev.coordinates_approx);
    const item = {
      id,
      type: 'event',
      zh,
      en,
      year: Number.isFinite(zhDoc.year) ? zhDoc.year : year,
    };
    // Null coordinates are the majority; leaving the keys out saves ~0.4 MB.
    if (coords) {
      item.lon = coords.lon;
      item.lat = coords.lat;
    }
    items.push(item);
  });
}

/* ── people ─────────────────────────────────────────────────────────────── */

const people = readJson(resolve(PUBLIC, 'people', 'profiles', 'index.json'), []);
const coords = readJson(resolve(PUBLIC, 'people', 'coords.json'), {});

for (const person of Array.isArray(people) ? people : []) {
  if (!person?.personId) continue;
  const points = coords[person.personId];
  const first = Array.isArray(points?.[0]) ? points[0] : null;
  const item = {
    id: person.personId,
    type: 'person',
    zh: String(person.name ?? '').trim(),
    en: String(person.nameEn ?? '').trim(),
    year: Number.isFinite(person.birth) ? person.birth : null,
  };
  if (first) {
    item.lon = first[0];
    item.lat = first[1];
  }
  items.push(item);
}

/* ── wars ───────────────────────────────────────────────────────────────── */

const wars = readJson(resolve(PUBLIC, 'wars', 'profiles', 'index.json'), []);
const warLocations = readJson(resolve(PUBLIC, 'wars', 'profiles', 'war_locations.json'), {});

for (const war of Array.isArray(wars) ? wars : []) {
  if (!war?.warId) continue;
  const loc = warLocations[war.name] ?? warLocations[war.warId] ?? null;
  const item = {
    id: war.warId,
    type: 'war',
    zh: String(war.name ?? '').trim(),
    en: String(war.nameEn ?? '').trim(),
    year: Number.isFinite(war.startYear) ? war.startYear : null,
  };
  if (Number.isFinite(loc?.lon) && Number.isFinite(loc?.lat)) {
    item.lon = loc.lon;
    item.lat = loc.lat;
  }
  items.push(item);
}

/* ── polities ───────────────────────────────────────────────────────────── */

const lifecycleFile = readJson(resolve(PUBLIC, 'ne', 'polity_lifecycles.json'), {});
const lifecycles = lifecycleFile.polities ?? {};
const polityNamesZh = readJson(resolve(PUBLIC, 'ne', 'polity_names_zh.json'), {});

for (const [key, life] of Object.entries(lifecycles)) {
  const zh = String(life?.nameZh || polityNamesZh[key] || key).trim();
  if (!key && !zh) continue;
  items.push({
    id: key,
    type: 'polity',
    zh,
    en: key,
    year: Number.isFinite(life?.first) ? life.first : null,
  });
}

/* ── inverted index ─────────────────────────────────────────────────────── */

const startedAt = Date.now();
const tokens = Object.create(null);

items.forEach((item, index) => {
  const seen = new Set(tokenize(`${item.zh} ${item.en}`));
  for (const token of seen) {
    if (!tokens[token]) tokens[token] = [];
    tokens[token].push(index);
  }
});

// No timestamp here: the document is tracked by git, and a fresh one on every
// prebuild rewrote the file with no information the client ever reads.
const output = {
  version: 1,
  items,
  tokens,
};

const json = JSON.stringify(output);
writeFileSync(OUT, json);

const counts = items.reduce((acc, item) => {
  acc[item.type] = (acc[item.type] ?? 0) + 1;
  return acc;
}, {});
const bytes = statSync(OUT).size;
const elapsed = Date.now() - startedAt;

console.log(
  `search index: ${items.length} items ` +
    `(events ${counts.event ?? 0}, people ${counts.person ?? 0}, ` +
    `wars ${counts.war ?? 0}, polities ${counts.polity ?? 0})`,
);
console.log(`  tokens: ${Object.keys(tokens).length}`);
console.log(`  size: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`  wrote ${OUT} in ${elapsed} ms`);
