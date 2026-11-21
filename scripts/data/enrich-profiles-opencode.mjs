/**
 * Repair / enrich war and person profiles with an OpenAI-compatible model.
 *
 *   OPENCODE_API_KEY=... node scripts/data/enrich-profiles-opencode.mjs --task fields
 *   ... --task fix-dandong
 *   ... --task fix-mojibake
 *   ... --task era                  # no key, no network, deterministic
 *   ... --task appraisal --limit 20 # merge the three stances into one paragraph
 *   ... --task all --dry-run
 *
 * Design rules:
 *   - Fill ONLY fields that are currently empty. Never overwrite existing data.
 *   - Every generated field is recorded in docs/ai-generated-fields.json so an
 *     open-source reader can tell curated data from machine-generated data.
 *   - Idempotent: re-running skips already-filled fields.
 *   - No credential ever reaches a file, a log line, or generated JSON.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

/** `.env` is gitignored; OPENCODE_API_KEY lives only there. */
function loadEnv() {
  const file = resolve(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w_]+)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

// Imported after `.env` is read: the client resolves its endpoint and model at
// module load time.
const { chat, parseJsonLoose, MODEL } = await import('./_opencode-client.mjs');
const WARS = resolve(ROOT, 'public/wars/profiles');
const PEOPLE = resolve(ROOT, 'public/people/profiles');
const EVENTS = resolve(ROOT, 'public/events');
const LOG = resolve(ROOT, 'docs/ai-generated-fields.json');

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const TASK = valueOf('--task') || 'all';
const DRY = args.includes('--dry-run');
const LIMIT = Number(valueOf('--limit') || Number.POSITIVE_INFINITY);

const load = (p) => JSON.parse(readFileSync(p, 'utf8'));

/**
 * Windows intermittently reports EUNKNOWN/EBUSY while a scanner or sync client
 * holds the handle open. A short retry keeps one locked file from killing a
 * long batch run.
 */
function writeRetry(p, text) {
  for (let i = 0; ; i += 1) {
    try {
      writeFileSync(p, text, 'utf8');
      return;
    } catch (e) {
      if (i >= 4) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 * (i + 1));
    }
  }
}

const save = (p, v) => writeRetry(p, `${JSON.stringify(v, null, 2)}\n`);
const blank = (v) =>
  v === undefined || v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && v !== null && Object.keys(v).length === 0);
const strArray = (v, max = 6) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).slice(0, max).map((x) => x.trim()) : [];

function readLog() {
  if (!existsSync(LOG)) return { note: '由大模型生成的字段清单；这些字段未逐条人工核验', model: MODEL, wars: {}, people: {}, files: [] };
  return load(LOG);
}
function writeLog(log) {
  log.model = MODEL;
  log.updatedAt = new Date().toISOString().slice(0, 10);
  save(LOG, log);
}
const stamp = (log, group, id, fields) => {
  log[group] ??= {};
  const prev = log[group][id] ?? [];
  log[group][id] = [...new Set([...prev, ...fields])];
};

/* ── 1. War structural fields ────────────────────────────────────────────── */

const WAR_FIELDS = ['sources', 'alternativeNames', 'relatedWars', 'theaters'];

function warGaps() {
  const out = [];
  for (const f of readdirSync(WARS).filter((x) => x.endsWith('.json') && !['index.json', 'war_locations.json'].includes(x))) {
    const d = load(resolve(WARS, f));
    const need = WAR_FIELDS.filter((k) => blank(d[k]));
    if (need.length) out.push({ file: f, id: d.warId, name: d.name, nameEn: d.nameEn, startYear: d.startYear, endYear: d.endYear, summary: d.summary, need });
  }
  return out;
}

function enrichWarFields(log) {
  const gaps = warGaps().slice(0, LIMIT);
  console.log(`[fields] ${gaps.length} 场战争存在字段缺口`);
  if (DRY) { gaps.forEach((g) => console.log(`  ${g.id}: ${g.need.join(', ')}`)); return; }

  const BATCH = 5;
  for (let i = 0; i < gaps.length; i += BATCH) {
    const batch = gaps.slice(i, i + BATCH);
    const input = batch.map((g) => ({
      warId: g.id, name: g.name, nameEn: g.nameEn,
      period: `${g.startYear} ~ ${g.endYear}`, summary: g.summary,
      need: g.need,
    }));
    const system = [
      '你是世界史数据整理员，只输出严格 JSON，不解释、不加 markdown 围栏。',
      '为每场战争补齐 need 列出的字段。规则：',
      '- sources：2–4 条公认的权威史料或通史著作名（只写书名，不要编造页码、URL、ISBN、出版社）。',
      '- alternativeNames：中文通用别名数组；确无别名则 []。',
      '- relatedWars：有明确因果或延续关系的战争英文名数组；没有则 []。',
      '- theaters：主要战区的中文地名数组。',
      '- 只依据通行的、稳定的历史常识；宁缺毋滥，绝不编造具体数字、人物、条约或年份。',
      '- 不评价当代政治、不做立场判断。',
      '返回 JSON 数组，每元素形如 {"warId":"...","sources":[...],"alternativeNames":[...],"relatedWars":[...],"theaters":[...]}，只含该场 need 中的字段。',
    ].join('\n');
    const text = chat({ system, user: JSON.stringify(input), maxTokens: 2400 });
    let rows;
    try { rows = parseJsonLoose(text); } catch (e) { console.log(`  [跳过批次 ${i / BATCH + 1}] JSON 解析失败: ${e.message}`); continue; }
    if (!Array.isArray(rows)) { console.log(`  [跳过批次 ${i / BATCH + 1}] 返回不是数组`); continue; }

    let changed = 0;
    for (const row of rows) {
      const g = batch.find((x) => x.id === row?.warId);
      if (!g) continue;
      const path = resolve(WARS, g.file);
      const d = load(path);
      const filled = [];
      for (const k of g.need) {
        if (!blank(d[k])) continue;
        const v = strArray(row[k], k === 'sources' ? 5 : 6);
        if (v.length === 0) continue;
        d[k] = v;
        filled.push(k);
      }
      if (filled.length) {
        save(path, d);
        stamp(log, 'wars', g.id, filled);
        changed += 1;
        console.log(`  ${g.id}: +${filled.join(',')}`);
      }
    }
    writeLog(log);
    console.log(`  批次 ${i / BATCH + 1}/${Math.ceil(gaps.length / BATCH)} 完成，写入 ${changed} 个档案`);
  }
}

/* ── 2. Fix the misidentified Danton profile ─────────────────────────────── */

function fixDanton(log) {
  const path = resolve(PEOPLE, 'dan-dong.json');
  const d = load(path);
  if (d.nameEn === 'Georges Danton' && (d.points ?? []).length > 0) {
    console.log('[fix-dandong] 已修正，跳过');
    return;
  }
  console.log('[fix-dandong] 现有档案把「丹东」写成中国近代政治家（nameEn=Dandong），需重写');
  if (DRY) return;

  const system = '你是世界史数据整理员，只输出严格 JSON 对象，不解释、不加 markdown 围栏。';
  const user = [
    '档案 public/people/profiles/dan-dong.json 此前被错误生成：把「丹东」当成一位中国近代政治家，',
    '甚至编造了与甲午战争的关系。正确对象是法国大革命时期的乔治·雅克·丹东（Georges Danton, 1759–1794）。',
    '请按下列结构重写整份档案，中文与英文内容都要有，生平站点至少 3 个、每个都要有 [经度, 纬度] 坐标。',
    '评价保持中立、基于通行史学共识；不要政治定性、不要编造语录出处。',
    JSON.stringify({
      personId: 'dan-dong', name: '丹东', nameEn: 'Georges Danton',
      birth: 1759, death: 1794, nationality: '法国', nationalityEn: 'French',
      totalPoints: 3, era: '近世',
      points: [{ year: 1759, yearEnd: 1789, place: '奥布河畔阿尔西', placeEn: 'Arcis-sur-Aube', coords: [4.14, 48.53], title: '早年', titleEn: 'Early life', description: '……', descriptionEn: '……' }],
      evaluation: { supporter: { zh: '……', en: '……' }, critic: { zh: '……', en: '……' }, objective: { zh: '……', en: '……' } },
      quotes: { self: { zh: '……', en: '……' } },
    }, null, 2),
  ].join('\n');
  const out = parseJsonLoose(chat({ system, user, maxTokens: 4200 }));
  if (out.personId !== 'dan-dong' || !Array.isArray(out.points) || out.points.length < 2) {
    throw new Error('重写结果结构不完整，拒绝写盘');
  }
  out.name = '丹东';
  out.nameEn = 'Georges Danton';
  out.totalPoints = out.points.length;
  save(path, out);

  const idx = load(resolve(PEOPLE, 'index.json'));
  const item = idx.find((x) => x.personId === 'dan-dong');
  if (item) {
    item.nameEn = out.nameEn;
    item.birth = out.birth;
    item.death = out.death;
    item.nationality = out.nationality;
    item.nationalityEn = out.nationalityEn;
    item.totalPoints = out.totalPoints;
    item.era = out.era;
    save(resolve(PEOPLE, 'index.json'), idx);
  }
  stamp(log, 'people', 'dan-dong', ['(整份档案重写：修正实体错认)']);
  log.fixes ??= [];
  log.fixes.push({ date: log.updatedAt || new Date().toISOString().slice(0, 10), id: 'dan-dong', issue: '原档案把法国大革命的丹东误写为中国近代政治家并编造甲午战争关联', action: '按通行史实重写' });
  writeLog(log);
  console.log('  已重写 dan-dong.json 与人物索引');
}

/* ── 3. Repair U+FFFD replacement characters ─────────────────────────────── */

function fixMojibake(log) {
  const targets = [
    ...readdirSync(EVENTS).filter((f) => f.endsWith('.json')).map((f) => resolve(EVENTS, f)),
    resolve(ROOT, 'public/ne/polity_descriptions.json'),
  ];
  const jobs = [];
  for (const p of targets) {
    const s = readFileSync(p, 'utf8');
    // A single damaged Han character leaves 2–3 consecutive U+FFFD bytes.
    // Treat the whole run as ONE missing character, otherwise the model fills
    // it three times ("控制" -> "控制制制").
    const re = /\uFFFD+/g;
    let m;
    while ((m = re.exec(s))) {
      const start = m.index;
      const len = m[0].length;
      const before = s.slice(Math.max(0, start - 70), start).replace(/\uFFFD+/g, '·');
      const after = s.slice(start + len, start + len + 70).replace(/\uFFFD+/g, '·');
      jobs.push({ path: p, index: start, length: len, context: before + '⟦?⟧' + after });
    }
  }
  console.log(`[fix-mojibake] ${jobs.length} 处替换字符`);
  if (DRY) { jobs.forEach((j) => console.log(`  ${j.path.replace(ROOT, '')}: ${j.context.slice(0, 100)}`)); return; }
  if (!jobs.length) return;

  const system = '你是中文文本校对员。只输出严格 JSON 数组，不解释、不加 markdown 围栏。';
  const user = [
    '下列中文片段各含一个 ⟦?⟧ 占位符，代表原始字节损坏后丢失的一个汉字。',
    '请根据上下文推断最合理的那个汉字，只返回该汉字，不要重写片段、不要输出其它内容。',
    '返回 JSON 数组，每个元素形如 {"i":0,"char":"会"}，i 对应输入下标，char 必须是单个汉字。',
    JSON.stringify(jobs.map((j, i) => ({ i, text: j.context }))),
  ].join('\n');
  let rows;
  try { rows = parseJsonLoose(chat({ system, user, maxTokens: 1200 })); } catch (e) { console.log(`  跳过: ${e.message}`); return; }
  if (!Array.isArray(rows)) { console.log('  跳过: 返回不是数组'); return; }

  const byPath = new Map();
  for (const row of rows) {
    const j = jobs[Number(row?.i)];
    if (!j || typeof row.char !== 'string' || !/^[一-龥]$/.test(row.char)) continue;
    byPath.set(j.path, [...(byPath.get(j.path) || []), { index: j.index, length: j.length, char: row.char }]);
  }
  for (const [p, list] of byPath) {
    let s = readFileSync(p, 'utf8');
    // Replace from the end so earlier indices stay valid.
    for (const j of list.sort((a, b) => b.index - a.index)) {
      if (s[j.index] !== '\uFFFD') continue;
      s = s.slice(0, j.index) + j.char + s.slice(j.index + j.length);
    }
    JSON.parse(s); // must still be valid JSON before committing
    writeFileSync(p, s, 'utf8');
    console.log(`  修复 ${p.replace(ROOT, '')} 的 ${list.length} 处`);
    log.files ??= [];
    const rel = p.replace(ROOT, '').replace(/\\/g, '/');
    if (!log.files.includes(rel)) log.files.push(rel);
  }
  writeLog(log);
}

/* ── 4. Deterministic era field (no model needed) ─────────────────────────── */

function fillEra(log) {
  const eraOf = (b) => (b < 500 ? '古代' : b < 1500 ? '中古' : b < 1800 ? '近世' : '近现代');
  const idxPath = resolve(PEOPLE, 'index.json');
  const idx = load(idxPath);
  let n = 0;
  for (const item of idx) {
    const p = resolve(PEOPLE, `${item.personId}.json`);
    if (!existsSync(p)) continue;
    const s = readFileSync(p, 'utf8');
    if (/^\s*"era"\s*:/m.test(s)) continue; // already present
    const era = eraOf(Number(item.birth));
    if (DRY) { n += 1; continue; }
    // Insert one line instead of re-serialising: 410 profiles already have
    // hand-formatted JSON, and JSON.stringify would rewrite every blank line.
    const nl = s.includes('\r\n') ? '\r\n' : '\n';
    const m = s.match(/^(\s*)"personId"\s*:\s*"[^"]+",\s*$/m);
    if (!m) { console.log(`  [跳过] ${item.personId}: 找不到插入点`); continue; }
    const anchor = m[0].replace(/\r+$/, '');
    const next = `${anchor}${nl}${m[1]}"era": "${era}",`;
    const updated = s.replace(m[0], next);
    JSON.parse(updated); // never write invalid JSON
    writeFileSync(p, updated, 'utf8');
    n += 1;
  }
  if (!DRY) {
    save(idxPath, idx);
    log.deterministic ??= [];
    if (!log.deterministic.includes('era')) log.deterministic.push('era (按 birth 年份机械推导，非模型生成)');
    writeLog(log);
  }
  console.log(`[era] ${DRY ? '待补' : '已补'} ${n} 份档案（机械推导，不消耗模型额度）`);
}

/* ── 5. One-paragraph appraisal from the three stances ────────────────────── */

/**
 * Mirrors LIVING_PERSON_IDS in src/lib/provenance.ts: living people show life
 * facts only, so an appraisal for them would never be displayed.
 */
const LIVING_IDS = new Set([
  'noam-chomsky', 'wole-soyinka', 'jane-goodall', 'bob-dylan', 'paul-mccartney',
  'orhan-pamuk', 'vladimir-putin', 'bill-gates', 'tim-berners-lee', 'mo-yan',
  'linus-torvalds',
]);

/**
 * Chinese stance words read as the old three-panel labels and must not survive.
 * English "critics" is ordinary prose, so it is not a rejection reason.
 */
const STANCE_LABEL = /支持者|批评者|客观评价|正面评价|反面评价/;

function appraisalJobs() {
  const out = [];
  for (const f of readdirSync(PEOPLE).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
    const d = load(resolve(PEOPLE, f));
    if (LIVING_IDS.has(d.personId)) continue;
    const ev = d.evaluation;
    if (!ev?.supporter?.zh || !ev?.critic?.zh || !ev?.objective?.zh) continue;
    if (ev.appraisal?.zh && ev.appraisal?.en) continue;
    out.push({ file: f, d });
  }
  return out;
}

/**
 * Insert the new key textually: the profiles are hand-formatted, and
 * JSON.stringify would rewrite every blank line in the file.
 */
function insertAppraisal(file, value) {
  const path = resolve(PEOPLE, file);
  const s = readFileSync(path, 'utf8');
  const nl = s.includes('\r\n') ? '\r\n' : '\n';
  const m = s.match(/^([ \t]*)"evaluation"\s*:\s*\{\s*$/m);
  if (!m) return false;
  const indent = `${m[1]}  `;
  const block = [
    `${indent}"appraisal": {`,
    `${indent}  "zh": ${JSON.stringify(value.zh)},`,
    `${indent}  "en": ${JSON.stringify(value.en)}`,
    `${indent}},`,
  ].join(nl);
  const cut = m.index + m[0].length;
  const next = `${s.slice(0, cut)}${nl}${block}${s.slice(cut)}`;
  JSON.parse(next); // never write invalid JSON
  writeRetry(path, next);
  return true;
}

function fillAppraisal(log) {
  const jobs = appraisalJobs().slice(0, LIMIT);
  console.log(`[appraisal] ${jobs.length} 份档案待合成`);
  if (DRY) { jobs.forEach((j) => console.log(`  ${j.d.personId}  ${j.d.name}`)); return; }
  if (!jobs.length) return;

  const BATCH = 3;
  let written = 0;
  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH);
    const input = batch.map(({ d }) => ({
      personId: d.personId,
      name: d.name,
      nameEn: d.nameEn,
      lifespan: `${d.birth ?? '?'} ~ ${d.death ?? '?'}`,
      nationality: d.nationality,
      supporter: d.evaluation.supporter,
      critic: d.evaluation.critic,
      objective: d.evaluation.objective,
    }));
    const system = [
      '你是史学编辑，只输出严格 JSON 数组，不解释、不加 markdown 围栏。',
      '任务：把每个人物的 supporter / critic / objective 三段评价合成一段连贯的评述。',
      '规则：',
      '- 只能使用输入里已有的事实；不得新增人名、年份、数字、事件或著作，不得编造引文。',
      '- 以通行的学界判断作主干，异见落在让步句或转折句里，读起来是对一个人的整体评价。',
      '- 全文不得出现「支持者」「批评者」「客观评价」「正面评价」「反面评价」等词；英文不得出现 supporter / critic 及其复数；',
      '- 需要提到不同意见时，用「也有研究者指出」「另一种看法认为」这类说法，并把它放进让步句；不分点、不分段、不加标题。',
      '- 立场悬殊的人物（如公认的独裁者）要写出悬殊本身，不要伪装成势均力敌。',
      '- 中文 120–200 字；英文 90–150 词，不是逐字直译，但事实必须一致。',
      '返回 [{"personId":"...","zh":"...","en":"..."}]，每人一项。',
    ].join('\n');

    let rows;
    try {
      rows = parseJsonLoose(chat({ system, user: JSON.stringify(input), maxTokens: 3000, temperature: 0.3 }));
    } catch (e) { console.log(`  [跳过批次 ${i / BATCH + 1}] ${e.message}`); continue; }
    if (!Array.isArray(rows)) { console.log(`  [跳过批次 ${i / BATCH + 1}] 返回不是数组`); continue; }

    for (const { file, d } of batch) {
      const row = rows.find((r) => r?.personId === d.personId);
      const zh = String(row?.zh ?? '').replace(/\s*\n+\s*/g, '').trim();
      const en = String(row?.en ?? '').replace(/\s*\n+\s*/g, ' ').trim();
      if (!zh || !en) { console.log(`  ${d.personId}: 返回缺项，留待重跑`); continue; }
      const label = zh.match(STANCE_LABEL)?.[0] ?? en.match(STANCE_LABEL)?.[0];
      if (label) {
        console.log(`  ${d.personId}: 仍带立场标签「${label}」，留待重跑`);
        continue;
      }
      if (zh.length < 90 || zh.length > 280 || en.length < 350 || en.length > 1800) {
        console.log(`  ${d.personId}: 长度越界 (zh ${zh.length} / en ${en.length})，留待重跑`);
        continue;
      }
      if (!insertAppraisal(file, { zh, en })) {
        console.log(`  ${d.personId}: 找不到 evaluation 插入点`);
        continue;
      }
      stamp(log, 'people', d.personId, ['evaluation.appraisal']);
      written += 1;
      console.log(`  ${d.personId}: ok`);
    }
    writeLog(log);
    console.log(`  批次 ${i / BATCH + 1}/${Math.ceil(jobs.length / BATCH)}`);
  }
  console.log(`[appraisal] 本轮写入 ${written} 份`);
}

/* ── main ─────────────────────────────────────────────────────────────────── */

const log = readLog();
const tasks = TASK === 'all' ? ['fields', 'fix-dandong', 'fix-mojibake', 'era'] : [TASK];
for (const t of tasks) {
  if (t === 'fields') enrichWarFields(log);
  else if (t === 'fix-dandong') fixDanton(log);
  else if (t === 'fix-mojibake') fixMojibake(log);
  else if (t === 'era') fillEra(log);
  else if (t === 'appraisal') fillAppraisal(log);
  else throw new Error(`未知任务: ${t}`);
}
console.log(DRY ? '\n[dry-run] 未写盘' : '\n完成。生成字段清单见 docs/ai-generated-fields.json');
