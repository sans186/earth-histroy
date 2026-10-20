/**
 * Audit the shipped polity files.
 *
 * Reports file sizes, property keys, vertex counts and coordinate precision so
 * simplification parameters can be chosen from evidence rather than guesswork.
 *
 * Usage: node scripts/data/analyze-polities.mjs [file.json]
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = resolve('public/ne/polities');
const MB = 1024 * 1024;

function listFiles() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .map((f) => ({ file: f, size: statSync(join(DIR, f)).size }));
}

function reportSizes(files) {
  const sorted = [...files].sort((a, b) => b.size - a.size);
  const total = sorted.reduce((s, f) => s + f.size, 0);
  console.log(`\n=== 文件体积 (共 ${sorted.length} 个, ${(total / MB).toFixed(1)} MB) ===`);
  for (const f of sorted.slice(0, 12)) {
    console.log(`  ${(f.size / MB).toFixed(2).padStart(8)} MB  ${f.file}`);
  }
  if (sorted.length > 12) {
    const rest = sorted.slice(12).reduce((s, f) => s + f.size, 0);
    console.log(`  ${(rest / MB).toFixed(2).padStart(8)} MB  ...其余 ${sorted.length - 12} 个文件`);
  }
  return total;
}

function decimalsOf(value) {
  const s = String(value);
  const i = s.indexOf('.');
  return i === -1 ? 0 : s.length - i - 1;
}

function ringStats(rings, acc) {
  for (const ring of rings) {
    acc.rings += 1;
    acc.vertices += ring.length;
    for (const point of ring) {
      acc.maxDecimals = Math.max(acc.maxDecimals, decimalsOf(point[0]), decimalsOf(point[1]));
      const d = Math.max(decimalsOf(point[0]), decimalsOf(point[1]));
      acc.decimals[d] = (acc.decimals[d] ?? 0) + 1;
    }
  }
}

function reportStructure(file) {
  const path = join(DIR, file);
  const t0 = Date.now();
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const parseMs = Date.now() - t0;

  const features = json.features ?? [];
  const propKeys = new Map();
  const geomTypes = new Map();
  const acc = { rings: 0, vertices: 0, maxDecimals: 0, decimals: {} };
  let missingName = 0;

  for (const f of features) {
    for (const k of Object.keys(f.properties ?? {})) {
      propKeys.set(k, (propKeys.get(k) ?? 0) + 1);
    }
    const type = f.geometry?.type ?? 'none';
    geomTypes.set(type, (geomTypes.get(type) ?? 0) + 1);
    if (!f.properties?.Name) missingName += 1;

    const coords = f.geometry?.coordinates;
    if (!coords) continue;
    ringStats(type === 'Polygon' ? coords : coords.flat(1), acc);
  }

  console.log(`\n=== 结构分析: ${file} ===`);
  console.log(`  解析耗时        ${parseMs} ms`);
  console.log(`  要素数          ${features.length}`);
  console.log(`  几何类型        ${[...geomTypes.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(`  无名称要素      ${missingName}`);
  console.log(`  环数 / 顶点数   ${acc.rings} / ${acc.vertices.toLocaleString()}`);
  console.log(`  最大小数位      ${acc.maxDecimals}`);
  console.log(
    `  小数位分布      ${Object.entries(acc.decimals)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v]) => `${k}位:${v}`)
      .join('  ')}`,
  );
  console.log(`  属性字段        ${[...propKeys.keys()].join(', ')}`);
}

const files = listFiles();
const total = reportSizes(files);
const biggest = [...files].sort((a, b) => b.size - a.size)[0];
const structural = process.argv[2] ?? biggest.file;
reportStructure(structural);
console.log(`\n总计 ${(total / MB).toFixed(1)} MB`);
