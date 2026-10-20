#!/usr/bin/env node
/**
 * Fetch a portrait for each person from Wikipedia.
 *
 * Uses the REST summary endpoint, which returns `thumbnail.source` — the same
 * endpoint `fetch_polity_descriptions.cjs` already relies on. No new data
 * source, no API key, and no scraping of article HTML.
 *
 * Outputs
 * -------
 *   public/people/images.json        personId → { url, title, page, width, height }
 *   public/people/images-review.json flat list for the review page
 *
 * The second file exists so the review page can render 410 rows from one
 * request instead of opening 410 profile files.
 *
 * Usage
 * -----
 *   node scripts/data/fetch-people-images.mjs                # fill in missing only
 *   node scripts/data/fetch-people-images.mjs --force        # refetch everything
 *   LIMIT=20 node scripts/data/fetch-people-images.mjs       # trial run
 *
 * Re-runnable: entries already present are kept unless `--force`, so an
 * interrupted run can simply be started again.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROFILES = join(ROOT, 'public/people/profiles');
const IMAGES_OUT = join(ROOT, 'public/people/images.json');
const REVIEW_OUT = join(ROOT, 'public/people/images-review.json');

/** Wikipedia's API policy requires an identifying User-Agent. */
const USER_AGENT = 'EarthHistoricalTimeline/2.0 (local research build)';
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);
const LIMIT = Number(process.env.LIMIT ?? 0);
const FORCE = process.argv.includes('--force');

async function fetchSummary(title) {
  const slug = encodeURIComponent(title.trim().replace(/\s+/g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, accept: 'application/json' },
  });
  // 404 is the normal "no such article" case, not a failure worth retrying.
  if (!response.ok) return null;
  return response.json();
}

function readPeople() {
  const index = JSON.parse(readFileSync(join(PROFILES, 'index.json'), 'utf8'));
  return index.map((entry) => {
    let profile = {};
    try {
      profile = JSON.parse(readFileSync(join(PROFILES, `${entry.personId}.json`), 'utf8'));
    } catch {
      // A missing profile should not abort the whole run.
    }
    return {
      personId: entry.personId,
      name: profile.name ?? entry.name ?? '',
      nameEn: profile.nameEn ?? '',
    };
  });
}

/** Run `worker` over `items` with a fixed number of lanes in flight. */
async function pool(items, lanes, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(lanes, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

const people = readPeople();
const images = existsSync(IMAGES_OUT) ? JSON.parse(readFileSync(IMAGES_OUT, 'utf8')) : {};

let queue = people.filter((p) => p.nameEn && (FORCE || !images[p.personId]?.url));
if (LIMIT > 0) queue = queue.slice(0, LIMIT);

console.log(
  `\n人物 ${people.length} 位，已有照片 ${Object.keys(images).filter((k) => images[k]?.url).length} 位，` +
    `本次抓取 ${queue.length} 位（并发 ${CONCURRENCY}）\n`,
);

let done = 0;
let hit = 0;
const misses = [];

await pool(queue, CONCURRENCY, async (person) => {
  done += 1;
  try {
    const json = await fetchSummary(person.nameEn);
    const thumb = json?.thumbnail?.source ?? json?.originalimage?.source ?? null;
    if (thumb) {
      hit += 1;
      images[person.personId] = {
        url: thumb,
        title: json.title ?? person.nameEn,
        page: json.content_urls?.desktop?.page ?? null,
        width: json.thumbnail?.width ?? null,
        height: json.thumbnail?.height ?? null,
      };
    } else {
      misses.push(person.nameEn);
      images[person.personId] = images[person.personId] ?? { url: null };
    }
  } catch (error) {
    misses.push(`${person.nameEn} (${error.message})`);
  }
  if (done % 20 === 0 || done === queue.length) {
    console.log(`  ${done}/${queue.length}  命中 ${hit}`);
  }
});

writeFileSync(IMAGES_OUT, JSON.stringify(images, null, 2));
writeFileSync(
  REVIEW_OUT,
  JSON.stringify(
    people.map((p) => ({
      personId: p.personId,
      name: p.name,
      nameEn: p.nameEn,
      image: images[p.personId]?.url ?? null,
      title: images[p.personId]?.title ?? null,
      page: images[p.personId]?.page ?? null,
    })),
    null,
    2,
  ),
);

const total = Object.values(images).filter((v) => v?.url).length;
console.log(`\n本次命中 ${hit}/${queue.length}，累计 ${total}/${people.length} 位有照片`);
console.log(`输出: ${IMAGES_OUT}`);
console.log(`审查: ${REVIEW_OUT}`);
if (misses.length) console.log(`未命中（前 10）: ${misses.slice(0, 10).join('、')}`);
console.log('');
