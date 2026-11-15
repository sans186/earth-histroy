/**
 * Audit the generated polity profiles (`public/ne/polity_facts.json`).
 *
 * Why this exists: the profiles are model output, and model output drifts in
 * patterns rather than at random. The first production run put "马克思主义/共产主义"
 * in the religion field of 21 states, and gave Vietnamese and Khmer an
 * "南岛语系" (Austronesian) ancestry that no linguist would accept. Those are not
 * one-off slips, they are two consistent failure modes:
 *
 *   1. Ideology mistaken for religion. A party doctrine is not a faith.
 *   2. Plausible-sounding taxonomy. "Austronesian" sounds exotic and fits an
 *      Asian country, so the model reaches for it.
 *
 * The rules below encode only things that can be decided without a network: a
 * curated language-family table, keyword bans, magnitude sanity checks. Anything
 * that needs a citation is left to `verify-polity-facts.mjs`, which fetches
 * Wikipedia and refuses to guess when it cannot.
 *
 * Usage:
 *   node scripts/data/audit-polity-facts.mjs              # report only
 *   node scripts/data/audit-polity-facts.mjs --fix        # apply the safe fixes
 *   node scripts/data/audit-polity-facts.mjs --fix --json # also write the report
 *
 * Safe fixes are limited to the two failure modes above:
 *   - religion that is really an ideology -> null + `religionNote`
 *   - language family contradicted by LANG_FAMILY -> the table's value
 * Nothing else is rewritten. A wrong capital stays wrong until a human or the
 * online verifier looks at it; silently "improving" it would just move the error.
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SOURCE = resolve(ROOT, 'public/ne/polity_facts.json');
const REPORT = resolve(__dirname, 'polity-facts-audit.json');
const BACKUP_DIR = resolve(ROOT, 'scripts/.backups');

const args = new Set(process.argv.slice(2));
const FIX = args.has('--fix');
const WRITE_REPORT = args.has('--json');

/* ── rule 1: ideology is not a religion ─────────────────────────────────── */

/**
 * Words that mean "this state is run by a party", not "this state worships".
 *
 * Kept deliberately narrow. "世俗" alone is not banned (a state can be secular
 * and still have a majority faith), but "无神论" is, because it is a position on
 * religion rather than a religion.
 */
const IDEOLOGY = [
  '共产主义',
  '马克思',
  '列宁',
  '社会主义',
  '毛泽东思想',
  '无神论',
  '党的意识形态',
  'party ideology',
  'communism',
  'communist',
  'marxist',
  'marxism',
  'leninism',
  'atheism',
];

function ideologyIn(value) {
  const probe = String(value ?? '').toLowerCase();
  return IDEOLOGY.find((word) => probe.includes(word.toLowerCase())) ?? null;
}

/* ── rule 2: language families ──────────────────────────────────────────── */

/**
 * Language -> family, for the languages that actually appear in the corpus.
 *
 * Only entries a linguist would not argue about are listed; the classification
 * of Korean, Japanese and Mongolian is contested, so those are marked contested
 * and never rewritten. This table is the whole point of the offline pass: it
 * turns "the model said Austronesian" into a decidable question.
 */
const LANG_FAMILY = {
  汉语: '汉藏语系',
  中文: '汉藏语系',
  普通话: '汉藏语系',
  粤语: '汉藏语系',
  吴语: '汉藏语系',
  闽南语: '汉藏语系',
  藏语: '汉藏语系',
  缅甸语: '汉藏语系',
  泰语: '壮侗语系',
  老挝语: '壮侗语系',
  越南语: '南亚语系',
  高棉语: '南亚语系',
  孟语: '南亚语系',
  印地语: '印欧语系',
  梵语: '印欧语系',
  乌尔都语: '印欧语系',
  孟加拉语: '印欧语系',
  旁遮普语: '印欧语系',
  僧伽罗语: '印欧语系',
  波斯语: '印欧语系',
  普什图语: '印欧语系',
  库尔德语: '印欧语系',
  希腊语: '印欧语系',
  拉丁语: '印欧语系',
  意大利语: '印欧语系',
  西班牙语: '印欧语系',
  葡萄牙语: '印欧语系',
  法语: '印欧语系',
  德语: '印欧语系',
  荷兰语: '印欧语系',
  英语: '印欧语系',
  瑞典语: '印欧语系',
  丹麦语: '印欧语系',
  挪威语: '印欧语系',
  冰岛语: '印欧语系',
  俄语: '印欧语系',
  乌克兰语: '印欧语系',
  波兰语: '印欧语系',
  捷克语: '印欧语系',
  斯洛伐克语: '印欧语系',
  塞尔维亚语: '印欧语系',
  克罗地亚语: '印欧语系',
  保加利亚语: '印欧语系',
  罗马尼亚语: '印欧语系',
  阿尔巴尼亚语: '印欧语系',
  亚美尼亚语: '印欧语系',
  立陶宛语: '印欧语系',
  拉脱维亚语: '印欧语系',
  爱尔兰语: '印欧语系',
  威尔士语: '印欧语系',
  阿拉伯语: '亚非语系',
  希伯来语: '亚非语系',
  阿拉姆语: '亚非语系',
  阿姆哈拉语: '亚非语系',
  提格里尼亚语: '亚非语系',
  豪萨语: '亚非语系',
  柏柏尔语: '亚非语系',
  科普特语: '亚非语系',
  古埃及语: '亚非语系',
  土耳其语: '突厥语族',
  阿塞拜疆语: '突厥语族',
  土库曼语: '突厥语族',
  哈萨克语: '突厥语族',
  乌兹别克语: '突厥语族',
  吉尔吉斯语: '突厥语族',
  维吾尔语: '突厥语族',
  芬兰语: '乌拉尔语系',
  爱沙尼亚语: '乌拉尔语系',
  匈牙利语: '乌拉尔语系',
  萨米语: '乌拉尔语系',
  印尼语: '南岛语系',
  马来语: '南岛语系',
  爪哇语: '南岛语系',
  他加禄语: '南岛语系',
  菲律宾语: '南岛语系',
  马达加斯加语: '南岛语系',
  毛利语: '南岛语系',
  夏威夷语: '南岛语系',
  斯瓦希里语: '尼日尔-刚果语系',
  祖鲁语: '尼日尔-刚果语系',
  约鲁巴语: '尼日尔-刚果语系',
  伊博语: '尼日尔-刚果语系',
  豪萨语_尼日尔: '尼日尔-刚果语系',
  格鲁吉亚语: '南高加索语系',
  车臣语: '东北高加索语系',
  满语: '通古斯语族',
  鄂温克语: '通古斯语族',
  纳瓦特尔语: '犹他-阿兹特克语系',
  克丘亚语: '克丘亚语系',
  玛雅语: '玛雅语系',
  艾马拉语: '艾马拉语系',
  瓜拉尼语: '图皮-瓜拉尼语系',
};

/** Documented disputes: never rewritten, only reported. */
const CONTESTED = {
  朝鲜语: ['朝鲜语系', '阿尔泰语系', '孤立语言'],
  韩语: ['朝鲜语系', '阿尔泰语系', '孤立语言'],
  日语: ['日本语系', '阿尔泰语系', '孤立语言'],
  蒙古语: ['蒙古语系', '阿尔泰语系'],
  泰米尔语: ['达罗毗荼语系'],
  巴斯克语: ['孤立语言'],
};

/**
 * Accepted names per family, including sub-branches.
 *
 * A narrower answer is not a wrong answer. "日耳曼语族" for German is more
 * precise than "印欧语系", and "闪含语系" is simply the older Chinese name for
 * Afroasiatic; flagging either would bury the real errors under 1100 false
 * positives — which is exactly what the first run of this script did. Only a
 * contradiction across families is an error.
 */
const FAMILY_ALIASES = {
  汉藏语系: ['汉藏语系', 'sino-tibetan', '汉语族', '藏缅语族', '藏缅语族'],
  印欧语系: [
    '印欧语系',
    'indo-european',
    '印度-欧罗巴',
    '日耳曼语族',
    '罗曼语族',
    '意大利语族',
    '斯拉夫语族',
    '南斯拉夫语族',
    '西斯拉夫语族',
    '东斯拉夫语族',
    '波罗的语族',
    '凯尔特语族',
    '印度-伊朗语族',
    '印度雅利安',
    '伊朗语族',
    '希腊语族',
    '阿尔巴尼亚语族',
    '亚美尼亚语族',
    '安纳托利亚语族',
    '吐火罗语族',
  ],
  亚非语系: [
    '亚非语系',
    '阿非罗-亚细亚语系',
    'afroasiatic',
    'afro-asiatic',
    '闪含语系',
    '塞姆-含米特',
    '闪米特语族',
    '含米特语族',
    '库施特语族',
    '柏柏尔语族',
    '乍得语族',
    '埃及语族',
  ],
  南岛语系: ['南岛语系', '马来-波利尼西亚语系', 'austronesian', '马来-波利尼西亚语族', '台湾南岛语族'],
  南亚语系: ['南亚语系', 'austroasiatic', 'austro-asiatic', '孟高棉语族', '越语族', '蒙达语族'],
  壮侗语系: ['壮侗语系', '侗台语系', 'kra-dai', 'tai-kadai', '台语族', '侗水语族'],
  突厥语族: ['突厥语族', 'turki', '乌古斯语族', '葛逻禄语族', '钦察语族'],
  乌拉尔语系: ['乌拉尔语系', 'uralic', '芬兰-乌戈尔语族', '萨莫耶德语族'],
  '尼日尔-刚果语系': ['尼日尔-刚果语系', 'niger-congo', '班图语族'],
  蒙古语系: ['蒙古语系', 'mongolic'],
  通古斯语族: ['通古斯语族', 'tungusic', '满-通古斯语族'],
  南高加索语系: ['南高加索语系', '卡特维尔', 'kartvelian', '高加索语系'],
  达罗毗荼语系: ['达罗毗荼语系', 'dravidian'],
  '犹他-阿兹特克语系': ['犹他-阿兹特克语系', 'uto-aztecan'],
  玛雅语系: ['玛雅语系', 'mayan'],
};

function familyMatches(expected, actual) {
  const probe = String(actual ?? '').toLowerCase().trim();
  if (!probe) return false;
  const names = FAMILY_ALIASES[expected] ?? [expected];
  return names.some((name) => probe.includes(name.toLowerCase()));
}

/* ── rule 3: numbers ────────────────────────────────────────────────────── */

const CN_UNIT = { 亿: 1e8, 万: 1e4, 千: 1e3 };

/** "约 14 亿（2020 年估计）" -> 1.4e9. Returns null when there is no number. */
export function parsePopulation(value) {
  const text = String(value ?? '').replace(/[,，\s]/g, '');
  const match = text.match(/(\d+(?:\.\d+)?)\s*(亿|万|千)?/);
  if (!match) return null;
  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) return null;
  const unit = match[2] ? CN_UNIT[match[2]] : 1;
  return base * unit;
}

const PERCENT = /%|％|百分之/;

/* ── run ────────────────────────────────────────────────────────────────── */

const facts = JSON.parse(readFileSync(SOURCE, 'utf8'));
const keys = Object.keys(facts);

const findings = [];
const add = (key, rule, severity, detail) => findings.push({ key, rule, severity, detail });

const fingerprints = new Map();

for (const key of keys) {
  const doc = facts[key] ?? {};

  /* ideology in the religion field */
  const ideology = ideologyIn(doc.religion);
  if (ideology) {
    add(key, 'religion-is-ideology', 'error', `religion="${doc.religion}"（命中「${ideology}」）`);
  }

  /* religion duplicated into government/structure is a different slip */
  if (doc.religion && doc.religion === doc.government) {
    add(key, 'religion-equals-government', 'error', `两字段同为「${doc.religion}」`);
  }

  /*
   * language family.
   *
   * Only the official language can be an error: a polity whose official tongue
   * is Arabic but which also lists Persian is correctly filed under 亚非语系, so
   * judging it by the secondary language reports a fault that is not there. That
   * mistake is what made the first run of this script claim 1104 bad records.
   */
  const official = String(doc.languages?.official ?? '').replace(/[（(].*?[)）]/g, '').trim();
  const spoken = (doc.languages?.spoken ?? [])
    .map((lang) => String(lang).replace(/[（(].*?[)）]/g, '').trim())
    .filter(Boolean);

  for (const [lang, severity] of [[official, 'error'], ...spoken.map((s) => [s, 'warn'])]) {
    if (!lang) continue;
    if (CONTESTED[lang]) {
      const ok = CONTESTED[lang].some((name) => String(doc.languages?.family ?? '').includes(name));
      if (!ok) {
        add(key, 'language-family-contested', 'warn', `${lang} 的语系有争议，当前写「${doc.languages?.family ?? ''}」`);
      }
      continue;
    }
    const expected = LANG_FAMILY[lang];
    if (expected && !familyMatches(expected, doc.languages?.family)) {
      add(key, 'language-family-wrong', severity, `${lang} 应为「${expected}」，当前「${doc.languages?.family ?? ''}」`);
    }
  }

  /* percentages: the data has no shares, so a share is invented */
  for (const field of ['population', 'religion', 'structure', 'government', 'currency']) {
    if (PERCENT.test(String(doc[field] ?? ''))) {
      add(key, 'invented-percentage', 'error', `${field} 含百分比：「${doc[field]}」`);
    }
  }

  /* population magnitude */
  const pop = parsePopulation(doc.population);
  if (pop !== null) {
    if (pop > 1.6e9) add(key, 'population-magnitude', 'error', `人口 ${pop.toExponential(2)} 超过全球人口量级`);
    if (pop < 1000 && /年/.test(String(doc.population))) {
      add(key, 'population-magnitude', 'warn', `人口仅 ${pop}，疑似单位错误：「${doc.population}」`);
    }
  }

  /* required-but-empty */
  for (const field of ['government', 'capital', 'languages']) {
    if (!doc[field] || (typeof doc[field] === 'object' && !Object.keys(doc[field]).length)) {
      add(key, 'missing-field', 'warn', `${field} 为空`);
    }
  }

  /* exact duplicates: the same record pasted under several tiles */
  const fingerprint = JSON.stringify({ ...doc, generatedBy: undefined });
  const first = fingerprints.get(fingerprint);
  if (first) add(key, 'duplicate-record', 'warn', `与 ${first} 完全相同`);
  else fingerprints.set(fingerprint, key);
}

/* ── safe fixes ─────────────────────────────────────────────────────────── */

let fixedReligion = 0;
let fixedFamily = 0;

if (FIX) {
  /*
   * The backup goes outside `public/` on purpose. Anything in that directory is
   * deployed by rsync, and the data validator rightly flags leftover backups
   * there as a release error — the old `.backup_before_*` files were being
   * served to readers.
   */
  mkdirSync(BACKUP_DIR, { recursive: true });
  copyFileSync(SOURCE, `${BACKUP_DIR}/polity_facts.${Date.now()}.json`);

  for (const key of keys) {
    const doc = facts[key];
    if (!doc) continue;

    if (ideologyIn(doc.religion)) {
      // Keep the fact, move it to the field that means it. The card shows
      // `religionNote` in place of a religion rather than pretending "无".
      doc.religionNote = `${doc.religion}（政治意识形态，非宗教）`;
      doc.religion = null;
      fixedReligion += 1;
    }

    /*
     * Only the official language can settle the field. A polity whose official
     * tongue is Arabic but which also names Persian is not wrong for saying
     * "印欧语系"; rewriting it to the first match would introduce the very kind
     * of error this script exists to remove.
     */
    const official = String(doc.languages?.official ?? '').replace(/[（(].*?[)）]/g, '').trim();
    const expected = LANG_FAMILY[official];
    if (expected && !CONTESTED[official] && !familyMatches(expected, doc.languages?.family)) {
      doc.languages.family = expected;
      fixedFamily += 1;
    }
  }

  writeFileSync(SOURCE, `${JSON.stringify(facts, null, 2)}\n`, 'utf8');
}

/* ── report ─────────────────────────────────────────────────────────────── */

const byRule = new Map();
for (const finding of findings) {
  const bucket = byRule.get(finding.rule) ?? { error: 0, warn: 0, keys: [] };
  bucket[finding.severity] += 1;
  if (bucket.keys.length < 8) bucket.keys.push(finding.key);
  byRule.set(finding.rule, bucket);
}

console.log(`政体资料审计：${keys.length} 条记录，${findings.length} 处问题\n`);
for (const [rule, bucket] of [...byRule.entries()].sort(
  (a, b) => b[1].error + b[1].warn - (a[1].error + a[1].warn),
)) {
  console.log(`${rule.padEnd(28)} error ${String(bucket.error).padStart(4)}  warn ${String(bucket.warn).padStart(4)}`);
  console.log(`  例：${bucket.keys.join('、')}`);
}

if (FIX) {
  console.log(`\n已修复：宗教字段 ${fixedReligion} 条，语系 ${fixedFamily} 条`);
  console.log(`备份：${BACKUP_DIR}`);
} else {
  console.log('\n只报告，未改动。加 --fix 应用上面两类可判定修复。');
}

if (WRITE_REPORT) {
  writeFileSync(
    REPORT,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), total: keys.length, findings }, null, 2)}\n`,
    'utf8',
  );
  console.log(`明细：${REPORT}`);
}
