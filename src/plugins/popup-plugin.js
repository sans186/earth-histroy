/**
 * Popup plugin – event detail card.
 *
 * Subscribes to `selectedEvent` on the core store.  Renders title, year,
 * category badge, description, and sources with improved formatting.
 */

import { CATEGORIES } from '../config.js';
import { getDisplayCategory } from '../utils.js';
import { t, getCategoryLabel, formatYearLocale } from '../locale.js';

export default {
  name: 'popup-plugin',

  /** @param {import('../core/index.js').Core} core */
  install(core) {
    const card     = document.getElementById('event-card');
    const titleEl  = document.getElementById('event-title');
    const yearEl   = document.getElementById('event-year');
    const catEl    = document.getElementById('event-category');
    const descEl   = document.getElementById('event-desc');
    const sourceEl = document.getElementById('event-source');
    const closeBtn = document.getElementById('card-close-btn');

    function hide() { card.classList.remove('visible'); }

    closeBtn.addEventListener('click', () => core.state.set('selectedEvent', null));

    document.addEventListener('click', (e) => {
      // Don't close when clicking globe or panels
      const target = /** @type {HTMLElement} */ (e.target);
      if (target.closest('#cesiumContainer') || target.closest('#evt-panel') || target.closest('#layers-panel')) return;
      if (card.classList.contains('visible') && !card.contains(target)) {
        core.state.set('selectedEvent', null);
      }
    });

    core.state.on('selectedEvent', (evt) => {
      if (!evt) { hide(); return; }
      const locale = core.state.get('locale') ?? 'zh';

      titleEl.textContent = evt.title ?? t('popup.untitled', locale);
      yearEl.textContent = formatYearLocale(evt._year ?? evt.year, locale);

      const catCfg = CATEGORIES[getDisplayCategory(evt.category)];
      if (catCfg) {
        catEl.textContent = getCategoryLabel(catCfg, locale);
        catEl.style.background = catCfg.color + '22';
        catEl.style.color = catCfg.color;
        catEl.style.border = '1px solid ' + catCfg.color + '44';
        catEl.style.display = '';
      } else {
        catEl.style.display = 'none';
      }

      // Description – preserve paragraphs
      const desc = evt.description ?? '';
      descEl.innerHTML = desc
        .split(/\n{2,}/)
        .map((p) => `<p style="margin:0 0 8px;line-height:1.6;">${p}</p>`)
        .join('');

      // Sources as clickable links
      if (evt.sources?.length) {
        sourceEl.innerHTML =
          `<div style="margin-top:4px;font-size:12px;color:#888;">${t('popup.sources', locale)}</div>` +
          evt.sources
            .slice(0, 3)
            .map((s) => {
              const name = s.name || 'Unknown source';
              const url = s.url || s.link || '';
              if (url) return `<a href="${url}" target="_blank" rel="noopener" style="display:block;color:#8ab4f8;text-decoration:none;font-size:12px;padding:2px 0;">↗ ${name}</a>`;
              return `<span style="display:block;color:#888;font-size:12px;padding:2px 0;">📖 ${name}</span>`;
            })
            .join('');
      } else {
        sourceEl.textContent = '';
      }

      card.classList.add('visible');
    });
  },
};
