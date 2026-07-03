/**
 * Fetch Wikipedia summaries for all polities in the Cliopatria dataset.
 *
 * Produces public/ne/polity_descriptions.json — a lookup keyed by
 * Wikipedia page name (e.g. "Han_dynasty") with English + Chinese
 * extracts, thumbnail URL, and existence years.
 *
 * Usage:  node scripts/fetch_polity_descriptions.cjs
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const POLITIES_DIR = 'public/ne/polities';
const ZH_NAME_FILE = 'public/ne/polity_names_zh.json';
const OUTPUT_FILE = 'public/ne/polity_descriptions.json';

const UA = 'EarthHistoricalTimeline/1.0 (data-fetch-script)';
const DELAY_MS = 350; // be polite to Wikipedia servers

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── HTTP helpers ──

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Parse error: ${e.message} — from ${url}`));
          }
        } else if (res.statusCode === 404) {
          resolve(null);
        } else if (res.statusCode === 429) {
          // Rate limited – wait and retry once
          const retryAfter = parseInt(res.headers['retry-after'] || '5', 10);
          setTimeout(() => fetchJSON(url).then(resolve, reject), retryAfter * 1000);
        } else {
          // Drain body before rejecting
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
      });
    }).on('error', reject);
  });
}

// ── Step 1: collect unique polities ──

console.log('Step 1: collecting unique polities from GeoJSON...');

const polityMap = new Map(); // Wikipedia page → { name, from, to }

const files = fs
  .readdirSync(POLITIES_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'index.json');

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(POLITIES_DIR, file), 'utf-8'));
  if (!data.features) continue;
  for (const f of data.features) {
    const wiki = f.properties?.Wikipedia;
    const name = f.properties?.Name;
    if (!wiki || !name) continue;
    const from = f.properties.FromYear;
    const to = f.properties.ToYear;
    if (polityMap.has(wiki)) {
      const existing = polityMap.get(wiki);
      if (from != null && (existing.from == null || from < existing.from)) existing.from = from;
      if (to != null && (existing.to == null || to > existing.to)) existing.to = to;
    } else {
      polityMap.set(wiki, { name, from, to });
    }
  }
}

const entries = [...polityMap.entries()];
console.log(`  → ${entries.length} unique polities with Wikipedia links`);

// ── Step 2: load Chinese name mapping ──

let zhNameMap = {};
try {
  zhNameMap = JSON.parse(fs.readFileSync(ZH_NAME_FILE, 'utf-8'));
  console.log(`  → ${Object.keys(zhNameMap).length} Chinese name mappings loaded`);
} catch {
  console.log('  → No Chinese name mapping found');
}

// ── Main ──

async function main() {

// ── Step 3: fetch English summaries ──

const descriptionMap = new Map();
let fetched = 0;
let failed = 0;
let skipped = 0;

console.log('Step 2: fetching English Wikipedia summaries...');

for (const [wiki, meta] of entries) {
  // Check if already exists (for resuming interrupted runs)
  const existing = descriptionMap.get(wiki);
  if (existing && existing.en) {
    skipped++;
    continue;
  }

  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wiki)}`;
  try {
    const result = await fetchJSON(url);
    if (result && result.extract) {
      if (!descriptionMap.has(wiki)) {
        descriptionMap.set(wiki, {
          name: meta.name,
          from: meta.from,
          to: meta.to,
          en: { title: result.title, extract: result.extract, thumbnail: result.thumbnail?.source || null },
        });
      } else {
        descriptionMap.get(wiki).en = { title: result.title, extract: result.extract, thumbnail: result.thumbnail?.source || null };
      }
    } else {
      // Page doesn't exist or has no extract
      descriptionMap.set(wiki, { name: meta.name, from: meta.from, to: meta.to, en: null });
    }
    fetched++;
  } catch (err) {
    // Still record it so we don't retry on every run
    if (!descriptionMap.has(wiki)) {
      descriptionMap.set(wiki, { name: meta.name, from: meta.from, to: meta.to, en: null });
    }
    failed++;
    console.warn(`  ✗ ${wiki}: ${err.message}`);
  }

  if ((fetched + failed + skipped) % 100 === 0) {
    console.log(`  ... ${fetched + failed + skipped}/${entries.length} (ok=${fetched}, fail=${failed})`);
  }

  await delay(DELAY_MS);
}

console.log(`  ✓ Done: ${fetched} fetched, ${failed} failed, ${skipped} skipped (from cache)`);

// ── Step 4: batch-query Chinese titles via langlinks ──

console.log('Step 3: finding Chinese Wikipedia titles...');

// Collect all entries that need Chinese titles
const needZh = [];
for (const [wiki, desc] of descriptionMap) {
  if (!desc.zh && desc.en) {
    needZh.push(wiki);
  }
}

// Batch in groups of 50
const batchSize = 50;
let zhFound = 0;
let zhSkipped = 0;

for (let i = 0; i < needZh.length; i += batchSize) {
  const batch = needZh.slice(i, i + batchSize);
  const titles = batch.join('|');
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&lllang=zh&titles=${encodeURIComponent(titles)}&format=json&redirects=1&origin=*`;

  try {
    const result = await fetchJSON(url);
    if (result?.query?.pages) {
      for (const pageId of Object.keys(result.query.pages)) {
        if (pageId === '-1') continue; // missing page
        const page = result.query.pages[pageId];
        const langlinks = page.langlinks;
        if (langlinks && langlinks.length > 0) {
          const zhTitle = langlinks[0]['*'];
          const wikiTitle = page.title.replace(/ /g, '_');
          const desc = descriptionMap.get(wikiTitle);
          if (desc) {
            if (!desc._zhTitle) desc._zhTitle = zhTitle;
          }
        }
      }
    }
    zhFound += batch.length;
  } catch (err) {
    console.warn(`  ✗ langlinks batch at ${i}: ${err.message}`);
    zhSkipped += batch.length;
  }

  if ((zhFound + zhSkipped) % 300 === 0 || i + batchSize >= needZh.length) {
    console.log(`  ... ${Math.min(zhFound + zhSkipped, needZh.length)}/${needZh.length}`);
  }

  await delay(DELAY_MS);
}

// Also check polity_names_zh.json for polities that didn't have langlinks
for (const [wiki, desc] of descriptionMap) {
  if (!desc._zhTitle) {
    const engName = desc.name;
    if (zhNameMap[engName]) {
      desc._zhTitle = zhNameMap[engName];
    }
  }
}

const withZhTitle = [...descriptionMap.values()].filter((d) => d._zhTitle).length;
console.log(`  → ${withZhTitle} polities have Chinese titles`);

// ── Step 5: fetch Chinese summaries ──

console.log('Step 4: fetching Chinese Wikipedia summaries...');

let zhFetched = 0;
let zhFail = 0;

for (const [wiki, desc] of descriptionMap) {
  if (!desc._zhTitle) continue;
  if (desc.zh) {
    zhSkipped++;
    continue;
  }

  const zhTitle = desc._zhTitle;
  const url = `https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(zhTitle)}`;

  try {
    const result = await fetchJSON(url);
    if (result && result.extract) {
      desc.zh = { title: result.title, extract: result.extract, thumbnail: result.thumbnail?.source || null };
      zhFetched++;
    }
  } catch (err) {
    zhFail++;
    console.warn(`  ✗ zh:${zhTitle} (${wiki}): ${err.message}`);
  }

  if ((zhFetched + zhFail) % 100 === 0) {
    console.log(`  ... zh: ${zhFetched} ok, ${zhFail} fail`);
  }

  await delay(DELAY_MS);
}

console.log(`  ✓ Done: ${zhFetched} Chinese summaries fetched, ${zhFail} failed`);

// ── Step 6: write output ──

console.log('Step 5: writing output file...');

// Clean up internal fields and serialize
const output = {};
for (const [wiki, desc] of descriptionMap) {
  const clean = { name: desc.name, from: desc.from, to: desc.to };
  if (desc.en) clean.en = { title: desc.en.title, extract: desc.en.extract, thumbnail: desc.en.thumbnail };
  if (desc.zh) clean.zh = { title: desc.zh.title, extract: desc.zh.extract, thumbnail: desc.zh.thumbnail };
  output[wiki] = clean;
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
const stats = fs.statSync(OUTPUT_FILE);
console.log(`  → ${OUTPUT_FILE} (${(stats.size / 1024 / 1024).toFixed(2)} MB, ${Object.keys(output).length} entries)`);

// Summary
const withEn = Object.values(output).filter((d) => d.en).length;
const withZh = Object.values(output).filter((d) => d.zh).length;
console.log(`\nDone! ${Object.keys(output).length} polities total:`);
console.log(`  - English summaries: ${withEn}`);
console.log(`  - Chinese summaries: ${withZh}`);

}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
