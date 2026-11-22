/**
 * Removes the two Confucius entries that carry the wrong year, and retitles a
 * retrospective Ming entry that reads as if the treasure fleet ended in 1451.
 *
 * Why: -550-003 and -547-002 both state in their own body that Confucius was born
 * in 551 BCE, so the shard year contradicts the text; -551-001 already carries the
 * accepted date. 1451-003 describes the consolidation of the haijin policy, while
 * the voyages had ended by 1433, so the title stops claiming otherwise.
 */
import fs from 'node:fs';

const log = [];

for (const [year, id] of [[-550, '-550-003'], [-547, '-547-002']]) {
  for (const dir of ['public/events', 'public/en-events']) {
    const path = `${dir}/${year}.json`;
    const doc = JSON.parse(fs.readFileSync(path, 'utf8'));
    const before = doc.events.length;
    doc.events = doc.events.filter((ev) => ev.id !== id);
    if (doc.events.length === before) {
      log.push({ path, id, status: 'missing' });
      continue;
    }
    fs.writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    log.push({ path, id, status: 'deleted' });
  }
}

const retitle = (path, id, title, note) => {
  const doc = JSON.parse(fs.readFileSync(path, 'utf8'));
  const ev = doc.events.find((e) => e.id === id);
  if (!ev) {
    log.push({ path, id, status: 'missing' });
    return;
  }
  ev.title = title;
  ev.certainty_note = note;
  fs.writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  log.push({ path, id, status: 'edited', title });
};

retitle(
  'public/events/1451.json',
  '1451-003',
  '明朝海禁政策定型；宝船舰队已成往事',
  '郑和远航于1433年结束；本条为明朝海洋政策收缩的回顾性记述。',
);
retitle(
  'public/en-events/1451.json',
  '1451-003',
  'Ming maritime prohibition consolidates; the treasure fleet is history',
  'The voyages ended in 1433; this entry is a retrospective on the contraction of Ming naval policy.',
);

fs.writeFileSync('.tmp-audit/final-touches-applied.json', JSON.stringify(log, null, 2), 'utf8');
console.log(JSON.stringify(log, null, 2));
