/**
 * Minimal OpenAI-compatible chat client for the data-enrichment scripts.
 *
 * The host machine reaches the internet through an HTTP proxy whose port
 * changes between sessions. Node's global fetch ignores HTTP_PROXY on this
 * Node version, so we shell out to curl (which honours the proxy env vars)
 * instead of adding a dependency or hard-coding a proxy address.
 *
 * Credentials are read ONLY from OPENCODE_API_KEY. Never write them to disk,
 * never print them, never put them in generated data.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const ENDPOINT =
  process.env.OPENCODE_BASE_URL || 'https://opencode.ai/inference/go/v1/chat/completions';
export const MODEL = process.env.OPENCODE_MODEL || 'deepseek-v4.1-flash';

function key() {
  const k = process.env.OPENCODE_API_KEY;
  if (!k) throw new Error('缺少 OPENCODE_API_KEY 环境变量（不要写进仓库）');
  return k;
}

/** Strip markdown fences / leading prose and parse the first JSON value. */
export function parseJsonLoose(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = s.search(/[[{]/);
  if (start < 0) throw new Error('响应中没有 JSON');
  s = s.slice(start);
  // Trim trailing commentary after the JSON value.
  const lastObj = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (lastObj > 0) s = s.slice(0, lastObj + 1);
  return JSON.parse(s);
}

/**
 * One chat completion. Returns the assistant text.
 * Retries transient failures with backoff; never logs the request headers.
 */
export function chat({ system, user, maxTokens = 4096, temperature = 0.2, tries = 3 }) {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: maxTokens,
    temperature,
    stream: false,
    // Go defaults to dynamic reasoning; without this the token budget is
    // consumed by reasoning_content and `content` comes back empty.
    thinking: { type: 'disabled' },
  };

  const dir = mkdtempSync(join(tmpdir(), 'earth-llm-'));
  const bodyFile = join(dir, 'body.json');
  writeFileSync(bodyFile, JSON.stringify(body), 'utf8');

  try {
    for (let attempt = 1; attempt <= tries; attempt += 1) {
      const r = spawnSync(
        'curl',
        [
          '-sS', '--max-time', '150',
          '-X', 'POST', ENDPOINT,
          '-H', 'Content-Type: application/json',
          '-H', `Authorization: Bearer ${key()}`,
          '-H', `x-opencode-session: ${randomUUID()}`,
          '-d', `@${bodyFile}`,
        ],
        { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      );
      if (r.error) throw new Error(`curl 无法启动: ${r.error.message}`);
      const raw = r.stdout || '';
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error(`响应不是 JSON (exit ${r.status}): ${raw.slice(0, 180)}`);
      }
      if (payload.error || payload.type === 'error') {
        const msg = payload.error?.message || JSON.stringify(payload.error);
        if (attempt < tries && /rate|limit|429|503|502|upstream|timeout/i.test(msg)) {
          const wait = attempt * 3000;
          console.log(`  [重试 ${attempt}/${tries}] ${msg.slice(0, 90)} → ${wait}ms`);
          const until = Date.now() + wait;
          while (Date.now() < until) { /* synchronous backoff */ }
          continue;
        }
        throw new Error(`模型返回错误: ${msg}`);
      }
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('模型返回空内容（可能需要更大的 max_tokens 或关闭 reasoning）');
      }
      return content;
    }
    throw new Error('重试次数耗尽');
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/** Read a text file that may contain U+FFFD replacement characters. */
export function readText(p) {
  return readFileSync(p, 'utf8');
}
