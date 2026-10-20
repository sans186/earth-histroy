#!/usr/bin/env node
/**
 * Compares the Chinese and English event sets.
 *
 * The two trees are maintained separately, so entries drift: an event gets
 * added or removed on one side only. This reports that drift by year file and
 * by event id, which is the only way to fix it without eyeballing 5,226 files.
 *
 *   node scripts/data/compare-locales.mjs            # summary
 *   node scripts/data/compare-locales.mjs --detail   # per-entry list
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ZH_DIR = join(ROOT, 'public/events');
const EN_DIR = join(ROOT, 'public/en-events');
const detail = process.argv.includes('--detail');

const num = (n) => n.toLocaleString('en-US');

function readEvents(dir, file) {
  const path = join(dir, file);
  if (!existsSync(path)) return null;
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const list = Array.isArray(json) ? json : (json.events ?? []);
  return new Map(list.map((e) => [String(e.id), String(e.title ?? '')]));
}

const zhFiles = new Set(readdirSync(ZH_DIR).filter((f) => f.endsWith('.json')));
const enFiles = new Set(readdirSync(EN_DIR).filter((f) => f.endsWith('.json')));

const onlyZhFiles = [...zhFiles].filter((f) => !enFiles.has(f));
const onlyEnFiles = [...enFiles].filter((f) => !zhFiles.has(f));

let zhOnly = 0;
let enOnly = 0;
let shared = 0;
const gaps = [];

for (const file of [...zhFiles].filter((f) => enFiles.has(f))) {
  const zh = readEvents(ZH_DIR, file);
  const en = readEvents(EN_DIR, file);
  if (!zh || !en) continue;

  for (const [id, title] of zh) {
    if (en.has(id)) shared += 1;
    else {
      zhOnly += 1;
      gaps.push({ file, id, side: 'zh-only', title });
    }
  }
  for (const [id, title] of en) {
    if (!zh.has(id)) {
      enOnly += 1;
      gaps.push({ file, id, side: 'en-only', title });
    }
  }
}

console.log('══════ 中英事件对齐 ══════');
console.log(`  年份文件      中文 ${num(zhFiles.size)} / 英文 ${num(enFiles.size)}`);
console.log(`  共有条目      ${num(shared)}`);
console.log(`  仅中文有      ${num(zhOnly)}`);
console.log(`  仅英文有      ${num(enOnly)}`);
console.log(`  仅中文的文件  ${onlyZhFiles.length}${onlyZhFiles.length ? `  ${onlyZhFiles.slice(0, 6).join(', ')}` : ''}`);
console.log(`  仅英文的文件  ${onlyEnFiles.length}${onlyEnFiles.length ? `  ${onlyEnFiles.slice(0, 6).join(', ')}` : ''}`);

const byFile = new Map();
for (const gap of gaps) {
  const key = gap.file.replace('.json', '');
  if (!byFile.has(key)) byFile.set(key, { zh: 0, en: 0 });
  byFile.get(key)[gap.side === 'zh-only' ? 'zh' : 'en'] += 1;
}

if (byFile.size) {
  console.log('\n存在差异的年份:');
  for (const [year, counts] of [...byFile.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).slice(0, 20)) {
    console.log(`  ${year.padStart(6)}  仅中文 ${String(counts.zh).padStart(2)}  仅英文 ${String(counts.en).padStart(2)}`);
  }
}

if (detail) {
  console.log('\n明细:');
  for (const gap of gaps) {
    console.log(`  ${gap.file.padEnd(10)} ${gap.id.padEnd(12)} ${gap.side.padEnd(8)} ${gap.title.slice(0, 40)}`);
  }
}
