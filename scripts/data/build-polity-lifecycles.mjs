/**
 * Derive `public/ne/polity_lifecycles.json` from the shipped century slices.
 *
 * Why this exists
 * ---------------
 * `polity_descriptions.json` carries `from`/`to`, but those are the bounds of
 * one snapshot, not a polity's lifetime: 1,041 of its 1,971 entries span 25
 * years or less. The card showed that as "存续" and the "only this polity"
 * filter used it as the date window, so the Ottoman Empire read 1305–1325 and
 * everything after 1325 was filtered out.
 *
 * The slices themselves hold the evidence. One polity appears in many of them,
 * each feature carrying its own FromYear/ToYear and the Area of that snapshot.
 * Aggregating them gives the recorded span and an area curve — both derived
 * from shipped data, with no generated content.
 *
 * The same polity is also filed under two spellings ("Qing Dynasty" and
 * "(Qing Dynasty)", the latter a byte-for-byte copy), so names are canonicalised
 * before grouping. See src/lib/polityKey.ts.
 *
 * Usage: node scripts/data/build-polity-lifecycles.mjs
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve('.');
const POLITIES_DIR = join(ROOT, 'public', 'ne', 'polities');
const OUT = join(ROOT, 'public', 'ne', 'polity_lifecycles.json');
const NAMES_ZH = join(ROOT, 'public', 'ne', 'polity_names_zh.json');

/** Mirrors src/lib/polityKey.ts. */
function canonicalPolityName(raw) {
  let name = String(raw ?? '').trim();
  const wrapped = /^\(([^()]*)\)$/.exec(name);
  if (wrapped) name = wrapped[1].trim();
  return name.replace(/\s+/g, ' ');
}

const index = JSON.parse(readFileSync(join(POLITIES_DIR, 'index.json'), 'utf8'));
if (!Array.isArray(index)) throw new Error('polities/index.json is not an array');

const namesZh = JSON.parse(readFileSync(NAMES_ZH, 'utf8'));

/** canonical name → { variants:Set, points:Map<"from-to", area> } */
const groups = new Map();
let rows = 0;
let skippedNoName = 0;
let skippedNoYears = 0;
let skippedNoArea = 0;
let bracketRows = 0;

for (const entry of index) {
  const stem = `polities_${entry.start}_${entry.end}`;
  const doc = JSON.parse(readFileSync(join(POLITIES_DIR, `${stem}.json`), 'utf8'));
  const features = doc?.features ?? [];

  for (const feature of features) {
    rows += 1;
    const props = feature?.properties ?? {};
    const raw = props.Name;
    if (!raw || !String(raw).trim()) {
      skippedNoName += 1;
      continue;
    }
    const name = canonicalPolityName(raw);
    if (name !== String(raw).trim()) bracketRows += 1;

    const from = Number(props.FromYear);
    const to = Number(props.ToYear);
    const area = Number(props.Area);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
      skippedNoYears += 1;
      continue;
    }
    if (!Number.isFinite(area) || area <= 0) {
      skippedNoArea += 1;
      continue;
    }

    let group = groups.get(name);
    if (!group) {
      group = { variants: new Set(), points: new Map() };
      groups.set(name, group);
    }
    group.variants.add(String(raw).trim());

    // The bracketed copy carries the same geometry and the same Area. Summing
    // would double Qing's 12.5 million km² to 25 million, so duplicates keep
    // the larger reading instead.
    const key = `${from}|${to}`;
    const prev = group.points.get(key);
    if (prev === undefined || area > prev) group.points.set(key, area);
  }
}

const polities = {};
let overlapPairs = 0;
let gapCount = 0;
let pointCount = 0;

for (const [name, group] of groups) {
  const series = [...group.points.entries()]
    .map(([key, area]) => {
      const [from, to] = key.split('|').map(Number);
      return [from, to, Math.round(area)];
    })
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Adjacent snapshots from two slices can share a boundary year; overlapping
  // interiors would mean the source disagrees with itself. Report, do not merge:
  // the card can still draw both, and the number is worth knowing.
  for (let i = 1; i < series.length; i += 1) {
    if (series[i][0] <= series[i - 1][1]) overlapPairs += 1;
  }

  const gaps = [];
  for (let i = 1; i < series.length; i += 1) {
    const prevTo = series[i - 1][1];
    const nextFrom = series[i][0];
    if (nextFrom > prevTo + 1) gaps.push([prevTo + 1, nextFrom - 1]);
  }
  gapCount += gaps.length;
  pointCount += series.length;

  let peak = 0;
  for (let i = 1; i < series.length; i += 1) {
    if (series[i][2] > series[peak][2]) peak = i;
  }

  const nameZh = namesZh[name] ?? null;

  polities[name] = {
    nameZh,
    first: series[0][0],
    last: series[series.length - 1][1],
    peak,
    series,
    gaps,
    variants: [...group.variants].sort(),
  };
}

// Featured = the Top 100 by peak area. Only these get milestones and a full
// dossier; the rest still get the corrected lifespan and the area curve.
const top = Object.entries(polities)
  .sort((a, b) => b[1].series[b[1].peak][2] - a[1].series[a[1].peak][2])
  .slice(0, 100)
  .map(([name]) => name);
for (const name of top) polities[name].featured = true;

const sorted = Object.fromEntries(
  Object.entries(polities).sort((a, b) => a[0].localeCompare(b[0], 'en')),
);

const payload = {
  version: 1,
  note:
    'Derived from public/ne/polities/*.json (Seshat / Cliopatria, CC BY 4.0). ' +
    'Not AI-generated. Series entries are [fromYear, toYear, areaKm2] snapshots.',
  polities: sorted,
};

writeFileSync(OUT, JSON.stringify(payload));
const bytes = statSync(OUT).size;

const multi = Object.values(polities).filter((p) => p.series.length >= 2).length;
const single = Object.keys(polities).length - multi;
const withZh = Object.values(polities).filter((p) => p.nameZh).length;

console.log('=== polity_lifecycles.json ===');
console.log(`  分片            ${index.length}`);
console.log(`  原始行          ${rows.toLocaleString()}`);
console.log(`  括号变体行      ${bracketRows.toLocaleString()}`);
console.log(`  跳过（无名）    ${skippedNoName}`);
console.log(`  跳过（无年份）  ${skippedNoYears}`);
console.log(`  跳过（无面积）  ${skippedNoArea}`);
console.log(`  规范政区        ${Object.keys(polities).length.toLocaleString()}`);
console.log(`  面积点          ${pointCount.toLocaleString()}`);
console.log(`  断档段          ${gapCount.toLocaleString()}`);
console.log(`  区间重叠对      ${overlapPairs.toLocaleString()}`);
console.log(`  ≥2 点 / 单点    ${multi} / ${single}`);
console.log(`  有中文名        ${withZh} (${((withZh / Object.keys(polities).length) * 100).toFixed(1)}%)`);
console.log(`  文件体积        ${(bytes / 1024).toFixed(0)} KB`);

for (const sample of ['Ottoman Empire', 'Qing Dynasty', 'Ming Dynasty', 'Roman Empire', 'Han Dynasty']) {
  const p = polities[sample];
  if (!p) {
    console.log(`  抽样 ${sample}: 未收录`);
    continue;
  }
  const peak = p.series[p.peak];
  console.log(
    `  抽样 ${sample}: ${p.first}–${p.last} / ${p.series.length} 点 / 峰值 ${peak[2].toLocaleString()} km² @${peak[0]}–${peak[1]} / ${p.gaps.length} 断档`,
  );
}

console.log(`  按名称排序输出，${top.length} 个 featured`);
