/**
 * Drops cross references whose target event was removed by a repair pass.
 *
 * Why: repair passes deleted whole events, but neighbouring shards still name
 * their ids. A dangling id becomes a dead link in the event card, so the
 * reference is removed rather than kept as decoration.
 *
 * The id set comes from the pre-repair snapshot extracted under .tmp-head, not
 * from "any id-like substring that is missing today": prose contains ranges such
 * as 1186-1155 that match the id shape without ever being events.
 */
import fs from 'node:fs';
import path from 'node:path';

const apply = process.argv.includes('--apply');
const zhDir = path.join(process.cwd(), 'public/events');
const enDir = path.join(process.cwd(), 'public/en-events');
const headDir = path.join(process.cwd(), '.tmp-head/public/events');

const collectIds = (dir) => {
  const ids = new Set();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const ev of doc.events ?? []) ids.add(ev.id);
  }
  return ids;
};

const nowIds = collectIds(zhDir);
const headIds = collectIds(headDir);
const gone = new Set([...headIds].filter((id) => !nowIds.has(id)));

const idPattern = /-?\d+-\d{3}/g;
const report = [];
const skippedByRange = [];

const shards = [
  ...fs.readdirSync(zhDir).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, dir: zhDir })),
  ...fs.readdirSync(enDir).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, dir: enDir })),
];

for (const { file, dir } of shards) {
  const target = path.join(dir, file);
  const doc = JSON.parse(fs.readFileSync(target, 'utf8'));
  let dirty = false;
  for (const ev of doc.events ?? []) {
    const refs = ev.cross_references ?? [];
    if (!refs.length) continue;
    const kept = [];
    for (const ref of refs) {
      const text = String(ref);
      const found = text.match(idPattern) ?? [];
      const dead = found.filter((id) => gone.has(id));
      if (!dead.length) {
        kept.push(ref);
        continue;
      }
      // A reference may name a real id and a nearby prose range; only drop when
      // every id it names is actually gone.
      const alive = found.filter((id) => nowIds.has(id));
      if (alive.length) {
        skippedByRange.push({ file, eventId: ev.id, ref: text, alive });
        kept.push(ref);
        continue;
      }
      report.push({ file, eventId: ev.id, dropped: text });
      dirty = true;
    }
    if (kept.length !== refs.length) ev.cross_references = kept;
  }
  if (dirty && apply) fs.writeFileSync(target, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

fs.writeFileSync(
  '.tmp-audit/refs-pruned.json',
  JSON.stringify({ apply, gone: gone.size, dropped: report.length, keptByRange: skippedByRange.length, report, skippedByRange }, null, 2),
  'utf8',
);
console.log(JSON.stringify({ apply, gone: gone.size, dropped: report.length, keptByRange: skippedByRange.length, sample: report.slice(0, 5) }, null, 2));
