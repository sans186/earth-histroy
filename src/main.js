/**
 * Application entry point.
 *
 * Boot sequence:
 *  1. Create Core (state + event bus + Cesium viewer)
 *  2. Register plugins (map, timeline, filters, popup)
 *  3. Bootstrap data loading + reactive pipeline
 */

import * as Cesium from 'cesium';
import { Core } from './core/index.js';
import { createDataLoader } from './data/data-loader.js';
import { createViewer } from './core/cesium-viewer.js';
import { YEAR_MAX, YEAR_WINDOW, DEFAULT_RIGHT_YEAR } from './config.js';
import { debounce } from './utils.js';
import { t } from './locale.js';
import { getSavedTheme, applyTheme } from './themes/themes.js';

import mapPlugin from './plugins/map-plugin.js';
import timelinePlugin from './plugins/timeline-plugin.js';
import popupPlugin from './plugins/popup-plugin.js';
import eventPanelPlugin from './plugins/event-panel-plugin.js';
import layersPlugin from './plugins/layers-plugin.js';
import trajectoryPlugin from './plugins/trajectory-plugin.js';
import devSettingsPlugin from './plugins/dev-settings-plugin.js';
import warPlugin from './plugins/war-plugin.js';
import heatmapPlugin from './plugins/heatmap-plugin.js';

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

// ── Camera sync helpers ──
let syncingCamera = false;

function syncCamera(source, target) {
  if (syncingCamera) return;
  syncingCamera = true;
  try {
    target.camera.flyTo({
      destination: source.camera.position.clone(),
      orientation: {
        heading: source.camera.heading,
        pitch: source.camera.pitch,
        roll: source.camera.roll,
      },
      duration: 0,
    });
  } finally {
    syncingCamera = false;
  }
}

// ── Boot ──
async function boot() {
  // 1. Core
  const core = new Core();
  await core.init();

  // Initialize dual-mode state (before plugins register listeners)
  core.state.set('dualMode', false);
  core.state.set('rightYear', DEFAULT_RIGHT_YEAR);
  core._rightViewer = null;

  // 2. Data loader
  const dataLoader = createDataLoader(core);

  // 2b. Apply saved theme before plugins render
  applyTheme(getSavedTheme());

  // 3. Register plugins
  core.use(mapPlugin);
  core.use(timelinePlugin);
  core.use(popupPlugin);
  core.use(eventPanelPlugin);
  core.use(layersPlugin);
  core.use(trajectoryPlugin);
  core.use(devSettingsPlugin);
  core.use(warPlugin);
  core.use(heatmapPlugin);

  // 4. Single-mode refresh
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

  const refresh = debounce(refreshNow, 100);

  // 5. Dual-mode refresh – load both year windows and merge
  async function refreshDual() {
    const leftYear = core.state.get('currentYear') ?? YEAR_MAX;
    const rightYear = core.state.get('rightYear') ?? DEFAULT_RIGHT_YEAR;

    try {
      showLoading();
      hideError();

      // Load left window
      await dataLoader.loadWindow(leftYear, YEAR_WINDOW);
      const leftEvents = core.state.get('dataEvents') ?? [];

      // Load right window
      await dataLoader.loadWindow(rightYear, YEAR_WINDOW);
      const rightEvents = core.state.get('dataEvents') ?? [];

      // Merge – deduplicate by event id
      const allEvents = [...leftEvents];
      const leftIds = new Set(leftEvents.map((e) => e.id));
      for (const e of rightEvents) {
        if (!leftIds.has(e.id)) allEvents.push(e);
      }
      core.state.set('dataEvents', allEvents);
      core.events.emit('data:loaded', allEvents);
    } catch (err) {
      console.error('[boot] Dual data load failed:', err);
      showError(err.message || String(err));
    } finally {
      hideLoading();
    }
  }

  const refreshDualDebounced = debounce(refreshDual, 100);

  // Route to correct refresh based on mode
  core.state.on('currentYear', () => {
    if (core.state.get('dualMode')) refreshDualDebounced();
    else refresh();
  });

  core.state.on('rightYear', () => {
    if (core.state.get('dualMode')) refreshDualDebounced();
  });

  // 6. Loading / error overlay reactions
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
    retryBtn.addEventListener('click', () => {
      if (core.state.get('dualMode')) refreshDual();
      else refreshNow();
    });
  }

  // Locale change → clear cache and reload
  core.state.on('locale', (locale) => {
    dataLoader.clearCache();
    const loadingText = document.getElementById('loading-text');
    if (loadingText) loadingText.textContent = t('loading.text', locale);
    refreshNow();
  });

  // ── Dual Mode Toggle ──
  const toggleBtn = document.getElementById('toggle-compare-btn');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const active = !core.state.get('dualMode');

      if (active) {
        // 1. Update DOM first so layout is ready before plugins react
        document.body.classList.add('dual-mode');
        toggleBtn.classList.add('active');
        // Force reflow so Cesium reads correct container dimensions
        void document.body.offsetHeight;

        // 2. Notify plugins
        core.state.set('dualMode', true);

        // 3. Create second viewer on first use
        if (!core._rightViewer) {
          core._rightViewer = createViewer('cesiumContainerRight', {
            lon: 105, lat: 32, height: 12000000,
          });

          // Camera sync from right → left
          core._rightViewer.camera.moveEnd.addEventListener(() => {
            if (core.state.get('dualMode') && core.viewer) {
              syncCamera(core._rightViewer, core.viewer);
            }
          });

          // Sync map mode for right viewer
          core.state.on('mapMode', (mode) => {
            if (!core._rightViewer) return;
            core._rightViewer.scene.mode =
              mode === '2d'
                ? Cesium.SceneMode.SCENE2D
                : Cesium.SceneMode.SCENE3D;
          });
        }

        // 4. Ensure both viewers have correct size
        core.viewer.resize();
        core._rightViewer.resize();

        // 5. Sync camera & load data
        syncCamera(core.viewer, core._rightViewer);
        refreshDual();
      } else {
        // 1. Notify plugins first
        core.state.set('dualMode', false);

        // 2. Restore single-mode DOM
        document.body.classList.remove('dual-mode');
        toggleBtn.classList.remove('active');

        // 3. Resize left viewer back to full width
        core.viewer.resize();

        // 4. Reload single-mode data
        refreshNow();
      }
    });
  }

  // Camera sync left → right (in dual mode)
  core.viewer.camera.moveEnd.addEventListener(() => {
    if (core.state.get('dualMode') && core._rightViewer) {
      syncCamera(core.viewer, core._rightViewer);
    }
  });

  // Resize handler for dual mode
  window.addEventListener('resize', () => {
    if (core.state.get('dualMode') && core._rightViewer) {
      core.viewer.resize();
      core._rightViewer.resize();
    }
  });

  // 7. Initial data load (direct call, no debounce)
  await refreshNow();

  // Preload nearby years for smoother playback
  dataLoader.preloadRange(YEAR_MAX - YEAR_WINDOW, YEAR_MAX + 200);

  // Dev helpers
  if (import.meta.env.DEV) {
    window.__core = core;
    window.__data = dataLoader;
    console.log(
      '%c🌍 Earth Historical Timeline ready %c| %cClick globe markers %c| %c← → keys %c| %cSpace to play %c| %c⏳ Trajectory %c| %c◫ Compare',
      'font-size:16px;', '', 'color:#ffd700;', '', 'color:#8ab4f8;', '', 'color:#2ecc71;', '', 'color:#b8860b;', '', 'color:#e67e22;',
    );
  }
}

boot().catch((err) => {
  console.error('[boot] Fatal error:', err);
  const el = document.getElementById('error-overlay');
  const msg = document.getElementById('error-msg');
  if (el) el.style.display = 'flex';
  if (msg) msg.textContent = t('error.boot_fail', 'zh', { msg: err.message || String(err) });
  const loading = document.getElementById('loading-overlay');
  if (loading) loading.style.display = 'none';
});
