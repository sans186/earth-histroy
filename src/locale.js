/**
 * i18n – simple string table for zh ↔ en.
 *
 * Every plugin imports `t()` for UI chrome strings.
 * Era names and category labels are localised through their own helpers
 * using the `nameEn` / `labelEn` fields added in config.js.
 */

const STRINGS = {
  zh: {
    // ── Event panel ──
    'panel.events': '事件列表',
    'panel.events.count': '{n} 个事件',
    'panel.events.empty': '暂无事件',
    // ── Layers panel ──
    'panel.layers.base': '\u{1F5FA} 底图',
    'panel.layers.mode': '\u{1F4D0} 视图',
    'panel.layers.settings': '\u{2699} 设置',
    'panel.layers.historical': '\u{1F310} 历史政区',
    'panel.layers.historical.on': '✓ 历史政区',
    'panel.layers.historical.off': '历史政区',
    'panel.layers.modern.on': '✓ 现代边界',
    'panel.layers.modern.off': '现代边界',
    'panel.layers.locale.zh': '✓ 中文',
    'panel.layers.locale.en': 'English',
    // ── Timeline ──
    'timeline.event.count': '当前可见 {v} / {t} 个事件',
    'timeline.step': '步长',
    // ── Loading / status ──
    'loading.text': '加载历史数据中...',
    'loading.status': '加载中...',
    'loading.no_data': '无数据',
    'loading.status_suffix': '个政区',
    'status.hidden': '已隐藏',
    // ── Error ──
    'error.load_fail': '加载失败，请检查网络连接后重试。',
    'error.boot_fail': '启动失败：{msg}',
    // ── Popup ──
    'popup.sources': '来源',
    'popup.untitled': '无标题',
    // ── War module ──
    'war.title': '人类战争史',
    'war.search': '搜索战争名称...',
    'war.count': '{n} 场战争',
    'war.battles': '场战役',
    'war.overview': '概览',
    'war.background': '背景',
    'war.sides': '交战双方',
    'war.battles_tab': '战役',
    'war.timeline': '关键节点',
    'war.analysis': '深度分析',
    'war.no_data': '暂无数据',
    'war.result': '结果',
    'war.casualties': '伤亡',
    'war.forces': '兵力',
    // ── Mode ──
    'mode.3d': '3D 地球',
    'mode.2d': '2D 地图',
  },

  en: {
    'panel.events': 'Events',
    'panel.events.count': '{n} events',
    'panel.events.empty': 'No events',
    'panel.layers.base': '\u{1F5FA} Base Map',
    'panel.layers.mode': '\u{1F4D0} View',
    'panel.layers.settings': '\u{2699} Settings',
    'panel.layers.historical': '\u{1F310} Historical Regions',
    'panel.layers.historical.on': '✓ Historical',
    'panel.layers.historical.off': 'Historical',
    'panel.layers.modern.on': '✓ Modern',
    'panel.layers.modern.off': 'Modern',
    'panel.layers.locale.zh': '中文',
    'panel.layers.locale.en': '✓ English',
    'timeline.event.count': 'Visible {v} / {t} events',
    'timeline.step': 'Step',
    'loading.text': 'Loading historical data...',
    'loading.status': 'Loading...',
    'loading.no_data': 'No data',
    'loading.status_suffix': 'regions',
    'status.hidden': 'Hidden',
    'error.load_fail': 'Failed to load. Check your connection and retry.',
    'error.boot_fail': 'Boot failed: {msg}',
    'popup.sources': 'Sources',
    'popup.untitled': 'Untitled',
    // ── War module ──
    'war.title': 'History of Warfare',
    'war.search': 'Search wars...',
    'war.count': '{n} wars',
    'war.battles': 'battles',
    'war.overview': 'Overview',
    'war.background': 'Background',
    'war.sides': 'Belligerents',
    'war.battles_tab': 'Battles',
    'war.timeline': 'Timeline',
    'war.analysis': 'Analysis',
    'war.no_data': 'No data',
    'war.result': 'Result',
    'war.casualties': 'Casualties',
    'war.forces': 'Forces',
    'mode.3d': '3D Globe',
    'mode.2d': '2D Map',
  },
};

/**
 * Translate UI string key for the given locale.
 * Falls back to zh if the key is missing.
 */
export function t(key, locale, vars = {}) {
  const localeTable = STRINGS[locale] ?? STRINGS.zh;
  let str = localeTable[key] ?? STRINGS.zh[key] ?? key;
  // Simple {var} replacement
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}

/**
 * Return localised category label.
 */
export function getCategoryLabel(cfg, locale) {
  return locale === 'en' ? (cfg.labelEn ?? cfg.label) : cfg.label;
}

/**
 * Return localised era name.
 */
export function getEraName(era, locale) {
  return locale === 'en' ? (era.nameEn ?? era.name) : era.name;
}

/**
 * Format a numeric year according to locale.
 *   zh: -3000 → "公元前3000年",  2025 → "2025年"
 *   en: -3000 → "3000 BC",       2025 → "2025 AD"
 */
export function formatYearLocale(y, locale) {
  if (locale === 'zh') {
    if (y < 0) return `公元前${Math.abs(y)}年`;
    if (y === 0) return '公元1年';
    return `${y}年`;
  }
  if (y < 0) return `${Math.abs(y)} BC`;
  if (y === 0) return '1 AD';
  return `${y} AD`;
}
