/**
 * Flatten every person's life-stage coordinates into one small lookup file.
 *
 * The people index (`people/profiles/index.json`) carries no geography at all —
 * only a nationality string. That is enough to attach a person to a modern
 * country, but not to a historical polity: the Qing dynasty's people are
 * recorded as "中国", so name matching finds none of them.
 *
 * The profiles do carry coordinates per life stage (413 of 414 people, 2170
 * points). Loading 414 files to filter one list is out of the question, so this
 * writes the coordinates alone into `people/profiles/coords.json` (~30 KB),
 * which the panel can fetch once and filter against locally.
 *
 * Usage: node scripts/data/build-people-coords.mjs
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const PROFILES = resolve(ROOT, 'public', 'people', 'profiles');
/*
 * Written beside the profile directory, not inside it. The data validator walks
 * `profiles/` and treats every JSON file there as a person, so living there made
 * this lookup file look like an unindexed person on every run.
 */
const OUT = resolve(ROOT, 'public', 'people', 'coords.json');

/** Enough to catch every theatre a life passed through, without bloat. */
const MAX_POINTS = 12;

const files = readdirSync(PROFILES).filter(
  (f) => f.endsWith('.json') && f !== 'index.json' && f !== 'coords.json',
);

const out = {};
let skipped = 0;

for (const file of files) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(resolve(PROFILES, file), 'utf8'));
  } catch {
    skipped += 1;
    continue;
  }

  const id = doc.personId ?? file.replace(/\.json$/, '');
  const points = [];
  const seen = new Set();

  for (const stage of doc.points ?? []) {
    const coords = stage?.coords;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    // Number(null) === 0 and Number('') === 0, so a "no coordinates" pair used
    // to be written as [0, 0] and drawn in the Gulf of Guinea. Reject any
    // non-numeric entry before converting.
    if (coords[0] === null || coords[1] === null || coords[0] === '' || coords[1] === '') continue;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) continue;

    // Two decimals is ~1 km; the filter only needs a box test.
    const key = `${lon.toFixed(2)},${lat.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push([Number(lon.toFixed(2)), Number(lat.toFixed(2))]);
    if (points.length >= MAX_POINTS) break;
  }

  if (points.length) out[id] = points;
}

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, JSON.stringify(sorted) + '\n', 'utf8');

const total = Object.values(sorted).reduce((sum, pts) => sum + pts.length, 0);
console.log(
  `已写入 ${OUT}\n人物 ${Object.keys(sorted).length} / ${files.length} 个有点位，共 ${total} 个点，` +
    `跳过 ${skipped} 个无法解析的档案`,
);
