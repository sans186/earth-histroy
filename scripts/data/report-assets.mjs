#!/usr/bin/env node
/**
 * Inventory of the shipped data.
 *
 * Answers "what do we actually have?" without opening a browser: counts,
 * coverage and gaps per dataset. Read-only.
 *
 *   node scripts/data/report-assets.mjs
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = (...parts) => join(ROOT, ...parts);

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const num = (n) => n.toLocaleString('en-US');
const pct = (a, b) => `${((a / Math.max(1, b)) * 100).toFixed(1)}%`;

function readJson(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function dirSize(dir, suffix = '') {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir)
    .filter((f) => f.endsWith(suffix))
    .reduce((sum, f) => sum + statSync(join(dir, f)).size, 0);
}

/** "41.9, 12.5" and "25.7°N, 32.6°E" both parse to [lat, lon]. */
function parseCoords(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const nums = text.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  let lat = Number(nums[0]);
  let lon = Number(nums[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (/\d\s*°?\s*S\b/i.test(text)) lat = -Math.abs(lat);
  if (/\d\s*°?\s*W\b/i.test(text)) lon = -Math.abs(lon);
  return [lat, lon];
}

const tally = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const topEntries = (map, n = 8) =>
  [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/**
 * Mirrors `figureName()` + the alias table in `src/stores/people.ts`, so the
 * hit rate below is what the UI can actually link.
 */
function normalizeFigure(raw) {
  return String(raw)
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[·・]/g, '')
    .replace(/[-\s]/g, '')
    .trim()
    .toLowerCase();
}

function figureResolver() {
  const index = readJson(P('public/people/profiles/index.json'), []);
  const map = new Map();
  const add = (key, id, overwrite) => {
    if (!key) return;
    if (overwrite) map.set(key, id);
    else if (!map.has(key)) map.set(key, id);
  };

  for (const person of index) add(normalizeFigure(person.name ?? ''), person.personId, true);
  for (const person of index) add(normalizeFigure(person.nameEn ?? ''), person.personId, true);

  for (const person of index) {
    const zh = String(person.name ?? '');
    const tail = zh.split(/[·・]/).pop() ?? '';
    add(normalizeFigure(tail), person.personId, false);

    const en = String(person.nameEn ?? '');
    const last = en.split(/\s+/).pop() ?? '';
    add(normalizeFigure(last), person.personId, false);
  }

  return (raw) => map.get(normalizeFigure(raw)) ?? null;
}

/* ── events ─────────────────────────────────────────────────────────────── */

function eventStats(dir, resolveFigure) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const categories = new Map();
  const certainty = new Map();
  const documentation = new Map();
  const figures = new Set();
  const linkedFigures = new Set();
  const unlinked = new Map();
  let events = 0;
  let located = 0;
  let figureRefs = 0;
  let linkedRefs = 0;
  let withSources = 0;
  let sourceEntries = 0;
  let withCrossRefs = 0;
  let gapYears = 0;
  let minYear = Infinity;
  let maxYear = -Infinity;

  for (const file of files) {
    const data = readJson(join(dir, file));
    if (!data) continue;
    const list = Array.isArray(data) ? data : (data?.events ?? []);
    const year = typeof data?.year === 'number' ? data.year : null;

    if (year !== null) {
      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;
    }
    const doc = data?.documentation_level ?? '未标注';
    tally(documentation, doc);
    if ((data?.geographic_coverage_gaps?.length ?? 0) > 0) gapYears += 1;

    for (const event of list) {
      events += 1;
      if (parseCoords(event.coordinates_approx)) located += 1;
      if (Array.isArray(event.key_figures)) {
        figureRefs += event.key_figures.length;
        for (const fig of event.key_figures) {
          figures.add(fig);
          if (resolveFigure(fig)) {
            linkedRefs += 1;
            linkedFigures.add(normalizeFigure(fig));
          } else {
            tally(unlinked, normalizeFigure(fig));
          }
        }
      }
      if (Array.isArray(event.sources) && event.sources.length) {
        withSources += 1;
        sourceEntries += event.sources.length;
      }
      if (Array.isArray(event.cross_references) && event.cross_references.length) {
        withCrossRefs += 1;
      }
      tally(categories, event.category ?? 'unknown');
      tally(certainty, event.certainty ?? '未标注');
    }
  }

  const nonEnglish = [...categories.entries()]
    .filter(([key]) => /[\u4e00-\u9fa5]/.test(key))
    .reduce((n, [, count]) => n + count, 0);

  return {
    files: files.length,
    events,
    located,
    figureRefs,
    figures: figures.size,
    linkedRefs,
    linkedFigures: linkedFigures.size,
    topUnlinked: topEntries(unlinked, 6).map(([k, v]) => `${k}:${v}`).join('  '),
    withSources,
    sourceEntries,
    withCrossRefs,
    minYear: Number.isFinite(minYear) ? minYear : null,
    maxYear: Number.isFinite(maxYear) ? maxYear : null,
    gapYears,
    categories,
    topCategories: topEntries(categories),
    nonEnglish,
    certainty,
    documentation,
    bytes: dirSize(dir, '.json'),
  };
}

/* ── people ─────────────────────────────────────────────────────────────── */

function peopleStats() {
  const dir = P('public/people/profiles');
  const index = readJson(join(dir, 'index.json'), []);
  const images = readJson(P('public/people/images.json'), {});
  const review = readJson(P('public/people/images-review.json'), []);
  let points = 0;
  let pointsLocated = 0;
  let evaluated = 0;
  let quoted = 0;
  let othersBy = 0;
  let withEn = 0;

  for (const entry of index) {
    const profile = readJson(join(dir, `${entry.personId}.json`));
    if (!profile) continue;
    const list = Array.isArray(profile.points) ? profile.points : [];
    points += list.length;
    pointsLocated += list.filter((p) => Array.isArray(p.coords) && p.coords.length === 2).length;
    if (profile.evaluation && Object.keys(profile.evaluation).length) evaluated += 1;
    if (profile.quotes && Object.keys(profile.quotes).length) quoted += 1;
    if (profile.othersBy && Object.keys(profile.othersBy).length) othersBy += 1;
    if (profile.nameEn) withEn += 1;
  }

  const photos = Object.values(images).filter((v) => v?.url).length;
  const reviewPhotos = Array.isArray(review) ? review.filter((v) => v?.image).length : 0;

  return {
    count: index.length,
    points,
    pointsLocated,
    evaluated,
    quoted,
    othersBy,
    withEn,
    photos,
    reviewPhotos,
    reviewSize: Array.isArray(review) ? review.length : 0,
    bytes: dirSize(dir, '.json'),
  };
}

/* ── wars ───────────────────────────────────────────────────────────────── */

function warStats() {
  const dir = P('public/wars/profiles');
  const index = readJson(join(dir, 'index.json'), []);
  let battles = 0;
  let battlesLocated = 0;
  let timeline = 0;
  let theatres = 0;
  let withSources = 0;
  let withCoords = 0;

  for (const entry of index) {
    const profile = readJson(join(dir, `${entry.warId}.json`));
    if (!profile) continue;
    let placed = false;
    for (const phase of profile.warProcess?.phases ?? []) {
      for (const battle of phase.battles ?? []) {
        battles += 1;
        if (Array.isArray(battle.coords) && battle.coords.length === 2) {
          battlesLocated += 1;
          placed = true;
        }
      }
    }
    for (const battle of profile.warProcess?.majorBattles ?? []) {
      if (Array.isArray(battle.coords) && battle.coords.length === 2) placed = true;
    }
    timeline += Array.isArray(profile.timeline) ? profile.timeline.length : 0;
    theatres += Array.isArray(profile.theaters) ? profile.theaters.length : 0;
    if (Array.isArray(profile.sources) && profile.sources.length) withSources += 1;
    if (placed) withCoords += 1;
  }

  return {
    count: index.length,
    battles,
    battlesLocated,
    timeline,
    theatres,
    withSources,
    withCoords,
    bytes: dirSize(dir, '.json'),
  };
}

/* ── polities ───────────────────────────────────────────────────────────── */

function polityStats() {
  const dir = P('public/ne/polities');
  if (!existsSync(dir)) return null;
  const full = readdirSync(dir).filter((f) => f.startsWith('polities_') && f.endsWith('.json') && !f.endsWith('.lod.json'));
  const lod = readdirSync(dir).filter((f) => f.endsWith('.lod.json'));
  const names = new Set();
  let features = 0;

  for (const file of full) {
    const shard = readJson(join(dir, file));
    for (const feature of shard?.features ?? []) {
      features += 1;
      const name = feature?.properties?.Name;
      if (name) names.add(name);
    }
  }

  const namesZh = readJson(P('public/ne/polity_names_zh.json'), {});
  const descriptions = readJson(P('public/ne/polity_descriptions.json'), {});
  const named = [...names].filter((n) => namesZh[n]).length;
  const described = [...names].filter((n) => descriptions[n]).length;

  return {
    centuries: full.length,
    lodCenturies: lod.length,
    features,
    distinctNames: names.size,
    namesZh: Object.keys(namesZh).length,
    named,
    described,
    descriptions: Object.keys(descriptions).length,
    fullBytes: full.reduce((n, f) => n + statSync(join(dir, f)).size, 0),
    lodBytes: lod.reduce((n, f) => n + statSync(join(dir, f)).size, 0),
  };
}

/* ── reference layers ───────────────────────────────────────────────────── */

function pickReference(pattern) {
  const ne = P('public/ne');
  if (!existsSync(ne)) return null;
  const file = readdirSync(ne).find((f) => f.includes(pattern) && (f.endsWith('.geojson') || f.endsWith('.json')));
  if (!file) return null;
  const json = readJson(join(ne, file));
  return {
    file,
    features: json?.features?.length ?? null,
    size: statSync(join(ne, file)).size,
  };
}

/* ── report ─────────────────────────────────────────────────────────────── */

const resolveFigure = figureResolver();
const zh = eventStats(P('public/events'), resolveFigure);
const en = eventStats(P('public/en-events'), resolveFigure);
const people = peopleStats();
const wars = warStats();
const polities = polityStats();
const countries = pickReference('countries');
const borders = pickReference('boundary_lines');
const assets = readJson(P('public/ne/polity_assets.json'), {});

console.log('');
console.log('══════════ 数据资产清点 ══════════');

for (const [label, s] of [['事件（中文）', zh], ['事件（英文）', en]]) {
  if (!s) { console.log(`\n${label}: 缺失`); continue; }
  console.log(`\n${label}`);
  console.log(`  年份文件      ${num(s.files)}   体积 ${mb(s.bytes)}`);
  console.log(`  事件条目      ${num(s.events)}   年份范围 ${s.minYear} … ${s.maxYear}`);
  console.log(`  坐标可定位    ${num(s.located)}  (${pct(s.located, s.events)})  缺 ${num(s.events - s.located)}`);
  console.log(`  人物提及      ${num(s.figureRefs)} 次 / ${num(s.figures)} 人`);
  console.log(`  可打开档案    ${num(s.linkedRefs)} 次 / ${num(s.linkedFigures)} 人  (${pct(s.linkedRefs, s.figureRefs)})`);
  if (s.topUnlinked) console.log(`  高频未建档    ${s.topUnlinked}`);
  console.log(`  有史料来源    ${num(s.withSources)}  (${pct(s.withSources, s.events)})  条目 ${num(s.sourceEntries)}`);
  console.log(`  有交叉引用    ${num(s.withCrossRefs)}  (${pct(s.withCrossRefs, s.events)})`);
  console.log(`  类别          ${s.topCategories.map(([k, v]) => `${k}:${v}`).join('  ')}`);
  if (s.nonEnglish) console.log(`  非英文类别    ${num(s.nonEnglish)} 条（待归一化）`);
  console.log(`  确定性        ${[...s.certainty.entries()].map(([k, v]) => `${k}:${v}`).join('  ')}`);
  console.log(`  文档等级      ${[...s.documentation.entries()].map(([k, v]) => `${k}:${v}`).join('  ')}`);
  console.log(`  标注地理缺口  ${num(s.gapYears)} / ${num(s.files)} 年`);
}

console.log('\n人物');
console.log(`  档案          ${num(people.count)}   体积 ${mb(people.bytes)}`);
console.log(`  生平节点      ${num(people.points)}  带坐标 ${num(people.pointsLocated)} (${pct(people.pointsLocated, people.points)})`);
console.log(`  有评价        ${num(people.evaluated)}  (${pct(people.evaluated, people.count)})`);
console.log(`  有引语        ${num(people.quoted)}  (${pct(people.quoted, people.count)})`);
console.log(`  有他人评述    ${num(people.othersBy)}  (${pct(people.othersBy, people.count)})`);
console.log(`  有英文名      ${num(people.withEn)}  (${pct(people.withEn, people.count)})`);
console.log(`  有照片        ${num(people.photos)}  (${pct(people.photos, people.count)})  复核表 ${num(people.reviewSize)} 条，其中可用 ${num(people.reviewPhotos)}`);

console.log('\n战争');
console.log(`  档案          ${num(wars.count)}   体积 ${mb(wars.bytes)}`);
console.log(`  战斗条目      ${num(wars.battles)}  带坐标 ${num(wars.battlesLocated)} (${pct(wars.battlesLocated, wars.battles)})`);
console.log(`  可上图战争    ${num(wars.withCoords)} / ${num(wars.count)}  (${pct(wars.withCoords, wars.count)})`);
console.log(`  年表条目      ${num(wars.timeline)}`);
console.log(`  战区标签      ${num(wars.theatres)}`);
console.log(`  有史料来源    ${num(wars.withSources)}  (${pct(wars.withSources, wars.count)})`);

if (polities) {
  console.log('\n历史政区');
  console.log(`  世纪分片      ${num(polities.centuries)}  (LOD ${num(polities.lodCenturies)})`);
  console.log(`  政区要素      ${num(polities.features)}  独立政区 ${num(polities.distinctNames)}`);
  console.log(`  体积          全精度 ${mb(polities.fullBytes)} → LOD ${mb(polities.lodBytes)}  (−${(100 - (polities.lodBytes / Math.max(1, polities.fullBytes)) * 100).toFixed(0)}%)`);
  console.log(`  中文名        ${num(polities.named)} / ${num(polities.distinctNames)}  (${pct(polities.named, polities.distinctNames)})  映射表 ${num(polities.namesZh)}`);
  console.log(`  中文简介      ${num(polities.described)} / ${num(polities.distinctNames)}  (${pct(polities.described, polities.distinctNames)})  映射表 ${num(polities.descriptions)}`);
}

console.log('\n参考图层');
console.log(`  现代国界      ${countries ? `${num(countries.features)} 国  ${kb(countries.size)}  (${countries.file})` : '缺失'}`);
console.log(`  边界线        ${borders ? `${num(borders.features)} 段  ${kb(borders.size)}  (${borders.file})` : '缺失'}`);
console.log(`  政区资产      ${num(Object.keys(assets).length)} 条`);

console.log('\n══════════ 缺口清单 ══════════');
const gaps = [];
for (const [label, s] of [['中文事件', zh], ['英文事件', en]]) {
  if (!s) continue;
  gaps.push(`${label}缺坐标 ${num(s.events - s.located)} 条 (${pct(s.events - s.located, s.events)})`);
  gaps.push(`${label}无史料 ${num(s.events - s.withSources)} 条 (${pct(s.events - s.withSources, s.events)})`);
}
gaps.push(
  `人物档案仅 ${num(people.count)} 份，事件人名可链接 ${num(zh ? zh.linkedFigures : 0)} 个（中文）/ ${num(en ? en.linkedFigures : 0)} 个（英文）`,
);
gaps.push(`人物照片 ${num(people.count - people.photos)} / ${num(people.count)} 缺失`);
gaps.push(`战争无坐标 ${num(wars.count - wars.withCoords)} 部、战斗缺坐标 ${num(wars.battles - wars.battlesLocated)} 场`);
gaps.push(`战争无史料来源 ${num(wars.count - wars.withSources)} 部`);
if (polities) {
  gaps.push(`政区无中文名 ${num(polities.distinctNames - polities.named)} 个、无中文简介 ${num(polities.distinctNames - polities.described)} 个`);
}
gaps.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
console.log('');
