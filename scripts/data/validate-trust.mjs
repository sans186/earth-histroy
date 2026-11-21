/**
 * Coverage report for the trust ledger — AR-004.
 *
 * Why this exists
 * ---------------
 * The UI already decides how much to show based on whether an entry carries
 * sources (`src/services/data.ts`, `src/types/index.ts`). Nobody has ever
 * measured how much of the shipped dataset actually carries them, so every
 * discussion about "adding sources" starts from a guess.
 *
 * This script only counts. It does not write data, does not touch public/, and
 * is not part of the build gate.
 *
 * Usage
 * -----
 *   node scripts/data/validate-trust.mjs                # coverage summary
 *   node scripts/data/validate-trust.mjs --list-missing # plus missing IDs
 *   node scripts/data/validate-trust.mjs --strict       # exit 1 below 100%
 *
 * A ledger at docs/trust-ledger.json is used for context when present. When it
 * is absent the report says so and counts the inline `sources` fields instead.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve('.');
const FLAGS = new Set(process.argv.slice(2));
const STRICT = FLAGS.has('--strict');
const LIST_MISSING = FLAGS.has('--list-missing') || FLAGS.has('--missing');

const LEDGER_PATH = join(ROOT, 'docs', 'trust-ledger.json');
/** --strict fails when any category is below this percentage. */
const STRICT_MIN = 100;

const EVENT_DIRS = [
  { label: '事件（中文）', dir: join(ROOT, 'public', 'events') },
  { label: '事件（英文）', dir: join(ROOT, 'public', 'en-events') },
];
const PEOPLE_DIR = join(ROOT, 'public', 'people', 'profiles');
const WARS_DIR = join(ROOT, 'public', 'wars', 'profiles');
const NON_PROFILE_FILES = new Set(['index.json', 'war_locations.json']);

/* ── helpers ─────────────────────────────────────────────────────────────── */

function readJson(path) {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function jsonFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
}

/**
 * True when a source value carries anything citable.
 *
 * The corpus mixes three shapes: bare strings (war `sources`), arrays of
 * `{name, type, contemporary}` (events), and `{text, url}` (quote sources).
 * An empty object or an empty array must not count as "has sources".
 */
function meaningful(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.some(meaningful);
  if (typeof value === 'object') {
    if (typeof value.name === 'string' && value.name.trim()) return true;
    if (typeof value.text === 'string' && value.text.trim()) return true;
    if (typeof value.url === 'string' && value.url.trim()) return true;
    return Object.values(value).some(meaningful);
  }
  return false;
}

function hasSources(value) {
  if (Array.isArray(value)) return value.some(meaningful);
  if (value && typeof value === 'object') return Object.values(value).some(meaningful);
  return false;
}

function percent(part, total) {
  if (!total) return '0.0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

/** Display width, so a Chinese label lines up with an ASCII one. */
function displayWidth(text) {
  let width = 0;
  for (const ch of text) {
    width += /[\u2e80-\u9fff\uac00-\ud7a3\uf900-\ufaff\uff00-\uff60]/.test(ch) ? 2 : 1;
  }
  return width;
}

function pad(text, width) {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)));
}

/* ── ledger context ──────────────────────────────────────────────────────── */

function readLedger() {
  if (!existsSync(LEDGER_PATH)) {
    return { present: false };
  }
  const read = readJson(LEDGER_PATH);
  if (!read.ok) {
    return { present: true, ok: false, error: read.error };
  }
  const raw = read.value;
  const entries = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
  const byType = {};
  for (const entry of entries) {
    const type = (entry && entry.type) || 'unknown';
    byType[type] = (byType[type] ?? 0) + 1;
  }
  return { present: true, ok: true, entries, byType };
}

/* ── events ──────────────────────────────────────────────────────────────── */

function scanEvents(dir) {
  const result = { total: 0, withSources: 0, missing: [], unreadable: [] };
  for (const name of jsonFiles(dir)) {
    const read = readJson(join(dir, name));
    if (!read.ok) {
      result.unreadable.push(name);
      continue;
    }
    const events = Array.isArray(read.value?.events) ? read.value.events : [];
    events.forEach((event, index) => {
      result.total += 1;
      if (hasSources(event?.sources)) {
        result.withSources += 1;
        return;
      }
      const id = event?.id ?? `${read.value?.year ?? name.replace(/\.json$/, '')}-${index}`;
      result.missing.push(id);
    });
  }
  return result;
}

/* ── people ──────────────────────────────────────────────────────────────── */

/**
 * Where a person profile can carry sources, per `src/types/index.ts`:
 *   evaluation.sources[stance]  — per-view references for the appraisal
 *   quotes.sources              — provenance for the quotes
 *   sources                     — not shipped yet, accepted if it appears
 */
function personSourceFields(profile) {
  const fields = [];
  if (hasSources(profile.sources)) fields.push('sources');
  if (hasSources(profile.evaluation?.sources)) fields.push('evaluation.sources');
  if (hasSources(profile.quotes?.sources)) fields.push('quotes.sources');
  return fields;
}

function scanPeople(dir) {
  const result = { total: 0, withSources: 0, fields: {}, missing: [], unreadable: [] };
  const files = jsonFiles(dir).filter((name) => !NON_PROFILE_FILES.has(name));
  for (const name of files) {
    const read = readJson(join(dir, name));
    if (!read.ok) {
      result.unreadable.push(name);
      continue;
    }
    const profile = read.value ?? {};
    result.total += 1;
    const fields = personSourceFields(profile);
    for (const field of fields) result.fields[field] = (result.fields[field] ?? 0) + 1;
    if (fields.length) {
      result.withSources += 1;
    } else {
      result.missing.push(profile.personId ?? name.replace(/\.json$/, ''));
    }
  }
  return result;
}

/* ── wars ────────────────────────────────────────────────────────────────── */

function scanWars(dir) {
  const result = {
    total: 0,
    withSources: 0,
    stringEntries: 0,
    objectEntries: 0,
    mixed: [],
    missing: [],
    unreadable: [],
  };
  const files = jsonFiles(dir).filter((name) => !NON_PROFILE_FILES.has(name));
  for (const name of files) {
    const read = readJson(join(dir, name));
    if (!read.ok) {
      result.unreadable.push(name);
      continue;
    }
    const profile = read.value ?? {};
    result.total += 1;
    const sources = Array.isArray(profile.sources) ? profile.sources : [];
    let strings = 0;
    let objects = 0;
    for (const source of sources) {
      if (typeof source === 'string' && source.trim()) strings += 1;
      else if (source && typeof source === 'object' && meaningful(source)) objects += 1;
    }
    result.stringEntries += strings;
    result.objectEntries += objects;
    if (strings && objects) result.mixed.push(profile.warId ?? name.replace(/\.json$/, ''));
    if (hasSources(sources)) result.withSources += 1;
    else result.missing.push(profile.warId ?? name.replace(/\.json$/, ''));
  }
  return result;
}

/* ── report ──────────────────────────────────────────────────────────────── */

function reportRow(label, total, withSources) {
  console.log(
    `  ${pad(label, 12)} 总数 ${String(total).padStart(6)}  含 sources ${String(
      withSources,
    ).padStart(6)}  覆盖率 ${percent(withSources, total)}`,
  );
}

function printMissing(label, ids) {
  if (!LIST_MISSING || !ids.length) return;
  console.log(`\n  缺失 ID（${label}，共 ${ids.length} 条）：`);
  for (const id of ids) console.log(`    - ${id}`);
}

function main() {
  const ledger = readLedger();

  console.log('=== 可信度台账 ===');
  if (!ledger.present) {
    console.log('  台账未建立，按内联来源统计（docs/trust-ledger.json 不存在）。');
  } else if (!ledger.ok) {
    console.log(`  台账读取失败（${ledger.error}），按内联来源统计。`);
  } else {
    const types = Object.entries(ledger.byType)
      .map(([type, count]) => `${type} ${count}`)
      .join('，');
    console.log(`  台账已建立：${ledger.entries.length} 条${types ? `（${types}）` : ''}。`);
    console.log('  覆盖率仍按数据集内联 sources 统计，台账仅作对照。');
  }

  const rows = [];

  for (const { label, dir } of EVENT_DIRS) {
    const scan = scanEvents(dir);
    console.log(`\n=== ${label} ===`);
    reportRow('事件', scan.total, scan.withSources);
    if (scan.unreadable.length) {
      console.log(`  无法解析的文件 ${scan.unreadable.length} 个：${scan.unreadable.join(', ')}`);
    }
    printMissing(label, scan.missing);
    rows.push({ label, total: scan.total, withSources: scan.withSources, missing: scan.missing });
  }

  const people = scanPeople(PEOPLE_DIR);
  console.log('\n=== 人物档案 ===');
  reportRow('人物档案', people.total, people.withSources);
  const fieldText = Object.entries(people.fields)
    .map(([field, count]) => `${field} ${count}`)
    .join('，');
  console.log(`  来源字段分布：${fieldText || '无'}`);
  if (people.unreadable.length) {
    console.log(`  无法解析的文件 ${people.unreadable.length} 个：${people.unreadable.join(', ')}`);
  }
  printMissing('人物档案', people.missing);
  rows.push({ label: '人物档案', total: people.total, withSources: people.withSources });

  const wars = scanWars(WARS_DIR);
  console.log('\n=== 战争档案 ===');
  reportRow('战争档案', wars.total, wars.withSources);
  console.log(
    `  来源条目格式：纯字符串 ${wars.stringEntries} 条，结构化对象 ${wars.objectEntries} 条，混用档案 ${wars.mixed.length} 份`,
  );
  if (wars.unreadable.length) {
    console.log(`  无法解析的文件 ${wars.unreadable.length} 个：${wars.unreadable.join(', ')}`);
  }
  printMissing('战争档案', wars.missing);
  rows.push({ label: '战争档案', total: wars.total, withSources: wars.withSources });

  console.log('\n=== 汇总 ===');
  for (const row of rows) reportRow(row.label, row.total, row.withSources);

  const below = rows.filter(
    (row) => row.total > 0 && (row.withSources / row.total) * 100 < STRICT_MIN,
  );
  if (STRICT && below.length) {
    console.log(`\n严格模式：${below.map((row) => row.label).join('、')} 未达 ${STRICT_MIN}%，退出码 1。`);
    process.exitCode = 1;
  } else if (STRICT) {
    console.log(`\n严格模式：全部类别达到 ${STRICT_MIN}%。`);
  } else {
    console.log('\n提示：默认不阻断；加 --strict 可在覆盖率不足时返回退出码 1。');
  }
}

main();
