/**
 * Developer settings plugin — full-featured settings panel.
 *
 * Trigger: ?dev=true URL parameter
 * Transaction model: stage changes, then Save (commit) or Cancel (revert).
 * Settings persisted to localStorage under 'earth-dev-settings'.
 */

import * as Cesium from 'cesium';
import { applyTheme, getCurrentTheme, getSavedTheme, THEMES } from '../themes/themes.js';
import {
  YEAR_MIN, YEAR_MAX, YEAR_WINDOW, DATA_CACHE_SIZE,
  PLAYBACK_INTERVAL_MS, DEFAULT_STEP_SIZE, DATA_BASE_URL_ZH, DATA_BASE_URL_EN,
  INITIAL_VIEW,
} from '../config.js';

const STORAGE_KEY = 'earth-dev-settings';

// ── Settings registry ──
// Each entry: { key, section, label, labelEn, type, default, options?, min?, max?, step? }
// type: 'toggle' | 'number' | 'slider' | 'select' | 'text' | 'button' | 'color'
const SETTINGS_REGISTRY = [
  // ═══ Theme ═══
  { key: 'theme', section: 'theme', label: '主题风格', labelEn: 'Theme', type: 'theme-select', default: 'blue' },

  // ═══ Performance ═══
  { key: 'showFps', section: 'perf', label: 'FPS 显示', labelEn: 'Show FPS', type: 'toggle', default: false },
  { key: 'showEntityCount', section: 'perf', label: 'Entity 计数', labelEn: 'Entity Count', type: 'toggle', default: false },
  { key: 'targetFps', section: 'perf', label: '目标帧率', labelEn: 'Target FPS', type: 'slider', default: 60, min: 30, max: 120, step: 1 },
  { key: 'cacheSize', section: 'perf', label: '数据缓存条数', labelEn: 'Cache Size', type: 'number', default: DATA_CACHE_SIZE, min: 20, max: 500, step: 10 },
  { key: 'concurrency', section: 'perf', label: '请求并发数', labelEn: 'Concurrency', type: 'number', default: 6, min: 1, max: 12, step: 1 },

  // ═══ Visual ═══
  { key: 'markerScale', section: 'visual', label: '标记缩放', labelEn: 'Marker Scale', type: 'slider', default: 1.0, min: 0.5, max: 2.0, step: 0.1 },
  { key: 'showLabels', section: 'visual', label: '显示标签', labelEn: 'Show Labels', type: 'toggle', default: true },
  { key: 'atmosphere', section: 'visual', label: '大气层', labelEn: 'Atmosphere', type: 'toggle', default: false },
  { key: 'globeLighting', section: 'visual', label: '地球光照', labelEn: 'Globe Lighting', type: 'toggle', default: false },
  { key: 'showSun', section: 'visual', label: '太阳', labelEn: 'Sun', type: 'toggle', default: false },
  { key: 'showMoon', section: 'visual', label: '月亮', labelEn: 'Moon', type: 'toggle', default: false },
  { key: 'showSkyBox', section: 'visual', label: '星空背景', labelEn: 'Stars', type: 'toggle', default: true },
  { key: 'wireframe', section: 'visual', label: '线框模式', labelEn: 'Wireframe', type: 'toggle', default: false },
  { key: 'antiAliasing', section: 'visual', label: '抗锯齿', labelEn: 'Anti-Aliasing', type: 'toggle', default: true },
  { key: 'oceanColor', section: 'visual', label: '海洋颜色', labelEn: 'Ocean Color', type: 'color', default: '#1a6080' },

  // ═══ Timeline ═══
  { key: 'playbackInterval', section: 'timeline', label: '播放速度 (ms)', labelEn: 'Playback Speed (ms)', type: 'slider', default: PLAYBACK_INTERVAL_MS, min: 10, max: 200, step: 5 },
  { key: 'yearWindow', section: 'timeline', label: '年份窗口', labelEn: 'Year Window', type: 'number', default: YEAR_WINDOW, min: 5, max: 100, step: 5 },
  { key: 'debounceDelay', section: 'timeline', label: '防抖延迟 (ms)', labelEn: 'Debounce (ms)', type: 'slider', default: 100, min: 50, max: 500, step: 10 },
  { key: 'defaultStepSize', section: 'timeline', label: '默认步长', labelEn: 'Default Step', type: 'select', default: DEFAULT_STEP_SIZE, options: [1, 5, 10] },
  { key: 'yearMin', section: 'timeline', label: '年份下限', labelEn: 'Year Min', type: 'number', default: YEAR_MIN, min: -10000, max: 0, step: 100 },
  { key: 'yearMax', section: 'timeline', label: '年份上限', labelEn: 'Year Max', type: 'number', default: YEAR_MAX, min: 1900, max: 2100, step: 1 },

  // ═══ Camera ═══
  { key: 'camLon', section: 'camera', label: '默认经度', labelEn: 'Default Lon', type: 'number', default: INITIAL_VIEW.lon, min: -180, max: 180, step: 1 },
  { key: 'camLat', section: 'camera', label: '默认纬度', labelEn: 'Default Lat', type: 'number', default: INITIAL_VIEW.lat, min: -90, max: 90, step: 1 },
  { key: 'camHeight', section: 'camera', label: '默认高度 (km)', labelEn: 'Default Height (km)', type: 'number', default: Math.round(INITIAL_VIEW.height / 1000), min: 100, max: 50000, step: 100 },
  { key: 'flyDuration', section: 'camera', label: '飞行时长 (秒)', labelEn: 'Fly Duration (s)', type: 'slider', default: 1.0, min: 0.5, max: 5.0, step: 0.1 },

  // ═══ Data ═══
  { key: 'dataPathZh', section: 'data', label: '中文数据路径', labelEn: 'ZH Data Path', type: 'text', default: DATA_BASE_URL_ZH },
  { key: 'dataPathEn', section: 'data', label: '英文数据路径', labelEn: 'EN Data Path', type: 'text', default: DATA_BASE_URL_EN },

  // ═══ Feature Flags ═══
  { key: 'featurePolities', section: 'features', label: '历史政区层', labelEn: 'Historical Polities', type: 'toggle', default: true },
  { key: 'featureModernBorders', section: 'features', label: '现代边界层', labelEn: 'Modern Borders', type: 'toggle', default: true },
  { key: 'featureTrajectory', section: 'features', label: '人物轨迹', labelEn: 'Trajectory', type: 'toggle', default: true },
  { key: 'feature2DDefault', section: 'features', label: '默认2D地图', labelEn: '2D Default', type: 'toggle', default: false },
  { key: 'featureAutoPlay', section: 'features', label: '启动自动播放', labelEn: 'Auto Play', type: 'toggle', default: false },
];

// ── Section definitions ──
const SECTIONS = [
  { id: 'theme', icon: '🎨', label: '主题风格', labelEn: 'Theme' },
  { id: 'perf', icon: '⚡', label: '性能调试', labelEn: 'Performance' },
  { id: 'visual', icon: '👁', label: '视觉效果', labelEn: 'Visual' },
  { id: 'timeline', icon: '⏱', label: '时间线参数', labelEn: 'Timeline' },
  { id: 'camera', icon: '🎥', label: '相机控制', labelEn: 'Camera' },
  { id: 'data', icon: '📂', label: '数据源', labelEn: 'Data' },
  { id: 'features', icon: '🧩', label: '功能开关', labelEn: 'Features' },
];

// ── Helpers ──
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveSettings(obj) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch {}
}

function buildDefaultSettings() {
  const obj = {};
  for (const s of SETTINGS_REGISTRY) obj[s.key] = s.default;
  return obj;
}

// ── Panel styles (injected once) ──
let panelStylesInjected = false;

function injectPanelStyles() {
  if (panelStylesInjected) return;
  panelStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    #dev-panel {
      position: fixed; top: 0; right: 0; width: 380px; height: 100vh;
      z-index: 10000; transform: translateX(100%);
      transition: transform 0.3s ease;
      background: var(--bg-panel-solid);
      border-left: 1px solid var(--border-secondary);
      color: var(--text-primary);
      font-size: 13px;
      display: flex; flex-direction: column;
      box-shadow: -4px 0 30px rgba(0,0,0,0.5);
      backdrop-filter: blur(12px);
    }
    #dev-panel.open { transform: translateX(0); }

    #dev-panel .dp-header {
      padding: 14px 16px;
      border-bottom: 1px solid var(--divider);
      display: flex; justify-content: space-between; align-items: center;
      flex-shrink: 0;
    }
    #dev-panel .dp-header h2 {
      color: var(--accent-gold); font-size: 16px; margin: 0;
    }
    #dev-panel .dp-header .dp-actions {
      display: flex; gap: 6px;
    }
    #dev-panel .dp-header button {
      padding: 6px 14px; border-radius: 5px; cursor: pointer;
      font-size: 12px; border: 1px solid var(--btn-border);
      background: var(--btn-bg); color: var(--btn-text);
      transition: all 0.15s;
    }
    #dev-panel .dp-header button:hover { background: var(--btn-hover); }
    #dev-panel .dp-header button.dp-save {
      background: var(--accent-green); border-color: var(--accent-green-border);
      color: #fff;
    }
    #dev-panel .dp-header button.dp-cancel {
      background: var(--accent-red); border-color: var(--accent-red-border);
      color: #fff;
    }

    #dev-panel .dp-body {
      flex: 1; overflow-y: auto; padding: 4px 0;
    }
    #dev-panel .dp-body::-webkit-scrollbar { width: 5px; }
    #dev-panel .dp-body::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb); border-radius: 3px;
    }

    #dev-panel .dp-section { border-bottom: 1px solid var(--divider); }
    #dev-panel .dp-section-header {
      padding: 11px 16px; cursor: pointer;
      display: flex; align-items: center; gap: 8px;
      color: var(--accent-gold); font-weight: 600; font-size: 13px;
      user-select: none; transition: background 0.15s;
    }
    #dev-panel .dp-section-header:hover { background: var(--btn-hover); }
    #dev-panel .dp-section-header .dp-arrow {
      transition: transform 0.2s; font-size: 10px; color: var(--text-dim);
    }
    #dev-panel .dp-section-header.collapsed .dp-arrow { transform: rotate(-90deg); }
    #dev-panel .dp-section-body { padding: 6px 16px 12px; }
    #dev-panel .dp-section-body.collapsed { display: none; }

    #dev-panel .dp-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 5px 0; gap: 10px; min-height: 32px;
    }
    #dev-panel .dp-row label {
      color: var(--text-muted); font-size: 12px; flex-shrink: 0; min-width: 90px;
    }
    #dev-panel .dp-row input[type="range"] {
      flex: 1; height: 6px; -webkit-appearance: none; appearance: none;
      background: var(--border-input); border-radius: 3px; outline: none; cursor: pointer;
    }
    #dev-panel .dp-row input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 18px; height: 18px; border-radius: 50%;
      background: var(--accent-gold); border: 2px solid var(--text-white);
      box-shadow: 0 0 8px var(--accent-gold-glow); cursor: pointer;
    }
    #dev-panel .dp-row input[type="number"] {
      width: 72px; padding: 3px 6px; border-radius: 4px;
      border: 1px solid var(--border-input); background: var(--bg-input);
      color: var(--text-primary); font-size: 12px; font-family: inherit;
      text-align: right;
    }
    #dev-panel .dp-row input[type="text"] {
      flex: 1; padding: 4px 8px; border-radius: 4px;
      border: 1px solid var(--border-input); background: var(--bg-input);
      color: var(--text-primary); font-size: 12px; font-family: inherit;
    }
    #dev-panel .dp-row input[type="color"] {
      width: 32px; height: 24px; border: 1px solid var(--border-input);
      border-radius: 4px; cursor: pointer; background: none; padding: 1px;
    }
    #dev-panel .dp-row select {
      padding: 4px 8px; border-radius: 4px;
      border: 1px solid var(--border-input); background: var(--bg-input);
      color: var(--text-primary); font-size: 12px; font-family: inherit; cursor: pointer;
    }
    #dev-panel .dp-row .dp-val {
      color: var(--text-faint); font-size: 11px; min-width: 32px; text-align: right;
    }

    /* Toggle switch */
    #dev-panel .dp-toggle {
      position: relative; width: 44px; height: 24px; cursor: pointer;
    }
    #dev-panel .dp-toggle input { display: none; }
    #dev-panel .dp-toggle .dp-toggle-track {
      position: absolute; inset: 0; border-radius: 12px;
      background: var(--border-input); transition: background 0.2s;
    }
    #dev-panel .dp-toggle input:checked + .dp-toggle-track {
      background: var(--accent-blue);
    }
    #dev-panel .dp-toggle .dp-toggle-thumb {
      position: absolute; top: 2px; left: 2px;
      width: 20px; height: 20px; border-radius: 50%;
      background: var(--text-white);
      transition: transform 0.2s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    #dev-panel .dp-toggle input:checked + .dp-toggle-track .dp-toggle-thumb {
      transform: translateX(20px);
    }

    /* Action button */
    #dev-panel .dp-btn {
      padding: 6px 14px; border-radius: 5px; cursor: pointer;
      font-size: 12px; font-family: inherit;
      border: 1px solid var(--btn-border); background: var(--btn-bg);
      color: var(--btn-text); transition: all 0.15s;
    }
    #dev-panel .dp-btn:hover { background: var(--btn-hover); }
    #dev-panel .dp-btn.warn { background: var(--accent-red); border-color: var(--accent-red-border); color: #fff; }

    /* Theme selector */
    #dev-panel .dp-themes { display: flex; flex-direction: column; gap: 6px; }
    #dev-panel .dp-theme-card {
      padding: 10px 12px; border-radius: 8px; cursor: pointer;
      border: 2px solid var(--border-input); transition: all 0.2s;
      display: flex; align-items: center; gap: 10px;
    }
    #dev-panel .dp-theme-card:hover { border-color: var(--border-accent); }
    #dev-panel .dp-theme-card.selected {
      border-color: var(--accent-gold);
      background: var(--accent-blue-bg);
    }
    #dev-panel .dp-theme-swatch {
      width: 40px; height: 24px; border-radius: 4px; flex-shrink: 0;
      border: 1px solid rgba(255,255,255,0.1);
    }
    #dev-panel .dp-theme-info { flex: 1; }
    #dev-panel .dp-theme-name { font-size: 13px; color: var(--text-primary); font-weight: 600; }
    #dev-panel .dp-theme-desc { font-size: 11px; color: var(--text-dim); }

    /* FPS badge */
    #dev-fps-badge {
      position: fixed; top: 10px; right: 10px; z-index: 10001;
      background: rgba(0,0,0,0.7); color: #0f0; font-size: 12px;
      padding: 2px 8px; border-radius: 4px; font-family: monospace;
      display: none; pointer-events: none;
    }
    /* Entity count badge */
    #dev-entity-badge {
      position: fixed; top: 34px; right: 10px; z-index: 10001;
      background: rgba(0,0,0,0.7); color: #8af; font-size: 12px;
      padding: 2px 8px; border-radius: 4px; font-family: monospace;
      display: none; pointer-events: none;
    }

    /* Dev toggle button */
    #dev-toggle-btn {
      position: fixed; bottom: 210px; right: 10px; z-index: 10001;
      width: 36px; height: 36px; border-radius: 50%;
      background: var(--bg-panel); border: 1px solid var(--border-secondary);
      color: var(--text-dim); font-size: 16px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
    #dev-toggle-btn:hover { color: var(--accent-gold); border-color: var(--accent-gold); }

    @media (max-width: 768px) {
      #dev-panel { width: 100vw; }
    }
  `;
  document.head.appendChild(style);
}

// ── Plugin ──
export default {
  name: 'dev-settings-plugin',

  /** @param {import('../core/index.js').Core} core */
  install(core) {
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('dev') || urlParams.get('dev') !== 'true') return;

    injectPanelStyles();

    // ── Load saved or defaults ──
    const saved = loadSettings();
    const defaults = buildDefaultSettings();
    /** Current committed settings */
    let committed = { ...defaults, ...saved };
    /** Staged (unsaved) changes */
    let staged = { ...committed };

    // ── Apply committed settings on boot ──
    function applyCommittedSettings() {
      // Theme
      const themeId = committed.theme || getSavedTheme();
      applyTheme(themeId);

      // Cesium visual settings
      if (core.viewer) {
        const v = core.viewer;
        const scene = v.scene;

        if (committed.targetFps != null) {
          scene._targetFrameRate = committed.targetFps;
        }
        if (committed.atmosphere != null) {
          scene.skyAtmosphere.show = committed.atmosphere;
        }
        if (committed.globeLighting != null) {
          scene.globe.enableLighting = committed.globeLighting;
        }
        if (committed.showSun != null) {
          scene.sun.show = committed.showSun;
        }
        if (committed.showMoon != null) {
          scene.moon.show = committed.showMoon;
        }
        if (committed.showSkyBox != null) {
          scene.skyBox.show = committed.showSkyBox;
        }
        if (committed.antiAliasing != null) {
          scene.postProcessStages.fxaa.enabled = committed.antiAliasing;
        }
        if (committed.oceanColor != null) {
          try {
            scene.globe.baseColor = Cesium.Color.fromCssColorString(committed.oceanColor);
          } catch {}
        }
      }

      // FPS badge
      updateFpsBadge();
      updateEntityBadge();
    }

    // ── FPS monitoring ──
    let fpsFrames = 0;
    let fpsLastTime = performance.now();
    let fpsValue = 0;
    const fpsBadge = document.createElement('div');
    fpsBadge.id = 'dev-fps-badge';
    document.body.appendChild(fpsBadge);

    const entityBadge = document.createElement('div');
    entityBadge.id = 'dev-entity-badge';
    document.body.appendChild(entityBadge);

    function updateFpsBadge() {
      fpsBadge.style.display = committed.showFps ? 'block' : 'none';
    }
    function updateEntityBadge() {
      entityBadge.style.display = committed.showEntityCount ? 'block' : 'none';
    }

    // FPS counter via requestAnimationFrame
    function tickFps() {
      fpsFrames++;
      const now = performance.now();
      if (now - fpsLastTime >= 1000) {
        fpsValue = Math.round(fpsFrames / ((now - fpsLastTime) / 1000));
        fpsFrames = 0;
        fpsLastTime = now;
        if (committed.showFps) {
          fpsBadge.textContent = `FPS: ${fpsValue}`;
        }
      }
      if (committed.showEntityCount && core.viewer) {
        entityBadge.textContent = `Entities: ${core.viewer.entities.values.length}`;
      }
      requestAnimationFrame(tickFps);
    }
    requestAnimationFrame(tickFps);

    // ── Build Panel DOM ──
    const panel = document.createElement('div');
    panel.id = 'dev-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'dp-header';
    header.innerHTML = `
      <h2>⚙ 开发者设置</h2>
      <div class="dp-actions">
        <button class="dp-save" id="dp-btn-save">保存</button>
        <button class="dp-cancel" id="dp-btn-cancel">取消</button>
      </div>
    `;
    panel.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'dp-body';
    panel.appendChild(body);

    // ── Render sections ──
    const inputEls = {}; // key → { get, set } or DOM element

    for (const section of SECTIONS) {
      const secDiv = document.createElement('div');
      secDiv.className = 'dp-section';

      const secHeader = document.createElement('div');
      secHeader.className = 'dp-section-header';
      secHeader.innerHTML = `<span class="dp-arrow">▼</span> ${section.icon} ${section.label}`;
      secDiv.appendChild(secHeader);

      const secBody = document.createElement('div');
      secBody.className = 'dp-section-body';
      secDiv.appendChild(secBody);

      const settings = SETTINGS_REGISTRY.filter((s) => s.section === section.id);

      for (const setting of settings) {
        const row = document.createElement('div');
        row.className = 'dp-row';

        const label = document.createElement('label');
        label.textContent = setting.label;

        switch (setting.type) {
          case 'toggle': {
            const toggle = document.createElement('label');
            toggle.className = 'dp-toggle';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = staged[setting.key];
            input.addEventListener('change', () => {
              staged[setting.key] = input.checked;
              highlightDirty();
            });
            const track = document.createElement('span');
            track.className = 'dp-toggle-track';
            const thumb = document.createElement('span');
            thumb.className = 'dp-toggle-thumb';
            track.appendChild(thumb);
            toggle.append(input, track);
            row.append(label, toggle);
            inputEls[setting.key] = input;
            break;
          }

          case 'number': {
            const input = document.createElement('input');
            input.type = 'number';
            input.value = staged[setting.key];
            if (setting.min != null) input.min = setting.min;
            if (setting.max != null) input.max = setting.max;
            if (setting.step != null) input.step = setting.step;
            input.addEventListener('input', () => {
              staged[setting.key] = Number(input.value);
              highlightDirty();
              if (setting.key === 'camHeight' || setting.key === 'yearMin' || setting.key === 'yearMax') {
                input.style.borderColor = 'var(--accent-gold)';
              }
            });
            row.append(label, input);
            inputEls[setting.key] = input;
            break;
          }

          case 'slider': {
            const input = document.createElement('input');
            input.type = 'range';
            input.value = staged[setting.key];
            if (setting.min != null) input.min = setting.min;
            if (setting.max != null) input.max = setting.max;
            if (setting.step != null) input.step = setting.step;
            const valSpan = document.createElement('span');
            valSpan.className = 'dp-val';
            valSpan.textContent = staged[setting.key];
            input.addEventListener('input', () => {
              staged[setting.key] = Number(input.value);
              valSpan.textContent = input.value;
              highlightDirty();
            });
            row.append(label, input, valSpan);
            inputEls[setting.key] = input;
            break;
          }

          case 'select': {
            const select = document.createElement('select');
            for (const opt of (setting.options || [])) {
              const o = document.createElement('option');
              o.value = opt;
              o.textContent = opt;
              o.selected = opt === staged[setting.key];
              select.appendChild(o);
            }
            select.addEventListener('change', () => {
              staged[setting.key] = Number(select.value);
              highlightDirty();
            });
            row.append(label, select);
            inputEls[setting.key] = select;
            break;
          }

          case 'text': {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = staged[setting.key];
            input.addEventListener('input', () => {
              staged[setting.key] = input.value;
              highlightDirty();
            });
            row.append(label, input);
            inputEls[setting.key] = input;
            break;
          }

          case 'color': {
            const input = document.createElement('input');
            input.type = 'color';
            input.value = staged[setting.key];
            const hexSpan = document.createElement('span');
            hexSpan.className = 'dp-val';
            hexSpan.textContent = staged[setting.key];
            hexSpan.style.cursor = 'pointer';
            input.addEventListener('input', () => {
              staged[setting.key] = input.value;
              hexSpan.textContent = input.value;
              highlightDirty();
            });
            row.append(label, input, hexSpan);
            inputEls[setting.key] = input;
            break;
          }

          case 'button': {
            const btn = document.createElement('button');
            btn.className = 'dp-btn';
            btn.textContent = setting.label;
            row.append(label, btn);
            inputEls[setting.key] = btn;
            break;
          }

          case 'theme-select': {
            // Handled specially below
            break;
          }
        }

        if (setting.type !== 'theme-select') {
          secBody.appendChild(row);
        }
      }

      // Theme section gets special rendering
      if (section.id === 'theme') {
        const themeContainer = document.createElement('div');
        themeContainer.className = 'dp-themes';
        themeContainer.style.cssText = 'padding: 4px 0;';

        const swatchColors = {
          blue: 'linear-gradient(135deg, #0a0a1a 0%, #4a60af 100%)',
          warm: 'linear-gradient(135deg, #2c2418 0%, #b8860b 100%)',
          ink: 'linear-gradient(135deg, #0d0d0d 0%, #808080 100%)',
        };

        for (const theme of THEMES) {
          const card = document.createElement('div');
          card.className = 'dp-theme-card';
          card.dataset.themeId = theme.id;
          if (staged.theme === theme.id) card.classList.add('selected');

          const swatch = document.createElement('div');
          swatch.className = 'dp-theme-swatch';
          swatch.style.background = swatchColors[theme.id] || '#333';

          const info = document.createElement('div');
          info.className = 'dp-theme-info';
          info.innerHTML = `
            <div class="dp-theme-name">${theme.label}</div>
            <div class="dp-theme-desc">${theme.labelEn}</div>
          `;

          card.append(swatch, info);
          card.addEventListener('click', () => {
            staged.theme = theme.id;
            themeContainer.querySelectorAll('.dp-theme-card').forEach((c) => c.classList.remove('selected'));
            card.classList.add('selected');
            // Live preview
            applyTheme(theme.id);
            highlightDirty();
          });
          themeContainer.appendChild(card);
        }
        secBody.appendChild(themeContainer);
      }

      // Toggle collapse
      secHeader.addEventListener('click', () => {
        secHeader.classList.toggle('collapsed');
        secBody.classList.toggle('collapsed');
      });

      body.appendChild(secDiv);
    }

    document.body.appendChild(panel);

    // ── Toggle button ──
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'dev-toggle-btn';
    toggleBtn.textContent = '⚙';
    toggleBtn.title = '开发者设置';
    toggleBtn.addEventListener('click', () => {
      panel.classList.toggle('open');
    });
    document.body.appendChild(toggleBtn);

    // ── Dirty state indicator ──
    function highlightDirty() {
      const saveBtn = document.getElementById('dp-btn-save');
      if (saveBtn) {
        saveBtn.style.boxShadow = '0 0 10px var(--accent-gold-glow)';
        saveBtn.textContent = '保存 *';
      }
    }

    function clearDirty() {
      const saveBtn = document.getElementById('dp-btn-save');
      if (saveBtn) {
        saveBtn.style.boxShadow = '';
        saveBtn.textContent = '保存';
      }
    }

    // ── Check if staged differs from committed ──
    function isDirty() {
      for (const key of Object.keys(staged)) {
        if (staged[key] !== committed[key]) return true;
      }
      return false;
    }

    // ── Save ──
    function doSave() {
      committed = { ...staged };
      saveSettings(committed);
      applyCommittedSettings();
      clearDirty();

      // Apply settings that need immediate action
      applyAllSettings();
    }

    // ── Cancel ──
    function doCancel() {
      staged = { ...committed };
      // Revert UI
      syncUIFromStaged();
      // Revert theme live preview
      applyTheme(committed.theme || getSavedTheme());
      clearDirty();
    }

    function syncUIFromStaged() {
      for (const setting of SETTINGS_REGISTRY) {
        const el = inputEls[setting.key];
        if (!el) continue;
        const val = staged[setting.key];
        switch (setting.type) {
          case 'toggle':
            el.checked = val;
            break;
          case 'number':
          case 'text':
            el.value = val;
            break;
          case 'slider':
            el.value = val;
            const span = el.parentElement?.querySelector('.dp-val');
            if (span) span.textContent = val;
            break;
          case 'select':
            el.value = val;
            break;
          case 'color':
            el.value = val;
            const hex = el.parentElement?.querySelector('.dp-val');
            if (hex) hex.textContent = val;
            break;
        }
      }
      // Theme cards
      const container = panel.querySelector('.dp-themes');
      if (container) {
        container.querySelectorAll('.dp-theme-card').forEach((c) => {
          c.classList.toggle('selected', c.dataset.themeId === staged.theme);
        });
      }
    }

    // ── Apply all settings to the app ──
    function applyAllSettings() {
      const viewer = core.viewer;
      if (!viewer) return;

      const scene = viewer.scene;

      // Performance
      try { scene._targetFrameRate = committed.targetFps; } catch {}
      // Frame rate applied in Cesium constructor, can't easily change at runtime
      // but we set it for reference

      // Visual
      scene.skyAtmosphere.show = committed.atmosphere;
      scene.globe.enableLighting = committed.globeLighting;
      scene.sun.show = committed.showSun;
      scene.moon.show = committed.showMoon;
      scene.skyBox.show = committed.showSkyBox;
      scene.postProcessStages.fxaa.enabled = committed.antiAliasing;
      try {
        scene.globe.baseColor = Cesium.Color.fromCssColorString(committed.oceanColor);
      } catch {}

      // Wireframe
      if (committed.wireframe) {
        scene.globe._surface._tilesToRender.forEach((tile) => {
          if (tile._content?._model) {
            tile._content._model.debugWireframe = true;
          }
        });
        // For dynamic tiles, also set the debug property
        scene.globe._surface.debugEnableWireframe = true;
      } else if (committed.wireframe === false) {
        scene.globe._surface.debugEnableWireframe = false;
      }

      // Labels
      if (committed.showLabels === false) {
        // hide all labels
        for (const entity of viewer.entities.values) {
          if (entity.label) entity.label.show = false;
        }
      } else if (committed.showLabels === true) {
        for (const entity of viewer.entities.values) {
          if (entity.label) entity.label.show = true;
        }
      }

      // Update badges
      updateFpsBadge();
      updateEntityBadge();
    }

    // ── Button events ──
    document.getElementById('dp-btn-save').addEventListener('click', doSave);
    document.getElementById('dp-btn-cancel').addEventListener('click', doCancel);

    // ── Keyboard shortcut to close panel ──
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.classList.contains('open')) {
        panel.classList.remove('open');
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        panel.classList.toggle('open');
      }
    });

    // ── Apply on boot ──
    applyCommittedSettings();

    // ── Expose for console ──
    window.__devSettings = {
      committed,
      staged,
      save: doSave,
      cancel: doCancel,
      reset: () => {
        staged = buildDefaultSettings();
        committed = { ...staged };
        saveSettings(committed);
        syncUIFromStaged();
        applyCommittedSettings();
        applyAllSettings();
        clearDirty();
      },
    };

    console.log('%c🛠 Dev settings loaded%c — window.__devSettings available',
      'color:#ffd700;', '');
    console.log('  __devSettings.save()   — commit changes');
    console.log('  __devSettings.cancel() — revert to last save');
    console.log('  __devSettings.reset()  — factory defaults');
  },
};
