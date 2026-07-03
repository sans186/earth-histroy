#!/usr/bin/env node
/**
 * generate-profiles.js
 *
 * Batch-generates historical person profiles using Zhipu (智谱) & Qwen (千问) APIs.
 * Reads names from people_list.txt, calls AI with the standard prompt, and
 * outputs structured JSON to public/people/profiles/.
 *
 * Resumable — skips profiles that already exist.
 *
 * Usage:  node scripts/generate-profiles.js [--force] [--concurrency N]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Load .env ──
const ENV_PATH = resolve(ROOT, '.env');
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([\w_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ── Config ──
const PROFILES_DIR = resolve(ROOT, 'public/people/profiles');
const INDEX_PATH = resolve(PROFILES_DIR, 'index.json');
const NAMES_FILE = resolve(ROOT, 'people_list.txt');
const FORCE = process.argv.includes('--force');
const CONCURRENCY = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--concurrency') || '4', 10);
const LIMIT = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--limit') || '0', 10) || Infinity;
const DRY_RUN = process.argv.includes('--dry-run');

// ── API pool ──
const API_POOL = [];

// Zhipu (智谱) — 3 keys
if (process.env.ZHIPU_API_KEY) {
  API_POOL.push({
    name: 'zhipu-1',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    key: process.env.ZHIPU_API_KEY,
    model: 'glm-4.5-air',
  });
}
if (process.env.ZHIPU_API_KEY_2) {
  API_POOL.push({
    name: 'zhipu-2',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    key: process.env.ZHIPU_API_KEY_2,
    model: 'glm-4-plus',
  });
}
if (process.env.ZHIPU_API_KEY_3) {
  API_POOL.push({
    name: 'zhipu-3',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    key: process.env.ZHIPU_API_KEY_3,
    model: 'glm-4-plus',
  });
}

// Qwen (千问)
if (process.env.QWEN_API_KEY) {
  API_POOL.push({
    name: 'qwen',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    key: process.env.QWEN_API_KEY,
    model: 'qwen-plus',
  });
}

if (API_POOL.length === 0) {
  console.error('No API keys found. Set ZHIPU_API_KEY, ZHIPU_API_KEY_2, or QWEN_API_KEY in .env');
  process.exit(1);
}

console.log(`API pool: ${API_POOL.map(a => `${a.name}(${a.model})`).join(', ')}`);
console.log(`Concurrency: ${CONCURRENCY}\n`);

// ── Parse names ──
function parseNames(text) {
  const seen = new Set();
  const names = [];
  // Split by common delimiters
  const raw = text.split(/[、,\n\r]+/);
  for (let name of raw) {
    name = name.trim();
    // Skip empty, parenthetical notes, section headers
    if (!name || name.startsWith('（') || name.startsWith('(')) continue;
    // Remove trailing parenthetical notes but keep the name
    name = name.replace(/[（(][^)）]*[)）]/g, '').trim();
    if (!name || name.length < 2) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

// ── Slugify ──
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'person';
}

// ── Check existing ──
function loadExisting() {
  if (!existsSync(INDEX_PATH)) return { index: [], names: new Set(), fuzzyNames: [] };
  try {
    const idx = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
    const names = new Set(idx.map(p => p.name));
    // Also collect names for fuzzy matching (e.g. "加尔文" vs "约翰·加尔文")
    const fuzzyNames = idx.map(p => p.name);
    return { index: idx, names, fuzzyNames };
  } catch { return { index: [], names: new Set(), fuzzyNames: [] }; }
}

function nameExists(inputName, existing) {
  // Exact match
  if (existing.names.has(inputName)) return true;
  // Fuzzy: input is contained in a generated name, or vice versa (for names ≥ 2 chars)
  if (inputName.length >= 2) {
    for (const en of existing.fuzzyNames) {
      if (en.includes(inputName) || inputName.includes(en)) return true;
    }
  }
  return false;
}

// ── Build prompt ──
function buildSystemPrompt() {
  return `你是一位精通世界历史与人物传记的专家。请为指定人物生成详细的生平资料。

你必须严格按照以下JSON格式输出，不要包含任何其他文字：

{
  "personId": "英文名-slug格式（如che-guevara, napoleon-bonaparte）",
  "name": "人物中文名",
  "nameEn": "人物英文全名",
  "birth": 出生年份（整数，BC用负数，未知用null）,
  "death": 逝世年份（整数，BC用负数，未知用null）,
  "nationality": "国籍/所属国家（中文）",
  "nationalityEn": "国籍/所属国家（英文）",
  "totalPoints": 地点数量（整数，建议4-8个）,
  "points": [
    {
      "year": 起始年份,
      "yearEnd": 结束年份（可为null）,
      "place": "地点名（中文，尽量具体到城市）",
      "placeEn": "地点名（英文）",
      "coords": [经度, 纬度],
      "title": "本阶段的主题标题（中文，4-10字）",
      "titleEn": "本阶段的主题标题（英文）",
      "description": "在此地的详细事迹描述（中文，200-500字，包含具体事件、决策、成就、影响）",
      "descriptionEn": "在此地的详细事迹描述（英文，150-400词）"
    }
  ],
  "evaluation": {
    "supporter": {
      "zh": "支持者/赞美者视角的评价（中文，100-200字）",
      "en": "支持者/赞美者视角的评价（英文，80-150词）"
    },
    "critic": {
      "zh": "批评者/反对者视角的评价（中文，100-200字）",
      "en": "批评者/反对者视角的评价（英文，80-150词）"
    },
    "objective": {
      "zh": "客观历史与流行文化视角的评价（中文，100-200字）",
      "en": "客观历史与流行文化视角的评价（英文，80-150词）"
    }
  },
  "quotes": {
    "self": {
      "zh": "该人物的一句经典原话（中文翻译）",
      "en": "该人物的一句经典原话（英文原文或翻译）"
    },
    "others": {
      "zh": "他人对该人物的经典评价（中文翻译）",
      "en": "他人对该人物的经典评价（英文原文或翻译）"
    }
  },
  "othersBy": "评价者姓名（中文）",
  "othersByEn": "评价者姓名（英文）"
}

重要要求：
1. 坐标必须是[经度, 纬度]格式的浮点数，尽量准确
2. 每个point代表此人一生中一个重要的地点阶段，按时间排序
3. 描述要详细具体，有历史事实依据，不要空洞
4. 评价要从不同视角出发，体现历史复杂性
5. 引言必须是真实存在的原话，标注出处`;
}

function buildUserPrompt(name) {
  return `请为我详细梳理 ${name} 的一生。

我的需求分为两个部分：

**第一部分：按地点梳理主要足迹与事迹**
请按照时间顺序，列出此人生平中几个最重要的地点（国家或城市），并为每个地点详细描述：
1. 他/她在此地的具体时间段。
2. 在此地发生的核心事件、做出的关键决策或完成的重要作品/成就。
3. 这一地点对他/她人生轨迹产生了怎样的影响。

**第二部分：总体评价（涵盖不同视角）**
请给出对此人物的综合评价。在评价中，请务必兼顾以下不同立场的观点：
1. 支持者/赞美者的视角：他/她被视为怎样的人物？主要的贡献或精神遗产是什么？
2. 批评者/反对者的视角：他/她的主要争议、历史局限或决策失误有哪些？
3. 客观历史或流行文化的视角：在历史学界或大众文化中，他/她又被如何定义和符号化？

请确保内容具有历史事实依据，分析深入，不局限于单一神话或刻板印象。

引用一段该人物的经典原话，再引用一段他人的经典评价原话。

请直接返回JSON，不要包含任何markdown代码块或其他文字。`;
}

// ── API call with retry ──
async function callAPI(api, messages, retries = 3) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(api.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${api.key}`,
        },
        body: JSON.stringify({
          model: api.model,
          messages,
          temperature: 0.3,
          max_tokens: 8192,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        lastError = new Error(`HTTP ${resp.status}: ${text.substring(0, 300)}`);

        // Permanent failures — don't retry, mark API as dead
        if (resp.status === 401 || resp.status === 403) {
          console.error(`  [${api.name}] Auth failed — disabling this API key`);
          api.dead = true;
          throw lastError;
        }
        // Zhipu balance exhausted
        if (resp.status === 429 && text.includes('余额不足')) {
          console.error(`  [${api.name}] Balance exhausted — disabling this API key`);
          api.dead = true;
          throw lastError;
        }
        if (resp.status === 429) {
          const wait = Math.min((attempt + 1) * 20000, 60000);
          console.warn(`  [${api.name}] Rate limited, waiting ${wait / 1000}s...`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        throw lastError;
      }

      const data = await resp.json();
      let content = data.choices?.[0]?.message?.content || '';

      // Strip markdown code blocks if present
      content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

      // Try to find and parse JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let raw = jsonMatch[0];
        let parseErr = null;
        // Attempt to repair common JSON issues
        try {
          return validateAndFix(JSON.parse(raw));
        } catch (e1) {
          parseErr = e1;
          // Try fixing unescaped quotes in string values
          try {
            const fixed = raw.replace(/(?<=: ")(.*?)(?=")/gs, (m) =>
              m.replace(/"/g, '\\"').replace(/\n/g, '\\n'));
            return validateAndFix(JSON.parse(fixed));
          } catch (e2) {
            parseErr = e2;
            // Try truncating to last valid position
            try {
              const lastComplete = raw.lastIndexOf('"}');
              if (lastComplete > raw.length / 2) {
                const truncated = raw.substring(0, lastComplete + 2) + ']}';
                if (!truncated.includes('"evaluation"')) {
                  return validateAndFix(JSON.parse(truncated));
                }
              }
            } catch (e3) { parseErr = e3; }
          }
        }
        throw parseErr || new Error('Failed to parse JSON');
      }

      lastError = new Error('No JSON found in response: ' + content.substring(0, 200));
    } catch (e) {
      lastError = e;
      if (api.dead) throw lastError; // Don't retry dead APIs
    }

    if (attempt < retries) {
      const wait = Math.min((attempt + 1) * 5000, 15000);
      console.error(`  [${api.name}] Retry ${attempt + 1}/${retries}: ${lastError.message}`);
      await new Promise(r => setTimeout(r, wait));
    }
  }

  throw lastError || new Error(`All ${retries + 1} attempts failed`);
}

// ── Validate & fix the generated JSON ──
function validateAndFix(data) {
  if (!data.points || !Array.isArray(data.points)) {
    throw new Error('Missing points array');
  }

  data.totalPoints = data.points.length;
  if (data.birth === undefined) data.birth = null;
  if (data.death === undefined) data.death = null;
  if (!data.nationality) data.nationality = '';
  if (!data.nationalityEn) data.nationalityEn = '';

  // Ensure each point has all required fields
  for (const p of data.points) {
    p.year = p.year ?? null;
    p.yearEnd = p.yearEnd ?? null;
    p.place = p.place || '未知';
    p.placeEn = p.placeEn || 'Unknown';
    if (!Array.isArray(p.coords) || p.coords.length !== 2) {
      p.coords = [0, 0];
    }
    p.title = p.title || p.place;
    p.titleEn = p.titleEn || p.placeEn;
    p.description = p.description || '';
    p.descriptionEn = p.descriptionEn || '';
  }

  // Ensure evaluation exists
  if (!data.evaluation) data.evaluation = {};
  const views = ['supporter', 'critic', 'objective'];
  for (const v of views) {
    if (!data.evaluation[v]) data.evaluation[v] = { zh: '', en: '' };
    if (!data.evaluation[v].zh) data.evaluation[v].zh = '';
    if (!data.evaluation[v].en) data.evaluation[v].en = '';
  }

  // Ensure quotes exist
  if (!data.quotes) data.quotes = {};
  if (!data.quotes.self) data.quotes.self = { zh: '', en: '' };
  if (!data.quotes.others) data.quotes.others = { zh: '', en: '' };
  if (!data.othersBy) data.othersBy = '';
  if (!data.othersByEn) data.othersByEn = '';

  return data;
}

// ── Update index ──
function updateIndex() {
  mkdirSync(PROFILES_DIR, { recursive: true });
  const files = readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
  const index = [];
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(resolve(PROFILES_DIR, f), 'utf-8'));
      index.push({
        personId: data.personId,
        name: data.name,
        nameEn: data.nameEn,
        birth: data.birth,
        death: data.death,
        nationality: data.nationality,
        nationalityEn: data.nationalityEn,
        totalPoints: data.totalPoints,
      });
    } catch { /* skip corrupted */ }
  }
  index.sort((a, b) => (a.birth || 0) - (b.birth || 0));
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
  return index;
}

// ── Round-robin API selection ──
let apiIndex = 0;
function nextApi() {
  const live = API_POOL.filter(a => !a.dead);
  if (live.length === 0) return null;
  const api = live[apiIndex % live.length];
  apiIndex++;
  return api;
}

// ── Process single person ──
async function processPerson(name, existing, stats) {
  // Generate a temporary ID from the name for dedup checking
  // We'll use the AI-generated personId later, but for checking existing we need a heuristic
  // Since we don't know the English name yet, we check if name already exists in existing set
  // This is imperfect but works for resumability — we'll do a name-based check

  // Check if any existing profile has this Chinese name
  if (!FORCE && nameExists(name, existing)) {
    stats.skipped++;
    return;
  }

  const api = nextApi();
  if (!api) {
    console.error(`  ✗ ${name}: No live APIs available`);
    stats.errors++;
    return;
  }

  const system = buildSystemPrompt();
  const user = buildUserPrompt(name);

  console.log(`[${stats.processed + 1}/${stats.total}] ${name} → ${api.name}(${api.model})`);

  try {
    const data = await callAPI(api, [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);

    // Use AI-provided personId, fall back to slug
    const personId = data.personId || slugify(data.nameEn || name);

    // Save profile
    const filePath = resolve(PROFILES_DIR, `${personId}.json`);
    // Don't overwrite unless --force
    if (existsSync(filePath) && !FORCE) {
      console.log(`  ⏭  ${name}: already exists as ${personId}`);
      existing.names.add(data.name || name);
      existing.fuzzyNames.push(data.name || name);
      stats.skipped++;
      return;
    }

    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    existing.names.add(data.name || name);
    existing.fuzzyNames.push(data.name || name);

    // Update index incrementally
    updateIndex();

    stats.generated++;
    const pts = data.points?.length || 0;
    console.log(`  ✓ ${name} → ${personId} (${pts} 地点, ${api.name})`);
  } catch (e) {
    stats.errors++;
    console.error(`  ✗ ${name}: ${e.message}`);
    // Save failed name for retry
    writeFileSync(
      resolve(ROOT, 'scripts/.failed_profiles.txt'),
      `${name}\n`,
      { flag: 'a' },
    );
  }
}

// ── Main ──
async function main() {
  mkdirSync(PROFILES_DIR, { recursive: true });

  // Parse names
  const text = readFileSync(NAMES_FILE, 'utf-8');
  const names = parseNames(text);
  console.log(`Parsed ${names.length} names from people_list.txt\n`);

  // Load existing
  const existing = loadExisting();
  if (FORCE) { existing.names.clear(); existing.fuzzyNames = []; }

  console.log(`Already generated: ${existing.index.length}, to process (new): ${names.filter(n => !nameExists(n, existing)).length}\n`);

  // Clear failed log
  const failedPath = resolve(ROOT, 'scripts/.failed_profiles.txt');
  if (existsSync(failedPath)) writeFileSync(failedPath, '');

  const stats = {
    total: names.length,
    processed: 0,
    generated: 0,
    skipped: 0,
    errors: 0,
  };

  // Filter to only new names
  const queue = names.filter(n => !nameExists(n, existing));
  console.log(`Queue: ${queue.length} names to generate\n`);

  if (queue.length === 0) {
    console.log('All names already generated.');
    updateIndex();
    return;
  }

  // Concurrent worker pool — each worker picks next name from shared queue
  let queueIndex = 0;
  const workers = Math.min(CONCURRENCY, queue.length);

  async function worker(workerId) {
    while (queueIndex < queue.length && stats.generated < LIMIT) {
      const idx = queueIndex++;
      if (idx >= queue.length) break;
      const name = queue[idx];
      // Stagger first request per worker to avoid thundering herd
      if (idx < workers) {
        await new Promise(r => setTimeout(r, idx * 300));
      }
      await processPerson(name, existing, stats);
      stats.processed++;
      // Small delay between requests on same worker
      await new Promise(r => setTimeout(r, 200));
    }
  }

  await Promise.all(Array.from({ length: workers }, (_, i) => worker(i)));

  // Final index update
  const finalIndex = updateIndex();
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Done! Total: ${finalIndex.length} profiles`);
  console.log(`Generated: ${stats.generated}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);

  if (stats.errors > 0) {
    console.log(`Failed names written to scripts/.failed_profiles.txt`);
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
