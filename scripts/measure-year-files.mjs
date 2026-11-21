#!/usr/bin/env node
/**
 * AR-003 年份文件分片实测（只读）。
 *
 * 回答四个问题：
 *   1. public/events 年份文件的数量与体积分布；
 *   2. 当前 ±YEAR_WINDOW 窗口一次加载发多少请求、传多少字节；
 *   3. 若改为 10 年 / 50 年一片，请求数与单片体积变成多少；
 *   4. public 与构建产物文件数距 Cloudflare Pages 2 万上限还有多少余量。
 *
 * 不写任何文件，不访问网络；读 src/config/index.ts 的真实常量，重复运行结果一致。
 * 运行：node scripts/measure-year-files.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLIC_DIR = join(ROOT, 'public');
const EVENTS_DIR = join(PUBLIC_DIR, 'events');
const EN_EVENTS_DIR = join(PUBLIC_DIR, 'en-events');
const DIST_DIR = join(ROOT, 'dist');
const FILE_LIMIT = 20_000;
const TINY_BYTES = 1024; // “极小文件”阈值：< 1 KB
const GZIP_THRESHOLD = 10_240; // vite.config.js 中 vite-plugin-compression 的 threshold

/* ── 读取真实配置，避免脚本常量与线上行为漂移 ─────────────────────────── */

const configSrc = readFileSync(join(ROOT, 'src', 'config', 'index.ts'), 'utf8');

function configNumber(name) {
  const m = new RegExp(`export const ${name}\\s*=\\s*(-?[\\d_]+)`).exec(configSrc);
  if (!m) throw new Error(`无法从 src/config/index.ts 解析 ${name}`);
  return Number(m[1].replace(/_/g, ''));
}

const YEAR_WINDOW = configNumber('YEAR_WINDOW');
const DEFAULT_YEAR = configNumber('DEFAULT_YEAR');
const YEAR_MIN = configNumber('YEAR_MIN');
const YEAR_MAX = configNumber('YEAR_MAX');
const DATA_CACHE_SIZE = configNumber('DATA_CACHE_SIZE');

const concurrencyMatch = /maxConcurrent:\s*([\d_]+)/.exec(configSrc);
if (!concurrencyMatch) throw new Error('无法从 src/config/index.ts 解析 NETWORK.maxConcurrent');
const MAX_CONCURRENT = Number(concurrencyMatch[1].replace(/_/g, ''));

const WINDOW_YEARS = YEAR_WINDOW * 2 + 1;

/* ── 文件与统计工具 ────────────────────────────────────────────────────── */

function readYearFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const m = /^(-?\d+)\.json$/.exec(entry.name);
    if (!m) continue;
    out.push({ year: Number(m[1]), size: statSync(join(dir, entry.name)).size });
  }
  return out.sort((a, b) => a.year - b.year);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push({ path: full, size: statSync(full).size });
  }
  return out;
}

function sortedStats(values) {
  if (!values.length) return { count: 0, total: 0, mean: 0, median: 0, p95: 0, max: 0, min: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, v) => sum + v, 0);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
  return {
    count: sorted.length,
    total,
    mean: total / sorted.length,
    median: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
    min: sorted[0],
  };
}

const num = (n) => Math.round(n).toLocaleString('en-US');
const bytes = (n) => {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024).toFixed(1)} KB`;
};

/* 终端表格：中文字符按 2 列宽对齐，避免 console.table 在 CJK 下错位。 */
const WIDE =
  /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;
const displayWidth = (s) => [...String(s)].reduce((w, ch) => w + (WIDE.test(ch) ? 2 : 1), 0);
const pad = (s, width, right) => {
  const body = String(s);
  const gap = ' '.repeat(Math.max(0, width - displayWidth(body)));
  return right ? gap + body : body + gap;
};

function table(headers, rows, rightCols = []) {
  const widths = headers.map((h, i) =>
    Math.max(displayWidth(h), ...rows.map((r) => displayWidth(r[i] ?? ''))),
  );
  const line = (left, mid, right) =>
    left + widths.map((w) => '─'.repeat(w + 2)).join(mid) + right;
  const render = (cells) =>
    '│ ' + cells.map((c, i) => pad(c, widths[i], rightCols.includes(i))).join(' │ ') + ' │';

  console.log(line('┌', '┬', '┐'));
  console.log(render(headers));
  console.log(line('├', '┼', '┤'));
  for (const row of rows) console.log(render(row));
  console.log(line('└', '┴', '┘'));
}

function section(title) {
  console.log(`\n${title}`);
}

/* ── 1. 年份文件体积分布 ────────────────────────────────────────────────── */

const zhFiles = readYearFiles(EVENTS_DIR);
const enFiles = readYearFiles(EN_EVENTS_DIR);

function fileSetStats(files) {
  const s = sortedStats(files.map((f) => f.size));
  return {
    ...s,
    empty: files.filter((f) => f.size === 0).length,
    tiny: files.filter((f) => f.size > 0 && f.size < TINY_BYTES).length,
    minYear: files.length ? files[0].year : null,
    maxYear: files.length ? files[files.length - 1].year : null,
    largest: files.reduce((a, b) => (b.size > a.size ? b : a), files[0] ?? null),
    // 时间轴范围之外的文件：滑杆永远到不了，白占配额。
    outside: files.filter((f) => f.year < YEAR_MIN || f.year > YEAR_MAX).length,
  };
}

const zh = fileSetStats(zhFiles);
const en = fileSetStats(enFiles);

section('[1] public/events 年份文件');
console.log(
  `配置：YEAR_MIN=${YEAR_MIN} YEAR_MAX=${YEAR_MAX} 时间轴可导航 ${num(
    YEAR_MAX - YEAR_MIN + 1,
  )} 年；YEAR_WINDOW=${YEAR_WINDOW}（窗口 ${WINDOW_YEARS} 年）；缓存 ${DATA_CACHE_SIZE} 片`,
);
table(
  ['指标', '中文 events', '英文 en-events'],
  [
    ['文件数', num(zh.count), num(en.count)],
    ['覆盖年份', `${zh.minYear} … ${zh.maxYear}`, `${en.minYear} … ${en.maxYear}`],
    ['总字节', bytes(zh.total), bytes(en.total)],
    ['平均', bytes(zh.mean), bytes(en.mean)],
    ['中位', bytes(zh.median), bytes(en.median)],
    ['P95', bytes(zh.p95), bytes(en.p95)],
    ['最大', `${bytes(zh.max)}（${zh.largest?.year}.json）`, bytes(en.max)],
    ['空文件（0 B）', num(zh.empty), num(en.empty)],
    [`极小（< ${TINY_BYTES} B）`, num(zh.tiny), num(en.tiny)],
    ['超出时间轴范围', num(zh.outside), num(en.outside)],
  ],
  [1, 2],
);
console.log(
  `备注：极小文件合计 ${num(zh.tiny + en.tiny)} 个，占全部年份文件 ${(
    ((zh.tiny + en.tiny) / (zh.count + en.count)) *
    100
  ).toFixed(1)}%；${num(zh.outside)} 个文件早于 YEAR_MIN（最低 ${zh.minYear}），滑杆取不到。`,
);

/* ── 2. 当前窗口的请求数与传输量 ───────────────────────────────────────── */

const zhByYear = new Map(zhFiles.map((f) => [f.year, f.size]));

function currentWindowRows(window) {
  const rows = [];
  for (let y = YEAR_MIN; y <= YEAR_MAX; y += 1) {
    let hitBytes = 0;
    let hits = 0;
    for (let yy = y - window; yy <= y + window; yy += 1) {
      const size = zhByYear.get(yy);
      if (size !== undefined) {
        hitBytes += size;
        hits += 1;
      }
    }
    rows.push({ year: y, bytes: hitBytes, hits, requests: window * 2 + 1 });
  }
  return rows;
}

const windowRows = currentWindowRows(YEAR_WINDOW);
const winBytes = sortedStats(windowRows.map((r) => r.bytes));
const winHits = sortedStats(windowRows.map((r) => r.hits));
const example = windowRows.find((r) => r.year === DEFAULT_YEAR);

let exampleRaw = 0;
let exampleGzip = 0;
for (let y = DEFAULT_YEAR - YEAR_WINDOW; y <= DEFAULT_YEAR + YEAR_WINDOW; y += 1) {
  const path = join(EVENTS_DIR, `${y}.json`);
  if (!existsSync(path)) continue;
  const buf = readFileSync(path);
  exampleRaw += buf.length;
  exampleGzip += gzipSync(buf).length;
}
const gzipRatio = exampleRaw ? exampleGzip / exampleRaw : 0;

section('[2] 当前窗口一次加载');
table(
  ['指标（单个 locale）', '值'],
  [
    ['每次请求数', `${WINDOW_YEARS}（滑杆 ±${YEAR_WINDOW} 年，每年 1 个文件）`],
    ['并发上限', `${MAX_CONCURRENT} → 约 ${Math.ceil(WINDOW_YEARS / MAX_CONCURRENT)} 批`],
    ['窗口命中文件数 均值', winHits.mean.toFixed(1)],
    ['传输字节 均值', bytes(winBytes.mean)],
    ['传输字节 中位', bytes(winBytes.median)],
    ['传输字节 P95', bytes(winBytes.p95)],
    ['传输字节 最大', bytes(winBytes.max)],
    [
      `示例 ${DEFAULT_YEAR} 窗口`,
      `${example.hits}/${WINDOW_YEARS} 命中 · 原始 ${bytes(exampleRaw)} · gzip 估计 ${bytes(
        exampleGzip,
      )}`,
    ],
    ['gzip 压缩率（示例窗口）', `${(gzipRatio * 100).toFixed(1)}%`],
  ],
  [1],
);
console.log(
  `说明：缺失年份仍会发一次请求并得到 404（body 可忽略），所以请求数恒为 ${WINDOW_YEARS}；` +
    `中英各加载一次即 ${WINDOW_YEARS * 2} 个请求。上表为原始 JSON 字节，gzip 为逐文件压缩后的估计。`,
);

/* ── 3. 10 年 / 50 年分片模拟 ───────────────────────────────────────────── */

function simulateShards(files, shardSize, window) {
  const shards = new Map();
  for (const file of files) {
    const id = Math.floor(file.year / shardSize) * shardSize;
    const cur = shards.get(id) ?? { id, count: 0, bytes: 0, first: file.year, last: file.year };
    cur.count += 1;
    cur.bytes += file.size;
    cur.first = Math.min(cur.first, file.year);
    cur.last = Math.max(cur.last, file.year);
    shards.set(id, cur);
  }

  const shardIdsInWindow = (year) => {
    const ids = new Set();
    for (let y = year - window; y <= year + window; y += 1) {
      ids.add(Math.floor(y / shardSize) * shardSize);
    }
    return [...ids];
  };

  let requestTotal = 0;
  let maxRequests = 0;
  let payloadTotal = 0;
  let maxPayload = 0;
  let samples = 0;
  for (let y = YEAR_MIN; y <= YEAR_MAX; y += 1) {
    const ids = shardIdsInWindow(y);
    requestTotal += ids.length;
    maxRequests = Math.max(maxRequests, ids.length);
    let payload = 0;
    for (const id of ids) payload += shards.get(id)?.bytes ?? 0;
    payloadTotal += payload;
    maxPayload = Math.max(maxPayload, payload);
    samples += 1;
  }

  const sizes = sortedStats([...shards.values()].map((s) => s.bytes));
  const largest = [...shards.values()].reduce(
    (a, b) => (b.bytes > a.bytes ? b : a),
    [...shards.values()][0] ?? { bytes: 0, first: 0, last: 0 },
  );
  // vite-plugin-compression 只压缩 ≥ 10 KB 的 json/js/css/html。
  const gzEligible = [...shards.values()].filter((s) => s.bytes >= GZIP_THRESHOLD).length;

  return {
    shardCount: shards.size,
    gzEligible,
    sizes,
    largest,
    meanRequests: requestTotal / samples,
    maxRequests,
    meanPayload: payloadTotal / samples,
    maxPayload,
  };
}

const sizesToTry = [10, 50];
const simulations = sizesToTry.map((size) => ({
  size,
  zh: simulateShards(zhFiles, size, YEAR_WINDOW),
  en: simulateShards(enFiles, size, YEAR_WINDOW),
}));

const current = {
  shardCount: zh.count,
  sizes: sortedStats(zhFiles.map((f) => f.size)),
  meanRequests: WINDOW_YEARS,
  maxRequests: WINDOW_YEARS,
  meanPayload: winBytes.mean,
  maxPayload: winBytes.max,
};

section('[3] 若按 10 年 / 50 年合并分片（中文 events）');
table(
  [
    '方案',
    '分片数',
    '单片均值',
    '单片中位',
    '单片最大',
    '窗口请求均值',
    '窗口请求最大',
    '窗口载荷均值',
    '载荷倍数',
  ],
  [
    [
      '按年（现状）',
      num(current.shardCount),
      bytes(current.sizes.mean),
      bytes(current.sizes.median),
      bytes(current.sizes.max),
      current.meanRequests.toFixed(1),
      String(current.maxRequests),
      bytes(current.meanPayload),
      '1.00×',
    ],
    ...simulations.map(({ size, zh: sim }) => [
      `${size} 年一片`,
      num(sim.shardCount),
      bytes(sim.sizes.mean),
      bytes(sim.sizes.median),
      bytes(sim.sizes.max),
      sim.meanRequests.toFixed(1),
      String(sim.maxRequests),
      bytes(sim.meanPayload),
      `${(sim.meanPayload / current.meanPayload).toFixed(2)}×`,
    ]),
  ],
  [1, 2, 3, 4, 5, 6, 7, 8],
);
console.log(
  `说明：单片体积 = 该分片内各年文件字节之和（年份级元数据保留，合并后体积近似不变）；` +
    `窗口载荷按“窗口触及的整个分片”计，因此包含窗口外的年份。` +
    `最大分片：10 年片 ${simulations[0].zh.largest.first}…${simulations[0].zh.largest.last} ` +
    `(${bytes(simulations[0].zh.largest.bytes)})，50 年片 ${simulations[1].zh.largest.first}…` +
    `${simulations[1].zh.largest.last} (${bytes(simulations[1].zh.largest.bytes)})。`,
);
console.log(
  `英文侧同构：10 年 ${num(simulations[0].en.shardCount)} 片、单片均值 ${bytes(
    simulations[0].en.sizes.mean,
  )}；50 年 ${num(simulations[1].en.shardCount)} 片、单片均值 ${bytes(
    simulations[1].en.sizes.mean,
  )}。`,
);

/* ── 4. 文件配额 ────────────────────────────────────────────────────────── */

const publicAll = walk(PUBLIC_DIR);
const yearFileCount = zh.count + en.count;
const publicCount = publicAll.length;

let dist = null;
if (existsSync(DIST_DIR) && existsSync(join(DIST_DIR, 'index.html'))) {
  const distAll = walk(DIST_DIR);
  const gzFiles = distAll.filter((f) => f.path.endsWith('.gz'));
  const yearGz = gzFiles.filter((f) =>
    /^(en-)?events\/.+\.gz$/.test(relative(DIST_DIR, f.path).replace(/\\/g, '/')),
  ).length;
  dist = {
    files: distAll.length,
    gz: gzFiles.length,
    yearGz,
    otherGz: gzFiles.length - yearGz,
    builtAssets: distAll.length - publicCount - gzFiles.length,
  };
}

/**
 * dist 中与年份文件无关的固定文件数。用最近一次真实构建反推，而不是硬编码 ——
 * Cesium 静态资源与 .gz 副本会随版本变化。分片后年份文件的 .gz 需要重新估算：
 * 大于 10 KB 的分片才会被 vite-plugin-compression 压缩。
 */
const baselineWithGz = dist ? dist.files - yearFileCount - dist.yearGz : null;
const baselineNoGz = dist ? dist.files - dist.gz - yearFileCount : null;

const annualGzEligible = (files) => files.filter((f) => f.size >= GZIP_THRESHOLD).length;

function projectFiles(shardSize, gzip) {
  if (dist === null) return null;
  const sim = shardSize ? simulations.find((s) => s.size === shardSize) : null;
  const zhShards = sim ? sim.zh.shardCount : zh.count;
  const enShards = sim ? sim.en.shardCount : en.count;
  const zhGz = sim ? sim.zh.gzEligible : annualGzEligible(zhFiles);
  const enGz = sim ? sim.en.gzEligible : annualGzEligible(enFiles);
  return (gzip ? baselineWithGz : baselineNoGz) + zhShards + enShards + (gzip ? zhGz + enGz : 0);
}

const estimatedDist = projectFiles(null, true);

section('[4] 文件配额（Cloudflare Pages 上限 20,000）');
table(
  ['项目', '文件数', '占上限'],
  [
    ['public 合计', num(publicCount), '—'],
    [
      '  其中年份文件（中英）',
      `${num(yearFileCount)}（${((yearFileCount / publicCount) * 100).toFixed(1)}%）`,
      '—',
    ],
    [
      'dist 实测',
      dist === null ? '未构建' : `${num(dist.files)}（含 .gz ${num(dist.gz)}）`,
      dist === null ? '—' : `${((dist.files / FILE_LIMIT) * 100).toFixed(1)}%`,
    ],
    [
      '  其中 .gz（年份 / 其他）',
      dist === null ? '—' : `${num(dist.yearGz)} / ${num(dist.otherGz)}`,
      '—',
    ],
    ['  纯构建产物（JS/CSS/Cesium 等）', dist === null ? '—' : num(dist.builtAssets), '—'],
    [
      '按年（预计构建，含 .gz）',
      estimatedDist === null ? '—' : num(estimatedDist),
      estimatedDist === null ? '—' : `${((estimatedDist / FILE_LIMIT) * 100).toFixed(1)}%`,
    ],
    ...simulations.map(({ size }) => {
      const value = projectFiles(size, true);
      return [
        `${size} 年分片后（预计构建，含 .gz）`,
        value === null ? '—' : num(value),
        value === null ? '—' : `${((value / FILE_LIMIT) * 100).toFixed(1)}%`,
      ];
    }),
  ],
  [1, 2],
);
if (dist === null) {
  console.log('说明：dist/ 不存在，构建附加数无法实测；先 npm run build 可得到准确值。');
} else {
  const noGz = [null, 10, 50].map((size) => projectFiles(size, false));
  console.log(
    `余量：${num(FILE_LIMIT - estimatedDist)} 个文件（${(
      ((FILE_LIMIT - estimatedDist) / FILE_LIMIT) *
      100
    ).toFixed(1)}%）。若按部署脚本建议改用 EARTH_GZIP=0，文件数变为 ` +
      `按年 ${num(noGz[0])} / 10 年 ${num(noGz[1])} / 50 年 ${num(noGz[2])}。`,
  );
}

/* ── 5. 结论 ────────────────────────────────────────────────────────────── */

const shard10 = simulations[0].zh;
const shard50 = simulations[1].zh;
const payload10 = shard10.meanPayload / current.meanPayload;
const payload50 = shard50.meanPayload / current.meanPayload;
const quotaPct = estimatedDist === null ? null : (estimatedDist / FILE_LIMIT) * 100;

section('[5] 结论');
console.log('→ 保持现状（按年文件），暂不合并为 10 年 / 50 年分片。');
console.log('理由：');
console.log(
  `  1) 配额不是瓶颈：当前 dist ${estimatedDist === null ? '（待构建）' : `${num(estimatedDist)} 个文件、占 ${quotaPct.toFixed(1)}%`}，` +
    `余量 ${estimatedDist === null ? '—' : num(FILE_LIMIT - estimatedDist)}；10 年分片虽可把构建文件降到 ${projectFiles(10, true) === null ? '—' : num(projectFiles(10, true))}，` +
    '但这是“将来数据变多”才需要动用的手段。',
);
console.log(
  `  2) 请求并不多：一个窗口 ${WINDOW_YEARS} 个请求，并发上限 ${MAX_CONCURRENT}，两批即可发完；` +
    'HTTP/2 复用连接，既有记录（docs R23）11 个请求 143 ms 内全部发出。',
);
console.log(
  `  3) 分片换来的是更重的载荷：10 年分片把单次窗口载荷从 ${bytes(current.meanPayload)} 提到 ` +
    `${payload10.toFixed(2)}×（约 ${bytes(shard10.meanPayload)}），50 年片提到 ${payload50.toFixed(2)}×` +
    `（约 ${bytes(shard50.meanPayload)}）；gzip 后比例相近，弱网与首屏代价大于省下的 ${(WINDOW_YEARS - shard10.meanRequests).toFixed(1)} 个请求。`,
);
console.log(
  `  4) 语义与成本：按年文件让“该年无记录”是明确的 404，缓存粒度正好是 ${DATA_CACHE_SIZE} 片；` +
    '合并后要重写加载、缓存、校验与旧缓存迁移，收益与成本不成比例。',
);
console.log(
  `  5) 数据侧问题与分片无关：${num(zh.outside)} 个年份文件早于 YEAR_MIN（${zh.minYear} 起），` +
    '应先清理或把 YEAR_MIN 下移，而不是靠合并掩盖。',
);
console.log(
  quotaPct === null
    ? '  重新评估的触发条件：dist 超过 17,000 个文件（85%），或实测窗口加载稳定超过 500 ms；届时优先 10 年分片。'
    : `  重新评估的触发条件：dist 超过 17,000 个文件（85%，当前 ${quotaPct.toFixed(1)}%），` +
        '或单窗口载荷超过 300 KB / 实测加载稳定超过 500 ms；届时优先 10 年分片（50 年片载荷过重）。',
);
