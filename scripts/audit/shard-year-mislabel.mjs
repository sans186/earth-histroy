/**
 * Finds shards whose year_label contradicts the shard's numeric year.
 *
 * Why: the upstream corpus generated a second copy of some BCE years inside the
 * positive-year files (a 429.json whose year_label reads 公元前429年). Rendering
 * those events as AD years on the timeline is a visible factual error, so the
 * scope has to be measured before deciding whether to drop or relocate them.
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'public/events');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
const bce = /\u516c\u5143\u524d|\u524d\d/;
const report = { positiveLabeledBCE: [], negativeLabeledCE: [], noLabel: [] };

for (const file of files) {
  const year = Number(file.replace(/\.json$/, ''));
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const label = String(data.year_label ?? '');
  const events = (data.events ?? []).length;
  if (!label) {
    report.noLabel.push({ file, year, events });
    continue;
  }
  const labelSaysBCE = bce.test(label);
  if (year > 0 && labelSaysBCE) report.positiveLabeledBCE.push({ file, year, label, events });
  if (year < 0 && !labelSaysBCE) report.negativeLabeledCE.push({ file, year, label, events });
}

fs.mkdirSync('.tmp-audit', { recursive: true });
fs.writeFileSync('.tmp-audit/shard-mislabel.json', JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({
  totalShards: files.length,
  positiveLabeledBCE: report.positiveLabeledBCE.length,
  negativeLabeledCE: report.negativeLabeledCE.length,
  noLabel: report.noLabel.length,
}, null, 2));
console.log(report.positiveLabeledBCE.slice(0, 12).map((r) => `${r.file} ${r.label} ${r.events}`).join('\n'));
