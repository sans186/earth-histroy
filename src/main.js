/**
 * Application entry point.
 *
 * Boot sequence:
 *  1. Create Core (state + event bus + Cesium viewer)
 *  2. Register plugins (map, timeline, filters, popup)
 *  3. Bootstrap data loading + reactive pipeline
 */

import { Core } from './core/index.js';
import { createDataLoader } from './data/data-loader.js';
import { YEAR_MAX, YEAR_WINDOW } from './config.js';
import { debounce } from './utils.js';

import mapPlugin from './plugins/map-plugin.js';
import timelinePlugin from './plugins/timeline-plugin.js';
import filtersPlugin from './plugins/filters-plugin.js';
import popupPlugin from './plugins/popup-plugin.js';
import eventPanelPlugin from './plugins/event-panel-plugin.js';
import layersPlugin from './plugins/layers-plugin.js';

// ── Loading overlay helpers ──
const loadingOverlay = document.getElementById('loading-overlay');
const errorOverlay = document.getElementById('error-overlay');
const errorMsg = document.getElementById('error-msg');
const retryBtn = document.getElementById('retry-btn');

function showLoading() {
  if (loadingOverlay) loadingOverlay.style.display = 'flex';
  if (errorOverlay) errorOverlay.style.display = 'none';
}

function hideLoading() {
  if (loadingOverlay) loadingOverlay.style.display = 'none';
}

function showError(msg) {
  if (loadingOverlay) loadingOverlay.style.display = 'none';
  if (errorOverlay) errorOverlay.style.display = 'flex';
  if (errorMsg) errorMsg.textContent = msg;
}

function hideError() {
  if (errorOverlay) errorOverlay.style.display = 'none';
}

// ── Boot ──
async function boot() {
  // 1. Core
  const core = new Core();
  await core.init();

  // 2. Data loader
  const dataLoader = createDataLoader(core);

  // 3. Register plugins
  core.use(mapPlugin);
  core.use(timelinePlugin);
  core.use(filtersPlugin);
  core.use(popupPlugin);
  core.use(eventPanelPlugin);
  core.use(layersPlugin);

  // 4. Core refresh logic (debounced – called on currentYear change)
  async function refreshNow() {
    const year = core.state.get('currentYear') ?? YEAR_MAX;

    try {
      showLoading();
      hideError();
      await dataLoader.loadWindow(year, YEAR_WINDOW);
    } catch (err) {
      console.error('[boot] Data load failed:', err);
      showError(err.message || String(err));
      return;
    } finally {
      hideLoading();
    }
  }

  // Debounced wrapper for rapid slider scrubbing
  const refresh = debounce(refreshNow, 100);

  core.state.on('currentYear', refresh);
  // Filters are handled directly by the map plugin (no data reload needed)

  // 5. Loading / error overlay reactions
  core.state.on('dataLoading', (loading) => {
    if (loading) showLoading();
    else hideLoading();
  });

  core.state.on('dataError', (errMsg) => {
    if (errMsg) showError(errMsg);
    else hideError();
  });

  // Retry button
  if (retryBtn) {
    retryBtn.addEventListener('click', () => refreshNow());
  }

  // 6. Initial data load (direct call, no debounce)
  await refreshNow();

  // Preload nearby years for smoother playback
  dataLoader.preloadRange(YEAR_MAX - YEAR_WINDOW, YEAR_MAX + 200);

  // Dev helpers
  if (import.meta.env.DEV) {
    window.__core = core;
    window.__data = dataLoader;
    console.log(
      '%c🌍 Earth Historical Timeline ready %c| %cClick globe markers %c| %c← → keys %c| %cSpace to play',
      'font-size:16px;', '', 'color:#ffd700;', '', 'color:#8ab4f8;', '', 'color:#2ecc71;',
    );
  }
}

boot().catch((err) => {
  console.error('[boot] Fatal error:', err);
  const el = document.getElementById('error-overlay');
  const msg = document.getElementById('error-msg');
  if (el) el.style.display = 'flex';
  if (msg) msg.textContent = '启动失败：' + (err.message || String(err));
  const loading = document.getElementById('loading-overlay');
  if (loading) loading.style.display = 'none';
});
