/**
 * Generate rich ~300-char Chinese polity descriptions via DeepSeek API.
 *
 * Only regenerates entries whose current zh.extract is < 100 chars.
 * Supports resume – already-generated entries are skipped.
 *
 * Usage:  node scripts/generate_rich_descriptions.cjs
 * Env:    DEEPSEEK_API_KEY  (required)
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

// Load .env file
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv(path.join(__dirname, '..', '.env'));

// ── Config ──
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY;
// deepseek-chat = fast/cheap (v4-flash tier)
const MODEL = 'deepseek-chat';
const API_HOST = 'api.deepseek.com';
const API_PATH = '/v1/chat/completions';

const INPUT_FILE = 'public/ne/polity_descriptions.json';
const BACKUP_FILE = 'public/ne/polity_descriptions_backup.json';
const MIN_LENGTH = 100;  // only regenerate if current extract < this

const CONCURRENCY = 15;  // parallel requests
const DELAY_MS = 30;     // inter-request delay
const MAX_RETRIES = 2;

if (!DEEPSEEK_API_KEY) {
  console.error('❌ DEEPSEEK_API_KEY not set in environment.');
  console.error('   Set it and re-run:  DEEPSEEK_API_KEY=sk-xxx node scripts/generate_rich_descriptions.cjs');
  process.exit(1);
}

// ── HTTP helper ──
function chatCompletion(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 600,
      stream: false,
    });

    const req = https.request({
      hostname: API_HOST,
      path: API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`API error: ${json.error.message || JSON.stringify(json.error)}`));
          } else {
            const content = json.choices?.[0]?.message?.content;
            resolve(content || null);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message} — ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Prompt ──
function buildPrompt(entry) {
  const name = entry.name || '';
  const from = entry.from;
  const to = entry.to;
  const existingExtract = entry.zh?.extract || '';

  const yearStr = (from != null && to != null)
    ? (from < 0 ? `约前${Math.abs(from)}年` : `${from}年`) + '至' + (to < 0 ? `前${Math.abs(to)}年` : `${to}年`)
    : '存续时间不详';

  return `请为以下历史政体写一段约300字的中文介绍。请自然流畅地涵盖：建立与崛起过程、鼎盛时期的疆域或影响力、1-2个重大事件或改革、1-2位重要人物、衰落原因与终结方式。

政体名称：${name}
存续时间：${yearStr}
${existingExtract ? `现有简介（供参考）：${existingExtract}` : ''}

请直接输出介绍文字，不要加标题、序号或前缀。控制在300字左右。`;
}

// ── Main ──
async function main() {
  // Load
  console.log('Loading polity descriptions...');
  const descriptions = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const entries = Object.entries(descriptions);
  console.log(`  → ${entries.length} total polities`);

  // Backup original
  if (!fs.existsSync(BACKUP_FILE)) {
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(descriptions, null, 2), 'utf-8');
    console.log(`  → Backup saved to ${BACKUP_FILE}`);
  }

  // Filter: only regenerate brief ones
  const toGenerate = entries.filter(([, v]) => {
    const extract = v.zh?.extract || '';
    return extract.length < MIN_LENGTH;
  });
  console.log(`  → ${toGenerate.length} need regeneration (< ${MIN_LENGTH} chars)`);

  if (toGenerate.length === 0) {
    console.log('  → All descriptions are already detailed enough. Done.');
    return;
  }

  // Process with concurrency
  let done = 0;
  let success = 0;
  let failed = 0;
  const total = toGenerate.length;

  async function processOne(key, entry) {
    const prompt = buildPrompt(entry);
    const messages = [
      { role: 'system', content: '你是一位历史学家，专精世界各文明的政体沿革。你输出的内容严谨、准确、简洁，适合用作历史地图应用中的政体介绍。' },
      { role: 'user', content: prompt },
    ];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await chatCompletion(messages);
        if (result && result.length >= 80) {
          // Update in-place
          if (!descriptions[key].zh) descriptions[key].zh = {};
          descriptions[key].zh.extract = result.trim();
          if (!descriptions[key].zh.title) descriptions[key].zh.title = entry.name;
          return { ok: true };
        }
        // Too short, retry
        if (attempt < MAX_RETRIES) {
          console.warn(`  ⚠ ${entry.name}: generated too short (${result?.length || 0}), retrying...`);
          await delay(500);
        } else {
          return { ok: false, reason: 'too short' };
        }
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          console.warn(`  ⚠ ${entry.name}: ${err.message}, retry ${attempt + 1}/${MAX_RETRIES}`);
          await delay(1000);
        } else {
          return { ok: false, reason: err.message };
        }
      }
    }
    return { ok: false, reason: 'unknown' };
  }

  // Concurrent processing
  const queue = [...toGenerate];

  async function worker() {
    while (queue.length > 0) {
      const [key, entry] = queue.shift();
      const result = await processOne(key, entry);
      done++;
      if (result.ok) success++;
      else failed++;

      // Progress
      if (done % 20 === 0 || done === total) {
        const pct = ((done / total) * 100).toFixed(1);
        console.log(`  📊 ${done}/${total} (${pct}%) | ✅ ${success} | ❌ ${failed} | ⏳ ${queue.length} remaining`);
      }

      // Save periodically
      if (done % 50 === 0) {
        fs.writeFileSync(INPUT_FILE, JSON.stringify(descriptions, null, 2), 'utf-8');
        console.log('  💾 Saved checkpoint');
      }

      await delay(DELAY_MS);
    }
  }

  console.log(`\n🚀 Starting generation with ${CONCURRENCY} concurrent workers...\n`);
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  // Final save
  fs.writeFileSync(INPUT_FILE, JSON.stringify(descriptions, null, 2), 'utf-8');
  console.log(`\n✅ Final save to ${INPUT_FILE}`);
  console.log(`   Total: ${total} | Generated: ${success} | Failed: ${failed}`);

  // Stats
  const lengths = Object.values(descriptions).map(d => (d.zh?.extract || '').length);
  const avg = (lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(0);
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  const over300 = lengths.filter(l => l >= 300).length;
  console.log(`   Lengths: avg=${avg}, min=${min}, max=${max}, >=300: ${over300}/${lengths.length}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
