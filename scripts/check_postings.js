import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('public/people/cbdb_20260627.sqlite3', { readonly: true });

const rows = db.prepare(`
  SELECT DISTINCT po.c_personid, po.c_firstyear, po.c_lastyear, po.c_office_id,
    o.c_office_chn, pa.c_addr_id, a.c_name_chn, a.x_coord, a.y_coord
  FROM POSTED_TO_OFFICE_DATA po
  JOIN POSTED_TO_ADDR_DATA pa ON po.c_personid = pa.c_personid AND po.c_office_id = pa.c_office_id
  LEFT JOIN OFFICE_CODES o ON po.c_office_id = o.c_office_id
  LEFT JOIN ADDR_CODES a ON pa.c_addr_id = a.c_addr_id
  WHERE po.c_personid = 3767
    AND o.c_office_chn IS NOT NULL AND o.c_office_chn != ''
    AND a.x_coord IS NOT NULL
  ORDER BY po.c_firstyear
`).all();

console.log('Su Shi postings with location (' + rows.length + '):');
for (const r of rows) {
  console.log('  ' + r.c_firstyear + '-' + r.c_lastyear + ' ' +
    (r.c_office_chn || '') + ' at ' + (r.c_name_chn || '') +
    ' (' + r.x_coord + ', ' + r.y_coord + ')');
}

db.close();
