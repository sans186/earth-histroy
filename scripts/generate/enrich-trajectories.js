#!/usr/bin/env node
/**
 * enrich-trajectories.js
 *
 * Reads trajectory JSON files, sends each person's full timeline to DeepSeek API
 * to generate rich descriptions (intro, works, relatedPeople, context) for each point.
 *
 * Skips points that already have AI-generated fields (checks for `works` array).
 * Run multiple times safely – only processes points missing AI enrichment.
 *
 * Usage:  node scripts/enrich-trajectories.js
 *         DEEPSEEK_API_KEY must be set in environment
 *
 * Options:
 *   --force   Re-generate all points (ignore existing AI fields)
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (no dotenv dependency needed)
const ENV_PATH = resolve(__dirname, '../.env');
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([\w_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
const TRAJ_DIR = resolve(__dirname, '../public/trajectories');
const INDEX_PATH = resolve(TRAJ_DIR, 'index.json');

const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-v4-flash';

const AI_FIELDS = ['achievements']; // presence of 'achievements' => already enriched
const FORCE = process.argv.includes('--force');

function needsEnrichment(point) {
  return AI_FIELDS.every(f =>
    point[f] === undefined || point[f] === null ||
    (Array.isArray(point[f]) && point[f].length === 0)
  );
}

async function callDeepSeek(messages, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: 0.3,
          max_tokens: 8192,
          response_format: { type: 'json_object' },
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${text.substring(0, 200)}`);
      }
      const data = await resp.json();
      let content = JSON.parse(data.choices[0].message.content);
      // Wrap single-object result into array if needed
      if (content && !Array.isArray(content) && content.points) content = content.points;
      if (content && !Array.isArray(content) && typeof content === 'object') {
        // Try to find an array in the object
        const arr = Object.values(content).find(v => Array.isArray(v));
        if (arr) content = arr;
      }
      return Array.isArray(content) ? content : [];
    } catch (e) {
      if (attempt < retries) {
        const wait = (attempt + 1) * 2000;
        console.error(`  [retry ${attempt + 1}/${retries}] ${e.message}`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw e;
      }
    }
  }
}

function buildPrompt(person, points) {
  const yearStr = (y) => y ? `${y}年` : '不详';

  const timeline = points.map((p, i) => {
    const parts = [`${i}. ${yearStr(p.year)}`];
    if (p.yearEnd) parts.push(`-${yearStr(p.yearEnd)}`);
    parts.push(`地点：${p.place}，类型：${p.type}`);
    if (p.office) parts.push(`官职：${p.office}`);
    return parts.join('，');
  }).join('\n');

  return {
    system: `你是一位中国历史专家。为历史人物的每个轨迹点生成详细介绍。
输出一个JSON数组，每个元素格式：
{
  "index": 点序号(整数),
  "intro": "2-3句，此人在此地做了什么、为何来此（赴任/贬谪/避乱/游历等）",
  "achievements": ["在此地的成就或贡献（筑城/著书/办学/政绩等），无则[]"],
  "relatedPeople": ["此地交往的重要人物及关系，无则[]"],
  "context": "1-2句时代背景"
}
基于史实，不确定的字段用空数组。地点保留原文。结合官职说明具体作为。`,
    user: `人物：${person.name}（${person.birth || '?'}-${person.death || '?'}，${person.dynasty}）

轨迹点列表：
${timeline}`,
  };
}

async function main() {
  if (!API_KEY) {
    console.error('Error: DEEPSEEK_API_KEY not set in environment');
    process.exit(1);
  }

  if (!existsSync(INDEX_PATH)) {
    console.error('Error: trajectories index not found. Run "npm run build:trajectories" first.');
    process.exit(1);
  }

  const CONCURRENCY = 8; // parallel API calls
  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));

  // Only process people with 5+ trajectory points
  const queue = index.filter(p => p.totalPoints >= 5);

  console.log(`Trajectory AI Enrichment (${FORCE ? '--force' : 'skip existing'})`);
  console.log(`Model: ${MODEL}, Targets: ${queue.length} persons (5+ points), Concurrency: ${CONCURRENCY}\n`);

  let enrichedPoints = 0;
  let skippedPersons = 0;
  let errors = 0;

  async function processPerson(person) {
    const filePath = resolve(TRAJ_DIR, `${person.personId}.json`);
    if (!existsSync(filePath)) return;

    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    const pts = data.points || [];

    const needEnrich = pts
      .map((p, i) => (FORCE || needsEnrichment(p)) ? i : -1)
      .filter(i => i >= 0);

    if (needEnrich.length === 0) {
      skippedPersons++;
      return;
    }

    console.log(`${data.name}（${data.dynasty}, ${pts.length}点/${needEnrich.length}待生成）`);

    const { system, user } = buildPrompt(person, pts);

    try {
      const results = await callDeepSeek([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]);

      let matchCount = 0;
      for (const r of results) {
        const idx = r.index;
        if (idx === undefined || idx < 0 || idx >= pts.length) continue;
        if (!FORCE && !needsEnrichment(pts[idx])) continue;

        pts[idx].intro = r.intro || pts[idx].intro;
        pts[idx].achievements = r.achievements || [];
        pts[idx].relatedPeople = r.relatedPeople || [];
        pts[idx].context = r.context || '';
        matchCount++;
      }

      if (matchCount > 0) {
        data.points = pts;
        writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        enrichedPoints += matchCount;
        console.log(`  ✓ ${data.name}: ${matchCount}个点已生成`);
      } else {
        console.warn(`  △ ${data.name}: 返回${results.length}条但未匹配`);
        errors++;
      }
    } catch (e) {
      console.error(`  ✗ ${data.name}: ${e.message}`);
      errors++;
    }
  }

  // Process in parallel batches
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    const batch = queue.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(p => processPerson(p)));
  }

  console.log(`\n[Done] 新生成${enrichedPoints}个点，跳过${skippedPersons}人，失败${errors}人`);
}

main();
