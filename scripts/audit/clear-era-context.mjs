/**
 * Clears era context left behind in shards whose events were all removed.
 *
 * Why: repair passes deleted every event of some shards, but the shard-level
 * era_context still narrates the deleted subject (Naram-Sin, Ramesses II,
 * Thutmose III). That text renders as the year's background, so an empty year
 * would still claim to belong to that reign. Context is cleared rather than
 * rewritten because inventing a replacement background is not a mechanical fix.
 *
 * A shard whose remaining events still mention the subject keeps its context.
 */
import fs from 'node:fs';
import path from 'node:path';

const apply = process.argv.includes('--apply');

// Reign windows of the subjects that the repair passes removed. A shard whose
// year actually falls inside one of them keeps its context: that background is
// true, only the deleted events were misplaced.
const subjects = [
  { pattern: /纳拉姆|阿卡德|Naram|Akkad/, from: -2371, to: -2154 },
  { pattern: /拉美西斯|Ramesses/, from: -1279, to: -1213 },
  { pattern: /图特摩斯|Thutmose/, from: -1479, to: -1425 },
];
const pattern = new RegExp(subjects.map((s) => s.pattern.source).join('|'));
const years = [path.join(process.cwd(), 'public/events'), path.join(process.cwd(), 'public/en-events')];
const touched = [];
const keptInReign = [];

const inReign = (year) => subjects.some((s) => year >= s.from && year <= s.to);
const dirs = years;

for (const dir of dirs) {
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const target = path.join(dir, file);
    const doc = JSON.parse(fs.readFileSync(target, 'utf8'));
    const context = String(doc.era_context ?? '');
    if (!pattern.test(context)) continue;
    if ((doc.events ?? []).length > 0) continue;
    if (inReign(Number(doc.year))) {
      keptInReign.push(path.relative(process.cwd(), target));
      continue;
    }
    doc.era_context = '';
    doc.documentation_level = doc.year > 0 ? 'minimal' : '极少';
    if (pattern.test(String(doc.historiographic_note ?? ''))) doc.historiographic_note = '';
    if (typeof doc.disconfirming_evidence === 'string' && pattern.test(doc.disconfirming_evidence)) {
      doc.disconfirming_evidence = '';
    }
    touched.push(path.relative(process.cwd(), target));
    if (apply) fs.writeFileSync(target, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  }
}

fs.writeFileSync('.tmp-audit/era-context-clean.json', JSON.stringify({ apply, touched }, null, 2), 'utf8');
console.log(JSON.stringify({ apply, touched: touched.length, sample: touched.slice(0, 8) }, null, 2));
