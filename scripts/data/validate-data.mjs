/**
 * Validate every data asset the app loads.
 *
 * Why this exists
 * ---------------
 * The public/ dataset was assembled by a dozen one-off scripts over a long
 * period, and it has drifted: a corrupted index, a year file whose contents
 * disagree with its name, profiles that the index does not know about. Those
 * defects are invisible until something breaks at runtime, because nothing
 * ever checked the data.
 *
 * This validator is intentionally dependency-free — the npm registry in this
 * environment cannot resolve some transitive packages, and the project already
 * has 2.7M geometry vertices to walk, which hand-written checks handle well.
 *
 * Usage
 * -----
 *   node scripts/data/validate-data.mjs            # full report
 *   node scripts/data/validate-data.mjs --quiet    # only problems
 *   node scripts/data/validate-data.mjs --fast     # skip century geometry walk
 *
 * Exit code is 1 when any ERROR is found, so it can gate a build.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve('.');
const FLAGS = new Set(process.argv.slice(2));
const QUIET = FLAGS.has('--quiet');
const FAST = FLAGS.has('--fast');
const MAX_EXAMPLES = 5;

/* ── issue collection ────────────────────────────────────────────────────── */

const errors = [];
const warnings = [];

function err(section, message, example) {
  errors.push({ section, message, example });
}
function warn(section, message, example) {
  warnings.push({ section, message, example });
}

function section(title) {
  if (!QUIET) console.log(`\n=== ${title} ===`);
}
function line(text) {
  if (!QUIET) console.log(`  ${text}`);
}

/* ── shared helpers ──────────────────────────────────────────────────────── */

function readJson(path) {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function rel(path) {
  return path.replace(ROOT + '\\', '').replace(/\\/g, '/');
}

/** Mirrors the intent of src/lib/geo.ts without importing TypeScript. */
function looksLikeCoordinates(raw) {
  if (raw === null || raw === undefined) return false;
  if (typeof raw === 'object') {
    const o = raw;
    const lat = Number(o.lat ?? o.latitude);
    const lon = Number(o.lon ?? o.lng ?? o.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  }
  if (typeof raw !== 'string') return false;
  const nums = raw.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return false;
  const a = Number.parseFloat(nums[0]);
  const b = Number.parseFloat(nums[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(a) > 90 && Math.abs(a) <= 180 && Math.abs(b) <= 90) return true;
  return Math.abs(a) <= 90 && Math.abs(b) <= 180;
}

/**
 * Detect the "quote collapse" corruption.
 *
 * A post-processing step once replaced the ASCII quotes of a JSON array with
 * CJK quotes, turning
 *     ["陆战", "海战", "围城战"]
 * into the single string
 *     "陆战“, ”海战“, ”围城战"
 *
 * JSON.parse accepts it happily, so only a content check can see it. The
 * signature is a CJK quote, a comma, then another CJK quote. A blanket "contains
 * CJK quotes" test would false-positive: the prompts explicitly ask for Chinese
 * quotation marks inside prose.
 */
const QUOTE_COLLAPSE = /[“”]\s*,\s*[“”]/;

function scanQuoteCorruption(node, path, out, limit = 400) {
  if (out.length >= limit) return;
  if (typeof node === 'string') {
    if (QUOTE_COLLAPSE.test(node)) out.push(`${path || '(root)'} = ${node.slice(0, 56)}`);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanQuoteCorruption(v, `${path}[${i}]`, out, limit));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      scanQuoteCorruption(v, path ? `${path}.${k}` : k, out, limit);
    }
  }
}

/* ── events ──────────────────────────────────────────────────────────────── */

function validateEvents(dirName, label) {
  const dir = join(ROOT, 'public', dirName);
  if (!existsSync(dir)) {
    err(label, `目录不存在: public/${dirName}`);
    return;
  }

  const all = readdirSync(dir);
  const jsonFiles = all.filter((f) => f.endsWith('.json'));
  const others = all.filter((f) => !f.endsWith('.json'));

  section(`${label}  (public/${dirName})`);
  line(`文件 ${jsonFiles.length} 个${others.length ? `，另有 ${others.length} 个非 JSON 文件` : ''}`);

  if (others.length) {
    warn(label, `${others.length} 个非 JSON 文件混在数据目录中`, others.slice(0, 5).join(', '));
  }

  let yearMismatch = 0;
  let missingYear = 0;
  let noEvents = 0;
  let noTitle = 0;
  let noCategory = 0;
  let badCoord = 0;
  let withCoord = 0;
  let badSources = 0;
  let totalEvents = 0;
  const emptyYears = [];
  const coordKinds = new Map();
  const labelOffsets = new Map();

  for (const file of jsonFiles) {
    const path = join(dir, file);
    const stem = file.replace(/\.json$/, '');
    const nameYear = Number.parseInt(stem, 10);

    const parsed = readJson(path);
    if (!parsed.ok) {
      err(label, `JSON 解析失败: ${file}`, parsed.error);
      continue;
    }
    const doc = parsed.value;

    if (Number.isFinite(nameYear)) {
      if (typeof doc.year !== 'number') missingYear += 1;
      else if (doc.year !== nameYear) {
        yearMismatch += 1;
        if (yearMismatch <= MAX_EXAMPLES) {
          warn(label, `year 与文件名不一致: ${file} (year=${doc.year})`, `期望 ${nameYear}`);
        }
      }
    }

    // Negative years are labelled one higher than their `year` value in this
    // dataset (year -1895 -> "公元前1896年"). Recorded, not corrected: which of
    // the two is authoritative is a historical judgement, not a mechanical fix.
    if (Number.isFinite(nameYear) && nameYear < 0 && typeof doc.year_label === 'string') {
      const m = doc.year_label.match(/\d+/);
      if (m) {
        const delta = Number(m[0]) - Math.abs(nameYear);
        labelOffsets.set(delta, (labelOffsets.get(delta) ?? 0) + 1);
      }
    }

    if (!Array.isArray(doc.events) || doc.events.length === 0) {
      noEvents += 1;
      if (Number.isFinite(nameYear)) emptyYears.push(nameYear);
      continue;
    }
    totalEvents += doc.events.length;

    for (const ev of doc.events) {
      if (!ev || typeof ev !== 'object') {
        noTitle += 1;
        continue;
      }
      if (!ev.title || !String(ev.title).trim()) noTitle += 1;
      if (!ev.category) noCategory += 1;
      if (ev.coordinates_approx !== undefined && ev.coordinates_approx !== null) {
        withCoord += 1;
        if (!looksLikeCoordinates(ev.coordinates_approx)) {
          badCoord += 1;
          const key = JSON.stringify(ev.coordinates_approx).slice(0, 48);
          coordKinds.set(key, (coordKinds.get(key) ?? 0) + 1);
        }
      }
      if (ev.sources !== undefined && !Array.isArray(ev.sources)) badSources += 1;
    }
  }

  line(`事件总数 ${totalEvents.toLocaleString()}`);
  line(`含坐标 ${withCoord.toLocaleString()}`);
  const summary = [];
  if (yearMismatch) summary.push(`year 与文件名不一致 ${yearMismatch}`);
  if (missingYear) summary.push(`缺 year 字段 ${missingYear}`);
  if (noEvents) summary.push(`无 events 的文件 ${noEvents}`);
  if (noTitle) summary.push(`缺标题事件 ${noTitle}`);
  if (noCategory) summary.push(`缺分类事件 ${noCategory}`);
  if (badCoord) summary.push(`坐标无法解析 ${badCoord}`);
  if (badSources) summary.push(`sources 非数组 ${badSources}`);
  line(summary.length ? `问题: ${summary.join(' · ')}` : '未发现问题');

  if (emptyYears.length) {
    emptyYears.sort((a, b) => a - b);
    line(`空事件年份 ${emptyYears.length} 个，最晚 ${emptyYears[emptyYears.length - 1]}`);
  }
  if (labelOffsets.size) {
    line(
      `负年份标签偏移: ${[...labelOffsets.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `+${k} × ${v}`)
        .join('  ')}`,
    );
  }

  if (missingYear) warn(label, `${missingYear} 个文件缺少 year 字段`);
  if (noEvents) {
    // Sparse antiquity is a property of the source, not a defect. An empty
    // modern year, on the other hand, would be a real fault.
    const late = emptyYears.filter((y) => y >= 1000);
    if (late.length) {
      err(label, `${late.length} 个近代年份 events 为空`, late.slice(0, 6).join(', '));
    } else {
      line('空年份全部位于古代，属数据源稀疏，不计为问题');
    }
  }
  if (noTitle) warn(label, `${noTitle} 条事件缺少标题`);
  if (noCategory) warn(label, `${noCategory} 条事件缺少 category`);
  if (badCoord) {
    err(
      label,
      `${badCoord} 条事件的 coordinates_approx 无法解析`,
      [...coordKinds.entries()]
        .slice(0, 4)
        .map(([k, v]) => `${k} × ${v}`)
        .join('   '),
    );
  }
  if (badSources) warn(label, `${badSources} 条事件的 sources 不是数组`);
}

/* ── index / profile pairs (wars, people) ────────────────────────────────── */

function validateIndexedProfiles({
  dir,
  indexFile,
  idField,
  label,
  requiredFields = [],
  ignoreFiles = [],
}) {
  const base = join(ROOT, 'public', dir);
  section(`${label}  (public/${dir})`);

  const indexPath = join(base, indexFile);
  if (!existsSync(indexPath)) {
    err(label, `索引文件不存在: public/${dir}/${indexFile}`);
    return;
  }

  const indexText = readFileSync(indexPath, 'utf8');
  const parsed = readJson(indexPath);
  if (!parsed.ok) {
    err(label, `索引 JSON 解析失败`, parsed.error);
    return;
  }

  const list = Array.isArray(parsed.value) ? parsed.value : (parsed.value.items ?? []);
  if (!Array.isArray(list)) {
    err(label, `索引结构不是数组`);
    return;
  }

  line(`索引条目 ${list.length} 个`);

  const suspicious = [];
  scanQuoteCorruption(JSON.parse(indexText), '', suspicious);
  if (suspicious.length) {
    err(
      label,
      `索引中存在引号塌缩（数组被压成单字符串）${suspicious.length} 处`,
      suspicious.slice(0, 3).join(' | '),
    );
  }

  const ids = new Set();
  let missingId = 0;
  let missingField = 0;
  for (const item of list) {
    const id = item?.[idField];
    if (!id) {
      missingId += 1;
      continue;
    }
    ids.add(id);
    for (const field of requiredFields) {
      if (item[field] === undefined || item[field] === null || item[field] === '') missingField += 1;
    }
  }
  if (missingId) err(label, `${missingId} 个索引条目缺少 ${idField}`);
  if (missingField) warn(label, `${missingField} 处必填字段为空 (${requiredFields.join('/')})`);

  const files = readdirSync(base).filter(
    (f) => f.endsWith('.json') && f !== indexFile && !ignoreFiles.includes(f),
  );
  const fileIds = new Set(files.map((f) => f.replace(/\.json$/, '')));

  line(`磁盘档案 ${files.length} 个`);

  const missing = [...ids].filter((id) => !fileIds.has(id));
  const orphan = [...fileIds].filter((id) => !ids.has(id));

  if (missing.length) {
    err(label, `索引中有 ${missing.length} 个条目没有对应档案`, missing.slice(0, 8).join(', '));
  }
  if (orphan.length) {
    warn(label, `${orphan.length} 个档案未被索引引用`, orphan.slice(0, 8).join(', '));
  }

  // Walk every profile: they are small, and the corruption above was introduced
  // long after the index was written.
  let profileErrors = 0;
  let profileCorrupt = 0;
  const corruptExamples = [];
  for (const file of files) {
    const p = readJson(join(base, file));
    if (!p.ok) {
      profileErrors += 1;
      if (profileErrors <= MAX_EXAMPLES) err(label, `档案解析失败: ${file}`, p.error);
      continue;
    }
    if (!p.value || typeof p.value !== 'object') {
      profileErrors += 1;
      if (profileErrors <= MAX_EXAMPLES) warn(label, `档案不是对象: ${file}`);
      continue;
    }
    const found = [];
    scanQuoteCorruption(p.value, '', found);
    if (found.length) {
      profileCorrupt += 1;
      if (corruptExamples.length < MAX_EXAMPLES) corruptExamples.push(`${file}: ${found[0]}`);
    }
  }
  if (profileCorrupt) {
    err(label, `${profileCorrupt} 个档案存在引号塌缩`, corruptExamples.join('  |  '));
  }

  const clean =
    !missing.length &&
    !orphan.length &&
    !missingId &&
    !suspicious.length &&
    !profileErrors &&
    !profileCorrupt;
  line(clean ? '索引与档案一致' : '存在问题，见下方汇总');
}

/* ── polities ────────────────────────────────────────────────────────────── */

/**
 * 环的外接框、面积与质心。
 * 与 scripts/data/fix_china_territory.cjs 的近似重复口径保持一致：
 * 同一要素内，外接框相同且面积误差 ≤2%、质心距离 ≤0.1° 的环视为重复。
 */
function ringFingerprint(ring) {
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
    key: `${minLon.toFixed(3)},${minLat.toFixed(3)},${maxLon.toFixed(3)},${maxLat.toFixed(3)}`,
    area: Math.abs(area2) / 2,
    cx: sumLon / ring.length,
    cy: sumLat / ring.length,
  };
}

function isDuplicateRing(ring, groups) {
  const stats = ringFingerprint(ring);
  const bucket = groups.get(stats.key) || [];
  const duplicate = bucket.some((prev) => {
    const scale = Math.max(prev.area, stats.area);
    if (scale <= 0) return false;
    return (
      Math.abs(prev.area - stats.area) / scale <= 0.02 &&
      Math.hypot(prev.cx - stats.cx, prev.cy - stats.cy) <= 0.1
    );
  });
  bucket.push(stats);
  groups.set(stats.key, bucket);
  return duplicate;
}

function validatePolities() {
  const dir = join(ROOT, 'public', 'ne', 'polities');
  section('历史政区  (public/ne/polities)');
  if (!existsSync(dir)) {
    err('polities', '目录不存在');
    return;
  }

  const indexPath = join(dir, 'index.json');
  const parsed = readJson(indexPath);
  if (!parsed.ok) {
    err('polities', 'index.json 解析失败', parsed.error);
    return;
  }
  const index = parsed.value;
  if (!Array.isArray(index)) {
    err('polities', 'index.json 不是数组');
    return;
  }
  line(`索引条目 ${index.length} 个`);

  let badEntry = 0;
  let missingFile = 0;
  let missingLod = 0;
  let lodFiles = 0;
  let countMismatch = 0;
  let geometryProblems = 0;
  let duplicateRings = 0;
  let totalFeatures = 0;
  let totalVertices = 0;

  for (const entry of index) {
    if (typeof entry?.start !== 'number' || typeof entry?.end !== 'number') {
      badEntry += 1;
      continue;
    }
    const stem = `polities_${entry.start}_${entry.end}`;
    const file = join(dir, `${stem}.json`);
    if (!existsSync(file)) {
      missingFile += 1;
      err('polities', `缺少世纪文件: ${stem}.json`);
      continue;
    }
    // The LOD sibling is optional — the client falls back to the full tier —
    // but a missing one is worth reporting: it silently costs bandwidth.
    if (existsSync(join(dir, `${stem}.lod.json`))) lodFiles += 1;
    else missingLod += 1;

    const doc = readJson(file);
    if (!doc.ok) {
      err('polities', `世纪文件解析失败: polities_${entry.start}_${entry.end}.json`, doc.error);
      continue;
    }
    const features = doc.value?.features;
    if (!Array.isArray(features)) {
      err('polities', `世纪文件缺少 features 数组: polities_${entry.start}_${entry.end}.json`);
      continue;
    }
    totalFeatures += features.length;

    if (typeof entry.count === 'number' && entry.count !== features.length) {
      countMismatch += 1;
      if (countMismatch <= MAX_EXAMPLES) {
        warn('polities', `count 与实际要素数不一致: ${entry.start}_${entry.end}`, `index=${entry.count} 实际=${features.length}`);
      }
    }

    if (FAST) continue;

    for (const feature of features) {
      const geom = feature?.geometry;
      if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) {
        geometryProblems += 1;
        if (geometryProblems <= MAX_EXAMPLES) warn('polities', `几何类型异常: ${entry.start}_${entry.end}`, geom?.type);
        continue;
      }
      if (!feature.properties?.Name) {
        geometryProblems += 1;
        if (geometryProblems <= MAX_EXAMPLES) warn('polities', `要素缺少 Name: ${entry.start}_${entry.end}`);
      }
      const parts = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
      const rings = parts.flat(1);
      for (const ring of rings) {
        totalVertices += ring.length;
        if (ring.length < 4) {
          geometryProblems += 1;
          if (geometryProblems <= MAX_EXAMPLES) warn('polities', `环点数不足 4: ${entry.start}_${entry.end}`, `实际 ${ring.length}`);
          continue;
        }
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          geometryProblems += 1;
          if (geometryProblems <= MAX_EXAMPLES) warn('polities', `环未闭合: ${entry.start}_${entry.end}`);
        }
      }

      // 同一要素内重复的环会被 3D 逐部件叠加、2D 单批次填充，导致同地不同色。
      const outerRings = new Map();
      let featureHasDuplicate = false;
      for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
        const outer = parts[partIndex]?.[0];
        if (!Array.isArray(outer) || outer.length < 4) continue;
        if (!isDuplicateRing(outer, outerRings)) continue;
        duplicateRings += 1;
        if (featureHasDuplicate) continue;
        featureHasDuplicate = true;
        if (duplicateRings <= MAX_EXAMPLES) {
          err(
            'polities',
            `要素内存在重复几何环: ${stem}`,
            `${feature.properties?.Name ?? '未命名'} 第 ${partIndex} 个多边形与同要素已有环重合`,
          );
        }
      }
    }
  }

  line(`世纪文件 ${index.length} 个，要素 ${totalFeatures.toLocaleString()}${FAST ? '（--fast 跳过几何检查）' : `，顶点 ${totalVertices.toLocaleString()}`}`);
  line(`LOD 分片 ${lodFiles} 个${missingLod ? `，缺 ${missingLod} 个` : ''}`);
  if (badEntry) err('polities', `${badEntry} 个索引条目缺少 start/end`);
  if (missingFile) err('polities', `${missingFile} 个世纪文件缺失`);
  if (duplicateRings) err('polities', `${duplicateRings} 个要素存在重复几何环`);
  if (missingLod) {
    warn('polities', `${missingLod} 个世纪分片缺少 .lod.json（客户端会退回全精度，首屏明显变慢）`);
  }
  if (countMismatch) warn('polities', `${countMismatch} 个世纪文件的 count 与真实要素数不符`);
  if (geometryProblems) err('polities', `${geometryProblems} 处几何问题`);

  const extra = readdirSync(dir).filter(
    (f) => f.startsWith('polities_') && !f.endsWith('.json') && !f.endsWith('.gz'),
  );
  if (extra.length) {
    warn('polities', `${extra.length} 个非预期文件`, extra.slice(0, 5).join(', '));
  }
  const gz = readdirSync(dir).filter((f) => f.endsWith('.gz')).length;
  line(`预压缩文件 ${gz} 个`);
}

/* ── polity lifecycles ───────────────────────────────────────────────────── */

/**
 * `polity_lifecycles.json` is derived, so the risks are arithmetic and
 * staleness, not editorial mistakes: a peak index pointing at nothing, a span
 * that excludes its own snapshots, or a table built before the last slice
 * rebuild. The card and the "only this polity" filter both trust it.
 */
function validatePolityLifecycles() {
  section('政区兴衰  (public/ne/polity_lifecycles.json)');
  const path = join(ROOT, 'public', 'ne', 'polity_lifecycles.json');
  if (!existsSync(path)) {
    err('lifecycles', '缺少文件: public/ne/polity_lifecycles.json', 'node scripts/data/build-polity-lifecycles.mjs');
    return;
  }
  const parsed = readJson(path);
  if (!parsed.ok) {
    err('lifecycles', 'polity_lifecycles.json 解析失败', parsed.error);
    return;
  }
  const doc = parsed.value;
  const polities = doc?.polities;
  if (!polities || typeof polities !== 'object' || Array.isArray(polities)) {
    err('lifecycles', '缺少 polities 对象映射');
    return;
  }
  if (doc.version !== 1) warn('lifecycles', `未知版本 ${doc.version}`, '期望 1');

  let badSpan = 0;
  let badPeak = 0;
  let badSeries = 0;
  let badGap = 0;
  let bracketed = 0;
  let points = 0;
  let featured = 0;
  let withZh = 0;

  for (const [key, raw] of Object.entries(polities)) {
    // The key must match canonicalPolityName() — a wrapped name means the
    // builder and src/lib/polityKey.ts have drifted apart.
    if (/^\([^()]*\)$/.test(key)) bracketed += 1;
    if (raw?.featured) featured += 1;
    if (raw?.nameZh) withZh += 1;

    const series = raw?.series;
    if (
      !Number.isFinite(raw?.first) ||
      !Number.isFinite(raw?.last) ||
      raw.first > raw.last ||
      !Array.isArray(series) ||
      !series.length
    ) {
      badSpan += 1;
      continue;
    }

    points += series.length;
    let prevFrom = -Infinity;
    let seriesOk = true;
    for (const point of series) {
      if (
        !Array.isArray(point) ||
        point.length !== 3 ||
        !point.every((v) => Number.isFinite(v)) ||
        point[0] > point[1] ||
        point[0] < prevFrom ||
        point[2] <= 0
      ) {
        seriesOk = false;
        break;
      }
      prevFrom = point[0];
    }
    if (!seriesOk) {
      badSeries += 1;
      continue;
    }

    if (series[0][0] !== raw.first || series[series.length - 1][1] !== raw.last) {
      badSpan += 1;
    }
    if (!Number.isInteger(raw.peak) || raw.peak < 0 || raw.peak >= series.length) {
      badPeak += 1;
    }
    for (const gap of raw.gaps ?? []) {
      if (
        !Array.isArray(gap) ||
        gap.length !== 2 ||
        gap[0] > gap[1] ||
        gap[0] < raw.first ||
        gap[1] > raw.last
      ) {
        badGap += 1;
        break;
      }
    }
  }

  const count = Object.keys(polities).length;
  const size = (statSync(path).size / 1024).toFixed(0);
  line(`政区 ${count.toLocaleString()}，面积点 ${points.toLocaleString()}，featured ${featured}，${size} KB`);
  line(`有中文名 ${withZh.toLocaleString()} (${((withZh / count) * 100).toFixed(1)}%)`);

  if (bracketed) err('lifecycles', `${bracketed} 个键仍带括号，与 polityKey.ts 不一致`);
  if (badSpan) err('lifecycles', `${badSpan} 个政区的 first/last 与 series 不符`);
  if (badSeries) err('lifecycles', `${badSeries} 个政区的 series 非升序、含非法值或面积非正`);
  if (badPeak) err('lifecycles', `${badPeak} 个政区的 peak 索引越界`);
  if (badGap) err('lifecycles', `${badGap} 个政区的 gaps 越界或反向`);
  if (!featured) warn('lifecycles', '没有任何 featured 政区');
}

/* ── places ──────────────────────────────────────────────────────────────── */

/**
 * `place_history.json` is derived from the polity slices, so the risks are the
 * same arithmetic ones as the lifecycle table, plus a gazetteer risk: a wrong
 * coordinate silently puts a city inside the wrong polity for centuries.
 */
function validatePlaceHistory() {
  section('地点编年  (public/places/place_history.json)');
  const path = join(ROOT, 'public', 'places', 'place_history.json');
  if (!existsSync(path)) {
    warn('places', '缺少文件: public/places/place_history.json', 'node scripts/data/build-place-history.mjs');
    return;
  }
  const parsed = readJson(path);
  if (!parsed.ok) {
    err('places', 'place_history.json 解析失败', parsed.error);
    return;
  }
  const doc = parsed.value;
  if (doc.version !== 1) warn('places', `未知版本 ${doc.version}`, '期望 1');
  // The provenance note is a product requirement, not decoration.
  if (typeof doc.note !== 'string' || doc.note.trim().length < 10) {
    err('places', '缺少数据来源说明 note');
  }
  const range = doc.dataRange;
  if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite)) {
    err('places', 'dataRange 缺失或非法');
    return;
  }
  const [dataFrom, dataTo] = range;
  if (dataFrom >= dataTo) err('places', `dataRange 反向: ${dataFrom}–${dataTo}`);

  const cities = doc.cities;
  if (!Array.isArray(cities) || !cities.length) {
    err('places', '缺少 cities 数组');
    return;
  }

  const ids = new Set();
  let badId = 0;
  let badCoord = 0;
  let badSpan = 0;
  let badRatio = 0;
  let bracketed = 0;
  let empty = 0;
  let spans = 0;

  for (const city of cities) {
    const id = city?.id;
    if (typeof id !== 'string' || !id) badId += 1;
    else if (ids.has(id)) badId += 1;
    else ids.add(id);

    if (
      !Number.isFinite(city?.lon) ||
      !Number.isFinite(city?.lat) ||
      Math.abs(city.lon) > 180 ||
      Math.abs(city.lat) > 90
    ) {
      badCoord += 1;
    }

    const polities = city?.polities;
    if (!Array.isArray(polities)) {
      badSpan += 1;
      continue;
    }
    if (!polities.length) empty += 1;

    let prevFrom = -Infinity;
    for (const polity of polities) {
      if (typeof polity?.name !== 'string' || !polity.name.trim()) {
        badSpan += 1;
        break;
      }
      // A wrapped name means the builder drifted from polityKey.ts.
      if (/^\([^()]*\)$/.test(polity.name)) bracketed += 1;
      const citySpans = polity.spans;
      if (!Array.isArray(citySpans) || !citySpans.length) {
        badSpan += 1;
        break;
      }
      let ok = true;
      for (const span of citySpans) {
        if (
          !Array.isArray(span) ||
          span.length !== 2 ||
          !span.every(Number.isFinite) ||
          span[0] > span[1] ||
          span[0] < dataFrom ||
          span[1] > dataTo
        ) {
          ok = false;
          break;
        }
        spans += 1;
      }
      if (!ok || citySpans[0][0] < prevFrom) {
        badSpan += 1;
        break;
      }
      prevFrom = citySpans[0][0];
    }

    const ratio = city?.coverage?.ratio;
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) badRatio += 1;
  }

  const size = (statSync(path).size / 1024).toFixed(0);
  line(`城市 ${cities.length}，政区区间 ${spans.toLocaleString()}，${size} KB`);

  if (badId) err('places', `${badId} 个城市的 id 缺失或重复`);
  if (badCoord) err('places', `${badCoord} 个城市的坐标缺失或越界`);
  if (badSpan) err('places', `${badSpan} 个城市的政区区间非法或越界`);
  if (badRatio) err('places', `${badRatio} 个城市的 coverage.ratio 不在 0–1`);
  if (bracketed) err('places', `${bracketed} 个政区名仍带括号，与 polityKey.ts 不一致`);
  if (empty) warn('places', `${empty} 个城市在全部年代中无政区命中`);
}

/* ── reference files ─────────────────────────────────────────────────────── */

function validateReference() {
  const dir = join(ROOT, 'public', 'ne');
  section('参考数据  (public/ne)');

  const expectations = [
    { file: 'ne_110m_admin_0_countries.json', kind: 'FeatureCollection' },
    { file: 'ne_50m_admin_0_boundary_lines_land.json', kind: 'FeatureCollection' },
    { file: 'polity_names_zh.json', kind: 'map' },
    { file: 'polity_assets.json', kind: 'map' },
    { file: 'polity_descriptions.json', kind: 'map' },
  ];

  for (const { file, kind } of expectations) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      err('reference', `缺少文件: public/ne/${file}`);
      continue;
    }
    const parsed = readJson(path);
    if (!parsed.ok) {
      err('reference', `解析失败: ${file}`, parsed.error);
      continue;
    }
    const value = parsed.value;
    const size = (statSync(path).size / 1048576).toFixed(2);
    if (kind === 'FeatureCollection' && (!value || value.type !== 'FeatureCollection')) {
      err('reference', `${file} 不是 FeatureCollection`, `type=${value?.type}`);
      continue;
    }
    if (kind === 'map' && (typeof value !== 'object' || Array.isArray(value))) {
      err('reference', `${file} 不是对象映射`, Array.isArray(value) ? 'array' : typeof value);
      continue;
    }
    const count = kind === 'map' ? Object.keys(value).length : (value.features?.length ?? 0);
    line(`${file.padEnd(42)} ${size.padStart(7)} MB  ${kind === 'map' ? '键' : '要素'} ${count}`);
  }

  const backups = readdirSync(dir, { recursive: true }).filter((f) => /backup/i.test(String(f)));
  if (backups.length) {
    err('reference', `部署目录中仍有 ${backups.length} 个备份文件`, backups.slice(0, 3).join(', '));
  } else {
    line('部署目录内无备份文件残留');
  }
}

/* ── report ──────────────────────────────────────────────────────────────── */

/**
 * The two event trees are edited separately, so an entry can be added on one
 * side only. Nothing downstream notices — the reader just sees a year that is
 * richer in one language — so the drift has to be caught here.
 *
 * Full list: `node scripts/data/compare-locales.mjs --detail`
 */
function collectEventIds(dirName) {
  const dir = join(ROOT, 'public', dirName);
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const parsed = readJson(join(dir, file));
    if (!parsed.ok) continue;
    const doc = parsed.value;
    const list = Array.isArray(doc) ? doc : (doc.events ?? []);
    out.set(file, new Set(list.map((event) => String(event.id))));
  }
  return out;
}

function validateLocaleParity() {
  section('中英事件对齐');
  const zh = collectEventIds('events');
  const en = collectEventIds('en-events');

  const onlyZh = [];
  const onlyEn = [];
  let shared = 0;

  for (const [file, ids] of zh) {
    for (const id of ids) {
      if (en.get(file)?.has(id)) shared += 1;
      else onlyZh.push(`${file} ${id}`);
    }
  }
  for (const [file, ids] of en) {
    for (const id of ids) {
      if (!zh.get(file)?.has(id)) onlyEn.push(`${file} ${id}`);
    }
  }

  line(`共有 ${shared} 条，仅中文 ${onlyZh.length} 条，仅英文 ${onlyEn.length} 条`);

  if (onlyZh.length) {
    err(
      '中英对齐',
      `${onlyZh.length} 条只有中文`,
      `${onlyZh.slice(0, MAX_EXAMPLES).join('; ')}${onlyZh.length > MAX_EXAMPLES ? ' …' : ''}（明细: node scripts/data/compare-locales.mjs --detail）`,
    );
  }
  if (onlyEn.length) {
    err(
      '中英对齐',
      `${onlyEn.length} 条只有英文`,
      `${onlyEn.slice(0, MAX_EXAMPLES).join('; ')}${onlyEn.length > MAX_EXAMPLES ? ' …' : ''}（明细: node scripts/data/compare-locales.mjs --detail）`,
    );
  }
}

function report() {
  console.log('\n' + '─'.repeat(64));
  console.log(`  ERROR ${errors.length}   WARNING ${warnings.length}`);

  if (errors.length) {
    console.log('\n  错误（会导致运行期问题，必须处理）');
    for (const item of errors) {
      console.log(`    [${item.section}] ${item.message}`);
      if (item.example) console.log(`        例: ${item.example}`);
    }
  }
  if (warnings.length) {
    console.log('\n  警告（数据质量，建议处理）');
    for (const item of warnings) {
      console.log(`    [${item.section}] ${item.message}`);
      if (item.example) console.log(`        例: ${item.example}`);
    }
  }
  if (!errors.length && !warnings.length) console.log('\n  数据校验全部通过');
  console.log('─'.repeat(64) + '\n');
}

const started = Date.now();
validateEvents('events', '事件(中文)');
validateEvents('en-events', '事件(英文)');
validateIndexedProfiles({
  dir: join('wars', 'profiles'),
  indexFile: 'index.json',
  idField: 'warId',
  label: '战争',
  requiredFields: ['name', 'startYear', 'endYear'],
  // A battle-location lookup table, not a war profile.
  ignoreFiles: ['war_locations.json'],
});
validateIndexedProfiles({
  dir: join('people', 'profiles'),
  indexFile: 'index.json',
  idField: 'personId',
  label: '人物',
  requiredFields: ['name'],
});
validatePolities();
validatePolityLifecycles();
validatePlaceHistory();
validateReference();
validateLocaleParity();
report();

console.log(`耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exit(errors.length ? 1 : 0);
