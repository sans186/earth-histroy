#!/usr/bin/env node
/**
 * Find polity rings that make Cesium's polygon subdivision explode.
 *
 * A single pathological ring fails the whole batched primitive, which is what
 * makes a layer toggle appear to "do nothing". Read-only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'public/ne/polities');
const KM_PER_DEG = 111.32;

function km(a, b) {
  const dLon = Math.abs(a[0] - b[0]);
  const dLat = Math.abs(a[1] - b[1]);
  const lon = Math.min(dLon, 360 - dLon) * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot(lon, dLat) * KM_PER_DEG;
}

const files = readdirSync(DIR).filter((f) => f.startsWith('polities_') && f.endsWith('.json'));
const report = [];

for (const file of files) {
  const json = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  for (const feature of json.features ?? []) {
    const name = feature.properties?.Name ?? '?';
    const polys = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    polys.forEach((rings, pi) => {
      rings.forEach((ring, ri) => {
        let maxSeg = 0;
        let segFrom = null;
        let segTo = null;
        let bad = 0;
        for (let i = 0; i < ring.length - 1; i += 1) {
          const a = ring[i];
          const b = ring[i + 1];
          if (!Array.isArray(a) || !Array.isArray(b)) { bad += 1; continue; }
          if (!Number.isFinite(a[0]) || !Number.isFinite(a[1]) || !Number.isFinite(b[0]) || !Number.isFinite(b[1])) {
            bad += 1;
            continue;
          }
          const d = km(a, b);
          if (d > maxSeg) { maxSeg = d; segFrom = a; segTo = b; }
        }
        if (maxSeg > 3000 || bad > 0 || ring.length > 4000) {
          report.push({ file, name, part: pi, ring: ri, points: ring.length, maxSeg: Math.round(maxSeg), bad, segFrom, segTo });
        }
      });
    });
  }
}

report.sort((a, b) => b.maxSeg - a.maxSeg);
console.log(`suspicious rings: ${report.length}`);
for (const r of report.slice(0, 60)) {
  console.log(
    `${r.maxSeg}km  ${r.file}  ${r.name}  part ${r.part} ring ${r.ring}  ${r.points} pts  bad ${r.bad}  ${JSON.stringify(r.segFrom)}->${JSON.stringify(r.segTo)}`,
  );
}
