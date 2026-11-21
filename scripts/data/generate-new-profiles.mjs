/**
 * Add a small, explicitly curated set of missing profiles.
 *
 *   OPENCODE_API_KEY=... node scripts/data/generate-new-profiles.mjs
 *   ... --dry-run
 *   ... --only han-wudi
 *
 * Scope is deliberately narrow and documented in docs/开源说明.md:
 *   - ancient / early-modern rulers and cultural figures only
 *   - NO modern political figures, NO religious founders, NO ongoing conflicts,
 *     NO evaluative claims about living people
 * Every new profile is marked in docs/ai-generated-fields.json as
 * machine-generated and unverified.
 *
 * Idempotent: an existing warId/personId is never overwritten.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chat, parseJsonLoose, MODEL } from './_opencode-client.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const WARS = resolve(ROOT, 'public/wars/profiles');
const PEOPLE = resolve(ROOT, 'public/people/profiles');
const LOG = resolve(ROOT, 'docs/ai-generated-fields.json');

const args = process.argv.slice(2);
const valueOf = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const DRY = args.includes('--dry-run');
const ONLY = valueOf('--only');

const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const save = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`, 'utf8');
const num = (v, fallback = null) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const validCoords = (c) => Array.isArray(c) && c.length === 2 && Number.isFinite(+c[0]) && Number.isFinite(+c[1]) && Math.abs(+c[0]) <= 180 && Math.abs(+c[1]) <= 90;

/** Curated inclusion list. See docs/数据完整性审计.md for the rationale. */
const NEW_PEOPLE = [
  { personId: 'han-wudi', name: '汉武帝', nameEn: 'Emperor Wu of Han', hint: '西汉第七位皇帝，前156–前87年，长安' },
  { personId: 'tang-taizong', name: '唐太宗', nameEn: 'Emperor Taizong of Tang', hint: '唐朝第二位皇帝，598–649年，长安' },
  { personId: 'zhu-yuanzhang', name: '朱元璋', nameEn: 'Zhu Yuanzhang (Hongwu Emperor)', hint: '明朝开国皇帝，1328–1398年，应天（南京）' },
  { personId: 'kangxi', name: '康熙帝', nameEn: 'Kangxi Emperor', hint: '清朝皇帝，1654–1722年，北京' },
];

const NEW_WARS = [
  { warId: 'first-opium-war', name: '鸦片战争', nameEn: 'First Opium War', hint: '1839–1842，英国与清朝，主要战区为中国东南沿海' },
  { warId: 'second-opium-war', name: '第二次鸦片战争', nameEn: 'Second Opium War', hint: '1856–1860，英法联军与清朝，战区为华南、大沽、京津' },
];

const PERSON_TEMPLATE = {
  personId: '…', name: '…', nameEn: '…', birth: 0, death: 0,
  nationality: '…', nationalityEn: '…', totalPoints: 3, era: '…',
  points: [{
    year: 0, yearEnd: 0, place: '…', placeEn: '…', coords: [0, 0],
    title: '…', titleEn: '…', description: '…', descriptionEn: '…',
  }],
  evaluation: { supporter: { zh: '…', en: '…' }, critic: { zh: '…', en: '…' }, objective: { zh: '…', en: '…' } },
  quotes: { self: { zh: '…', en: '…' } },
};

const WAR_TEMPLATE = {
  warId: '…', name: '…', nameEn: '…', alternativeNames: ['…'],
  startYear: 0, endYear: 0, type: 'major', category: '…', theaters: ['…'],
  summary: '…',
  background: { causes: '…', immediateCause: '…', preWarSituation: '…', objectivesA: '…', objectivesB: '…', precedingConflicts: [] },
  belligerents: {
    sideA: { name: '…', nameEn: '…', commanders: [{ name: '…', role: '…', bio: '…' }], politicalLeaders: [], preWarStrength: { army: '…', navy: '…' } },
    sideB: { name: '…', nameEn: '…', commanders: [], politicalLeaders: [], preWarStrength: { army: '…', navy: '…' } },
  },
  outcome: { result: '…', victoryAnalysis: { winnerFactors: '…', loserFactors: '…' } },
  legacy: { significance: '…', immediateConsequences: '…', longTermEffects: '…' },
  tags: { warfareType: ['…'], geopolitical: ['…'], scale: '…', cause: ['…'] },
  relatedWars: ['…'], sources: ['…'],
  warProcess: { phases: [{
    name: '…', nameEn: '…', startYear: 0, endYear: 0, summary: '…',
    battles: [{ battleId: '…', name: '…', nameEn: '…', startYear: 0, endYear: 0, coords: [0, 0], theater: '…', context: '…', description: '…', result: '…', significance: '…' }],
  }] },
  timeline: [{ year: 0, event: '…', type: '…', description: '…', impact: '…' }],
};

const SYSTEM = [
  '你是世界史数据整理员，只输出严格 JSON 对象，不解释、不加 markdown 围栏。',
  '遵守：只写通行的、稳定的历史事实；不编造具体数字、引文出处、条约原文；',
  '评价保持中立、基于通行史学共识，不做政治定性、不评价当代人物与事件；',
  '中文与英文内容都要给；坐标用 [经度, 纬度]，必须是真实地点的近似值。',
].join('\n');

function ask(template, hint, extra) {
  const user = [
    `请为「${hint}」生成一份与现有档案结构一致的 JSON 档案。`,
    '结构模板（键名与类型必须保留，… 换成真实内容）：',
    JSON.stringify(template, null, 2),
    extra || '',
  ].join('\n');
  return parseJsonLoose(chat({ system: SYSTEM, user, maxTokens: 6500, temperature: 0.2 }));
}

/* ── people ──────────────────────────────────────────────────────────────── */

function normalisePerson(p, spec) {
  if (!p || typeof p !== 'object') throw new Error('不是对象');
  p.personId = spec.personId;
  p.name = spec.name;
  p.nameEn = spec.nameEn;
  p.birth = num(p.birth);
  p.death = num(p.death);
  p.nationality ||= '中国';
  p.nationalityEn ||= 'Chinese';
  p.points = Array.isArray(p.points) ? p.points.filter((x) => x && validCoords(x.coords)) : [];
  if (p.points.length < 2) throw new Error('生平站点少于 2 个或坐标无效');
  for (const pt of p.points) {
    pt.year = num(pt.year, p.birth);
    pt.yearEnd = num(pt.yearEnd, pt.year);
    pt.description ||= '';
    pt.descriptionEn ||= pt.description;
  }
  p.totalPoints = p.points.length;
  p.era ||= (p.birth < 500 ? '古代' : p.birth < 1500 ? '中古' : p.birth < 1800 ? '近世' : '近现代');
  for (const section of ['evaluation', 'quotes']) {
    p[section] ||= {};
    for (const k of section === 'evaluation' ? ['supporter', 'critic', 'objective'] : ['self']) {
      p[section][k] ||= { zh: '', en: '' };
      p[section][k].zh ||= '';
      p[section][k].en ||= '';
    }
  }
  return p;
}

function generatePeople(log) {
  const idxPath = resolve(PEOPLE, 'index.json');
  let idx = load(idxPath);
  for (const spec of NEW_PEOPLE) {
    if (ONLY && ONLY !== spec.personId) continue;
    const path = resolve(PEOPLE, `${spec.personId}.json`);
    if (existsSync(path)) {
      if (!DRY && !idx.some((x) => x.personId === spec.personId)) {
        // Self-heal: the profile survived but the index was rolled back.
        const p = load(path);
        idx.push({
          personId: p.personId, name: p.name, nameEn: p.nameEn,
          birth: p.birth, death: p.death, nationality: p.nationality,
          nationalityEn: p.nationalityEn, totalPoints: p.totalPoints, era: p.era,
        });
        save(idxPath, idx);
        console.log(`[reindex] ${spec.personId}: 档案在但索引缺失，已补回`);
      } else {
        console.log(`[skip] ${spec.personId} 已存在`);
      }
      continue;
    }
    console.log(`[new person] ${spec.name} (${spec.personId})`);
    if (DRY) continue;
    const p = normalisePerson(ask(PERSON_TEMPLATE, `${spec.name} / ${spec.nameEn} — ${spec.hint}`,
      'points 给 3–4 个生平阶段，每阶段都要有中文与英文描述、真实地点近似坐标。evaluation 的 objective 要中立。quotes.self 若无可信传世语录，写「无可靠传世语录」及英文说明，不要编造。'), spec);
    save(path, p);
    idx.push({
      personId: p.personId, name: p.name, nameEn: p.nameEn,
      birth: p.birth, death: p.death, nationality: p.nationality,
      nationalityEn: p.nationalityEn, totalPoints: p.totalPoints, era: p.era,
    });
    save(idxPath, idx);
    log.newProfiles ??= { people: [], wars: [] };
    if (!log.newProfiles.people.includes(spec.personId)) log.newProfiles.people.push(spec.personId);
    save(LOG, { ...log, model: MODEL, updatedAt: new Date().toISOString().slice(0, 10) });
    console.log(`  写入 ${p.points.length} 个生平站点`);
  }
  // Rebuild the flattened coordinate lookup used by the polity filter.
  if (!DRY) {
    try {
      execFileSync(process.execPath, [resolve(ROOT, 'scripts/data/build-people-coords.mjs')], { stdio: 'pipe' });
      console.log('  已重建 people/coords.json');
    } catch (e) { console.log(`  [警告] coords.json 重建失败: ${e.message}`); }
  }
}

/* ── wars ────────────────────────────────────────────────────────────────── */

function normaliseWar(w, spec) {
  if (!w || typeof w !== 'object') throw new Error('不是对象');
  w.warId = spec.warId;
  w.name = spec.name;
  w.nameEn = spec.nameEn;
  w.startYear = num(w.startYear);
  w.endYear = num(w.endYear);
  w.type ||= 'major';
  w.category ||= '战争';
  w.summary ||= '';
  w.theaters = Array.isArray(w.theaters) ? w.theaters.filter((x) => typeof x === 'string') : [];
  w.alternativeNames = Array.isArray(w.alternativeNames) ? w.alternativeNames : [];
  w.relatedWars = Array.isArray(w.relatedWars) ? w.relatedWars : [];
  w.sources = Array.isArray(w.sources) ? w.sources : [];
  for (const k of ['background', 'belligerents', 'outcome', 'legacy', 'tags', 'warProcess']) {
    w[k] ||= {};
  }
  w.warProcess.phases = Array.isArray(w.warProcess.phases) ? w.warProcess.phases : [];
  w.timeline = Array.isArray(w.timeline) ? w.timeline : [];
  for (const phase of w.warProcess.phases) {
    phase.battles = Array.isArray(phase.battles) ? phase.battles.filter((b) => b && validCoords(b.coords)) : [];
  }
  const battles = w.warProcess.phases.flatMap((p) => p.battles);
  if (!w.startYear || !w.endYear || !battles.length) throw new Error('年份或带坐标的战役缺失');
  return { war: w, battles };
}

function generateWars(log) {
  const idxPath = resolve(WARS, 'index.json');
  const locPath = resolve(WARS, 'war_locations.json');
  let idx = load(idxPath);
  let loc = load(locPath);
  for (const spec of NEW_WARS) {
    if (ONLY && ONLY !== spec.warId) continue;
    const path = resolve(WARS, `${spec.warId}.json`);
    if (existsSync(path)) {
      if (!DRY && !idx.some((x) => x.warId === spec.warId)) {
        const w = load(path);
        idx.push({
          warId: w.warId, name: w.name, nameEn: w.nameEn,
          startYear: w.startYear, endYear: w.endYear, type: w.type,
          category: w.category, tags: w.tags, summary: w.summary,
          totalBattles: (w.warProcess?.phases ?? []).flatMap((p) => p.battles ?? []).length,
        });
        save(idxPath, idx);
        console.log(`[reindex] ${spec.warId}: 档案在但索引缺失，已补回`);
      } else {
        console.log(`[skip] ${spec.warId} 已存在`);
      }
      continue;
    }
    console.log(`[new war] ${spec.name} (${spec.warId})`);
    if (DRY) continue;
    const { war, battles } = normaliseWar(ask(WAR_TEMPLATE, `${spec.name} / ${spec.nameEn} — ${spec.hint}`,
      'warProcess.phases 给 2–3 个阶段，每阶段至少 1 场战役且必须带 [经度,纬度] 坐标；timeline 至少 4 条。sources 只给公认的权威史料或通史著作名，不要编造页码或 URL。叙述保持史实中立，不做当代政治引申。'), spec);
    save(path, war);
    idx.push({
      warId: war.warId, name: war.name, nameEn: war.nameEn,
      startYear: war.startYear, endYear: war.endYear, type: war.type,
      category: war.category, tags: war.tags, summary: war.summary,
      totalBattles: battles.length,
    });
    const lon = battles.map((b) => +b.coords[0]).sort((a, b) => a - b)[Math.floor(battles.length / 2)];
    const lat = battles.map((b) => +b.coords[1]).sort((a, b) => a - b)[Math.floor(battles.length / 2)];
    loc[war.name] = { lon: Number(lon.toFixed(2)), lat: Number(lat.toFixed(2)), battles: battles.length };
    save(idxPath, idx);
    save(locPath, loc);
    log.newProfiles ??= { people: [], wars: [] };
    if (!log.newProfiles.wars.includes(spec.warId)) log.newProfiles.wars.push(spec.warId);
    save(LOG, { ...log, model: MODEL, updatedAt: new Date().toISOString().slice(0, 10) });
    console.log(`  写入 ${battles.length} 场战役，中心点 ${loc[war.name].lon},${loc[war.name].lat}`);
  }
}

/* ── main ─────────────────────────────────────────────────────────────────── */

const log = existsSync(LOG) ? load(LOG) : { note: '由大模型生成的字段清单；这些字段未逐条人工核验', wars: {}, people: {} };
generatePeople(log);
generateWars(log);
console.log(DRY ? '\n[dry-run] 未写盘' : '\n完成。新增档案见 docs/ai-generated-fields.json 的 newProfiles');
