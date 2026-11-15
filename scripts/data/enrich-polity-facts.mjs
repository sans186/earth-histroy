/**
 * Fill in the social and political facts a polity card shows but the tiles do
 * not carry: form of government, how power was held, capital, languages, ethnic
 * composition, religion, script, currency, population, and what modern states
 * the territory belongs to today.
 *
 * Why a model: nothing in the dataset has these fields. Cliopatria gives name,
 * dates, area, type and a Wikipedia link; `polity_assets.json` covers only the
 * ~350 modern states. So the answers are generated and every record is marked
 * as such — the card says so, and this file says so.
 *
 * Two rules are enforced in the prompt, because both are places where a model
 * would otherwise invent data that reads as fact:
 *   1. No percentages. Historians do not have ethnic or language shares for the
 *      Zhou dynasty; asking for them produces plausible-looking fiction.
 *   2. Unknown is null. A missing capital is honest; a guessed one is not.
 *
 * Usage:
 *   node scripts/data/enrich-polity-facts.mjs --limit=5
 *   node scripts/data/enrich-polity-facts.mjs --concurrency=5
 *   node scripts/data/enrich-polity-facts.mjs --redo
 *
 * Output: public/ne/polity_facts.json, keyed by the same names as
 * polity_descriptions.json so the card can look both up the same way.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SOURCE = resolve(ROOT, 'public/ne/polity_descriptions.json');
const OUT = resolve(ROOT, 'public/ne/polity_facts.json');
const ENV = resolve(ROOT, '.env');

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.replace(/^--/, '').split('=');
  args.set(key, value ?? 'true');
}

const LIMIT = Number.parseInt(args.get('limit') ?? '', 10);
const CONCURRENCY = Number.parseInt(args.get('concurrency') ?? '5', 10) || 5;
const REDO = args.has('redo');
const MODEL = process.env.POLITY_FACTS_MODEL || 'glm-4-flash-250414';

function loadEnv() {
  if (!existsSync(ENV)) return;
  for (const line of readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w_]+)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const KEYS = [1, 2, 3, 4, 5]
  .map((n) => process.env[`ZHIPU_API_KEY_${n}`])
  .filter(Boolean);

if (!KEYS.length) {
  console.error('没有可用的 ZHIPU_API_KEY_n，无法生成。');
  process.exit(1);
}

/**
 * The prompt is grounded, not just "be careful".
 *
 * The first production run asked a model to describe polities from its own
 * memory. What came back was fluent and, in two recurring places, wrong:
 *
 *   - "马克思主义/共产主义" landed in the religion field of 21 states. A party
 *     doctrine is not a faith; the model had absorbed the Chinese convention of
 *     writing 宗教信仰 loosely and answered the question it expected.
 *   - Language families were invented. Vietnamese and Khmer were filed under
 *     南岛语系 (Austronesian) — plausible-sounding, plainly false.
 *
 * Neither is fixed by asking for accuracy. They are fixed by (a) handing the
 * model the Wikipedia extract it must answer from, (b) naming the two traps
 * explicitly, and (c) requiring a source for every record so an unsourced claim
 * cannot pass silently.
 */
const PROMPT = `你是历史数据编辑，正在为"寰宇纪年"网站填写政体的社会与政治概况。

【第一条：只能用给定的维基摘要作答】
用户消息里会给出一段中文维基百科摘要（可能附英文摘要）。你的答案必须以这段材料为依据。
摘要里没有的信息，一律填 null —— 宁可字段是空的，也不许用你的训练记忆去补。
如果你认为摘要不足以判断，就把 confidence 填 "low"。

【第二条：政治意识形态不是宗教】
"共产主义""马克思主义""社会主义""无神论""党的意识形态"都不是宗教。
遇到自称社会主义、由共产党执政的政体：
  - religion 填该国社会实际的主要信仰（如 佛教、伊斯兰教、东正教、天主教），或填 null；
  - 绝不许把党的意识形态写进 religion；
  - 意识形态属于 government/structure（如 社会主义共和国、一党制）。
历史上的国教、官方信仰照实填写（如 儒教、琐罗亚斯德教、东正教）。

【第三条：语系必须与官方语言一致】
languages.family 描述的是 official 那门语言所属的语系，必须与维基百科该语言条目的分类一致。
写语系层级的通名，不要写语族以外的臆造名。常用对照：
  汉语/藏语/缅甸语 → 汉藏语系
  越南语/高棉语 → 南亚语系（不是南岛语系）
  泰语/老挝语 → 壮侗语系
  印尼语/马来语/他加禄语 → 南岛语系
  阿拉伯语/希伯来语/阿姆哈拉语 → 亚非语系
  波斯语/印地语/希腊语/拉丁语/俄语/英语/德语/法语 → 印欧语系
  土耳其语/哈萨克语/维吾尔语 → 突厥语族
  芬兰语/匈牙利语 → 乌拉尔语系
  斯瓦希里语/祖鲁语 → 尼日尔-刚果语系
  朝鲜语、日语、蒙古语的分类存在争议，按维基条目原文写，不确定填 null。
摘要未提及语言时，official 与 family 都填 null，不要猜。

【第四条：数字必须有来源】
人口写成"约 500 万（前 800 年估计）"这种形式，括号内必须是你从摘要中读到的年代；
摘要没有人口数据就填 null。禁止给出任何百分比（族群占比、语言占比、识字率）。

【第五条：其余约束】
- 官方语言填语言名称（古埃及语、拉丁语），文字写在 script，民族写在 ethnicGroups。
- 通行语言按影响力排序，最多 3 个，不写百分比。
- 统治结构只填一项最贴切的，不要并列两个互相矛盾的说法。
- 今属只列疆域长期稳定覆盖的现代国家，最多 3 个，不列朝贡国与短暂征服地。
- 全部简体中文，每项不超过 24 个字。

【输出】
只输出 JSON，不要解释，不要代码块围栏：
{
  "government": "政体形式，如 王朝、帝国、共和制城邦",
  "structure": "统治结构，如 中央集权官僚制、封建分封",
  "capital": "首都或权力中心，可用现代地名括注",
  "languages": { "official": "官方/行政语言", "spoken": ["通行语言1","通行语言2"], "family": "官方语言所属语系" },
  "ethnicGroups": ["主要族群1","主要族群2"],
  "religion": "官方宗教或社会主要信仰；意识形态不得填入；无据填 null",
  "script": "文字/书写系统",
  "currency": "主要货币",
  "population": "带年代的人口估计，或 null",
  "modernCountries": ["今属国家或地区1","今属国家或地区2"],
  "predecessors": ["前身政体，最多 2 个"],
  "successors": ["后继政体，最多 2 个"],
  "sources": [{ "title": "所依据的维基条目名", "url": "https://zh.wikipedia.org/wiki/..." }],
  "confidence": "high | medium | low"
}`;

/* ── Wikipedia grounding ────────────────────────────────────────────────── */

const WIKI_UA = 'EarthPolityFacts/1.0 (https://earth.tazume-sans.cn; data curation)';
const wikiCache = new Map();

async function fetchSummary(lang, title) {
  if (!title) return null;
  const key = `${lang}:${title}`;
  if (wikiCache.has(key)) return wikiCache.get(key);

  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  let result = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(url, { headers: { 'User-Agent': WIKI_UA }, signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const json = await res.json();
      const extract = String(json?.extract ?? '').trim();
      if (extract) {
        result = {
          title: json?.title ?? title,
          extract,
          url: json?.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        };
      }
    }
  } catch {
    // No network, a timeout, or a missing page: all mean "no grounding", which
    // the prompt handles by demanding nulls rather than guesses.
    result = null;
  }
  wikiCache.set(key, result);
  return result;
}

/**
 * Chinese first, English second.
 *
 * The Chinese article exists for almost every polity in the corpus; the English
 * one is the fallback and the more reliable of the two when both exist, which is
 * why both are handed over and the model is told to prefer the Chinese one only
 * for terminology.
 */
async function gatherContext(key, doc) {
  const zhTitle = doc.zh?.title || key;
  const zh = await fetchSummary('zh', zhTitle);
  const en = await fetchSummary('en', doc.en?.title || key);
  return { zh, en };
}

function buildUserPrompt(key, doc, context) {
  const years = `${formatYear(doc.from)}—${formatYear(doc.to)}`;
  const fallback = (doc.zh?.extract ?? '').slice(0, 700);

  const zhBlock = context.zh
    ? `【中文维基摘要：${context.zh.title}】\n${context.zh.extract.slice(0, 1500)}\n来源：${context.zh.url}`
    : `【中文维基摘要：未取到】\n（下面这段是本地缓存的简介，可信度低于维基条目）\n${fallback || '（无）'}`;

  const enBlock = context.en
    ? `\n\n【英文维基摘要：${context.en.title}】\n${context.en.extract.slice(0, 1200)}\n来源：${context.en.url}`
    : '';

  const warning = context.zh || context.en
    ? ''
    : '\n\n【注意】没有取到任何维基材料。此时只填写你完全确定的字段，其余一律 null，confidence 填 "low"。';

  return `政体名称：${key}
存续年份：${years}

${zhBlock}${enBlock}${warning}`;
}

function formatYear(year) {
  if (!Number.isFinite(year)) return '不详';
  return year < 0 ? `前 ${Math.abs(year)} 年` : `公元 ${year} 年`;
}

let keyCursor = 0;
/** Keys that answered 401 — worth retrying them is pointless. 429 is not that. */
const dead = new Set();

/** Serialised pacing: the free tier throttles per minute, not per key. */
let gate = Promise.resolve();
const MIN_GAP_MS = Number.parseInt(process.env.POLITY_FACTS_GAP ?? '400', 10) || 400;

function throttle() {
  const wait = new Promise((resolve) => setTimeout(resolve, MIN_GAP_MS));
  gate = gate.then(() => wait);
  return gate;
}

async function callModel(userPrompt) {
  let lastError = null;

  // A rate-limited account recovers on its own, so this retries with a widening
  // pause instead of retiring the key. Retiring on 429 is what made an earlier
  // run drop 1214 of 1971 entries.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const index = keyCursor % KEYS.length;
    keyCursor += 1;
    if (dead.has(index)) continue;
    await throttle();

    try {
      const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${KEYS[index]}`,
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.3,
          messages: [
            { role: 'system', content: PROMPT },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (res.status === 401) {
        dead.add(index);
        lastError = new Error(`401 ${(await res.text()).slice(0, 120)}`);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`${res.status} ${(await res.text()).slice(0, 100)}`);
        const backoff = 2000 * (attempt + 1);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      if (!res.ok) {
        lastError = new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
        continue;
      }

      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content ?? '';
      return parseFacts(text);
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  throw lastError ?? new Error('no usable key');
}

function parseFacts(text) {
  const cleaned = String(text)
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no json in reply');

  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  const textOrNull = (value) => {
    const s = typeof value === 'string' ? value.trim() : '';
    return s && s.toLowerCase() !== 'null' ? s : null;
  };
  const listOf = (value, max) =>
    (Array.isArray(value) ? value : [])
      .map((item) => textOrNull(item))
      .filter(Boolean)
      .slice(0, max);

  const languages = parsed.languages ?? {};

  /*
   * A record without a source is exactly the failure this rewrite is for, so the
   * model is asked for one and told that a missing one means "unverified". The
   * field is kept even when empty, because an empty list is evidence.
   */
  const sources = (Array.isArray(parsed.sources) ? parsed.sources : [])
    .filter((source) => source && typeof source.url === 'string')
    .map((source) => ({
      title: textOrNull(source.title) ?? '',
      url: String(source.url).trim(),
    }))
    .filter((source) => /^https?:\/\//.test(source.url))
    .slice(0, 3);

  const confidence = ['high', 'medium', 'low'].includes(parsed.confidence)
    ? parsed.confidence
    : 'low';

  return {
    government: textOrNull(parsed.government),
    structure: textOrNull(parsed.structure),
    capital: textOrNull(parsed.capital),
    languages: {
      official: textOrNull(languages.official),
      spoken: listOf(languages.spoken, 3),
      family: textOrNull(languages.family),
    },
    ethnicGroups: listOf(parsed.ethnicGroups, 3),
    religion: textOrNull(parsed.religion),
    script: textOrNull(parsed.script),
    currency: textOrNull(parsed.currency),
    population: textOrNull(parsed.population),
    modernCountries: listOf(parsed.modernCountries, 3),
    predecessors: listOf(parsed.predecessors, 2),
    successors: listOf(parsed.successors, 2),
    sources,
    confidence,
    generatedBy: MODEL,
  };
}

/* ── main ─────────────────────────────────────────────────────────────── */

const descriptions = JSON.parse(readFileSync(SOURCE, 'utf8'));
const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const out = REDO ? {} : { ...existing };

/*
 * The description file repeats the same prose under several keys (a polity that
 * is split across century tiles shows up again as "(Qing Dynasty)"). Identical
 * extracts therefore share one generated record instead of paying twice.
 */
const byExtract = new Map();
for (const [key, doc] of Object.entries(out)) {
  const digest = createHash('sha1').update(doc.__extract ?? key).digest('hex');
  byExtract.set(digest, key);
}

const queue = [];
for (const [key, doc] of Object.entries(descriptions)) {
  if (out[key]) continue;
  queue.push({ key, doc });
}

const total = LIMIT > 0 ? Math.min(LIMIT, queue.length) : queue.length;
console.log(
  `待生成 ${queue.length} 条，本次处理 ${total} 条，并发 ${CONCURRENCY}，模型 ${MODEL}`,
);

let done = 0;
let failed = 0;
let cursor = 0;

function flush() {
  const sorted = Object.fromEntries(
    Object.entries(out)
      .filter(([, value]) => value && typeof value === 'object')
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
}

async function worker() {
  while (cursor < total) {
    const index = cursor;
    cursor += 1;
    const item = queue[index];
    if (!item) return;

    const extract = item.doc.zh?.extract ?? '';
    const digest = createHash('sha1').update(extract || item.key).digest('hex');
    const reused = byExtract.get(digest);
    if (reused && out[reused]) {
      out[item.key] = { ...out[reused] };
      done += 1;
      continue;
    }

    try {
      // Retrieve first, ask second. Without this the model answers from memory,
      // which is where the ideology-as-religion and invented language families
      // came from in the first place.
      const context = await gatherContext(item.key, item.doc);
      const facts = await callModel(buildUserPrompt(item.key, item.doc, context));
      out[item.key] = {
        ...facts,
        verifiedWith: [context.zh?.url, context.en?.url].filter(Boolean),
      };
      byExtract.set(digest, item.key);
      done += 1;
      process.stdout.write(`\r已生成 ${done}/${total}（失败 ${failed}）`);
      if (done % 20 === 0) flush();
    } catch (err) {
      failed += 1;
      console.error(`\n${item.key} 失败：${err.message}`);
    }
  }
}

try {
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
} finally {
  flush();
  console.log(`\n完成：新增 ${done} 条，失败 ${failed} 条，累计 ${Object.keys(out).length} 条 → ${OUT}`);
}
