#!/usr/bin/env node
/**
 * pipeline.js — One-stop war generation pipeline.
 * Usage: node scripts/generate/pipeline.js
 *
 * Reads war_list (one war name per line), generates for new wars:
 *   Phase 1: Base data (background, belligerents, outcome, legacy, tags)
 *   Phase 2: Battles (phases with battles)
 *   Phase 3: Timeline (key events)
 *   Phase 4: Deep analysis (cognitiveWarfare, economics, geography)
 *   Final: Update index.json
 *
 * Skips already-generated wars. Uses ZHIPU_API_KEY_2-5 concurrently.
 * All content in Chinese.
 *
 * @deprecated Superseded by generate-wars.mjs. Two reasons:
 *   - it matches wars by their Chinese display name, so a renamed war is
 *     regenerated and overwrites an existing profile;
 *   - its phase 3 / phase 4 JSON extraction never parsed, so timelines and deep
 *     analysis were silently never written (see war_issue.md).
 *   Kept only as a reference for the 4-phase layout. Do not extend it.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// Load .env
const ENV_PATH = resolve(ROOT, '.env');
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([\w_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PROFILES_DIR = resolve(ROOT, 'public/wars/profiles');
const WAR_LIST = resolve(ROOT, 'war_list');
mkdirSync(PROFILES_DIR, { recursive: true });

// API Pool
const API_POOL = [];
for (const [key, model] of [
  ['ZHIPU_API_KEY_2', 'glm-4-plus'], ['ZHIPU_API_KEY_3', 'glm-4-plus'],
  ['ZHIPU_API_KEY_4', 'glm-4-plus'], ['ZHIPU_API_KEY_5', 'glm-4-plus'],
]) {
  if (process.env[key]) {
    API_POOL.push({
      name: key.toLowerCase(),
      url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      key: process.env[key],
      model,
    });
  }
}

// ── Utilities ──

function slugify(text) {
  return text.toLowerCase().replace(/[^\w一-鿿]+/g, '-').replace(/^-+|-+$/g, '') || 'war';
}

function loadWar(warId) {
  return JSON.parse(readFileSync(resolve(PROFILES_DIR, warId + '.json'), 'utf-8'));
}

function saveWar(warId, data) {
  writeFileSync(resolve(PROFILES_DIR, warId + '.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function updateIndex() {
  const files = readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
  const index = [];
  for (const f of files) {
    try {
      const d = JSON.parse(readFileSync(resolve(PROFILES_DIR, f), 'utf-8'));
      index.push({
        warId: d.warId, name: d.name, nameEn: d.nameEn,
        startYear: d.startYear, endYear: d.endYear,
        type: d.type, category: d.category,
        tags: d.tags || {}, summary: d.summary,
        totalBattles: (d.warProcess?.phases || []).reduce((s, p) => s + (p.battles?.length || 0), 0)
          || (d.warProcess?.majorBattles?.length || 0),
      });
    } catch {}
  }
  index.sort((a, b) => (a.startYear || 0) - (b.startYear || 0));
  writeFileSync(resolve(PROFILES_DIR, 'index.json'), JSON.stringify(index, null, 2), 'utf-8');
  return index;
}

// ── JSON Repair ──

function repairJSON(text) {
  let t = String(text).replace(/^﻿/, '').trim();
  t = t.replace(/```(?:json)?\s*/gi, '').replace(/\s*```/gi, '').trim();
  const CJK = '一-鿿　-〿＀-￯ -⁯';
  // Chinese ASCII quotes → curly quotes
  t = t.replace(new RegExp(`([${CJK}])\x22([^\x22]{1,40})\x22([${CJK}])`, 'g'), '$1“$2”$3');
  t = t.replace(new RegExp(`([${CJK}])\x22([${CJK}])`, 'g'), '$1“$2');
  // Missing brackets around coords
  t = t.replace(/"coords"\s*:\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/g, '"coords":[$1,$2]');
  // Missing comma after number before CJK key
  t = t.replace(/(\d)"([a-zA-Z一-鿿])/g, '$1,"$2');
  // Number ranges as values
  t = t.replace(/:\s*(\d+)-(\d+)([,\s\r\n}])/g, ':"约$1-$2人"$3');
  // Trailing commas
  t = t.replace(/,\s*([}\]])/g, '$1');
  return t;
}

function parseJSON(text) {
  const t = repairJSON(text);
  // Direct parse
  try { return JSON.parse(t); } catch (e) {}
  // Fix unescaped newlines in strings
  try {
    let r = '', s = false, esc = false;
    for (const ch of t) {
      if (esc) { r += ch; esc = false; continue; }
      if (ch === '\\') { r += ch; esc = true; continue; }
      if (ch === '"') { s = !s; r += ch; continue; }
      if (s && ch === '\n') { r += '\\n'; continue; }
      if (s && ch === '\r') { r += '\\r'; continue; }
      if (s && ch === '\t') { r += '\\t'; continue; }
      r += ch;
    }
    return JSON.parse(r.replace(/,\s*([}\]])/g, '$1'));
  } catch (e) {}
  // Bracket extraction
  const sO = t.indexOf('{'), sA = t.indexOf('[');
  if (sO === -1 && sA === -1) return null;
  const start = sO === -1 ? sA : (sA === -1 ? sO : Math.min(sO, sA));
  let depth = 0, ins = false, esc2 = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (esc2) { esc2 = false; continue; }
    if (ch === '\\') { esc2 = true; continue; }
    if (ch === '"') { ins = !ins; continue; }
    if (ins) continue;
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') { depth--; if (depth === 0) { try { return JSON.parse(t.substring(start, i + 1)); } catch (e) { break; } } }
  }
  // Auto-close brackets
  try {
    let ob = 0, cb = 0;
    for (const ch of t) { if (ch === '{') ob++; if (ch === '}') ob--; if (ch === '[') cb++; if (ch === ']') cb--; }
    return JSON.parse(t + ']'.repeat(Math.max(0, cb)) + '}'.repeat(Math.max(0, ob)));
  } catch (e) {}
  return null;
}

// ── API ──

let apiIdx = 0;
async function callAPI(system, user, maxTokens = 4096) {
  const api = API_POOL[apiIdx++ % API_POOL.length];
  const resp = await fetch(api.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api.key}` },
    body: JSON.stringify({ model: api.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, max_tokens: maxTokens }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 401 || resp.status === 403 ||
        (resp.status === 429 && text.includes('余额不足'))) {
      API_POOL.splice(API_POOL.findIndex(a => a.name === api.name), 1);
      console.error(`  [!] ${api.name} DEAD (${API_POOL.length} left)`);
    }
    throw new Error(`HTTP ${resp.status}: ${text.substring(0, 200)}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// ═══════════════════════════════════════
// PHASE 1: Base war data
// ═══════════════════════════════════════

const P1_SYSTEM = `你是军事史专家。为指定战争生成完整的中文资料。输出严格JSON：

{
  "warId": "英文slug",
  "name": "战争中文名",
  "nameEn": "English name",
  "alternativeNames": [],
  "startYear": 年份,
  "endYear": 年份,
  "type": "major或minor",
  "category": "独立战争/内战/世界大战/殖民战争/代理人战争/王朝战争/领土战争/宗教战争/反恐战争",
  "theaters": ["战区"],
  "summary": "简述50字",
  "background": {
    "causes": "根本原因",
    "immediateCause": "直接导火索",
    "preWarSituation": "战前局势",
    "objectivesA": "A方目标",
    "objectivesB": "B方目标",
    "precedingConflicts": []
  },
  "belligerents": {
    "sideA": {
      "name":"A方名称","nameEn":"English",
      "countries":[{"name":"国名","entryYear":年,"exitYear":年}],
      "commanders":[{"name":"姓名","role":"职务","bio":"简介"}],
      "politicalLeaders":[{"name":"姓名","role":"职务","bio":"简介"}],
      "militarySystem":{"recruitment":"兵制","organization":"编制","logistics":"后勤"},
      "preWarStrength":{"army":"陆军","navy":"海军","airForce":"空军","armor":"装甲","specialForces":"特种","reserves":"预备役"},
      "equipment":[{"name":"装备名","quantity":"数量","description":"描述"}],
      "industrialCapacity":"工业能力",
      "economicStrength":"经济实力",
      "totalCasualties":{"dead":"阵亡","wounded":"受伤","captured":"被俘","missing":"失踪","civilian":"平民"},
      "warCrimes":[],
      "propaganda":{"slogans":[],"themes":[],"methods":[]}
    },
    "sideB": { 同上结构 }
  },
  "neutralParties": [],
  "outcome": {
    "result":"战争结果",
    "victoryAnalysis":{"winnerFactors":"胜方分析","loserFactors":"败方分析"},
    "treaty":{"name":"条约名","date":"日期","content":"内容"},
    "territorialChanges":"领土变更",
    "economicCost":"经济代价",
    "demographicImpact":"人口影响"
  },
  "legacy": {
    "significance":"历史意义",
    "immediateConsequences":"直接后果",
    "longTermImpact":{"political":"政治","military":"军事","economic":"经济","social":"社会"},
    "culturalLegacy":{"memorials":[],"observances":[],"media":[]}
  },
  "tags": {"warfareType":[],"geopolitical":[],"scale":"global/regional/local","cause":[]},
  "relatedWars":[],
  "sources":[]
}

注意：字符串内用「」代替英文引号。兵力用「约X万人」。只输出JSON。`

async function phase1_generateBase(warName) {
  const content = await callAPI(P1_SYSTEM, `请生成"${warName}"的完整战争资料。全部中文。直接输出JSON。`, 8192);
  const result = parseJSON(content);
  if (!result) throw new Error(`parse failed (len=${content.length})`);
  result.warId = result.warId || slugify(result.nameEn || warName);
  if (!result.warProcess) result.warProcess = { phases: [], majorBattles: [] };
  saveWar(result.warId, result);
  console.log(`  P1 ✓ ${warName} → ${result.warId} (${result.type}, ${result.startYear}-${result.endYear})`);
  return result;
}

// ═══════════════════════════════════════
// PHASE 2: Battles
// ═══════════════════════════════════════

const P2_SYSTEM = `你是军事史专家。列出战争阶段的战役。输出严格JSON：
{"name":"阶段名","nameEn":"English","startYear":年,"endYear":年,"summary":"概述","battles":[
  {"battleId":"英文slug","name":"战役名","nameEn":"English","startYear":年,"endYear":年,"coords":[经度,纬度],"theater":"战区","context":"背景","description":"经过150-200字","result":"结果","significance":"意义","casualties":{"sideA":"约X人","sideB":"约X人"},"forces":{"sideA":"兵力","sideB":"兵力"},"commanders":[{"name":"指挥官","role":"职务","side":"sideA或sideB"}]}
]}
注意：字符串内用「」代替英文引号。coords必须是[经度,纬度]数组。每阶段4-5场战役。只输出JSON。`

async function phase2_genPhase(warName, warYears, desc) {
  const content = await callAPI(P2_SYSTEM, `为${warName}(${warYears})的【${desc}】列出4-5场关键战役。全部中文。`);
  const r = parseJSON(content);
  return r?.battles?.length > 0 ? r : null;
}

async function phase2_addBattles(warId) {
  const war = loadWar(warId);
  const existing = (war.warProcess?.phases || []).reduce((s, p) => s + (p.battles?.length || 0), 0)
    + (war.warProcess?.majorBattles?.length || 0);
  if (existing > 0) {
    console.log(`  P2 ⏭ ${war.name}: ${existing} battles exist`);
    return;
  }

  const duration = war.endYear - war.startYear;
  let descs;
  if (duration > 50) descs = ['早期战役', '中期战役', '转折战役', '后期战役'];
  else if (duration > 5) descs = ['战争初期', '战争中期', '战争后期'];
  else if (duration > 1) descs = ['战争爆发', '战争进程'];
  else descs = ['主要战役'];

  const phases = [];
  for (const desc of descs) {
    const phase = await phase2_genPhase(war.name, `${war.startYear}-${war.endYear}`, desc);
    if (phase) {
      phases.push(phase);
    } else {
      console.error(`    ✗ ${war.name} "${desc}" failed`);
    }
  }

  if (phases.length > 0) {
    phases.sort((a, b) => (a.startYear || 0) - (b.startYear || 0));
    war.warProcess = { phases, majorBattles: [] };
    saveWar(warId, war);
    const n = phases.reduce((s, p) => s + (p.battles?.length || 0), 0);
    console.log(`  P2 ✓ ${war.name}: ${phases.length} phases, ${n} battles`);
  } else {
    console.log(`  P2 ✗ ${war.name}: all phases failed`);
  }
}

// ═══════════════════════════════════════
// PHASE 3: Timeline
// ═══════════════════════════════════════

const P3_SYSTEM = `你是军事史专家。列出战争关键事件。输出JSON数组：
[{"year":年,"event":"事件","type":"decision/crisis/diplomacy/leadership","description":"说明","impact":"影响"}]
5个条目。字符串内用「」代替英文引号。全部中文。只输出JSON数组。`

async function phase3_addTimeline(warId) {
  const war = loadWar(warId);
  if (war.timeline?.length > 0) {
    console.log(`  P3 ⏭ ${war.name}: ${war.timeline.length} tl exist`);
    return;
  }

  const all = [];
  for (let b = 0; b < 2; b++) {
    const order = b === 0 ? '前' : '后';
    try {
      const content = await callAPI(P3_SYSTEM, `列出"${war.name}"(${war.startYear}-${war.endYear})${order}5个关键事件。`);
      const r = parseJSON(content);
      const items = Array.isArray(r) ? r : r?.timeline;
      if (items?.length > 0) all.push(...items);
    } catch {}
  }

  if (all.length > 0) {
    all.sort((a, b) => a.year - b.year);
    war.timeline = all.filter((item, i) => i === 0 || item.event !== all[i - 1].event);
    saveWar(warId, war);
    console.log(`  P3 ✓ ${war.name}: ${war.timeline.length} tl`);
  } else {
    console.log(`  P3 ✗ ${war.name}: tl failed`);
  }
}

// ═══════════════════════════════════════
// PHASE 4: Deep Analysis
// ═══════════════════════════════════════

async function phase4_genCW(warName, warYears, belligerents) {
  const system = `你是军事史与信息战专家。生成认知战/信息操控分析。输出严格JSON：
{"psyOps":["手段1","手段2","手段3"],"propagandaComparison":"双方宣传对比分析200-300字","collaborationists":["伪政权/合作者"],"informationWarfare":"信息战/舆论战分析150-200字"}
字符串内用「」代替英文引号。全部中文。只输出JSON。`;
  const desc = belligerents ? `双方：${belligerents}` : '';
  const content = await callAPI(system, `分析"${warName}"(${warYears})的认知战与信息操控。${desc}`);
  return parseJSON(content);
}

async function phase4_genEcon(warName, warYears) {
  const system = `你是战争经济学专家。生成经济分析。输出严格JSON：
{"resourceDependency":{"sideA":{"summary":"资源依赖100-150字"},"sideB":{"summary":"资源依赖100-150字"}},"foreignAid":[{"from":"援助方","to":"受援方","program":"计划名","content":"援助内容"}],"warBudget":"战争总开支估算","economicDisruption":"经济破坏描述"}
字符串内用「」代替英文引号。全部中文。只输出JSON。`;
  const content = await callAPI(system, `分析"${warName}"(${warYears})的战争经济学。`);
  return parseJSON(content);
}

async function phase4_genGeo(warName, warYears) {
  const system = `你是军事地理专家。生成地理与气候分析。输出严格JSON：
{"keyObstacles":[{"name":"地形/障碍名","description":"作用描述50-100字"}],"extremeWeather":[{"year":年份,"event":"事件名","description":"对战争影响描述"}],"nonCombatLosses":"非战斗减员描述"}
列出2-4个关键地形/天气因素。字符串内用「」。全部中文。只输出JSON。`;
  const content = await callAPI(system, `分析"${warName}"(${warYears})的地理与气候因素。`);
  return parseJSON(content);
}

async function phase4_deepAnalysis(warId) {
  const war = loadWar(warId);
  const wp = war.warProcess;
  const sideA = war.belligerents?.sideA?.name || '';
  const sideB = war.belligerents?.sideB?.name || '';
  const bi = sideA && sideB ? `${sideA} vs ${sideB}` : '';

  const tasks = [];
  const needs = { cw: false, econ: false, geo: false };

  if (!wp.cognitiveWarfare?.psyOps) { needs.cw = true; tasks.push(phase4_genCW(war.name, `${war.startYear}-${war.endYear}`, bi)); }
  if (!wp.economics?.resourceDependency) { needs.econ = true; tasks.push(phase4_genEcon(war.name, `${war.startYear}-${war.endYear}`)); }
  if (!wp.geography?.keyObstacles) { needs.geo = true; tasks.push(phase4_genGeo(war.name, `${war.startYear}-${war.endYear}`)); }

  if (tasks.length === 0) {
    console.log(`  P4 ⏭ ${war.name}: all deep fields exist`);
    return;
  }

  const results = await Promise.allSettled(tasks);
  let idx = 0;

  if (needs.cw) {
    const r = results[idx++];
    if (r.status === 'fulfilled' && r.value) wp.cognitiveWarfare = r.value;
  }
  if (needs.econ) {
    const r = results[idx++];
    if (r.status === 'fulfilled' && r.value) wp.economics = r.value;
  }
  if (needs.geo) {
    const r = results[idx++];
    if (r.status === 'fulfilled' && r.value) wp.geography = r.value;
  }

  war.warProcess = wp;
  saveWar(warId, war);

  const ok = (v, k) => v?.[k] ? '✓' : '✗';
  console.log(`  P4 ${war.name}: CW=${ok(wp.cognitiveWarfare, 'psyOps')} Econ=${ok(wp.economics, 'resourceDependency')} Geo=${ok(wp.geography, 'keyObstacles')}`);
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════╗');
  console.log('║  War Generation Pipeline        ║');
  console.log('╚══════════════════════════════════╝');
  console.log(`APIs: ${API_POOL.map(a => a.name).join(', ')} (${API_POOL.length} live)\n`);

  if (!existsSync(WAR_LIST)) {
    console.error('ERROR: war_list not found!');
    process.exit(1);
  }

  // Read war_list
  const allWars = readFileSync(WAR_LIST, 'utf-8')
    .split(/[\n\r]+/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  // Load existing index
  let existingNames = new Set();
  const idxPath = resolve(PROFILES_DIR, 'index.json');
  if (existsSync(idxPath)) {
    try { existingNames = new Set(JSON.parse(readFileSync(idxPath, 'utf-8')).map(w => w.name)); } catch {}
  }

  const newWars = allWars.filter(n => !existingNames.has(n));
  console.log(`war_list: ${allWars.length} total | ${existingNames.size} done | ${newWars.length} new\n`);

  // Also check existing wars for incomplete fields
  const allWarIds = [];
  for (const name of allWars) {
    const files = readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
    let found = null;
    for (const f of files) {
      try {
        const d = JSON.parse(readFileSync(resolve(PROFILES_DIR, f), 'utf-8'));
        if (d.name === name) { found = d.warId; break; }
      } catch {}
    }
    if (found) allWarIds.push(found);
  }

  const needsP2 = [], needsP3 = [], needsP4 = [];
  for (const wid of allWarIds) {
    try {
      const w = loadWar(wid);
      const b = (w.warProcess?.phases || []).reduce((s, p) => s + (p.battles?.length || 0), 0)
        + (w.warProcess?.majorBattles?.length || 0);
      if (b === 0) needsP2.push(wid);
      if (!w.timeline?.length) needsP3.push(wid);
      if (!w.warProcess?.cognitiveWarfare?.psyOps ||
          !w.warProcess?.economics?.resourceDependency ||
          !w.warProcess?.geography?.keyObstacles) needsP4.push(wid);
    } catch {}
  }

  // Phase 1: New wars
  for (const name of newWars) {
    console.log(`\n── P1: ${name} ──`);
    try {
      const r = await phase1_generateBase(name);
      allWarIds.push(r.warId);
      needsP2.push(r.warId);
      needsP3.push(r.warId);
      needsP4.push(r.warId);
    } catch (e) {
      console.error(`  P1 ✗ ${name}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  updateIndex();

  // Phase 2: Battles
  if (needsP2.length > 0) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`PHASE 2: Battles — ${needsP2.length} wars`);
    console.log('='.repeat(50));
    for (let i = 0; i < needsP2.length; i += 4) {
      await Promise.allSettled(needsP2.slice(i, i + 4).map(id => phase2_addBattles(id)));
      if (i + 4 < needsP2.length) await new Promise(r => setTimeout(r, 1500));
    }
    updateIndex();
  }

  // Phase 3: Timelines
  if (needsP3.length > 0) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`PHASE 3: Timelines — ${needsP3.length} wars`);
    console.log('='.repeat(50));
    await Promise.allSettled(needsP3.map(id => phase3_addTimeline(id)));
    updateIndex();
  }

  // Phase 4: Deep Analysis
  if (needsP4.length > 0) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`PHASE 4: Deep Analysis — ${needsP4.length} wars`);
    console.log('='.repeat(50));
    for (let i = 0; i < needsP4.length; i += 4) {
      await Promise.allSettled(needsP4.slice(i, i + 4).map(id => phase4_deepAnalysis(id)));
      if (i + 4 < needsP4.length) await new Promise(r => setTimeout(r, 1500));
    }
  }

  // Final report
  const index = updateIndex();
  console.log(`\n${'='.repeat(50)}`);
  console.log('FINAL STATUS');
  console.log('='.repeat(50));
  let totalB = 0, totalTl = 0;
  for (const w of index) {
    try {
      const d = loadWar(w.warId);
      const b = w.totalBattles;
      const t = d.timeline?.length || 0;
      totalB += b; totalTl += t;
      const ok = (o, k) => o?.[k] ? '✓' : '✗';
      console.log(`  ${w.name}: ${b} battles, ${t} tl | CW:${ok(d.warProcess?.cognitiveWarfare, 'psyOps')} Econ:${ok(d.warProcess?.economics, 'resourceDependency')} Geo:${ok(d.warProcess?.geography, 'keyObstacles')}`);
    } catch {}
  }
  console.log(`\n  TOTAL: ${index.length} wars, ${totalB} battles, ${totalTl} timeline entries`);
  console.log('Done!');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
