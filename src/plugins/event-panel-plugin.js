/**
 * Event panel plugin – left sidebar with year events + category filters.
 *
 * Merged filter bar into the panel header. Toggle button uses text label
 * matching war/trajectory panel style instead of the ☰ icon.
 */

import * as Cesium from 'cesium';
import { CATEGORIES, DEFAULT_ACTIVE_CATEGORIES } from '../config.js';
import { parseCoords, getDisplayCategory, isEventVisible } from '../utils.js';
import { t, getCategoryLabel, formatYearLocale } from '../locale.js';

export default {
  name: 'event-panel-plugin',

  /** @param {import('../core/index.js').Core} core */
  install(core) {
    const viewer = core.viewer;

    // ── State ──
    let isOpen = false;

    // Init filters if not already set
    if (!core.state.get('activeFilters')) {
      core.state.set('activeFilters', new Set(DEFAULT_ACTIVE_CATEGORIES));
    }

    // ── Inject styles ──
    const style = document.createElement('style');
    style.textContent = `
      #evt-toggle {
        position: fixed; left: 10px; top: 60px; z-index: 110;
        background: var(--bg-panel); border: 1px solid var(--border-secondary); border-radius: 6px;
        color: var(--btn-text); font-size: 13px; padding: 6px 10px; cursor: pointer;
        transition: left 0.25s ease, background 0.2s, border-color 0.2s, color 0.2s;
        font-family: inherit; line-height: 1;
      }
      #evt-toggle:hover { background: var(--btn-hover); color: var(--text-white); }
      #evt-toggle.active { background: var(--accent-blue); border-color: var(--border-accent-hover); color: var(--text-white); }

      #evt-panel {
        position: fixed; left: 0; top: 0; bottom: 200px; width: 0;
        z-index: 105; overflow: hidden;
        background: var(--bg-panel-solid);
        border-right: 1px solid var(--border-secondary);
        display: flex; flex-direction: column;
        transition: width 0.25s ease;
      }
      #evt-panel.open { width: 290px; }
      @media (max-width: 768px) { #evt-panel.open { width: 240px; } }

      #evt-panel .evt-header {
        padding: 10px 14px; border-bottom: 1px solid var(--divider); flex-shrink: 0;
      }
      #evt-panel .evt-header h3 {
        color: var(--accent-gold); font-size: 15px; margin: 0 0 4px;
      }
      #evt-panel .evt-sub { color: var(--text-dim); font-size: 11px; }

      /* Category filter chips inside panel */
      #evt-panel .evt-filters {
        display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;
      }
      #evt-panel .evt-filter-chip {
        display: flex; align-items: center; gap: 3px;
        font-size: 10px; padding: 2px 7px; border-radius: 10px;
        cursor: pointer; user-select: none;
        background: var(--bg-input); border: 1px solid var(--border-secondary);
        color: var(--text-dim); transition: all 0.15s;
        white-space: nowrap;
      }
      #evt-panel .evt-filter-chip:hover { border-color: var(--filter-dot-border); }
      #evt-panel .evt-filter-chip .chip-dot {
        width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
      }
      #evt-panel .evt-filter-chip.active {
        background: rgba(74,96,175,0.2); border-color: var(--accent-blue); color: var(--text-white);
      }

      #evt-panel .evt-list {
        flex: 1; overflow-y: auto; padding: 6px 0;
      }
      #evt-panel .evt-list::-webkit-scrollbar { width: 4px; }
      #evt-panel .evt-list::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 2px; }

      #evt-panel .evt-item {
        display: flex; align-items: center; gap: 8px;
        padding: 7px 14px; cursor: pointer;
        transition: background 0.15s; border-left: 3px solid transparent;
      }
      #evt-panel .evt-item:hover { background: rgba(74,96,175,0.15); }
      #evt-panel .evt-item.selected {
        background: rgba(74,96,175,0.25);
        border-left-color: var(--accent-blue);
      }

      #evt-panel .evt-dot {
        width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
      }
      #evt-panel .evt-title {
        font-size: 13px; color: var(--text-primary); line-height: 1.3; flex: 1;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }

      #evt-panel .evt-empty {
        color: var(--text-very-faint); font-size: 13px; text-align: center;
        padding: 40px 14px;
      }
    `;
    document.head.appendChild(style);

    // ── DOM: Toggle button ──
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'evt-toggle';
    toggleBtn.textContent = '📋 事件';
    toggleBtn.title = t('panel.events', 'zh');

    // ── DOM: Panel ──
    const panel = document.createElement('div');
    panel.id = 'evt-panel';

    document.body.appendChild(toggleBtn);
    document.body.appendChild(panel);

    // ── Sibling toggle buttons ──
    const SIBLING_IDS = ['#traj-toggle', '#war-toggle'];

    function showSiblings() {
      for (const id of SIBLING_IDS) {
        const el = document.querySelector(id);
        if (el) el.style.display = '';
      }
    }

    function hideSiblings() {
      for (const id of SIBLING_IDS) {
        const el = document.querySelector(id);
        if (el) el.style.display = 'none';
      }
    }

    // ── Toggle ──
    toggleBtn.addEventListener('click', () => {
      isOpen = !isOpen;
      panel.classList.toggle('open', isOpen);
      toggleBtn.classList.toggle('active', isOpen);
      toggleBtn.style.left = isOpen ? '300px' : '10px';
      if (isOpen) hideSiblings(); else showSiblings();
    });

    // ── Close on Escape ──
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        isOpen = false;
        panel.classList.remove('open');
        toggleBtn.classList.remove('active');
        toggleBtn.style.left = '10px';
        showSiblings();
      }
    });

    // ── Render filter chips ──
    function renderFilters(container, locale) {
      const filters = core.state.get('activeFilters') ?? new Set();
      container.innerHTML = '';
      for (const [key, cfg] of Object.entries(CATEGORIES)) {
        const chip = document.createElement('span');
        chip.className = 'evt-filter-chip';
        chip.dataset.category = key;
        if (filters.has(key)) chip.classList.add('active');
        chip.innerHTML = `<span class="chip-dot" style="background:${cfg.color}"></span>${getCategoryLabel(cfg, locale)}`;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          const cur = core.state.get('activeFilters');
          if (cur.has(key)) cur.delete(key);
          else cur.add(key);
          core.state.set('activeFilters', new Set(cur));
        });
        container.appendChild(chip);
      }
    }

    // ── Sync filter chips when filters change externally ──
    function syncFilterChips(container, filters) {
      for (const chip of container.querySelectorAll('.evt-filter-chip')) {
        chip.classList.toggle('active', filters.has(chip.dataset.category));
      }
    }

    // ── Render ──
    function render() {
      const events = core.state.get('dataEvents') ?? [];
      const year = core.state.get('currentYear');
      const filters = core.state.get('activeFilters') ?? new Set();
      const locale = core.state.get('locale') ?? 'zh';

      const yearEvents = events.filter(
        (e) => e._year === year && isEventVisible(e.category, filters),
      );

      yearEvents.sort(
        (a, b) => getDisplayCategory(a.category).localeCompare(getDisplayCategory(b.category)) || a.title.localeCompare(b.title),
      );

      toggleBtn.title = t('panel.events', locale);

      panel.innerHTML = '';

      // Header
      const header = document.createElement('div');
      header.className = 'evt-header';
      header.innerHTML = `
        <h3>${formatYearLocale(year, locale)}</h3>
        <div class="evt-sub">${t('panel.events.count', locale, { n: String(yearEvents.length) })}</div>
      `;

      // Filter chips
      const filterContainer = document.createElement('div');
      filterContainer.className = 'evt-filters';
      renderFilters(filterContainer, locale);
      header.appendChild(filterContainer);

      panel.appendChild(header);

      if (yearEvents.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'evt-empty';
        empty.textContent = t('panel.events.empty', locale);
        panel.appendChild(empty);
        return;
      }

      // List
      const list = document.createElement('div');
      list.className = 'evt-list';

      for (const evt of yearEvents) {
        const item = document.createElement('div');
        item.className = 'evt-item';
        item.dataset.eventId = evt.id;

        const cfg = CATEGORIES[getDisplayCategory(evt.category)] || { color: '#888', label: evt.category };

        item.innerHTML = `<span class="evt-dot" style="background:${cfg.color}"></span>
          <span class="evt-title">${evt.title}</span>`;

        item.addEventListener('click', () => {
          list.querySelectorAll('.evt-item.selected').forEach((el) => el.classList.remove('selected'));
          item.classList.add('selected');

          core.state.set('selectedEvent', evt);

          const [lat, lon] = parseCoords(evt.coordinates_approx);
          if (lat !== 0 || lon !== 0) {
            const mode = core.state.get('mapMode') ?? '3d';
            if (mode === '2d') {
              const map2d = core.state.get('_map2d');
              if (map2d) map2d.flyTo(lon, lat, 5);
            } else {
              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(lon, lat, 500000),
                orientation: {
                  heading: Cesium.Math.toRadians(0),
                  pitch: Cesium.Math.toRadians(-75),
                  roll: 0,
                },
                duration: 1.0,
                easingFunction: Cesium.EasingFunction.QUADRATIC_OUT,
              });
            }
          }
        });

        list.appendChild(item);
      }

      panel.appendChild(list);
    }

    // ── React ──
    core.events.on('data:loaded', render);
    core.state.on('currentYear', render);
    core.state.on('activeFilters', () => {
      // Re-render panel when filters change
      if (isOpen) render();
      // Sync filter chips DOM
      const container = panel.querySelector('.evt-filters');
      if (container) syncFilterChips(container, core.state.get('activeFilters') ?? new Set());
    });
    core.state.on('locale', render);
  },
};
