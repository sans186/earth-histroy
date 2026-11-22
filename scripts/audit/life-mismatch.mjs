/**
 * Detects events whose own year falls outside a referenced person's life span.
 *
 * Why: the dataset was generated year by year with entity names carried across
 * shards, so a Roman-era shard can inherit "Kangxi" and a Han shard can inherit
 * an emperor who lived 1800 years later. A person's birth/death is objective, so
 * "this shard mentions him more than a year before birth or after death" is a
 * provable inconsistency that does not depend on historical interpretation.
 *
 * Output: .tmp-audit/life-mismatch.json grouped by year bucket for parallel fix.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const profilesDir = path.join(root, 'public/people/profiles');
const eventsDir = path.join(root, 'public/events');
const outDir = path.join(root, '.tmp-audit');

const profiles = [];
for (const file of fs.readdirSync(profilesDir)) {
  if (!file.endsWith('.json') || file === 'index.json') continue;
  const p = JSON.parse(fs.readFileSync(path.join(profilesDir, file), 'utf8'));
  if (p?.personId && typeof p.birth === 'number' && typeof p.death === 'number') profiles.push(p);
}

const TOLERANCE = 1;
const hits = [];

for (const file of fs.readdirSync(eventsDir)) {
  if (!file.endsWith('.json')) continue;
  let shard;
  try {
    shard = JSON.parse(fs.readFileSync(path.join(eventsDir, file), 'utf8'));
  } catch {
    continue;
  }
  const year = typeof shard.year === 'number' ? shard.year : Number.parseInt(file, 10);
  if (!Number.isFinite(year)) continue;
  const eraText = String(shard.era_context ?? '');
  for (const event of shard.events ?? []) {
    const text = [event.title, event.description, ...(event.key_figures ?? [])].filter(Boolean).join('\n');
    const flagged = [];
    for (const p of profiles) {
      if (!p.name || p.name.length < 2) continue;
      if (!text.includes(p.name)) continue;
      if (year < p.birth - TOLERANCE) flagged.push({ personId: p.personId, name: p.name, kind: 'before-birth', birth: p.birth, death: p.death });
      else if (year > p.death + TOLERANCE) flagged.push({ personId: p.personId, name: p.name, kind: 'after-death', birth: p.birth, death: p.death });
    }
    if (flagged.length) {
      hits.push({ file, year, eventId: event.id, title: event.title, flagged, eraContext: eraText.slice(0, 120) });
    }
  }
}

const bucketOf = (year) => {
  if (year < 0) return 'a-negative';
  if (year < 1000) return 'b-0000-0999';
  if (year < 1500) return 'c-1000-1499';
  if (year < 1800) return 'd-1500-1799';
  return 'e-1800-2100';
};

const buckets = {};
for (const hit of hits) {
  const key = bucketOf(hit.year);
  (buckets[key] ??= []).push(hit);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'life-mismatch.json'), JSON.stringify({ total: hits.length, buckets }, null, 2), 'utf8');

const summary = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length]));
console.log(JSON.stringify({ total: hits.length, buckets: summary, files: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, new Set(v.map((h) => h.file)).size])) }, null, 2));
