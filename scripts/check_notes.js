import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('public/people/cbdb_20260627.sqlite3', { readonly: true });

const pid = 3767; // Su Shi

// BIOG_ADDR_DATA notes
const rows = db.prepare(`SELECT c_addr_type, c_firstyear, c_notes FROM BIOG_ADDR_DATA WHERE c_personid = ? AND c_notes IS NOT NULL AND c_notes != '' ORDER BY c_firstyear`).all(pid);
console.log('=== BIOG_ADDR_DATA with notes ===');
for (const r of rows) {
  console.log(`  type=${r.c_addr_type} year=${r.c_firstyear}: ${(r.c_notes || '').substring(0, 120)}`);
}
console.log('  (total:', rows.length, ')');

// EVENTS_DATA
const evts = db.prepare(`SELECT c_year, c_event, c_notes FROM EVENTS_DATA WHERE c_personid = ? ORDER BY c_year`).all(pid);
console.log('\n=== EVENTS_DATA ===');
console.log('  count:', evts.length);
for (const r of evts) {
  console.log(`  year=${r.c_year}: ${(r.c_event || r.c_notes || '').substring(0, 150)}`);
}

// Check if BIOG_TEXT_DATA exists for this person
try {
  const txt = db.prepare(`SELECT c_text FROM BIOG_TEXT_DATA WHERE c_personid = ? LIMIT 1`).get(pid);
  console.log('\n=== BIOG_TEXT_DATA ===');
  console.log('  has text:', !!txt);
  if (txt) console.log('  text:', (txt.c_text || '').substring(0, 200));
} catch(e) { console.log('\nBIOG_TEXT_DATA: error', e.message); }

// Check OFFICE_CODES for posting descriptions
const posts = db.prepare(`
  SELECT po.c_office_id, po.c_firstyear, po.c_lastyear, po.c_notes, o.c_office_desc_chn, o.c_office_type
  FROM POSTED_TO_OFFICE_DATA po
  LEFT JOIN OFFICE_CODES o ON po.c_office_id = o.c_office_id
  WHERE po.c_personid = ?
  ORDER BY po.c_firstyear
  LIMIT 10
`).all(pid);
console.log('\n=== Office postings with descriptions ===');
for (const r of posts) {
  console.log(`  office=${r.c_office_id} ${r.c_office_desc_chn || ''} (${r.c_office_type || ''}) years=${r.c_firstyear}-${r.c_lastyear} notes=${(r.c_notes || '').substring(0, 80)}`);
}

// Check BIOG_SOURCE_DATA for biographical texts
try {
  const src = db.prepare(`SELECT * FROM BIOG_SOURCE_DATA WHERE c_personid = ? LIMIT 3`).all(pid);
  console.log('\n=== BIOG_SOURCE_DATA ===');
  console.log('  count:', src.length);
} catch(e) { console.log('BIOG_SOURCE_DATA error:', e.message); }

db.close();
