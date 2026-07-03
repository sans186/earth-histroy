/**
 * Generate Chinese polity descriptions using an LLM API (OpenAI-compatible).
 *
 * Processes polities in batches of 30-50 per API call.
 *
 * Usage:
 *   export LLM_API_KEY=sk-your-key
 *   node scripts/generate_descriptions.cjs
 *
 * Optional env vars:
 *   LLM_ENDPOINT  - API endpoint (default: https://api.deepseek.com/v1/chat/completions)
 *   LLM_MODEL     - model name    (default: deepseek-chat)
 */

const fs = require('fs');
const path = require('path');

const POLITIES_DIR = 'public/ne/polities';
const INPUT_FILE = '/tmp/polities_list.json';
const OUTPUT_FILE = 'public/ne/polity_descriptions.json';
const ZH_NAME_FILE = 'public/ne/polity_names_zh.json';

const BATCH_SIZE = 40; // polities per API call
const API_KEY = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
const API_ENDPOINT = process.env.LLM_ENDPOINT || 'https://api.deepseek.com/v1/chat/completions';
const API_MODEL = process.env.LLM_MODEL || 'deepseek-chat';
const DELAY_MS = 500;

if (!API_KEY) {
  console.error('ERROR: LLM_API_KEY environment variable not set.');
  console.error('Usage:  LLM_API_KEY=sk-your-key node scripts/generate_descriptions.cjs');
  process.exit(1);
}

// ── Load data ──

console.log('Loading polity data...');

if (!fs.existsSync(INPUT_FILE)) {
  // Generate it on the fly
  const files = fs.readdirSync(POLITIES_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
  const polities = new Map();
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(POLITIES_DIR, file), 'utf-8'));
    if (!data.features) continue;
    for (const f of data.features) {
      const wiki = f.properties?.Wikipedia;
      const name = f.properties?.Name;
      if (!wiki || !name) continue;
      if (!polities.has(wiki)) {
        polities.set(wiki, { name, from: f.properties.FromYear, to: f.properties.ToYear });
      }
    }
  }
  const arr = [...polities.entries()].map(([wiki, m]) => ({ wiki, name: m.name, from: m.from, to: m.to }));
  fs.writeFileSync(INPUT_FILE, JSON.stringify(arr, null, 2));
  console.log(`  → Generated ${arr.length} entries`);
} else {
  console.log(`  → Loaded from ${INPUT_FILE}`);
}

let zhNameMap = {};
try { zhNameMap = JSON.parse(fs.readFileSync(ZH_NAME_FILE, 'utf-8')); } catch {}

const allPolities = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
console.log(`  → ${allPolities.length} total polities`);

// ── API call helper ──

async function callAPI(batch) {
  const polityLines = batch.map((p, i) =>
    `${i + 1}. "${p.name}" (${p.wiki}) — ${p.from ?? '?'} ~ ${p.to ?? '?'}`
  ).join('\n');

  const systemPrompt = `你是一位历史学家。为每个历史政权生成一段简洁的中文介绍（80-150字），包含：政权性质、存在时间、地理位置、历史意义。格式要紧凑。`;

  const userPrompt = `请为以下历史政权各生成一段中文介绍。以JSON格式返回，key为序号（"1","2"...），value为介绍文本：

${polityLines}

返回格式：{"1": "介绍...", "2": "介绍..."}`;

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: API_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Extract JSON from response (handle markdown code fences)
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response: ' + content.substring(0, 200));

  return JSON.parse(jsonMatch[1]);
}

// ── Main ──

async function main() {
  // Load existing results to resume if interrupted
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8')); } catch {}
  const existingCount = Object.values(existing).filter(v => v.zh).length;
  console.log(`  → ${existingCount} existing descriptions found\n`);

  // Only process entries that don't already have descriptions
  const todos = allPolities.filter(p => !existing[p.wiki]?.zh);
  console.log(`Need to generate: ${todos.length} polities\n`);

  if (todos.length === 0) {
    console.log('All done!');
    return;
  }

  let completed = 0;
  let failed = 0;

  for (let i = 0; i < todos.length; i += BATCH_SIZE) {
    const batch = todos.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(todos.length / BATCH_SIZE);

    process.stdout.write(`Batch ${batchNum}/${totalBatches} (${batch.length} polities)... `);

    try {
      const result = await callAPI(batch);

      let batchOk = 0;
      let batchFail = 0;
      for (let j = 0; j < batch.length; j++) {
        const key = String(j + 1);
        const description = result[key];
        if (description && description.length > 10) {
          const p = batch[j];
          existing[p.wiki] = {
            name: p.name,
            from: p.from,
            to: p.to,
            zh: { title: p.name, extract: description, thumbnail: null },
          };
          // Use Chinese name from map if available for the title
          if (zhNameMap[p.name]) {
            existing[p.wiki].zh.title = zhNameMap[p.name];
          }
          batchOk++;
        } else {
          batchFail++;
        }
      }
      completed += batchOk;
      failed += batchFail;
      process.stdout.write(`✓ ${batchOk} ok, ${batchFail} fail (total: ${completed}/${todos.length})\n`);

      // Periodically save
      if (batchNum % 5 === 0 || i + BATCH_SIZE >= todos.length) {
        writeOutput(existing);
      }
    } catch (err) {
      failed += batch.length;
      process.stdout.write(`✗ ${err.message.substring(0, 100)}\n`);
    }

    await delay(DELAY_MS);
  }

  // Final save
  writeOutput(existing);
  console.log(`\nDone! ${Object.keys(existing).length} polities total, ${Object.values(existing).filter(v => v.zh).length} with descriptions`);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function writeOutput(data) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), 'utf-8');
  const stats = fs.statSync(OUTPUT_FILE);
  const withZh = Object.values(data).filter(v => v.zh).length;
  console.log(`  [saved: ${(stats.size / 1024).toFixed(0)}KB, ${withZh} described]`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
