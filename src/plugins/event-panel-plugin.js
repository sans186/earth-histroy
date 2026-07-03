/**
 * Event panel plugin – scrollable list of current-year events.
 *
 * Shows all events for the current year (filtered by active categories).
 * Click any event to fly the camera to its location and open the detail popup.
 * Collapsible via a toggle button on the left edge.
 */

import * as Cesium from 'cesium';
import { CATEGORIES } from '../config.js';
import { parseCoords, getDisplayCategory, isEventVisible } from '../utils.js';
import { t, getCategoryLabel, formatYearLocale } from '../locale.js';

export default {
  name: 'event-panel-plugin',

  /** @param {import('../core/index.js').Core} core */
  install(core) {
    const viewer = core.viewer;

    // ── Toggle button ──
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'evt-toggle';
    toggleBtn.textContent = '☰';
    toggleBtn.title = t('panel.events', 'zh');

    // ── Panel ──
    const panel = document.createElement('div');
    panel.id = 'evt-panel';

    // ── Inject styles ──
    const style = document.createElement('style');
    style.textContent = `
      #evt-toggle {
        position: fixed; left: 10px; top: 60px; z-index: 110;
        background: var(--bg-panel); border: 1px solid var(--border-secondary); border-radius: 6px;
        color: var(--btn-text); font-size: 18px; padding: 6px 10px; cursor: pointer;
        transition: left 0.25s ease, background 0.2s, border-color 0.2s, color 0.2s; line-height: 1;
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
        padding: 14px 14px 10px; border-bottom: 1px solid var(--divider);
        flex-shrink: 0;
      }
      #evt-panel .evt-header h3 {
        color: var(--accent-gold); font-size: 15px; margin: 0 0 2px;
      }
      #evt-panel .evt-header .evt-sub {
        color: var(--text-dim); font-size: 11px;
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

    document.body.appendChild(toggleBtn);
    document.body.appendChild(panel);

    // ── State ──
    let isOpen = false;

    // ── Toggle ──
    toggleBtn.addEventListener('click', () => {
      isOpen = !isOpen;
      panel.classList.toggle('open', isOpen);
      toggleBtn.classList.toggle('active', isOpen);
      toggleBtn.style.left = isOpen ? '300px' : '10px';
    });

    // ── Close on Escape ──
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        isOpen = false;
        panel.classList.remove('open');
        toggleBtn.classList.remove('active');
        toggleBtn.style.left = '10px';
      }
    });

    // ── Render ──
    function render() {
      const events = core.state.get('dataEvents') ?? [];
      const year = core.state.get('currentYear');
      const filters = core.state.get('activeFilters') ?? new Set();
      const locale = core.state.get('locale') ?? 'zh';

      const yearEvents = events.filter(
        (e) => e._year === year && isEventVisible(e.category, filters),
      );

      // Sort by display category then title
      yearEvents.sort(
        (a, b) => getDisplayCategory(a.category).localeCompare(getDisplayCategory(b.category)) || a.title.localeCompare(b.title),
      );

      // Update toggle tooltip
      toggleBtn.title = t('panel.events', locale);

      // Header
      panel.innerHTML = `<div class="evt-header">
        <h3>${formatYearLocale(year, locale)}</h3>
        <div class="evt-sub">${t('panel.events.count', locale, { n: String(yearEvents.length) })}</div>
      </div>`;

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
          // Deselect previous
          list.querySelectorAll('.evt-item.selected').forEach((el) => el.classList.remove('selected'));
          item.classList.add('selected');

          // Set selection (opens popup)
          core.state.set('selectedEvent', evt);

          // Fly to event location
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
    core.state.on('activeFilters', render);
    core.state.on('locale', render);
  },
};
