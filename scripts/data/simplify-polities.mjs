/**
 * Simplify the shipped polity geometry.
 *
 * Why this script exists
 * ----------------------
 * The Cliopatria export stores coordinates at up to 33 decimal places
 * (sub-micron precision) across ~1,000,000 vertices per century file, which
 * made the largest file 38.9 MB. That is the single biggest performance problem
 * in the project: fetching and parsing it stalls the globe for seconds, and it
 * is why the previous build truncated polities at a flat 800 features.
 *
 * What it does
 * ------------
 *   1. Douglas-Peucker per ring, with a tolerance scaled to each ring's size
 *      (default 8% of the ring's span, clamped to 0.002-0.12 deg). A single
 *      absolute tolerance does almost nothing here, because the vertex budget
 *      is dominated by tens of thousands of small islands.
 *   2. quantise coordinates to 4 decimals (~11 m), dropping the duplicates
 *      that quantisation introduces
 *   3. drop degenerate rings (< 4 points) and any feature left empty
 *   4. keep only the properties the UI actually reads
 *   5. emit a .gz alongside each file for nginx `gzip_static`
 *   6. regenerate index.json counts from the output
 *
 * Measured on polities_1900_2000.json (the worst file):
 *   original   38.87 MB raw / 11.20 MB gzip
 *   simplified 11.03 MB raw /  3.43 MB gzip   (-70% raw, -69% gzip)
 *
 * Usage
 * -----
 *   node scripts/data/simplify-polities.mjs                      # full tier, dry run
 *   node scripts/data/simplify-polities.mjs --commit             # back up, then overwrite
 *   node scripts/data/simplify-polities.mjs --tier=lod --commit  # add the .lod.json siblings
 *
 *   TOL_REL=0.12 TOL_MAX=0.25 node scripts/data/simplify-polities.mjs
 *
 * Why two tiers
 * -------------
 * The full tier is deliberately faithful (0.01°, ~1.1 km) rather than small:
 * that is what a reader zoomed into a coastline is looking at. But the client
 * cannot spend 18 MB on a whole-continent view it draws into a few hundred
 * pixels, so the `lod` tier ships the same features at 0.15° (~16 km) and two
 * fewer decimals, and the client picks between them from the camera height.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

/*
 * Read and write are separate paths on purpose.
 *
 * They used to be a single constant used for both, which meant running against
 * an alternative source overwrote that source instead of the shipped data —
 * the output landed in the input directory. SRC is now read-only; only DEST is
 * ever written, and only BACKUP is ever snapshotted.
 *
 *   SRC_DIR     what to simplify   (default: public/ne/polities)
 *   DEST_DIR    where --commit puts the result  (default: public/ne/polities)
 *   BACKUP_DIR  one-time snapshot of DEST before the first overwrite
 */
const SRC = resolve(process.env.SRC_DIR ?? 'public/ne/polities');
const DEST = resolve(process.env.DEST_DIR ?? 'public/ne/polities');
const OUT = resolve(process.env.OUT_DIR ?? '.tmp-simplify');
const BACKUP = resolve(process.env.BACKUP_DIR ?? 'data/polities-original');

/*
 * Which tier to emit.
 *
 *   full (default)   polities_1900_2000.json       close-up geometry
 *   lod              polities_1900_2000.lod.json   from-orbit geometry
 *
 * The tier marker goes before `.json`, so the two tiers coexist and a run of
 * one never touches the other's files. The client chooses between them from
 * the camera height (POLITY_LOD_HEIGHT in src/config).
 *
 *   node scripts/data/simplify-polities.mjs --tier=lod --commit
 */
const TIER_ARG = process.argv.find((arg) => arg.startsWith('--tier='));
const TIER = process.env.TIER ?? (TIER_ARG ? TIER_ARG.slice('--tier='.length) : 'full');
if (TIER !== 'full' && TIER !== 'lod') {
  console.error(`未知层级: ${TIER}（可选 full | lod）`);
  process.exit(1);
}
const IS_LOD = TIER === 'lod';
const SUFFIX = IS_LOD ? '.lod' : '';

// Three decimals (~110 m) rather than two: 2 dp was a visible ~1.1 km grid on
// coastlines once the camera came down, which readers read as "低精度".
const PRECISION = Number(process.env.PRECISION ?? (IS_LOD ? 1_000 : 10_000));

/**
 * Tolerance is an absolute distance, the same for every ring.
 *
 * The previous default scaled tolerance to each ring's own size (8% of its
 * bounding diagonal, capped at 0.12°). That reads well — big rings are the only
 * ones where coarse steps survive — but it degrades exactly the features a
 * reader zooms in to see: a province spanning 1° was simplified by up to 8 km
 * of coastline error, and anything reaching the 0.12° cap by 13 km.
 *
 * Measurement on the shipped corpus (183.6 MB source, 4.81 M vertices) shows
 * the size of the output is dominated by coordinate quantisation rather than by
 * vertex removal, so a tight absolute tolerance is nearly free:
 *
 *   8% / 0.12°  →  52.4 MB,  42.1% of vertices removed, ≤13.3 km error
 *   2%          →  85.3 MB,   2.6% of vertices removed, ≤ 2.2 km error
 *   flat 0.01°  →  85.9 MB,   1.9% of vertices removed, ≤ 1.1 km error
 *
 * The 0.01° default is the frontier: it buys a 12× improvement over the old
 * setting for 0.6 MB more than the 0.02° alternative. TOL_REL is kept for
 * experimentation but now defaults to 0.
 *
 * Note that with the source at ~1 M vertices per century this still removes
 * very little; the win here is fidelity, not size. Cutting size further means
 * accepting metre-scale quantisation or dropping small rings (MIN_DIAG).
 */
const TOL_REL = Number(process.env.TOL_REL ?? 0);
const TOL_MIN = Number(process.env.TOL_MIN ?? (IS_LOD ? 0.15 : 0.01)); // ~1.1 km / ~17 km
const TOL_MAX = Number(process.env.TOL_MAX ?? (IS_LOD ? 0.15 : 0.01));
/** Rings smaller than this across are dropped entirely (~110 m / ~1.1 km). */
const MIN_DIAG = Number(process.env.MIN_DIAG ?? (IS_LOD ? 0.01 : 0.001));

const KEEP_FIELDS = ['Name', 'FromYear', 'ToYear', 'Area', 'Type', 'Wikipedia'];
const COMMIT = process.argv.includes('--commit');
const MB = 1024 * 1024;

/* ── Douglas-Peucker (iterative: rings can hold 100k+ points) ─────────────── */

function simplifyRing(points, tolerance) {
  const n = points.length;
  if (n < 4) return points;

  // Drop the duplicated closing vertex while simplifying.
  const open = points[n - 1][0] === points[0][0] && points[n - 1][1] === points[0][1]
    ? points.slice(0, n - 1)
    : points.slice();
  const m = open.length;
  if (m < 3) return points;

  const keep = new Uint8Array(m);
  keep[0] = 1;
  keep[m - 1] = 1;

  const stack = [[0, m - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    if (last - first < 2) continue;

    const ax = open[first][0];
    const ay = open[first][1];
    const bx = open[last][0];
    const by = open[last][1];
    const dx = bx - ax;
    const dy = by - ay;
    const norm = Math.hypot(dx, dy);

    let maxDist = -1;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const px = open[i][0];
      const py = open[i][1];
      const d =
        norm === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * px - dx * py + bx * ay - by * ax) / norm;
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }

    if (maxDist > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out = [open[0]];
  for (let i = 1; i < m - 1; i += 1) {
    if (keep[i]) out.push(open[i]);
  }
  out.push(open[m - 1]);
  return out;
}

/* ── quantise + de-duplicate ─────────────────────────────────────────────── */

function quantiseRing(points) {
  const out = [];
  let prevX = Number.NaN;
  let prevY = Number.NaN;
  for (const point of points) {
    const x = Math.round(point[0] * PRECISION) / PRECISION;
    const y = Math.round(point[1] * PRECISION) / PRECISION;
    if (x === prevX && y === prevY) continue;
    out.push([x, y]);
    prevX = x;
    prevY = y;
  }
  // Re-close the ring.
  if (out.length >= 3) {
    const first = out[0];
    const last = out[out.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
  }
  return out;
}

/** Bounding-box diagonal in degrees — a cheap proxy for "how big is this ring". */
function ringDiagonal(ring) {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const point of ring) {
    if (point[0] < w) w = point[0];
    if (point[0] > e) e = point[0];
    if (point[1] < s) s = point[1];
    if (point[1] > n) n = point[1];
  }
  if (!Number.isFinite(w)) return 0;
  return Math.hypot(e - w, n - s);
}

function toleranceFor(diagonal) {
  return Math.min(TOL_MAX, Math.max(TOL_MIN, diagonal * TOL_REL));
}

function processRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return null;
  const diagonal = ringDiagonal(ring);
  if (diagonal < MIN_DIAG) return null;
  const simplified = simplifyRing(ring, toleranceFor(diagonal));
  const quantised = quantiseRing(simplified);
  // A valid Cesium polygon ring needs at least 4 positions (closed triangle).
  return quantised.length >= 4 ? quantised : null;
}

function processPolygon(rings) {
  const out = [];
  for (const ring of rings) {
    const processed = processRing(ring);
    if (processed) out.push(processed);
  }
  return out.length ? out : null;
}

/* ── file processing ─────────────────────────────────────────────────────── */

function pruneProperties(properties) {
  const out = {};
  for (const key of KEEP_FIELDS) {
    if (properties && properties[key] !== undefined) out[key] = properties[key];
  }
  return out;
}

function simplifyCollection(collection) {
  const features = [];
  let originalVertices = 0;
  let keptVertices = 0;

  for (const feature of collection.features ?? []) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    const before = countVertices(geometry.coordinates, geometry.type);
    originalVertices += before;

    let coordinates = null;
    if (geometry.type === 'Polygon') {
      coordinates = processPolygon(geometry.coordinates);
    } else if (geometry.type === 'MultiPolygon') {
      const polys = [];
      for (const rings of geometry.coordinates) {
        const processed = processPolygon(rings);
        if (processed) polys.push(processed);
      }
      coordinates = polys.length ? polys : null;
    }

    if (!coordinates) continue;

    keptVertices += countVertices(coordinates, geometry.type);
    features.push({
      type: 'Feature',
      properties: pruneProperties(feature.properties),
      geometry: { type: geometry.type, coordinates },
    });
  }

  return {
    collection: { type: 'FeatureCollection', features },
    originalVertices,
    keptVertices,
  };
}

/** Polygon: [ring...]  MultiPolygon: [[ring...]...] — the nesting differs, so
 *  the geometry type has to be passed in rather than guessed from depth. */
function countVertices(coordinates, type) {
  if (!coordinates) return 0;
  const rings = type === 'Polygon' ? coordinates : coordinates.flat(1);
  let total = 0;
  for (const ring of rings) total += ring.length;
  return total;
}

function parseRange(file) {
  const match = file.match(/polities_(-?\d+)_(-?\d+)\.json/);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}

function main() {
  if (!existsSync(SRC)) {
    console.error(`source directory not found: ${SRC}`);
    process.exit(1);
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  // `.lod.json` files are outputs of this script, never inputs.
  const files = readdirSync(SRC).filter(
    (f) => f.startsWith('polities_') && f.endsWith('.json') && !f.endsWith('.lod.json'),
  );

  console.log(
    `\n简化参数: 层级=${TIER}${SUFFIX}  相对容差=${TOL_REL}  区间=[${TOL_MIN}, ${TOL_MAX}]°  ` +
      `最小环=${MIN_DIAG}°  精度=${PRECISION}  模式=${COMMIT ? 'COMMIT' : 'dry-run'}\n`,
  );

  let totalBefore = 0;
  let totalAfter = 0;
  let verticesBefore = 0;
  let verticesAfter = 0;
  let gzipAfter = 0;
  const index = [];

  const rows = [];
  for (const file of files.sort()) {
    const path = join(SRC, file);
    const before = statSync(path).size;
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const { collection, originalVertices, keptVertices } = simplifyCollection(raw);

    // The tier marker goes before `.json`, so a full run and a LOD run never
    // write the same path and neither can clobber the other.
    const outName = `${file.slice(0, -'.json'.length)}${SUFFIX}.json`;
    const payload = JSON.stringify(collection);
    const gzipped = gzipSync(Buffer.from(payload));
    const after = Buffer.byteLength(payload);

    writeFileSync(join(OUT, outName), payload);
    writeFileSync(join(OUT, `${outName}.gz`), gzipped);
    gzipAfter += gzipped.length;

    totalBefore += before;
    totalAfter += after;
    verticesBefore += originalVertices;
    verticesAfter += keptVertices;

    const range = parseRange(file);
    if (range && collection.features.length > 0) {
      index.push({ start: range.start, end: range.end, count: collection.features.length });
    }

    const dropped = raw.features?.length
      ? raw.features.length - collection.features.length
      : 0;
    rows.push({
      file: outName,
      before,
      after,
      ratio: before ? 1 - after / before : 0,
      verts: originalVertices,
      kept: keptVertices,
      dropped,
    });
  }

  rows.sort((a, b) => b.before - a.before);
  console.log('  原体积      现体积    压缩    顶点(原→现)          要素丢失  文件');
  for (const r of rows.slice(0, 14)) {
    console.log(
      `  ${fmt(r.before)}  ${fmt(r.after)}  ${(r.ratio * 100).toFixed(0).padStart(3)}%   ` +
        `${String(r.verts).padStart(8)} → ${String(r.kept).padStart(7)}   ${String(r.dropped).padStart(6)}   ${r.file}`,
    );
  }
  if (rows.length > 14) console.log(`  ...其余 ${rows.length - 14} 个文件`);

  // index.json describes the full tier; an LOD run must not overwrite it.
  if (!IS_LOD) writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

  console.log('\n─────────────────────────────────────────────');
  console.log(`  文件数        ${rows.length}`);
  console.log(`  体积          ${(totalBefore / MB).toFixed(1)} MB → ${(totalAfter / MB).toFixed(1)} MB  (压缩 ${(100 - (totalAfter / totalBefore) * 100).toFixed(1)}%)`);
  console.log(`  顶点数        ${verticesBefore.toLocaleString()} → ${verticesAfter.toLocaleString()}  (删除 ${(100 - (verticesAfter / verticesBefore) * 100).toFixed(1)}%)`);
  console.log(`  预压缩后      ${(gzipAfter / MB).toFixed(1)} MB  (.gz，nginx gzip_static 直接下发)`);
  console.log(`  索引条目      ${index.length}`);
  console.log('─────────────────────────────────────────────');

  if (!COMMIT) {
    console.log(`\n输出目录: ${OUT}`);
    console.log(`确认无误后运行: node scripts/data/simplify-polities.mjs --tier=${TIER} --commit\n`);
    return;
  }

  // ── commit: back up DEST once, then replace it ──────────────────────────
  if (IS_LOD) {
    // The LOD tier only adds `.lod.json` siblings, so nothing existing is at
    // risk and the full tier's snapshot is left untouched.
    console.log('\nLOD 层级为新增文件，跳过备份');
  } else if (!existsSync(BACKUP) && DEST !== BACKUP) {
    mkdirSync(BACKUP, { recursive: true });
    for (const file of files) {
      copyFileSync(join(DEST, file), join(BACKUP, file));
    }
    copyFileSync(join(DEST, 'index.json'), join(BACKUP, 'index.json'));
    console.log(`\n原始数据已备份至 ${BACKUP}`);
  } else if (DEST === BACKUP) {
    // Guard against pointing DEST at the snapshot it is supposed to protect.
    console.error(`\n拒绝提交: DEST 与 BACKUP 相同 (${DEST})`);
    process.exit(1);
  } else {
    console.log(`\n备份已存在，跳过备份: ${BACKUP}`);
  }

  mkdirSync(DEST, { recursive: true });
  for (const r of rows) {
    copyFileSync(join(OUT, r.file), join(DEST, r.file));
    copyFileSync(join(OUT, `${r.file}.gz`), join(DEST, `${r.file}.gz`));
  }
  if (!IS_LOD) copyFileSync(join(OUT, 'index.json'), join(DEST, 'index.json'));
  console.log(`已写入 ${rows.length} 个文件到 ${DEST}\n`);
}

function fmt(bytes) {
  return `${(bytes / MB).toFixed(2).padStart(6)}MB`;
}

main();
