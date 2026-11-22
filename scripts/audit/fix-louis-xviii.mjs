/**
 * Corrects the Louis XVIII entries: he was restored twice but never crowned.
 *
 * Why: both shards carry a title claiming a coronation and the 1814 body states
 * he was crowned at Reims on 3 May 1814. No coronation took place, so the title and
 * the sentence are replaced with the restoration and his entry into Paris.
 */
import fs from 'node:fs';

const log = [];
const edit = (path, id, mutate) => {
  const doc = JSON.parse(fs.readFileSync(path, 'utf8'));
  const ev = (doc.events ?? []).find((e) => e.id === id);
  if (!ev) {
    log.push({ path, id, status: 'missing' });
    return;
  }
  const before = { title: ev.title, description: ev.description, certainty_note: ev.certainty_note };
  mutate(ev);
  fs.writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  log.push({ path, id, status: 'edited', before, after: { title: ev.title, certainty_note: ev.certainty_note } });
};

edit('public/events/1814.json', '1814-004', (ev) => {
  ev.title = '法国波旁王朝第一次复辟；路易十八返回巴黎';
  ev.description = ev.description.replace(
    '路易十八于1814年5月3日在兰斯大教堂加冕。',
    '路易十八并未举行加冕礼，于1814年5月3日进入巴黎。',
  );
  ev.certainty_note = '路易十八两度复辟均有官方记录；他本人未举行加冕礼。';
});

edit('public/en-events/1814.json', '1814-004', (ev) => {
  ev.title = 'First Bourbon Restoration in France; Louis XVIII returns to Paris';
  ev.description = ev.description.replace(
    'Louis XVIII was crowned on May 3, 1814, at the Cathedral of Reims.',
    'Louis XVIII never held a coronation ceremony; he entered Paris on May 3, 1814.',
  );
  ev.certainty_note = 'Both restorations of Louis XVIII are documented; he was never crowned.';
});

edit('public/events/1815.json', '1815-009', (ev) => {
  ev.title = '法国波旁王朝第二次复辟；路易十八重登王位';
  ev.certainty_note = '路易十八两度复辟均有官方记录；他本人未举行加冕礼。';
});

edit('public/en-events/1815.json', '1815-009', (ev) => {
  ev.title = 'Second Bourbon Restoration in France; Louis XVIII returns to the throne';
  ev.certainty_note = 'Both restorations of Louis XVIII are documented; he was never crowned.';
});

fs.writeFileSync('.tmp-audit/louis-xviii-applied.json', JSON.stringify(log, null, 2), 'utf8');
console.log(JSON.stringify(log.map((r) => ({ id: r.id, status: r.status, title: r.after?.title })), null, 2));
