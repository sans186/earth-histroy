/**
 * Generate war profiles for the names declared in war_list.txt.
 *
 * Replaces two earlier scripts
 * ---------------------------
 *   pipeline.js      — 4-phase, but matched wars by their Chinese name, so a
 *                      renamed war was regenerated and overwrote an existing
 *                      profile. Its phase 3/4 JSON parsing never worked.
 *   gen_missing.mjs  — hard-coded a live API key in the source, and never ran
 *                      successfully.
 *
 * Design decisions
 * ----------------
 *   - Credentials come from .env only. Nothing is written into source.
 *   - The index is never edited directly. It is always rebuilt from the profile
 *     files, so the index and the data cannot drift apart.
 *   - Coverage is computed by war *name* against the declared list, and the
 *     generated file is keyed by a slug of the English name, so renames cannot
 *     cause a silent overwrite.
 *   - Output is parsed as strict JSON. There is deliberately NO quote-repair
 *     step: the collapse damage repaired in data/repair-data.mjs was caused by
 *     exactly such a step.
 *
 * Usage
 * -----
 *   node scripts/generate/generate-wars.mjs --dry-run
 *   node scripts/generate/generate-wars.mjs --only 祖鲁战争
 *   node scripts/generate/generate-wars.mjs --limit 2
 *   node scripts/generate/generate-wars.mjs                 # all missing
 *   node scripts/generate/generate-wars.mjs --rebuild-index
 *       Rebuild the index from the profiles, and recompute every theatre
 *       centroid from that profile's recorded battle coordinates.
 *   node scripts/generate/generate-wars.mjs --backfill-locations
 *       Ask the model for a theatre centroid for the wars that have neither
 *       battle coordinates nor a stored position. Only useful for the handful
 *       of profiles whose battles carry no coordinates.
 *
 *   ZHIPU_MODEL=glm-4-flash-250414 sets the Zhipu model; without it the script
 *   asks for glm-4-plus, which the free-tier keys reject with code 1113.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const ARGS = process.argv.slice(2);
const has = (flag) => ARGS.includes(flag);
const valueOf = (flag) => {
  const i = ARGS.indexOf(flag);
  return i === -1 ? null : ARGS[i + 1];
};

const DRY_RUN = has('--dry-run');
const REBUILD_ONLY = has('--rebuild-index');
const BACKFILL_LOCATIONS = has('--backfill-locations');
const ONLY = valueOf('--only');
const LIMIT = Number(valueOf('--limit') ?? Number.POSITIVE_INFINITY);

/* ── credentials (never hard-coded) ──────────────────────────────────────── */

const ENV_PATH = resolve(ROOT, '.env');
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

/**
 * Providers are tried in order and a key that reports an exhausted balance is
 * taken out of rotation for the rest of the run.
 *
 * Zhipu is the intended primary. In practice its accounts are frequently out of
 * credit ("code 1113"), so any OpenAI-compatible fallback declared in .env is
 * added to the same pool instead of being a separate code path.
 */
const API_POOL = [];

/**
 * Zhipu's paid models are routinely out of credit (code 1113) on these keys,
 * which takes every one of them out of the rotation on the first call. The
 * model is therefore overridable — `ZHIPU_MODEL=glm-4-flash-250414` for the
 * accounts that only have the free tier.
 */
const ZHIPU_MODEL = process.env.ZHIPU_MODEL || 'glm-4-plus';

for (const key of [
  'ZHIPU_API_KEY_1',
  'ZHIPU_API_KEY_2',
  'ZHIPU_API_KEY_3',
  'ZHIPU_API_KEY_4',
  'ZHIPU_API_KEY_5',
]) {
  if (process.env[key]) {
    API_POOL.push({
      name: key,
      url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      key: process.env[key],
      model: ZHIPU_MODEL,
      disabled: false,
    });
  }
}

/** Accepts a bare host, a base path, or a full endpoint. */
function chatEndpoint(base, fallback) {
  const value = (base ?? '').trim();
  if (!value) return fallback;
  if (/\/chat\/completions\/?$/.test(value)) return value.replace(/\/$/, '');
  return `${value.replace(/\/$/, '')}/v1/chat/completions`;
}

if (process.env.OPEN_API_KEY) {
  API_POOL.push({
    name: 'OPEN_API_KEY',
    url: chatEndpoint(process.env.OPEN_BASE_URL, 'https://njusehub.info/v1/chat/completions'),
    key: process.env.OPEN_API_KEY,
    model: process.env.OPEN_MODEL || 'DeepSeek-V3',
    disabled: false,
  });
}

if (!API_POOL.length && !REBUILD_ONLY) {
  console.error(
    '未找到可用凭据。请在 .env 中设置 ZHIPU_API_KEY_1..5，或配置 OPEN_API_KEY / OPEN_BASE_URL 作为备用通道。',
  );
  process.exit(1);
}

/* ── paths ───────────────────────────────────────────────────────────────── */

const PROFILES_DIR = resolve(ROOT, 'public', 'wars', 'profiles');
const INDEX_PATH = resolve(PROFILES_DIR, 'index.json');
const WAR_LIST_PATH = resolve(ROOT, 'war_list.txt');
const NON_PROFILE = new Set(['index.json', 'war_locations.json']);

mkdirSync(PROFILES_DIR, { recursive: true });

/* Model calls take a minute or more each, so progress is mirrored to a file —
 * a detached run can then be followed without holding a terminal open. */
const LOG_PATH = resolve(ROOT, '.wars-generation.log');
// Append rather than truncate: two runs (e.g. generation plus a location
// backfill) share this file, and truncating wiped the other run's record.
appendFileSync(LOG_PATH, `\n# run started ${new Date().toISOString()}\n`, 'utf8');
for (const [method, bound] of [
  ['log', console.log.bind(console)],
  ['warn', console.warn.bind(console)],
  ['error', console.error.bind(console)],
]) {
  console[method] = (...args) => {
    try {
      appendFileSync(
        LOG_PATH,
        args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n',
        'utf8',
      );
    } catch {
      /* logging must never break generation */
    }
    bound(...args);
  };
}

/* ── coverage ────────────────────────────────────────────────────────────── */

function declaredNames() {
  return readFileSync(WAR_LIST_PATH, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function existingProfiles() {
  return readdirSync(PROFILES_DIR)
    .filter((f) => f.endsWith('.json') && !NON_PROFILE.has(f))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(resolve(PROFILES_DIR, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function slugify(text) {
  const slug = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'war';
}

/* ── theatre locations ───────────────────────────────────────────────────── */

const LOCATIONS_PATH = resolve(PROFILES_DIR, 'war_locations.json');

function readLocations() {
  try {
    const doc = JSON.parse(readFileSync(LOCATIONS_PATH, 'utf8'));
    return doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : {};
  } catch {
    return {};
  }
}

function validCentroid(value) {
  if (!value || typeof value !== 'object') return null;
  const lon = Number(value.lon);
  const lat = Number(value.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return { lon, lat };
}

function battleCountOf(doc) {
  const fromPhases = (doc.warProcess?.phases ?? []).reduce(
    (sum, p) => sum + (p.battles?.length ?? 0),
    0,
  );
  return fromPhases || doc.warProcess?.majorBattles?.length || 0;
}

/**
 * Theatre centroid derived from the battles the profile records.
 *
 * Battle coordinates are the only positions in this dataset that came from a
 * record rather than a guess, and 84 of 94 profiles carry them. The median is
 * taken per axis so that one far-flung naval engagement cannot drag a land
 * campaign into the sea.
 */
function centroidFromBattles(doc) {
  const battles = [
    ...(doc.warProcess?.phases ?? []).flatMap((phase) => phase.battles ?? []),
    ...(Array.isArray(doc.warProcess?.majorBattles) ? doc.warProcess.majorBattles : []),
  ];
  const points = battles
    .filter((b) => Array.isArray(b.coords) && b.coords.length >= 2)
    .map((b) => ({ lon: Number(b.coords[0]), lat: Number(b.coords[1]) }))
    .filter((p) => validCentroid(p));

  if (!points.length) return null;

  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  return {
    lon: Number(median(points.map((p) => p.lon)).toFixed(4)),
    lat: Number(median(points.map((p) => p.lat)).toFixed(4)),
  };
}

/**
 * `war_locations.json` predates this script; its 48 original entries were model
 * guesses and several sat in open ocean (the Pacific War's was off Yemen). A
 * centroid derived from recorded battles therefore wins over anything already
 * stored or declared. Only wars with no battle coordinates keep their value,
 * and only those need `--backfill-locations`.
 */
function rebuildLocations() {
  const existing = readLocations();
  const next = { ...existing };

  for (const doc of existingProfiles()) {
    const centroid = centroidFromBattles(doc) ?? validCentroid(doc.theatreCentroid);
    const battles = battleCountOf(doc);
    if (centroid) {
      next[doc.warId] = { lon: centroid.lon, lat: centroid.lat, battles };
    } else if (next[doc.warId]) {
      next[doc.warId] = { ...next[doc.warId], battles };
    }
  }

  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
  if (!DRY_RUN) writeFileSync(LOCATIONS_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
  return sorted;
}

/** Wars in the index that still have no theatre position. */
function warsMissingLocation() {
  const locations = readLocations();
  return existingProfiles().filter(
    (doc) => doc.warId && !validCentroid(locations[doc.warId] ? { lon: locations[doc.warId].lon, lat: locations[doc.warId].lat } : null),
  );
}

/** Always derived from the profiles, never hand-edited. */
function rebuildIndex() {
  const entries = existingProfiles()
    .map((doc) => {
      const battles =
        (doc.warProcess?.phases ?? []).reduce((sum, p) => sum + (p.battles?.length ?? 0), 0) ||
        (doc.warProcess?.majorBattles?.length ?? 0) ||
        0;
      return {
        warId: doc.warId,
        name: doc.name,
        nameEn: doc.nameEn,
        startYear: doc.startYear,
        endYear: doc.endYear,
        type: doc.type,
        category: doc.category,
        tags: doc.tags ?? {},
        summary: doc.summary,
        totalBattles: battles,
      };
    })
    .filter((e) => e.warId && e.name)
    .sort((a, b) => (a.startYear ?? 0) - (b.startYear ?? 0));

  if (!DRY_RUN) {
    writeFileSync(INDEX_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  }
  return entries;
}

/* ── model prompts ───────────────────────────────────────────────────────── */

/**
 * The rule about quotes is not cosmetic. An earlier pipeline replaced ASCII
 * quotes with CJK ones during post-processing, which silently merged every JSON
 * array and some key/value pairs into single strings. Forbidding ASCII quotes
 * inside values removes the temptation to "fix" them afterwards.
 */
const QUOTE_RULE = `严格约束：
1. 只输出一个 JSON 对象，不要 markdown 代码块，不要任何解释文字。
2. JSON 结构本身只允许使用 ASCII 双引号。
3. 字符串内容内部禁止出现 ASCII 双引号；如需强调请使用《》或「」。
4. 禁止出现尾随逗号。`;

const PROMPT_CORE = `你是军事史专家。为「{{WAR}}」生成战役资料的**核心部分**，只输出 JSON。

${QUOTE_RULE}

结构：
{
  "warId": "英文小写 slug，用连字符",
  "name": "{{WAR}}",
  "nameEn": "English name",
  "alternativeNames": ["别名，最多3个"],
  "startYear": 整数，公元前为负数,
  "endYear": 整数,
  "type": "major 或 minor",
  "category": "独立战争/内战/世界大战/殖民战争/代理人战争/王朝战争/领土战争/宗教战争",
  "theaters": ["战区，最多5个"],
  "theatreCentroid": {"lon": 数字, "lat": 数字},
  "summary": "100字以内概述",
  "background": {
    "causes": "根本原因，80字以内",
    "immediateCause": "直接导火索，60字以内",
    "preWarSituation": "战前局势，80字以内",
    "objectivesA": "甲方目标，60字以内",
    "objectivesB": "乙方目标，60字以内"
  },
  "belligerents": {
    "sideA": {
      "name": "阵营名", "nameEn": "English",
      "countries": ["参战国，最多6个"],
      "commanders": [{"name":"姓名","role":"职务","bio":"30字以内简介"}],
      "totalCasualties": {"dead":"约X万人","wounded":"约X万人","civilian":"约X万人"}
    },
    "sideB": { 同上结构 }
  },
  "outcome": {
    "result": "结果，40字以内",
    "victoryAnalysis": {"winnerFactors":"60字以内","loserFactors":"60字以内"},
    "treaty": {"name":"条约名","date":"年份","content":"40字以内"},
    "territorialChanges": "60字以内",
    "demographicImpact": "60字以内"
  },
  "legacy": {
    "significance": "60字以内",
    "immediateConsequences": "60字以内",
    "longTermImpact": {"political":"40字以内","military":"40字以内","economic":"40字以内","social":"40字以内"}
  },
  "tags": {"warfareType":["最多4个"],"geopolitical":["最多4个"],"scale":"global/regional/local","cause":["最多4个"]},
  "sources": [{"name":"史料或研究名称","type":"primary_text/secondary","contemporary":true}]
}

每方 commanders 最多 4 人。

theatreCentroid 为该战争主要战区的近似中心，使用 WGS84 经纬度：
经度东正西负（-180~180），纬度北正南负（-90~90）。
它必须落在真实战区内，不是国家中心。只输出 JSON。`;

const PROMPT_PROCESS = `你是军事史专家。为「{{WAR}}」（{{YEARS}}）生成**进程与时间线**，只输出 JSON。

${QUOTE_RULE}

结构：
{
  "warProcess": {
    "phases": [
      {
        "name": "阶段名",
        "years": "起止年份",
        "description": "80字以内",
        "battles": [
          {"name":"战役名","year":整数,"location":"地点","description":"60字以内","outcome":"40字以内"}
        ]
      }
    ]
  },
  "timeline": [
    {"year":整数,"event":"事件名","type":"battle/diplomacy/decision/crisis","description":"60字以内","impact":"60字以内"}
  ]
}

phases 最多 4 个，每阶段 battles 最多 4 个，timeline 最多 12 条。
注意：timeline 的每一项必须同时有 description 和 impact 两个独立字段。
只输出 JSON。`;

/* ── API ─────────────────────────────────────────────────────────────────── */

let cursor = 0;

async function callModel(prompt) {
  const attempts = Math.max(1, API_POOL.length * 2);
  let lastError = null;

  for (let i = 0; i < attempts; i += 1) {
    const candidates = API_POOL.filter((a) => !a.disabled);
    if (!candidates.length) throw new Error('所有 API key 均不可用');
    const api = candidates[cursor++ % candidates.length];

    try {
      const resp = await fetch(api.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.key}` },
        body: JSON.stringify({
          model: api.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.25,
          max_tokens: 4095,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        // 429 with "余额不足" (code 1113) is a spent account, not a burst limit:
        // retrying the same key is pointless, so it leaves the rotation.
        const exhausted =
          resp.status === 402 ||
          /余额不足|无可用资源包|insufficient|quota|exceeded/i.test(text);
        if (exhausted) {
          api.disabled = true;
          const remaining = API_POOL.filter((a) => !a.disabled).length;
          console.warn(
            `    [${api.name}] 额度不可用，移出轮换（剩余 ${remaining}）: ${text.slice(0, 90)}`,
          );
        }
        lastError = new Error(`HTTP ${resp.status}: ${text.slice(0, 160)}`);
        continue;
      }

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      if (!content.trim()) {
        lastError = new Error('模型返回空内容');
        continue;
      }
      return content;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('调用失败');
}

/** Strict extraction. No quote rewriting — only fenced-block and trailing-comma cleanup. */
function parseModelJson(text) {
  let t = String(text).trim();
  t = t.replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('返回内容中找不到 JSON 对象');
  t = t.slice(start, end + 1);
  t = t.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(t);
}

const PROMPT_CENTROID = `你是历史地理专家。给出「{{WAR}}」（{{YEARS}}）主要战区的中心坐标。

${QUOTE_RULE}

只输出 JSON：{"lon": 数字, "lat": 数字}

经度东正西负（-180 ~ 180），纬度北正南负（-90 ~ 90）。
坐标必须落在真实战区内，不要给交战国首都或国家地理中心。`;

/**
 * Fill in theatre coordinates for wars that have none.
 *
 * `war_locations.json` was produced before this script existed and only covers
 * the modern wars, so roughly half the index has no position. Each answer is
 * written immediately, which makes an interrupted run resumable.
 */
async function backfillLocations() {
  const missing = warsMissingLocation();
  console.log(`\n缺少战区坐标的战争：${missing.length} 个\n`);
  if (!missing.length) return;

  // Listing is free; asking the model 40+ times is not.
  if (DRY_RUN) {
    for (const doc of missing) console.log(`  ${doc.name}  (${doc.warId})`);
    console.log('\n--dry-run：仅列出，未调用模型。');
    return;
  }

  const locations = readLocations();
  const failed = [];

  for (const doc of missing) {
    const years = `${doc.startYear ?? '?'}–${doc.endYear ?? '?'}`;
    console.log(`── ${doc.name}`);
    try {
      const raw = await callModel(
        PROMPT_CENTROID.replaceAll('{{WAR}}', doc.name).replaceAll('{{YEARS}}', years),
      );
      const centroid = validCentroid(parseModelJson(raw));
      if (!centroid) throw new Error('返回的坐标不合法');

      locations[doc.warId] = {
        lon: centroid.lon,
        lat: centroid.lat,
        battles: battleCountOf(doc),
      };
      console.log(`   ${centroid.lat.toFixed(3)}, ${centroid.lon.toFixed(3)}`);

      if (!DRY_RUN) {
        const sorted = Object.fromEntries(
          Object.entries(locations).sort(([a], [b]) => a.localeCompare(b)),
        );
        writeFileSync(LOCATIONS_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
      }
    } catch (err) {
      console.error(`   失败：${err.message}`);
      failed.push(doc.name);
    }
  }

  console.log(`\n完成。仍缺 ${failed.length} 个${failed.length ? `：${failed.join('、')}` : ''}`);
}

/* ── main ────────────────────────────────────────────────────────────────── */

async function main() {
  if (REBUILD_ONLY) {
    const index = rebuildIndex();
    const locations = rebuildLocations();
    console.log(
      `索引已重建：${index.length} 条；战区坐标：${Object.keys(locations).length} 条` +
        `${DRY_RUN ? '（试运行，未写入）' : ''}`,
    );
    return;
  }

  if (BACKFILL_LOCATIONS) {
    await backfillLocations();
    return;
  }

  const declared = declaredNames();
  const profiles = existingProfiles();
  const knownNames = new Set(profiles.map((p) => p.name).filter(Boolean));
  const knownIds = new Set(profiles.map((p) => p.warId).filter(Boolean));

  let missing = declared.filter((name) => !knownNames.has(name));
  if (ONLY) missing = missing.filter((name) => name === ONLY);
  if (missing.length > LIMIT) missing = missing.slice(0, LIMIT);

  console.log(`\nwar_list.txt 声明 ${declared.length} 个，已有档案 ${profiles.length} 个`);
  console.log(`待生成 ${missing.length} 个：${missing.join('、') || '（无）'}\n`);

  if (!missing.length) {
    console.log('没有缺口，无需生成。\n');
    return;
  }

  if (DRY_RUN) {
    console.log('--dry-run：未调用模型，未写入文件。\n');
    return;
  }

  const failed = [];

  for (const name of missing) {
    console.log(`── ${name}`);
    try {
      console.log('   生成核心资料…');
      const core = parseModelJson(await callModel(PROMPT_CORE.replaceAll('{{WAR}}', name)));

      if (!core.name) core.name = name;
      if (!core.warId) core.warId = slugify(core.nameEn ?? name);
      core.warId = slugify(core.warId);

      if (knownIds.has(core.warId)) {
        console.warn(`   warId ${core.warId} 已存在，跳过以避免覆盖`);
        continue;
      }

      try {
        console.log('   生成进程与时间线…');
        const process = parseModelJson(
          await callModel(
            PROMPT_PROCESS.replaceAll('{{WAR}}', name).replaceAll(
              '{{YEARS}}',
              `${core.startYear}–${core.endYear}`,
            ),
          ),
        );
        Object.assign(core, process);
      } catch (err) {
        console.warn(`   进程部分失败，仅保存核心资料：${err.message}`);
      }

      const path = resolve(PROFILES_DIR, `${core.warId}.json`);
      writeFileSync(path, JSON.stringify(core, null, 2) + '\n', 'utf8');
      knownIds.add(core.warId);
      knownNames.add(core.name);
      console.log(`   已写入 ${core.warId}.json`);
    } catch (err) {
      console.error(`   失败：${err.message}`);
      failed.push({ name, reason: err.message });
    }
  }

  const index = rebuildIndex();
  const locations = rebuildLocations();
  console.log(`\n索引已重建：${index.length} 条；战区坐标：${Object.keys(locations).length} 条`);
  if (failed.length) {
    console.log(`失败 ${failed.length} 个：`);
    for (const f of failed) console.log(`  - ${f.name}  (${f.reason})`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('致命错误：', err.message);
  process.exit(1);
});
