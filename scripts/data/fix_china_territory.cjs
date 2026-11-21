/**
 * Fix China territorial integrity in polity GeoJSON files.
 *
 * 1. Removes "Republic of China" entries from 1950 onwards (Taiwan as separate polity)
 * 2. Merges Taiwan's geometry into all PRC entries for overlapping time periods
 * 3. Backs up originals before modifying
 *
 * 去重口径（2026-11-21 引入，修复台湾被叠加 2～3 份导致的 3D/2D 深浅不一）：
 *   - 环坐标先规范化（四舍五入到 5 位小数、去掉闭合点与相邻重复点、旋转到最小起点）；
 *   - 完全相同的环按哈希判重；
 *   - 同一时期不同来源的台湾轮廓可能差一两个顶点，因此再用「外接框 + 面积误差 2% +
 *     质心距离 0.1°」判定近似重复；
 *   - 追加前先检查 PRC 几何里是否已存在等价环，脚本重复运行结果不变（幂等）。
 *
 * Usage:  node scripts/data/fix_china_territory.cjs
 */

const fs = require('fs');
const path = require('path');

/** Override to patch an archive copy instead of the shipped directory. */
const POLITIES_DIR = process.env.POLITIES_DIR || 'public/ne/polities';
const TARGET_FILES = ['polities_1900_2000.json', 'polities_2000_2100.json'];
const BACKUP_SUFFIX = '.backup_before_taiwan_fix';

/** 精确哈希的取整位数：5 位约 1 米。 */
const KEY_DECIMALS = 5;
/** 近似重复的面积相对误差上限。 */
const AREA_TOLERANCE = 0.02;
/** 近似重复的质心距离上限（度）。 */
const CENTROID_TOLERANCE = 0.1;
/** 外接框比较的取整位数：3 位约 110 米。 */
const BBOX_DECIMALS = 3;

const round = (value, digits) => Number(value.toFixed(digits));

/** 规范化为可哈希的点序列：去闭合点、相邻重复点，并旋转到最小起点。 */
function canonicalRing(ring) {
  const points = [];
  for (const point of ring) {
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      continue;
    }
    const next = [round(point[0], KEY_DECIMALS), round(point[1], KEY_DECIMALS)];
    const prev = points[points.length - 1];
    if (prev && prev[0] === next[0] && prev[1] === next[1]) continue;
    points.push(next);
  }
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) points.pop();
  }
  if (points.length === 0) return points;

  // 同一环从不同顶点开始描述时，哈希必须一致。
  let pivot = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i];
    const b = points[pivot];
    if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) pivot = i;
  }
  return points.slice(pivot).concat(points.slice(0, pivot));
}

function exactKey(ring) {
  return canonicalRing(ring)
    .map((point) => `${point[0]},${point[1]}`)
    .join(';');
}

/** 外接框、面积与质心，用于捕捉差一两个顶点的近似重复轮廓。 */
function ringStats(ring) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let sumLon = 0;
  let sumLat = 0;
  let area2 = 0;

  for (let i = 0; i < ring.length; i += 1) {
    const [lon, lat] = ring[i];
    const [nextLon, nextLat] = ring[(i + 1) % ring.length];
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
    sumLon += lon;
    sumLat += lat;
    area2 += lon * nextLat - nextLon * lat;
  }

  return {
    minLon: round(minLon, BBOX_DECIMALS),
    minLat: round(minLat, BBOX_DECIMALS),
    maxLon: round(maxLon, BBOX_DECIMALS),
    maxLat: round(maxLat, BBOX_DECIMALS),
    area: Math.abs(area2) / 2,
    cx: sumLon / ring.length,
    cy: sumLat / ring.length,
  };
}

function describePart(part) {
  const outer = Array.isArray(part) ? part[0] : null;
  if (!Array.isArray(outer) || outer.length < 4) {
    return { part, key: null, stats: null };
  }
  return { part, key: exactKey(outer), stats: ringStats(outer) };
}

function isEquivalent(a, b) {
  if (a.key !== null && b.key !== null && a.key === b.key) return true;
  if (!a.stats || !b.stats) return false;

  const sa = a.stats;
  const sb = b.stats;
  if (
    sa.minLon !== sb.minLon ||
    sa.minLat !== sb.minLat ||
    sa.maxLon !== sb.maxLon ||
    sa.maxLat !== sb.maxLat
  ) {
    return false;
  }

  const scale = Math.max(sa.area, sb.area);
  if (scale <= 0) return false;
  if (Math.abs(sa.area - sb.area) / scale > AREA_TOLERANCE) return false;

  return Math.hypot(sa.cx - sb.cx, sa.cy - sb.cy) <= CENTROID_TOLERANCE;
}

/** 按环去重，保留第一次出现的多边形部件。 */
function dedupeParts(parts) {
  const kept = [];
  for (const part of parts) {
    const described = describePart(part);
    if (described.key === null) {
      kept.push(described);
      continue;
    }
    if (kept.some((existing) => isEquivalent(existing, described))) continue;
    kept.push(described);
  }
  return kept.map((entry) => entry.part);
}

function polygonParts(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

for (const filename of TARGET_FILES) {
  const filePath = path.join(POLITIES_DIR, filename);
  if (!fs.existsSync(filePath)) continue;

  const backupPath = filePath + BACKUP_SUFFIX;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath);
    console.log('📦 Backed up:', filename);
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const features = data.features || [];

  // Collect Taiwan geometries from ROC post-1950
  const taiwanParts = [];
  const rocIndices = new Set();
  for (let i = 0; i < features.length; i += 1) {
    const f = features[i];
    const name = f.properties?.Name || '';
    if (name === 'Republic of China' && f.properties?.FromYear >= 1950) {
      rocIndices.add(i);
      taiwanParts.push(...polygonParts(f.geometry));
    }
  }

  // 同一批 ROC 切片可能各带一份台湾轮廓，先自己内部去重，避免重复追加。
  let uniqueTaiwanParts = dedupeParts(taiwanParts).map(describePart);

  /*
   * ROC 切片可能早已被前一轮脚本删除，此时没有可复用的源轮廓。
   * 从已有 PRC 几何里挑出台湾岛本身（外接框落在台湾范围内、面积大于 1 平方度），
   * 用来补齐覆盖 1950 年起、却缺少台湾的 PRC 时代切片，保证脚本可重复运行。
   */
  if (uniqueTaiwanParts.length === 0) {
    const harvested = [];
    for (const f of features) {
      if (f.properties?.Name !== "People's Republic of China") continue;
      if ((f.properties?.FromYear ?? 0) < 1950) continue;
      for (const part of polygonParts(f.geometry)) {
        const outer = part?.[0];
        if (!Array.isArray(outer) || outer.length < 4) continue;
        const stats = ringStats(outer);
        const isTaiwanIsland =
          stats.minLon >= 119 &&
          stats.maxLon <= 123 &&
          stats.minLat >= 21 &&
          stats.maxLat <= 26 &&
          stats.area > 1;
        if (isTaiwanIsland) harvested.push(part);
      }
      if (harvested.length) break;
    }
    uniqueTaiwanParts = dedupeParts(harvested).map(describePart);
    if (uniqueTaiwanParts.length) {
      console.log(`🔁 ${filename}: 从 PRC 几何回收 ${uniqueTaiwanParts.length} 份台湾岛轮廓作为补齐源`);
    }
  }

  if (rocIndices.size === 0 && uniqueTaiwanParts.length === 0) {
    console.log('ℹ', filename, ': 无 ROC 切片，仅执行要素内去重');
  } else {
    console.log(
      `📍 ${filename}: found ${rocIndices.size} ROC entries, ` +
        `${taiwanParts.length} Taiwan parts (${uniqueTaiwanParts.length} unique)`,
    );
  }

  // Remove ROC entries, dedupe existing geometry, merge missing Taiwan parts
  const newFeatures = [];
  let mergeCount = 0;
  let dedupedParts = 0;
  let appendedParts = 0;

  for (let i = 0; i < features.length; i += 1) {
    if (rocIndices.has(i)) continue;
    const f = features[i];
    const name = f.properties?.Name || '';
    const isPrc = name === "People's Republic of China" && f.properties?.FromYear >= 1950;

    const parts = polygonParts(f.geometry);
    const afterDedupe = dedupeParts(parts);
    dedupedParts += parts.length - afterDedupe.length;

    let nextParts = afterDedupe;
    if (isPrc) {
      const described = afterDedupe.map(describePart);
      for (const taiwan of uniqueTaiwanParts) {
        if (described.some((existing) => isEquivalent(existing, taiwan))) continue;
        nextParts = nextParts.concat([taiwan.part]);
        described.push(taiwan);
        appendedParts += 1;
      }
      mergeCount += 1;
    }

    if (nextParts.length === parts.length && nextParts === afterDedupe) {
      newFeatures.push(f);
      continue;
    }

    const geometry =
      nextParts.length === 1 && f.geometry?.type === 'Polygon'
        ? { type: 'Polygon', coordinates: nextParts[0] }
        : { type: 'MultiPolygon', coordinates: nextParts };
    newFeatures.push({ ...f, geometry });
  }

  data.features = newFeatures;
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  console.log(
    `💾 ${filename}: ${features.length} → ${newFeatures.length} features ` +
      `(${rocIndices.size} ROC removed, ${dedupedParts} duplicate parts dropped, ` +
      `Taiwan merged into ${mergeCount} PRC entries, ${appendedParts} parts appended)\n`,
  );
}

console.log('✅ Done. Backups at *' + BACKUP_SUFFIX);
