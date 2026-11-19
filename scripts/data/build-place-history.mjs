/**
 * Place → polity through time.
 *
 * For a curated list of cities, walk every shipped century slice, test the
 * city's coordinate against each polity polygon, and record the spans in which
 * that polity contained the city. Output feeds the「地点」tab's era band.
 *
 * Geometry uses the `.lod.json` tier: the question is "which polity contains
 * this point", not "what is the exact border", so generalised rings are enough
 * and an order of magnitude cheaper (35 MB for all 55 slices).
 *
 * Source: public/ne/polities (Seshat / Cliopatria, CC BY 4.0) + a curated city
 * gazetteer. Derived, no generated content.
 *
 * Usage: node scripts/data/build-place-history.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const POLITIES = join(ROOT, 'public', 'ne', 'polities');
const OUT_DIR = join(ROOT, 'public', 'places');
const OUT_FILE = join(OUT_DIR, 'place_history.json');

/** Curated: 24 cities, coordinates rounded to two decimals (public gazetteer). */
const CITIES = [
  { id: 'xian', zh: '西安', en: "Xi'an", lon: 108.94, lat: 34.34 },
  { id: 'luoyang', zh: '洛阳', en: 'Luoyang', lon: 112.45, lat: 34.62 },
  { id: 'beijing', zh: '北京', en: 'Beijing', lon: 116.4, lat: 39.9 },
  { id: 'nanjing', zh: '南京', en: 'Nanjing', lon: 118.8, lat: 32.06 },
  { id: 'kaifeng', zh: '开封', en: 'Kaifeng', lon: 114.31, lat: 34.8 },
  { id: 'hangzhou', zh: '杭州', en: 'Hangzhou', lon: 120.16, lat: 30.27 },
  { id: 'chengdu', zh: '成都', en: 'Chengdu', lon: 104.07, lat: 30.67 },
  { id: 'guangzhou', zh: '广州', en: 'Guangzhou', lon: 113.26, lat: 23.13 },
  { id: 'quanzhou', zh: '泉州', en: 'Quanzhou', lon: 118.59, lat: 24.91 },
  { id: 'lhasa', zh: '拉萨', en: 'Lhasa', lon: 91.11, lat: 29.65 },
  { id: 'kashgar', zh: '喀什', en: 'Kashgar', lon: 75.99, lat: 39.47 },
  { id: 'dunhuang', zh: '敦煌', en: 'Dunhuang', lon: 94.66, lat: 40.14 },
  { id: 'rome', zh: '罗马', en: 'Rome', lon: 12.5, lat: 41.9 },
  { id: 'athens', zh: '雅典', en: 'Athens', lon: 23.73, lat: 37.98 },
  { id: 'istanbul', zh: '伊斯坦布尔', en: 'Istanbul', lon: 28.98, lat: 41.01 },
  { id: 'london', zh: '伦敦', en: 'London', lon: -0.13, lat: 51.51 },
  { id: 'paris', zh: '巴黎', en: 'Paris', lon: 2.35, lat: 48.86 },
  { id: 'cairo', zh: '开罗', en: 'Cairo', lon: 31.24, lat: 30.04 },
  { id: 'baghdad', zh: '巴格达', en: 'Baghdad', lon: 44.36, lat: 33.31 },
  { id: 'damascus', zh: '大马士革', en: 'Damascus', lon: 36.29, lat: 33.51 },
  { id: 'jerusalem', zh: '耶路撒冷', en: 'Jerusalem', lon: 35.21, lat: 31.77 },
  { id: 'delhi', zh: '德里', en: 'Delhi', lon: 77.21, lat: 28.61 },
  { id: 'kyoto', zh: '京都', en: 'Kyoto', lon: 135.77, lat: 35.01 },
  { id: 'mexico', zh: '墨西哥城', en: 'Mexico City', lon: -99.13, lat: 19.43 },
];

/** Mirrors src/lib/polityKey.ts — must stay in sync. */
function canonicalPolityName(raw) {
  let name = String(raw ?? '').trim();
  const wrapped = /^\(([^()]*)\)$/.exec(name);
  if (wrapped) name = wrapped[1].trim();
  return name.replace(/\s+/g, ' ');
}

/* ── geometry ────────────────────────────────────────────────────────────── */

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Outer ring contains the point and no hole does. */
function inPolygon(lon, lat, rings) {
  if (!rings.length || !inRing(lon, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i += 1) if (inRing(lon, lat, rings[i])) return false;
  return true;
}

function inGeometry(lon, lat, geom) {
  if (!geom) return false;
  if (geom.type === 'Polygon') return inPolygon(lon, lat, geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some((p) => inPolygon(lon, lat, p));
  return false;
}

function bboxOf(geom) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      const [x, y] = coords;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      return;
    }
    for (const child of coords) walk(child);
  };
  walk(geom.coordinates);
  return [minX, minY, maxX, maxY];
}

/* ── scan ────────────────────────────────────────────────────────────────── */

const index = JSON.parse(readFileSync(join(POLITIES, 'index.json'), 'utf8'));
const sliceYears = index
  .map((e) => [Number(e.start), Number(e.end)])
  .sort((a, b) => a[0] - b[0]);
const DATA_FROM = sliceYears[0][0];
const DATA_TO = sliceYears[sliceYears.length - 1][1];

/** city id → Map<polity, [[from,to], ...]> */
const hits = new Map(CITIES.map((c) => [c.id, new Map()]));
let featuresScanned = 0;
let bboxChecks = 0;

for (const entry of index) {
  const stem = `polities_${entry.start}_${entry.end}`;
  const doc = JSON.parse(readFileSync(join(POLITIES, `${stem}.lod.json`), 'utf8'));
  const features = doc?.features ?? [];
  featuresScanned += features.length;

  for (const feature of features) {
    const props = feature?.properties ?? {};
    const name = canonicalPolityName(props.Name);
    const from = Number(props.FromYear);
    const to = Number(props.ToYear);
    if (!name || !Number.isFinite(from) || !Number.isFinite(to) || from > to) continue;
    if (!feature.geometry) continue;

    const box = bboxOf(feature.geometry);
    for (const city of CITIES) {
      bboxChecks += 1;
      if (city.lon < box[0] || city.lon > box[2] || city.lat < box[1] || city.lat > box[3]) continue;
      if (!inGeometry(city.lon, city.lat, feature.geometry)) continue;

      const byName = hits.get(city.id);
      const spans = byName.get(name) ?? [];
      spans.push([from, to]);
      byName.set(name, spans);
    }
  }
}

/* ── merge + measure ─────────────────────────────────────────────────────── */

/** Sort and union overlapping/adjacent spans of one polity. */
function mergeSpans(spans) {
  const sorted = [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const [from, to] of sorted) {
    const last = out[out.length - 1];
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

const cities = CITIES.map((city) => {
  const byName = hits.get(city.id);
  const polities = [...byName.entries()]
    .map(([name, spans]) => ({ name, spans: mergeSpans(spans) }))
    .sort((a, b) => a.spans[0][0] - b.spans[0][0]);

  // Year-by-year ownership, to report coverage and overlaps honestly.
  let covered = 0;
  let contested = 0;
  const ownership = new Map();
  for (const polity of polities) {
    for (const [from, to] of polity.spans) {
      for (let y = from; y <= to; y += 1) {
        const set = ownership.get(y);
        if (set) set.push(polity.name);
        else ownership.set(y, [polity.name]);
      }
    }
  }
  for (const names of ownership.values()) {
    covered += 1;
    if (names.length > 1) contested += 1;
  }

  const span = DATA_TO - DATA_FROM + 1;
  return {
    ...city,
    polities,
    coverage: {
      from: DATA_FROM,
      to: DATA_TO,
      coveredYears: covered,
      contestedYears: contested,
      ratio: Number((covered / span).toFixed(3)),
      firstYear: polities.length ? polities[0].spans[0][0] : null,
      lastYear: polities.length ? Math.max(...polities.map((p) => p.spans.at(-1)[1])) : null,
    },
  };
});

/* ── write ───────────────────────────────────────────────────────────────── */

const payload = {
  version: 1,
  note:
    '策展城市 + 公开政区数据（Seshat / Cliopatria，CC BY 4.0）。' +
    '由 public/ne/polities/*.lod.json 构建期派生：每个政区列出其多边形包含该城市的 [起, 止] 年份区间。' +
    '无 AI 生成内容；只回答「此地在该年属于哪个政区」，不声称当时的地名。',
  source: { polities: 'Seshat / Cliopatria (CC BY 4.0)', cities: 'curated gazetteer' },
  dataRange: [DATA_FROM, DATA_TO],
  cities,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(payload));
const kb = (statSync(OUT_FILE).size / 1024).toFixed(0);

console.log('=== place_history ===');
console.log(`  城市          ${cities.length}`);
console.log(`  扫描要素      ${featuresScanned.toLocaleString()}（${index.length} 个分片，LOD）`);
console.log(`  点面测试      ${bboxChecks.toLocaleString()}`);
console.log(`  数据年代      ${DATA_FROM} – ${DATA_TO}`);
console.log(`  输出          ${OUT_FILE} (${kb} KB)`);
console.log('');
for (const city of cities) {
  const first = city.polities[0];
  const last = city.polities.at(-1);
  console.log(
    `  ${city.zh.padEnd(6, '　')} 政区 ${String(city.polities.length).padStart(2)}  覆盖 ${(city.coverage.ratio * 100).toFixed(0).padStart(3)}%  并列 ${String(city.coverage.contestedYears).padStart(3)} 年  最早 ${first?.name ?? '—'} @${first?.spans[0][0] ?? '—'}  最晚 ${last?.name ?? '—'} @${last?.spans.at(-1)[1] ?? '—'}`,
  );
}

const empty = cities.filter((c) => !c.polities.length);
if (empty.length) console.log(`\n  无任何政区命中: ${empty.map((c) => c.zh).join('、')}`);
