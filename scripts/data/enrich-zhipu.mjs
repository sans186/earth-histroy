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
const MODEL = 'glm-4-flash';

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

/* ── entry ──────────────────────────────────────────────────────────────── */

const tasks = {
  'battle-coords': battleCoords,
  'event-coords': eventCoords,
  people: () => people(Number.isFinite(limit) ? limit : 12),
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
