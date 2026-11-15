#!/usr/bin/env node
/**
 * Fill the gaps the inventory (`report-assets.mjs`) reports, using Zhipu's
 * chat API.
 *
 *   node scripts/data/enrich-zhipu.mjs --task=war-sources
 *   node scripts/data/enrich-zhipu.mjs --task=event-coords --limit=200
 *   node scripts/data/enrich-zhipu.mjs --task=people --limit=12
 *
 * Every task is additive and idempotent: existing values are never overwritten,
 * and a run can be interrupted and restarted. Nothing is written unless the
 * model's answer survives validation, and `--dry-run` prints the plan only.
 *
 * The output is model-generated, which the UI already discloses in its AI
 * notice; this script does not invent provenance.
 */

import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = (...parts) => join(ROOT, ...parts);

const API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const task = args.get('task');
const limit = Number(args.get('limit') ?? 0) || Infinity;
const dryRun = args.get('dry-run') === 'true';
const concurrency = Math.max(1, Number(args.get('concurrency') ?? 3) || 3);
/** Long-form overviews need a model that actually writes them; flash is terse. */
const MODEL = args.get('model') ?? 'glm-4-flash';

/* ── plumbing ───────────────────────────────────────────────────────────── */

function loadKeys() {
  const text = readFileSync(P('.env'), 'utf8');
  const keys = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^ZHIPU_API_KEY_\d+\s*=\s*(\S+)/);
    if (m) keys.push(m[1].trim());
  }
  if (!keys.length) throw new Error('ZHIPU_API_KEY_n missing from .env');
  return keys;
}

const keys = loadKeys();
let keyCursor = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function chat(messages, { temperature = 0.2, retries = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const key = keys[keyCursor % keys.length];
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: MODEL, messages, temperature, max_tokens: 2048 }),
      });
      if (res.status === 429) {
        // Quota is per key: rotate before retrying.
        keyCursor += 1;
        lastError = new Error('429 rate limited');
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        lastError = new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
        await sleep(800 * (attempt + 1));
        continue;
      }
      const json = await res.json();
      return json.choices?.[0]?.message?.content ?? '';
    } catch (err) {
      lastError = err;
      await sleep(800 * (attempt + 1));
    }
  }
  throw lastError ?? new Error('request failed');
}

/** Models wrap JSON in prose or fences often enough to make this necessary. */
function parseJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) throw new Error(`no JSON in reply: ${cleaned.slice(0, 120)}`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error(`unbalanced JSON: ${cleaned.slice(0, 120)}`);
}

/** Reads a file, remembers its line endings, writes it back in the same shape. */
function readDoc(file) {
  const text = readFileSync(file, 'utf8');
  return {
    data: JSON.parse(text),
    eol: text.includes('\r\n') ? '\r\n' : '\n',
    trailingNewline: /\n$/.test(text),
    file,
  };
}

function writeDoc(doc) {
  const body = JSON.stringify(doc.data, null, 2).replace(/\n/g, doc.eol);
  const tmp = `${doc.file}.tmp`;
  writeFileSync(tmp, doc.trailingNewline ? body + doc.eol : body, 'utf8');
  renameSync(tmp, doc.file);
}

async function pool(items, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const at = index;
      index += 1;
      await worker(items[at], at);
    }
  });
  await Promise.all(runners);
}

const num = (n) => n.toLocaleString('en-US');

/* ── task: battle coordinates ───────────────────────────────────────────── */

/**
 * Fills `coords` on battles that have none.
 *
 * Deliberately not a bibliography task: the model writes plausible-looking
 * titles that do not exist, and nothing here can check them (no reachable
 * reference API), so inventing sources would poison the dataset. A battle's
 * own location is knowledge the model is much better at, and a wrong one is a
 * visible marker rather than a fake citation.
 */
async function battleCoords() {
  const dir = P('public/wars/profiles');
  const index = readDoc(join(dir, 'index.json')).data;
  const todo = [];

  for (const entry of index) {
    const doc = readDoc(join(dir, `${entry.warId}.json`));
    const battles = [];
    for (const phase of doc.data.warProcess?.phases ?? []) {
      for (const battle of phase.battles ?? []) {
        const ok =
          Array.isArray(battle.coords) &&
          battle.coords.length === 2 &&
          Number.isFinite(battle.coords[0]);
        if (!ok) battles.push(battle);
      }
    }
    if (battles.length) todo.push({ doc, battles });
  }

  const total = todo.reduce((n, item) => n + item.battles.length, 0);
  console.log(`battle coords: ${num(total)} missing across ${num(todo.length)} wars`);

  let budget = limit;
  let written = 0;

  for (const { doc, battles } of todo) {
    if (budget <= 0) break;
    const slice = battles.slice(0, Math.min(10, budget));
    budget -= slice.length;
    const war = doc.data;

    const lines = slice.map(
      (battle, i) =>
        `${i + 1}. id=${battle.battleId ?? battle.name} | ${battle.name} | ${battle.startYear ?? '?'}-${battle.endYear ?? '?'} | ${(battle.context ?? '').slice(0, 60)}`,
    );
    const prompt = [
      '你是历史地理助手。给出下列战役主战场的大致经纬度（现代地理坐标即可）。',
      '格式 "纬度, 经度"：纬度在前，北纬/东经为正，南纬/西经为负。',
      '只写你确实知道位置的战役；不确定就返回 null，不要猜。',
      '',
      `所属战争：${war.name}（${war.nameEn ?? ''}）`,
      ...lines,
      '',
      '只输出 JSON，坐标写成字符串 "纬度, 经度"（纬度在前）：{"coords":{"<id>":"lat, lon"}}',
      '无法确定时该条返回 null。',
    ].join('\n');

    try {
      const reply = await chat([{ role: 'user', content: prompt }]);
      const parsed = parseJson(reply);
      const map = parsed.coords ?? {};
      let touched = 0;

      for (const battle of slice) {
        const id = battle.battleId ?? battle.name;
        const raw = map[id];
        if (raw == null) continue;
        // Only the "lat, lon" string form is accepted: an array invites the
        // model to answer [lon, lat], which silently puts markers in the ocean.
        if (Array.isArray(raw)) continue;
        const m = COORD_RE.exec(String(raw));
        if (!m) continue;
        const lat = Number(m[1]);
        const lon = Number(m[2]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
        battle.coords = [Number(lon.toFixed(2)), Number(lat.toFixed(2))];
        if (dryRun) console.log(`    ${battle.name}: ${battle.coords.join(', ')}`);
        touched += 1;
      }

      if (touched) {
        console.log(`  + ${war.name}: ${touched}/${slice.length}`);
        if (!dryRun) {
          writeDoc(doc);
          written += touched;
        }
      }
    } catch (err) {
      console.warn(`  ! ${war.name}: ${err.message}`);
    }
  }

  console.log(`battle coords: filled ${num(written)}`);
}

/* ── task: event coordinates ────────────────────────────────────────────── */

const COORD_RE = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/;

function hasCoords(value) {
  if (value == null) return false;
  const m = COORD_RE.exec(String(value));
  if (!m) return false;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

async function eventCoords() {
  const dir = P('public/events');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const pending = [];

  for (const file of files) {
    const doc = readDoc(join(dir, file));
    const missing = (doc.data.events ?? []).filter((e) => !hasCoords(e.coordinates_approx));
    if (missing.length) pending.push({ doc, missing });
  }

  const total = pending.reduce((n, p) => n + p.missing.length, 0);
  console.log(`event coords: ${num(total)} missing across ${num(pending.length)} year files`);

  let budget = limit;
  let written = 0;

  for (const { doc, missing } of pending) {
    if (budget <= 0) break;
    const slice = missing.slice(0, Math.min(12, budget));
    budget -= slice.length;

    const lines = slice.map(
      (e, i) =>
        `${i + 1}. id=${e.id} | 标题=${(e.title ?? '').slice(0, 60)} | 地域=${(e.region ?? '').slice(0, 40)} | 描述=${(e.description ?? '').slice(0, 80)}`,
    );
    const prompt = [
      '你是历史地理助手。为下列历史事件给出最合适的地点的经纬度（近似即可，取事件主要发生地）。',
      '坐标格式为 "纬度, 经度"，纬度在前，东经/北纬为正，西经/南纬为负。',
      '若事件确实没有地理落点（例如纯思想史、制度史），该条返回 null。',
      '',
      ...lines,
      '',
      '只输出 JSON：{"coords":{"<id>":"lat, lon", "<id>":null}}',
    ].join('\n');

    try {
      const reply = await chat([{ role: 'user', content: prompt }]);
      const parsed = parseJson(reply);
      const map = parsed.coords ?? {};
      let touched = 0;

      for (const event of slice) {
        const raw = map[event.id];
        if (raw == null) continue;
        const m = COORD_RE.exec(String(raw));
        if (!m) continue;
        const lat = Number(m[1]);
        const lon = Number(m[2]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
        event.coordinates_approx = `${lat.toFixed(1)}, ${lon.toFixed(1)}`;
        touched += 1;
      }

      if (touched) {
        console.log(`  + ${doc.file.split(/[\\/]/).pop()}: ${touched}/${slice.length}`);
        if (!dryRun) {
          writeDoc(doc);
          written += touched;
        }
      }
    } catch (err) {
      console.warn(`  ! ${doc.file.split(/[\\/]/).pop()}: ${err.message}`);
    }
  }

  console.log(`event coords: filled ${num(written)}`);
}

/* ── task: people profiles ──────────────────────────────────────────────── */

function normalizeFigure(raw) {
  return String(raw)
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[·・]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function eraOf(birth) {
  if (!Number.isFinite(birth)) return '未知';
  if (birth < 500) return '古代';
  if (birth < 1500) return '中世纪';
  if (birth < 1800) return '近代早期';
  if (birth < 1900) return '19世纪';
  return '20世纪';
}

function slugify(nameEn, fallback) {
  const slug = String(nameEn ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `figure-${fallback}`;
}

/** Case/punctuation-insensitive key, so 纳拉姆辛 and 纳拉姆-辛 count as one. */
function keyOf(raw) {
  return normalizeFigure(raw).replace(/[-\s]/g, '');
}

/** The most-mentioned figures that have no profile yet. */
function missingFigures(peopleIndex) {
  const known = new Set();
  for (const person of peopleIndex) {
    known.add(keyOf(person.name ?? ''));
    known.add(keyOf(person.nameEn ?? ''));
  }

  const counts = new Map();
  const samples = new Map();
  const dir = P('public/events');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    for (const event of doc.events ?? []) {
      for (const figure of event.key_figures ?? []) {
        const key = keyOf(figure);
        if (!key || known.has(key)) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (!samples.has(key)) samples.set(key, { raw: String(figure), event: event.title ?? '' });
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count, ...samples.get(key) }));
}

const PROFILE_PROMPT = `你是历史人物资料编辑。为给定人物输出结构化档案，全部字段用简体中文与英文双语。
要求：
- birth/death 为整数年份，公元前用负数；君主生年不可考时用在位起止年并保持约值。
- points 必须是 3 个生平阶段，按时间先后，覆盖早期/鼎盛/晚年；coords 是 [经度, 纬度]。
- 每段 description 约 80-120 个汉字，descriptionEn 为其英文对应，信息量一致。
- evaluation 分 supporter（正面评价）、critic（批评）、objective（中性史学定位）三段，各 60-90 字，均有中英。
- quotes.self 是本人名言（确实无可靠名言时给最广为流传的一句并保持简短）；quotes.others 是他人对其评价。
- othersBy/othersByEn 是 quotes.others 的出处人物。
- 不确定的内容宁可写得保守，不要编造具体数字。
只输出 JSON，结构如下：
{"name":"","nameEn":"","birth":-100,"death":-44,"nationality":"","nationalityEn":"",
 "points":[{"year":-100,"yearEnd":-80,"place":"","placeEn":"","coords":[12.5,41.9],"title":"","titleEn":"","description":"","descriptionEn":""}],
 "evaluation":{"supporter":{"zh":"","en":""},"critic":{"zh":"","en":""},"objective":{"zh":"","en":""}},
 "quotes":{"self":{"zh":"","en":""},"others":{"zh":"","en":""}},
 "othersBy":"","othersByEn":""}`;

function validateProfile(raw, fallbackName) {
  const name = String(raw?.name ?? '').trim();
  const nameEn = String(raw?.nameEn ?? '').trim();
  if (!name || !nameEn) throw new Error('missing name');

  const birth = Number(raw.birth);
  const death = Number(raw.death);
  if (!Number.isFinite(birth)) throw new Error('missing birth');

  const points = (Array.isArray(raw.points) ? raw.points : [])
    .map((point) => ({
      year: Math.round(Number(point.year)),
      yearEnd: Math.round(Number(point.yearEnd ?? point.year)),
      place: String(point.place ?? '').trim(),
      placeEn: String(point.placeEn ?? '').trim(),
      coords: Array.isArray(point.coords) && point.coords.length === 2
        ? [Number(point.coords[0]), Number(point.coords[1])]
        : null,
      title: String(point.title ?? '').trim(),
      titleEn: String(point.titleEn ?? '').trim(),
      description: String(point.description ?? '').trim(),
      descriptionEn: String(point.descriptionEn ?? '').trim(),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.year) &&
        point.title &&
        point.description.length >= 20 &&
        point.coords &&
        Number.isFinite(point.coords[0]) &&
        Number.isFinite(point.coords[1]) &&
        Math.abs(point.coords[0]) <= 180 &&
        Math.abs(point.coords[1]) <= 90,
    );

  if (points.length < 3) throw new Error(`only ${points.length} usable points`);

  const bilingual = (value) => ({
    zh: String(value?.zh ?? '').trim(),
    en: String(value?.en ?? '').trim(),
  });
  const evaluation = {
    supporter: bilingual(raw.evaluation?.supporter),
    critic: bilingual(raw.evaluation?.critic),
    objective: bilingual(raw.evaluation?.objective),
  };
  for (const key of ['supporter', 'critic', 'objective']) {
    if (evaluation[key].zh.length < 10) throw new Error(`weak evaluation.${key}`);
  }

  return {
    name: name || fallbackName,
    nameEn,
    birth,
    death: Number.isFinite(death) ? death : birth + 60,
    nationality: String(raw.nationality ?? '').trim(),
    nationalityEn: String(raw.nationalityEn ?? '').trim(),
    points,
    evaluation,
    quotes: {
      self: bilingual(raw.quotes?.self),
      others: bilingual(raw.quotes?.others),
    },
    othersBy: String(raw.othersBy ?? '').trim(),
    othersByEn: String(raw.othersByEn ?? '').trim(),
  };
}

async function people(limitCount) {
  const dir = P('public/people/profiles');
  const indexDoc = readDoc(join(dir, 'index.json'));
  const only = (args.get('only') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let candidates = missingFigures(indexDoc.data);
  if (only.length) {
    candidates = candidates.filter((figure) => only.some((needle) => figure.raw.includes(needle)));
  }
  const missing = candidates.slice(0, limitCount);
  console.log(`people: ${num(candidates.length)} candidates, handling ${num(missing.length)}`);

  const seen = new Set(indexDoc.data.map((p) => keyOf(p.name ?? '')));
  let created = 0;
  for (const figure of missing) {
    if (seen.has(figure.key)) {
      console.log(`  = skip ${figure.raw}: already covered`);
      continue;
    }
    const prompt = `${PROFILE_PROMPT}\n\n人物：${figure.raw}\n相关事件：${figure.event}\n被提及 ${figure.count} 次。`;
    try {
      const reply = await chat([{ role: 'user', content: prompt }], { temperature: 0.35 });
      const profile = validateProfile(parseJson(reply), figure.key);

      const personId = slugify(profile.nameEn, figure.key.replace(/[^a-z0-9]+/g, '-'));
      if (indexDoc.data.some((p) => p.personId === personId)) throw new Error('duplicate id');
      if (seen.has(keyOf(profile.name)) || seen.has(keyOf(profile.nameEn))) {
        throw new Error('duplicate person');
      }

      const entry = {
        personId,
        name: profile.name,
        nameEn: profile.nameEn,
        birth: profile.birth,
        death: profile.death,
        nationality: profile.nationality,
        nationalityEn: profile.nationalityEn,
        totalPoints: profile.points.length,
        era: eraOf(profile.birth),
      };

      console.log(`  + ${profile.name} (${figure.count} mentions, ${profile.points.length} points)`);
      if (dryRun) {
        console.log(`    ${profile.birth}~${profile.death} | ${profile.points[0].title}`);
        console.log(`    ${profile.points[0].description.slice(0, 80)}`);
        continue;
      }

      writeDoc({
        data: { ...entry, points: profile.points, evaluation: profile.evaluation, quotes: profile.quotes, othersBy: profile.othersBy, othersByEn: profile.othersByEn },
        eol: '\n',
        trailingNewline: false,
        file: join(dir, `${personId}.json`),
      });
      indexDoc.data.push(entry);
      seen.add(keyOf(entry.name));
      seen.add(keyOf(entry.nameEn));
      created += 1;
    } catch (err) {
      console.warn(`  ! ${figure.raw}: ${err.message}`);
    }
  }

  if (created && !dryRun) {
    indexDoc.data.sort((a, b) => (a.birth ?? 0) - (b.birth ?? 0) || a.name.localeCompare(b.name, 'zh'));
    writeDoc(indexDoc);
  }
  console.log(`people: created ${num(created)} profiles`);
}

/* ── task: translate english-only events ────────────────────────────────── */

/**
 * Fills the Chinese tree for entries that only exist in English.
 *
 * Translation is a rewrite, not a factual claim: the source text already
 * exists and the job is to carry it across, so the hallucination risk that
 * made the bibliography task unusable does not apply here. Structure is copied
 * verbatim and validated against the source, so a bad answer is rejected
 * rather than written.
 */
function validateTranslation(raw, source) {
  if (!raw || typeof raw !== 'object') throw new Error('not an object');
  if (String(raw.id) !== String(source.id)) throw new Error('id mismatch');
  if (!raw.title || !raw.description) throw new Error('missing title/description');
  if (String(raw.description).length < 60) throw new Error('description too short');
  if (!Array.isArray(raw.sources) || raw.sources.length !== (source.sources ?? []).length) {
    throw new Error('source count mismatch');
  }

  return {
    id: source.id,
    title: String(raw.title).trim(),
    region: String(raw.region ?? source.region ?? '').trim(),
    coordinates_approx: source.coordinates_approx ?? null,
    category: source.category,
    description: String(raw.description).trim(),
    key_figures: (Array.isArray(raw.key_figures) ? raw.key_figures : [])
      .map((v) => String(v).trim())
      .filter(Boolean),
    sources: (source.sources ?? []).map((src, i) => ({
      name: String(raw.sources[i]?.name ?? '').trim(),
      type: src.type,
      contemporary: src.contemporary,
    })),
    certainty: source.certainty,
    certainty_note: String(raw.certainty_note ?? '').trim(),
    cross_references: Array.isArray(source.cross_references)
      ? source.cross_references
      : [],
  };
}

async function translateEvents() {
  const zhDir = P('public/events');
  const enDir = P('public/en-events');
  const docs = new Map();
  const todo = [];

  for (const file of readdirSync(enDir).filter((f) => f.endsWith('.json'))) {
    const zhDoc = readDoc(join(zhDir, file));
    const enDoc = readDoc(join(enDir, file));
    if (!zhDoc || !enDoc) continue;
    const zhIds = new Set((zhDoc.data.events ?? []).map((e) => String(e.id)));
    for (const ev of enDoc.data.events ?? []) {
      if (!zhIds.has(String(ev.id))) todo.push({ file, ev });
    }
    docs.set(file, zhDoc);
  }

  const batch = todo.slice(0, limit);
  console.log(`translate: ${num(todo.length)} english-only entries, handling ${num(batch.length)}`);

  const touched = new Set();
  let written = 0;

  await pool(batch, async ({ file, ev }) => {
    const prompt = [
      '你是历史编辑。把下面这条英文历史事件条目翻译成简体中文，信息不得增删。',
      '硬性要求：',
      '- 只翻译文字内容；id、coordinates_approx、category、sources[].type、sources[].contemporary 原样保留',
      '- title 为简洁中文标题（30 字以内）',
      '- description 为通顺的 200-400 字中文，保留年份、地名、人名与因果链',
      '- key_figures 每项形如「人名（身份，时间）」，括号内说明一并译出',
      '- sources[].name 全部译为中文；人名用通行译名，机构名用通用译名，年份保留数字',
      '- certainty_note 若有内容则译为中文，没有就留空字符串',
      '只输出 JSON 对象，不要解释。',
      '',
      JSON.stringify(ev),
    ].join('\n');

    try {
      const reply = await chat([{ role: 'user', content: prompt }], { temperature: 0.15 });
      const zh = validateTranslation(parseJson(reply), ev);
      if (dryRun) {
        console.log(`  ~ ${file} ${zh.id} ${zh.title}`);
        return;
      }
      docs.get(file).data.events.push(zh);
      touched.add(file);
      written += 1;
      console.log(`  + ${file} ${zh.id} ${zh.title}`);
    } catch (err) {
      console.warn(`  ! ${file} ${ev.id}: ${err.message}`);
    }
  });

  if (!dryRun) {
    for (const file of touched) {
      const doc = docs.get(file);
      doc.data.events.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      writeDoc(doc);
    }
  }
  console.log(`translate: wrote ${num(written)}`);
}

/* ── task: polity overviews ─────────────────────────────────────────────── */

/**
 * Fills `polity_descriptions.json` for polities that have no Chinese overview.
 *
 * The card renders nothing at all when a polity is missing here, and about a
 * third of the Cliopatria names are (mostly the small Warring-States and
 * dynastic fragments). Writes are additive: an existing non-empty extract is
 * never replaced, so a bad batch can only add, never damage.
 */
function nameCores(raw) {
  const base = String(raw).trim();
  const stripped = base
    .replace(/^the\s+/i, '')
    .replace(
      /^(republic|kingdom|empire|sultanate|khanate|caliphate|principality|duchy|grand duchy|tsardom|confederation|commonwealth)\s+of\s+/i,
      '',
    )
    .replace(/\s+(dynasty|empire|kingdom|republic|caliphate|sultanate|khanate)$/i, '');
  return [...new Set([base, stripped].filter(Boolean))];
}

/** Pushes every coordinate pair of a geometry into `box`. */
function growBox(box, geometry) {
  if (!geometry) return;
  const walk = (node) => {
    if (typeof node[0] === 'number') {
      const [lon, lat] = node;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      box.minLon = Math.min(box.minLon, lon);
      box.maxLon = Math.max(box.maxLon, lon);
      box.minLat = Math.min(box.minLat, lat);
      box.maxLat = Math.max(box.maxLat, lat);
      return;
    }
    for (const child of node) walk(child);
  };
  if (geometry.coordinates) walk(geometry.coordinates);
}

/** Every distinct polity name in the century files, with span and rough centre. */
function collectPolities() {
  const dir = P('public/ne/polities');
  const seen = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
    const doc = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    for (const feature of doc.features ?? []) {
      const props = feature.properties ?? {};
      const name = String(props.Name ?? '').trim();
      if (!name) continue;
      const from = Number(props.FromYear);
      const to = Number(props.ToYear);
      const entry = seen.get(name) ?? {
        name,
        from: null,
        to: null,
        box: { minLon: 180, maxLon: -180, minLat: 90, maxLat: -90 },
        wikipedia: String(props.Wikipedia ?? '').trim(),
      };
      if (Number.isFinite(from) && (entry.from === null || from < entry.from)) entry.from = from;
      if (Number.isFinite(to) && (entry.to === null || to > entry.to)) entry.to = to;
      growBox(entry.box, feature.geometry);
      seen.set(name, entry);
    }
  }
  return [...seen.values()];
}

/**
 * A coarse location hint. Without one the model happily moves a small Indian
 * dynasty to Sumatra — the name alone is not enough for it.
 */
function locate(polity) {
  const { box } = polity;
  if (box.minLon > box.maxLon) return '';
  const lon = (box.minLon + box.maxLon) / 2;
  const lat = (box.minLat + box.maxLat) / 2;
  const latText = `${lat >= 0 ? '北纬' : '南纬'}${Math.abs(lat).toFixed(0)}°`;
  const lonText = `${lon >= 0 ? '东经' : '西经'}${Math.abs(lon).toFixed(0)}°`;
  return `${latText}${lonText}`;
}

/** Mirrors `findPolityDescription` in `src/services/data.ts`. */
function hasDescription(descriptions, name) {
  const cores = nameCores(name);
  for (const core of cores) if (descriptions[core]?.zh?.extract) return true;
  const lowered = new Set(cores.map((c) => c.toLowerCase()));
  return Object.entries(descriptions).some(
    ([key, value]) => lowered.has(key.toLowerCase()) && value?.zh?.extract,
  );
}

/**
 * The example is deliberately fictional.
 *
 * A real one ("Han" → 汉朝) was copied verbatim into unrelated entries — the
 * model happily described an 11th-century Indian dynasty as the Han dynasty —
 * and it also made the Warring-States state 韩 look like 汉. A made-up polity
 * teaches length and structure without planting a name to leak.
 */
const POLITY_PROMPT = `你是历史地理百科编辑。为下列历史政体各写一段"总体介绍"，供地图卡片显示。

下面是一个虚构示例，仅示范篇幅与写法。禁止照抄，禁止把示例里的名称、地点、事件写进任何条目：
{"1":{"title":"示例国","extract":"示例国（前300—前120年）位于示例半岛东岸，是当地若干城邦联合而成的商业政权，以港口贸易与海上转运为经济基础。其政体为贵族共和，由长老会议推举执政，军事上依赖雇佣舰队，与周边帝国长期维持朝贡与互市并存的关系。前150年前后因内乱与外部入侵而分裂，最终被邻国吞并。它留下的海商法与度量衡体系被后来的地方王朝沿用。"}}

硬性要求：
- 每段 140-200 个汉字，篇幅必须接近示例，短于 140 字视为不合格
- 单段连续文字，不分段、不用 Markdown、不用列表
- 依次写清：存在时间与大致地域、政体性质与统治形态、关键事件或兴衰脉络、历史影响
- 开头直接写该政体的中文名，不要用英文名开头，也不要复述坐标、"维基条目"这类提示信息
- 年代与括号内给出的起止年一致，不要写成别的时代
- 地名以括号内的坐标为准，不要把地理位置挪到别的地区
- 若对该名称所指的政权没有把握，就按坐标与年代写其地域、经济与政体形态的一般描述，绝不套用另一个已知王朝的名字
- 只写通行史实；不确定的细节宁可省略，不要编造人口、面积、兵力等具体数字
- 不要出现"本条目""以下""总之"这类编辑口吻，直接从史实写起
- title 写该政体的通行中文名（如 "(Chu)" 写"楚国"）

输出 JSON 对象（键用条目编号，不要回写政体名称）：
{"1": {"title":"中文名","extract":"介绍文字"}, "2": null}
确实无法确定的政体，该编号返回 null，不要猜测。`;

/** `-291` → `前291`, for the span hint handed to the model. */
const fmtYear = (year) => (year === null ? '?' : year < 0 ? `前${-year}` : String(year));

function cleanExtract(value) {
  return String(value ?? '')
    // The prompt's own hints ("…年，势力范围中心约在…"、"英文维基条目 …") come
    // back inside the text often enough that stripping them is part of parsing.
    .replace(/，势力范围中心约在[^）]*/g, '')
    .replace(/势力范围中心约在[^，。]*，/g, '')
    .replace(/势力范围中心约在[^，。]*/g, '')
    .replace(/，?英文维基条目[^）]*/g, '')
    .replace(/，?通行中文名[^）]*/g, '')
    .replace(/（\s*）/, '')
    .replace(/\s+/g, ' ')
    .replace(/^["“]|["”]$/g, '')
    .trim();
}

async function polityDescriptions() {
  const doc = readDoc(P('public/ne/polity_descriptions.json'));
  // The project already ships a Chinese name for almost every polity; handing
  // it over is what keeps 弁韩 from being answered as 百济.
  const namesZh = JSON.parse(readFileSync(P('public/ne/polity_names_zh.json'), 'utf8'));
  const all = collectPolities();
  const only = (args.get('only') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const missing = all.filter(
    (polity) =>
      !hasDescription(doc.data, polity.name) &&
      (!only.length || only.some((needle) => polity.name.includes(needle))),
  );
  console.log(
    `polity descriptions: ${num(all.length)} polities, ${num(missing.length)} to write`,
  );

  const batchSize = Math.max(1, Number(args.get('batch') ?? 4) || 4);
  const batches = [];
  for (let i = 0; i < missing.length; i += batchSize) {
    batches.push(missing.slice(i, i + batchSize));
  }

  let budget = limit;
  let written = 0;

  await pool(batches, async (batch) => {
    if (budget <= 0) return;
    budget -= batch.length;

    const lines = batch.map((polity, i) => {
      const span =
        polity.from === null && polity.to === null
          ? '年代不详'
          : `${fmtYear(polity.from)}—${fmtYear(polity.to)}年`;
      const where = locate(polity);
      /*
       * Two disambiguation hints. The geometry stops the model relocating a
       * polity to another continent; the Wikipedia article title is what tells
       * a Warring-States 韩 apart from 汉 or from the Korean 韩.
       */
      const hint = where ? `，势力范围中心约在${where}` : '';
      const article =
        polity.wikipedia && polity.wikipedia.toLowerCase() !== polity.name.toLowerCase()
          ? `，英文维基条目 “${polity.wikipedia}”`
          : '';
      const zhName = namesZh[polity.name];
      const nameHint = zhName ? `，通行中文名“${zhName}”` : '';
      return `${i + 1}. ${polity.name}（${span}${hint}${article}${nameHint}）`;
    });
    const prompt = `${POLITY_PROMPT}\n\n${lines.join('\n')}`;

    try {
      const reply = await chat([{ role: 'user', content: prompt }], { temperature: 0.3 });
      const parsed = parseJson(reply);
      const touched = [];

      /*
       * Answers come back keyed by list number, not by name: the leftover names
       * are long compound ones ("(Personal union of Kingdom of Poland with
       * Kingdom of Hungary)"), and echoing them produced malformed JSON that
       * lost the whole batch.
       */
      for (const [key, value] of Object.entries(parsed ?? {})) {
        const polity = batch[Number(key) - 1];
        if (!polity || !value) continue;
        const rawName = polity.name;
        const extract = cleanExtract(value.extract);
        if (dryRun) console.log(`    ${rawName} (${extract.length}): ${extract.slice(0, 70)}…`);
        // A short answer is a refusal dressed up as content; skip it rather than
        // writing a one-line stub into the card.
        if (extract.length < 110) continue;
        if (!/[\u4e00-\u9fa5]/.test(extract)) continue;
        // Example text leaking into an entry means the model ignored the source
        // line, so the rest of that answer cannot be trusted either.
        if (/示例|Exampleia/.test(extract)) continue;

        doc.data[rawName] = {
          name: rawName,
          from: polity.from ?? 0,
          to: polity.to ?? 0,
          zh: {
            title: String(value.title ?? rawName).trim() || rawName,
            extract,
            thumbnail: null,
          },
        };
        touched.push(`${rawName} (${extract.length})`);
      }

      if (touched.length) {
        console.log(`  + ${touched.join(', ')}`);
        written += touched.length;
        if (!dryRun) writeDoc(doc);
      }
    } catch (err) {
      console.warn(`  ! batch "${batch[0].name}…": ${err.message}`);
    }
  });

  console.log(`polity descriptions: filled ${num(written)}`);
}

/* ── entry ──────────────────────────────────────────────────────────────── */

const tasks = {
  'battle-coords': battleCoords,
  'event-coords': eventCoords,
  'translate-events': translateEvents,
  people: () => people(Number.isFinite(limit) ? limit : 12),
  'polity-desc': polityDescriptions,
};

if (!tasks[task]) {
  console.error(`usage: --task=${Object.keys(tasks).join('|')} [--limit=N] [--dry-run]`);
  process.exit(1);
}

if (!existsSync(P('.env'))) {
  console.error('.env with ZHIPU_API_KEY_n is required');
  process.exit(1);
}

const started = Date.now();
await tasks[task]();
console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s${dryRun ? ' (dry run)' : ''}`);
