/**
 * Compares Chinese and English event shards by id.
 *
 * Why: the two shards are generated independently from the same year prompt, so
 * an event removed or corrected on the Chinese side keeps its stale twin on the
 * English side. Before fixing English content we need the exact shape of the
 * divergence rather than assuming the ids line up.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const zhDir = path.join(root, 'public/events');
const enDir = path.join(root, 'public/en-events');
const outDir = path.join(root, '.tmp-audit');

const stats = { zhFiles: 0, enFiles: 0, onlyZh: [], onlyEn: [], cjkInEn: [] };

for (const file of fs.readdirSync(zhDir)) {
  if (!file.endsWith('.json')) continue;
  stats.zhFiles += 1;
  const zh = JSON.parse(fs.readFileSync(path.join(zhDir, file), 'utf8'));
  const enPath = path.join(enDir, file);
  if (!fs.existsSync(enPath)) {
    stats.onlyZh.push(file);
    continue;
  }
  stats.enFiles += 1;
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const zhIds = new Set((zh.events ?? []).map((e) => e.id));
  const enIds = new Set((en.events ?? []).map((e) => e.id));
  for (const id of zhIds) if (!enIds.has(id)) stats.onlyZh.push(`${file}:${id}`);
  for (const id of enIds) if (!zhIds.has(id)) stats.onlyEn.push(`${file}:${id}`);
  for (const event of en.events ?? []) {
    const text = `${event.title ?? ''} ${event.description ?? ''}`;
    if (/[\u4e00-\u9fff]/.test(text)) stats.cjkInEn.push(`${file}:${event.id}`);
  }
}

fs.writeFileSync(path.join(outDir, 'en-shard-diff.json'), JSON.stringify(stats, null, 2), 'utf8');
console.log(JSON.stringify({
  zhFiles: stats.zhFiles,
  enFiles: stats.enFiles,
  onlyZh: stats.onlyZh.length,
  onlyEn: stats.onlyEn.length,
  cjkInEn: stats.cjkInEn.length,
}, null, 2));
