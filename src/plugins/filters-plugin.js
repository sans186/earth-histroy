/**
 * Filters plugin – renders the category filter bar and manages which
 * categories are currently active.
 */

import { CATEGORIES, DEFAULT_ACTIVE_CATEGORIES } from '../config.js';
import { getCategoryLabel } from '../locale.js';

export default {
  name: 'filters-plugin',

  /** @param {import('../core/index.js').Core} core */
  install(core) {
    const container = document.getElementById('filter-bar');
    if (!container) return;

    // Sync store with defaults
    const active = new Set(DEFAULT_ACTIVE_CATEGORIES);
    core.state.set('activeFilters', active);

    function renderFilters() {
      const locale = core.state.get('locale') ?? 'zh';

      // Clear and rebuild
      container.innerHTML = '';

      for (const [key, cfg] of Object.entries(CATEGORIES)) {
        const label = document.createElement('label');
        label.className = 'filter-item active';
        label.dataset.category = key;

        const check = document.createElement('span');
        check.className = 'filter-check';

        const dot = document.createElement('span');
        dot.className = 'filter-dot';
        dot.style.background = cfg.color;

        label.append(check, dot, getCategoryLabel(cfg, locale));

        label.addEventListener('click', () => {
          const filters = core.state.get('activeFilters');
          if (filters.has(key)) {
            filters.delete(key);
            label.classList.remove('active');
          } else {
            filters.add(key);
            label.classList.add('active');
          }
          core.state.set('activeFilters', new Set(filters));
        });

        container.appendChild(label);
      }
    }

    renderFilters();

    // Re-render on locale change
    core.state.on('locale', renderFilters);

    // Sync DOM when filters change externally
    core.state.on('activeFilters', (filters) => {
      for (const lbl of container.querySelectorAll('.filter-item')) {
        const key = lbl.dataset.category;
        lbl.classList.toggle('active', filters.has(key));
      }
    });
  },
};
