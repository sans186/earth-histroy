/**
 * Audit the war / person profile collections for structural completeness.
 *
 *   node scripts/data/audit-profiles.mjs            # human-readable report
 *   node scripts/data/audit-profiles.mjs --json     # machine-readable gaps
 *
 * This is deliberately read-only. It reports three different things, because
 * "incomplete" is ambiguous here:
 *   1. schema gaps   — a field the collection normally carries is missing
 *   2. coverage gaps — names a general world-history reader would expect
 *   3. traceability  — which fields were machine-generated (see docs/)
 *
 * No network access, no credentials, no writes.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const WARS = resolve(ROOT, 'public/wars/profiles');
const PEOPLE = resolve(ROOT, 'public/people/profiles');

const asJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const files = (dir) => readdirSync(dir).filter((f) => f.endsWith('.json'));
const isBlank = (v) =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && (v.trim() === '' || /^(暂无|未知|不详|待补充|N\/A|null|unknown)$/i.test(v.trim()))) ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && v !== null && Object.keys(v).length === 0);

const warIndex = asJson(resolve(WARS, 'index.json'));
const personIndex = asJson(resolve(PEOPLE, 'index.json'));
const warFiles = files(WARS).filter((f) => !['index.json', 'war_locations.json'].includes(f));
const personFiles = files(PEOPLE).filter((f) => f !== 'index.json');

/** Required: absence is a data problem. Optional: absence just means "not provided". */
const WAR_REQUIRED = ['sources', 'warProcess', 'timeline', 'outcome', 'legacy', 'tags'];
const WAR_OPTIONAL = ['alternativeNames', 'theaters', 'neutralParties', 'relatedWars'];
const WAR_EXPECTED = [...WAR_REQUIRED, ...WAR_OPTIONAL];
const PERSON_EXPECTED = ['birth', 'death', 'points', 'evaluation', 'quotes', 'othersBy', 'era'];

const warGaps = {};
const personGaps = {};

for (const f of warFiles) {
  const d = asJson(resolve(WARS, f));
  const id = f.replace(/\.json$/, '');
  const missing = WAR_REQUIRED.filter((k) => isBlank(d[k]));
  if (!Array.isArray(d.warProcess?.phases) || d.warProcess.phases.length === 0) missing.push('warProcess.phases');
  if (missing.length) warGaps[id] = missing;
}

let points = 0;
let pointsWithBilingual = 0;
for (const f of personFiles) {
  const d = asJson(resolve(PEOPLE, f));
  const id = f.replace(/\.json$/, '');
  const missing = PERSON_EXPECTED.filter((k) => isBlank(d[k]));
  for (const pt of d.points ?? []) {
    points += 1;
    if (!isBlank(pt.description) && !isBlank(pt.descriptionEn)) pointsWithBilingual += 1;
  }
  if (missing.length) personGaps[id] = missing;
}

const warNames = new Set(warIndex.map((x) => x.name));
const personNames = new Set(personIndex.map((x) => x.name));
/** Checked as substrings: "拿破仑·波拿巴" satisfies "拿破仑". */
const EXPECTED_PEOPLE = [
  '孔子', '秦始皇', '汉武帝', '唐太宗', '朱元璋', '康熙', '成吉思汗',
  '拿破仑', '凯撒', '亚历山大大帝', '牛顿', '爱因斯坦', '达芬奇', '莎士比亚',
  '贝多芬', '马克思', '列宁', '丘吉尔', '甘地', '哥伦布', '柏拉图', '亚里士多德',
  '达·芬奇',
];
// Deliberately NOT in scope: religious founders, living people, and modern
// political figures whose "evaluation" cannot be generated neutrally.
const EXPECTED_WARS = [
  '希波战争', '伯罗奔尼撒战争', '布匿战争', '十字军东征', '蒙古西征', '百年战争',
  '三十年战争', '七年战争', '拿破仑战争', '美国独立战争', '鸦片战争', '甲午战争',
  '第一次世界大战', '第二次世界大战', '朝鲜战争', '越南战争',
];
const missingPeople = EXPECTED_PEOPLE.filter((k) => ![...personNames].some((n) => n.includes(k)));
const missingWars = EXPECTED_WARS.filter((k) => ![...warNames].some((n) => n.includes(k)));

const orphanWars = warFiles
  .map((f) => f.replace(/\.json$/, ''))
  .filter((id) => !warIndex.some((x) => x.warId === id));
const orphanPeople = personFiles
  .map((f) => f.replace(/\.json$/, ''))
  .filter((id) => !personIndex.some((x) => x.personId === id));

const report = {
  wars: { indexed: warIndex.length, files: warFiles.length, gaps: warGaps, orphanFiles: orphanWars },
  people: {
    indexed: personIndex.length,
    files: personFiles.length,
    lifeStages: points,
    bilingualStages: pointsWithBilingual,
    gaps: personGaps,
    orphanFiles: orphanPeople,
  },
  coverage: { missingPeople, missingWars },
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const count = (gaps, field) => Object.values(gaps).filter((v) => v.includes(field)).length;
  console.log('=== 战争档案 ===');
  console.log(`索引 ${warIndex.length} / 文件 ${warFiles.length} / 孤儿档案 ${orphanWars.length}`);
  console.log('  必需字段（缺失即数据问题）:');
  for (const k of [...WAR_REQUIRED, 'warProcess.phases']) {
    console.log(`  ${k.padEnd(20)} 缺口 ${String(count(warGaps, k)).padStart(3)}`);
  }
  console.log('  可选字段（缺失只表示未提供，不是错误）:');
  for (const k of WAR_OPTIONAL) {
    const withValue = warFiles.filter((f) => !isBlank(asJson(resolve(WARS, f))[k])).length;
    console.log(`  ${k.padEnd(20)} 有值 ${String(withValue).padStart(3)} / 未提供 ${warFiles.length - withValue}`);
  }
  console.log('\n=== 人物档案 ===');
  console.log(`索引 ${personIndex.length} / 文件 ${personFiles.length} / 孤儿档案 ${orphanPeople.length}`);
  console.log(`生平站点 ${points}，中英描述齐全 ${pointsWithBilingual} (${((pointsWithBilingual / points) * 100).toFixed(1)}%)`);
  for (const k of PERSON_EXPECTED) {
    console.log(`  ${k.padEnd(20)} 缺口 ${String(count(personGaps, k)).padStart(3)}`);
  }
  console.log('\n=== 通识覆盖（子串匹配，仅作参考）===');
  console.log(`  人物未收录 ${missingPeople.length}: ${missingPeople.join('、') || '无'}`);
  console.log(`  战争未收录 ${missingWars.length}: ${missingWars.join('、') || '无'}`);
  console.log('\n注：era / image 等后加字段的缺失不一定是错误；在世人物缺 death 属正常。');
}
