import type { Locale } from '@/types';

/** Certainty grading, kept as a three-step scale the UI can style. */
export type CertaintyLevel = 'high' | 'mid' | 'low';

const CERTAINTY_MAP: Record<string, { level: CertaintyLevel; zh: string; en: string; mark: string }> = {
  confirmed: { level: 'high', zh: '史料充分', en: 'Well attested', mark: '高' },
  high: { level: 'high', zh: '史料充分', en: 'Well attested', mark: '高' },
  probable: { level: 'mid', zh: '细节存疑', en: 'Partly attested', mark: '中' },
  likely: { level: 'mid', zh: '细节存疑', en: 'Partly attested', mark: '中' },
  approximate: { level: 'mid', zh: '年代为约数', en: 'Approximate date', mark: '约' },
  traditional: { level: 'low', zh: '仅见传统记载', en: 'Traditional only', mark: '传' },
  传统: { level: 'low', zh: '仅见传统记载', en: 'Traditional only', mark: '传' },
  传统说法: { level: 'low', zh: '仅见传统记载', en: 'Traditional only', mark: '传' },
  传统认定: { level: 'low', zh: '仅见传统记载', en: 'Traditional only', mark: '传' },
  uncertain: { level: 'low', zh: '证据薄弱', en: 'Poorly attested', mark: '低' },
  disputed: { level: 'low', zh: '存在争议', en: 'Disputed', mark: '争' },
  legendary: { level: 'low', zh: '传说成分', en: 'Legendary', mark: '传' },
  传说中的: { level: 'low', zh: '传说成分', en: 'Legendary', mark: '传' },
};

export interface CertaintyInfo {
  level: CertaintyLevel;
  label: string;
  mark: string;
}

export function certaintyInfo(raw: string | undefined, locale: Locale): CertaintyInfo {
  const key = (raw ?? '').toLowerCase().trim();
  const hit = CERTAINTY_MAP[key];
  if (hit) return { level: hit.level, label: hit[locale === 'zh' ? 'zh' : 'en'], mark: hit.mark };
  return { level: 'mid', label: locale === 'zh' ? '未评级' : 'Unrated', mark: '—' };
}

/**
 * Material categories used by the dataset.
 *
 * `tier` is the only thing the UI colours by: contemporary evidence, later
 * scholarship, or a compilation written long after the fact.
 */
const SOURCE_TYPE: Record<string, { zh: string; en: string; tier: 'primary' | 'secondary' | 'later' }> = {
  primary_text: { zh: '同期文献', en: 'Primary text', tier: 'primary' },
  primary: { zh: '同期文献', en: 'Primary', tier: 'primary' },
  chronicle: { zh: '同期编年史', en: 'Chronicle', tier: 'primary' },
  epigraphic: { zh: '铭文', en: 'Inscription', tier: 'primary' },
  numismatic: { zh: '钱币', en: 'Numismatic', tier: 'primary' },
  archaeological: { zh: '考古证据', en: 'Archaeological', tier: 'primary' },
  archival: { zh: '档案文书', en: 'Archival', tier: 'primary' },
  oral_tradition: { zh: '口述传统', en: 'Oral tradition', tier: 'primary' },
  religious_text: { zh: '宗教典籍', en: 'Religious text', tier: 'primary' },
  historiographic_consensus: { zh: '史学共识', en: 'Historiography', tier: 'secondary' },
  历史学共识: { zh: '史学共识', en: 'Historiography', tier: 'secondary' },
  史学共识: { zh: '史学共识', en: 'Historiography', tier: 'secondary' },
  secondary: { zh: '二次文献', en: 'Secondary', tier: 'secondary' },
  scholarly: { zh: '学术研究', en: 'Scholarship', tier: 'secondary' },
  scientific: { zh: '科学测定', en: 'Scientific dating', tier: 'secondary' },
  biography: { zh: '传记', en: 'Biography', tier: 'later' },
  hagiography: { zh: '圣徒传', en: 'Hagiography', tier: 'later' },
  hagiographic_compilation: { zh: '圣徒传汇编', en: 'Hagiographic compilation', tier: 'later' },
  modern_reconstruction: { zh: '现代重构', en: 'Reconstruction', tier: 'later' },
  later_compilation: { zh: '后世汇编', en: 'Later compilation', tier: 'later' },
  cultural: { zh: '文化记忆', en: 'Cultural memory', tier: 'later' },
};

/**
 * A few records concatenate two categories with a pipe ("chronicle |
 * primary_text"). Resolve the first recognised part rather than dumping the
 * raw enum into the interface.
 */
export function sourceTypeLabel(raw: string | undefined, locale: Locale) {
  const parts = (raw ?? '')
    .split('|')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  for (const part of parts) {
    const hit = SOURCE_TYPE[part];
    if (hit) return { label: locale === 'zh' ? hit.zh : hit.en, tier: hit.tier };
  }
  return { label: raw || (locale === 'zh' ? '未注明' : 'Unspecified'), tier: 'secondary' as const };
}

export type DocumentationLevel = 'rich' | 'moderate' | 'sparse' | 'minimal';

/**
 * `documentation_level` ships with ~30 free-text variants across the corpus
 * ("丰富", "rich", "可以忽略不计"...). Fold them onto one four-step scale so
 * the label can be compared between years instead of shown as a raw string.
 */
const DOC_KEYWORDS: ReadonlyArray<readonly [DocumentationLevel, readonly string[]]> = [
  ['minimal', ['极小', '极少', '极低', '极为有限', '几乎', '可以忽略', '可忽略', '微不足道', '匮乏', 'minimal']],
  ['sparse', ['稀疏', '稀少', '稀', '零散', '零星', '贫乏', '稀缺', '有限', 'sparse']],
  ['rich', ['丰富', '详尽', '详细', '充分', 'rich']],
  ['moderate', ['中等', '中度', '适中', '一般', 'moderate']],
];

export function documentationInfo(raw: string | undefined, locale: Locale) {
  const probe = (raw ?? '').toLowerCase().trim();
  const zh = { rich: '记录丰富', moderate: '记录中等', sparse: '记录稀疏', minimal: '记录极少' } as const;
  const en = { rich: 'Rich record', moderate: 'Moderate record', sparse: 'Sparse record', minimal: 'Minimal record' } as const;
  for (const [level, words] of DOC_KEYWORDS) {
    if (words.some((w) => probe.includes(w))) {
      return { level, label: locale === 'zh' ? zh[level] : en[level] };
    }
  }
  return { level: 'moderate' as const, label: locale === 'zh' ? '记录中等' : 'Moderate record' };
}

/** Relation verbs found in the year-level `graph_edges`. */
const RELATION: Record<string, { zh: string; en: string }> = {
  led_to: { zh: '导致', en: 'led to' },
  caused: { zh: '导致', en: 'caused' },
  contemporary_with: { zh: '同时发生', en: 'contemporary with' },
  part_of: { zh: '属于', en: 'part of' },
  preceded_by: { zh: '前承', en: 'preceded by' },
  followed_by: { zh: '后启', en: 'followed by' },
  related_to: { zh: '相关', en: 'related to' },
  influenced: { zh: '影响', en: 'influenced' },
  response_to: { zh: '回应', en: 'response to' },
};

export function relationLabel(raw: string | undefined, locale: Locale): string {
  const key = (raw ?? '').toLowerCase().trim();
  const hit = RELATION[key];
  if (hit) return locale === 'zh' ? hit.zh : hit.en;
  return (raw ?? '').replace(/_/g, ' ');
}

/** Positive years read as AD; negative years as BCE. */
export function formatYear(year: number, locale: Locale): string {
  if (year < 0) return locale === 'zh' ? `公元前 ${-year}` : `${-year} BCE`;
  return locale === 'zh' ? `${year} 年` : `${year} CE`;
}

export function formatYearShort(year: number): string {
  return year < 0 ? `${-year} BCE` : `${year}`;
}

export function formatArea(km2: number | null | undefined, locale: Locale): string {
  if (!km2 || !Number.isFinite(km2)) return '—';
  if (km2 >= 1_000_000) {
    const v = (km2 / 1_000_000).toFixed(2);
    return locale === 'zh' ? `${v} 百万 km²` : `${v}M km²`;
  }
  return `${Math.round(km2).toLocaleString()} km²`;
}

/** Trim a long description for list contexts without cutting mid-word (CJK-safe). */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}
