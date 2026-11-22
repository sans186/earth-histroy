/**
 * Clears shards that carried a BCE copy of the previous mirror year.
 *
 * Why: the upstream corpus generated a second copy of 90 BCE years into the
 * positive-year files (311.json carries 311 BCE content). Rendering those events
 * as AD years puts them centuries away from their real date. The negative-year
 * shard already holds an independent copy, so the duplicate is dropped instead
 * of being re-dated. Run with --apply to write.
 */
import fs from 'node:fs';
import path from 'node:path';

const apply = process.argv.includes('--apply');
const audit = JSON.parse(fs.readFileSync('.tmp-audit/shard-mislabel.json', 'utf8'));
const changes = [];

const reset = (doc, year, label, level) => {
  const removed = Array.isArray(doc.events) ? doc.events.length : 0;
  const removedIds = (doc.events ?? []).map((e) => e.id);
  doc.year = year;
  doc.year_label = label;
  doc.era_context = '';
  doc.documentation_level = level;
  doc.geographic_coverage_gaps = [];
  doc.events = [];
  doc.disconfirming_evidence = '';
  doc.historiographic_note = '';
  doc.graph_edges = [];
  return { removed, removedIds };
};

for (const item of audit.positiveLabeledBCE) {
  const year = item.year;
  const zhPath = path.join('public/events', `${year}.json`);
  const enPath = path.join('public/en-events', `${year}.json`);
  const zh = JSON.parse(fs.readFileSync(zhPath, 'utf8'));
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const zhStats = reset(zh, year, `\u516c\u5143${year}\u5e74`, '\u6781\u5c11');
  const enStats = reset(en, year, `${year} CE`, 'minimal');
  changes.push({
    year,
    zhRemoved: zhStats.removed,
    enRemoved: enStats.removed,
    removedIds: zhStats.removedIds,
  });
  if (apply) {
    fs.writeFileSync(zhPath, `${JSON.stringify(zh, null, 2)}\n`, 'utf8');
    fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`, 'utf8');
  }
}

const totalZh = changes.reduce((n, c) => n + c.zhRemoved, 0);
const totalEn = changes.reduce((n, c) => n + c.enRemoved, 0);
if (apply) {
  fs.writeFileSync('.tmp-audit/shard-mislabel-applied.json', JSON.stringify({ totalZh, totalEn, changes }, null, 2), 'utf8');
}
console.log(JSON.stringify({ apply, shards: changes.length, totalZh, totalEn }, null, 2));
