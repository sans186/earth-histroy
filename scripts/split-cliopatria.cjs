/**
 * Pre-process the 182 MB Cliopatria file into century-sized GeoJSON chunks.
 *
 * Usage:
 *   node scripts/split-cliopatria.cjs
 *
 * Input:  public/ne/cliopatria_polities_only.json
 * Output: public/ne/polities/  — one JSON per century (e.g. polities_-3400_-3300.json)
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, '..', 'data', 'cliopatria_polities_only.json');
const OUT_DIR = path.join(__dirname, '..', 'public', 'ne', 'polities');

// ── Config ──
const WINDOW = 100; // years per chunk (century)
const SAMPLE_EVERY = 1; // keep every point — no decimation, rely on MAX_POLITIES cap in layers-plugin.js instead

// ── Geometry simplification (coordinate decimation) ──
/**
 * Reduce ring density by keeping every Nth point (first and last always kept).
 * At SAMPLE_EVERY=5 and globe scale, this cuts ~80% of points with negligible visual loss.
 */
function decimateRing(ring, step) {
  if (ring.length <= 4) return ring;
  const result = [ring[0]];
  for (let i = step; i < ring.length - 1; i += step) {
    result.push(ring[i]);
  }
  result.push(ring[ring.length - 1]);
  return result;
}

function decimateGeometry(geom, step) {
  if (geom.type === 'Polygon') {
    geom.coordinates = geom.coordinates.map((ring) => decimateRing(ring, step));
  } else if (geom.type === 'MultiPolygon') {
    geom.coordinates = geom.coordinates.map((poly) =>
      poly.map((ring) => decimateRing(ring, step)),
    );
  }
}

// ── Main ──
console.log('[split] Reading input...');
const raw = fs.readFileSync(INPUT, 'utf-8');
const geojson = JSON.parse(raw);
const { features } = geojson;

console.log(`[split] ${features.length} features loaded.`);

// Find global time range
let minYear = Infinity;
let maxYear = -Infinity;
for (const f of features) {
  const fy = f.properties?.FromYear;
  const ty = f.properties?.ToYear;
  if (fy != null && fy < minYear) minYear = fy;
  if (ty != null && ty > maxYear) maxYear = ty;
}
console.log(`[split] Time range: ${minYear} → ${maxYear}`);

// Create buckets
/** @type {Map<string, Array>} */
const buckets = new Map();

for (const f of features) {
  const fy = f.properties?.FromYear ?? -9999;
  const ty = f.properties?.ToYear ?? 9999;

  // Decimate geometry to prevent Cesium "Too many properties" errors
  if (f.geometry) decimateGeometry(f.geometry, SAMPLE_EVERY);

  // Which centuries does this feature overlap with?
  const firstBucket = Math.floor(fy / WINDOW) * WINDOW;
  const lastBucket = Math.floor(ty / WINDOW) * WINDOW;

  for (let b = firstBucket; b <= lastBucket; b += WINDOW) {
    const key = `${b}_${b + WINDOW}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(f);
  }
}

// Ensure output directory
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// Write each bucket
const bucketKeys = Array.from(buckets.keys()).sort((a, b) => {
  const [a0] = a.split('_').map(Number);
  const [b0] = b.split('_').map(Number);
  return a0 - b0;
});

let totalWritten = 0;
for (const key of bucketKeys) {
  const features = buckets.get(key);
  const [start] = key.split('_').map(Number);
  const filename = `polities_${start}_${start + WINDOW}.json`;

  const chunk = {
    type: 'FeatureCollection',
    properties: {
      window_start: start,
      window_end: start + WINDOW,
      feature_count: features.length,
    },
    features,
  };

  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(chunk));
  totalWritten++;
  console.log(`[split]   ${filename} — ${features.length} features`);
}

console.log(`[split] Done. ${totalWritten} century files written to ${OUT_DIR}`);

// Write index file
const index = bucketKeys.map((key) => {
  const [start] = key.split('_').map(Number);
  return { start, end: start + WINDOW, count: buckets.get(key).length };
});
fs.writeFileSync(
  path.join(OUT_DIR, 'index.json'),
  JSON.stringify(index, null, 2),
);
console.log('[split] Index file written.');
