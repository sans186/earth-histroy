/**
 * Build trajectory JSON files from CBDB SQLite database.
 *
 * Processes ALL persons in CBDB who have ≥2 geo-tagged address records,
 * extracting trajectory points from BIOG_ADDR_DATA, joining with ADDR_CODES
 * for coordinates, and outputting clean JSON files to public/trajectories/.
 *
 * Usage:  node scripts/build-trajectories.js
 */

import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(__dirname, '../public/people/cbdb_20260627.sqlite3');
const OUT_DIR = resolve(__dirname, '../public/trajectories');

// ── Address type labels ──
const ADDR_TYPE_LABELS = {
  [-1]: { zh: '未详', en: 'Unknown' },
  0: { zh: '未详', en: 'Unknown' },
  1: { zh: '籍贯', en: 'Ancestral' },
  2: { zh: '徙居', en: 'Moved To' },
  3: { zh: '居所', en: 'Residence' },
  4: { zh: '最后所知', en: 'Last Known' },
  5: { zh: '祖籍', en: 'Ancestral' },
  6: { zh: '实际居住', en: 'Residence' },
  7: { zh: '户籍', en: 'Household Reg.' },
  8: { zh: '出生', en: 'Birth' },
  9: { zh: '葬地', en: 'Burial' },
  10: { zh: '逝世', en: 'Death' },
  11: { zh: '宗族迁徙', en: 'Clan Migration' },
  12: { zh: '游历', en: 'Journey' },
  13: { zh: '八旗', en: 'Eight Banner' },
  14: { zh: '其他籍贯', en: 'Alt. Ancestral' },
  15: { zh: '避难', en: 'Refuge' },
  17: { zh: '流放', en: 'Exile' },
  18: { zh: '定居', en: 'Settled' },
  19: { zh: '寓居', en: 'Sojourn' },
};

function addrTypeLabel(code) {
  return ADDR_TYPE_LABELS[code] || { zh: `类型${code}`, en: `Type ${code}` };
}

/** Generate a short narrative intro for a trajectory point. */
function genIntro(type, typeEn, place, office) {
  const T = {
    '出生': (p) => [`出生于${p}`, `Born in ${p}`],
    '逝世': (p, o) => o ? [`在${p}逝世，时任${o}`, `Died in ${p} as ${o}`] : [`在${p}逝世`, `Died in ${p}`],
    '葬地': (p) => [`安葬于${p}`, `Buried in ${p}`],
    '流放': (p, o) => o ? [`被流放至${p}，任${o}`, `Exiled to ${p}, serving as ${o}`] : [`被流放至${p}`, `Exiled to ${p}`],
    '游历': (p, o) => o ? [`游历至${p}时，任${o}`, `Traveled to ${p}, serving as ${o}`] : [`游历至${p}`, `Traveled to ${p}`],
    '避难': (p) => [`避难至${p}`, `Took refuge in ${p}`],
    '徙居': (p) => [`迁居至${p}`, `Moved to ${p}`],
    '定居': (p) => [`定居于${p}`, `Settled in ${p}`],
  };
  const tmpl = T[type];
  if (tmpl) return tmpl(place, office);
  if (office) return [`在${place}担任${office}`, `At ${place}, serving as ${office}`];
  return [`${type}：${place}`, `${typeEn}: ${place}`];
}

// ── Main ──
function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`CBDB not found at ${DB_PATH}`);
    process.exit(1);
  }

  const db = new DatabaseSync(DB_PATH, { readonly: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // Preload dynasties
  const dynastyMap = new Map();
  for (const r of db.prepare('SELECT c_dy, c_dynasty_chn, c_dynasty FROM DYNASTIES').all()) {
    dynastyMap.set(r.c_dy, { zh: r.c_dynasty_chn, en: r.c_dynasty || r.c_dynasty_chn });
  }

  // Prepared statements
  const stmtPerson = db.prepare(
    'SELECT c_personid, c_name_chn, c_name, c_birthyear, c_deathyear, c_dy FROM BIOG_MAIN WHERE c_personid = ?'
  );
  const stmtPoints = db.prepare(`
    SELECT b.c_addr_type, b.c_firstyear, b.c_lastyear,
           a.c_addr_id, a.c_name_chn, a.x_coord, a.y_coord
    FROM BIOG_ADDR_DATA b
    JOIN ADDR_CODES a ON b.c_addr_id = a.c_addr_id
    WHERE b.c_personid = ?
      AND a.x_coord IS NOT NULL AND a.y_coord IS NOT NULL
      AND b.c_addr_type NOT IN (0, -1, 1, 5, 11, 13, 14)
    ORDER BY
      CASE WHEN b.c_firstyear IS NULL OR b.c_firstyear = 0 THEN 1 ELSE 0 END,
      b.c_firstyear,
      b.c_addr_type
  `);
  const stmtPostings = db.prepare(`
    SELECT DISTINCT po.c_firstyear, po.c_lastyear, o.c_office_chn
    FROM POSTED_TO_OFFICE_DATA po
    LEFT JOIN OFFICE_CODES o ON po.c_office_id = o.c_office_id
    WHERE po.c_personid = ? AND o.c_office_chn IS NOT NULL AND o.c_office_chn != ''
    ORDER BY po.c_firstyear
  `);

  // Find all persons with ≥2 valid geo points in a single query
  console.log('Finding qualifying persons...');
  const qualIds = db.prepare(`
    SELECT b.c_personid
    FROM BIOG_ADDR_DATA b
    JOIN ADDR_CODES a ON b.c_addr_id = a.c_addr_id
    WHERE a.x_coord IS NOT NULL AND a.y_coord IS NOT NULL
      AND b.c_addr_type NOT IN (0, -1, 1, 5, 11, 13, 14)
    GROUP BY b.c_personid
    HAVING COUNT(*) >= 2
    ORDER BY MAX(b.c_firstyear)
  `).all();

  console.log(`Found ${qualIds.length} persons with ≥2 valid geo points\n`);
  let total = 0;
  let skipped = 0;

  for (const { c_personid: pid } of qualIds) {
    const person = stmtPerson.get(pid);
    if (!person) continue;

    const name = person.c_name_chn || `Person_${pid}`;
    const nameEn = person.c_name || '';

    const dynasty = dynastyMap.get(person.c_dy) || { zh: '', en: '' };

    // Get trajectory points
    const rows = stmtPoints.all(pid);
    if (rows.length < 2) { skipped++; continue; }

    // Deduplicate
    const points = [];
    const seen = new Set();
    for (const r of rows) {
      const key = `${r.c_firstyear || 0}|${r.x_coord},${r.y_coord}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const t = addrTypeLabel(r.c_addr_type);
      const [intro, introEn] = genIntro(t.zh, t.en, r.c_name_chn, null);
      points.push({
        year: r.c_firstyear || null,
        yearEnd: r.c_lastyear || null,
        place: r.c_name_chn,
        coords: [r.x_coord, r.y_coord],
        type: t.zh,
        typeEn: t.en,
        intro, introEn,
      });
    }

    // Merge adjacent same-location
    const merged = [];
    for (const p of points) {
      const last = merged[merged.length - 1];
      if (last && last.place === p.place && last.coords[0] === p.coords[0] && last.coords[1] === p.coords[1]) {
        if (p.yearEnd && (!last.yearEnd || p.yearEnd > last.yearEnd)) last.yearEnd = p.yearEnd;
        if (p.type === '出生' || p.type === '逝世' || p.type === '葬地') { last.type = p.type; last.typeEn = p.typeEn; }
        continue;
      }
      merged.push({ ...p });
    }

    // Office enrichment
    const postings = stmtPostings.all(pid);
    if (postings.length > 0) {
      for (const pt of merged) {
        if (!pt.year) continue;
        const active = postings
          .filter(p => p.c_firstyear && pt.year && Math.abs(p.c_firstyear - pt.year) <= 2)
          .map(p => p.c_office_chn);
        if (active.length > 0) {
          pt.office = [...new Set(active)].join('、');
          [pt.intro, pt.introEn] = genIntro(pt.type, pt.typeEn, pt.place, pt.office);
        }
      }
    }

    const output = {
      personId: person.c_personid,
      name,
      nameEn,
      birth: person.c_birthyear || null,
      death: person.c_deathyear || null,
      dynasty: dynasty.zh,
      dynastyEn: dynasty.en,
      totalPoints: merged.length,
      points: merged,
    };

    writeFileSync(resolve(OUT_DIR, `${person.c_personid}.json`), JSON.stringify(output, null, 2), 'utf-8');
    total++;
    if (total % 500 === 0) console.log(`  ... ${total}/${qualIds.length} processed`);
  }

  // Generate index from all successfully built files
  console.log('\nGenerating index...');
  const files = readdirSync(OUT_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
  const index = [];
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(resolve(OUT_DIR, f), 'utf-8'));
      if (data.totalPoints < 2) {
        unlinkSync(resolve(OUT_DIR, f));
        continue;
      }
      index.push({
        personId: data.personId,
        name: data.name,
        nameEn: data.nameEn,
        birth: data.birth,
        death: data.death,
        dynasty: data.dynasty,
        totalPoints: data.totalPoints,
      });
    } catch { /* skip corrupted */ }
  }

  index.sort((a, b) => (a.birth || 0) - (b.birth || 0));

  const indexPath = resolve(OUT_DIR, 'index.json');
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`\n[Done] ${total} persons → index (${index.length}) at ${indexPath}`);
  console.log(`Skipped ${skipped} persons (changed to <2 valid points after merge/dedup)`);

  db.close();
}

main();
