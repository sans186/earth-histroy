/**
 * Keeps the English shards aligned with the Chinese ones by event id.
 *
 * Why: repairs are made on the Chinese side, and an event removed there leaves an
 * orphan twin in public/en-events. validate:data treats "only English" as an error,
 * and the orphan still renders on the English UI, so the English side follows the
 * Chinese side. The reverse case (only Chinese) is reported, never auto-deleted,
 * because a missing translation is not evidence that the event is wrong.
 */
import fs from 'node:fs';
import path from 'node:path';

const apply = process.argv.includes('--apply');
const zhDir = path.join('public/events');
const enDir = path.join('public/en-events');
const removed = [];
const onlyZh = [];

for (const file of fs.readdirSync(zhDir)) {
  if (!file.endsWith('.json')) continue;
  const zh = JSON.parse(fs.readFileSync(path.join(zhDir, file), 'utf8'));
  const enPath = path.join(enDir, file);
  if (!fs.existsSync(enPath)) continue;
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const zhIds = new Set((zh.events ?? []).map((e) => e.id));
  const enIds = new Set((en.events ?? []).map((e) => e.id));
  for (const id of enIds) if (!zhIds.has(id)) removed.push(`${file}:${id}`);
  for (const id of zhIds) if (!enIds.has(id)) onlyZh.push(`${file}:${id}`);
  const kept = (en.events ?? []).filter((e) => zhIds.has(e.id));
  if (apply && kept.length !== (en.events ?? []).length) {
    en.events = kept;
    fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`, 'utf8');
    const remaining = (en.graph_edges ?? []).filter((edge) => kept.some((e) => e.id === edge.from || e.id === edge.to));
    if (remaining.length !== (en.graph_edges ?? []).length) {
      en.graph_edges = remaining;
      fs.writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`, 'utf8');
    }
  }
}

fs.writeFileSync('.tmp-audit/locale-sync.json', JSON.stringify({ onlyEnglish: removed, onlyChinese: onlyZh }, null, 2), 'utf8');
console.log(JSON.stringify({ apply, onlyEnglish: removed.length, onlyChinese: onlyZh.length }, null, 2));
