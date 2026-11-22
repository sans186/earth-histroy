/**
 * Finds cross-references that point at event ids removed from the cleared shards.
 *
 * Why: graph_edges and cross_references inside neighbouring years still name the
 * dropped BCE ids (311-001 etc). A dangling id renders as a dead link in the card,
 * so the count decides whether this needs a repair pass.
 */
import fs from 'node:fs';
import path from 'node:path';

const applied = JSON.parse(fs.readFileSync('.tmp-audit/shard-mislabel-applied.json', 'utf8'));
const gone = new Set();
for (const c of applied.changes) for (const id of c.removedIds) gone.add(id);

const dir = path.join(process.cwd(), 'public/events');
const dangling = [];
let totalRefs = 0;

for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.json')) continue;
  const doc = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  for (const ev of doc.events ?? []) {
    for (const ref of ev.cross_references ?? []) {
      totalRefs += 1;
      const id = String(ref).match(/^-?\d+-\d+/)?.[0];
      if (id && gone.has(id)) dangling.push({ file, eventId: ev.id, ref });
    }
  }
  for (const edge of doc.graph_edges ?? []) {
    for (const id of [edge.from, edge.to]) {
      if (id && gone.has(id)) dangling.push({ file, edge: `${edge.from}->${edge.to}` });
    }
  }
}

fs.writeFileSync('.tmp-audit/dangling-refs.json', JSON.stringify({ totalRefs, dangling }, null, 2), 'utf8');
console.log(JSON.stringify({ totalRefs, dangling: dangling.length, sample: dangling.slice(0, 8) }, null, 2));
