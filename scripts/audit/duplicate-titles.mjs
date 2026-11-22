/**
 * Finds the same event title repeated across different years.
 *
 * Why: the corpus is generated year by year, so one lifetime event (a death, a
 * birth, an enthronement) can be re-emitted in several unrelated years. A name
 * only appears once in reality, so a repeated death title is a strong mechanical
 * signal that at most one of the copies is right.
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'public/events');
const norm = (s) => String(s ?? '').replace(/[\s，。、；：！？""''（）()·—-]/g, '');
const lifeWord = /(去世|驾崩|逝世|病逝|死亡|出生|诞生|即位|登基|称帝|加冕)/;

const index = new Map();
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.json')) continue;
  const doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const year = doc.year;
  for (const ev of doc.events ?? []) {
    const key = norm(ev.title);
    if (!key) continue;
    if (!index.has(key)) index.set(key, { title: ev.title, years: [], ids: [] });
    const hit = index.get(key);
    hit.years.push(year);
    hit.ids.push(ev.id);
  }
}

const repeated = [];
for (const [, hit] of index) {
  const uniqueYears = [...new Set(hit.years)];
  if (uniqueYears.length < 2) continue;
  repeated.push({
    title: hit.title,
    count: uniqueYears.length,
    years: uniqueYears.sort((a, b) => a - b),
    ids: hit.ids,
    life: lifeWord.test(hit.title),
  });
}
repeated.sort((a, b) => b.count - a.count);

const life = repeated.filter((r) => r.life);
fs.writeFileSync('.tmp-audit/duplicate-titles.json', JSON.stringify({ total: repeated.length, lifeRepeats: life.length, repeated }, null, 2), 'utf8');
console.log(JSON.stringify({ totalRepeatedTitles: repeated.length, lifeRepeats: life.length }, null, 2));
console.log(life.slice(0, 12).map((r) => `${r.count}x ${r.title} @ ${r.years.join(',')}`).join('\n'));
