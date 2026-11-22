/**
 * Moves two obituaries into the shard of their attested year and drops the other
 * copies that duplicate an entry which already exists in the correct shard.
 *
 * Why: the corpus re-tells the same death in several shards with a shifted year.
 * Where the correct shard already carries the event, the shifted copy is redundant;
 * where it does not (Naram-Sin, William I), the entry is moved and renumbered so the
 * information survives in the right year instead of being deleted.
 */
import fs from 'node:fs';

const rows = JSON.parse(fs.readFileSync('.tmp-audit/data-accuracy.json', 'utf8')).deathMentionMismatch ?? [];
const log = [];

const locate = (shardYear, eventId) => {
  const path = `public/events/${shardYear}.json`;
  const enPath = `public/en-events/${shardYear}.json`;
  if (!fs.existsSync(path)) return null;
  const zh = JSON.parse(fs.readFileSync(path, 'utf8'));
  const ev = (zh.events ?? []).find((e) => e.id === eventId);
  if (!ev) return null;
  let enEv = null;
  if (fs.existsSync(enPath)) {
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    enEv = { doc: en, ev: (en.events ?? []).find((e) => e.id === eventId) };
  }
  return { zh, zhPath: path, ev, en: enEv?.doc, enPath, enEv: enEv?.ev };
};

const remove = (shardYear, eventId, reason) => {
  const hit = locate(shardYear, eventId);
  if (!hit) {
    log.push({ shardYear, eventId, status: 'missing' });
    return;
  }
  hit.zh.events = hit.zh.events.filter((e) => e.id !== eventId);
  fs.writeFileSync(hit.zhPath, `${JSON.stringify(hit.zh, null, 2)}\n`, 'utf8');
  if (hit.en) {
    const before = hit.en.events.length;
    hit.en.events = hit.en.events.filter((e) => e.id !== eventId);
    if (hit.en.events.length !== before) fs.writeFileSync(hit.enPath, `${JSON.stringify(hit.en, null, 2)}\n`, 'utf8');
  }
  log.push({ shardYear, eventId, status: 'deleted', reason });
};

const move = (fromYear, eventId, toYear, reason) => {
  const hit = locate(fromYear, eventId);
  if (!hit) {
    log.push({ fromYear, eventId, status: 'missing' });
    return;
  }
  const target = `public/events/${toYear}.json`;
  const enTarget = `public/en-events/${toYear}.json`;
  const to = JSON.parse(fs.readFileSync(target, 'utf8'));
  const nextIndex = (to.events ?? []).length + 1;
  const newId = `${toYear}-${String(nextIndex).padStart(3, '0')}`;

  const movedZh = { ...hit.ev, id: newId };
  to.events.push(movedZh);
  to.events.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(target, `${JSON.stringify(to, null, 2)}\n`, 'utf8');

  hit.zh.events = hit.zh.events.filter((e) => e.id !== eventId);
  fs.writeFileSync(hit.zhPath, `${JSON.stringify(hit.zh, null, 2)}\n`, 'utf8');

  if (hit.enEv && fs.existsSync(enTarget)) {
    const enTo = JSON.parse(fs.readFileSync(enTarget, 'utf8'));
    enTo.events.push({ ...hit.enEv, id: newId });
    enTo.events.sort((a, b) => a.id.localeCompare(b.id));
    fs.writeFileSync(enTarget, `${JSON.stringify(enTo, null, 2)}\n`, 'utf8');
    hit.en.events = hit.en.events.filter((e) => e.id !== eventId);
    fs.writeFileSync(hit.enPath, `${JSON.stringify(hit.en, null, 2)}\n`, 'utf8');
  }

  log.push({ fromYear, toYear, eventId, newId, status: 'moved', reason });
};

const pick = (shardYear, name, titlePattern) => {
  const path = `public/events/${shardYear}.json`;
  if (!fs.existsSync(path)) return null;
  const doc = JSON.parse(fs.readFileSync(path, 'utf8'));
  return (doc.events ?? []).find((e) => String(e.title).includes(name) && titlePattern.test(String(e.title)))?.id ?? null;
};

const byFlag = (shardYear, personId, word) =>
  rows.find((r) => r.shardYear === shardYear && r.personId === personId && r.word === word)?.eventId ?? null;

const jobs = [
  ['move', -2240, byFlag(-2240, 'naram-sin', '死') ?? byFlag(-2240, 'naram-sin', '去世'), -2218, '纳拉姆辛卒于约前2218年，-2218 分片无对应条目'],
  ['move', 1086, byFlag(1086, 'william-i', '去世'), 1087, '征服者威廉卒于1087年9月9日，1087 分片无对应条目'],
  ['remove', -1220, byFlag(-1220, 'ramses-ii', '去世'), null, '-1213-001 已载入拉美西斯二世之死'],
  ['remove', 1196, byFlag(1196, 'saladin', '去世'), null, '1193-001 已载入萨拉丁之死'],
  ['remove', 1545, byFlag(1545, 'henry-viii', '去世'), null, '1547-001 已载入亨利八世之死'],
  ['remove', 1726, byFlag(1726, 'peter-the-great', '去世'), null, '1725-001 已载入彼得大帝之死'],
  ['remove', 810, byFlag(810, 'charlemagne', '去世'), null, '814-001 已载入查理曼之死'],
  ['remove', -476, byFlag(-476, 'confucius', '去世'), null, '-479-002 已载入孔子之死'],
  ['remove', -485, byFlag(-485, 'confucius', '去世'), null, '-479-002 已载入孔子之死'],
  ['remove', -499, byFlag(-499, 'confucius', '去世'), null, '-479-002 已载入孔子之死'],
  ['remove', -480, pick(-480, '孔子', /去世/), null, '-479-002 已载入孔子之死，-480-004 为同一事件的重复'],
];

for (const [kind, from, eventId, to, reason] of jobs) {
  if (!eventId) {
    log.push({ from, status: 'not-found', reason });
    continue;
  }
  if (kind === 'move') move(from, eventId, to, reason);
  else remove(from, eventId, reason);
}

fs.writeFileSync('.tmp-audit/shifted-obituaries-applied.json', JSON.stringify(log, null, 2), 'utf8');
console.log(JSON.stringify(log, null, 2));
