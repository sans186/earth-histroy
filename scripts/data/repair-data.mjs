/**
 * Repair the mechanical data defects reported by validate-data.mjs.
 *
 * Scope is deliberately narrow: this script only touches defects where the
 * correct value is unambiguous. Anything requiring a historical judgement
 * (e.g. whether a negative year's label is off by one) is reported by the
 * validator and left alone.
 *
 * Fixes applied
 * -------------
 *   A. wars/profiles/index.json — drop stub entries that have no warId, so the
 *      list can actually be joined against profile files by id.
 *   B. events/*.json, en-events/*.json — the literal string "null" stored in
 *      `coordinates_approx` is replaced with a real JSON null. Done as a
 *      surgical text substitution so nothing else about the file changes.
 *   C. events/ — stale extension-less drafts (e.g. `-1895`) that shadow nothing
 *      at runtime but sit in the deploy directory, moved to data/backups/.
 *
 * Usage
 * -----
 *   node scripts/data/repair-data.mjs            # dry run, no writes
 *   node scripts/data/repair-data.mjs --commit   # apply
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve('.');
const COMMIT = process.argv.includes('--commit');
const BACKUP = resolve('data', 'backups');

const report = [];
function note(section, message) {
  report.push({ section, message });
  console.log(`  ${COMMIT ? '' : '[试运行] '}${message}`);
}

/* ── A. war index stubs ──────────────────────────────────────────────────── */

function fixWarIndex() {
  console.log('\n=== A. 战争索引空壳条目 ===');
  const path = join(ROOT, 'public', 'wars', 'profiles', 'index.json');
  const list = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(list)) {
    note('wars', '索引不是数组，跳过');
    return;
  }

  const stubs = list
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !entry?.warId);

  if (!stubs.length) {
    note('wars', '未发现缺少 warId 的条目');
    return;
  }

  for (const { entry, index } of stubs) {
    note('wars', `移除 index[${index}] 空壳条目: ${JSON.stringify(entry).slice(0, 120)}`);
  }

  const kept = list.filter((entry) => entry?.warId);
  note('wars', `条目 ${list.length} → ${kept.length}`);

  if (COMMIT) {
    const original = readFileSync(path, 'utf8');
    const trailingNewline = original.endsWith('\n') ? '\n' : '';
    writeFileSync(path, JSON.stringify(kept, null, 2) + trailingNewline);
  }
}

/* ── B. the literal string "null" in coordinates_approx ──────────────────── */

const NULLISH = String.raw`"coordinates_approx"\s*:\s*"(?:null|undefined|n\/a|none|-|—|\?)"`;

function fixNullCoordinates(dirName) {
  const label = `event:${dirName}`;
  console.log(`\n=== B. ${dirName} 中的 "null" 坐标 ===`);
  const dir = join(ROOT, 'public', dirName);
  if (!existsSync(dir)) {
    note(label, '目录不存在，跳过');
    return;
  }

  const pattern = new RegExp(NULLISH, 'gi');
  let filesChanged = 0;
  let replacements = 0;

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const path = join(dir, file);
    const text = readFileSync(path, 'utf8');
    const matches = text.match(pattern);
    if (!matches) continue;

    filesChanged += 1;
    replacements += matches.length;
    if (filesChanged <= 8) note(label, `${file}: ${matches.length} 处`);
    if (COMMIT) {
      writeFileSync(path, text.replace(pattern, '"coordinates_approx": null'));
    }
  }

  if (!filesChanged) note(label, '未发现字符串 null 坐标');
  else note(label, `合计 ${filesChanged} 个文件，${replacements} 处`);
}

/* ── C. stale extension-less drafts inside the deploy directory ──────────── */

function fixOrphanFiles() {
  console.log('\n=== C. events/ 中的无后缀残留文件 ===');
  const dir = join(ROOT, 'public', 'events');
  const orphans = readdirSync(dir).filter((f) => !f.endsWith('.json'));

  if (!orphans.length) {
    note('events', '未发现无后缀文件');
    return;
  }

  const target = join(BACKUP, 'events-orphans');
  for (const file of orphans) {
    const size = statSync(join(dir, file)).size;
    note('events', `归档 ${file} (${size} bytes) → data/backups/events-orphans/`);
  }

  if (COMMIT) {
    mkdirSync(target, { recursive: true });
    for (const file of orphans) {
      renameSync(join(dir, file), join(target, file));
    }
  }
}

/* ── D. coordinates that are not on Earth ────────────────────────────────── */

/**
 * Two events carry genuine coordinates — for places that are not on Earth:
 *
 *   Viking 2 sits on Mars (Utopia Planitia, 47.6N 225.8E, Mars uses 0-360
 *   longitudes), and SN 1987A is in the Large Magellanic Cloud (-69.27 is its
 *   declination, the second value belongs to an equatorial frame).
 *
 * Normalising 225.77 -> -134.23 would drop a Mars lander into British Columbia,
 * which is worse than admitting we have no Earth position for it. They are
 * therefore recorded as "no coordinates"; the original values are kept here so
 * the decision stays visible and reversible.
 *
 * Deliberately whitelisted rather than "any longitude over 180": a new
 * out-of-range value should surface as a validation error for a human to judge,
 * not be silently rewritten.
 */
const NON_TERRESTRIAL = [
  { value: '47.64, 225.77', reason: '火星 · 乌托邦平原（海盗2号着陆点）' },
  { value: '-69.27, 279.70', reason: '大麦哲伦星云 · SN 1987A 赤纬，非地球经度' },
];

function fixNonTerrestrial(dirName) {
  const label = `event:${dirName}`;
  console.log(`\n=== D. ${dirName} 中的非地球坐标 ===`);
  const dir = join(ROOT, 'public', dirName);
  if (!existsSync(dir)) {
    note(label, '目录不存在，跳过');
    return;
  }

  let hits = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const path = join(dir, file);
    const text = readFileSync(path, 'utf8');
    let next = text;

    for (const { value, reason } of NON_TERRESTRIAL) {
      const needle = `"coordinates_approx": "${value}"`;
      if (!next.includes(needle)) continue;
      hits += 1;
      note(label, `${file}: ${value} → null   (${reason})`);
      next = next.replace(needle, '"coordinates_approx": null');
    }

    if (COMMIT && next !== text) writeFileSync(path, next);
  }

  if (!hits) note(label, '未发现非地球坐标');
}

/* ── E. quote-collapsed arrays ───────────────────────────────────────────── */

/**
 * A post-processing step in the original war pipeline replaced ASCII double
 * quotes with CJK quotations everywhere, including inside JSON. That collapsed
 * every array of strings into a single string:
 *
 *     ["陆战", "海战", "围城战"]   ->   ["陆战“, ”海战“, ”围城战"]
 *
 * The result is still valid JSON, so nothing ever complained. It affects the
 * index (177 places) and 84 of 88 profiles. The repair splits those strings
 * back into arrays.
 *
 * Guards against over-splitting legitimate prose: the split is only accepted
 * when it yields at least two non-empty parts, none longer than 60 characters.
 * Anything that fails the guard is left untouched (and still reported by the
 * validator) rather than guessed at.
 */
const QUOTE_COLLAPSE = /[“”]\s*,\s*[“”]/;
const QUOTE_COLLAPSE_G = /[“”]\s*,\s*[“”]/g;

function splitCollapsedArrays(node, stats) {
  let changes = 0;

  if (Array.isArray(node)) {
    const rebuilt = [];
    for (const item of node) {
      if (typeof item === 'string' && QUOTE_COLLAPSE.test(item)) {
        const parts = item
          .split(QUOTE_COLLAPSE_G)
          .map((s) => s.trim())
          .filter(Boolean);
        const acceptable =
          parts.length >= 2 && parts.every((p) => p.length > 0 && p.length <= 60);
        if (acceptable) {
          stats.splits += 1;
          stats.parts += parts.length;
          rebuilt.push(...parts);
          changes += 1;
          continue;
        }
        stats.rejected += 1;
        if (stats.rejectedExamples.length < 5) {
          stats.rejectedExamples.push(item.slice(0, 70));
        }
      }
      changes += splitCollapsedArrays(item, stats);
      rebuilt.push(item);
    }
    node.length = 0;
    node.push(...rebuilt);
    return changes;
  }

  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) {
      changes += splitCollapsedArrays(node[key], stats);
    }
  }
  return changes;
}

function fixQuoteCollapse() {
  console.log('\n=== E. 引号塌缩的数组 ===');

  const targets = [
    join(ROOT, 'public', 'wars', 'profiles', 'index.json'),
    ...readdirSync(join(ROOT, 'public', 'wars', 'profiles'))
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .map((f) => join(ROOT, 'public', 'wars', 'profiles', f)),
  ];

  let filesChanged = 0;
  const totals = { splits: 0, parts: 0, rejected: 0, rejectedExamples: [] };
  const changedPaths = [];

  for (const path of targets) {
    let doc;
    try {
      doc = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }

    const before = totals.splits;
    splitCollapsedArrays(doc, totals);
    if (totals.splits === before) continue;

    filesChanged += 1;
    changedPaths.push(path);
    if (COMMIT) {
      const original = readFileSync(path, 'utf8');
      const trailing = original.endsWith('\n') ? '\n' : '';
      writeFileSync(path, JSON.stringify(doc, null, 2) + trailing);
    }
  }

  // These files carry uncommitted edits, so keep a copy of the pre-repair state.
  if (COMMIT && changedPaths.length) {
    const backupDir = join(BACKUP, 'wars-before-quote-repair');
    mkdirSync(backupDir, { recursive: true });
    for (const path of changedPaths) {
      const copy = join(backupDir, path.split(/[\\/]/).pop());
      if (!existsSync(copy)) copyFileSync(path, copy);
    }
    note('wars', `原文件已备份至 ${backupDir.replace(ROOT + '\\', '').replace(/\\/g, '/')}`);
  }

  note('wars', `修复 ${filesChanged} 个文件，展开 ${totals.splits} 处塌缩，还原出 ${totals.parts} 个元素`);
  if (totals.rejected) {
    note('wars', `${totals.rejected} 处未通过安全判据，保持原样待人工确认`);
    for (const example of totals.rejectedExamples) {
      note('wars', `  未处理: ${example}`);
    }
  }
}

/* ── F. a collapsed key/value pair inside timeline[].description ─────────── */

/**
 * The same post-processing step damaged a deeper level: some timeline entries
 * were emitted with the Chinese key 影响 instead of `impact`, and the pair then
 * collapsed into the preceding `description`:
 *
 *   "description": "……提供法律框架“,”影响“:”为南非联邦的成立铺平道路……"
 *
 * Measured shape of the damage, before writing this repair:
 *   - exactly one marker kind, 影响
 *   - 96 occurrences
 *   - all inside timeline[].description
 *   - in every case the sibling object had no `impact` field yet
 *
 * That makes the reconstruction unambiguous: split on the marker, keep the left
 * side as description and store the right side as impact. The target field is
 * the one the surrounding entries already use.
 */
const IMPACT_MARKER = /“,”影响“:”/;

function repairTimelineImpact(node, stats) {
  if (Array.isArray(node)) {
    for (const item of node) repairTimelineImpact(item, stats);
    return;
  }
  if (!node || typeof node !== 'object') return;

  if (
    typeof node.description === 'string' &&
    IMPACT_MARKER.test(node.description) &&
    !node.impact
  ) {
    const parts = node.description.split(IMPACT_MARKER);
    const description = parts[0]?.trim();
    const impact = parts.slice(1).join('').trim();
    if (description && impact) {
      node.description = description;
      node.impact = impact;
      stats.fixed += 1;
    } else {
      stats.rejected += 1;
    }
  }

  for (const value of Object.values(node)) repairTimelineImpact(value, stats);
}

function fixTimelineImpact() {
  console.log('\n=== F. timeline 描述中的键值塌缩 ===');
  const dir = join(ROOT, 'public', 'wars', 'profiles');
  const stats = { fixed: 0, rejected: 0 };
  let filesChanged = 0;

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const path = join(dir, file);
    let doc;
    try {
      doc = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    const before = stats.fixed;
    repairTimelineImpact(doc, stats);
    if (stats.fixed === before) continue;

    filesChanged += 1;
    if (COMMIT) {
      const original = readFileSync(path, 'utf8');
      const trailing = original.endsWith('\n') ? '\n' : '';
      writeFileSync(path, JSON.stringify(doc, null, 2) + trailing);
    }
  }

  note('wars', `还原 ${stats.fixed} 处 description/impact 分离，涉及 ${filesChanged} 个文件`);
  if (stats.rejected) note('wars', `${stats.rejected} 处不完整，保持原样`);
}

/* ── run ─────────────────────────────────────────────────────────────────── */

console.log(`\n数据修复  ${COMMIT ? '（COMMIT，将写入磁盘）' : '（试运行，不写入）'}`);

fixWarIndex();
fixNullCoordinates('events');
fixNullCoordinates('en-events');
fixOrphanFiles();
fixNonTerrestrial('events');
fixNonTerrestrial('en-events');
fixQuoteCollapse();
fixTimelineImpact();

console.log('\n' + '─'.repeat(60));
console.log(`  共 ${report.length} 项操作`);
if (!COMMIT) {
  console.log('  确认无误后执行: node scripts/data/repair-data.mjs --commit');
} else {
  console.log('  已写入。建议随后重跑校验: node scripts/data/validate-data.mjs');
}
console.log('─'.repeat(60) + '\n');
