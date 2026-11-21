#!/usr/bin/env node
/**
 * 检查 src/data/stories.ts 中故事 caption 的篇幅。
 *
 * 统计口径：去除空白后的字符数（含数字与标点）。
 * 目标区间 90–130 字；低于 80 或高于 140 视为越界，脚本以非零状态码退出。
 * 判定范围限于本次改写的 5 条故事，其余故事只输出统计、不计入越界判定。
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src/data/stories.ts');
const TARGET_MIN = 90;
const TARGET_MAX = 130;
const HARD_MIN = 80;
const HARD_MAX = 140;
const SCOPE = [
  'silk-road',
  'age-of-discovery',
  'world-wars',
  'alexander-conquest',
  'mongol-westward',
  'crusades',
  'islamic-expansion',
  'renaissance',
  'industrial-revolution',
  'american-revolution',
  'french-revolution',
  'world-war-i',
  'world-war-ii-europe',
  'world-war-ii-pacific',
  'cold-war',
];

const lines = readFileSync(SOURCE, 'utf8').split(/\r?\n/);

const STORY_ID_RE = /^ {4}id: '([^']+)'/;
const STORY_TITLE_RE = /^ {4}title: '([^']+)'/;
const STEP_TITLE_RE = /^ {8}title: (.+?),?$/;
const CAPTION_RE = /^ {8}caption:\s*'((?:[^'\\]|\\.)*)'/;
const CAPTION_BODY_RE = /^\s*'((?:[^'\\]|\\.)*)',?\s*$/;

const stories = [];
let current = null;
let stepTitle = '';
let awaitingCaption = false;

for (const line of lines) {
  const storyMatch = STORY_ID_RE.exec(line);
  if (storyMatch) {
    current = { id: storyMatch[1], name: storyMatch[1], steps: [] };
    stories.push(current);
    stepTitle = '';
    awaitingCaption = false;
    continue;
  }
  if (!current) continue;

  if (awaitingCaption) {
    const body = CAPTION_BODY_RE.exec(line);
    if (body) {
      current.steps.push({ title: stepTitle, text: body[1] });
      stepTitle = '';
      awaitingCaption = false;
      continue;
    }
  }

  const storyTitleMatch = STORY_TITLE_RE.exec(line);
  if (storyTitleMatch) {
    current.name = storyTitleMatch[1];
    continue;
  }

  const stepTitleMatch = STEP_TITLE_RE.exec(line);
  if (stepTitleMatch) {
    const raw = stepTitleMatch[1];
    const named = /^'([^']+)'$/.exec(raw);
    stepTitle = named ? named[1] : raw;
    continue;
  }

  if (/^ {8}caption:\s*$/.test(line)) {
    awaitingCaption = true;
    continue;
  }

  const captionMatch = CAPTION_RE.exec(line);
  if (captionMatch) {
    current.steps.push({ title: stepTitle, text: captionMatch[1] });
    stepTitle = '';
  }
}

const lengthOf = (text) => [...text.replace(/\s+/gu, '')].length;
const file = 'src/data/stories.ts';

const stats = [];
for (const story of stories) {
  if (!story.steps.length) continue;
  const lengths = story.steps.map((step) => lengthOf(step.text));
  stats.push({
    id: story.id,
    name: story.name,
    count: lengths.length,
    avg: lengths.reduce((sum, value) => sum + value, 0) / lengths.length,
    min: Math.min(...lengths),
    max: Math.max(...lengths),
    steps: story.steps.map((step, index) => ({
      index: index + 1,
      title: step.title,
      length: lengthOf(step.text),
    })),
  });
}

const violations = [];
let outOfScope = 0;
for (const story of stats) {
  const inScope = SCOPE.includes(story.id);
  for (const step of story.steps) {
    const outOfRange = step.length < HARD_MIN || step.length > HARD_MAX;
    if (inScope && outOfRange) {
      violations.push({ story: story.name, ...step });
    } else if (!inScope && outOfRange) {
      outOfScope += 1;
    }
  }
}

console.log(`caption 篇幅检查：${file}`);
console.log(`统计口径：去除空白后的字符数（含数字与标点）；目标 ${TARGET_MIN}–${TARGET_MAX} 字`);
console.log(`判定范围：${SCOPE.join(' / ')}`);
console.log('');

for (const story of stats) {
  console.log(
    `${story.name}（${story.id}）${String(story.count).padStart(2)} 条  ` +
      `平均 ${story.avg.toFixed(1)}  最短 ${story.min}  最长 ${story.max}`,
  );
}

console.log('');
if (violations.length) {
  console.log(`越界 caption（少于 ${HARD_MIN} 字或多于 ${HARD_MAX} 字）：`);
  for (const item of violations) {
    const side = item.length < HARD_MIN ? `少于 ${HARD_MIN}` : `多于 ${HARD_MAX}`;
    console.log(`  ✗ ${file}  ${item.story} / 第 ${item.index} 步 ${item.title}  ${item.length} 字（${side}）`);
  }
  process.exitCode = 1;
} else {
  console.log(`指定 ${SCOPE.length} 条故事的 caption 均在 ${HARD_MIN}–${HARD_MAX} 字范围内。`);
  if (outOfScope > 0) {
    console.log(`其余故事未在本次改写范围，另有 ${outOfScope} 条 caption 超出该范围，未计入判定。`);
  }
}
